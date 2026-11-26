import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Gauge, Inbox, ListChecks, Mail, ShieldCheck } from 'lucide-react';
import { api } from './api';
import { Notice } from './components';
import { EditorDrawer } from './editor-drawer';

/**
 * Vistas EXPO AI Agent. Todo lo que muestran sale de la base (consultas al buzón,
 * ejecuciones, auditoría). Nada se muestra "conectado" o "funcionando" sin evidencia.
 */

type Estado = {
  ordenes: { llegaron: number; hoy: number; procesando: number; revision: number; bloqueadas: number; aprobadas: number; csvGenerados: number; finalizadas: number; errores: number };
  correo: { estado: string; detalle: string };
  loyal: { estado: string; detalle: string };
  agente: { estado: string };
  queHacerAhora: { prioridad: number; texto: string; enlace: string }[];
};

const tonos: Record<string, string> = {
  conectado: 'bg-green-100 text-green-800', procesamiento_real: 'bg-green-100 text-green-800',
  configurado_sin_verificar: 'bg-sky-100 text-sky-800', sin_consultas: 'bg-sky-100 text-sky-800', configurado: 'bg-sky-100 text-sky-800',
  pendiente: 'bg-amber-100 text-amber-800', integracion_pendiente: 'bg-amber-100 text-amber-800', atrasado: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
};
export function Etiqueta({ valor }: { valor: string }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tonos[valor] ?? 'bg-slate-100 text-slate-700'}`}>{valor.replaceAll('_', ' ')}</span>;
}

export function QueHacerAhora() {
  const q = useQuery({ queryKey: ['expo-estado'], queryFn: () => api<Estado>('/expo/estado'), refetchInterval: 30000 });
  if (q.isError) return <div className="mb-6"><Notice kind="error">No se pudo obtener el estado operativo: {String(q.error)}</Notice></div>;
  if (!q.data) return null;
  const d = q.data, o = d.ordenes;
  const tarjetas = [
    { label: 'Llegaron por correo', value: o.llegaron, sub: `${o.hoy} hoy` },
    { label: 'Procesando', value: o.procesando },
    { label: 'Para revisar', value: o.revision },
    { label: 'Bloqueadas', value: o.bloqueadas },
    { label: 'Aprobadas', value: o.aprobadas },
    { label: 'CSV generados', value: o.csvGenerados },
    { label: 'Con error', value: o.errores },
  ];
  return <div className="mb-6 space-y-4">
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="panel p-5 lg:col-span-2">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><ListChecks size={18} /> Qué hacer ahora</h2>
        {d.queHacerAhora.length ? <ul className="divide-y">{d.queHacerAhora.map((a, i) =>
          <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className={a.prioridad === 1 ? 'font-semibold text-slate-900' : 'text-slate-700'}>{a.texto}</span>
            <Link className="whitespace-nowrap font-semibold text-brand-600" to={a.enlace}>Ir <ArrowRight size={14} className="inline" /></Link>
          </li>)}</ul> : <p className="text-sm text-slate-500">No hay tareas pendientes.</p>}
      </section>
      <section className="panel space-y-3 p-5 text-sm">
        <h2 className="font-bold">Estado real de integraciones</h2>
        <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Mail size={16} /> Correo exportorders</span><Etiqueta valor={d.correo.estado} /></div>
        <p className="text-xs text-slate-500">{d.correo.detalle}</p>
        <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><ShieldCheck size={16} /> Loyal (solo lectura)</span><Etiqueta valor={d.loyal.estado} /></div>
        <p className="text-xs text-slate-500">{d.loyal.detalle}</p>
      </section>
    </div>
    <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-7">{tarjetas.map((t) =>
      <div className="panel p-4" key={t.label}><p className="text-xs font-medium text-slate-500">{t.label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{t.value}</p>{t.sub && <p className="text-xs text-slate-500">{t.sub}</p>}</div>)}
    </div>
  </div>;
}

type Metricas = {
  estado: string; ultimaConsultaBuzon: any; correosDetectados: Record<string, number>; ocProcesadas: number; ocPendientesRevision: number; ocBloqueadas: number;
  csvBorradoresPreparados: number; errores: number; ultimaEjecucion: string | null; tiempoPromedioMs: number | null;
  tokens: { entrada: number; salida: number; ejecucionesConTokensEstimados: number };
  costo: { usd: number | null; ejecucionesSinPrecioCargado: number; nota: string };
  niveles: Record<string, number>; porcentajeSinIAAvanzada: number | null;
};
const nombresNivel: Record<string, string> = { cache: 'Nivel 0 · caché', deterministico: 'Nivel 1 · sin IA', economico: 'Nivel 2 · modelo económico', avanzado: 'Nivel 3 · modelo avanzado', sin_dato: 'Sin dato (anteriores)' };
const nombresAlcance: Record<string, string> = { document: 'Por documento', day: 'Por día', month: 'Por mes' };

export function MetricasAgenteOC() {
  const qc = useQueryClient();
  const m = useQuery({ queryKey: ['agente-metricas'], queryFn: () => api<Metricas>('/agents/purchase-orders/metricas'), refetchInterval: 30000 });
  const p = useQuery({ queryKey: ['presupuestos'], queryFn: () => api<{ scope: string; max_tokens: number; updated_by: string | null; updated_at: string }[]>('/expo/presupuestos') });
  const [editando, setEditando] = useState<{ scope: string; valor: string } | null>(null);
  const guardar = useMutation({
    mutationFn: (x: { scope: string; maxTokens: number }) => api(`/expo/presupuestos/${x.scope}`, { method: 'PUT', body: JSON.stringify({ maxTokens: x.maxTokens }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['presupuestos'] }); setEditando(null); },
  });
  const consultar = useMutation({ mutationFn: () => api<any>('/expo/buzon/consultar', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['agente-metricas'] }) });
  const fmt = (n: number) => n.toLocaleString('es-AR');
  return <section className="panel mb-5 p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-bold"><Gauge size={18} /> Agente de órdenes de compra · métricas reales</h2>
      <div className="flex items-center gap-2">{m.data && <Etiqueta valor={m.data.estado} />}
        <button className="btn-secondary" disabled={consultar.isPending} onClick={() => consultar.mutate()}><Inbox size={15} /> Consultar buzón ahora</button></div>
    </div>
    {consultar.isError && <Notice kind="error">{String(consultar.error)}</Notice>}
    {consultar.data && <Notice kind="success">Consulta hecha: {consultar.data.ordersCreated} OC nuevas, {consultar.data.skipped} correos ignorados.</Notice>}
    {m.isError ? <Notice kind="error">{String(m.error)}</Notice> : !m.data ? <p className="text-sm text-slate-500">Consultando…</p> : <>
      <div className="grid gap-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
        {[['OC procesadas', m.data.ocProcesadas], ['Para revisar', m.data.ocPendientesRevision], ['Bloqueadas', m.data.ocBloqueadas], ['Borradores CSV', m.data.csvBorradoresPreparados], ['Errores', m.data.errores], ['Tiempo promedio', m.data.tiempoPromedioMs === null ? '—' : `${(m.data.tiempoPromedioMs / 1000).toFixed(1)} s`]].map(([k, v]) =>
          <div key={String(k)} className="rounded-lg border p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-lg font-bold">{v}</div></div>)}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4 text-sm">
          <h3 className="mb-2 font-semibold">Consumo de IA</h3>
          <p>Tokens de entrada: <strong>{fmt(m.data.tokens.entrada)}</strong> · salida: <strong>{fmt(m.data.tokens.salida)}</strong></p>
          {m.data.tokens.ejecucionesConTokensEstimados > 0 && <p className="text-xs text-amber-800">{m.data.tokens.ejecucionesConTokensEstimados} ejecuciones con tokens ESTIMADOS (el proveedor no informó el uso).</p>}
          <p className="mt-1">Costo: {m.data.costo.usd === null ? <span className="text-slate-500">sin precios cargados (no se estima)</span> : <strong>USD {m.data.costo.usd.toFixed(4)}</strong>}</p>
          {m.data.porcentajeSinIAAvanzada !== null && <p className="mt-1">Resueltas sin modelo avanzado: <strong>{m.data.porcentajeSinIAAvanzada}%</strong></p>}
          <ul className="mt-2 space-y-1 text-xs text-slate-600">{Object.entries(m.data.niveles).map(([k, v]) => <li key={k}>{nombresNivel[k] ?? k}: {v}</li>)}</ul>
        </div>
        <div className="rounded-lg border p-4 text-sm">
          <h3 className="mb-2 font-semibold">Presupuestos de tokens</h3>
          {p.data?.length ? <ul className="divide-y">{p.data.map((b) => <li key={b.scope} className="flex items-center justify-between py-2">
            <span>{nombresAlcance[b.scope] ?? b.scope}: <strong>{fmt(b.max_tokens)}</strong></span>
            <button className="text-sm font-semibold text-brand-600" onClick={() => setEditando({ scope: b.scope, valor: String(b.max_tokens) })}>Editar</button></li>)}</ul>
            : <p className="text-xs text-slate-500">{p.isError ? String(p.error) : 'Sin presupuestos (falta la migración 0007).'}</p>}
          <p className="mt-2 text-xs text-slate-500">Si se supera un presupuesto, la OC queda para revisión humana y no se llama a la IA.</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Última consulta al buzón: {m.data.ultimaConsultaBuzon ? `${new Date(m.data.ultimaConsultaBuzon.started_at).toLocaleString('es-AR')} · ${m.data.ultimaConsultaBuzon.result}` : 'ninguna registrada'} · Última ejecución: {m.data.ultimaEjecucion ? new Date(m.data.ultimaEjecucion).toLocaleString('es-AR') : '—'}</p>
    </>}
    {editando && <EditorDrawer title={`Presupuesto ${nombresAlcance[editando.scope] ?? editando.scope}`} subtitle="Máximo de tokens (entrada + salida). Solo administradores." onClose={() => setEditando(null)} busy={guardar.isPending}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); guardar.mutate({ scope: editando.scope, maxTokens: Number(editando.valor) }); }}>
        <label className="block"><span className="label">Tokens</span><input className="field" type="number" min={1000} step={1000} value={editando.valor} onChange={(e) => setEditando({ ...editando, valor: e.target.value })} /></label>
        {guardar.isError && <Notice kind="error">{String(guardar.error)}</Notice>}
        <button className="btn-primary" disabled={guardar.isPending}>Guardar</button>
      </form>
    </EditorDrawer>}
  </section>;
}

type Formato = { formato: string; validadoEnWorknet: boolean; validadoPor: string | null; validadoEn: string | null; historial: { fuentes: number; filas: number; clientes: number; productos: number } };

export function FormatoWorknet() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['formato-worknet'], queryFn: () => api<Formato>('/expo/formato-worknet') });
  const [abierto, setAbierto] = useState(false), [evidencia, setEvidencia] = useState('');
  const validar = useMutation({ mutationFn: () => api('/expo/formato-worknet/validar', { method: 'POST', body: JSON.stringify({ evidencia }) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['formato-worknet'] }); setAbierto(false); } });
  if (!q.data) return q.isError ? <Notice kind="error">{String(q.error)}</Notice> : null;
  const d = q.data;
  return <section className="panel mt-5 p-6 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">CSV Worknet (22 columnas)</h2><Etiqueta valor={d.validadoEnWorknet ? 'conectado' : 'pendiente'} /></div>
    <p className="mt-2 text-slate-600">Historial oficial cargado: {d.historial.fuentes} archivos, {d.historial.filas} filas, {d.historial.clientes} clientes y {d.historial.productos} productos. De ahí salen los datos fijos del cliente y de cada producto; nada se inventa.</p>
    {d.validadoEnWorknet
      ? <p className="mt-2 text-green-800">Validado con una importación real por {d.validadoPor} el {d.validadoEn}.</p>
      : <><p className="mt-2 text-amber-800">Todavía no se probó una importación en Worknet. Hasta entonces solo se descargan borradores y el CSV definitivo queda bloqueado.</p>
        <button className="btn-secondary mt-3" onClick={() => setAbierto(true)}>Registrar prueba de importación (administrador)</button></>}
    {abierto && <EditorDrawer title="Prueba de importación en Worknet" subtitle="Registrá quién importó, cuándo y con qué resultado. Queda en Auditoría." onClose={() => setAbierto(false)} busy={validar.isPending}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); validar.mutate(); }}>
        <label className="block"><span className="label">Evidencia</span><textarea className="field min-h-32" value={evidencia} onChange={(e) => setEvidencia(e.target.value)} placeholder="Ej.: Sebastián importó el CSV de la OC X en Worknet el 24/11, sin errores; pedido N° …" /></label>
        {validar.isError && <Notice kind="error">{String(validar.error)}</Notice>}
        <button className="btn-primary" disabled={validar.isPending || evidencia.trim().length < 10}>Confirmar</button>
      </form>
    </EditorDrawer>}
  </section>;
}

export const nombresOrigen: Record<string, string> = { oc: 'De la OC', historial: 'Historial oficial', regla: 'Regla del historial', persona: 'Corregido por una persona', pendiente: 'Pendiente' };
const fondoOrigen: Record<string, string> = { historial: 'bg-sky-50', regla: 'bg-violet-50', persona: 'bg-green-50', pendiente: 'bg-amber-50 text-amber-700' };
export function celdaOrigen(origen?: string) { return origen ? fondoOrigen[origen] ?? '' : ''; }

type ResultadoImportacion = { archivo: string; estado: 'creada' | 'duplicado' | 'sin_adjuntos_validos' | 'no_soportado' | 'error'; orderId?: string; asunto?: string; remitente?: string | null; adjuntos?: string[]; detalle?: string };
const textoEstado: Record<ResultadoImportacion['estado'], string> = { creada: 'OC creada', duplicado: 'Ya importado', sin_adjuntos_validos: 'Sin adjuntos de OC', no_soportado: 'No admitido', error: 'Error' };

/** Importación manual: arrastrar el correo (.eml) o el adjunto (PDF, Excel, Word, imagen, CSV). */
export function ImportarCorreo() {
  const qc = useQueryClient();
  const [arrastrando, setArrastrando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoImportacion[]>([]);
  const subir = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      return api<{ resultados: ResultadoImportacion[] }>('/correos/importar', { method: 'POST', body: fd });
    },
    onSuccess: (r) => { setResultados(r.resultados); for (const k of ['orders', 'dashboard', 'expo-estado', 'agente-metricas']) qc.invalidateQueries({ queryKey: [k] }); },
  });
  const enviar = (lista: FileList | null) => { const files = [...(lista ?? [])].slice(0, 20); if (files.length) subir.mutate(files); };
  return <section className="panel mb-6 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-bold"><Inbox size={18} /> Importar correo de OC</h2>
        <p className="mt-1 text-sm text-slate-600">Mientras el buzón exportorders no esté conectado: arrastrá el correo guardado (.eml) o el adjunto de la orden (PDF, Excel, Word, imagen o CSV). La plataforma crea la OC, la lee y arma el borrador Worknet para revisar.</p></div>
    </div>
    <label
      onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); enviar(e.dataTransfer.files); }}
      className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center text-sm transition ${arrastrando ? 'border-brand-600 bg-teal-50' : 'border-slate-300 hover:bg-slate-50'}`}>
      <span className="font-semibold text-slate-800">{subir.isPending ? 'Importando…' : 'Soltá acá los archivos o hacé clic para elegirlos'}</span>
      <span className="mt-1 text-xs text-slate-500">Hasta 20 archivos de 20 MB. En Outlook web: abrir el correo → ⋯ → Descargar. Los .msg todavía no se leen: arrastrá el adjunto.</span>
      <input type="file" multiple hidden disabled={subir.isPending} accept=".eml,.msg,.pdf,.xlsx,.xls,.docx,.doc,.csv,.txt,.png,.jpg,.jpeg,.webp" onChange={(e) => { enviar(e.target.files); e.target.value = ''; }} />
    </label>
    {subir.isError && <div className="mt-3"><Notice kind="error">{String(subir.error)}</Notice></div>}
    {resultados.length > 0 && <ul className="mt-4 divide-y rounded-lg border text-sm">{resultados.map((r, i) =>
      <li key={i} className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0"><div className="truncate font-semibold">{r.asunto || r.archivo}</div>
          <div className="text-xs text-slate-500">{[r.remitente, r.adjuntos?.join(', '), r.detalle].filter(Boolean).join(' · ')}</div></div>
        <div className="flex items-center gap-3"><Etiqueta valor={r.estado === 'creada' ? 'conectado' : r.estado === 'duplicado' ? 'configurado' : r.estado === 'error' ? 'error' : 'pendiente'} />
          <span className="text-xs text-slate-600">{textoEstado[r.estado]}</span>
          {r.orderId && <Link className="font-semibold text-brand-600" to={`/ordenes/${r.orderId}`}>Abrir</Link>}</div>
      </li>)}</ul>}
  </section>;
}

/** Carga de CSV Worknet hechos a mano como historial (administradores). */
export function CargarHistorialWorknet() {
  const qc = useQueryClient();
  const [resultados, setResultados] = useState<{ archivo: string; estado: string; filas?: number; detalle?: string }[]>([]);
  const subir = useMutation({
    mutationFn: async (files: File[]) => { const fd = new FormData(); for (const f of files) fd.append('files', f); return api<{ resultados: typeof resultados }>('/expo/historial-worknet', { method: 'POST', body: fd }); },
    onSuccess: (r) => { setResultados(r.resultados); qc.invalidateQueries({ queryKey: ['formato-worknet'] }); qc.invalidateQueries({ queryKey: ['commercial-sources'] }); },
  });
  return <section className="panel mt-5 p-6 text-sm">
    <h2 className="font-bold">Cargar CSV Worknet históricos</h2>
    <p className="mt-1 text-slate-600">Subí los CSV que se cargaron a mano en Worknet (21 o 22 columnas). Con ellos se completan los datos fijos de cada cliente y producto. Un mismo archivo no se carga dos veces.</p>
    <label className={`btn-secondary mt-3 ${subir.isPending ? 'opacity-50' : ''}`}>{subir.isPending ? 'Cargando…' : 'Elegir archivos CSV'}
      <input type="file" multiple hidden accept=".csv" disabled={subir.isPending} onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) subir.mutate(f); e.target.value = ''; }} /></label>
    {subir.isError && <div className="mt-3"><Notice kind="error">{String(subir.error)}</Notice></div>}
    {resultados.length > 0 && <ul className="mt-3 space-y-1">{resultados.map((r, i) => <li key={i}><strong>{r.archivo}</strong>: {r.estado.replaceAll('_', ' ')}{r.filas !== undefined ? ` (${r.filas} filas)` : ''}{r.detalle ? ` · ${r.detalle}` : ''}</li>)}</ul>}
  </section>;
}
