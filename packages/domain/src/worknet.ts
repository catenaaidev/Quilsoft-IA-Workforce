/**
 * CSV Worknet (22 columnas) — código determinístico, sin IA.
 *
 * Formato tomado del CSV real cargado manualmente en Worknet (WINEBOW_11-11.csv,
 * importado en "Fuentes comerciales"): separador ";", decimales con coma, fechas
 * DD/MM/AAAA, fin de línea CRLF, sin BOM, 22 columnas (la 10ª con encabezado vacío
 * lleva una abreviatura del producto).
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

export const COL = {
  oc: 0, fechaPI: 1, fechaPO: 2, fechaReq: 3, codCliente: 4, destino: 5, condicion: 6, lista: 7, descPedido: 8, abreviatura: 9,
  producto: 10, deposito: 11, cajas: 12, precio: 13, descPct: 14, pallets: 15, contenedor: 16, tipoPallet: 17, incoterm: 18,
  cajasPallet: 19, observaciones: 20, obsAmpliada: 21,
} as const;

/** Columnas sin las cuales Worknet no puede cargar el pedido. */
export const WORKNET_REQUIRED = [0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 15, 16, 17, 18, 19] as const;

export type Origen = 'oc' | 'historial' | 'regla' | 'persona' | 'pendiente';

export interface ClientProfile {
  clientCode: string;
  destination: string;
  conditionCode: string;
  priceListCode: string;
  orderDiscount: string;
  lineDiscount: string;
  container: string;
  palletType: string;
  incoterm: string;
  /** Días entre Fecha PO y Fecha Req. Carga observados en el historial (moda). */
  reqLoadDays: number | null;
  samples: number;
}

export interface ProductProfile {
  sku: string;
  shortName: string;
  boxesPerPallet: number | null;
}

const mode = (values: string[]): string => {
  const c = new Map<string, number>();
  for (const v of values.map((x) => x.trim()).filter(Boolean)) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

export function parseDmy(v: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCDate() === +m[1] ? d : null;
}

export function formatDmy(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** Fecha ISO (AAAA-MM-DD) → DD/MM/AAAA, o null si no es válida. */
export function isoToDmy(v: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCDate() === +m[3] ? formatDmy(d) : null;
}

export const decimalComma = (n: number): string => String(Math.round(n * 10000) / 10000).replace('.', ',');

/** Valida que unas filas tengan exactamente los encabezados oficiales. */
export function isWorknetHeader(row: readonly string[]): boolean {
  return row.length === 22 && row.every((x, i) => x.trim() === WORKNET_HEADERS[i]);
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
  for (const [code, rs] of porCliente) {
    const dias = rs.map((r) => {
      const po = parseDmy(r[COL.fechaPO]), req = parseDmy(r[COL.fechaReq]);
      return po && req ? String(Math.round((req.getTime() - po.getTime()) / 86400000)) : '';
    });
    const d = mode(dias);
    clients.set(code, {
      clientCode: code, destination: mode(rs.map((r) => r[COL.destino])), conditionCode: mode(rs.map((r) => r[COL.condicion])),
      priceListCode: mode(rs.map((r) => r[COL.lista])), orderDiscount: mode(rs.map((r) => r[COL.descPedido])),
      lineDiscount: mode(rs.map((r) => r[COL.descPct])), container: mode(rs.map((r) => r[COL.contenedor])),
      palletType: mode(rs.map((r) => r[COL.tipoPallet])), incoterm: mode(rs.map((r) => r[COL.incoterm])),
      reqLoadDays: d ? Number(d) : null, samples: rs.length,
    });
  }
  const products = new Map<string, ProductProfile>();
  const porSku = new Map<string, string[][]>();
  for (const r of rows) {
    const sku = r[COL.producto]?.trim();
    if (r.length === 22 && sku) porSku.set(sku, [...(porSku.get(sku) ?? []), r]);
  }
  for (const [sku, rs] of porSku) {
    const cxp = mode(rs.map((r) => r[COL.cajasPallet]));
    products.set(sku, { sku, shortName: mode(rs.map((r) => r[COL.abreviatura])), boxesPerPallet: /^\d+$/.test(cxp) ? Number(cxp) : null });
  }
  return { clients, products };
}

/** "...VF" → depósito 77 (Vista Flores); "...J" → 15 (Junín). Regla observada en el CSV oficial. */
export function depositFromOrderNumber(orderNumber: string | null | undefined): string | null {
  const v = String(orderNumber ?? '').trim().toUpperCase();
  if (/VF$/.test(v)) return '77';
  if (/J$/.test(v)) return '15';
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
  let req = isoToDmy(input.requestedLoadAt ?? null);
  let reqOrigin: Origen = req ? 'oc' : 'pendiente';
  if (!req && po && input.client?.reqLoadDays != null) {
    const d = parseDmy(po)!;
    d.setUTCDate(d.getUTCDate() + input.client.reqLoadDays);
    req = formatDmy(d);
    reqOrigin = 'regla';
  }
  const deposit = depositFromOrderNumber(input.orderNumber);
  const c = input.client;
  for (const [i, l] of input.lines.entries()) {
    const cxp = l.product?.boxesPerPallet ?? null;
    const pallets = l.quantity !== null && l.quantity > 0 && cxp ? Math.ceil(l.quantity / cxp) : null;
    const celdas: [string | null, Origen][] = [
      [input.orderNumber?.trim() || null, 'oc'], [pi, 'oc'], [po, 'oc'], [req, reqOrigin],
      [c?.clientCode || null, 'historial'], [c?.destination || null, 'historial'], [c?.conditionCode || null, 'historial'],
      [c?.priceListCode || null, 'historial'], [c?.orderDiscount ?? null, 'historial'], [l.product?.shortName || null, 'historial'],
      [l.sku?.trim() || null, 'oc'], [deposit, 'regla'], [l.quantity !== null && l.quantity > 0 ? String(l.quantity) : null, 'oc'],
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

/** Texto CSV como el que acepta Worknet: ";" , CRLF, sin BOM. */
export function worknetCsvText(rows: string[][]): string {
  return [WORKNET_HEADERS as readonly string[], ...rows].map((r) => r.map((v) => csvEscape(v, ';')).join(';')).join('\r\n') + '\r\n';
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
  if (!rows.length || !isWorknetHeader(rows[0])) throw new Error('Los encabezados no coinciden con las 22 columnas de Worknet');
  const datos = rows.slice(1);
  if (datos.some((r) => r.length !== 22)) throw new Error('Hay líneas que no tienen 22 columnas');
  return datos;
}
