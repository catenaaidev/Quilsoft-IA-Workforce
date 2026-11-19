-- Additive: does not modify any pre-existing ERP purchasing data.
create table if not exists public.oc_worknet_orders (
 id uuid primary key, order_number text not null unique, customer text not null,
 received_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 source_name text not null, source_csv text not null, status text not null default 'blocked',
 reviewed_by text, reviewed_at timestamptz, exported_at timestamptz, exported_by text,
 version integer not null default 1,
 constraint oc_worknet_order_status check (status in ('blocked','pending_review','ready','downloaded'))
);
create table if not exists public.oc_worknet_lines (
 id uuid primary key, order_id uuid not null references public.oc_worknet_orders(id) on delete cascade,
 idx integer not null, fields_json text not null, sku text not null,
 loyal_status text not null default 'unknown', loyal_checked_at timestamptz, loyal_evidence text,
 unique(order_id, idx),
 constraint oc_worknet_loyal_states check (loyal_status in ('approved','pending','observed','missing','unknown','error'))
);
create table if not exists public.oc_worknet_audit (
 id uuid primary key, order_id uuid references public.oc_worknet_orders(id) on delete cascade,
 actor text not null, action text not null, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.oc_worknet_mail_messages (
 graph_id text primary key, internet_message_id text, sender text, subject text,
 received_at timestamptz not null, status text not null default 'received',
 original_key text, error text, updated_at timestamptz not null default now()
);
create table if not exists public.oc_worknet_mail_attachments (
 graph_id text not null references public.oc_worknet_mail_messages(graph_id) on delete cascade,
 attachment_id text not null, filename text not null, content_type text,
 bytes bigint not null, r2_key text not null, stored_at timestamptz not null default now(),
 primary key(graph_id, attachment_id)
);
create table if not exists public.oc_worknet_mail_sync (
 mailbox text primary key, cursor_url text, updated_at timestamptz not null default now()
);
create table if not exists public.oc_worknet_mail_runs (
 id uuid primary key default gen_random_uuid(), run_at timestamptz not null default now(),
 result text not null, details jsonb not null default '{}'::jsonb
);
create index if not exists oc_worknet_lines_order_idx on public.oc_worknet_lines(order_id);
create index if not exists oc_worknet_audit_order_idx on public.oc_worknet_audit(order_id,created_at desc);
create index if not exists oc_worknet_mail_received_idx on public.oc_worknet_mail_messages(received_at desc);
-- No direct browser access, even to signed-in Supabase users; the corporate auth is handled by the Worker.
alter table public.oc_worknet_orders enable row level security;
alter table public.oc_worknet_lines enable row level security;
alter table public.oc_worknet_audit enable row level security;
alter table public.oc_worknet_mail_messages enable row level security;
alter table public.oc_worknet_mail_attachments enable row level security;
alter table public.oc_worknet_mail_sync enable row level security;
alter table public.oc_worknet_mail_runs enable row level security;
revoke all on public.oc_worknet_orders,public.oc_worknet_lines,public.oc_worknet_audit,
 public.oc_worknet_mail_messages,public.oc_worknet_mail_attachments,public.oc_worknet_mail_sync,
 public.oc_worknet_mail_runs from anon, authenticated, public;
grant select,insert,update,delete on public.oc_worknet_orders,public.oc_worknet_lines,
 public.oc_worknet_audit,public.oc_worknet_mail_messages,public.oc_worknet_mail_attachments,
 public.oc_worknet_mail_sync,public.oc_worknet_mail_runs to service_role;
-- Server-readable dashboard with row counts and outstanding Loyal validations.
create or replace view public.oc_worknet_dashboard with (security_invoker=true) as
select o.id,o.order_number,o.customer,o.received_at,o.updated_at,o.status,o.reviewed_by,
 o.reviewed_at,o.exported_at,
 (select count(*) from public.oc_worknet_lines l where l.order_id=o.id) as line_count,
 (select count(*) from public.oc_worknet_lines l where l.order_id=o.id and l.loyal_status <> 'approved') as unresolved
from public.oc_worknet_orders o;
revoke all on public.oc_worknet_dashboard from anon, authenticated, public;
grant select on public.oc_worknet_dashboard to service_role;
