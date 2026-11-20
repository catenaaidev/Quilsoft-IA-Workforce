import type { Bindings } from './types';
import { checkLoyal } from './loyal';
import { Store } from './store';
/** Periodic revalidation. Restricted to unfinished orders; errors always fail closed. */
export async function synchronizeLoyal(env:Bindings) {
 if(!env.LOYAL_LOOKUP_URL_TEMPLATE||!env.LOYAL_READ_TOKEN||!env.LOYAL_APPROVED_VALUE)return {configured:false,checked:0};
 const store=new Store(env);
 const orders=await env.DB.prepare("SELECT id,status FROM orders WHERE status IN ('review','blocked') ORDER BY updated_at ASC LIMIT 100").all<{id:string;status:string}>();
 let checked=0;
 for(const row of orders.results||[]){
  const record=await store.getOrder(row.id);
  if(!record||!record.lines.length)continue;
  // Safety: a manual review remains mandatory even when all product sheets are approved.
  let approved=true;
  for(const line of record.lines){
   const result=await checkLoyal(env,line.sku);
   if(result.status!=='approved')approved=false;
   if(line.id)await store.patch('order_lines',line.id,{technical_status:result.status,technical_checked_at:new Date().toISOString()});
  }
  const wanted=approved?'review':'blocked';
  if(record.order.status!==wanted)await store.transition(record.order,wanted);
  await store.audit('system','loyal.scheduled_check','order',row.id,{allApproved:approved,source:'scheduled-read-only'});
  checked++;
 }
 return {configured:true,checked};
}
