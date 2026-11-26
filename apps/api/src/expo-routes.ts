import { Hono } from 'hono';
import { z } from 'zod';
import { requirePermission } from './auth';
import { Store } from './store';
import { pollCorporateMailbox } from './graph';
import { cargarHistorial, limpiarCacheHistorial, WORKNET_MAPPING_ID } from './worknet-draft';
import { parseWorknetCsv, sha256Hex, WORKNET_HEADERS } from '@workforce/domain';
import type { Bindings, AppVariables } from './types';

/**
 * EXPO AI Agent: estado operativo real, métricas del agente de OC, presupuestos de
 * tokens y validación del formato Worknet. Nada de esto muestra algo como "conectado"
 * o "funcionando" sin evidencia en la base (consultas, ejecuciones, pruebas).
 */
const routes = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();
const fail = (c: any, e: unknown) => {
  const m = String((e as Error)?.message || e);
  return c.json({ error: m.slice(0, 200) }, m === 'FORBIDDEN' ? 403 : 400);
};

const graphConfigurado = (env: Bindings) => Boolean(env.GRAPH_TENANT_ID && env.GRAPH_CLIENT_ID && env.GRAPH_CLIENT_SECRET && env.GRAPH_MAILBOX);
const loyalConfigurado = (env: Bindings) => Boolean(env.LOYAL_LOOKUP_URL_TEMPLATE && env.LOYAL_READ_TOKEN && env.LOYAL_APPROVED_VALUE);

async function ultimaConsulta(env: Bindings) {
  try {
    return await env.DB.prepare('SELECT started_at, finished_at, result, messages_seen, orders_created, attachments_queued, ignored, error FROM mail_poll_runs ORDER BY started_at DESC LIMIT 1').first<any>();
  } catch { return null; }
}

/** Estado real del correo: configurado ≠ conectado. Conectado = última consulta exitosa reciente. */
function estadoCorreo(env: Bindings, ultima: any) {
  if (!graphConfigurado(env)) return { estado: 'pendiente', detalle: 'Faltan credenciales de Microsoft Graph (IT).' };
  if (!ultima) return { estado: 'sin_consultas', detalle: 'Configurado, todavía sin consultas registradas.' };
  if (ultima.result === 'error') return { estado: 'error', detalle: ultima.error || 'Error en la última consulta' };
  const minutos = (Date.now() - new Date(ultima.finished_at || ultima.started_at).getTime()) / 60000;
  return minutos <= 10 ? { estado: 'conectado', detalle: `Última consulta exitosa hace ${Math.round(minutos)} min` } : { estado: 'atrasado', detalle: `Sin consultas exitosas hace ${Math.round(minutos)} min` };
}

routes.get('/expo/estado', async (c) => {
  try {
    requirePermission(c.get('actor'), 'orders.read');
    const env = c.env;
    const [porEstado, correos, ultima, csvs, agente] = await Promise.all([
      env.DB.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all<{ status: string; n: number }>(),
      env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END) hoy FROM received_emails WHERE status = 'received'`).first<{ total: number; hoy: number }>(),
      ultimaConsulta(env),
      env.DB.prepare('SELECT COUNT(*) n FROM generated_csvs').first<{ n: number }>(),
      env.DB.prepare(`SELECT status FROM agents WHERE slug = 'purchase-orders' LIMIT 1`).first<{ status: string }>(),
    ]);
    const n = Object.fromEntries((porEstado.results ?? []).map((r) => [r.status, Number(r.n)]));
    const g = (k: string) => n[k] ?? 0;
    const correo = estadoCorreo(env, ultima);
    const loyal = loyalConfigurado(env) ? { estado: 'configurado_sin_verificar', detalle: 'Configurado; se verifica en cada consulta real.' } : { estado: 'pendiente', detalle: 'Falta la API oficial de Loyal (IT / proveedor). Toda OC queda bloqueada.' };
    const acciones: { prioridad: number; texto: string; enlace: string }[] = [];
    if (g('review')) acciones.push({ prioridad: 1, texto: `Revisar ${g('review')} OC con datos listos`, enlace: '/ordenes?estado=review' });
    if (g('approved')) acciones.push({ prioridad: 1, texto: `Generar el CSV de ${g('approved')} OC aprobadas`, enlace: '/ordenes?estado=approved' });
    if (g('csv_generated')) acciones.push({ prioridad: 2, texto: `Confirmar la carga manual en Worknet de ${g('csv_generated')} OC`, enlace: '/ordenes?estado=csv_generated' });
    if (g('blocked')) acciones.push({ prioridad: 2, texto: `${g('blocked')} OC bloqueadas (Loyal o datos faltantes)`, enlace: '/ordenes?estado=blocked' });
    if (g('error')) acciones.push({ prioridad: 1, texto: `${g('error')} OC con error de procesamiento: reintentar o revisar`, enlace: '/ordenes?estado=error' });
    if (correo.estado !== 'conectado') acciones.push({ prioridad: 3, texto: `Correo: ${correo.detalle}`, enlace: '/integraciones' });
    if (loyal.estado === 'pendiente') acciones.push({ prioridad: 3, texto: 'Loyal sin API oficial: solicitar acceso de solo lectura a IT', enlace: '/integraciones' });
    return c.json({
      ordenes: { llegaron: Number(correos?.total ?? 0), hoy: Number(correos?.hoy ?? 0), procesando: g('received') + g('processing'), revision: g('review'), bloqueadas: g('blocked'), aprobadas: g('approved'), csvGenerados: Number(csvs?.n ?? 0), finalizadas: g('completed'), errores: g('error') },
      correo, loyal,
      agente: { estado: agente?.status ?? 'sin_registrar', ultimaConsulta: ultima },
      queHacerAhora: acciones.sort((a, b) => a.prioridad - b.prioridad),
    });
  } catch (e) { return fail(c, e); }
});

routes.get('/agents/purchase-orders/metricas', async (c) => {
  try {
    requirePermission(c.get('actor'), 'agents.read');
    const env = c.env;
    const [ultima, correos, ej, porNivel, csv, ordenes] = await Promise.all([
      ultimaConsulta(env),
      env.DB.prepare('SELECT status, COUNT(*) n FROM received_emails GROUP BY status').all<{ status: string; n: number }>(),
      env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) errores, AVG(duration_ms) ms, MAX(created_at) ultima,
          COALESCE(SUM(tokens_input),0) tin, COALESCE(SUM(tokens_output),0) tout, SUM(CASE WHEN tokens_estimated=1 THEN 1 ELSE 0 END) estimadas,
          SUM(estimated_cost_usd) costo, SUM(CASE WHEN estimated_cost_usd IS NULL AND COALESCE(tokens_input,0)+COALESCE(tokens_output,0)>0 THEN 1 ELSE 0 END) sin_precio
        FROM executions WHERE agent_slug = 'purchase-orders'`).first<any>(),
      env.DB.prepare(`SELECT COALESCE(model_tier,'sin_dato') nivel, COUNT(*) n FROM executions WHERE agent_slug='purchase-orders' AND status <> 'error' GROUP BY 1`).all<{ nivel: string; n: number }>(),
      env.DB.prepare(`SELECT COUNT(*) n FROM audit_events WHERE action = 'csv.draft_prepared'`).first<{ n: number }>(),
      env.DB.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all<{ status: string; n: number }>(),
    ]).catch(async () => {
      // Antes de aplicar la migración 0007 las columnas nuevas no existen.
      throw new Error('Falta aplicar la migración 0007 (métricas de IA).');
    });
    const o = Object.fromEntries((ordenes.results ?? []).map((r) => [r.status, Number(r.n)]));
    const niveles = Object.fromEntries((porNivel.results ?? []).map((r) => [r.nivel, Number(r.n)]));
    const resueltas = Object.values(niveles).reduce((a, b) => a + b, 0);
    const sinAvanzada = resueltas - (niveles.avanzado ?? 0);
    const estado = !graphConfigurado(env) ? 'integracion_pendiente' : ultima?.result === 'error' ? 'error' : Number(ej?.total ?? 0) > 0 ? 'procesamiento_real' : 'configurado';
    return c.json({
      estado,
      ultimaConsultaBuzon: ultima,
      correosDetectados: Object.fromEntries((correos.results ?? []).map((r) => [r.status, Number(r.n)])),
      ocProcesadas: Number(ej?.total ?? 0) - Number(ej?.errores ?? 0),
      ocPendientesRevision: o.review ?? 0, ocBloqueadas: o.blocked ?? 0, csvBorradoresPreparados: Number(csv?.n ?? 0),
      errores: Number(ej?.errores ?? 0), ultimaEjecucion: ej?.ultima ?? null, tiempoPromedioMs: ej?.ms ? Math.round(Number(ej.ms)) : null,
      tokens: { entrada: Number(ej?.tin ?? 0), salida: Number(ej?.tout ?? 0), ejecucionesConTokensEstimados: Number(ej?.estimadas ?? 0) },
      costo: { usd: ej?.costo === null || ej?.costo === undefined ? null : Number(ej.costo), ejecucionesSinPrecioCargado: Number(ej?.sin_precio ?? 0), nota: 'El costo se informa solo con precios cargados en ai_model_prices.' },
      niveles, porcentajeSinIAAvanzada: resueltas ? Math.round((100 * sinAvanzada) / resueltas) : null,
    });
  } catch (e) { return fail(c, e); }
});

routes.get('/expo/presupuestos', async (c) => {
  try {
    requirePermission(c.get('actor'), 'agents.read');
    return c.json((await c.env.DB.prepare('SELECT scope, max_tokens, updated_by, updated_at FROM ai_budgets ORDER BY scope').all()).results ?? []);
  } catch (e) { return fail(c, e); }
});

routes.put('/expo/presupuestos/:scope', async (c) => {
  try {
    requirePermission(c.get('actor'), 'admin.agent');
    const scope = z.enum(['document', 'day', 'month']).parse(c.req.param('scope'));
    const { maxTokens } = z.object({ maxTokens: z.number().int().min(1000).max(100_000_000) }).parse(await c.req.json());
    const antes = await c.env.DB.prepare('SELECT max_tokens FROM ai_budgets WHERE scope = ?').bind(scope).first<{ max_tokens: number }>();
    await c.env.DB.prepare(`INSERT INTO ai_budgets(scope,max_tokens,updated_by,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(scope) DO UPDATE SET max_tokens=excluded.max_tokens, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP`).bind(scope, maxTokens, c.get('actor').subject).run();
    await new Store(c.env).audit(c.get('actor').subject, 'ai.budget_updated', 'ai_budget', scope, { before: antes?.max_tokens ?? null, after: maxTokens });
    return c.json({ ok: true });
  } catch (e) { return fail(c, e); }
});

/** Estado del formato Worknet: historial oficial disponible y si ya se validó con una importación real. */
routes.get('/expo/formato-worknet', async (c) => {
  try {
    requirePermission(c.get('actor'), 'orders.read');
    const m = await c.env.DB.prepare('SELECT validated, validated_by, validated_at FROM erp_csv_mappings WHERE id = ?').bind(WORKNET_MAPPING_ID).first<any>();
    const h = await cargarHistorial(c.env, true);
    return c.json({ formato: 'worknet-22', validadoEnWorknet: !!m?.validated, validadoPor: m?.validated_by ?? null, validadoEn: m?.validated_at ?? null, historial: { fuentes: h.sources, filas: h.rows, clientes: h.clients.size, productos: h.products.size } });
  } catch (e) { return fail(c, e); }
});

/** Un administrador registra que importó un CSV generado en Worknet con resultado correcto. */
routes.post('/expo/formato-worknet/validar', async (c) => {
  try {
    requirePermission(c.get('actor'), 'admin.agent');
    const { evidencia } = z.object({ evidencia: z.string().trim().min(10).max(1000) }).parse(await c.req.json());
    const r = await c.env.DB.prepare('UPDATE erp_csv_mappings SET validated = 1, validated_by = ?, validated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(c.get('actor').subject, WORKNET_MAPPING_ID).run();
    if (!r.meta.changes) throw new Error('Falta aplicar la migración 0007 (formato Worknet).');
    await new Store(c.env).audit(c.get('actor').subject, 'csv.worknet_format_validated', 'erp_csv_mapping', WORKNET_MAPPING_ID, { evidencia });
    return c.json({ ok: true });
  } catch (e) { return fail(c, e); }
});

/** Texto de un CSV: UTF-8 si es válido; si no, Windows-1252/Latin-1 (como guarda Excel en Windows). */
export function decodificarCsv(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* no es UTF-8 */ }
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
}

/**
 * Carga CSV Worknet hechos a mano como historial ("Fuentes comerciales"). De ahí salen los datos
 * fijos de cada cliente y producto para los borradores. Acepta las variantes de 21 y 22 columnas.
 * El mismo archivo no se carga dos veces (id = SHA-256 del contenido).
 */
routes.post('/expo/historial-worknet', async (c) => {
  try {
    requirePermission(c.get('actor'), 'admin.agent');
    const form = await c.req.formData();
    const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
    if (!files.length || files.length > 50) return c.json({ error: 'Enviá entre 1 y 50 archivos CSV' }, 400);
    const resultados: { archivo: string; estado: 'cargado' | 'ya_cargado' | 'invalido'; filas?: number; detalle?: string }[] = [];
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (bytes.length > 5 * 1024 * 1024) { resultados.push({ archivo: f.name, estado: 'invalido', detalle: 'Mayor a 5 MB' }); continue; }
      let filas: string[][];
      try { filas = parseWorknetCsv(decodificarCsv(bytes)).filter((r) => r.some((v) => v.trim())); }
      catch (e) { resultados.push({ archivo: f.name, estado: 'invalido', detalle: String((e as Error).message).slice(0, 160) }); continue; }
      const id = `worknet-${(await sha256Hex(bytes.buffer as ArrayBuffer)).slice(0, 32)}`;
      const ya = await c.env.DB.prepare('SELECT id FROM workforce_import_sources WHERE id = ?').bind(id).first();
      if (ya) { resultados.push({ archivo: f.name, estado: 'ya_cargado', filas: filas.length }); continue; }
      const stmts = [c.env.DB.prepare(`INSERT INTO workforce_import_sources(id,filename,kind,sheet_name,headers_json,imported_at) VALUES (?,?,'csv','Worknet',?,?)`)
        .bind(id, f.name.slice(0, 200), JSON.stringify(WORKNET_HEADERS), new Date().toISOString())];
      filas.forEach((r, i) => stmts.push(c.env.DB.prepare('INSERT INTO workforce_import_rows(source_id,row_number,values_json) VALUES (?,?,?)').bind(id, i + 2, JSON.stringify(r))));
      await c.env.DB.batch(stmts);
      resultados.push({ archivo: f.name, estado: 'cargado', filas: filas.length });
    }
    limpiarCacheHistorial();
    await new Store(c.env).audit(c.get('actor').subject, 'worknet.history_imported', 'commercial_source', 'worknet', { resultados });
    return c.json({ resultados });
  } catch (e) { return fail(c, e); }
});

/** Consulta manual del buzón (además del cron cada minuto). */
routes.post('/expo/buzon/consultar', async (c) => {
  try {
    requirePermission(c.get('actor'), 'admin.agent');
    if (!graphConfigurado(c.env)) return c.json({ error: 'Microsoft Graph no está configurado: faltan credenciales (IT).' }, 409);
    const r = await pollCorporateMailbox(c.env);
    await new Store(c.env).audit(c.get('actor').subject, 'graph.manual_poll', 'mailbox', 'exportorders', r);
    return c.json(r);
  } catch (e) { return fail(c, e); }
});

export default routes;
