import { Hono } from 'hono';
import productCatalog from './product-catalog';
import { z } from 'zod';
import { validateOrder, generateCsv, sha256Hex, canTransition, matchesFileSignature } from '@workforce/domain';
import { authenticate, requirePermission, centralRequest, APP_SESSION_COOKIE, sessionTokenFromCookie } from './auth';
import { Store } from './store';
import { checkLoyal } from './loyal';
import type { Bindings, AppVariables, Actor } from './types';
const app=new Hono<{Bindings:Bindings;Variables:AppVariables}>();
const parseUuid=z.string().uuid();
const lineSchema=z.object({sku:z.string().max(100),description:z.string().max(500),quantity:z.number().finite().nonnegative(),unit:z.string().max(40),unitPrice:z.number().finite().nonnegative().nullable(),currency:z.string().max(10)});
const orderSchema=z.object({orderNumber:z.string().max(100).optional(),client:z.string().max(200).optional(),issuedAt:z.string().date().optional(),lines:z.array(lineSchema).max(250).optional()});
const lineEditSchema=lineSchema.partial().strict();
function error(c:any,e:unknown) {
 const code=(e as Error)?.message||'INTERNAL_ERROR';
 if(code==='FORBIDDEN')return c.json({error:code},403);
 if(code.includes('no fue validado')||code.includes('no confirmadas'))return c.json({error:code},409);
 return c.json({error:code.slice(0,300)},400);
}
function can(actor:Actor,p:string){requirePermission(actor,p);}
app.get('/api/health',c=>c.json({status:'ok',service:'ia-workforce',build:'0.1.0',productionReady:false}));
// Unauthenticated endpoints for exchanging a single-use central SSO ticket.
app.post('/api/sso/exchange',async c=>{
 try {
  const body=await c.req.json() as {ticket?:unknown};
  if(typeof body?.ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.ticket))return c.json({error:'INVALID_SSO_TICKET'},400);
  const res=await centralRequest(c.env,'/api/sso/workforce/exchange',{ticket:body.ticket});
  if(!res.ok)return c.json({error:'SSO_EXCHANGE_REJECTED'},401);
  const reply=await res.json() as {ok?:boolean;token?:string;expires_at?:number};
  if(!reply.ok||typeof reply.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(reply.token))return c.json({error:'SSO_INVALID_RESPONSE'},502);
  const age=Math.max(0,Math.min(8*3600,Math.floor(Number(reply.expires_at||0)-Date.now()/1000)));
  if(age<30)return c.json({error:'SSO_EXPIRED'},401);
  c.header('Set-Cookie',`${APP_SESSION_COOKIE}=${reply.token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`);
  c.header('Cache-Control','no-store');
  return c.json({ok:true});
 }catch {return c.json({error:'SSO_UNAVAILABLE'},503);}
});
app.post('/api/sso/logout',async c=>{
 const token=sessionTokenFromCookie(c.req.header('cookie')||'');
 if(token){try{await centralRequest(c.env,'/api/sso/workforce/revoke',{token});}catch{}}
 c.header('Set-Cookie',`${APP_SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
 c.header('Cache-Control','no-store');
 return c.json({ok:true});
});
app.route('/api/product-catalog',productCatalog);
app.use('/api/*',authenticate);
app.get('/api/me',c=>c.json({actor:c.get('actor'),environment:c.env.APP_ENV}));

// Commercial source files: read-only and access-controlled, separate from purchasing approvals.
app.get('/api/commercial-sources',async c=>{
 try {
  can(c.get('actor'),'orders.read');
  const result=await c.env.DB.prepare(`SELECT s.id,s.filename,s.kind,s.sheet_name,s.headers_json,s.imported_at,
   (SELECT COUNT(*) FROM workforce_import_rows r WHERE r.source_id=s.id) AS row_count
   FROM workforce_import_sources s ORDER BY s.filename,s.sheet_name`).all();
  return c.json((result.results||[]).map((s:any)=>({id:s.id,filename:s.filename,kind:s.kind,sheetName:s.sheet_name,headers:JSON.parse(s.headers_json),importedAt:s.imported_at,rowCount:s.row_count})));
 } catch(e){return error(c,e);}
});
app.get('/api/commercial-sources/:id/rows',async c=>{
 try {
  can(c.get('actor'),'orders.read');
  const id=c.req.param('id');if(!/^[0-9a-f]{24}$/.test(id))return c.json({error:'INVALID_SOURCE'},400);
  const source=await c.env.DB.prepare('SELECT id FROM workforce_import_sources WHERE id=?').bind(id).first();
  if(!source)return c.json({error:'SOURCE_NOT_FOUND'},404);
  const limit=Math.min(200,Math.max(1,Number(c.req.query('limit')||100)));
  const offset=Math.max(0,Number(c.req.query('offset')||0));
  const result=await c.env.DB.prepare('SELECT row_number,values_json FROM workforce_import_rows WHERE source_id=? ORDER BY row_number LIMIT ? OFFSET ?').bind(id,limit,offset).all();
  return c.json((result.results||[]).map((r:any)=>({rowNumber:r.row_number,values:JSON.parse(r.values_json)})));
 } catch(e){return error(c,e);}
});
// Authenticated, auditable smoke test: a real Workers AI inference, no business data or ERP writes.
app.post('/api/agent-diagnostics/test',async c=>{
 try {
  can(c.get('actor'),'admin.agent');
  if(!c.env.AI)return c.json({error:'AI_NOT_CONFIGURED'},503);
  const started=Date.now();const model=c.env.AI_MODEL||'@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  try {
   const answer=await c.env.AI.run(model,{messages:[{role:'system',content:'Sos un verificador técnico. Respondé con una palabra: OPERATIVO.'},{role:'user',content:'Comprobación de disponibilidad. No procesar información empresarial.'}],max_tokens:30,temperature:0});
   const response=typeof answer==='string'?answer:String((answer as any)?.response||'');
   if(!response.trim())throw new Error('EMPTY_AI_RESPONSE');
   await new Store(c.env).insert('executions',{agent_slug:'technical-smoke-test',status:'completed',model,duration_ms:Date.now()-started,finished_at:new Date().toISOString()});
   await new Store(c.env).audit(c.get('actor').subject,'agent.smoke_test','agent','purchase-orders',{ok:true,model});
   return c.json({ok:true,model,durationMs:Date.now()-started});
  } catch(e) {
   await new Store(c.env).insert('executions',{agent_slug:'technical-smoke-test',status:'error',model,duration_ms:Date.now()-started,error:String(e).slice(0,250),finished_at:new Date().toISOString()});
   return c.json({error:'AI_SMOKE_TEST_FAILED'},502);
  }
 } catch(e){return error(c,e);}
});
app.get('/api/agent-diagnostics',async c=>{
 try {
  can(c.get('actor'),'agents.read');
  const [agent,run,documents]=await Promise.all([
   c.env.DB.prepare('SELECT COUNT(*) AS n FROM agents').first<{n:number}>(),
   c.env.DB.prepare('SELECT status,COUNT(*) AS n FROM executions GROUP BY status').all(),
   c.env.DB.prepare('SELECT extraction_status,COUNT(*) AS n FROM documents GROUP BY extraction_status').all()
  ]);
  return c.json({configuredAgents:agent?.n||0,aiBinding:Boolean(c.env.AI),queueBinding:Boolean(c.env.JOBS),workflowBinding:Boolean(c.env.PURCHASE_WORKFLOW),r2Binding:Boolean(c.env.DOCS),executions:run.results||[],documents:documents.results||[],note:'Disponibilidad de bindings no equivale a una inferencia de IA verificada.'});
 } catch(e){return error(c,e);}
});

app.get('/api/dashboard',async c=>{
 try{can(c.get('actor'),'orders.read');const orders=await new Store(c.env).listOrders();
  const byStatus=Object.fromEntries(['received','processing','review','blocked','approved','csv_generated','completed','error'].map(s=>[s,orders.filter(o=>o.status===s).length]));
  return c.json({total:orders.length,byStatus,recent:orders.slice(0,10)});
 }catch(e){return error(c,e);}
});
app.get('/api/orders',async c=>{try{can(c.get('actor'),'orders.read');return c.json(await new Store(c.env).listOrders());}catch(e){return error(c,e);}});
app.post('/api/orders',async c=>{try{
 can(c.get('actor'),'orders.write');const body=orderSchema.parse(await c.req.json());
 return c.json(await new Store(c.env).createOrder(body,c.get('actor').subject),201);
 }catch(e){return error(c,e);}});
app.get('/api/orders/:id',async c=>{try{
 can(c.get('actor'),'orders.read');const record=await new Store(c.env).getOrder(parseUuid.parse(c.req.param('id')));
 return record?c.json({...record,validation:validateOrder(record.order,record.lines)}):c.json({error:'NOT_FOUND'},404);
 }catch(e){return error(c,e);}});
app.patch('/api/orders/:id',async c=>{try{
 can(c.get('actor'),'orders.write');const id=parseUuid.parse(c.req.param('id'));const body=orderSchema.pick({orderNumber:true,client:true,issuedAt:true}).extend({version:z.number().int().positive(),notes:z.string().max(2000).optional()}).parse(await c.req.json());
 const store=new Store(c.env),record=await store.getOrder(id);if(!record)return c.json({error:'NOT_FOUND'},404);
 if(record.order.status==='completed'||record.order.status==='csv_generated')return c.json({error:'FINAL_ORDER_LOCKED'},409);
 if(record.order.version!==body.version)return c.json({error:'VERSION_CONFLICT'},409);
 const update:any={version:body.version+1,status:'review',updated_at:new Date().toISOString()};
 if(body.orderNumber!==undefined)update.order_number=body.orderNumber;
 if(body.client!==undefined)update.client=body.client;
 if(body.issuedAt!==undefined)update.issued_at=body.issuedAt;
 if(body.notes!==undefined)update.notes=body.notes;
 if(!(await store.patch('orders',id,update,body.version)).length)return c.json({error:'VERSION_CONFLICT'},409);
 await store.audit(c.get('actor').subject,'order.corrected','order',id,{changedFields:Object.keys(update)});
 return c.json(await store.getOrder(id));
 }catch(e){return error(c,e);}});
app.patch('/api/orders/:id/lines/:lineId',async c=>{try{
 can(c.get('actor'),'orders.write');const id=parseUuid.parse(c.req.param('id')),lineId=parseUuid.parse(c.req.param('lineId'));
 const {version,...data}=lineEditSchema.extend({version:z.number().int().positive()}).parse(await c.req.json());
 const store=new Store(c.env),record=await store.getOrder(id);if(!record)return c.json({error:'NOT_FOUND'},404);
 if(['csv_generated','completed'].includes(record.order.status))return c.json({error:'FINAL_ORDER_LOCKED'},409);
 if(version!==record.order.version)return c.json({error:'VERSION_CONFLICT'},409);
 if(!record.lines.some(l=>l.id===lineId))return c.json({error:'LINE_NOT_FOUND'},404);
 await store.rpc('correct_order_line',{p_order:id,p_line:lineId,p_version:version,p_actor:c.get('actor').subject,p_changes:data});
 return c.json(await store.getOrder(id));
 }catch(e){return error(c,e);}});
app.post('/api/orders/:id/check-loyal',async c=>{try{
 can(c.get('actor'),'orders.write');const id=parseUuid.parse(c.req.param('id')),store=new Store(c.env);
 const record=await store.getOrder(id);if(!record)return c.json({error:'NOT_FOUND'},404);
 const results=[];
 for(const l of record.lines){const result=await checkLoyal(c.env,l.sku,c.get('actor').subject==='local-demo-admin');results.push(result);if(l.id)await store.patch('order_lines',l.id,{technical_status:result.status,technical_checked_at:new Date().toISOString()});}
 const target=results.length && results.every(r=>r.status==='approved')?'review':'blocked';
 if(canTransition(record.order.status,target))await store.transition(record.order,target);
 await store.audit(c.get('actor').subject,'loyal.checked','order',id,{statuses:results.map(r=>({sku:r.sku,status:r.status}))});
 return c.json({results,canApprove:results.length>0&&results.every(r=>r.status==='approved')});
 }catch(e){return error(c,e);}});
app.post('/api/orders/:id/approve',async c=>{try{
 can(c.get('actor'),'orders.approve');const id=parseUuid.parse(c.req.param('id'));const store=new Store(c.env),record=await store.getOrder(id);
 if(!record)return c.json({error:'NOT_FOUND'},404);
 if(record.order.status!=='review')return c.json({error:'INVALID_STATE'},409);
 const validation=validateOrder(record.order,record.lines);
 if(!validation.ok)return c.json({error:'VALIDATION_BLOCK',validation},409);
 // Last-mile verification: no cached/mocked status can authorize a real purchase.
 const fresh=await Promise.all(record.lines.map(l=>checkLoyal(c.env,l.sku,c.get('actor').subject==='local-demo-admin')));
 if(fresh.some(x=>x.status!=='approved'))return c.json({error:'LOYAL_NOT_VERIFIED',results:fresh},409);
 if(!(await store.transition(record.order,'approved')))return c.json({error:'VERSION_CONFLICT'},409);
 await store.insert('order_approvals',{order_id:id,actor_subject:c.get('actor').subject,decision:'approved',reason:'business+loyal'});
 await store.audit(c.get('actor').subject,'order.approved','order',id,{checks:'business+loyal'});
 return c.json({status:'approved'});
 }catch(e){return error(c,e);}});
app.post('/api/orders/:id/csv',async c=>{try{
 can(c.get('actor'),'orders.csv');const id=parseUuid.parse(c.req.param('id')),store=new Store(c.env),record=await store.getOrder(id);
 if(!record)return c.json({error:'NOT_FOUND'},404);
 if(record.order.status!=='approved')return c.json({error:'ORDER_NOT_APPROVED'},409);
 const mapping=await store.mapping();if(!mapping)return c.json({error:'OFFICIAL_CSV_MAPPING_NOT_VALIDATED'},409);
 const assignment=await c.env.DB.prepare('SELECT list_code FROM order_price_list_assignments WHERE order_id=?').bind(id).first<{list_code:string}>();
 if(!assignment?.list_code)return c.json({error:'PRICE_LIST_NOT_CONFIRMED'},409);
 const csv=generateCsv({...record.order,priceListCode:assignment.list_code},record.lines,mapping.config);
 const key=`csv/${id}/${crypto.randomUUID()}.csv`,bytes=new TextEncoder().encode(csv);
 await c.env.DOCS.put(key,bytes,{httpMetadata:{contentType:'text/csv; charset=utf-8'}});
 const [file]=await store.insert('generated_csvs',{order_id:id,mapping_id:mapping.id,r2_key:key,hash:await sha256Hex(bytes.buffer as ArrayBuffer),generated_by:c.get('actor').subject});
 if(!(await store.transition(record.order,'csv_generated')))return c.json({error:'VERSION_CONFLICT_RECONCILE_EXPORT'},409);
 await store.audit(c.get('actor').subject,'csv.generated','order',id,{csvId:file.id,mappingId:mapping.id});
 return c.json({csvId:file.id,status:'pending_manual_erp_upload'});
 }catch(e){return error(c,e);}});
app.get('/api/orders/:id/csv',async c=>{try{
 can(c.get('actor'),'orders.csv');const id=parseUuid.parse(c.req.param('id')),store=new Store(c.env);
 const rows=await store.by('generated_csvs','order_id',id,'order=created_at.desc&limit=1');
 if(!rows.length)return c.json({error:'CSV_NOT_FOUND'},404);
 const object=await c.env.DOCS.get(rows[0].r2_key);if(!object)return c.json({error:'FILE_NOT_FOUND'},404);
 return new Response(object.body,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="OC-${id}.csv"`,'Cache-Control':'no-store'}});
 }catch(e){return error(c,e);}});
app.post('/api/orders/:id/complete',async c=>{try{
 can(c.get('actor'),'orders.csv');const id=parseUuid.parse(c.req.param('id')),store=new Store(c.env),record=await store.getOrder(id);
 if(!record)return c.json({error:'NOT_FOUND'},404);
 if(record.order.status!=='csv_generated')return c.json({error:'CSV_NOT_PENDING'},409);
 const body=z.object({confirmedManualUpload:z.literal(true),reference:z.string().min(3).max(200)}).parse(await c.req.json());
 if(!(await store.transition(record.order,'completed')))return c.json({error:'VERSION_CONFLICT'},409);
 const csvs=await store.by('generated_csvs','order_id',id,'order=created_at.desc&limit=1');
 if(csvs[0])await store.patch('generated_csvs',csvs[0].id,{loaded_by:c.get('actor').subject,loaded_at:new Date().toISOString()});
 await store.audit(c.get('actor').subject,'erp.manual_upload_confirmed','order',id,{reference:body.reference});
 return c.json({status:'completed'});
 }catch(e){return error(c,e);}});
app.post('/api/documents/upload',async c=>{try{
 can(c.get('actor'),'orders.write');const form=await c.req.formData();const file=form.get('file'),orderId=parseUuid.parse(form.get('orderId'));
 if(!(file instanceof File))return c.json({error:'FILE_REQUIRED'},400);
 if(!['application/pdf','image/png','image/jpeg','image/webp','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/csv'].includes(file.type))return c.json({error:'UNSUPPORTED_TYPE'},415);
 if(file.size>12*1024*1024||file.size===0)return c.json({error:'INVALID_FILE_SIZE'},413);
 const store=new Store(c.env),record=await store.getOrder(orderId);if(!record)return c.json({error:'ORDER_NOT_FOUND'},404);
 if(['approved','csv_generated','completed'].includes(record.order.status))return c.json({error:'ORDER_LOCKED'},409);
 const bytes=await file.arrayBuffer();
 if(!matchesFileSignature(file.type,bytes))return c.json({error:'FILE_SIGNATURE_MISMATCH'},415);
 const hash=await sha256Hex(bytes);
 const duplicate=(await store.by('documents','order_id',orderId)).find(r=>r.sha256===hash);
 if(duplicate)return c.json({error:'DUPLICATE_FILE',documentId:duplicate.id},409);
 const key=`original/${orderId}/${crypto.randomUUID()}`;
 await c.env.DOCS.put(key,bytes,{httpMetadata:{contentType:file.type},customMetadata:{hash}});
 const [doc]=await store.insert('documents',{order_id:orderId,original_filename:file.name.slice(0,200),mime_type:file.type,size_bytes:file.size,sha256:hash,r2_key:key});
 await c.env.JOBS.send({orderId,documentId:doc.id});
 await store.audit(c.get('actor').subject,'document.uploaded','document',doc.id,{orderId,size:file.size,mime:file.type});
 return c.json({documentId:doc.id,status:'queued'},202);
 }catch(e){return error(c,e);}});
app.get('/api/orders/:id/documents',async c=>{try{
 can(c.get('actor'),'documents.read');const id=parseUuid.parse(c.req.param('id')),store=new Store(c.env);const record=await store.getOrder(id);
 if(!record)return c.json({error:'NOT_FOUND'},404);
 const docs=await store.by('documents','order_id',id,'order=created_at.desc');
 return c.json(docs.map(({id,original_filename,mime_type,size_bytes,extraction_status,failure_reason,created_at}:any)=>({id,original_filename,mime_type,size_bytes,extraction_status,failure_reason,created_at})));
 }catch(e){return error(c,e);}});
app.get('/api/documents/:id/extraction',async c=>{try{
 can(c.get('actor'),'documents.read');const id=parseUuid.parse(c.req.param('id'));
 const doc=await new Store(c.env).get('documents',id);if(!doc)return c.json({error:'NOT_FOUND'},404);
 return c.json({status:doc.extraction_status,originalFilename:doc.original_filename,text:doc.extracted_text,extraction:doc.extraction_json,failureReason:doc.failure_reason});
 }catch(e){return error(c,e);}});
app.post('/api/documents/:id/retry',async c=>{try{
 can(c.get('actor'),'orders.write');const id=parseUuid.parse(c.req.param('id')),store=new Store(c.env);
 const doc=await store.get('documents',id);if(!doc)return c.json({error:'NOT_FOUND'},404);
 if(doc.extraction_status!=='error')return c.json({error:'DOCUMENT_NOT_FAILED'},409);
 const previous=await store.by('executions','document_id',id);
 if(previous.filter(x=>x.status==='error').length>=3)return c.json({error:'RETRY_LIMIT_REQUIRES_MANUAL_REVIEW'},409);
 await store.patch('documents',id,{extraction_status:'queued',failure_reason:null});
 await c.env.JOBS.send({orderId:doc.order_id,documentId:id,runId:crypto.randomUUID()});
 await store.audit(c.get('actor').subject,'document.retry_requested','document',id,{attempt:previous.length+1});
 return c.json({status:'queued'},202);
 }catch(e){return error(c,e);}});
app.get('/api/documents/:id/original',async c=>{try{
 can(c.get('actor'),'documents.read');const id=parseUuid.parse(c.req.param('id')),store=new Store(c.env),doc=await store.get('documents',id);
 if(!doc)return c.json({error:'NOT_FOUND'},404);
 const object=await c.env.DOCS.get(doc.r2_key);if(!object)return c.json({error:'OBJECT_MISSING'},404);
 const isPreview=c.req.query('preview')==='1'&&(doc.mime_type==='application/pdf'||doc.mime_type.startsWith('image/'));
 return new Response(object.body,{headers:{'Content-Type':doc.mime_type,'Content-Disposition':`${isPreview?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.original_filename)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"}});
 }catch(e){return error(c,e);}});
app.get('/api/agents',async c=>{try{can(c.get('actor'),'agents.read');return c.json(await new Store(c.env).list('agents','order=name.asc'));}catch(e){return error(c,e);}});
app.post('/api/agents',async c=>{try{
 can(c.get('actor'),'admin.agent');const body=z.object({slug:z.string().regex(/^[a-z0-9-]{3,60}$/),name:z.string().min(3).max(120),description:z.string().max(600).default(''),department:z.string().min(2).max(120)}).parse(await c.req.json());
 const store=new Store(c.env),rows=await store.insert('agents',{...body,status:'draft',provider:'workers-ai'});
 await store.audit(c.get('actor').subject,'agent.created','agent',rows[0].id,{slug:body.slug});
 return c.json(rows[0],201);
 }catch(e){return error(c,e);}});
app.get('/api/agents/:id/instructions',async c=>{try{
 can(c.get('actor'),'agents.read');const id=parseUuid.parse(c.req.param('id')),store=new Store(c.env);
 const agent=await store.get('agents',id);if(!agent)return c.json({error:'NOT_FOUND'},404);
 return c.json(await store.by('agent_instructions','agent_id',id,'order=version.desc&limit=20'));
 }catch(e){return error(c,e);}});
app.post('/api/agents/:id/instructions',async c=>{try{
 can(c.get('actor'),'admin.agent');const id=parseUuid.parse(c.req.param('id'));
 const body=z.object({instructions:z.string().min(10).max(15000),expectedVersion:z.number().int().positive()}).parse(await c.req.json());
 const store=new Store(c.env),agent=await store.get('agents',id);if(!agent)return c.json({error:'NOT_FOUND'},404);
 if(agent.instruction_version!==body.expectedVersion)return c.json({error:'VERSION_CONFLICT'},409);
 const next=body.expectedVersion+1;
 const saved=await store.insert('agent_instructions',{agent_id:id,version:next,instructions:body.instructions,created_by:c.get('actor').subject});
 await store.patch('agents',id,{instruction_version:next,updated_at:new Date().toISOString()});
 await store.audit(c.get('actor').subject,'agent.instructions_versioned','agent',id,{version:next});
 return c.json(saved[0],201);
 }catch(e){return error(c,e);}});
app.patch('/api/agents/:id',async c=>{try{
 can(c.get('actor'),'admin.agent');const id=parseUuid.parse(c.req.param('id'));
 const body=z.object({description:z.string().max(1000).optional(),status:z.enum(['draft','active','paused','disabled']).optional(),monthly_limit:z.number().int().nonnegative().max(50000).optional()}).strict().parse(await c.req.json());
 const store=new Store(c.env),rows=await store.patch('agents',id,{...body,updated_at:new Date().toISOString()});
 if(!rows.length)return c.json({error:'NOT_FOUND'},404);
 await store.audit(c.get('actor').subject,'agent.updated','agent',id,{fields:Object.keys(body)});
 return c.json(rows[0]);
 }catch(e){return error(c,e);}});
app.get('/api/audit',async c=>{try{can(c.get('actor'),'audit.read');return c.json(await new Store(c.env).list('audit_events','order=occurred_at.desc&limit=100'));}catch(e){return error(c,e);}});
app.get('/api/executions',async c=>{try{can(c.get('actor'),'audit.read');return c.json(await new Store(c.env).list('executions','order=created_at.desc&limit=100'));}catch(e){return error(c,e);}});
app.get('/api/erp/masters',async c=>{try{
 can(c.get('actor'),'orders.read');const kind=z.enum(['clients','products','currencies','incoterms','units','prices','terms']).parse(c.req.query('kind'));
 return c.json(await new Store(c.env).by('erp_reference','kind',kind,'order=code.asc&limit=500'));
 }catch(e){return error(c,e);}});
app.post('/api/erp/masters/import',async c=>{try{
 can(c.get('actor'),'admin.agent');const body=z.object({kind:z.enum(['clients','products','currencies','incoterms','units','prices','terms']),sourceVersion:z.string().min(2).max(80),rows:z.array(z.object({code:z.string().min(1).max(80),label:z.string().min(1).max(500)})).min(1).max(1000)}).parse(await c.req.json());
 const store=new Store(c.env),records=body.rows.map(r=>({kind:body.kind,code:r.code,label:r.label,source_version:body.sourceVersion}));
 await store.upsert('erp_reference',records,'kind,code,source_version');
 await store.audit(c.get('actor').subject,'erp.masters_imported','erp',body.kind,{sourceVersion:body.sourceVersion,count:records.length});
 return c.json({imported:records.length,readOnly:true});
 }catch(e){return error(c,e);}});
app.get('/api/integrations',async c=>{return c.json({graph:c.env.GRAPH_TENANT_ID&&c.env.GRAPH_CLIENT_ID&&c.env.GRAPH_CLIENT_SECRET&&c.env.GRAPH_MAILBOX?'configured_not_verified':'pending',loyal:c.env.LOYAL_LOOKUP_URL_TEMPLATE&&c.env.LOYAL_READ_TOKEN&&c.env.LOYAL_APPROVED_VALUE?'configured_not_verified':'pending_official_api',erp:'read_only_contract_pending',sso:c.env.IDENTITY?'configured_not_verified':'pending',documentProcessor:c.env.DOC_PROCESSOR_URL?'configured_not_verified':'optional',csvMapping:'requires_official_validated_example'});});
import priceListRoutes from './price-list-routes';
app.route('/api',priceListRoutes);
export default app;
