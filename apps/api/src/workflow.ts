import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { processDocument } from './processing';
import type { Bindings } from './types';
export type DocumentJob={orderId:string;documentId:string};
export class PurchaseWorkflow extends WorkflowEntrypoint<Bindings,DocumentJob> {
 async run(event:WorkflowEvent<DocumentJob>,step:WorkflowStep) {
   const {orderId,documentId}=event.payload;
   await step.do('extract-and-register-for-review',{retries:{limit:3,delay:'20 seconds',backoff:'exponential'},timeout:'5 minutes'},async()=>{
     await processDocument(this.env,orderId,documentId);
   });
 }
}
