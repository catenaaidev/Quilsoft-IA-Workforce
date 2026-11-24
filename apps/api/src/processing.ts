import { Store } from './store';
import type { Bindings } from './types';
import { costoEstimado, ErrorPresupuesto, extractedSchema, extraerConIA, extraerWorknetCsv, PROMPT_VERSION, type Consumo, type Extraccion } from './ai';
import { borradorWorknet, textoCsvWorknet } from './worknet-draft';

/**
 * Procesa un adjunto de OC: obtiene el texto, extrae los datos por niveles (caché →
 * determinístico → IA económica → IA avanzada), sugiere productos del catálogo por
 * coincidencia exacta y prepara automáticamente el BORRADOR CSV Worknet.
 * El borrador nunca reemplaza al CSV oficial: ese exige Loyal real y aprobación humana.
 */
async function textoDelDocumento(env: Bindings, doc: { mime_type: string; original_filename: string }, object: R2ObjectBody): Promise<string> {
  if (doc.mime_type === 'text/plain' || doc.mime_type === 'text/csv') return await object.text();
  let content = '';
  const blob = new Blob([await object.arrayBuffer()], { type: doc.mime_type });
  try {
    const converted = await env.AI.toMarkdown({ name: doc.original_filename, blob });
    content = Array.isArray(converted) ? converted.map((x: any) => x.data || x.markdown || '').join('\n') : converted.data || converted.markdown || '';
  } catch { /* puede existir un procesador privado */ }
  if (!content && env.DOC_PROCESSOR_URL && env.DOC_PROCESSOR_TOKEN) {
    const res = await fetch(`${env.DOC_PROCESSOR_URL}/extract`, { method: 'POST', headers: { Authorization: `Bearer ${env.DOC_PROCESSOR_TOKEN}`, 'Content-Type': doc.mime_type, 'X-Filename': encodeURIComponent(doc.original_filename) }, body: blob });
    if (res.ok) content = ((await res.json()) as { text: string }).text;
  }
  return content;
}

async function sugerenciasCatalogo(env: Bindings, e: Extraccion) {
  const salida: Array<{ line: number; inputSku: string; inputDescription: string; matches: Array<{ code: string; description: string; market: string; matchType: string }> }> = [];
  for (const [i, line] of e.lines.entries()) {
    let candidates: Array<{ code: string; description: string; market: string; matchType: string }> = [];
    if (line.sku.trim()) {
      const r = await env.DB.prepare(`SELECT p.code,COALESCE(o.description,p.description) AS description,COALESCE(o.market,p.market) AS market FROM worknet_product_catalog p LEFT JOIN worknet_product_catalog_overrides o ON o.code=p.code WHERE p.code=? AND COALESCE(o.is_active,1)=1 LIMIT 1`).bind(line.sku.trim()).all<any>();
      candidates = (r.results || []).map((x) => ({ ...x, matchType: 'exact_code' }));
    } else if (line.description.trim().length >= 8) {
      const r = await env.DB.prepare(`SELECT p.code,COALESCE(o.description,p.description) AS description,COALESCE(o.market,p.market) AS market FROM worknet_product_catalog p LEFT JOIN worknet_product_catalog_overrides o ON o.code=p.code WHERE COALESCE(o.description,p.description) = ? COLLATE NOCASE AND COALESCE(o.is_active,1)=1 LIMIT 6`).bind(line.description.trim()).all<any>();
      candidates = (r.results || []).map((x) => ({ ...x, matchType: 'exact_description' }));
    }
    salida.push({ line: i + 1, inputSku: line.sku, inputDescription: line.description, matches: candidates });
  }
  return salida;
}

/** N0: el mismo archivo (hash) ya fue extraído en otro documento → se reutiliza sin IA. */
async function extraccionEnCache(env: Bindings, documentId: string, sha256: string): Promise<Extraccion | null> {
  // Reintento del mismo documento: si la IA ya respondió en un intento anterior, no se vuelve a pagar.
  const propia = await env.DB.prepare('SELECT extraction FROM document_extractions WHERE document_id = ? ORDER BY created_at DESC LIMIT 1').bind(documentId).first<{ extraction: string }>();
  if (propia) { try { const v = extractedSchema.safeParse(JSON.parse(propia.extraction)); if (v.success) return v.data; } catch { /* sigue */ } }
  const fila = await env.DB.prepare(`SELECT e.extraction FROM document_extractions e JOIN documents d ON d.id = e.document_id
      WHERE d.sha256 = ? AND d.id <> ? AND d.extraction_status = 'review' ORDER BY e.created_at DESC LIMIT 1`).bind(sha256, documentId).first<{ extraction: string }>();
  if (!fila) return null;
  try { const v = extractedSchema.safeParse(JSON.parse(fila.extraction)); return v.success ? v.data : null; } catch { return null; }
}

async function registrarEjecucion(env: Bindings, store: Store, datos: { orderId: string; documentId: string; status: string; consumo: Consumo | null; started: number; error?: string }) {
  const c = datos.consumo;
  const costo = c ? await costoEstimado(env, c) : null;
  await store.insert('executions', {
    agent_slug: 'purchase-orders', order_id: datos.orderId, document_id: datos.documentId, status: datos.status, model: c?.modelo ?? null,
    attempts: c?.intentos ?? 1, duration_ms: Date.now() - datos.started, estimated_cost_usd: costo, error: datos.error?.slice(0, 250) ?? null,
    tokens_input: c?.tokensEntrada ?? 0, tokens_output: c?.tokensSalida ?? 0, tokens_estimated: c?.estimado ? 1 : 0,
    model_tier: c?.nivel ?? null, escalation_reason: c?.motivoEscalamiento ?? null, cache_hit: c?.nivel === 'cache' ? 1 : 0,
    started_at: new Date(datos.started).toISOString(), finished_at: new Date().toISOString(),
  });
}

export async function processDocument(env: Bindings, orderId: string, documentId: string) {
  const store = new Store(env);
  const doc = await store.get('documents', documentId);
  if (!doc || doc.order_id !== orderId) throw new Error('Documento no válido');
  if (doc.extraction_status === 'review') return; // idempotente: ya procesado, no se vuelve a pagar IA
  const object = await env.DOCS.get(doc.r2_key);
  if (!object) throw new Error('Original R2 inexistente');
  await store.patch('documents', documentId, { extraction_status: 'processing', failure_reason: null });
  const started = Date.now();
  let consumo: Consumo | null = null;
  try {
    let extraida = await extraccionEnCache(env, documentId, doc.sha256);
    let content = '';
    if (extraida) consumo = { modelo: null, nivel: 'cache', tokensEntrada: 0, tokensSalida: 0, estimado: false, motivoEscalamiento: null, intentos: 0 };
    else {
      content = await textoDelDocumento(env, doc, object);
      if (!content.trim()) throw new Error('No se pudo extraer texto. Revisión humana requerida');
      extraida = extraerWorknetCsv(content);
      if (extraida) consumo = { modelo: null, nivel: 'deterministico', tokensEntrada: 0, tokensSalida: 0, estimado: false, motivoEscalamiento: null, intentos: 0 };
      else {
        const r = await extraerConIA(env, content);
        extraida = r.extraccion;
        consumo = r.consumo;
      }
      // Se guarda enseguida: si algo falla después, el reintento reutiliza esta extracción.
      await store.insert('document_extractions', { document_id: documentId, model: consumo?.modelo ?? consumo?.nivel ?? null, extraction: extraida });
    }
    const catalogSuggestions = await sugerenciasCatalogo(env, extraida);
    const lines = extraida.lines.map((l) => ({ sku: l.sku, description: l.description, quantity: l.quantity || 0, unit: l.unit || '', unitPrice: l.unitPrice, currency: l.currency || extraida!.currency || '', technicalStatus: 'unknown' as const }));
    const current = await store.getOrder(orderId);
    if (!current) throw new Error('OC inexistente');
    if (!current.lines.length && lines.length) await store.addLines(orderId, lines);
    await store.patch('documents', documentId, { extraction_status: 'review', extracted_text: content ? content.slice(0, 100000) : null, extraction_json: { ...extraida, catalogSuggestions, promptVersion: PROMPT_VERSION, tier: consumo?.nivel } });
    const row = await env.DB.prepare('SELECT notes FROM orders WHERE id = ?').bind(orderId).first<{ notes: string | null }>();
    await store.patch('orders', orderId, {
      order_number: current.order.orderNumber || extraida.orderNumber, client: current.order.client || extraida.client, issued_at: current.order.issuedAt || extraida.issuedAt,
      notes: row?.notes || extraida.observations || null, status: 'review', updated_at: new Date().toISOString(),
    });
    // Borrador CSV Worknet automático (no exportable): se recalcula al consultarlo si cambian datos.
    try {
      const b = await borradorWorknet(env, orderId);
      if (b && b.draft.rows.length) {
        await env.DOCS.put(`drafts/${orderId}/worknet-borrador.csv`, textoCsvWorknet(b.draft.rows), {
          httpMetadata: { contentType: 'text/csv; charset=utf-8' },
          customMetadata: { status: 'draft-not-approved', format: 'worknet-22', missing: String(b.draft.missing.length) },
        });
        await store.audit('system', 'csv.draft_prepared', 'order', orderId, { format: 'worknet-22', missingFields: b.draft.missing.length, client: b.cliente.perfil?.clientCode ?? null, clientReason: b.cliente.motivo });
      }
    } catch (draftError) {
      await store.audit('system', 'csv.draft_failed', 'order', orderId, { reason: String(draftError).slice(0, 180) });
    }
    await registrarEjecucion(env, store, { orderId, documentId, status: 'review', consumo, started });
    await store.audit('system', 'document.extracted', 'document', documentId, {
      tier: consumo?.nivel, model: consumo?.modelo, tokens: (consumo?.tokensEntrada ?? 0) + (consumo?.tokensSalida ?? 0), tokensEstimated: consumo?.estimado ?? false,
      escalation: consumo?.motivoEscalamiento ?? null, requiresHumanReview: true, catalogSuggestions: catalogSuggestions.filter((x) => x.matches.length > 0).length,
    });
  } catch (error) {
    const mensaje = String((error as Error)?.message ?? error);
    await store.patch('documents', documentId, { extraction_status: 'error', failure_reason: mensaje.slice(0, 250) });
    await registrarEjecucion(env, store, { orderId, documentId, status: 'error', consumo, started, error: mensaje });
    // Sin presupuesto no tiene sentido reintentar: queda para revisión humana.
    if (error instanceof ErrorPresupuesto) return;
    throw error;
  }
}
