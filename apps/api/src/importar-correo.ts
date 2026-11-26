import { Hono } from 'hono';
import PostalMime from 'postal-mime';
import { sha256Hex, sniffMime } from '@workforce/domain';
import { requirePermission } from './auth';
import { Store } from './store';
import type { Bindings, AppVariables } from './types';

/**
 * Importación manual de correos de OC, para cuando el buzón no está conectado.
 * Una persona arrastra el correo guardado (.eml) o directamente el adjunto (PDF, Excel,
 * Word, imagen, CSV). Se aplican las mismas reglas que la lectura automática del buzón:
 * tipo de archivo por contenido, adjuntos inline ignorados, original archivado con SHA-256,
 * sin duplicados, todo auditado. No se envía ni responde ningún correo.
 */
const MAX_ARCHIVO = 20 * 1024 * 1024;
const MAX_ADJUNTO = 12 * 1024 * 1024;

type Adjunto = { name: string; mime: string; bytes: Uint8Array; hash: string };
export type ResultadoImportacion = {
  archivo: string;
  estado: 'creada' | 'duplicado' | 'sin_adjuntos_validos' | 'no_soportado' | 'error';
  orderId?: string;
  asunto?: string;
  remitente?: string | null;
  adjuntos?: string[];
  detalle?: string;
};

const pareceEml = (bytes: Uint8Array, nombre: string) => {
  if (/\.eml$/i.test(nombre)) return true;
  const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  return /^(received|return-path|from|message-id|mime-version|date|subject|x-[\w-]+):/im.test(inicio) && /\r?\n\r?\n/.test(inicio);
};
const esMsg = (bytes: Uint8Array, nombre: string) =>
  /\.msg$/i.test(nombre) || (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 && /\.msg$/i.test(nombre));

export async function importarArchivo(env: Bindings, actor: string, nombre: string, bytes: Uint8Array): Promise<ResultadoImportacion> {
  const store = new Store(env);
  const archivo = nombre.slice(0, 200);
  if (!bytes.length || bytes.length > MAX_ARCHIVO) return { archivo, estado: 'error', detalle: 'Archivo vacío o mayor a 20 MB' };
  if (esMsg(bytes, nombre)) {
    return { archivo, estado: 'no_soportado', detalle: 'Los .msg de Outlook todavía no se leen: arrastrá el adjunto (PDF/Excel) o guardá el correo como .eml.' };
  }
  const hashOriginal = await sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const claveCorreo = `manual:${hashOriginal}`;
  const ya = await store.by('orders', 'email_message_id', claveCorreo, 'limit=1');
  if (ya[0]) return { archivo, estado: 'duplicado', orderId: ya[0].id, detalle: 'Este archivo ya se había importado' };

  let asunto = archivo, remitente: string | null = null, fecha: string | null = null, messageId: string | null = null;
  const adjuntos: Adjunto[] = [];
  const esCorreo = pareceEml(bytes, nombre);
  if (esCorreo) {
    const m = await PostalMime.parse(bytes);
    asunto = String(m.subject || archivo).slice(0, 160);
    remitente = m.from?.address ?? null;
    fecha = m.date ? new Date(m.date).toISOString() : null;
    messageId = m.messageId ?? null;
    for (const a of m.attachments) {
      if (a.disposition === 'inline' || a.related) continue;
      const b = typeof a.content === 'string' ? new TextEncoder().encode(a.content) : new Uint8Array(a.content);
      if (!b.length || b.length > MAX_ADJUNTO) continue;
      const mime = sniffMime(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, String(a.filename || ''));
      if (!mime) continue;
      const hash = await sha256Hex(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
      if (!adjuntos.some((x) => x.hash === hash)) adjuntos.push({ name: String(a.filename || 'adjunto').slice(0, 200), mime, bytes: b, hash });
    }
  } else {
    const mime = sniffMime(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, nombre);
    if (!mime) return { archivo, estado: 'no_soportado', detalle: 'Tipo de archivo no admitido (PDF, Excel, Word, imagen, CSV o correo .eml)' };
    adjuntos.push({ name: archivo, mime, bytes, hash: hashOriginal });
  }

  const registrarCorreo = (status: string, orderId: string | null) => store.upsert('received_emails', {
    graph_message_id: claveCorreo, order_id: orderId, sender_address: remitente, subject: asunto, received_at: fecha ?? new Date().toISOString(), status,
  }, 'graph_message_id');
  if (!adjuntos.length) {
    await registrarCorreo('ignored_no_valid_attachment', null);
    return { archivo, estado: 'sin_adjuntos_validos', asunto, remitente, detalle: 'El correo no trae adjuntos de OC (PDF, Excel, Word, imagen o CSV)' };
  }

  const [order] = await store.insert('orders', {
    order_number: null, client: null, issued_at: null, status: 'received', origin: 'correo_importado', email_message_id: claveCorreo, created_by: actor,
    received_at: fecha ?? new Date().toISOString(),
  });
  if (esCorreo) {
    await env.DOCS.put(`emails/${order.id}/original.eml`, bytes, { httpMetadata: { contentType: 'message/rfc822' } });
  }
  for (const v of adjuntos) {
    const key = `original/${order.id}/${crypto.randomUUID()}`;
    await env.DOCS.put(key, v.bytes, { httpMetadata: { contentType: v.mime }, customMetadata: { hash: v.hash } });
    const [doc] = await store.insert('documents', { order_id: order.id, original_filename: v.name, mime_type: v.mime, size_bytes: v.bytes.length, sha256: v.hash, r2_key: key });
    await env.JOBS.send({ orderId: order.id, documentId: doc.id });
  }
  await registrarCorreo('received', order.id);
  await store.audit(actor, 'email.imported_manually', 'order', order.id, {
    archivo, sha256: hashOriginal, messageId, remitente, asunto, fecha, adjuntos: adjuntos.map((v) => ({ name: v.name, mime: v.mime, sha256: v.hash })),
  });
  return { archivo, estado: 'creada', orderId: order.id, asunto, remitente, adjuntos: adjuntos.map((v) => v.name) };
}

const routes = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

/** POST multipart con uno o más campos "files". Devuelve el resultado por archivo. */
routes.post('/correos/importar', async (c) => {
  try {
    requirePermission(c.get('actor'), 'orders.write');
    const form = await c.req.formData();
    const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
    if (!files.length || files.length > 20) return c.json({ error: 'Enviá entre 1 y 20 archivos' }, 400);
    const resultados: ResultadoImportacion[] = [];
    for (const f of files) {
      try { resultados.push(await importarArchivo(c.env, c.get('actor').subject, f.name || 'archivo', new Uint8Array(await f.arrayBuffer()))); }
      catch (e) { resultados.push({ archivo: f.name, estado: 'error', detalle: String((e as Error)?.message ?? e).slice(0, 200) }); }
    }
    return c.json({ resultados });
  } catch (e) {
    const m = String((e as Error)?.message || e);
    return c.json({ error: m.slice(0, 200) }, m === 'FORBIDDEN' ? 403 : 400);
  }
});

export default routes;
