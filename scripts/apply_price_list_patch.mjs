import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Apply all edits in memory before writing any file. Safe to rerun.
const root = process.cwd();
const changes = new Map([
  ['apps/api/src/app.ts', [
    ["export default app;", "import priceListRoutes from './price-list-routes';\napp.route('/api',priceListRoutes);\nexport default app;"],
    ["const csv=generateCsv(record.order,record.lines,mapping.config);", "const assignment=await c.env.DB.prepare('SELECT list_code FROM order_price_list_assignments WHERE order_id=?').bind(id).first<{list_code:string}>();\n if(!assignment?.list_code)return c.json({error:'PRICE_LIST_NOT_CONFIRMED'},409);\n const csv=generateCsv({...record.order,priceListCode:assignment.list_code},record.lines,mapping.config);"],
  ]],
  ['apps/web/src/main.tsx', [
    ["import { CommercialSources } from './commercial-sources';", "import { CommercialSources } from './commercial-sources';\nimport { PriceLists } from './price-lists';"],
    ['<Route path="fuentes-comerciales" element={<CommercialSources/>}/>', '<Route path="fuentes-comerciales" element={<CommercialSources/>}/><Route path="listas-precios" element={<PriceLists/>}/>'],
  ]],
  ['apps/web/src/layout.tsx', [
    ["{to:'/fuentes-comerciales',name:'Fuentes comerciales',icon:FileText},", "{to:'/fuentes-comerciales',name:'Fuentes comerciales',icon:FileText},\n {to:'/listas-precios',name:'Listas de precios',icon:ClipboardList},"],
  ]],
  ['apps/web/src/pages.tsx', [
    ["import { DocumentPreview } from './document-preview';", "import { DocumentPreview } from './document-preview';\nimport { OrderPriceList } from './price-lists';"],
    ['<OrderMetadataEditor order={d.order}/>', '<OrderMetadataEditor order={d.order}/><OrderPriceList orderId={d.order.id} client={d.order.client} status={d.order.status}/>'],
  ]],
  ['packages/domain/src/index.ts', [
    ["'unitPrice' | 'currency' | 'issuedAt'", "'unitPrice' | 'currency' | 'issuedAt' | 'priceListCode'"],
    ["issuedAt: string | null; status: OrderStatus; version: number;", "issuedAt: string | null; priceListCode?: string | null; status: OrderStatus; version: number;"],
    ["if (source === 'issuedAt') return order.issuedAt;", "if (source === 'issuedAt') return order.issuedAt;\n    if (source === 'priceListCode') return order.priceListCode;"],
  ]],
]);

const updated = new Map();
for (const [relative, edits] of changes) {
  const filename = path.join(root, relative);
  if (!existsSync(filename)) throw new Error(`Falta archivo: ${relative}`);
  let source = readFileSync(filename, 'utf8');
  for (const [before, after] of edits) {
    if (source.includes(after)) continue;
    const matches = source.split(before).length - 1;
    if (matches !== 1) throw new Error(`No se aplico: ${relative} | marcador encontrado ${matches} veces: ${before}`);
    source = source.replace(before, after);
  }
  updated.set(filename, source);
}
for (const [filename, source] of updated) writeFileSync(filename, source, 'utf8');
console.log('OK: parche de listas aplicado. Ejecutar npm run build y revisar git diff antes de publicar.');
