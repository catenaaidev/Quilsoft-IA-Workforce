import { Hono } from 'hono';
import { z } from 'zod';
import { requirePermission } from './auth';
import { Store } from './store';
import type { Bindings, AppVariables } from './types';

const routes = new Hono<{Bindings: Bindings; Variables: AppVariables}>();
const entry = z.object({
  clientName: z.string().trim().min(2).max(200),
  market: z.string().trim().max(150).default(''),
  country: z.string().trim().max(150).default(''),
  owner: z.string().trim().max(200).default(''),
  primaryListCode: z.string().trim().min(1).max(24),
  secondaryListCode: z.string().trim().max(24).nullable().default(null),
  enabled: z.boolean().default(true),
});
const fail = (c:any,e:unknown) => c.json({error: String((e as Error).message || e).slice(0,200)}, 400);

routes.get('/price-lists',async c => {
 try {
  requirePermission(c.get('actor'),'orders.read');
  const items = await c.env.DB.prepare('SELECT * FROM customer_price_lists ORDER BY client_name LIMIT 1000').all();
  return c.json(items.results || []);
 } catch (e) {return fail(c,e);}
});
routes.put('/price-lists/:id',async c => {
 try {
  requirePermission(c.get('actor'),'admin.agent');
  const id = c.req.param('id');
  if(!/^[a-zA-Z0-9_-]{3,64}$/.test(id)) return c.json({error:'INVALID_ID'},400);
  const body = entry.parse(await c.req.json());
  const result = await c.env.DB.prepare(`UPDATE customer_price_lists SET client_name=?,market=?,country=?,owner=?,primary_list_code=?,secondary_list_code=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
   .bind(body.clientName,body.market,body.country,body.owner,body.primaryListCode,body.secondaryListCode,body.enabled?1:0,id).run();
  if(!result.meta.changes) return c.json({error:'NOT_FOUND'},404);
  await new Store(c.env).audit(c.get('actor').subject,'price_list.updated','price_list',id,{clientName:body.clientName,primaryListCode:body.primaryListCode,secondaryListCode:body.secondaryListCode});
  return c.json({ok:true});
 } catch(e) {return fail(c,e);}
});
routes.post('/price-lists',async c => {
 try {
  requirePermission(c.get('actor'),'admin.agent');
  const body=entry.parse(await c.req.json()),id=crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO customer_price_lists(id,client_name,market,country,owner,primary_list_code,secondary_list_code,enabled,source) VALUES(?,?,?,?,?,?,?,?,?)`)
   .bind(id,body.clientName,body.market,body.country,body.owner,body.primaryListCode,body.secondaryListCode,body.enabled?1:0,'Administración manual').run();
  await new Store(c.env).audit(c.get('actor').subject,'price_list.created','price_list',id,{clientName:body.clientName});
  return c.json({id},201);
 } catch(e) {return fail(c,e);}
});
routes.get('/orders/:id/price-list',async c => {
 try {
  requirePermission(c.get('actor'),'orders.read');
  const row=await c.env.DB.prepare('SELECT * FROM order_price_list_assignments WHERE order_id=?').bind(c.req.param('id')).first();
  return c.json(row || null);
 } catch(e) {return fail(c,e);}
});
routes.put('/orders/:id/price-list',async c => {
 try {
  requirePermission(c.get('actor'),'orders.write');
  const id=z.string().uuid().parse(c.req.param('id'));
  const body=z.object({listCode:z.string().trim().min(1).max(24),matchedClientId:z.string().max(64).nullable().optional()}).parse(await c.req.json());
  const order=await c.env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(id).first<{status:string}>();
  if(!order)return c.json({error:'ORDER_NOT_FOUND'},404);
  if(['approved','csv_generated','completed'].includes(order.status))return c.json({error:'FINAL_ORDER_LOCKED'},409);
  const valid=await c.env.DB.prepare('SELECT id FROM customer_price_lists WHERE enabled=1 AND (primary_list_code=? OR secondary_list_code=?) LIMIT 1').bind(body.listCode,body.listCode).first();
  if(!valid)return c.json({error:'LIST_NOT_IN_CATALOG'},409);
  if(body.matchedClientId){const row=await c.env.DB.prepare('SELECT id FROM customer_price_lists WHERE id=? AND enabled=1').bind(body.matchedClientId).first();if(!row)return c.json({error:'CLIENT_NOT_FOUND'},409);}
  await c.env.DB.prepare(`INSERT INTO order_price_list_assignments(order_id,list_code,matched_client_id,confirmed_by) VALUES(?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET list_code=excluded.list_code,matched_client_id=excluded.matched_client_id,confirmed_by=excluded.confirmed_by,confirmed_at=CURRENT_TIMESTAMP`)
   .bind(id,body.listCode,body.matchedClientId||null,c.get('actor').subject).run();
  await new Store(c.env).audit(c.get('actor').subject,'order.price_list_selected','order',id,{listCode:body.listCode,matchedClientId:body.matchedClientId||null});
  return c.json({ok:true,listCode:body.listCode});
 } catch(e) {return fail(c,e);}
});
export default routes;
