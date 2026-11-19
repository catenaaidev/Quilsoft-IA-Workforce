import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Bindings, Actor, Role } from './types';
import { Store } from './store';

const rolePermissions: Record<Role, string[]> = {
  admin:['*'],
  supervisor:['orders.read','orders.write','orders.approve','orders.csv','documents.read','agents.read','audit.read'],
  process_owner:['orders.read','orders.write','orders.approve','orders.csv','documents.read','agents.read'],
  operator:['orders.read','orders.write','documents.read','agents.read'],
  viewer:['orders.read','documents.read','agents.read'],
  auditor:['orders.read','documents.read','agents.read','audit.read']
};

const CENTRAL='https://besa-identidad-central.besa-junin.workers.dev';
export const APP_SESSION_COOKIE='__Host-iawf_session';
export const sessionTokenFromCookie=(cookie:string)=>cookie.match(/(?:^|;\s*)__Host-iawf_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1]||null;

export function requirePermission(actor:Actor,permission:string) {
  if(!rolePermissions[actor.role]?.includes('*')&&!rolePermissions[actor.role]?.includes(permission)) throw new Error('FORBIDDEN');
}

export async function centralRequest(env:Bindings,path:string,body:Record<string,unknown>):Promise<Response> {
  if(!env.IDENTITY) throw Error('CENTRAL_SSO_NOT_BOUND');
  return env.IDENTITY.fetch(new Request(`${CENTRAL}${path}`,{
    method:'POST',headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify(body)
  }));
}

export const authenticate:MiddlewareHandler<{Bindings:Bindings;Variables:AppVariables}> = async (c,next) => {
  const host=new URL(c.req.url).hostname;
  let actor:Actor|null=null;
  if(c.env.APP_ENV==='development' && ['localhost','127.0.0.1'].includes(host) && c.req.header('x-local-demo')==='true'){
    actor={subject:'local-demo-admin',displayName:'Administrador de prueba',role:'admin'};
  } else {
    const token=sessionTokenFromCookie(c.req.header('cookie')||'');
    if(!token)return c.json({error:'UNAUTHENTICATED'},401);
    try {
      const res=await centralRequest(c.env,'/api/sso/workforce/check',{token});
      if(!res.ok)return c.json({error:'SSO_SESSION_INVALID'},401);
      const result=await res.json() as {ok?:boolean;principal_id?:string;name?:string;app_role?:string};
      if(!result.ok || !result.principal_id)return c.json({error:'SSO_SESSION_INVALID'},401);
      const role:Role=result.app_role==='administrador'?'admin':result.app_role==='supervisor'?'supervisor':'operator';
      // Central assignment is authoritative. A local role must never elevate the SSO role.
      actor={subject:result.principal_id,displayName:result.name||result.principal_id,role};
    }catch {
      return c.json({error:'CENTRAL_SSO_UNAVAILABLE'},503);
    }
  }
  if(!['GET','HEAD','OPTIONS'].includes(c.req.method)) {
    if(c.req.header('origin')!==new URL(c.req.url).origin)return c.json({error:'CROSS_ORIGIN_NOT_ALLOWED'},403);
  }
  if(!actor)return c.json({error:'UNAUTHENTICATED'},401);
  c.set('actor',actor);
  await next();
};
