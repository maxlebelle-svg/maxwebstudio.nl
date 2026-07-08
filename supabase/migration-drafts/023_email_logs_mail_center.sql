-- Max Webstudio Mail Center - tracked outbound email history
-- Uitvoeren via Supabase SQL editor of deployment migration runner.
-- Resend blijft alleen verzendprovider; public.email_logs is de CRM-bron voor mailgeschiedenis.

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

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  direction text default 'outbound',
  status text default 'pending',

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

  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  invoice_id uuid,
  project_id uuid references public.projects(id) on delete set null,

  triggered_by text,
  triggered_by_user_id uuid references auth.users(id) on delete set null,

  error_message text,
  error_code text,

  metadata jsonb default '{}'::jsonb,

  constraint email_logs_direction_check
    check (direction in ('outbound', 'inbound')),
  constraint email_logs_status_check
    check (status in ('pending', 'sent', 'failed', 'delivered', 'bounced', 'complained', 'opened', 'clicked'))
);

drop trigger if exists set_email_logs_updated_at on public.email_logs;
create trigger set_email_logs_updated_at
before update on public.email_logs
for each row
execute function public.set_updated_at();

create index if not exists email_logs_created_at_idx
  on public.email_logs (created_at desc);

create index if not exists email_logs_to_email_idx
  on public.email_logs (to_email);

create index if not exists email_logs_customer_id_idx
  on public.email_logs (customer_id);

create index if not exists email_logs_lead_id_idx
  on public.email_logs (lead_id);

create index if not exists email_logs_invoice_id_idx
  on public.email_logs (invoice_id);

create index if not exists email_logs_project_id_idx
  on public.email_logs (project_id);

create index if not exists email_logs_status_idx
  on public.email_logs (status);

create index if not exists email_logs_provider_message_id_idx
  on public.email_logs (provider_message_id);

alter table public.email_logs enable row level security;

drop policy if exists "email_logs_service_role_all" on public.email_logs;
create policy "email_logs_service_role_all"
on public.email_logs
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

grant all on table public.email_logs to service_role;
