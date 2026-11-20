import type { CsvMapping, Line, Order } from '@workforce/domain';
export type Role = 'admin'|'supervisor'|'process_owner'|'operator'|'viewer'|'auditor';
export type Actor = { subject:string; displayName:string; role:Role };
export type Bindings = {
  APP_ENV: 'development'|'staging'|'production';
  SSO_ISSUER?:string; SSO_AUDIENCE?:string; SSO_JWKS_URL?:string;
  DB: D1Database; // Cloudflare-native temporary database until Supabase is upgraded
  GRAPH_TENANT_ID?:string; GRAPH_CLIENT_ID?:string; GRAPH_CLIENT_SECRET?:string; GRAPH_MAILBOX?:string;
  AI_MODEL?:string; DOC_PROCESSOR_URL?:string; DOC_PROCESSOR_TOKEN?:string;
  /** Endpoint oficial HTTPS con {sku} para reemplazar el código URL-encoded; consultar, nunca escribir. */
  LOYAL_LOOKUP_URL_TEMPLATE?:string;
  LOYAL_READ_TOKEN?:string;
  /** Valor EXACTO que el proveedor identifica como ficha aprobada (no asumir equivalencias). */
  LOYAL_APPROVED_VALUE?:string;
  IDENTITY: Fetcher; // service binding to BESA central SSO
  AI: { run: (model:string, input:unknown)=>Promise<unknown>; toMarkdown: (files:any)=>Promise<any> };
  DOCS: R2Bucket; JOBS: Queue<{ orderId: string; documentId: string; runId?: string }>;
  PURCHASE_WORKFLOW: Workflow;
  PURCHASE_AGENT: DurableObjectNamespace;
};
export type AppVariables={actor: Actor};
export type DomainOrder = Order;
export type DomainLine = Line;
export type DomainCsvMapping = CsvMapping;
