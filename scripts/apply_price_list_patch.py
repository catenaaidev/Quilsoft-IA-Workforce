"""Incremental, idempotent source updates. Run from project root after extracting ZIP."""
from pathlib import Path
root=Path.cwd()
changes={
 'apps/api/src/app.ts':[("export default app;", "import priceListRoutes from './price-list-routes';\napp.route('/api',priceListRoutes);\nexport default app;")],
 'apps/web/src/main.tsx':[("import { CommercialSources } from './commercial-sources';", "import { CommercialSources } from './commercial-sources';\nimport { PriceLists } from './price-lists';"),('<Route path="fuentes-comerciales" element={<CommercialSources/>}/>', '<Route path="fuentes-comerciales" element={<CommercialSources/>}/><Route path="listas-precios" element={<PriceLists/>}/>')],
 'apps/web/src/layout.tsx':[("{to:'/fuentes-comerciales',name:'Fuentes comerciales',icon:FileText},", "{to:'/fuentes-comerciales',name:'Fuentes comerciales',icon:FileText},\n {to:'/listas-precios',name:'Listas de precios',icon:ClipboardList},")],
 'apps/web/src/pages.tsx':[("import { DocumentPreview } from './document-preview';", "import { DocumentPreview } from './document-preview';\nimport { OrderPriceList } from './price-lists';"),('<OrderMetadataEditor order={d.order}/>', '<OrderMetadataEditor order={d.order}/><OrderPriceList orderId={d.order.id} client={d.order.client} status={d.order.status}/>')],
 'packages/domain/src/index.ts':[("'unitPrice' | 'currency' | 'issuedAt'", "'unitPrice' | 'currency' | 'issuedAt' | 'priceListCode'"),("issuedAt: string | null; status: OrderStatus; version: number;", "issuedAt: string | null; priceListCode?: string | null; status: OrderStatus; version: number;"),("if (source === 'issuedAt') return order.issuedAt;", "if (source === 'issuedAt') return order.issuedAt;\n    if (source === 'priceListCode') return order.priceListCode;")],
}
for path,edits in changes.items():
 f=root/path
 if not f.exists():raise RuntimeError('Falta archivo: '+path)
 s=f.read_text(encoding='utf-8')
 for old,new in edits:
  if new in s:continue
  if old not in s:raise RuntimeError('Marcador no encontrado en '+path+': '+old)
  if s.count(old)!=1:raise RuntimeError('Marcador ambiguo en '+path)
  s=s.replace(old,new,1)
 f.write_text(s,encoding='utf-8')
# Inject selected price list into CSV export, not a guessed price.
f=root/'apps/api/src/app.ts';s=f.read_text(encoding='utf-8')
old='const csv=generateCsv(record.order,record.lines,mapping.config);'
new='''const assignment=await c.env.DB.prepare('SELECT list_code FROM order_price_list_assignments WHERE order_id=?').bind(id).first<{list_code:string}>();
 if(!assignment?.list_code)return c.json({error:'PRICE_LIST_NOT_CONFIRMED'},409);
 const csv=generateCsv({...record.order,priceListCode:assignment.list_code},record.lines,mapping.config);'''
if new not in s:
 if old not in s:raise RuntimeError('CSV export insertion point missing')
 s=s.replace(old,new,1);f.write_text(s,encoding='utf-8')
print('Parche de listas aplicado. Ejecutar npm ci && npm run build antes de desplegar.')
