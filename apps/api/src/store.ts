import type { Bindings } from './types';
import type { Order, Line, CsvMapping } from '@workforce/domain';
export type Row = Record<string, any>;
/** Server-side Cloudflare D1 adapter. Database is never exposed to the browser. */
export class Store {
  constructor(private env:Bindings){if(!(env as any).DB)throw new Error("D1_NOT_CONFIGURED");}
  private async request(table:string, method='GET', query='', body?:unknown, options:Record<string,string>={}) {
    const db=(this.env as Bindings & {DB:D1Database}).DB;
    const known='app_memberships agents agent_instructions orders order_lines documents erp_csv_mappings generated_csvs integration_cursors erp_reference executions audit_events permission_catalog role_permissions agent_tools agent_tool_grants knowledge_sources automations received_emails order_approvals document_extractions integration_registry'.split(' ');
    const field=(x:string)=>{if(!/^[a-z_]+$/.test(x))throw new Error('D1_INVALID_FIELD');return x;};
    const val=(k:string,v:any)=>v===undefined?null:typeof v==='boolean'?(v?1:0):['details','extraction','extraction_json','config','metadata','access_policy','tool_contract'].includes(k)?JSON.stringify(v):v;
    const normal=(r:any)=>{const o={...r};for(const k of ['details','extraction','extraction_json','config','metadata','access_policy','tool_contract'])if(typeof o[k]==='string'){try{o[k]=JSON.parse(o[k]);}catch{o[k]=null;}}for(const k of ['active','validated','approved'])if(o[k]!==undefined)o[k]=!!o[k];return o;};
    if(table==='rpc/correct_order_line') {
      const d=body as any,changes=d.p_changes||{},id=String(d.p_order),line=String(d.p_line),version=Number(d.p_version);
      const map:Record<string,string>={sku:'sku',description:'description',quantity:'quantity',unit:'unit',unitPrice:'unit_price',currency:'currency'};
      const keys=Object.keys(changes);if(keys.some(k=>!map[k]))throw new Error('INVALID_CHANGE');
      const order=await db.prepare('SELECT version,status FROM orders WHERE id=?').bind(id).first<any>();
      const found=await db.prepare('SELECT id FROM order_lines WHERE id=? AND order_id=?').bind(line,id).first<any>();
      if(!order||order.version!==version||['csv_generated','completed'].includes(order.status)||!found)throw new Error('VERSION_CONFLICT');
      const statements=[db.prepare('UPDATE orders SET version=version+1,status=?,updated_at=? WHERE id=? AND version=?').bind('review',new Date().toISOString(),id,version),db.prepare(`UPDATE order_lines SET ${keys.map(k=>map[k]+'=?').join(',')}${keys.length?',':''}technical_status=?,technical_checked_at=NULL WHERE id=? AND order_id=?`).bind(...keys.map(k=>val(map[k],changes[k])),'unknown',line,id),db.prepare('INSERT INTO audit_events(actor_subject,action,resource_type,resource_id,details) VALUES(?,?,?,?,?)').bind(String(d.p_actor),'order.line_corrected','order',id,JSON.stringify({lineId:line,fields:keys}))];
      await db.batch(statements);return [];
    }
    if(!known.includes(table))throw new Error('D1_INVALID_TABLE');
    const ps=new URLSearchParams(query),where:string[]=[],params:any[]=[];let sort='',limit=100;
    for(const [k,v] of ps) {
      if(k==='order'){const m=/^([a-z_]+)\.(asc|desc)$/.exec(v);if(!m)throw new Error('D1_INVALID_SORT');sort=` ORDER BY ${field(m[1])} ${m[2].toUpperCase()}`;}
      else if(k==='limit')limit=Math.max(1,Math.min(1000,Number(v)||100));
      else if(k!=='on_conflict'){if(!v.startsWith('eq.'))throw new Error('D1_INVALID_FILTER');where.push(`${field(k)}=?`);const p=v.slice(3);params.push(p==='true'?1:p==='false'?0:p);}
    }
    const filter=where.length?' WHERE '+where.join(' AND '):'';
    if(method==='GET')return ((await db.prepare(`SELECT * FROM ${table}${filter}${sort} LIMIT ${limit}`).bind(...params).all<any>()).results||[]).map(normal);
    if(method==='POST'){
      const records=Array.isArray(body)?body:[body];const result:any[]=[];
      for(const r of records){const item={...(r as Record<string,any>)};if(!item.id&&!['audit_events','app_memberships','integration_cursors','erp_reference','permission_catalog','role_permissions','integration_registry'].includes(table))item.id=crypto.randomUUID();const keys=Object.keys(item).filter(k=>item[k]!==undefined).map(field);const conflict=ps.get('on_conflict');let upsert='';if(conflict){const target=conflict.split(',').map(field);const updates=keys.filter(k=>!target.includes(k));upsert=` ON CONFLICT (${target.join(',')}) DO ${updates.length?'UPDATE SET '+updates.map(k=>k+'=excluded.'+k).join(','):'NOTHING'}`;}const sql=`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})${upsert} RETURNING *`;const row=await db.prepare(sql).bind(...keys.map(k=>val(k,item[k]))).first<any>();if(row)result.push(normal(row));}
      return result;
    }
    if(method==='PATCH'){
      const item=body as Record<string,any>,keys=Object.keys(item).filter(k=>item[k]!==undefined).map(field);if(!where.length||!keys.length)throw new Error('D1_UNSAFE_UPDATE');return ((await db.prepare(`UPDATE ${table} SET ${keys.map(k=>k+'=?').join(',')}${filter} RETURNING *`).bind(...keys.map(k=>val(k,item[k])),...params).all<any>()).results||[]).map(normal);
    }
    throw new Error('D1_UNSUPPORTED_METHOD');
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
