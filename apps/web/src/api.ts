export type OrderStatus='received'|'processing'|'review'|'blocked'|'approved'|'csv_generated'|'completed'|'error';
export type Order={id:string;orderNumber:string|null;client:string|null;issuedAt:string|null;status:OrderStatus;version:number;receivedAt?:string;updatedAt?:string};
export type Line={id:string;sku:string;description:string;quantity:number;unit:string;unitPrice:number|null;currency:string;technicalStatus:'approved'|'pending'|'rejected'|'missing'|'unknown'};
export type Detail={order:Order;lines:Line[];validation:{ok:boolean;errors:string[];warnings:string[];blockers:{sku:string;status:string}[]}};
export type Actor={subject:string;displayName:string;role:string};
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 const res=await fetch(`/api${path}`,{credentials:'include',...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(location.hostname==='localhost'||location.hostname==='127.0.0.1'?{'x-local-demo':'true'}:{}),...options.headers}});
 const contentType=res.headers.get('content-type')||'';
 const value=contentType.includes('json')?await res.json():await res.text();
 if(!res.ok)throw new Error(value?.error||`HTTP ${res.status}`);
 return value as T;
}
export function dateText(date?:string|null){if(!date)return '—';return new Date(date+'T12:00:00').toLocaleDateString('es-AR');}
export const statusLabels:Record<OrderStatus,string>={received:'Recibida',processing:'Procesando',review:'En revisión',blocked:'Bloqueada',approved:'Aprobada',csv_generated:'CSV generado',completed:'Finalizada',error:'Error'};
