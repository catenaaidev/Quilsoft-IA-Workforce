import app from './app';
import { pollCorporateMailbox } from './graph';
import { synchronizeLoyal } from './loyal-sync';
import { processDocument } from './processing';
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
    else {
     console.error('QUEUE_WORKFLOW_CREATE_FAILED', message.body.documentId, message.attempts, String((e as Error)?.message ?? e).slice(0, 300));
     // Respaldo: el Workflow solo envuelve processDocument. Si no se puede crear, se procesa acá.
     if(message.attempts>=2){
      try{ await processDocument(env,message.body.orderId,message.body.documentId); message.ack(); }
      catch(err){ console.error('QUEUE_DIRECT_PROCESS_FAILED', message.body.documentId, String((err as Error)?.message ?? err).slice(0, 300)); message.retry(); }
     } else message.retry();
    }
   }
  }
 },
 async scheduled(_event:ScheduledEvent,env:Bindings,ctx:ExecutionContext) {
  if(env.GRAPH_TENANT_ID&&env.GRAPH_CLIENT_ID&&env.GRAPH_CLIENT_SECRET&&env.GRAPH_MAILBOX)ctx.waitUntil(pollCorporateMailbox(env));
  // Cron checks mail every minute. Loyal is checked only once every four hours.
  if(new Date().getUTCHours()%4===0&&new Date().getUTCMinutes()===0)ctx.waitUntil(synchronizeLoyal(env));
 }
};
