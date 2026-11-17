import type { Bindings } from './types';
import type { Order, Line, CsvMapping } from '@workforce/domain';
export type Row = Record<string, any>;
/** Server-side Supabase Data API adapter. Service secret NEVER reaches the browser. */
export class Store {
  constructor(private env: Bindings) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase backend no configurado');
    if (!/^https:\/\//.test(env.SUPABASE_URL)) throw new Error('Supabase requiere HTTPS');
  }
  private async request(table:string, method='GET', query='', body?:unknown, options:Record<string,string>={}) {
    const response=await fetch(`${this.env.SUPABASE_URL}/rest/v1/${table}${query?`?${query}`:''}`,{
      method,headers:{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY!,authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':'application/json',Prefer:'return=representation',...options},
      body:body===undefined?undefined:JSON.stringify(body)
    });
    if(!response.ok) throw new Error(`DB ${table}: ${response.status}: ${(await response.text()).slice(0,250)}`);
    if(response.status===204) return [];
    return await response.json() as Row[];
  }
  list(table:string,query='order=created_at.desc&limit=100') { return this.request(table,'GET',query); }
  get(table:string,id:string) {return this.request(table,'GET',`id=eq.${encodeURIComponent(id)}&limit=1`).then(rows=>rows[0]||null);}
  insert(table:string,data:Row|Row[]) {return this.request(table,'POST','',data);}
  patch(table:string,id:string,data:Row,version?:number) {
    return this.request(table,'PATCH',`id=eq.${encodeURIComponent(id)}${version!==undefined?`&version=eq.${version}`:''}`,data);
  }
  by(table:string,field:string,value:string,more='') {
    if (!/^[a-z_]+$/.test(field)) throw new Error('Filtro no permitido');
    return this.request(table,'GET',`${field}=eq.${encodeURIComponent(value)}${more?'&'+more:''}`);
  }
  rpc(name:string,data:Row){if(!/^[a-z_]+$/.test(name))throw new Error('Invalid RPC');return this.request(`rpc/${name}`,'POST','',data);}
  upsert(table:string,data:Row|Row[],conflict:string) { return this.request(table,'POST',`on_conflict=${encodeURIComponent(conflict)}`,data,{Prefer:'resolution=merge-duplicates,return=representation'}); }
  async membership(subject:string) {
    const rows=await this.request('app_memberships','GET',`subject=eq.${encodeURIComponent(subject)}&active=eq.true&limit=1`);
    return rows[0]||null;
  }
  async createOrder(payload: {orderNumber?:string;client?:string;issuedAt?:string;lines?:Array<Omit<Line,'technicalStatus'>>}, actor:string) {
    const rows=await this.insert('orders',{order_number:payload.orderNumber||null,client:payload.client||null,issued_at:payload.issuedAt||null,status:'review',origin:'manual',created_by:actor});
    const result=rows[0];
    if(payload.lines?.length) await this.addLines(result.id,payload.lines);
    await this.audit(actor,'order.created','order',result.id,{origin:'manual'});
    return await this.getOrder(result.id);
  }
  async addLines(orderId:string,lines:Array<Omit<Line,'technicalStatus'>>) {
    return this.insert('order_lines',lines.map((l,i)=>({order_id:orderId,sku:l.sku,description:l.description,quantity:l.quantity,unit:l.unit,unit_price:l.unitPrice,currency:l.currency,technical_status:'unknown',sort_order:i})));
  }
  async getOrder(id:string):Promise<{order:Order,lines:Line[]}|null> {
    const row=await this.get('orders',id);if(!row)return null;
    const lines=await this.by('order_lines','order_id',id,'order=sort_order.asc');
    return {order:{id:row.id,orderNumber:row.order_number,client:row.client,issuedAt:row.issued_at,status:row.status,version:row.version},lines:lines.map(l=>({id:l.id,sku:l.sku,description:l.description,quantity:Number(l.quantity),unit:l.unit,unitPrice:l.unit_price===null?null:Number(l.unit_price),currency:l.currency,technicalStatus:l.technical_status}))};
  }
  async listOrders() {
    const rows=await this.list('orders','order=updated_at.desc&limit=100');
    return rows.map(r=>({id:r.id,orderNumber:r.order_number,client:r.client,issuedAt:r.issued_at,status:r.status,version:r.version,receivedAt:r.received_at,updatedAt:r.updated_at}));
  }
  async linePatch(lineId:string,orderId:string,data:Row) {
    const existing=(await this.by('order_lines','order_id',orderId)).find(l=>l.id===lineId);
    if(!existing) return false;
    return (await this.patch('order_lines',lineId,data)).length===1;
  }
  async transition(order:Order,next:Order['status']) {
    return (await this.patch('orders',order.id,{status:next,version:order.version+1,updated_at:new Date().toISOString()},order.version)).length===1;
  }
  async mapping():Promise<{id:string,config:CsvMapping}|null>{
    const rows=await this.list('erp_csv_mappings','active=eq.true&validated=eq.true&limit=1');
    return rows.length?{id:rows[0].id,config:rows[0].config}:null;
  }
  audit(actor:string,action:string,resource_type:string,resource_id:string,details:Row={}) {
    return this.insert('audit_events',{actor_subject:actor,action,resource_type,resource_id,details});
  }
}
