/**
 * CSV Worknet — código determinístico, sin IA.
 *
 * Formato tomado de 15 CSV reales hechos a mano (nov. 2026): separador ";", decimales
 * con coma, fechas D/M/AAAA sin ceros a la izquierda, fin de línea CRLF, sin BOM.
 * Aparecen tres variantes: 21 columnas (la mayoría) y 22 con una columna extra de nombre
 * del producto en la posición 10 (encabezado vacío o "Producto").
 * Internamente se trabaja siempre con 22 columnas (la 10ª = nombre del producto, útil para
 * revisar); el archivo para Worknet se genera con las 21 columnas de la variante mayoritaria.
 *
 * Los datos fijos del cliente (destino, condición, lista, descuento, contenedor,
 * tipo de pallet, incoterm) y los datos por producto (abreviatura, cajas por pallet)
 * se toman SOLO de CSV históricos oficiales. Si no hay fuente, el campo queda
 * pendiente: nunca se inventa.
 */
import { csvEscape } from './index.js';

export const WORKNET_HEADERS = [
  'OC', 'Fecha PI', 'Fecha PO', 'Fecha Req. Carga', 'Cod. Cliente', 'Destino', 'Cod. Condicion', 'Cod. Lista de Precio',
  'Desc. A Nivel Pedido (S / N) ?', '', 'Codigo de producto', 'Deposito (VF / Junin) = Cod. Deposito Detalle', 'Cantidad de cajas',
  'Precio unit(USD)', '% Desc.', 'Cantidad de Pallet', 'Contenedor', 'Tipo de Pallet', 'Incoterm', 'Cajas x Pallet', 'Observaciones',
  'Observaciones Ampliada',
] as const;

/** Variante mayoritaria de los CSV reales: sin la columna de nombre del producto. */
export const WORKNET_HEADERS_OFICIAL: readonly string[] = WORKNET_HEADERS.filter((_, i) => i !== 9);

export type WorknetLayout = 'w21' | 'w22';
/** Detecta la variante por los encabezados; null si no es un CSV Worknet. */
export function worknetLayout(row: readonly string[]): WorknetLayout | null {
  const h = row.map((x) => x.trim());
  if (h.length === 21 && h.every((x, i) => x === WORKNET_HEADERS_OFICIAL[i])) return 'w21';
  if (h.length === 22 && ['', 'Producto'].includes(h[9]) && h.every((x, i) => i === 9 || x === WORKNET_HEADERS[i])) return 'w22';
  return null;
}
/** Lleva una fila de cualquier variante a las 22 columnas internas. */
export function toCanonicalRow(row: readonly string[], layout: WorknetLayout): string[] {
  return layout === 'w21' ? [...row.slice(0, 9), '', ...row.slice(9)] : [...row];
}

export const COL = {
  oc: 0, fechaPI: 1, fechaPO: 2, fechaReq: 3, codCliente: 4, destino: 5, condicion: 6, lista: 7, descPedido: 8, abreviatura: 9,
  producto: 10, deposito: 11, cajas: 12, precio: 13, descPct: 14, pallets: 15, contenedor: 16, tipoPallet: 17, incoterm: 18,
  cajasPallet: 19, observaciones: 20, obsAmpliada: 21,
} as const;

/**
 * Columnas que nunca aparecen vacías en los CSV reales. Fecha PI y Fecha Req. Carga
 * figuran vacías en CSV que sí se cargaron (Shinsegae), así que no se exigen.
 */
export const WORKNET_REQUIRED = [0, 2, 4, 5, 6, 7, 10, 11, 12, 13, 15, 16, 17, 18, 19] as const;

export type Origen = 'oc' | 'historial' | 'regla' | 'persona' | 'pendiente';

/**
 * Datos fijos del cliente aprendidos del historial. Un campo es null cuando el historial
 * no es unánime (p. ej. el cliente despacha a varios destinos): queda para que una persona
 * elija entre `candidates`, nunca se completa con "el más frecuente".
 */
export interface ClientProfile {
  clientCode: string;
  destination: string | null;
  conditionCode: string | null;
  /** Moda (se usa para vincular el cliente con su lista de precios, no para completar). */
  priceListCode: string;
  orderDiscount: string | null;
  lineDiscount: string | null;
  container: string | null;
  palletType: string | null;
  incoterm: string | null;
  deposit: string | null;
  candidates: Partial<Record<'destination' | 'conditionCode' | 'orderDiscount' | 'lineDiscount' | 'container' | 'palletType' | 'incoterm' | 'deposit', string[]>>;
  samples: number;
}

export interface ProductProfile {
  sku: string;
  shortName: string;
  /** Unánime en el historial del producto; null si varía. */
  boxesPerPallet: number | null;
  /** Cajas por pallet observadas para cada cliente (unánimes por cliente). */
  boxesPerPalletByClient?: Record<string, number>;
}

const mode = (values: string[]): string => {
  const c = new Map<string, number>();
  for (const v of values.map((x) => x.trim()).filter(Boolean)) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};
/** Valores distintos (sin vacíos). Los códigos numéricos se comparan sin ceros a la izquierda ("002" = "2"). */
const distintos = (values: string[]): string[] => {
  const vistos = new Map<string, string>();
  for (const v of values.map((x) => x.trim()).filter(Boolean)) {
    const k = /^\d+$/.test(v) ? String(Number(v)) : v;
    if (!vistos.has(k)) vistos.set(k, v);
  }
  return [...vistos.values()];
};
/** Mínimo de órdenes distintas que deben coincidir para completar un dato desde el historial. */
export const MIN_ORDENES_COINCIDENTES = 2;
/**
 * El valor solo si es unánime en al menos MIN_ORDENES_COINCIDENTES órdenes distintas; si no, null.
 * Con una sola orden previa no hay evidencia de que el dato sea fijo (en las pruebas con CSV
 * reales, destino, contenedor e incoterm cambiaban entre la 1ª y la 2ª orden del cliente).
 */
const unanimeEn = (rs: string[][], col: number): string | null => {
  const values = rs.map((r) => r[col]);
  const ordenes = new Set(rs.filter((r) => r[col]?.trim()).map((r) => r[COL.oc].trim()));
  return distintos(values).length === 1 && ordenes.size >= MIN_ORDENES_COINCIDENTES ? mode(values) : null;
};

export function parseDmy(v: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCDate() === +m[1] ? d : null;
}

export function formatDmy(d: Date): string {
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

/** Fecha ISO (AAAA-MM-DD) → D/M/AAAA (como en los CSV hechos a mano), o null si no es válida. */
export function isoToDmy(v: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCDate() === +m[3] ? formatDmy(d) : null;
}

export const decimalComma = (n: number): string => String(Math.round(n * 10000) / 10000).replace('.', ',');

/** Valida que unos encabezados correspondan a alguna variante de CSV Worknet. */
export function isWorknetHeader(row: readonly string[]): boolean {
  return worknetLayout(row) !== null;
}

/** Aprende el perfil fijo de cada cliente y de cada producto desde CSV históricos oficiales. */
export function learnFromHistory(rows: string[][]): { clients: Map<string, ClientProfile>; products: Map<string, ProductProfile> } {
  const porCliente = new Map<string, string[][]>();
  for (const r of rows) {
    if (r.length !== 22 || !r[COL.codCliente]?.trim()) continue;
    const k = r[COL.codCliente].trim();
    porCliente.set(k, [...(porCliente.get(k) ?? []), r]);
  }
  const clients = new Map<string, ClientProfile>();
  const campos = { destination: COL.destino, conditionCode: COL.condicion, orderDiscount: COL.descPedido, lineDiscount: COL.descPct, container: COL.contenedor, palletType: COL.tipoPallet, incoterm: COL.incoterm, deposit: COL.deposito } as const;
  for (const [code, rs] of porCliente) {
    const perfil: ClientProfile = {
      clientCode: code, destination: null, conditionCode: null, priceListCode: mode(rs.map((r) => r[COL.lista])), orderDiscount: null,
      lineDiscount: null, container: null, palletType: null, incoterm: null, deposit: null, candidates: {}, samples: rs.length,
    };
    for (const [campo, col] of Object.entries(campos) as [keyof typeof campos, number][]) {
      perfil[campo] = unanimeEn(rs, col);
      if (perfil[campo] === null) perfil.candidates[campo] = distintos(rs.map((r) => r[col]));
    }
    clients.set(code, perfil);
  }
  const products = new Map<string, ProductProfile>();
  const porSku = new Map<string, string[][]>();
  for (const r of rows) {
    const sku = r[COL.producto]?.trim();
    if (r.length === 22 && sku) porSku.set(sku, [...(porSku.get(sku) ?? []), r]);
  }
  const entero = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);
  for (const [sku, rs] of porSku) {
    const porCli: Record<string, number> = {};
    for (const cli of new Set(rs.map((r) => r[COL.codCliente].trim()))) {
      const n = entero(unanimeEn(rs.filter((r) => r[COL.codCliente].trim() === cli), COL.cajasPallet));
      if (n !== null) porCli[cli] = n;
    }
    products.set(sku, { sku, shortName: mode(rs.map((r) => r[COL.abreviatura])), boxesPerPallet: entero(unanimeEn(rs, COL.cajasPallet)), boxesPerPalletByClient: porCli });
  }
  return { clients, products };
}

/** "...VF" → depósito 77 (Vista Flores); "...J" → 15 (Junín). Regla observada en el CSV oficial. */
export function depositFromOrderNumber(orderNumber: string | null | undefined): string | null {
  const v = String(orderNumber ?? '').trim().toUpperCase();
  if (/VF$/.test(v)) return '77';
  if (/(JU|J)$/.test(v)) return '15'; // en los CSV reales: "...JU" / "...ju" → 15
  return null;
}

export interface DraftInput {
  orderNumber: string | null;
  receivedAt: string | null; // ISO
  issuedAt: string | null; // ISO (fecha de la OC)
  requestedLoadAt?: string | null; // ISO, si la OC o una persona la indica
  observations?: string | null;
  client: ClientProfile | null;
  lines: { sku: string; quantity: number | null; unitPrice: number | null; product: ProductProfile | null }[];
}

export interface WorknetDraft {
  headers: readonly string[];
  rows: string[][];
  origins: Origen[][];
  missing: { line: number; column: string }[];
}

/** Arma el borrador Worknet. Cada celda informa su origen; las vacías obligatorias quedan como pendientes. */
export function buildWorknetDraft(input: DraftInput): WorknetDraft {
  const rows: string[][] = [];
  const origins: Origen[][] = [];
  const missing: WorknetDraft['missing'] = [];
  const pi = isoToDmy(input.receivedAt) ?? isoToDmy(input.issuedAt);
  const po = isoToDmy(input.issuedAt);
  // La fecha de carga varía por orden (sale de la fecha de despacho de la OC): no se calcula por regla.
  const req = isoToDmy(input.requestedLoadAt ?? null);
  const reqOrigin: Origen = req ? 'oc' : 'pendiente';
  const c = input.client;
  const depSufijo = depositFromOrderNumber(input.orderNumber);
  const deposit = depSufijo ?? c?.deposit ?? null;
  const depOrigin: Origen = depSufijo ? 'regla' : 'historial';
  for (const [i, l] of input.lines.entries()) {
    const cxp = (c && l.product?.boxesPerPalletByClient?.[c.clientCode]) ?? l.product?.boxesPerPallet ?? null;
    const pallets = l.quantity !== null && l.quantity > 0 && cxp ? Math.ceil(l.quantity / cxp) : null;
    const celdas: [string | null, Origen][] = [
      [input.orderNumber?.trim() || null, 'oc'], [pi, 'oc'], [po, 'oc'], [req, reqOrigin],
      [c?.clientCode || null, 'historial'], [c?.destination || null, 'historial'], [c?.conditionCode || null, 'historial'],
      [c?.priceListCode || null, 'historial'], [c?.orderDiscount ?? null, 'historial'], [l.product?.shortName || null, 'historial'],
      [l.sku?.trim() || null, 'oc'], [deposit, depOrigin], [l.quantity !== null && l.quantity > 0 ? String(l.quantity) : null, 'oc'],
      [l.unitPrice !== null && l.unitPrice >= 0 ? decimalComma(l.unitPrice) : null, 'oc'], [c?.lineDiscount ?? null, 'historial'],
      [pallets !== null ? String(pallets) : null, 'regla'], [c?.container || null, 'historial'], [c?.palletType || null, 'historial'],
      [c?.incoterm || null, 'historial'], [cxp !== null ? String(cxp) : null, 'historial'], [input.observations?.trim() || null, 'oc'],
      ['', 'oc'],
    ];
    rows.push(celdas.map(([v]) => v ?? ''));
    origins.push(celdas.map(([v, o]) => (v === null ? 'pendiente' : o)));
    for (const col of WORKNET_REQUIRED) {
      if (celdas[col][0] === null || celdas[col][0] === '') missing.push({ line: i + 1, column: WORKNET_HEADERS[col] || `Columna ${col + 1}` });
    }
  }
  return { headers: WORKNET_HEADERS, rows, origins, missing };
}

/** Errores de formato que impiden generar el CSV oficial. */
export function validateWorknetRows(rows: string[][]): string[] {
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const n = i + 1;
    if (r.length !== 22) errors.push(`Línea ${n}: tiene ${r.length} columnas (deben ser 22)`);
    for (const col of WORKNET_REQUIRED) if (!String(r[col] ?? '').trim()) errors.push(`Línea ${n}: falta ${WORKNET_HEADERS[col] || 'columna ' + (col + 1)}`);
    for (const col of [COL.fechaPI, COL.fechaPO, COL.fechaReq]) if (r[col] && !parseDmy(r[col])) errors.push(`Línea ${n}: fecha inválida en ${WORKNET_HEADERS[col]}`);
    for (const col of [COL.cajas, COL.pallets, COL.cajasPallet]) if (r[col] && !/^\d+$/.test(r[col].trim())) errors.push(`Línea ${n}: ${WORKNET_HEADERS[col]} debe ser un entero`);
    for (const col of [COL.precio, COL.descPct, COL.descPedido]) if (r[col] && !/^\d+(,\d+)?$/.test(r[col].trim())) errors.push(`Línea ${n}: formato decimal inválido en ${WORKNET_HEADERS[col]}`);
  });
  return errors;
}

/** Texto CSV para Worknet: 21 columnas (variante mayoritaria), ";", CRLF, sin BOM. Recibe filas internas de 22. */
export function worknetCsvText(rows: string[][]): string {
  const salida = rows.map((r) => r.filter((_, i) => i !== 9));
  return [WORKNET_HEADERS_OFICIAL, ...salida].map((r) => r.map((v) => csvEscape(v, ';')).join(';')).join('\r\n') + '\r\n';
}

/** Lee un CSV Worknet (para importar historial o leer una OC que ya viene en ese formato, sin IA). */
export function parseWorknetCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let quoted = false, cell = '', row: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { if (quoted && s[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (ch === ';' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); if (row.some((x) => x !== '')) rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (quoted) throw new Error('CSV: comillas sin cerrar');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const layout = rows.length ? worknetLayout(rows[0]) : null;
  if (!layout) throw new Error('Los encabezados no coinciden con el formato Worknet (21 o 22 columnas)');
  const n = layout === 'w21' ? 21 : 22;
  const datos = rows.slice(1);
  if (datos.some((r) => r.length !== n)) throw new Error(`Hay líneas que no tienen ${n} columnas`);
  return datos.map((r) => toCanonicalRow(r, layout));
}
