import {
  buildWorknetDraft, learnFromHistory, toCanonicalRow, worknetLayout, validateWorknetRows, worknetCsvText,
  type ClientProfile, type ProductProfile, type WorknetDraft,
} from '@workforce/domain';
import type { Bindings } from './types';

/**
 * Borrador CSV Worknet para una OC, sin IA:
 *  - Datos de la OC (número, fechas, códigos, cantidades, precios) de la extracción y las correcciones humanas.
 *  - Datos fijos del cliente y por producto aprendidos SOLO de CSV Worknet históricos oficiales
 *    importados en "Fuentes comerciales".
 *  - Cliente resuelto por: código Worknet en la OC, lista de precios confirmada por una persona,
 *    o el maestro de listas por cliente. Si hay más de un candidato, no se elige: queda pendiente.
 */
export const WORKNET_MAPPING_ID = 'worknet-22-v1';

type Historia = { clients: Map<string, ClientProfile>; products: Map<string, ProductProfile>; sources: number; rows: number };
let cache: { at: number; data: Historia } | null = null;
/** Para pruebas o después de importar un CSV histórico nuevo. */
export function limpiarCacheHistorial() { cache = null; }

export async function cargarHistorial(env: Bindings, fresco = false): Promise<Historia> {
  if (!fresco && cache && Date.now() - cache.at < 5 * 60_000) return cache.data;
  const fuentes = (await env.DB.prepare(`SELECT id, headers_json FROM workforce_import_sources WHERE kind = 'csv'`).all<{ id: string; headers_json: string }>()).results ?? [];
  // Acepta las variantes de 21 y 22 columnas que aparecen en los CSV reales.
  const validas = fuentes.flatMap((f) => { try { const l = worknetLayout(JSON.parse(f.headers_json)); return l ? [{ ...f, layout: l }] : []; } catch { return []; } });
  const filas: string[][] = [];
  for (const f of validas) {
    const n = f.layout === 'w21' ? 21 : 22;
    const r = (await env.DB.prepare('SELECT values_json FROM workforce_import_rows WHERE source_id = ? ORDER BY row_number').bind(f.id).all<{ values_json: string }>()).results ?? [];
    for (const x of r) { try { const v = JSON.parse(x.values_json); if (Array.isArray(v) && v.length === n) filas.push(toCanonicalRow(v.map(String), f.layout)); } catch { /* fila inválida: se ignora */ } }
  }
  const { clients, products } = learnFromHistory(filas);
  const data = { clients, products, sources: validas.length, rows: filas.length };
  cache = { at: Date.now(), data };
  return data;
}

export interface ResolucionCliente {
  perfil: ClientProfile | null;
  motivo: string;
  candidatos: string[];
}

export async function resolverCliente(env: Bindings, orderId: string, clienteOc: string | null, h: Historia): Promise<ResolucionCliente> {
  const texto = (clienteOc ?? '').trim();
  if (texto && h.clients.has(texto)) return { perfil: h.clients.get(texto)!, motivo: 'Código de cliente Worknet presente en la OC', candidatos: [texto] };
  const asignada = await env.DB.prepare('SELECT list_code FROM order_price_list_assignments WHERE order_id = ?').bind(orderId).first<{ list_code: string }>();
  let listas: string[] = [];
  let motivo = '';
  if (asignada?.list_code) { listas = [asignada.list_code]; motivo = `Lista ${asignada.list_code} confirmada por una persona`; }
  else if (texto) {
    const r = (await env.DB.prepare(`SELECT primary_list_code FROM customer_price_lists WHERE enabled = 1 AND client_name = ? COLLATE NOCASE`).bind(texto).all<{ primary_list_code: string }>()).results ?? [];
    listas = [...new Set(r.map((x) => x.primary_list_code))];
    motivo = listas.length ? `Lista del maestro de clientes para "${texto}"` : `El cliente "${texto}" no figura en el maestro de listas`;
  } else motivo = 'La OC no identifica al cliente';
  const candidatos = [...h.clients.values()].filter((p) => listas.includes(p.priceListCode)).map((p) => p.clientCode);
  if (candidatos.length === 1) return { perfil: h.clients.get(candidatos[0])!, motivo, candidatos };
  if (candidatos.length > 1) return { perfil: null, motivo: `${motivo}: hay ${candidatos.length} clientes Worknet posibles, requiere elección humana`, candidatos };
  return { perfil: null, motivo: listas.length ? `${motivo}: sin CSV histórico oficial para esa lista` : motivo, candidatos };
}

export interface BorradorOrden {
  draft: WorknetDraft;
  cliente: ResolucionCliente;
  errores: string[];
  historial: { fuentes: number; filas: number };
}

export async function borradorWorknet(env: Bindings, orderId: string): Promise<BorradorOrden | null> {
  const o = await env.DB.prepare('SELECT id, order_number, client, issued_at, received_at, notes FROM orders WHERE id = ?').bind(orderId)
    .first<{ id: string; order_number: string | null; client: string | null; issued_at: string | null; received_at: string | null; notes: string | null }>();
  if (!o) return null;
  const lineas = (await env.DB.prepare('SELECT sku, quantity, unit_price FROM order_lines WHERE order_id = ? ORDER BY sort_order').bind(orderId)
    .all<{ sku: string; quantity: number; unit_price: number | null }>()).results ?? [];
  const h = await cargarHistorial(env);
  const cliente = await resolverCliente(env, orderId, o.client, h);
  const draft = buildWorknetDraft({
    orderNumber: o.order_number, receivedAt: o.received_at, issuedAt: o.issued_at, observations: o.notes, client: cliente.perfil,
    lines: lineas.map((l) => ({ sku: l.sku, quantity: l.quantity > 0 ? Number(l.quantity) : null, unitPrice: l.unit_price === null ? null : Number(l.unit_price), product: h.products.get(l.sku.trim()) ?? null })),
  });
  return { draft, cliente, errores: validateWorknetRows(draft.rows), historial: { fuentes: h.sources, filas: h.rows } };
}

export const textoCsvWorknet = worknetCsvText;
