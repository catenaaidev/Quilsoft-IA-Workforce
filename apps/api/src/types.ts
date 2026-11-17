import type { CsvMapping, Line, Order } from '@workforce/domain';
export type Role = 'admin'|'supervisor'|'process_owner'|'operator'|'viewer'|'auditor';
export type Actor = { subject:string; displayName:string; role:Role };
export type Bindings = {
  APP_ENV: 'development'|'staging'|'production';
  SSO_ISSUER?:string; SSO_AUDIENCE?:string; SSO_JWKS_URL?:string;
  SUPABASE_URL?:string; SUPABASE_SERVICE_ROLE_KEY?:string;
  GRAPH_TENANT_ID?:string; GRAPH_CLIENT_ID?:string; GRAPH_CLIENT_SECRET?:string; GRAPH_MAILBOX?:string;
  AI_MODEL?:string; DOC_PROCESSOR_URL?:string; DOC_PROCESSOR_TOKEN?:string;
  AI: { run: (model:string, input:unknown)=>Promise<unknown>; toMarkdown: (files:any)=>Promise<any> };
  DOCS: R2Bucket; JOBS: Queue<{ orderId: string; documentId: string; runId?: string }>;
  PURCHASE_WORKFLOW: Workflow;
  PURCHASE_AGENT: DurableObjectNamespace;
};
export type AppVariables={actor: Actor};
export type DomainOrder = Order;
export type DomainLine = Line;
export type DomainCsvMapping = CsvMapping;
