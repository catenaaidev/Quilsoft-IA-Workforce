import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app';
import { processDocument } from '../src/processing';
import { pollCorporateMailbox } from '../src/graph';
import { limpiarCacheHistorial } from '../src/worknet-draft';
import { MODELO_ECONOMICO_DEFECTO, MODELO_AVANZADO_DEFECTO } from '../src/ai';
import { crearEnv, crearAI, cargarHistorial, COOKIE, HEADERS } from './helpers/entorno';

const ORDEN_OK = { orderNumber: 'TEST002P-1VF', client: 'Importador Prueba SA', issuedAt: '2026-11-20', observations: "1X40' ARMAR 2 PALLETS",
  lines: [{ sku: '285-24-407', description: 'CLASS MB', quantity: 140, unit: 'cases', unitPrice: 76.4, currency: 'USD', sourceText: '285-24-407 CLASS MB 140' }] };
const respuesta = (datos: unknown, usage = { prompt_tokens: 900, completion_tokens: 150 }) => ({ response: datos, usage });

let env: any;
beforeEach(() => { env = crearEnv(); cargarHistorial(env); limpiarCacheHistorial(); });
afterEach(() => vi.unstubAllGlobals());

function crearOrdenConDocumento(mime: string, contenido: string | Uint8Array, nombre = 'po.pdf', sha = 'h-' + Math.random()) {
  const db = env.DB.raw;
  const orderId = crypto.randomUUID(), documentId = crypto.randomUUID();
  db.prepare("INSERT INTO orders(id,status,origin,created_by,received_at) VALUES (?,'received','graph','system','2026-11-20T10:00:00Z')").run(orderId);
  const key = `original/${orderId}/${documentId}`;
  env.DOCS.put(key, contenido);
  db.prepare('INSERT INTO documents(id,order_id,original_filename,mime_type,size_bytes,sha256,r2_key) VALUES (?,?,?,?,?,?,?)').run(documentId, orderId, nombre, mime, 10, sha, key);
  return { orderId, documentId };
}
const ejecuciones = () => env.DB.raw.prepare('SELECT status, model, model_tier, tokens_input, tokens_output, tokens_estimated, escalation_reason, cache_hit FROM executions ORDER BY created_at').all();

describe('Extracción por niveles y consumo de tokens', () => {
  it('N1: una OC que ya viene como CSV Worknet se lee sin IA (0 tokens)', async () => {
    const csv = [HEADERS.join(';'), 'TEST003P-1VF;20/11/2026;20/11/2026;25/12/2026;999001EXP;511;45;43;10;CLASS MB;285-24-407;77;420;76,4;10;6;2;1;FOB;70;OBS;'].join('\r\n') + '\r\n';
    const { orderId, documentId } = crearOrdenConDocumento('text/csv', csv, 'oc.csv');
    await processDocument(env, orderId, documentId);
    expect(env.AI.llamadas).toHaveLength(0);
    const ej = ejecuciones()[0];
    expect(ej).toMatchObject({ status: 'review', model_tier: 'deterministico', tokens_input: 0, tokens_output: 0 });
    const o = env.DB.raw.prepare('SELECT order_number, client, status FROM orders WHERE id = ?').get(orderId);
    expect(o).toMatchObject({ order_number: 'TEST003P-1VF', client: '999001EXP', status: 'review' });
    // Borrador Worknet automático guardado en R2, sin campos pendientes.
    const draft = await env.DOCS.get(`drafts/${orderId}/worknet-borrador.csv`);
    expect(await draft.text()).toContain(';999001EXP;511;45;43;10;CLASS MB;285-24-407;77;420;76,4;10;6;2;1;FOB;70;');
  });

  it('N2: el modelo económico resuelve y se registran los tokens reales; no se usa el avanzado', async () => {
    env.AI = crearAI({ [MODELO_ECONOMICO_DEFECTO]: [respuesta(ORDEN_OK)] });
    const { orderId, documentId } = crearOrdenConDocumento('application/pdf', '%PDF-1.4');
    await processDocument(env, orderId, documentId);
    expect(env.AI.llamadas.map((l: any) => l.modelo)).toEqual([MODELO_ECONOMICO_DEFECTO]);
    expect(env.AI.llamadas[0].input.messages[1].content).toBe('texto de la orden'); // solo el adjunto, no el correo
    expect(ejecuciones()[0]).toMatchObject({ model_tier: 'economico', tokens_input: 900, tokens_output: 150, tokens_estimated: 0, escalation_reason: null });
  });

  it('N3: si el económico no pasa la validación, escala al avanzado y registra el motivo', async () => {
    env.AI = crearAI({ [MODELO_ECONOMICO_DEFECTO]: [respuesta({ ...ORDEN_OK, orderNumber: null })], [MODELO_AVANZADO_DEFECTO]: [respuesta(ORDEN_OK, { prompt_tokens: 1000, completion_tokens: 200 })] });
    const { orderId, documentId } = crearOrdenConDocumento('application/pdf', '%PDF-1.4');
    await processDocument(env, orderId, documentId);
    expect(env.AI.llamadas.map((l: any) => l.modelo)).toEqual([MODELO_ECONOMICO_DEFECTO, MODELO_AVANZADO_DEFECTO]);
    const ej = ejecuciones()[0];
    expect(ej).toMatchObject({ model_tier: 'avanzado', tokens_input: 1900, tokens_output: 350 });
    expect(ej.escalation_reason).toContain('sin número de OC');
  });

  it('N0: un archivo idéntico ya extraído se reutiliza sin llamar a la IA', async () => {
    env.AI = crearAI({ [MODELO_ECONOMICO_DEFECTO]: [respuesta(ORDEN_OK)] });
    const a = crearOrdenConDocumento('application/pdf', '%PDF-1.4', 'a.pdf', 'mismo-hash');
    await processDocument(env, a.orderId, a.documentId);
    const b = crearOrdenConDocumento('application/pdf', '%PDF-1.4', 'b.pdf', 'mismo-hash');
    await processDocument(env, b.orderId, b.documentId);
    expect(env.AI.llamadas).toHaveLength(1);
    expect(ejecuciones()[1]).toMatchObject({ model_tier: 'cache', cache_hit: 1, tokens_input: 0 });
  });

  it('un reintento después de una respuesta válida no vuelve a pagar IA', async () => {
    env.AI = crearAI({});
    const { orderId, documentId } = crearOrdenConDocumento('application/pdf', '%PDF-1.4');
    env.DB.raw.prepare('INSERT INTO document_extractions(id,document_id,model,extraction) VALUES (?,?,?,?)').run(crypto.randomUUID(), documentId, MODELO_ECONOMICO_DEFECTO, JSON.stringify(ORDEN_OK));
    await processDocument(env, orderId, documentId);
    expect(env.AI.llamadas).toHaveLength(0);
    expect(ejecuciones()[0].model_tier).toBe('cache');
  });

  it('presupuesto por documento superado: no llama a la IA y deja la OC para revisión humana', async () => {
    env.DB.raw.prepare("UPDATE ai_budgets SET max_tokens = 10 WHERE scope = 'document'").run();
    env.AI = crearAI({ [MODELO_ECONOMICO_DEFECTO]: [respuesta(ORDEN_OK)] }, 'x'.repeat(500));
    const { orderId, documentId } = crearOrdenConDocumento('application/pdf', '%PDF-1.4');
    await processDocument(env, orderId, documentId);
    expect(env.AI.llamadas).toHaveLength(0);
    const d = env.DB.raw.prepare('SELECT extraction_status, failure_reason FROM documents WHERE id = ?').get(documentId);
    expect(d.extraction_status).toBe('error');
    expect(d.failure_reason).toMatch(/presupuesto por documento/);
  });

  it('si el proveedor no informa tokens, se estiman y quedan marcados como estimados', async () => {
    env.AI = crearAI({ [MODELO_ECONOMICO_DEFECTO]: [{ response: ORDEN_OK }] });
    const { orderId, documentId } = crearOrdenConDocumento('application/pdf', '%PDF-1.4');
    await processDocument(env, orderId, documentId);
    expect(ejecuciones()[0]).toMatchObject({ tokens_estimated: 1 });
    expect(ejecuciones()[0].tokens_input).toBeGreaterThan(0);
  });
});

describe('Lectura automática del buzón (Microsoft Graph, solo lectura)', () => {
  const pdf = new TextEncoder().encode('%PDF-1.4 orden');
  function graphFalso(mensajes: any[]) {
    const pedidos: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      pedidos.push({ url, method: init?.method ?? 'GET' });
      if (url.includes('/oauth2/v2.0/token')) return Response.json({ access_token: 't' });
      if (url.includes('/messages/delta')) return Response.json({ value: mensajes, '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/users/x/mailFolders/inbox/messages/delta?$deltatoken=ok' });
      if (/\/attachments\?/.test(url)) return Response.json({ value: [{ id: 'a1', name: 'PO.pdf', contentType: 'application/octet-stream', size: pdf.length, '@odata.type': '#microsoft.graph.fileAttachment' }, { id: 'a2', name: 'logo.png', size: 10, isInline: true, '@odata.type': '#microsoft.graph.fileAttachment' }] });
      if (url.endsWith('/attachments/a1/$value')) return new Response(pdf);
      if (url.endsWith('/$value')) return new Response('Subject: PO');
      return new Response('no', { status: 404 });
    });
    return pedidos;
  }
  const conf = { GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's', GRAPH_MAILBOX: 'exportorders@catenazapata.com' };

  it('crea la OC solo si hay adjunto válido (detectado por contenido), guarda el .eml y encola; no duplica', async () => {
    Object.assign(env, conf);
    const pedidos = graphFalso([
      { id: 'm1', internetMessageId: '<1@x>', subject: 'PO 1', from: { emailAddress: { address: 'compras@cliente.example' } }, receivedDateTime: '2026-11-20T10:00:00Z', hasAttachments: true },
      { id: 'm2', subject: 'Consulta', from: { emailAddress: { address: 'otro@cliente.example' } }, receivedDateTime: '2026-11-20T10:01:00Z', hasAttachments: false },
    ]);
    const r = await pollCorporateMailbox(env);
    expect(r).toMatchObject({ configured: true, ordersCreated: 1, received: 1, skipped: 1 });
    expect(env.JOBS.enviados).toHaveLength(1);
    expect(env.DB.raw.prepare('SELECT COUNT(*) n FROM orders').get().n).toBe(1);
    expect(env.DB.raw.prepare("SELECT status FROM received_emails WHERE graph_message_id='m2'").get().status).toBe('ignored_no_attachment');
    expect(env.DB.raw.prepare('SELECT mime_type FROM documents').get().mime_type).toBe('application/pdf');
    expect([...env.DOCS.mapa.keys()].some((k: string) => k.endsWith('/original.eml'))).toBe(true);
    expect(pedidos.every((p) => p.url.includes('login.microsoftonline.com') || p.method === 'GET')).toBe(true);
    expect(env.DB.raw.prepare("SELECT result, orders_created FROM mail_poll_runs").get()).toMatchObject({ result: 'ok', orders_created: 1 });
    // Segunda consulta con los mismos mensajes: no duplica.
    await pollCorporateMailbox(env);
    expect(env.DB.raw.prepare('SELECT COUNT(*) n FROM orders').get().n).toBe(1);
    expect(env.JOBS.enviados).toHaveLength(1);
  });

  it('sin credenciales registra "no configurado" y no inventa conexión', async () => {
    const r = await pollCorporateMailbox(env);
    expect(r.configured).toBe(false);
    expect(env.DB.raw.prepare('SELECT result FROM mail_poll_runs').get().result).toBe('not_configured');
    const res = await app.request('/api/integrations', { headers: COOKIE }, env);
    expect((await res.json() as any).graph).toBe('pending');
  });
});

describe('Borrador y CSV oficial Worknet', () => {
  async function ordenProcesada() {
    env.AI = crearAI({ [MODELO_ECONOMICO_DEFECTO]: [respuesta(ORDEN_OK)] });
    const { orderId, documentId } = crearOrdenConDocumento('application/pdf', '%PDF-1.4');
    await processDocument(env, orderId, documentId);
    return orderId;
  }

  it('el borrador usa las 22 columnas, completa desde el historial oficial y marca origen de cada dato', async () => {
    const id = await ordenProcesada();
    const res = await app.request(`/api/orders/${id}/csv-draft?preview=1`, { headers: COOKIE }, env);
    const b = await res.json() as any;
    expect(b.format).toBe('worknet-22');
    expect(b.columns).toHaveLength(22);
    expect(b.client.code).toBe('999001EXP');
    expect(b.rows[0].slice(4, 11)).toEqual(['999001EXP', '511', '45', '43', '10', 'CLASS MB', '285-24-407']);
    expect(b.rows[0][3]).toBe('25/12/2026'); // PO + 35 días (regla del historial)
    expect(b.origins[0][3]).toBe('regla');
    expect(b.missing).toEqual([]);
  });

  it('sin cliente resoluble, el borrador queda con pendientes y la aprobación se bloquea', async () => {
    env.AI = crearAI({ [MODELO_ECONOMICO_DEFECTO]: [respuesta({ ...ORDEN_OK, client: 'Cliente Desconocido' })] });
    const { orderId, documentId } = crearOrdenConDocumento('application/pdf', '%PDF-1.4');
    await processDocument(env, orderId, documentId);
    const b = await (await app.request(`/api/orders/${orderId}/csv-draft?preview=1`, { headers: COOKIE }, env)).json() as any;
    expect(b.missing).toEqual(expect.arrayContaining(['Linea 1: Cod. Cliente', 'Linea 1: Destino']));
    env.DB.raw.prepare("UPDATE order_lines SET technical_status='approved'").run();
    const ap = await app.request(`/api/orders/${orderId}/approve`, { method: 'POST', headers: { ...COOKIE, origin: 'http://localhost' } }, env);
    expect(ap.status).toBe(409);
    expect((await ap.json() as any).error).toBe('WORKNET_DRAFT_INCOMPLETE');
  });

  it('el CSV oficial exige el formato validado en Worknet; validado, se genera y descarga con hash', async () => {
    const id = await ordenProcesada();
    env.DB.raw.prepare("UPDATE orders SET status='approved' WHERE id=?").run(id);
    env.DB.raw.prepare("INSERT INTO order_price_list_assignments(order_id,list_code,confirmed_by) VALUES (?, '43', 'u')").run(id);
    const h = { ...COOKIE, origin: 'http://localhost', 'content-type': 'application/json' };
    const bloqueado = await app.request(`/api/orders/${id}/csv`, { method: 'POST', headers: h }, env);
    expect((await bloqueado.json() as any).error).toBe('WORKNET_FORMAT_NOT_VALIDATED');
    const val = await app.request('/api/expo/formato-worknet/validar', { method: 'POST', headers: h, body: JSON.stringify({ evidencia: 'Importación de prueba aprobada por Sebastián el 24/11' }) }, env);
    expect(val.status).toBe(200);
    const gen = await app.request(`/api/orders/${id}/csv`, { method: 'POST', headers: h }, env);
    const g = await gen.json() as any;
    expect(g).toMatchObject({ status: 'pending_manual_erp_upload', format: 'worknet-22' });
    expect(g.sha256).toMatch(/^[0-9a-f]{64}$/);
    const csv = await (await app.request(`/api/orders/${id}/csv`, { headers: COOKIE }, env)).text();
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
    expect(csv.split('\r\n')[0].split(';')).toHaveLength(22);
    expect(csv.split('\r\n')[1]).toBe("TEST002P-1VF;20/11/2026;20/11/2026;25/12/2026;999001EXP;511;45;43;10;CLASS MB;285-24-407;77;140;76,4;10;2;2;1;FOB;70;1X40' ARMAR 2 PALLETS;");
  });
});

describe('Estado operativo y métricas del agente', () => {
  it('el panel responde qué hacer ahora y no muestra el correo como conectado sin consultas', async () => {
    const r = await (await app.request('/api/expo/estado', { headers: COOKIE }, env)).json() as any;
    expect(r.correo.estado).toBe('pendiente');
    expect(r.loyal.estado).toBe('pendiente');
    expect(r.queHacerAhora.length).toBeGreaterThan(0);
  });

  it('las métricas del agente reflejan ejecuciones, niveles y tokens reales', async () => {
    env.AI = crearAI({ [MODELO_ECONOMICO_DEFECTO]: [respuesta(ORDEN_OK)] });
    const { orderId, documentId } = crearOrdenConDocumento('application/pdf', '%PDF-1.4');
    await processDocument(env, orderId, documentId);
    const m = await (await app.request('/api/agents/purchase-orders/metricas', { headers: COOKIE }, env)).json() as any;
    expect(m.estado).toBe('integracion_pendiente'); // hay procesamiento, pero el correo no está configurado
    expect(m.tokens).toMatchObject({ entrada: 900, salida: 150 });
    expect(m.niveles).toMatchObject({ economico: 1 });
    expect(m.porcentajeSinIAAvanzada).toBe(100);
    expect(m.costo.usd).toBeNull(); // sin precios cargados no se inventa un costo
  });

  it('presupuestos: solo administradores los cambian y queda auditado', async () => {
    env.IDENTITY = { fetch: async () => Response.json({ ok: true, principal_id: '22222222-2222-4222-8222-222222222222', name: 'Op', app_role: 'usuario' }) };
    const h = { ...COOKIE, origin: 'http://localhost', 'content-type': 'application/json' };
    expect((await app.request('/api/expo/presupuestos/day', { method: 'PUT', headers: h, body: JSON.stringify({ maxTokens: 5000 }) }, env)).status).toBe(403);
    env.IDENTITY = crearEnv().IDENTITY;
    expect((await app.request('/api/expo/presupuestos/day', { method: 'PUT', headers: h, body: JSON.stringify({ maxTokens: 5000 }) }, env)).status).toBe(200);
    expect(env.DB.raw.prepare("SELECT max_tokens FROM ai_budgets WHERE scope='day'").get().max_tokens).toBe(5000);
    expect(env.DB.raw.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='ai.budget_updated'").get().n).toBe(1);
  });
});
