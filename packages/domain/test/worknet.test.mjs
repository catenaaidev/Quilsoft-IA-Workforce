import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKNET_HEADERS, learnFromHistory, buildWorknetDraft, validateWorknetRows, worknetCsvText, parseWorknetCsv,
  depositFromOrderNumber, isoToDmy, sniffMime,
} from '../dist/index.js';

// Copia ANONIMIZADA del CSV real cargado en Worknet (mismo formato: 22 columnas, ";",
// coma decimal, DD/MM/AAAA, columna 10 sin encabezado). Cliente y precios alterados.
const H = WORKNET_HEADERS.join(';');
const HIST = [
  H,
  'TEST001P-1VF;10/11/2026;10/11/2026;15/12/2026;999001EXP;511;45;43;10;CAT ALT MB ;2191-23-407;77;140;89,25;10;1;2;1;FOB;140;1X40\' ARMAR 17 PALLETS;',
  'TEST001P-1VF;10/11/2026;10/11/2026;15/12/2026;999001EXP;511;45;43;10;CLASS MB ;285-24-407;77;420;76,4;10;6;2;1;FOB;70;1X40\' ARMAR 17 PALLETS;',
  'TEST001P-1J;10/11/2026;10/11/2026;15/12/2026;999001EXP;511;45;43;10;TILIA CH ;1575-26-407 ;15;70;40;10;1;2;1;FOB;70;1X40\' ARMAR 1 PALLETS;',
].join('\r\n') + '\r\n';

test('encabezados oficiales: 22 columnas, la 10ª vacía', () => {
  assert.equal(WORKNET_HEADERS.length, 22);
  assert.equal(WORKNET_HEADERS[9], '');
  assert.equal(WORKNET_HEADERS[10], 'Codigo de producto');
});

test('lee el CSV histórico y aprende perfil de cliente y producto', () => {
  const rows = parseWorknetCsv(HIST);
  const { clients, products } = learnFromHistory(rows);
  const c = clients.get('999001EXP');
  assert.deepEqual(
    { d: c.destination, cond: c.conditionCode, lista: c.priceListCode, desc: c.orderDiscount, cont: c.container, pal: c.palletType, inc: c.incoterm, dias: c.reqLoadDays },
    { d: '511', cond: '45', lista: '43', desc: '10', cont: '2', pal: '1', inc: 'FOB', dias: 35 },
  );
  assert.deepEqual(products.get('285-24-407'), { sku: '285-24-407', shortName: 'CLASS MB', boxesPerPallet: 70 });
  assert.equal(products.get('1575-26-407').boxesPerPallet, 70);
});

test('reproduce las filas del CSV oficial a partir de la OC + historial (sin IA)', () => {
  const rows = parseWorknetCsv(HIST);
  const { clients, products } = learnFromHistory(rows);
  const draft = buildWorknetDraft({
    orderNumber: 'TEST001P-1VF', receivedAt: '2026-11-10T12:00:00Z', issuedAt: '2026-11-10', observations: "1X40' ARMAR 17 PALLETS",
    client: clients.get('999001EXP'),
    lines: [
      { sku: '2191-23-407', quantity: 140, unitPrice: 89.25, product: products.get('2191-23-407') },
      { sku: '285-24-407', quantity: 420, unitPrice: 76.4, product: products.get('285-24-407') },
    ],
  });
  assert.deepEqual(draft.missing, []);
  const norm = (r) => r.map((x) => x.trim());
  assert.deepEqual(norm(draft.rows[0]), norm(rows[0]));
  assert.deepEqual(norm(draft.rows[1]), norm(rows[1]));
  assert.equal(draft.origins[0][3], 'regla'); // Fecha Req. Carga = PO + 35 días del historial
  assert.deepEqual(validateWorknetRows(draft.rows), []);
});

test('sin fuente oficial los campos quedan pendientes (no se inventan)', () => {
  const draft = buildWorknetDraft({ orderNumber: 'OC-SIN-SUFIJO', receivedAt: null, issuedAt: '2026-11-10', client: null, lines: [{ sku: 'X-1', quantity: 10, unitPrice: null, product: null }] });
  const faltan = draft.missing.map((m) => m.column);
  for (const col of ['Cod. Cliente', 'Destino', 'Cod. Lista de Precio', 'Precio unit(USD)', 'Cajas x Pallet', 'Cantidad de Pallet', 'Fecha Req. Carga', 'Deposito (VF / Junin) = Cod. Deposito Detalle', 'Incoterm']) {
    assert.ok(faltan.includes(col), `debería faltar ${col}`);
  }
  assert.ok(validateWorknetRows(draft.rows).length > 0);
});

test('texto CSV: ";" + CRLF + sin BOM, y se vuelve a leer igual', () => {
  const rows = parseWorknetCsv(HIST);
  const texto = worknetCsvText(rows);
  assert.notEqual(texto.charCodeAt(0), 0xfeff);
  assert.ok(texto.endsWith('\r\n'));
  assert.deepEqual(parseWorknetCsv(texto), rows);
  assert.throws(() => parseWorknetCsv('a;b\r\n1;2\r\n'), /22 columnas/);
});

test('reglas auxiliares: depósito por sufijo, fechas y tipo de archivo por contenido', () => {
  assert.equal(depositFromOrderNumber('MD5AR265922P-0779469VF'), '77');
  assert.equal(depositFromOrderNumber('MD5AR265922P-0779469J'), '15');
  assert.equal(depositFromOrderNumber('PO 4471'), null);
  assert.equal(isoToDmy('2026-02-30'), null);
  assert.equal(isoToDmy('2026-11-10'), '10/11/2026');
  const pdf = new TextEncoder().encode('%PDF-1.7 x').buffer;
  assert.equal(sniffMime(pdf, 'orden.bin'), 'application/pdf');
  const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]).buffer;
  assert.equal(sniffMime(xls, 'pedido.xls'), 'application/vnd.ms-excel');
  assert.equal(sniffMime(new Uint8Array([0x4d, 0x5a, 0]).buffer, 'factura.pdf'), null);
});
