import { describe,it,expect } from 'vitest';
import app from '../src/app';
describe('API security',()=>{
 it('health visible without secrets',async()=>{const res=await app.request('/api/health');expect(res.status).toBe(200);expect(((await res.json()) as any).productionReady).toBe(false);});
 it('SSO fails closed when unconfigured',async()=>{const env:any={APP_ENV:'production'};const res=await app.request('/api/orders',{method:'GET',headers:{cookie:'__Host-iawf_session='+ 'a'.repeat(43)}},env);expect(res.status).toBe(503);});
 it('no anonymous data',async()=>{const env:any={APP_ENV:'production',SSO_ISSUER:'https://sso.example',SSO_AUDIENCE:'a',SSO_JWKS_URL:'https://sso.example/jwks'};const res=await app.request('/api/orders',{},env);expect(res.status).toBe(401);});
});
