import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKNET_HEADERS, WORKNET_HEADERS_OFICIAL, learnFromHistory, buildWorknetDraft, validateWorknetRows, worknetCsvText, parseWorknetCsv,
  depositFromOrderNumber, isoToDmy, sniffMime, worknetLayout,
} from '../dist/index.js';

// Copias ANONIMIZADAS con el formato de los CSV reales hechos a mano (";", coma decimal,
// fechas D/M/AAAA sin ceros, CRLF). Variante de 22 columnas (con nombre de producto)…
const H22 = WORKNET_HEADERS.join(';');
const HIST22 = [
  H22,
  'TEST001P-1VF;10/11/2026;10/11/2026;15/12/2026;999001EXP;511;45;43;10;CAT ALT MB ;2191-23-407;77;140;89,25;10;1;002;001;FOB;140;1X40\' ARMAR 17 PALLETS;',
  'TEST001P-1VF;10/11/2026;10/11/2026;15/12/2026;999001EXP;511;45;43;10;CLASS MB ;285-24-407;77;420;76,4;10;6;002;001;FOB;70;1X40\' ARMAR 17 PALLETS;',
  'TEST001P-1J;10/11/2026;10/11/2026;15/12/2026;999001EXP;511;45;43;10;TILIA CH ;1575-26-407 ;15;70;40;10;1;002;001;FOB;70;1X40\' ARMAR 1 PALLETS;',
].join('\r\n') + '\r\n';
// …y variante mayoritaria de 21 columnas (sin nombre de producto), otra orden del mismo cliente.
const H21 = WORKNET_HEADERS_OFICIAL.join(';');
const HIST21 = [
  H21,
  'TEST000P-1VF;1/9/2026;1/9/2026;8/10/2026;999001EXP;511;45;43;10;285-24-407;77;140;76,4;10;2;2;1;FOB;70;ARMAR 2 PALLETS;',
  // Un segundo cliente con una sola orden y dos destinos distintos.
  '4500000001;3/9/2026;3/9/2026;;999002EXP;250;E17;167;0;5970-25-002;77;1575;24,42;0;21;002;005;FCA;75;;',
  '4500000002;3/9/2026;3/9/2026;;999002EXP;263;E17;167;0;5970-25-002;77;1425;24,42;0;19;002;005;FCA;75;;',
].join('\r\n') + '\r\n';
const historial = () => [...parseWorknetCsv(HIST22), ...parseWorknetCsv(HIST21)];

test('encabezados: variante interna de 22 y variante oficial de 21 columnas', () => {
  assert.equal(WORKNET_HEADERS.length, 22);
  assert.equal(WORKNET_HEADERS_OFICIAL.length, 21);
  assert.equal(WORKNET_HEADERS_OFICIAL[9], 'Codigo de producto');
  assert.equal(worknetLayout(H21.split(';')), 'w21');
  assert.equal(worknetLayout(H22.split(';')), 'w22');
  assert.equal(worknetLayout(H22.replace(';;', ';Producto;').split(';')), 'w22'); // variante Shinsegae
  assert.equal(worknetLayout(['OC', 'Fecha']), null);
});

test('lee las variantes de 21 y 22 columnas y las lleva a 22 internas', () => {
  const r21 = parseWorknetCsv(HIST21);
  assert.equal(r21[0].length, 22);
  assert.equal(r21[0][9], '');
  assert.equal(r21[0][10], '285-24-407');
  assert.throws(() => parseWorknetCsv('a;b\r\n1;2\r\n'), /21 o 22 columnas/);
});

test('aprende un dato del cliente solo si coinciden al menos 2 órdenes distintas', () => {
  const { clients, products } = learnFromHistory(historial());
  const c = clients.get('999001EXP'); // 3 órdenes que coinciden
  assert.deepEqual(
    { d: c.destination, cond: c.conditionCode, lista: c.priceListCode, desc: c.orderDiscount, cont: c.container, pal: c.palletType, inc: c.incoterm },
    { d: '511', cond: '45', lista: '43', desc: '10', cont: '002', pal: '001', inc: 'FOB' },
  );
  // "2" y "002" son el mismo código; el depósito varía (77 / 15) → no se fija por cliente.
  assert.equal(c.deposit, null);
  assert.deepEqual(c.candidates.deposit, ['77', '15']);
  // Cliente con destinos distintos: queda pendiente con candidatos, no "el más frecuente".
  const c2 = clients.get('999002EXP');
  assert.equal(c2.destination, null);
  assert.deepEqual(c2.candidates.destination, ['250', '263']);
  assert.equal(products.get('285-24-407').boxesPerPallet, 70);
  assert.equal(products.get('285-24-407').boxesPerPalletByClient['999001EXP'], 70);
  assert.equal(products.get('2191-23-407').boxesPerPallet, null); // una sola orden: sin evidencia
});

test('reproduce la fila hecha a mano a partir de la OC + historial (sin IA)', () => {
  const { clients, products } = learnFromHistory(historial());
  const draft = buildWorknetDraft({
    orderNumber: 'TEST002P-1VF', receivedAt: '2026-11-10T12:00:00Z', issuedAt: '2026-11-10', requestedLoadAt: '2026-12-15', observations: "1X40' ARMAR 6 PALLETS",
    client: clients.get('999001EXP'),
    lines: [{ sku: '285-24-407', quantity: 420, unitPrice: 76.4, product: products.get('285-24-407') }],
  });
  assert.deepEqual(draft.missing, []);
  assert.deepEqual(draft.rows[0].map((x) => x.trim()),
    ['TEST002P-1VF', '10/11/2026', '10/11/2026', '15/12/2026', '999001EXP', '511', '45', '43', '10', 'CLASS MB', '285-24-407', '77', '420', '76,4', '10', '6', '002', '001', 'FOB', '70', "1X40' ARMAR 6 PALLETS", '']);
  assert.equal(draft.origins[0][11], 'regla'); // depósito por sufijo VF
  assert.deepEqual(validateWorknetRows(draft.rows), []);
});

test('sin fuente oficial o con historial ambiguo los campos quedan pendientes (no se inventan)', () => {
  const draft = buildWorknetDraft({ orderNumber: 'OC-SIN-SUFIJO', receivedAt: null, issuedAt: '2026-11-10', client: null, lines: [{ sku: 'X-1', quantity: 10, unitPrice: null, product: null }] });
  const faltan = draft.missing.map((m) => m.column);
  for (const col of ['Cod. Cliente', 'Destino', 'Cod. Lista de Precio', 'Precio unit(USD)', 'Cajas x Pallet', 'Cantidad de Pallet', 'Deposito (VF / Junin) = Cod. Deposito Detalle', 'Incoterm']) {
    assert.ok(faltan.includes(col), `debería faltar ${col}`);
  }
  assert.equal(draft.origins[0][3], 'pendiente'); // la fecha de carga no se calcula por regla
  assert.ok(validateWorknetRows(draft.rows).length > 0);
  const { clients } = learnFromHistory(historial());
  const amb = buildWorknetDraft({ orderNumber: '4500000003', receivedAt: null, issuedAt: '2026-11-10', client: clients.get('999002EXP'), lines: [{ sku: '5970-25-002', quantity: 75, unitPrice: 24.42, product: null }] });
  assert.ok(amb.missing.some((m) => m.column === 'Destino'));
});

test('archivo para Worknet: 21 columnas, ";", CRLF, sin BOM, fechas sin ceros; se vuelve a leer igual', () => {
  const rows = parseWorknetCsv(HIST22);
  const texto = worknetCsvText(rows);
  const lineas = texto.split('\r\n');
  assert.notEqual(texto.charCodeAt(0), 0xfeff);
  assert.ok(texto.endsWith('\r\n'));
  assert.equal(lineas[0], H21);
  assert.equal(lineas[1].split(';').length, 21);
  // Al releerlo se pierde solo el nombre del producto (columna opcional).
  assert.deepEqual(parseWorknetCsv(texto), rows.map((r) => [...r.slice(0, 9), '', ...r.slice(10)]));
});

test('reglas auxiliares: depósito por sufijo, fechas y tipo de archivo por contenido', () => {
  assert.equal(depositFromOrderNumber('MD5AR265922P-0779469VF'), '77');
  assert.equal(depositFromOrderNumber('MD5AR265922P-0779469J'), '15');
  assert.equal(depositFromOrderNumber('2675JU'), '15');
  assert.equal(depositFromOrderNumber('MD3AR266037P-0780330ju'), '15');
  assert.equal(depositFromOrderNumber('MD3AR266037P-0780330vf'), '77');
  assert.equal(depositFromOrderNumber('PO 4471'), null);
  assert.equal(isoToDmy('2026-02-30'), null);
  assert.equal(isoToDmy('2026-08-07'), '7/8/2026');
  const pdf = new TextEncoder().encode('%PDF-1.7 x').buffer;
  assert.equal(sniffMime(pdf, 'orden.bin'), 'application/pdf');
  const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]).buffer;
  assert.equal(sniffMime(xls, 'pedido.xls'), 'application/vnd.ms-excel');
  assert.equal(sniffMime(new Uint8Array([0x4d, 0x5a, 0]).buffer, 'factura.pdf'), null);
});
