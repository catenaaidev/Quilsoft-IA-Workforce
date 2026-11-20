import type { Bindings } from './types';
import type { TechnicalStatus } from '@workforce/domain';
export type LoyalResult={sku:string,status:TechnicalStatus,stage?:string,updatedAt?:string,blockReason?:string,source:'unconfigured'|'synthetic'|'loyal-api'};
/** Read-only, fail-closed integration contract. Every production approval requires real evidence. */
export async function checkLoyal(env:Bindings,sku:string,localSynthetic=false):Promise<LoyalResult> {
 if(env.APP_ENV==='development'&&localSynthetic){
  const fixtures:Record<string,TechnicalStatus>={'SKU-OK-1':'approved','SKU-PENDING-2':'pending','SKU-REJECTED-3':'rejected'};
  const status=fixtures[sku]||'unknown';
  return {sku,status,source:'synthetic',stage:'Fixture local',blockReason:status==='approved'?undefined:'No está aprobado en la fixture'};
 }
 const template=env.LOYAL_LOOKUP_URL_TEMPLATE, token=env.LOYAL_READ_TOKEN, approved=env.LOYAL_APPROVED_VALUE;
 if(!template||!token||!approved)return {sku,status:'unknown',source:'unconfigured',blockReason:'API de Loyal pendiente de autorización y configuración'};
 // Template must be a concrete official HTTPS URL with exactly one code placeholder.
 if(!/^https:\/\//.test(template)||template.split('{sku}').length!==2||!sku.trim())return {sku,status:'unknown',source:'unconfigured',blockReason:'Contrato de consulta Loyal inválido'};
 let url:URL;
 try {url=new URL(template.replace('{sku}',encodeURIComponent(sku)));}
 catch {return {sku,status:'unknown',source:'unconfigured',blockReason:'URL de Loyal inválida'};}
 if(url.protocol!=='https:'||!url.hostname||url.username||url.password||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(url.hostname))return {sku,status:'unknown',source:'unconfigured',blockReason:'Host de Loyal no autorizado'};
 try {
  const response=await fetch(url.toString(),{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)return {sku,status:'unknown',source:'loyal-api',blockReason:`Consulta a Loyal falló (HTTP ${response.status})`};
  const body=await response.json() as Record<string,unknown>;
  // Never mark approved based on file existence, ambiguous booleans or guessed status strings.
  if(!body||typeof body.status!=='string'||typeof body.productCode!=='string'||body.productCode.trim()!==sku.trim())return {sku,status:'unknown',source:'loyal-api',blockReason:'Respuesta Loyal sin código o estado verificables'};
  const status:TechnicalStatus=body.status===approved?'approved':body.status==='pending'?'pending':body.status==='rejected'?'rejected':body.status==='missing'?'missing':'unknown';
  return {sku,status,source:'loyal-api',stage:typeof body.stage==='string'?body.stage.slice(0,120):undefined,updatedAt:typeof body.updatedAt==='string'?body.updatedAt:undefined,blockReason:status==='approved'?undefined:`Ficha sin aprobación validada: ${body.status.slice(0,60)}`};
 } catch {return {sku,status:'unknown',source:'loyal-api',blockReason:'No se pudo consultar Loyal; no se desbloquea la OC'};}
}
