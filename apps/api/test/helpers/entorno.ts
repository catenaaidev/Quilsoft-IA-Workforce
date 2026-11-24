/**
 * Entorno de prueba: D1 real de SQLite en memoria (node:sqlite) con las migraciones
 * reales del proyecto, y DOBLES de Workers AI, R2, la cola y BESA. Los dobles solo
 * existen en test/: no son integraciones ni se despliegan.
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRACIONES = join(__dirname, '..', '..', '..', '..', 'infra', 'cloudflare', 'migrations');

export function crearD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(MIGRACIONES).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(MIGRACIONES, f), 'utf8'));
  const norm = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  class Stmt {
    constructor(public sql: string, public args: unknown[] = []) {}
    bind(...a: unknown[]) { return new Stmt(this.sql, a.map(norm)); }
    private filas() { return db.prepare(this.sql).all(...(this.args as never[])).map((r) => ({ ...r })); }
    private ejecutar() {
      if (/^\s*(select|with)/i.test(this.sql) || /returning/i.test(this.sql)) return { success: true, results: this.filas(), meta: { changes: 0 } };
      const r = db.prepare(this.sql).run(...(this.args as never[]));
      return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    }
    async first<T>(col?: string): Promise<T | null> { const r = this.filas()[0] ?? null; return (col ? (r ? (r as any)[col] : null) : r) as T; }
    async all<T>() { return { success: true, results: this.filas() as T[], meta: {} }; }
    async run() { return this.ejecutar(); }
    _batch() { return this.ejecutar(); }
  }
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(sql),
    async batch(stmts: Stmt[]) { db.exec('BEGIN'); try { const o = stmts.map((s) => s._batch()); db.exec('COMMIT'); return o; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    async exec(sql: string) { db.exec(sql); return { count: 1 }; },
  };
}

export function crearR2() {
  const m = new Map<string, { bytes: Uint8Array; meta: any }>();
  return {
    mapa: m,
    async put(key: string, v: ArrayBuffer | Uint8Array | string, meta?: any) {
      const bytes = typeof v === 'string' ? new TextEncoder().encode(v) : v instanceof Uint8Array ? v : new Uint8Array(v);
      m.set(key, { bytes, meta });
    },
    async get(key: string) {
      const o = m.get(key);
      if (!o) return null;
      return { body: o.bytes, arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength), text: async () => new TextDecoder().decode(o.bytes) };
    },
  };
}

/** Workers AI simulado: respuestas preparadas por modelo; registra cada llamada. */
export function crearAI(respuestas: Record<string, unknown[]>, markdown = 'texto de la orden') {
  const llamadas: { modelo: string; input: any }[] = [];
  return {
    llamadas,
    async run(modelo: string, input: unknown) {
      llamadas.push({ modelo, input });
      const cola = respuestas[modelo];
      if (!cola?.length) throw new Error(`sin respuesta preparada para ${modelo}`);
      return cola.shift();
    },
    async toMarkdown() { return { data: markdown }; },
  };
}

export function crearEnv(extra: Record<string, unknown> = {}) {
  const enviados: unknown[] = [];
  return {
    APP_ENV: 'production',
    DB: crearD1(),
    DOCS: crearR2(),
    JOBS: { send: async (m: unknown) => { enviados.push(m); } , enviados },
    AI: crearAI({}),
    IDENTITY: { fetch: async () => Response.json({ ok: true, principal_id: '11111111-1111-4111-8111-111111111111', name: 'Ana Admin', app_role: 'administrador' }) },
    ...extra,
  } as any;
}

export const COOKIE = { cookie: '__Host-iawf_session=' + 'a'.repeat(43) };

/** Historial Worknet ANONIMIZADO cargado como "Fuente comercial" (mismo formato que el CSV real). */
export const HEADERS = ['OC', 'Fecha PI', 'Fecha PO', 'Fecha Req. Carga', 'Cod. Cliente', 'Destino', 'Cod. Condicion', 'Cod. Lista de Precio', 'Desc. A Nivel Pedido (S / N) ?', '', 'Codigo de producto', 'Deposito (VF / Junin) = Cod. Deposito Detalle', 'Cantidad de cajas', 'Precio unit(USD)', '% Desc.', 'Cantidad de Pallet', 'Contenedor', 'Tipo de Pallet', 'Incoterm', 'Cajas x Pallet', 'Observaciones', 'Observaciones Ampliada'];
export const HIST = [
  ['TEST001P-1VF', '10/11/2026', '10/11/2026', '15/12/2026', '999001EXP', '511', '45', '43', '10', 'CAT ALT MB', '2191-23-407', '77', '140', '89,25', '10', '1', '2', '1', 'FOB', '140', "1X40' ARMAR 2 PALLETS", ''],
  ['TEST001P-1VF', '10/11/2026', '10/11/2026', '15/12/2026', '999001EXP', '511', '45', '43', '10', 'CLASS MB', '285-24-407', '77', '420', '76,4', '10', '6', '2', '1', 'FOB', '70', "1X40' ARMAR 2 PALLETS", ''],
];

export function cargarHistorial(env: any) {
  const db = env.DB.raw as DatabaseSync;
  db.prepare("INSERT INTO workforce_import_sources(id,filename,kind,sheet_name,headers_json,imported_at) VALUES ('hist-1','PRUEBA.csv','csv','Ordenes',?,datetime('now'))").run(JSON.stringify(HEADERS));
  HIST.forEach((r, i) => db.prepare('INSERT INTO workforce_import_rows(source_id,row_number,values_json) VALUES (?,?,?)').run('hist-1', i + 2, JSON.stringify(r)));
  db.prepare("INSERT INTO customer_price_lists(id,client_name,market,primary_list_code) VALUES ('cpl-test','Importador Prueba SA','EE.UU.','43')").run();
}
