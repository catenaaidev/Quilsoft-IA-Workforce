// Genera el SQL para cargar CSV Worknet hechos a mano como historial ("Fuentes comerciales"),
// con los mismos identificadores que el botón "Cargar CSV Worknet históricos" (no se duplican).
// Uso: node scripts/historial-worknet-sql.mjs "<carpeta con CSV>" > historial.sql
//      npx wrangler d1 execute ia-workforce-catena-db --remote --file historial.sql
// El SQL contiene datos comerciales: no subirlo al repositorio.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = process.argv[2];
if (!dir) { console.error('Uso: node scripts/historial-worknet-sql.mjs "<carpeta con CSV>"'); process.exit(1); }
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const { parseWorknetCsv, WORKNET_HEADERS } = await import(pathToFileURL(join(raiz, 'packages/domain/dist/index.js')).href);

const decodificar = (b) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return Buffer.from(b).toString('latin1'); } };
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const ahora = new Date().toISOString();
const salida = [];
for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.csv')).sort()) {
  const bytes = readFileSync(join(dir, f));
  let filas;
  try { filas = parseWorknetCsv(decodificar(bytes)).filter((r) => r.some((v) => v.trim())); }
  catch (e) { console.error(`OMITIDO ${f}: ${e.message}`); continue; }
  const id = `worknet-${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}`;
  salida.push(`INSERT OR IGNORE INTO workforce_import_sources(id,filename,kind,sheet_name,headers_json,imported_at) VALUES (${q(id)},${q(f)},'csv','Worknet',${q(JSON.stringify(WORKNET_HEADERS))},${q(ahora)});`);
  filas.forEach((r, i) => salida.push(`INSERT OR IGNORE INTO workforce_import_rows(source_id,row_number,values_json) VALUES (${q(id)},${i + 2},${q(JSON.stringify(r))});`));
  console.error(`${f}: ${filas.length} filas`);
}
console.log(salida.join('\n'));
