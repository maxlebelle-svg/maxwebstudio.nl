create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$ select current_user::text $$;

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  direction text default 'outbound' check (direction = any(array['outbound','inbound'])),
  status text default 'pending' check (status = any(array['pending','sent','failed','delivered','bounced','complained','opened','clicked'])),
  provider text default 'resend',
  provider_message_id text,
  from_email text,
  from_name text,
  to_email text not null,
  to_name text,
  reply_to text,
  subject text not null,
  html_body text,
  text_body text,
  template_key text,
  template_name text,
  customer_id uuid,
  lead_id uuid,
  invoice_id uuid,
  project_id uuid,
  triggered_by text,
  triggered_by_user_id uuid,
  error_message text,
  error_code text,
  metadata jsonb default '{}'::jsonb
);

create index email_logs_created_at_idx on public.email_logs(created_at desc);
create index email_logs_customer_id_idx on public.email_logs(customer_id);
create index email_logs_invoice_id_idx on public.email_logs(invoice_id);
create index email_logs_lead_id_idx on public.email_logs(lead_id);
create index email_logs_project_id_idx on public.email_logs(project_id);
create index email_logs_provider_message_id_idx on public.email_logs(provider_message_id);
create index email_logs_status_idx on public.email_logs(status);
create index email_logs_to_email_idx on public.email_logs(to_email);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_email_logs_updated_at
before update on public.email_logs
for each row execute function public.set_updated_at();

alter table public.email_logs enable row level security;
create policy email_logs_service_role_all on public.email_logs
  for all to public
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

grant all privileges on table public.email_logs to postgres;
grant all privileges on table public.email_logs to anon;
grant all privileges on table public.email_logs to authenticated;
grant all privileges on table public.email_logs to service_role;

insert into public.email_logs (
  id,created_at,updated_at,direction,status,provider,provider_message_id,
  from_email,from_name,to_email,to_name,reply_to,subject,html_body,text_body,
  template_key,template_name,triggered_by,metadata
)
select
  ('00000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
  '2026-07-01T00:00:00Z'::timestamptz + (g || ' minutes')::interval,
  '2026-07-01T00:00:00Z'::timestamptz + (g || ' minutes')::interval,
  'outbound','sent','resend','provider-' || g,
  'info@example.test','Max Webstudio','legacy-' || g || '@example.test','Legacy ' || g,
  'info@example.test','Legacy message ' || g,'<p>Legacy</p>','Legacy',
  'legacy-template','Legacy template',case when g <= 15 then 'legacy_flow' else null end,
  jsonb_build_object('fixture',true,'row',g)
from generate_series(1,56) g;
