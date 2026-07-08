-- Max CRM customer timeline + global activity feed
-- Uitvoeren via Supabase SQL editor of deployment migration runner.
-- Alleen server-side service_role mag events schrijven/lezen via Netlify Functions.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.customer_timeline_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,

  event_type text not null,
  title text not null,
  description text,
  module text not null,

  reference_type text,
  reference_id text,

  actor_name text,
  actor_role text,
  icon text,
  severity text default 'info',
  is_global boolean default true,

  invoice_id text,
  email_log_id text,
  related_type text,
  related_id text,

  is_read boolean default false,
  read_at timestamptz,
  archived_at timestamptz,

  metadata jsonb default '{}'::jsonb
);

alter table public.customer_timeline_events
  add column if not exists invoice_id text,
  add column if not exists email_log_id text,
  add column if not exists related_type text,
  add column if not exists related_id text,
  add column if not exists is_read boolean default false,
  add column if not exists read_at timestamptz,
  add column if not exists archived_at timestamptz;

drop trigger if exists set_customer_timeline_events_updated_at on public.customer_timeline_events;
create trigger set_customer_timeline_events_updated_at
before update on public.customer_timeline_events
for each row
execute function public.set_updated_at();

create index if not exists customer_timeline_events_created_at_idx
  on public.customer_timeline_events (created_at desc);

create index if not exists customer_timeline_events_customer_id_idx
  on public.customer_timeline_events (customer_id);

create index if not exists customer_timeline_events_lead_id_idx
  on public.customer_timeline_events (lead_id);

create index if not exists customer_timeline_events_module_idx
  on public.customer_timeline_events (module);

create index if not exists customer_timeline_events_event_type_idx
  on public.customer_timeline_events (event_type);

create index if not exists customer_timeline_events_severity_idx
  on public.customer_timeline_events (severity);

create index if not exists customer_timeline_events_is_global_idx
  on public.customer_timeline_events (is_global);

create index if not exists customer_timeline_events_is_read_idx
  on public.customer_timeline_events (is_read);

create index if not exists customer_timeline_events_invoice_id_idx
  on public.customer_timeline_events (invoice_id);

create index if not exists customer_timeline_events_email_log_id_idx
  on public.customer_timeline_events (email_log_id);

create index if not exists customer_timeline_events_archived_at_idx
  on public.customer_timeline_events (archived_at);

alter table public.customer_timeline_events enable row level security;

drop policy if exists "customer_timeline_events_service_role_all" on public.customer_timeline_events;
create policy "customer_timeline_events_service_role_all"
on public.customer_timeline_events
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

grant all on table public.customer_timeline_events to service_role;
