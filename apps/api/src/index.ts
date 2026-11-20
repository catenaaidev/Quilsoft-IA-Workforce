import app from './app';
import { pollCorporateMailbox } from './graph';
import { synchronizeLoyal } from './loyal-sync';
import type { Bindings } from './types';
export { PurchaseWorkflow } from './workflow';
export { PurchaseAgent } from './agent';
export default {
 fetch:(request:Request,env:Bindings,ctx:ExecutionContext)=>app.fetch(request,env,ctx),
 async queue(batch:MessageBatch<{orderId:string;documentId:string;runId?:string}>,env:Bindings) {
  for(const message of batch.messages){
   try{
    await env.PURCHASE_WORKFLOW.create({id:`purchase-doc-${message.body.documentId}-${message.body.runId||"first"}`,params:message.body});
    message.ack();
   }catch(e){
    // Already-created Workflow => same document is being processed, do not launch twice.
    if(/already exists|conflict|duplicate/i.test(String(e)))message.ack();
    else message.retry();
   }
  }
 },
 async scheduled(_event:ScheduledEvent,env:Bindings,ctx:ExecutionContext) {
  if(env.GRAPH_TENANT_ID&&env.GRAPH_CLIENT_ID&&env.GRAPH_CLIENT_SECRET&&env.GRAPH_MAILBOX)ctx.waitUntil(pollCorporateMailbox(env));
  // Cron runs every 10 minutes. Only check Loyal every four hours, not on each tick.
  if(new Date().getUTCHours()%4===0&&new Date().getUTCMinutes()<10)ctx.waitUntil(synchronizeLoyal(env));
 }
};
