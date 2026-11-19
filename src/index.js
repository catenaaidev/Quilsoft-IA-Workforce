const HEADERS = ['OC','Fecha PI','Fecha PO','Fecha Req. Carga','Cod. Cliente','Destino','Cod. Condicion','Cod. Lista de Precio','Desc. A Nivel Pedido (S / N) ?','','Codigo de producto','Deposito (VF / Junin) = Cod. Deposito Detalle','Cantidad de cajas','Precio unit(USD)','% Desc.','Cantidad de Pallet','Contenedor','Tipo de Pallet','Incoterm','Cajas x Pallet','Observaciones','Observaciones Ampliada'];
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
function json(v,status=200){return new Response(JSON.stringify(v),{status,headers:JSON_HEADERS})}
function err(message,status=400){return json({error:message},status)}
function now(){return new Date().toISOString()}
function id(){return crypto.randomUUID()}
function quoteCsv(s){s=String(s??'');return /[;"\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s}
function makeCsv(rows){return [HEADERS,...rows].map(row=>row.map(quoteCsv).join(';')).join('\r\n')+'\r\n'}
function csvParse(source){
 const text=source.replace(/^\uFEFF/,''); let q=false,cell='',row=[],rows=[];
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(q&&text[i+1]==='"'){cell+='"';i++}else q=!q}
  else if(c===';'&&!q){row.push(cell);cell=''}
  else if((c==='\r'||c==='\n')&&!q){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell=''}
  else cell+=c;
 }
 if(q)throw Error('CSV con comillas sin cerrar');
 if(cell!==''||row.length){row.push(cell);if(row.some(v=>v!==''))rows.push(row)}
 if(!rows.length||rows[0].length!==22||rows[0].some((v,i)=>v!==HEADERS[i]))throw Error('Encabezados incompatibles: se requieren las 22 columnas originales exactas');
 if(rows.slice(1).some(r=>r.length!==22))throw Error('Una línea no tiene 22 columnas');
 return rows.slice(1);
}
function validDate(s){if(!/^\d{2}\/\d{2}\/\d{4}$/.test(s))return false;const [d,m,y]=s.split('/').map(Number);const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d}
function validNumber(s){return /^\d+(?:,\d+)?$/.test(s)}
function validate(fields){let problems=[];for(let i of [1,2,3])if(fields[i]&&!validDate(fields[i]))problems.push('Fecha inválida: '+HEADERS[i]);
 for(let i of [12,13,14])if(fields[i]&&!validNumber(fields[i]))problems.push('Número inválido: '+HEADERS[i]);
 if(!fields[0])problems.push('Falta OC');if(!fields[4])problems.push('Falta código de cliente');if(!fields[7])problems.push('Falta lista de precios');if(!fields[10])problems.push('Falta producto');if(!fields[12])problems.push('Falta cantidad');
 return problems}
async function audit(db,oid,actor,action,details={}){await db.prepare('INSERT INTO audit(id,order_id,actor,action,details,created_at) VALUES(?,?,?,?,?,?)').bind(id(),oid,actor,action,JSON.stringify(details),now()).run()}
async function orderState(db,oid){const rows=await db.prepare('SELECT loyal_status FROM order_lines WHERE order_id=?').bind(oid).all();const blocked=rows.results.some(x=>x.loyal_status!=='approved');return blocked?'blocked':'pending_review'}
function actor(req){return req.headers.get('x-actor')?.slice(0,128)||'operador'}
async function authorize(req,env){
 if(!env.ACCESS_TOKEN||env.ACCESS_TOKEN.length<24)return false;
 const supplied=req.headers.get('authorization')||'';
 const expected='Bearer '+env.ACCESS_TOKEN;
 const e=new TextEncoder(),[a,b]=await Promise.all([crypto.subtle.digest('SHA-256',e.encode(supplied)),crypto.subtle.digest('SHA-256',e.encode(expected))]);
 return new Uint8Array(a).every((v,i)=>v===new Uint8Array(b)[i]);
}
async function handler(req,env){
 const url=new URL(req.url),path=url.pathname;
 if(path==='/'&&req.method==='GET')return new Response(PAGE,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'"}});
 if(path==='/api/health')return json({app:'oc-worknet',status:'ok',configured:!!env.DB});
 if(!path.startsWith('/api/'))return err('No encontrado',404);
 if(!(await authorize(req,env)))return err('Acceso no autorizado o ACCESS_TOKEN sin configurar',401);
 if(!env.DB)return err('Falta configurar binding DB',503);
 const db=env.DB,who=actor(req);
 if(path==='/api/orders'&&req.method==='GET'){
  const result=await db.prepare(`SELECT o.id,o.order_number,o.customer,o.received_at,o.updated_at,o.status,o.reviewed_by,o.reviewed_at,o.exported_at,
  (SELECT count(*) FROM order_lines l WHERE l.order_id=o.id) AS line_count,
  (SELECT count(*) FROM order_lines l WHERE l.order_id=o.id AND l.loyal_status!='approved') AS unresolved
  FROM orders o ORDER BY o.received_at DESC LIMIT 300`).all();return json(result.results);
 }
 if(path==='/api/import-csv'&&req.method==='POST'){
  const body=await req.json();if(typeof body.text!=='string'||body.text.length>1500000)return err('Archivo inválido o demasiado grande');
  let rows;try{rows=csvParse(body.text)}catch(e){return err(e.message)}if(!rows.length)return err('CSV sin líneas');
  const failures=rows.flatMap((r,i)=>validate(r).map(x=>`Línea ${i+2}: ${x}`));if(failures.length)return err(failures.slice(0,30).join(' | '));
  const numbers=[...new Set(rows.map(r=>r[0]))];const existing=await db.prepare(`SELECT order_number FROM orders WHERE order_number IN (${numbers.map(()=>'?').join(',')})`).bind(...numbers).all();
  if(existing.results.length)return err('Ya existen OC: '+existing.results.map(x=>x.order_number).join(', '),409);
  const inserts=[];
  for(const num of numbers){const oid=id(),lines=rows.filter(r=>r[0]===num);inserts.push(db.prepare('INSERT INTO orders(id,order_number,customer,received_at,updated_at,source_name,source_csv,status) VALUES(?,?,?,?,?,?,?,?)').bind(oid,num,lines[0][4],now(),now(),String(body.name||'import.csv').slice(0,200),makeCsv(lines),'blocked'));
   lines.forEach((r,i)=>inserts.push(db.prepare('INSERT INTO order_lines(id,order_id,idx,fields_json,sku,loyal_status) VALUES(?,?,?,?,?,?)').bind(id(),oid,i,JSON.stringify(r),r[10],'unknown')));
   inserts.push(db.prepare('INSERT INTO audit(id,order_id,actor,action,details,created_at) VALUES(?,?,?,?,?,?)').bind(id(),oid,who,'import_csv',JSON.stringify({name:body.name,lines:lines.length}),now()));
  }
  if(inserts.length>500)return err('Importación demasiado grande: dividir en lotes');
  await db.batch(inserts);return json({created:numbers.length,lines:rows.length});
 }
 const detail=path.match(/^\/api\/orders\/([^/]+)$/);
 if(detail&&req.method==='GET'){
  const order=await db.prepare('SELECT * FROM orders WHERE id=?').bind(detail[1]).first();if(!order)return err('OC no encontrada',404);
  const lines=await db.prepare('SELECT * FROM order_lines WHERE order_id=? ORDER BY idx').bind(order.id).all();const history=await db.prepare('SELECT * FROM audit WHERE order_id=? ORDER BY created_at DESC LIMIT 100').bind(order.id).all();
  return json({order,headers:HEADERS,lines:lines.results.map(x=>({...x,fields:JSON.parse(x.fields_json)})),audit:history.results});
 }
 const edit=path.match(/^\/api\/orders\/([^/]+)\/lines\/([^/]+)$/);
 if(edit&&req.method==='PATCH'){
  const line=await db.prepare('SELECT * FROM order_lines WHERE id=? AND order_id=?').bind(edit[2],edit[1]).first();if(!line)return err('Línea inexistente',404);
  const body=await req.json();if(!Array.isArray(body.fields)||body.fields.length!==22||body.fields.some(v=>typeof v!=='string'))return err('Se requieren 22 campos de texto');
  if(body.fields[0]!==JSON.parse(line.fields_json)[0])return err('No se permite modificar el número de OC desde una línea');
  const issues=validate(body.fields);if(issues.length)return err(issues.join(' | '));
  const old=JSON.parse(line.fields_json),changedSku=old[10]!==body.fields[10];
  await db.batch([
    db.prepare('UPDATE order_lines SET fields_json=?,sku=?,loyal_status=?,loyal_checked_at=?,loyal_evidence=? WHERE id=?').bind(JSON.stringify(body.fields),body.fields[10],changedSku?'unknown':line.loyal_status,changedSku?null:line.loyal_checked_at,changedSku?null:line.loyal_evidence,line.id),
    db.prepare('UPDATE orders SET status=?,reviewed_at=NULL,reviewed_by=NULL,updated_at=?,version=version+1 WHERE id=?').bind('blocked',now(),edit[1]),
    db.prepare('INSERT INTO audit(id,order_id,actor,action,details,created_at) VALUES(?,?,?,?,?,?)').bind(id(),edit[1],who,'edit_line',JSON.stringify({line:line.idx,before:old,after:body.fields,skuChanged:changedSku}),now())
  ]);
  return json({ok:true,note:'Revisión invalidada; volver a comprobar fichas técnicas'});
 }
 // Loyal integration intentionally disabled until authorized read-only provider interface is configured.
 if(path.endsWith('/loyal-sync')&&req.method==='POST')return err('Integración Loyal no configurada: no se puede afirmar aprobación',503);
 const review=path.match(/^\/api\/orders\/([^/]+)\/review$/);
 if(review&&req.method==='POST'){
  const order=await db.prepare('SELECT * FROM orders WHERE id=?').bind(review[1]).first();if(!order)return err('OC no encontrada',404);
  const state=await orderState(db,order.id);if(state!=='pending_review')return err('Bloqueada: Loyal no confirmó todas las fichas técnicas',409);
  await db.batch([db.prepare('UPDATE orders SET status=?,reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=?').bind('ready',who,now(),now(),order.id),db.prepare('INSERT INTO audit(id,order_id,actor,action,details,created_at) VALUES(?,?,?,?,?,?)').bind(id(),order.id,who,'human_review','{}',now())]);return json({ok:true});
 }
 const download=path.match(/^\/api\/orders\/([^/]+)\/download$/);
 if(download&&req.method==='GET'){
  const order=await db.prepare('SELECT * FROM orders WHERE id=?').bind(download[1]).first();if(!order)return err('OC no encontrada',404);
  if(order.status!=='ready'&&order.status!=='downloaded')return err('OC no revisada o bloqueada',409);
  if((await orderState(db,order.id))!=='pending_review')return err('Hay fichas técnicas sin aprobar',409);
  const lines=await db.prepare('SELECT fields_json FROM order_lines WHERE order_id=? ORDER BY idx').bind(order.id).all();
  const csv=makeCsv(lines.results.map(r=>JSON.parse(r.fields_json)));
  await db.batch([db.prepare('UPDATE orders SET status=?,exported_by=?,exported_at=? WHERE id=?').bind('downloaded',who,now(),order.id),db.prepare('INSERT INTO audit(id,order_id,actor,action,details,created_at) VALUES(?,?,?,?,?,?)').bind(id(),order.id,who,'download_csv',JSON.stringify({version:order.version}),now())]);
  return new Response('\uFEFF'+csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="OC_${order.id}.csv"`,'cache-control':'no-store'}});
 }
 return err('Ruta desconocida',404);
}
export default {async fetch(req,env){try{return await handler(req,env)}catch(e){console.error('request failed',e?.name);return err('Error interno. Revisar configuración y logs',500)}},async scheduled(_controller,env){if(!env.LOYAL_READONLY_URL)console.log('Loyal no configurado; sincronización omitida');else console.log('Conector Loyal pendiente de contrato autorizado')}};
const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Órdenes de compra | Worknet</title><style>
:root{font-family:Inter,system-ui,Arial,sans-serif;color:#162840;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}header{background:#152c47;color:white;padding:23px 4vw;display:flex;align-items:center;justify-content:space-between}header h1{margin:0;font-size:22px}header small{opacity:.8}main{max-width:1350px;padding:28px 22px;margin:auto}.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:13px;margin:22px 0}.metric,.panel{background:white;border:1px solid #e3e7ef;border-radius:13px;padding:19px;box-shadow:0 2px 13px #152c4708}.metric strong{font-size:28px;display:block;margin-top:7px}.metric small{color:#687789}.panel{margin:16px 0}h2{font-size:18px;margin:0 0 14px}button{background:#205f99;border:0;color:white;padding:10px 16px;border-radius:8px;cursor:pointer;font-weight:600}button.secondary{background:#e7edf5;color:#1b3653}button:disabled{opacity:.48;cursor:not-allowed}input,select{font:inherit;padding:10px 12px;border:1px solid #cad3e0;border-radius:8px;background:#fff}input[type=file]{max-width:100%}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;background:#f0f3f8;color:#41536c}th,td{padding:11px 9px;border-bottom:1px solid #e8edf3;white-space:nowrap}td button{font-size:12px;padding:6px 10px}.scroll{overflow:auto}.tag{padding:4px 9px;border-radius:99px;font-size:12px;font-weight:650;display:inline-block;background:#fff0db;color:#84500e}.tag.ready,.tag.downloaded{background:#e0f4e8;color:#246d48}.tag.unknown{background:#edf0f5;color:#57677b}.muted{color:#66778f;font-size:13px}.notice{padding:12px 15px;border-radius:9px;background:#fff3d7;color:#785313}.error{background:#fee9e7;color:#852c2c}.ok{background:#dff4e8;color:#196344}.cells{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.cells label{font-size:12px;color:#5b6c82}.cells input{width:100%;margin-top:5px}.hide{display:none}#message{margin:10px 0}.detailbar{display:flex;justify-content:space-between;gap:10px;align-items:center}footer{margin-top:30px;color:#758197;font-size:12px}</style></head><body>
<header><div><h1>Gestión inteligente de OC</h1><small>Worknet · Control de fichas Loyal · MVP protegido</small></div><button onclick="logout()" class="secondary">Cambiar acceso</button></header>
<main><div id="message"></div><section class="panel"><h2>Acceso de pruebas</h2><div class="row"><input id="token" type="password" placeholder="Token del servidor" style="min-width:250px"><input id="actor" placeholder="Usuario responsable" value="operador"><button onclick="enter()">Conectar</button><span class="muted">El token no se guarda en archivos ni se envía a otros sitios.</span></div></section>
<div id="app" class="hide"><div class="metrics" id="metrics"></div><section class="panel"><div class="detailbar"><h2>Importar CSV de referencia</h2><span class="muted">No importa órdenes al ERP</span></div><div class="row"><input type="file" id="file" accept=".csv,text/csv"><button onclick="upload()">Importar</button><span class="muted">Se conservan 22 columnas y el archivo original</span></div></section>
<section class="panel"><div class="detailbar"><h2>Órdenes recibidas</h2><button onclick="refresh()" class="secondary">Actualizar</button></div><div class="row" style="margin-bottom:13px"><input id="find" oninput="render()" placeholder="Buscar OC o cliente"><select id="filter" onchange="render()"><option value="">Todos los estados</option><option value="blocked">Bloqueadas</option><option value="ready">Listas</option><option value="downloaded">Descargadas</option></select></div><div class="scroll"><table><thead><tr><th>Orden</th><th>Cliente</th><th>Recibida</th><th>Productos</th><th>Fichas pendientes</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="orders"></tbody></table></div></section>
<section class="panel hide" id="detail"><div class="detailbar"><h2 id="detailtitle"></h2><button onclick="closeDetail()" class="secondary">Cerrar</button></div><div class="notice" id="blocknote"></div><div class="row" style="margin-top:13px"><button id="reviewBtn" onclick="review()">Registrar revisión humana</button><button id="downloadBtn" onclick="downloadCsv()" class="secondary">Descargar CSV</button></div><h3>Productos y validación Loyal</h3><div class="scroll"><table><thead><tr><th>Línea</th><th>Producto</th><th>Cajas</th><th>Precio</th><th>Lista</th><th>Ficha técnica</th><th>Editar</th></tr></thead><tbody id="lines"></tbody></table></div><div id="edit" class="hide" style="margin-top:20px"><h3>Corregir línea</h3><div class="cells" id="cells"></div><div class="row" style="margin-top:15px"><button onclick="saveEdit()">Guardar correcciones</button><button class="secondary" onclick="document.getElementById('edit').classList.add('hide')">Cancelar</button></div></div><h3>Auditoría</h3><div id="history" class="muted"></div></section></div>
<footer>Modo MVP: sin conectores reales a buzón, Loyal o Worknet. No habilitar para producción sin SSO y verificación de integración.</footer></main>
<script>
let token='',who='',orders=[],current=null,editing=null;
const $=id=>document.getElementById(id);
function show(msg,type='notice'){$('message').textContent=msg;$('message').className=type}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function api(path,options={}){const res=await fetch(path,{...options,headers:{Authorization:'Bearer '+token,'x-actor':who,...(options.body?{'content-type':'application/json'}:{})}});if(!res.ok){let x=await res.json().catch(()=>({}));throw Error(x.error||'Error HTTP '+res.status)}return res}
async function enter(){token=$('token').value.trim();who=$('actor').value.trim()||'operador';if(!token){show('Ingresá un token','notice error');return}try{await refresh();$('app').classList.remove('hide');show('Acceso habilitado','notice ok')}catch(e){show(e.message,'notice error')}}
function logout(){token='';current=null;$('token').value='';$('app').classList.add('hide');show('Acceso cerrado')}
async function refresh(){const res=await api('/api/orders');orders=await res.json();render()}
function render(){const find=$('find').value.toLowerCase(),filter=$('filter').value;const rows=orders.filter(o=>(o.order_number+' '+o.customer).toLowerCase().includes(find)&&(!filter||o.status===filter));$('orders').innerHTML=rows.map(o=>'<tr><td>'+esc(o.order_number)+'</td><td>'+esc(o.customer)+'</td><td>'+esc(o.received_at.slice(0,10))+'</td><td>'+o.line_count+'</td><td>'+o.unresolved+'</td><td><span class="tag '+esc(o.status)+'">'+esc(o.status)+'</span></td><td><button onclick="openOrder(\''+o.id+'\')">Ver detalle</button></td></tr>').join('')||'<tr><td colspan="7">Sin órdenes registradas</td></tr>';
const c={blocked:0,ready:0,downloaded:0};orders.forEach(o=>{if(o.status in c)c[o.status]++});$('metrics').innerHTML=[['Total OC',orders.length],['Bloqueadas',c.blocked],['Listas para descargar',c.ready],['Descargadas',c.downloaded],['Fichas sin aprobación',orders.reduce((s,o)=>s+o.unresolved,0)]].map(x=>'<div class="metric"><small>'+x[0]+'</small><strong>'+x[1]+'</strong></div>').join('')}
async function upload(){const file=$('file').files[0];if(!file)return show('Seleccioná un CSV','notice error');try{const res=await api('/api/import-csv',{method:'POST',body:JSON.stringify({name:file.name,text:await file.text()})});const x=await res.json();show('Se importaron '+x.created+' órdenes y '+x.lines+' líneas','notice ok');await refresh()}catch(e){show(e.message,'notice error')}}
async function openOrder(id){try{const res=await api('/api/orders/'+id);current=await res.json();$('detail').classList.remove('hide');$('edit').classList.add('hide');$('detailtitle').textContent='OC '+current.order.order_number;const n=current.lines.filter(x=>x.loyal_status!=='approved').length;$('blocknote').textContent=n?n+' productos aún sin ficha aprobada verificada por Loyal. Exportación bloqueada.':'Fichas comprobadas: revisar la orden antes de descargar.';
$('reviewBtn').disabled=!!n;$('downloadBtn').disabled=!!n||!['ready','downloaded'].includes(current.order.status);
$('lines').innerHTML=current.lines.map(x=>'<tr><td>'+(x.idx+1)+'</td><td>'+esc(x.sku)+'</td><td>'+esc(x.fields[12])+'</td><td>'+esc(x.fields[13])+'</td><td>'+esc(x.fields[7])+'</td><td><span class="tag unknown">'+esc(x.loyal_status)+'</span></td><td><button onclick="editLine(\''+x.id+'\')">Editar</button></td></tr>').join('');$('history').innerHTML=current.audit.map(x=>'<p>'+esc(x.created_at)+' · '+esc(x.actor)+' · '+esc(x.action)+'</p>').join('')||'Sin movimientos';$('detail').scrollIntoView({behavior:'smooth'});
}catch(e){show(e.message,'notice error')}}
function closeDetail(){$('detail').classList.add('hide');current=null}
function editLine(lineId){editing=lineId;const line=current.lines.find(x=>x.id===lineId);$('edit').classList.remove('hide');$('cells').innerHTML=current.headers.map((h,i)=>'<label>'+esc(h||'Columna 10 sin título')+'<input data-col="'+i+'" value="'+esc(line.fields[i])+'"></label>').join('')}
async function saveEdit(){const fields=[...$('cells').querySelectorAll('input')].map(x=>x.value);try{await api('/api/orders/'+current.order.id+'/lines/'+editing,{method:'PATCH',body:JSON.stringify({fields})});show('Correcciones guardadas. Se anuló la revisión anterior.','notice ok');await openOrder(current.order.id);await refresh()}catch(e){show(e.message,'notice error')}}
async function review(){if(!current)return;try{await api('/api/orders/'+current.order.id+'/review',{method:'POST'});await openOrder(current.order.id);await refresh()}catch(e){show(e.message,'notice error')}}
async function downloadCsv(){if(!current)return;try{const res=await api('/api/orders/'+current.order.id+'/download');const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='OC_'+current.order.order_number.replace(/[^a-z0-9_-]/gi,'_')+'.csv';a.click();URL.revokeObjectURL(url);await openOrder(current.order.id);await refresh()}catch(e){show(e.message,'notice error')}}
</script></body></html>`;
