import {db,configured,safeId} from './db.js';
import {syncMailbox,mailReady,mailbox} from './mail.js';
import {csvRows,csvText,checkRow,HEADERS} from './csv.js';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers});
const encode=v=>encodeURIComponent(v);
async function authorized(request,env){
 const secret=env.ADMIN_API_TOKEN||'';if(secret.length<32)return false;
 const supplied=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const encoder=new TextEncoder();const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(supplied)),crypto.subtle.digest('SHA-256',encoder.encode(secret))]);
 return new Uint8Array(a).every((x,i)=>x===new Uint8Array(b)[i]);
}
async function process(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/api/health')return reply({app:'oc-worknet-m365-supabase',status:'online',supabaseConfigured:configured(env),mailConfigured:mailReady(env),mailbox:mailbox(env),loyal:'not_connected',note:'La recepción no implica extracción inteligente ni aprobación de Loyal'});
 if(path==='/'&&request.method==='GET')return new Response(PAGE,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'"}});
 if(!path.startsWith('/api/'))return reply({error:'No encontrado'},404);
 if(!await authorized(request,env))return reply({error:'No autorizado: configurar ADMIN_API_TOKEN en los secretos del servidor'},401);
 if(!configured(env))return reply({error:'Supabase no configurado'},503);
 if(path==='/api/mail/status'){
  const latest=await db(env,'oc_worknet_mail_runs',{query:'select=run_at,result,details&order=run_at.desc&limit=1'});
  const messages=await db(env,'oc_worknet_mail_messages',{query:'select=graph_id,status,subject,sender,received_at,error&order=received_at.desc&limit=100'});
  return reply({mailbox:mailbox(env),configured:mailReady(env),latest:latest?.[0]||null,messages});
 }
 if(path==='/api/mail/sync'&&request.method==='POST')return reply(await syncMailbox(env));
 if(path==='/api/orders'&&request.method==='GET')return reply(await db(env,'oc_worknet_dashboard',{query:'select=*&order=received_at.desc&limit=200'}));
 if(path==='/api/import-csv'&&request.method==='POST'){
  const body=await request.json();if(typeof body.text!=='string'||body.text.length>1200000)return reply({error:'CSV inválido o demasiado grande'},400);
  const rows=csvRows(body.text);if(!rows.length||rows.length>200)return reply({error:'Enviar entre 1 y 200 líneas'},400);
  const bad=rows.flatMap((r,i)=>checkRow(r).map(x=>`Línea ${i+2}: ${x}`));if(bad.length)return reply({error:bad.slice(0,20).join(' | ')},400);
  const numbers=[...new Set(rows.map(r=>r[0]))];
  const existing=await db(env,'oc_worknet_orders',{query:`select=order_number&order_number=in.(${numbers.map(encode).join(',')})`});
  if(existing?.length)return reply({error:'OC ya registrada: '+existing.map(x=>x.order_number).join(', ')},409);
  // Order and lines are created as blocked. If a partial network failure occurs, retry safely and inspect the records.
  const created=[];
  for(const n of numbers){const lines=rows.filter(r=>r[0]===n),oid=safeId();
   await db(env,'oc_worknet_orders',{method:'POST',body:{id:oid,order_number:n,customer:lines[0][4],source_name:String(body.name||'import.csv').slice(0,180),source_csv:csvText(lines),status:'blocked'}});
   await db(env,'oc_worknet_lines',{method:'POST',body:lines.map((r,i)=>({id:safeId(),order_id:oid,idx:i,fields_json:JSON.stringify(r),sku:r[10],loyal_status:'unknown'}))});
   await db(env,'oc_worknet_audit',{method:'POST',body:{id:safeId(),order_id:oid,actor:'operador_api',action:'import_csv',details:{source:body.name,lines:lines.length}}});created.push(n);
  }
  return reply({created,lines:rows.length,status:'blocked',note:'Loyal no está conectado; descarga prohibida'});
 }
 const order=path.match(/^\/api\/orders\/([a-f0-9-]{36})$/);
 if(order){const oid=order[1];const list=await db(env,'oc_worknet_orders',{query:`select=*&id=eq.${oid}`});if(!list.length)return reply({error:'No existe OC'},404);
  const lines=await db(env,'oc_worknet_lines',{query:`select=*&order_id=eq.${oid}&order=idx.asc`});const history=await db(env,'oc_worknet_audit',{query:`select=*&order_id=eq.${oid}&order=created_at.desc&limit=100`});return reply({order:list[0],lines:lines.map(x=>({...x,fields:JSON.parse(x.fields_json)})),history,headers:HEADERS})}
 if(path.endsWith('/download'))return reply({error:'Descarga bloqueada: falta conectar y validar Loyal, luego realizar revisión humana'},409);
 if(path.endsWith('/loyal-sync'))return reply({error:'Integración de consulta Loyal pendiente de API autorizada'},503);
 return reply({error:'Ruta no disponible'},404);
}
export default {async fetch(request,env){try{return await process(request,env)}catch(e){console.error('OC error:',e?.message);return reply({error:'Error de procesamiento: revisar configuración y registros',detail:String(e.message||'').slice(0,170)},503)}},async scheduled(_event,env){if(!mailReady(env)){console.warn('Correo sin configurar');return}try{console.log('Microsoft mail sync',JSON.stringify(await syncMailbox(env)))}catch(e){console.error('Microsoft mail sync failed',e.message)}}};
const PAGE=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Órdenes de compra · IA Workforce</title><style>body{font:15px system-ui;background:#f5f7fa;color:#16273a;margin:0}main{max-width:1150px;margin:35px auto;padding:20px}h1{font-size:28px}.panel{background:white;border:1px solid #dce3eb;border-radius:12px;padding:22px;margin:15px 0}button{background:#123f61;color:white;border:0;border-radius:8px;padding:10px 15px;cursor:pointer}button:disabled{opacity:.5}input{padding:10px;width:80%;max-width:530px;margin:6px;border:1px solid #ccc;border-radius:6px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #eee;text-align:left;padding:10px}small{color:#607086}.tag{padding:5px 8px;border-radius:6px;background:#fff0d2}#error{color:#a52929;white-space:pre-wrap}</style><main><h1>Órdenes de compra · Worknet y Loyal</h1><p>Microsoft 365: exportorders@catenazapata.com · Base: Supabase. Las fichas no verificadas bloquean la exportación.</p><div class="panel"><h3>Acceso técnico temporal</h3><small>La integración definitiva al SSO corporativo debe realizarse antes de uso productivo.</small><p><input id="key" type="password" placeholder="Token ADMIN_API_TOKEN"></p><button onclick="loadAll()">Consultar tablero</button><button onclick="sync()">Consultar correo ahora</button><p id="error"></p></div><div class="panel"><h3>Recepción de correos</h3><div id="sync"></div></div><div class="panel"><h3>Órdenes en revisión</h3><div id="orders"></div></div><div class="panel"><h3>Importación de CSV histórico (MVP)</h3><input id="csv" type="file" accept=".csv"><button onclick="upload()">Importar</button><p><small>Los PDF y Excel recibidos se archivan; su interpretación con IA requiere configurar el extractor. No se habilita ninguna descarga sin Loyal real.</small></p></div></main><script>
const e=x=>document.getElementById(x);async function call(p,method='GET',body){const r=await fetch(p,{method,headers:{authorization:'Bearer '+e('key').value,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const v=await r.json();if(!r.ok)throw Error(v.error||r.status);return v}
const clean=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function loadAll(){try{const [m,o]=await Promise.all([call('/api/mail/status'),call('/api/orders')]);e('sync').innerHTML='<p>Conector: '+(m.configured?'Configurado':'Pendiente')+' · Última consulta: '+clean(m.latest?.run_at||'sin consulta')+'</p><table><tr><th>Fecha</th><th>Remitente</th><th>Asunto</th><th>Estado</th></tr>'+m.messages.map(x=>'<tr><td>'+clean(x.received_at)+'</td><td>'+clean(x.sender)+'</td><td>'+clean(x.subject)+'</td><td>'+clean(x.status)+'</td></tr>').join('')+'</table>';e('orders').innerHTML='<table><tr><th>OC</th><th>Cliente</th><th>Estado</th><th>Fichas por validar</th></tr>'+o.map(x=>'<tr><td>'+clean(x.order_number)+'</td><td>'+clean(x.customer)+'</td><td><span class="tag">'+clean(x.status)+'</span></td><td>'+clean(x.unresolved)+'</td></tr>').join('')+'</table>';e('error').textContent=''}catch(x){e('error').textContent=x.message}}
async function sync(){try{const r=await call('/api/mail/sync','POST');e('error').textContent='Correo consultado: '+JSON.stringify(r);await loadAll()}catch(x){e('error').textContent=x.message}}
async function upload(){try{const f=e('csv').files[0];if(!f)throw Error('Seleccioná un CSV');const r=await call('/api/import-csv','POST',{name:f.name,text:await f.text()});e('error').textContent='OC importadas: '+r.created.join(', ')+' (bloqueadas hasta Loyal)';await loadAll()}catch(x){e('error').textContent=x.message}}
</script></html>`;
