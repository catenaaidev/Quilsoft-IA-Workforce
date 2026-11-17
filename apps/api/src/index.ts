import app from './app';
import { pollCorporateMailbox } from './graph';
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
  if(env.GRAPH_CLIENT_ID)ctx.waitUntil(pollCorporateMailbox(env));
 }
};
