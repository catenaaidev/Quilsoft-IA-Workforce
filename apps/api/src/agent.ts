import { Agent } from 'agents';
import type { Bindings } from './types';
/** Durable per-tenant coordinator. Not routed publicly; no generic executable tools. */
export class PurchaseAgent extends Agent<Bindings,{lastEvent:string|null;processed:number}> {
 initialState={lastEvent:null as string|null,processed:0};
 recordProcessed(documentId:string) {
   this.setState({lastEvent:documentId,processed:this.state.processed+1});
 }
}
