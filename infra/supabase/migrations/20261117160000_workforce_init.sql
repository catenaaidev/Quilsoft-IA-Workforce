-- IA Workforce: private app data. Run in a dedicated Supabase project after review.
create extension if not exists pgcrypto;
create table if not exists public.app_memberships (
  subject text primary key, display_name text, role text not null default 'viewer'
    check(role in ('admin','supervisor','process_owner','operator','viewer','auditor')),
  active boolean not null default false, updated_at timestamptz not null default now());
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  name text not null, description text not null default '', department text not null,
  status text not null default 'draft' check(status in ('draft','active','paused','disabled')),
  model text not null default '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  provider text not null default 'workers-ai', monthly_limit integer not null default 100,
  instruction_version integer not null default 1, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create table if not exists public.agent_instructions (
  id uuid primary key default gen_random_uuid(), agent_id uuid not null references public.agents(id),
  version integer not null, instructions text not null, created_by text not null,
  created_at timestamptz not null default now(), unique(agent_id, version));
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), order_number text, client text,
  issued_at date, received_at timestamptz not null default now(),
  status text not null default 'received' check(status in ('received','processing','review','blocked','approved','csv_generated','completed','error')),
  version integer not null default 1, origin text not null default 'manual',
  email_message_id text unique, created_by text not null,
  assigned_to text, notes text, last_error text,
  updated_at timestamptz not null default now());
create index if not exists ix_orders_status on public.orders(status, updated_at desc);
create index if not exists ix_orders_client on public.orders(client);
create table if not exists public.order_lines (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  sku text not null default '', description text not null default '',
  quantity numeric(18,4) not null default 0, unit text not null default '',
  unit_price numeric(18,4), currency text not null default '',
  technical_status text not null default 'unknown' check(technical_status in ('approved','pending','rejected','missing','unknown')),
  technical_checked_at timestamptz, sort_order integer not null default 0);
create index if not exists ix_order_lines_order on public.order_lines(order_id,sort_order);
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  original_filename text not null, mime_type text not null, size_bytes integer not null,
  sha256 text not null, r2_key text not null unique,
  extraction_status text not null default 'queued' check(extraction_status in ('queued','processing','review','error')),
  extracted_text text, extraction_json jsonb, failure_reason text,
  created_at timestamptz not null default now(), unique(order_id,sha256));
create table if not exists public.erp_csv_mappings (
  id uuid primary key default gen_random_uuid(), name text not null, version integer not null,
  config jsonb not null, validated boolean not null default false,
  validated_by text, validated_at timestamptz,
  active boolean not null default false, unique(name,version));
create unique index if not exists ux_erp_mapping_active on public.erp_csv_mappings(active) where active;
create table if not exists public.generated_csvs (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  mapping_id uuid not null references public.erp_csv_mappings(id),
  r2_key text not null unique, hash text not null, generated_by text not null,
  created_at timestamptz not null default now(), loaded_by text, loaded_at timestamptz);
create table if not exists public.integration_cursors (
  name text primary key, cursor_url text, updated_at timestamptz not null default now());
create table if not exists public.erp_reference (
  kind text not null, code text not null, label text not null, source_version text not null,
  imported_at timestamptz not null default now(), primary key(kind,code,source_version));
create table if not exists public.executions (
  id uuid primary key default gen_random_uuid(), agent_slug text not null,
  order_id uuid references public.orders(id), document_id uuid references public.documents(id),
  status text not null default 'queued', attempts integer not null default 0,
  model text, duration_ms integer, estimated_cost_usd numeric,
  error text, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now());
create table if not exists public.audit_events (
  id bigint generated always as identity primary key, actor_subject text not null,
  action text not null, resource_type text not null, resource_id text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now());
create index if not exists ix_audit_events_time on public.audit_events(occurred_at desc);
-- No browser, anon or authenticated access to tables: service-role Worker only.
-- Per-request roles and resource permissions enforced in the Worker; see SECURITY.md.
do $$ declare tbl text; begin
  foreach tbl in array array['app_memberships','agents','agent_instructions','orders','order_lines',
    'documents','erp_csv_mappings','generated_csvs','integration_cursors','erp_reference','executions','audit_events'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from anon, authenticated',tbl);
  end loop;
end $$;
revoke all on sequence public.audit_events_id_seq from anon,authenticated;
create or replace function public.prevent_audit_modification() returns trigger
language plpgsql as $$ begin raise exception 'Audit events are append-only'; end $$;
drop trigger if exists tr_audit_immutable on public.audit_events;
create trigger tr_audit_immutable before update or delete on public.audit_events
for each row execute function public.prevent_audit_modification();
-- Production approval remains disabled until mapping validated by an authorized human.
insert into public.agents (slug,name,description,department,status) values
('purchase-orders','Órdenes de compra','Lectura, validación y preparación de CSV','Compras','draft')
on conflict (slug) do nothing;
-- Optimistic, atomic edit of product data and order version. Worker authorizes caller first.
create or replace function public.correct_order_line(
 p_order uuid,p_line uuid,p_version integer,p_actor text,p_changes jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare oldline public.order_lines%rowtype;
begin
 if (p_changes - array['sku','description','quantity','unit','unitPrice','currency']) <> '{}'::jsonb then
   raise exception 'Invalid correction field';
 end if;
 update public.orders set status='review',version=version+1,updated_at=now()
 where id=p_order and version=p_version and status not in ('csv_generated','completed');
 if not found then raise exception 'Order version conflict or closed'; end if;
 select * into oldline from public.order_lines where id=p_line and order_id=p_order for update;
 if not found then raise exception 'Line not found'; end if;
 update public.order_lines set
   sku=coalesce(p_changes->>'sku',oldline.sku),
   description=coalesce(p_changes->>'description',oldline.description),
   quantity=coalesce((p_changes->>'quantity')::numeric,oldline.quantity),
   unit=coalesce(p_changes->>'unit',oldline.unit),
   unit_price=case when p_changes ? 'unitPrice' then (p_changes->>'unitPrice')::numeric else oldline.unit_price end,
   currency=coalesce(p_changes->>'currency',oldline.currency),
   technical_status='unknown',technical_checked_at=null
 where id=p_line;
 insert into public.audit_events(actor_subject,action,resource_type,resource_id,details)
 values (p_actor,'order.line_corrected','order',p_order::text,jsonb_build_object('lineId',p_line,'fields',(select jsonb_agg(key) from jsonb_object_keys(p_changes) as key)));
 return true;
end $$;
revoke all on function public.correct_order_line(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.correct_order_line(uuid,uuid,integer,text,jsonb) to service_role;
-- Supporting catalogs for incremental agent governance. No secrets in these records.
create table if not exists public.permission_catalog (
 code text primary key, description text not null);
create table if not exists public.role_permissions (
 role text not null, permission_code text not null references public.permission_catalog(code), primary key(role,permission_code));
create table if not exists public.agent_tools (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 description text not null, approved boolean not null default false,
 tool_contract jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists public.agent_tool_grants (
 agent_id uuid not null references public.agents(id) on delete cascade,
 tool_id uuid not null references public.agent_tools(id) on delete cascade,
 granted_by text not null, created_at timestamptz not null default now(),
 primary key(agent_id,tool_id));
create table if not exists public.knowledge_sources (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references public.agents(id),
 name text not null, source_type text not null, access_policy jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now());
create table if not exists public.automations (
 id uuid primary key default gen_random_uuid(), agent_id uuid not null references public.agents(id),
 name text not null, schedule_cron text, status text not null default 'draft'
 check(status in ('draft','enabled','disabled')), created_by text not null,
 created_at timestamptz not null default now());
create table if not exists public.received_emails (
 id uuid primary key default gen_random_uuid(), graph_message_id text not null unique,
 order_id uuid references public.orders(id), sender_address text, subject text,
 received_at timestamptz, status text not null default 'received',
 created_at timestamptz not null default now());
create table if not exists public.order_approvals (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
 actor_subject text not null, decision text not null check(decision in ('approved','rejected')),
 reason text, created_at timestamptz not null default now());
create table if not exists public.document_extractions (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id),
 model text, extraction jsonb not null, reviewed_by text,
 created_at timestamptz not null default now());
create table if not exists public.integration_registry (
 name text primary key, integration_type text not null, status text not null default 'pending',
 metadata jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now());
do $$ declare tbl text; begin
  foreach tbl in array array['permission_catalog','role_permissions','agent_tools','agent_tool_grants',
    'knowledge_sources','automations','received_emails','order_approvals','document_extractions','integration_registry'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from anon,authenticated',tbl);
  end loop;
end $$;
insert into public.permission_catalog(code,description) values
 ('orders.read','Consultar OC'),('orders.write','Registrar y corregir OC'),
 ('orders.approve','Aprobar OC'),('orders.csv','Exportar y confirmar carga manual'),
 ('documents.read','Consultar originales'),('agents.read','Consultar agentes'),
 ('audit.read','Consultar auditoría'),('admin.agent','Administrar agentes')
on conflict do nothing;
