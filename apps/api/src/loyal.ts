import type { Bindings } from './types';
import type { TechnicalStatus } from '@workforce/domain';
export type LoyalResult={sku:string,status:TechnicalStatus,stage?:string,updatedAt?:string,blockReason?:string,source:'unconfigured'|'synthetic'};
/** Contract only. Production NEVER guesses Loyal endpoints or approval status. */
export async function checkLoyal(env:Bindings,sku:string,localSynthetic=false):Promise<LoyalResult> {
  // Only local-only mock identity may use these synthetic results, never external SSO subjects.
  if(env.APP_ENV==='development'&&localSynthetic){
    const fixtures:Record<string,TechnicalStatus>={'SKU-OK-1':'approved','SKU-PENDING-2':'pending','SKU-REJECTED-3':'rejected'};
    const status=fixtures[sku]||'unknown';
    return {sku,status,source:'synthetic',stage:'Fixture local',blockReason:status==='approved'?undefined:'No está aprobado en la fixture'};
  }
  return {sku,status:'unknown',source:'unconfigured',blockReason:'API real de Loyal pendiente de especificación y pruebas'};
}
