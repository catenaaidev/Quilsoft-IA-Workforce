import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const read=p=>fs.existsSync(path.join(root,p))?fs.readFileSync(path.join(root,p),'utf8'):'';
const pages=read('apps/web/src/pages.tsx');
const api=read('apps/api/src/app.ts');
const processing=read('apps/api/src/processing.ts');
const wrangler=read('apps/api/wrangler.jsonc');
const tests=[
 ['Panel operativo de agentes',pages.includes('ExpoAgentReadiness')],
 ['Vista de ordenes',pages.includes('export function OrderDetail')],
 ['Integraciones visibles',pages.includes('export function Integrations')],
 ['Borrador CSV disponible',fs.existsSync(path.join(root,'apps/api/src/csv-draft.ts'))],
 ['Vista previa CSV disponible',fs.existsSync(path.join(root,'apps/web/src/csv-draft-preview.tsx'))],
 ['Simulador Loyal disponible',fs.existsSync(path.join(root,'apps/web/src/loyal-simulator.tsx'))],
 ['Procesamiento automatico',processing.includes('buildDraftCsv')],
 ['Bloqueo por validacion / control',api.includes('/approve')&&api.includes('/csv')],
 ['Cloudflare D1 configurado',wrangler.includes('d1_databases')],
 ['Cloudflare R2 configurado',wrangler.includes('r2_buckets')],
 ['Cloudflare cola configurada',wrangler.includes('"queues"')],
 ['Cloudflare IA configurada',wrangler.includes('"ai"')],
 ['SSO BESA configurado',wrangler.includes('besa-identidad-central')],
 ];
let pass=0;for(const [name,ok] of tests){console.log((ok?'OK   ':'FALTA')+' '+name);pass+=Number(ok)}
console.log(`\nArchivos y patrones: ${pass}/${tests.length}. NO es una prueba funcional end-to-end.`);
if(pass!==tests.length)process.exitCode=1;
