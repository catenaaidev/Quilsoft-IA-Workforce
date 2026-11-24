import { Store } from './store';
import { sha256Hex, sniffMime } from '@workforce/domain';
import type { Bindings } from './types';

/**
 * Lector de SOLO LECTURA del buzón de OC (Microsoft Graph, consulta delta).
 * - No envía, responde, mueve ni borra correos: solo hace GET.
 * - Detecta el tipo real de cada adjunto por su contenido (los correos suelen
 *   declarar "application/octet-stream").
 * - Solo crea una OC cuando el correo trae al menos un adjunto válido; los demás
 *   correos quedan registrados como "ignorado" para métricas, sin OC vacía.
 * - Cada consulta queda en mail_poll_runs (última consulta, errores reales).
 */
const MAX_ADJUNTO = 12 * 1024 * 1024;

export async function pollCorporateMailbox(env: Bindings): Promise<{ received: number; skipped: number; configured: boolean; ordersCreated: number }> {
  const { GRAPH_TENANT_ID: tenant, GRAPH_CLIENT_ID: client, GRAPH_CLIENT_SECRET: secret, GRAPH_MAILBOX: mailbox } = env;
  const runId = crypto.randomUUID();
  const inicio = new Date().toISOString();
  const cerrar = async (result: 'ok' | 'not_configured' | 'error', d: { seen?: number; orders?: number; queued?: number; ignored?: number; error?: string }) => {
    try {
      await env.DB.prepare('INSERT INTO mail_poll_runs(id,started_at,finished_at,result,messages_seen,orders_created,attachments_queued,ignored,error) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(runId, inicio, new Date().toISOString(), result, d.seen ?? 0, d.orders ?? 0, d.queued ?? 0, d.ignored ?? 0, d.error?.slice(0, 300) ?? null).run();
    } catch { /* la tabla puede no existir antes de aplicar la migración 0007 */ }
  };
  if (!tenant || !client || !secret || !mailbox) {
    await cerrar('not_configured', { error: 'Faltan credenciales de Microsoft Graph' });
    return { received: 0, skipped: 0, configured: false, ordersCreated: 0 };
  }
  const store = new Store(env);
  let received = 0, skipped = 0, ordersCreated = 0, seen = 0;
  try {
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client, client_secret: secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!tokenResponse.ok) throw new Error(`GRAPH_OAUTH_${tokenResponse.status}`);
    const token = ((await tokenResponse.json()) as { access_token: string }).access_token;
    const graph = async (endpoint: string, binario = false) => {
      const parsed = new URL(endpoint);
      if (parsed.origin !== 'https://graph.microsoft.com') throw new Error('GRAPH_URL_NOT_TRUSTED');
      const res = await fetch(endpoint, { method: 'GET', headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`GRAPH_${res.status}`);
      return binario ? res : ((await res.json()) as any);
    };
    const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`;
    const cursor = (await store.by('integration_cursors', 'name', 'graph-corporate-mailbox'))[0]?.cursor_url;
    let url = cursor || `${base}/mailFolders/inbox/messages/delta?$select=id,internetMessageId,subject,from,receivedDateTime,hasAttachments`;
    let deltaUrl: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await graph(url);
      for (const msg of result.value || []) {
        if (!msg.id || msg['@removed']) continue;
        seen++;
        const ya = await store.by('received_emails', 'graph_message_id', msg.id, 'limit=1');
        if (ya[0] && ya[0].status !== 'error') continue; // duplicado: ya registrado
        const registrar = (status: string, orderId: string | null) => store.upsert('received_emails', {
          graph_message_id: msg.id, order_id: orderId, sender_address: msg.from?.emailAddress?.address || null,
          subject: String(msg.subject || '').slice(0, 160), received_at: msg.receivedDateTime, status,
        }, 'graph_message_id');
        if (!msg.hasAttachments) { skipped++; await registrar('ignored_no_attachment', null); continue; }
        // Adjuntos válidos (por contenido) antes de crear la OC.
        const lista = await graph(`${base}/messages/${encodeURIComponent(msg.id)}/attachments?$select=id,name,contentType,size,isInline`);
        const validos: { name: string; mime: string; bytes: Uint8Array; hash: string }[] = [];
        for (const a of lista.value || []) {
          if (a['@odata.type'] !== '#microsoft.graph.fileAttachment' || a.isInline || !a.size || a.size > MAX_ADJUNTO) continue;
          const res = (await graph(`${base}/messages/${encodeURIComponent(msg.id)}/attachments/${encodeURIComponent(a.id)}/$value`, true)) as Response;
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (!bytes.length || bytes.length > MAX_ADJUNTO) continue;
          const mime = sniffMime(bytes.buffer as ArrayBuffer, String(a.name || ''));
          if (!mime) continue;
          const hash = await sha256Hex(bytes.buffer as ArrayBuffer);
          if (!validos.some((v) => v.hash === hash)) validos.push({ name: String(a.name || 'adjunto').slice(0, 200), mime, bytes, hash });
        }
        if (!validos.length) { skipped++; await registrar('ignored_no_valid_attachment', null); continue; }
        const existente = await store.by('orders', 'email_message_id', msg.id, 'limit=1');
        const order = existente[0] || (await store.insert('orders', { order_number: null, client: null, issued_at: null, status: 'received', origin: 'graph', email_message_id: msg.id, created_by: 'system' }))[0];
        if (!existente[0]) ordersCreated++;
        // Copia recuperable del correo original (.eml). Solo lectura.
        if (!existente[0]) {
          try {
            const eml = (await graph(`${base}/messages/${encodeURIComponent(msg.id)}/$value`, true)) as Response;
            const raw = await eml.arrayBuffer();
            if (raw.byteLength > 0 && raw.byteLength <= 20 * 1024 * 1024) {
              await env.DOCS.put(`emails/${order.id}/original.eml`, raw, { httpMetadata: { contentType: 'message/rfc822' } });
              await store.audit('system', 'email.original_archived', 'order', order.id, { size: raw.byteLength, sha256: await sha256Hex(raw) });
            }
          } catch { await store.audit('system', 'email.archive_pending', 'order', order.id, { note: 'No se pudo conservar el EML; revisar autorización y registros' }); }
        }
        const previos = await store.by('documents', 'order_id', order.id);
        for (const v of validos) {
          if (previos.some((d) => d.sha256 === v.hash)) continue;
          const key = `original/${order.id}/${crypto.randomUUID()}`;
          await env.DOCS.put(key, v.bytes, { httpMetadata: { contentType: v.mime }, customMetadata: { hash: v.hash } });
          const [doc] = await store.insert('documents', { order_id: order.id, original_filename: v.name, mime_type: v.mime, size_bytes: v.bytes.length, sha256: v.hash, r2_key: key });
          await env.JOBS.send({ orderId: order.id, documentId: doc.id });
          received++;
        }
        await registrar('received', order.id);
        if (!existente[0]) await store.audit('system', 'graph.message_received', 'order', order.id, { messageId: msg.id, internetMessageId: msg.internetMessageId ?? null, sender: msg.from?.emailAddress?.address ?? null, subject: String(msg.subject || '').slice(0, 160), receivedAt: msg.receivedDateTime, attachments: validos.map((v) => ({ name: v.name, mime: v.mime, sha256: v.hash })) });
      }
      if (result['@odata.deltaLink']) { deltaUrl = result['@odata.deltaLink']; break; }
      if (!result['@odata.nextLink']) throw new Error('GRAPH_DELTA_INCOMPLETE');
      url = result['@odata.nextLink'];
    }
    // El cursor solo avanza después de procesar todas las páginas.
    if (deltaUrl) await store.upsert('integration_cursors', { name: 'graph-corporate-mailbox', cursor_url: deltaUrl, updated_at: new Date().toISOString() }, 'name');
    await cerrar('ok', { seen, orders: ordersCreated, queued: received, ignored: skipped });
    return { received, skipped, configured: true, ordersCreated };
  } catch (e) {
    await cerrar('error', { seen, orders: ordersCreated, queued: received, ignored: skipped, error: String((e as Error)?.message ?? e) });
    throw e;
  }
}
