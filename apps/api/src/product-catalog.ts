import { Hono } from 'hono';
import { z } from 'zod';
import { authenticate, requirePermission } from './auth';
import { Store } from './store';
import type { Bindings, AppVariables } from './types';

const catalog = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();
catalog.use('*', authenticate);
// Product reference records are Worknet exports; NEVER use Version to authorize Loyal.
catalog.get('/', async c => {
 try {
  requirePermission(c.get('actor'), 'orders.read');
  const term = (c.req.query('q') || '').trim().slice(0, 100);
  const market = (c.req.query('market') || '').trim().slice(0, 80);
  const page = Math.min(100000, Math.max(1, Number(c.req.query('page') || 1) || 1));
  const limit = Math.min(100, Math.max(10, Number(c.req.query('limit') || 50) || 50));
  const filters: string[] = [];
  const args: (string|number)[] = [];
  if (term) {
   const like = '%' + term.replace(/[\\%_]/g, '\\$&') + '%';
   filters.push("(code LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR client_name LIKE ? ESCAPE '\\' OR sales_description LIKE ? ESCAPE '\\' OR grouping_code LIKE ? ESCAPE '\\')");
   args.push(like,like,like,like,like);
  }
  if (market) { filters.push('market = ?'); args.push(market); }
  if(c.req.query('includeInactive')!=='true')filters.push('is_active=1');
  const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
  const base = `WITH effective AS (SELECT p.code,COALESCE(o.description,p.description) AS description,p.product_type,p.business_line,p.family,p.product_line,p.units_per_box,COALESCE(o.presentation,p.presentation) AS presentation,p.grouping_code,p.sales_description,COALESCE(o.market,p.market) AS market,p.vintage,p.color,p.varietal,p.barcode_unit,p.barcode_box,p.client_code,COALESCE(o.client_name,p.client_name) AS client_name,p.destination_country,p.version_label,p.version_approved_at,p.discontinued,p.source_date,COALESCE(o.is_active,1) AS is_active FROM worknet_product_catalog p LEFT JOIN worknet_product_catalog_overrides o ON o.code=p.code)`;
  const count = await c.env.DB.prepare(base+' SELECT COUNT(*) AS n FROM effective'+where).bind(...args).first<{n:number}>();
  const result = await c.env.DB.prepare(base+` SELECT * FROM effective${where} ORDER BY code LIMIT ? OFFSET ?`).bind(...args,limit,(page-1)*limit).all();
  return c.json({total:count?.n||0,page,limit,items:result.results||[],loyalNote:'La aprobación de versión Worknet no equivale a aprobación de ficha Loyal.'});
 } catch(e){return c.json({error:String(e).slice(0,220)},400);}
});
catalog.get('/summary',async c=>{
 try {requirePermission(c.get('actor'),'orders.read');const total=await c.env.DB.prepare('SELECT COUNT(*) n FROM worknet_product_catalog').first<{n:number}>();const sources=await c.env.DB.prepare('SELECT source_file,source_date,COUNT(*) AS count FROM worknet_product_catalog GROUP BY source_file,source_date ORDER BY source_date DESC').all();return c.json({total:total?.n||0,sources:sources.results||[]});}catch(e){return c.json({error:String(e).slice(0,220)},400);}
});
catalog.get('/item/:code',async c=>{
 try {requirePermission(c.get('actor'),'orders.read');const code=z.string().min(1).max(100).parse(c.req.param('code'));const row=await c.env.DB.prepare(`SELECT p.*,COALESCE(o.description,p.description) AS effective_description,COALESCE(o.market,p.market) AS effective_market,COALESCE(o.client_name,p.client_name) AS effective_client_name,COALESCE(o.presentation,p.presentation) AS effective_presentation,COALESCE(o.is_active,1) AS is_active FROM worknet_product_catalog p LEFT JOIN worknet_product_catalog_overrides o ON o.code=p.code WHERE p.code=?`).bind(code).first<Record<string,unknown>>();if(!row)return c.json({error:'PRODUCT_NOT_FOUND'},404);const {original_json,...data}=row;return c.json({...data,description:row.effective_description,market:row.effective_market,client_name:row.effective_client_name,presentation:row.effective_presentation,original:JSON.parse(String(original_json))});}catch(e){return c.json({error:String(e).slice(0,220)},400);}
});

// El catalogo original se conserva inalterado. Solo administradores pueden modificar.
const editable=z.object({
 description:z.string().trim().min(2).max(500),
 market:z.string().trim().max(150).default(''),
 client_name:z.string().trim().max(200).default(''),
 presentation:z.string().trim().max(150).default(''),
});
const codeSchema=z.string().trim().min(1).max(100);
catalog.post('/item',async c=>{
 try{
  requirePermission(c.get('actor'),'admin.agent');
  const body=editable.extend({code:codeSchema}).strict().parse(await c.req.json());
  const found=await c.env.DB.prepare('SELECT code FROM worknet_product_catalog WHERE code=?').bind(body.code).first();
  if(found)return c.json({error:'CODE_ALREADY_EXISTS'},409);
  await c.env.DB.prepare(`INSERT INTO worknet_product_catalog(code,description,market,client_name,presentation,source_file,source_date,original_json)
   VALUES(?,?,?,?,?,'Alta manual EXPO',date('now'),?)`).bind(body.code,body.description,body.market,body.client_name,body.presentation,JSON.stringify({'Codigo de Producto':body.code,'Descripcion':body.description,'Origen':'Alta manual EXPO'})).run();
  await new Store(c.env).audit(c.get('actor').subject,'catalog.created','product',body.code,{fields:body});
  return c.json({ok:true,code:body.code},201);
 }catch(e){return c.json({error:String((e as Error).message||e).slice(0,200)},400);}
});
catalog.put('/item/:code',async c=>{
 try{
  requirePermission(c.get('actor'),'admin.agent');
  const code=codeSchema.parse(c.req.param('code'));
  const body=editable.strict().parse(await c.req.json());
  const old=await c.env.DB.prepare('SELECT code FROM worknet_product_catalog WHERE code=?').bind(code).first();
  if(!old)return c.json({error:'PRODUCT_NOT_FOUND'},404);
  await c.env.DB.prepare(`INSERT INTO worknet_product_catalog_overrides(code,description,market,client_name,presentation,is_active,edited_by)
    VALUES(?,?,?,?,?,1,?) ON CONFLICT(code) DO UPDATE SET description=excluded.description,market=excluded.market,client_name=excluded.client_name,presentation=excluded.presentation,edited_by=excluded.edited_by,updated_at=CURRENT_TIMESTAMP`)
   .bind(code,body.description,body.market,body.client_name,body.presentation,c.get('actor').subject).run();
  await new Store(c.env).audit(c.get('actor').subject,'catalog.updated','product',code,{fields:body});
  return c.json({ok:true});
 }catch(e){return c.json({error:String((e as Error).message||e).slice(0,200)},400);}
});
// Baja reversible; nunca borra codigos utilizados por OC historicas.
catalog.post('/item/:code/status',async c=>{
 try{
  requirePermission(c.get('actor'),'admin.agent');
  const code=codeSchema.parse(c.req.param('code'));
  const body=z.object({active:z.boolean()}).parse(await c.req.json());
  const old=await c.env.DB.prepare('SELECT code FROM worknet_product_catalog WHERE code=?').bind(code).first();
  if(!old)return c.json({error:'PRODUCT_NOT_FOUND'},404);
  await c.env.DB.prepare(`INSERT INTO worknet_product_catalog_overrides(code,is_active,edited_by)
   VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET is_active=excluded.is_active,edited_by=excluded.edited_by,updated_at=CURRENT_TIMESTAMP`)
   .bind(code,body.active?1:0,c.get('actor').subject).run();
  await new Store(c.env).audit(c.get('actor').subject,body.active?'catalog.reactivated':'catalog.deactivated','product',code,{});
  return c.json({ok:true,active:body.active});
 }catch(e){return c.json({error:String((e as Error).message||e).slice(0,200)},400);}
});
export default catalog;
