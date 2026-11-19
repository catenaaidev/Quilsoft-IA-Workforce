import {db,safeId,configured} from './db.js';
const GRAPH='https://graph.microsoft.com/v1.0';
const LIMIT=8*1024*1024;
const TYPES=/\.(pdf|xlsx|xls|csv)$/i;
export function safeGraphLink(link){const u=new URL(link,GRAPH);if(u.origin!=='https://graph.microsoft.com'||!u.pathname.startsWith('/v1.0/'))throw Error('Graph pagination URL rechazada');return u.toString()}
export function mailbox(env){return env.MAILBOX||'exportorders@catenazapata.com'}
function enc(v){return encodeURIComponent(v)}
export function mailReady(env){return configured(env)&&!!(env.M365_TENANT_ID&&env.M365_CLIENT_ID&&env.M365_CLIENT_SECRET&&env.DOCS)}
async function token(env, fetcher){
 for(const k of ['M365_TENANT_ID','M365_CLIENT_ID','M365_CLIENT_SECRET'])if(!env[k])throw Error(`Falta ${k}`);
 const params=new URLSearchParams({client_id:env.M365_CLIENT_ID,client_secret:env.M365_CLIENT_SECRET,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'});
 const r=await fetcher(`https://login.microsoftonline.com/${enc(env.M365_TENANT_ID)}/oauth2/v2.0/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params});
 if(!r.ok)throw Error(`Token Microsoft Graph: HTTP ${r.status}`);
 const v=await r.json();if(!v.access_token)throw Error('No se recibió token Microsoft');return v.access_token;
}
async function graph(fetcher,t,url,raw=false){
 const r=await fetcher(safeGraphLink(url),{headers:{Authorization:`Bearer ${t}`,Prefer:'IdType="ImmutableId"'}});
 if(!r.ok)throw Error(`Microsoft Graph HTTP ${r.status}`);return raw?r.arrayBuffer():r.json();
}
async function upsert(env,table,row,onConflict){return db(env,table,{method:'POST',query:`on_conflict=${enc(onConflict)}`,body:row,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}})}
function objectKey(v){return enc(v).replaceAll('%','_').slice(0,190)}
async function ingest(env,t,msg,fetcher){
 if(!msg.id||msg['@removed'])return {skipped:1};
 const prior=await db(env,'oc_worknet_mail_messages',{query:`select=graph_id,status&graph_id=${eqValue(msg.id)}`});
 if(prior?.[0]&&['stored','ignored'].includes(prior[0].status))return {skipped:1};
 const who=mailbox(env),base=`orders/m365/${objectKey(who)}/${objectKey(msg.id)}`;
 const entry={graph_id:msg.id,internet_message_id:msg.internetMessageId||null,sender:msg.from?.emailAddress?.address||'',subject:msg.subject||'',received_at:msg.receivedDateTime||new Date().toISOString(),status:'receiving',updated_at:new Date().toISOString()};
 await upsert(env,'oc_worknet_mail_messages',entry,'graph_id');
 try{
  const eml=await graph(fetcher,t,`${GRAPH}/users/${enc(who)}/messages/${enc(msg.id)}/$value`,true);
  if(eml.byteLength>LIMIT)throw Error('Correo supera 8 MB');
  await env.DOCS.put(`${base}/original.eml`,eml,{httpMetadata:{contentType:'message/rfc822'}});
  let next=`${GRAPH}/users/${enc(who)}/messages/${enc(msg.id)}/attachments?$top=30`,count=0,pages=0;
  while(next&&pages++<10){const a=await graph(fetcher,t,next);
   for(const item of a.value||[]){
    if(item['@odata.type']!=='#microsoft.graph.fileAttachment'||!TYPES.test(item.name||''))continue;
    if(item.size>LIMIT)throw Error('Adjunto supera 8 MB');
    const full=await graph(fetcher,t,`${GRAPH}/users/${enc(who)}/messages/${enc(msg.id)}/attachments/${enc(item.id)}`);
    if(!full.contentBytes||full.contentBytes.length>LIMIT*1.4)throw Error('Adjunto inválido o demasiado grande');
    const bytes=Uint8Array.from(atob(full.contentBytes),c=>c.charCodeAt(0));if(bytes.length>LIMIT)throw Error('Adjunto demasiado grande');
    const path=`${base}/attachments/${objectKey(item.id)}-${objectKey(item.name)}`;
    await env.DOCS.put(path,bytes,{httpMetadata:{contentType:full.contentType||'application/octet-stream'}});
    await upsert(env,'oc_worknet_mail_attachments',{graph_id:msg.id,attachment_id:item.id,filename:item.name,content_type:full.contentType||null,bytes:bytes.length,r2_key:path,stored_at:new Date().toISOString()},'graph_id,attachment_id');count++;
   }
   next=a['@odata.nextLink']?safeGraphLink(a['@odata.nextLink']):null;
  }
  await db(env,'oc_worknet_mail_messages',{method:'PATCH',query:`graph_id=${eqValue(msg.id)}`,body:{status:count?'stored':'ignored',original_key:`${base}/original.eml`,updated_at:new Date().toISOString(),error:null}});
  return {stored:count?1:0,ignored:count?0:1,attachments:count};
 }catch(e){await db(env,'oc_worknet_mail_messages',{method:'PATCH',query:`graph_id=${eqValue(msg.id)}`,body:{status:'error',error:String(e.message).slice(0,250),updated_at:new Date().toISOString()}});throw e}
}
function eqValue(s){return 'eq.'+enc(s)}
export async function syncMailbox(env,fetcher=fetch){
 if(!mailReady(env))throw Error('Faltan secretos Microsoft 365, Supabase o binding R2 DOCS');
 const t=await token(env,fetcher),who=mailbox(env);
 const state=await db(env,'oc_worknet_mail_sync',{query:`select=cursor_url&mailbox=${eqValue(who)}`});
 let next=state?.[0]?.cursor_url||`${GRAPH}/users/${enc(who)}/mailFolders/inbox/messages/delta?$select=id,subject,receivedDateTime,from,hasAttachments,internetMessageId&$top=20`;
 const totals={stored:0,ignored:0,skipped:0,attachments:0,pages:0};
 for(let i=0;next&&i<3;i++){
  const page=await graph(fetcher,t,next);
  // A failed message is retried; never advance the cursor past a failed page.
  for(const m of page.value||[]){const r=await ingest(env,t,m,fetcher);for(const k in r)totals[k]=(totals[k]||0)+r[k]}
  next=page['@odata.nextLink']||page['@odata.deltaLink']||null;
  if(next)await upsert(env,'oc_worknet_mail_sync',{mailbox:who,cursor_url:safeGraphLink(next),updated_at:new Date().toISOString()},'mailbox');
  totals.pages++;if(page['@odata.deltaLink'])break;
 }
 await db(env,'oc_worknet_mail_runs',{method:'POST',body:{id:safeId(),run_at:new Date().toISOString(),result:'ok',details:totals}});
 return {ok:true,...totals,note:'Los adjuntos se conservan para extracción de IA pendiente de configurar; no se generan OC inventadas.'};
}
