const ALLOWED = new Set(['oc_worknet_orders','oc_worknet_lines','oc_worknet_audit','oc_worknet_mail_messages','oc_worknet_mail_attachments','oc_worknet_mail_sync','oc_worknet_mail_runs','oc_worknet_dashboard']);
export function configured(env){return !!(env.SUPABASE_URL&&env.SUPABASE_SERVICE_KEY)}
export async function db(env, table, {method='GET',query='',body,headers={}}={}){
 if(!ALLOWED.has(table))throw Error('Tabla no permitida');
 if(!configured(env))throw Error('Falta conexión Supabase en secretos');
 const url=new URL(`/rest/v1/${table}${query?'?'+query:''}`,env.SUPABASE_URL);
 if(url.protocol!=='https:')throw Error('La conexión Supabase requiere HTTPS');
 const response=await fetch(url,{method,headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_KEY}`,'Content-Type':'application/json',Accept:'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok){console.error('Supabase request failed',table,method,response.status);throw Error(`Supabase ${table} HTTP ${response.status}`)}
 const text=await response.text();return text?JSON.parse(text):null;
}
export const eq=(v)=>'eq.'+encodeURIComponent(v);
export function safeId(){return crypto.randomUUID()}
