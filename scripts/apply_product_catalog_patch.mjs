import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Non-destructive, idempotent patch: validate all anchors before writing anything.
const root=process.cwd();
const edits=new Map([
 ['apps/api/src/app.ts',[
  ["import { Hono } from 'hono';","import { Hono } from 'hono';\nimport productCatalog from './product-catalog';"],
  ["app.use('/api/*',authenticate);","app.route('/api/product-catalog',productCatalog);\napp.use('/api/*',authenticate);"],
 ]],
 ['apps/web/src/main.tsx',[
  ["import { CommercialSources } from './commercial-sources';","import { CommercialSources } from './commercial-sources';\nimport { ProductCatalog } from './product-catalog';"],
  ['<Route path="fuentes-comerciales" element={<CommercialSources/>}/>','<Route path="fuentes-comerciales" element={<CommercialSources/>}/><Route path="maestro-productos" element={<ProductCatalog/>}/>'],
 ]],
 ['apps/web/src/layout.tsx',[
  ["import { useState } from 'react';","import { useState } from 'react';\nimport { PackageSearch } from 'lucide-react';"],
  ["{to:'/fuentes-comerciales',name:'Fuentes comerciales',icon:FileText},","{to:'/fuentes-comerciales',name:'Fuentes comerciales',icon:FileText},\n {to:'/maestro-productos',name:'Maestro de productos',icon:PackageSearch},"],
 ]],
 ['apps/api/src/processing.ts',[
  ["  const lines=extracted.lines.map(l=>({sku:l.sku,description:l.description,quantity:l.quantity||0,unit:l.unit||'',unitPrice:l.unitPrice,currency:l.currency||'',technicalStatus:'unknown' as const}));",`  // Exact-only Worknet reference matches; do not infer Loyal approval or replace SKU.
  const catalogSuggestions: Array<{line:number;inputSku:string;inputDescription:string;matches:Array<{code:string;description:string;market:string;matchType:string}>}> = [];
  for (const [i,line] of extracted.lines.entries()) {
   let candidates: Array<{code:string;description:string;market:string;matchType:string}> = [];
   if (line.sku.trim()) {
    const r=await env.DB.prepare('SELECT code,description,market FROM worknet_product_catalog WHERE code = ? LIMIT 1').bind(line.sku.trim()).all<any>();
    candidates=(r.results||[]).map(x=>({...x,matchType:'exact_code'}));
   } else if (line.description.trim().length>=8) {
    const r=await env.DB.prepare('SELECT code,description,market FROM worknet_product_catalog WHERE description = ? COLLATE NOCASE LIMIT 6').bind(line.description.trim()).all<any>();
    candidates=(r.results||[]).map(x=>({...x,matchType:'exact_description'}));
   }
   catalogSuggestions.push({line:i+1,inputSku:line.sku,inputDescription:line.description,matches:candidates});
  }
  const lines=extracted.lines.map(l=>({sku:l.sku,description:l.description,quantity:l.quantity||0,unit:l.unit||'',unitPrice:l.unitPrice,currency:l.currency||'',technicalStatus:'unknown' as const}));`],
  ['extraction_json:extracted});','extraction_json:{...extracted,catalogSuggestions}});'],
  ["{model,requiresHumanReview:true});","{model,requiresHumanReview:true,catalogSuggestions:catalogSuggestions.filter(x=>x.matches.length>0).length});"],
 ]],
 ['apps/web/src/document-preview.tsx',[
  ['<p className="mt-3 text-xs text-slate-500">El contenido extraído requiere revisión humana. No implica aprobación comercial ni técnica.</p>',`{q.data?.extraction?.catalogSuggestions?.some((s:any)=>s.matches?.length>0)&&<div className="mt-4 rounded border border-teal-200 bg-teal-50 p-3 text-sm"><h4 className="mb-2 font-semibold">Coincidencias exactas del maestro Worknet (solo sugerencias)</h4>{q.data.extraction.catalogSuggestions.filter((s:any)=>s.matches?.length).map((s:any)=><div className="mb-2" key={s.line}><strong>Línea {s.line}:</strong> {s.inputDescription||s.inputSku}<ul className="mt-1 list-disc pl-5">{s.matches.map((m:any)=><li key={m.code}>{m.code} · {m.description} · {m.market||'Sin mercado'} ({m.matchType==='exact_code'?'Código exacto':'Descripción exacta'})</li>)}</ul></div>)}<p className="text-xs text-amber-900">Confirmá código, presentación y mercado. Esto no confirma ficha técnica Loyal.</p></div>}
<p className="mt-3 text-xs text-slate-500">El contenido extraído requiere revisión humana. No implica aprobación comercial ni técnica.</p>`],
 ]],
]);
const updated=new Map();
for(const [relative,rules] of edits){const file=path.join(root,relative);if(!existsSync(file))throw Error(`Falta ${relative}`);let src=readFileSync(file,'utf8');for(const [before,after] of rules){if(src.includes(after))continue;const hits=src.split(before).length-1;if(hits!==1)throw Error(`Marcador inválido (${hits}) en ${relative}: ${before.slice(0,85)}`);src=src.replace(before,after)}updated.set(file,src)}
for(const [f,src] of updated)writeFileSync(f,src,'utf8');
console.log('OK: maestro de productos agregado sin sobrescribir módulos existentes. Ejecutar npm run build.');
