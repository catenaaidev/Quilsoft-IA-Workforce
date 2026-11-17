import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Bindings, Actor, Role } from './types';
import { Store } from './store';
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const rolePermissions: Record<Role, string[]> = {
  admin:['*'],supervisor:['orders.read','orders.write','orders.approve','orders.csv','documents.read','agents.read','audit.read'],
  process_owner:['orders.read','orders.write','orders.approve','orders.csv','documents.read','agents.read'],
  operator:['orders.read','orders.write','documents.read','agents.read'],
  viewer:['orders.read','documents.read','agents.read'],auditor:['orders.read','documents.read','agents.read','audit.read']
};
export function requirePermission(actor:Actor,permission:string) {
  if(!rolePermissions[actor.role]?.includes('*')&&!rolePermissions[actor.role]?.includes(permission)) throw new Error('FORBIDDEN');
}
export const authenticate:MiddlewareHandler<{Bindings:Bindings;Variables:AppVariables}> = async (c,next) => {
  let subject:string|undefined;
  const host=new URL(c.req.url).hostname;
  if(c.env.APP_ENV==='development' && ['localhost','127.0.0.1'].includes(host) && c.req.header('x-local-demo')==='true') {
    // Local-only identity for UI demonstration. NEVER accepted on deployed hosts.
    subject='local-demo-admin';
  } else {
    const {SSO_JWKS_URL,SSO_AUDIENCE,SSO_ISSUER}=c.env;
    if(!SSO_JWKS_URL||!SSO_AUDIENCE||!SSO_ISSUER) return c.json({error:'SSO_NOT_CONFIGURED'},503);
    const bearer=c.req.header('authorization')?.match(/^Bearer ([\w.\-_]+)$/)?.[1];
    const cookie=c.req.header('cookie')?.match(/(?:^|;\s*)__Host-besa_sso=([^;]+)/)?.[1];
    const token=bearer||cookie;
    if(!token) return c.json({error:'UNAUTHENTICATED'},401);
    const keyUrl=new URL(SSO_JWKS_URL);
    if(keyUrl.protocol!=='https:' || keyUrl.origin!==new URL(SSO_ISSUER).origin) return c.json({error:'SSO_CONFIG_INVALID'},503);
    try {
      const keys=jwksCache.get(SSO_JWKS_URL)||createRemoteJWKSet(keyUrl);
      jwksCache.set(SSO_JWKS_URL,keys);
      const {payload}=await jwtVerify(token,keys,{issuer:SSO_ISSUER,audience:SSO_AUDIENCE,algorithms:['RS256','ES256']});
      subject=payload.sub;
    } catch {return c.json({error:'SSO_TOKEN_INVALID'},401);}
  }
  if(!subject) return c.json({error:'SSO_NO_SUBJECT'},401);
  if(!['GET','HEAD','OPTIONS'].includes(c.req.method)) {
    const origin=c.req.header('origin');
    if(origin && origin!==new URL(c.req.url).origin) return c.json({error:'CROSS_ORIGIN_NOT_ALLOWED'},403);
  }
  try {
    let actor:Actor;
    if(subject==='local-demo-admin' && c.env.APP_ENV==='development') actor={subject,displayName:'Administrador de prueba',role:'admin'};
    else {
      const membership=await new Store(c.env).membership(subject);
      if(!membership) return c.json({error:'APP_NOT_ASSIGNED'},403);
      actor={subject,displayName:membership.display_name||subject,role:membership.role as Role};
    }
    c.set('actor',actor);
  }catch(e){return c.json({error:'AUTH_BACKEND_UNAVAILABLE'},503);}
  await next();
};
