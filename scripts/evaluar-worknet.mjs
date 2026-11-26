// Uso: node scripts/evaluar-worknet.mjs "<carpeta con CSV Worknet hechos a mano>" packages/domain/dist
// Evaluación "deja uno afuera": por cada CSV real, aprende el historial con los otros 14,
// rearma cada OC solo con lo que trae una orden (número, fechas, código, cantidad, precio,
// observaciones) y compara columna por columna con lo hecho a mano.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [dir, domainDist] = process.argv.slice(2);
const D = await import(pathToFileURL(join(domainDist, 'index.js')).href);
const { parseWorknetCsv, learnFromHistory, buildWorknetDraft, worknetCsvText, COL, WORKNET_HEADERS, parseDmy } = D;

const archivos = readdirSync(dir).filter((f) => f.endsWith('.csv'));
const datos = Object.fromEntries(archivos.map((f) => [f, parseWorknetCsv(readFileSync(join(dir, f), 'latin1'))]));
console.log('Archivos leídos:', archivos.length, '| filas:', Object.values(datos).reduce((n, r) => n + r.length, 0));

const toIso = (dmy) => { const d = parseDmy(dmy || ''); return d ? d.toISOString().slice(0, 10) : null; };
const num = (s) => (s && s.trim() ? Number(s.replace(',', '.')) : null);
const aciertos = Object.fromEntries(WORKNET_HEADERS.map((h, i) => [i, { ok: 0, pend: 0, total: 0, mal: [] }]));
let filasIguales = 0, filasTotal = 0, malTotal = 0;

for (const f of archivos) {
  const historial = archivos.filter((x) => x !== f).flatMap((x) => datos[x]);
  const { clients, products } = learnFromHistory(historial);
  const porOc = new Map();
  for (const r of datos[f]) porOc.set(r[COL.oc], [...(porOc.get(r[COL.oc]) ?? []), r]);
  for (const [oc, filas] of porOc) {
    const r0 = filas[0];
    const draft = buildWorknetDraft({
      orderNumber: oc, receivedAt: toIso(r0[COL.fechaPI]), issuedAt: toIso(r0[COL.fechaPO]), observations: null,
      client: clients.get(r0[COL.codCliente]) ?? null,
      lines: filas.map((r) => ({ sku: r[COL.producto], quantity: num(r[COL.cajas]), unitPrice: num(r[COL.precio]), product: products.get(r[COL.producto]) ?? null })),
    });
    draft.rows.forEach((gen, i) => {
      const man = filas[i];
      filasTotal++;
      let igual = true;
      for (let c = 0; c < 22; c++) {
        if (c === 9 || c === 20 || c === 21) continue; // nombre del producto (opcional) y obs. ampliada
        const a = aciertos[c]; a.total++;
        const norm = (v) => { const t = String(v ?? '').trim(); return /^\d+$/.test(t) ? String(Number(t)) : t; };
        if (norm(gen[c]) === norm(man[c])) a.ok++; else if (draft.origins[i][c] === 'pendiente') { a.pend++; igual = false; } else { igual = false; if (a.mal.length < 4) a.mal.push(`${f}: "${norm(gen[c])}" vs a mano "${norm(man[c])}"`); }
      }
      if (igual) filasIguales++;
    });
  }
}
console.log(`\nFilas idénticas a la hecha a mano: ${filasIguales}/${filasTotal}\n`);
for (const [c, a] of Object.entries(aciertos)) {
  if (!a.total) continue;
  const p = (n) => String(Math.round((100 * n) / a.total)).padStart(3) + '%'; const malos = a.total - a.ok - a.pend;
  console.log(`${p(a.ok)} bien  ${p(a.pend)} pendiente  ${p(malos)} MAL   ${WORKNET_HEADERS[c]}`);
  for (const m of a.mal) console.log('        ', m);
}
// Formato de salida
const txt = worknetCsvText(datos[archivos[0]]);
console.log('\nSalida: columnas del encabezado =', txt.split('\r\n')[0].split(';').length, '| CRLF =', txt.includes('\r\n'), '| BOM =', txt.charCodeAt(0) === 0xfeff);
