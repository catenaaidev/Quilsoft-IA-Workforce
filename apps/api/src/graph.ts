import { Store } from './store';
import { sha256Hex, matchesFileSignature } from '@workforce/domain';
import type { Bindings } from './types';
/** Read-only Microsoft Graph delta poller. Requires mailbox-scoped application permission in Entra. */
export async function pollCorporateMailbox(env:Bindings):Promise<{received:number; skipped:number; configured:boolean}> {
 const {GRAPH_TENANT_ID:tenant,GRAPH_CLIENT_ID:client,GRAPH_CLIENT_SECRET:secret,GRAPH_MAILBOX:mailbox}=env;
 if(!tenant||!client||!secret||!mailbox)return {received:0,skipped:0,configured:false};
 const store=new Store(env);
 const tokenResponse=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'})
 });
 if(!tokenResponse.ok)throw new Error(`GRAPH_OAUTH_${tokenResponse.status}`);
 const token=(await tokenResponse.json() as {access_token:string}).access_token;
 const cursor=(await store.by('integration_cursors','name','graph-corporate-mailbox'))[0]?.cursor_url;
 let url=cursor||`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages/delta?$select=id,subject,from,receivedDateTime,hasAttachments`;
 const graph=async(endpoint:string)=>{
  const parsed=new URL(endpoint);
  if(parsed.origin!=='https://graph.microsoft.com')throw new Error('GRAPH_URL_NOT_TRUSTED');
  const res=await fetch(endpoint,{headers:{authorization:`Bearer ${token}`}});
  if(!res.ok)throw new Error(`GRAPH_${res.status}`);
  return await res.json() as any;
 };
 let received=0,skipped=0,deltaUrl:string|undefined;
 for(let page=0;page<20;page++){
  const result=await graph(url);
  for(const msg of result.value||[]){
    if(!msg.id||!msg.hasAttachments||msg['@removed']){skipped++;continue;}
    const existing=await store.by('orders','email_message_id',msg.id,'limit=1');
    // Resume incomplete message ingestion instead of skipping after a partial failure.
    const order=existing[0]||(await store.insert('orders',{order_number:null,client:null,issued_at:null,status:'received',origin:'graph',email_message_id:msg.id,created_by:'system'}))[0];
    // Conservar el original MIME (.eml) si Microsoft Graph lo permite. Solo lectura.
    if(!existing.length){
     try {
      const emlRes=await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(msg.id)}/$value`,{headers:{authorization:`Bearer ${token}`}});
      if(emlRes.ok){
       const size=Number(emlRes.headers.get('content-length')||0);
       if(size<=20*1024*1024){
        const raw=await emlRes.arrayBuffer();
        if(raw.byteLength>0&&raw.byteLength<=20*1024*1024){
         await env.DOCS.put(`emails/${order.id}/original.eml`,raw,{httpMetadata:{contentType:'message/rfc822'}});
         await store.audit('system','email.original_archived','order',order.id,{size:raw.byteLength});
        }
       }
      }
     }catch{ await store.audit('system','email.archive_pending','order',order.id,{note:'No se pudo conservar EML; revisar autorizacion y logs'}); }
    }
    const attachments=await graph(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(msg.id)}/attachments`);
    for(const attachment of attachments.value||[]){
      if(attachment['@odata.type']!=='#microsoft.graph.fileAttachment'||!attachment.contentBytes)continue;
      const bytes=Uint8Array.from(atob(attachment.contentBytes),c=>c.charCodeAt(0));
      if(!bytes.length||bytes.length>12*1024*1024)continue;
      const mime=attachment.contentType||'application/octet-stream';
      if(!['application/pdf','image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/csv'].includes(mime))continue;
      if(!matchesFileSignature(mime,bytes.buffer as ArrayBuffer))continue;
      const duplicates=await store.by('documents','order_id',order.id);
      const hash=await sha256Hex(bytes.buffer as ArrayBuffer);
      if(duplicates.some(d=>d.sha256===hash))continue;
      const key=`original/${order.id}/${crypto.randomUUID()}`;
      await env.DOCS.put(key,bytes,{httpMetadata:{contentType:mime}});
      const [doc]=await store.insert('documents',{order_id:order.id,original_filename:String(attachment.name||'adjunto').slice(0,200),mime_type:mime,size_bytes:bytes.length,sha256:hash,r2_key:key});
      await env.JOBS.send({orderId:order.id,documentId:doc.id});received++;
    }
    await store.upsert('received_emails',{graph_message_id:msg.id,order_id:order.id,sender_address:msg.from?.emailAddress?.address||null,subject:String(msg.subject||'').slice(0,160),received_at:msg.receivedDateTime,status:'received'},'graph_message_id');
    if(!existing.length)await store.audit('system','graph.message_received','order',order.id,{messageId:msg.id,subject:String(msg.subject||'').slice(0,160),receivedAt:msg.receivedDateTime});
  }
  if(result['@odata.deltaLink']){deltaUrl=result['@odata.deltaLink'];break;}
  if(!result['@odata.nextLink'])throw new Error('GRAPH_DELTA_INCOMPLETE');
  url=result['@odata.nextLink'];
 }
 // Cursor only advances after every page has been processed. A large backlog continues next poll.
 if(deltaUrl) await store.upsert('integration_cursors',{name:'graph-corporate-mailbox',cursor_url:deltaUrl,updated_at:new Date().toISOString()},'name');
 return {received,skipped,configured:true};
}
