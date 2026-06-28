-- Max Webstudio - Supabase subscriptions foundation
-- Uitvoeren in Supabase SQL Editor na customers/websites/projects/invoices.
-- Veilig/idempotent: geen DROP TABLE, geen bestaande data verwijderen.

create extension if not exists "pgcrypto";

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  customer_id uuid references public.customers(id) on delete restrict,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  last_invoice_id uuid references public.invoices(id) on delete set null,
  plan text,
  status text default 'draft',
  start_date date,
  end_date date,
  next_invoice_date date,
  last_invoice_date date,
  invoice_frequency text default 'monthly',
  price_ex_vat numeric(12,2) default 0,
  vat_percentage numeric(5,2) default 21,
  total_incl_vat numeric(12,2) default 0,
  auto_invoice_enabled boolean default false,
  payment_provider_customer_id text,
  payment_mandate_id text,
  mollie_customer_id text,
  mollie_subscription_id text,
  mollie_subscription_status text,
  subscription_invoice_sequence integer default 0,
  next_auto_invoice_run date,
  invoice_generation_log jsonb default '[]'::jsonb,
  internal_notes text,
  is_demo boolean default false,
  is_demo_journey boolean default false,
  environment text default 'production',
  deleted_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions add column if not exists external_id text;
alter table public.subscriptions add column if not exists customer_id uuid references public.customers(id) on delete restrict;
alter table public.subscriptions add column if not exists website_id uuid references public.websites(id) on delete set null;
alter table public.subscriptions add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.subscriptions add column if not exists last_invoice_id uuid references public.invoices(id) on delete set null;
alter table public.subscriptions add column if not exists plan text;
alter table public.subscriptions add column if not exists status text default 'draft';
alter table public.subscriptions add column if not exists start_date date;
alter table public.subscriptions add column if not exists end_date date;
alter table public.subscriptions add column if not exists next_invoice_date date;
alter table public.subscriptions add column if not exists last_invoice_date date;
alter table public.subscriptions add column if not exists invoice_frequency text default 'monthly';
alter table public.subscriptions add column if not exists price_ex_vat numeric(12,2) default 0;
alter table public.subscriptions add column if not exists vat_percentage numeric(5,2) default 21;
alter table public.subscriptions add column if not exists total_incl_vat numeric(12,2) default 0;
alter table public.subscriptions add column if not exists auto_invoice_enabled boolean default false;
alter table public.subscriptions add column if not exists payment_provider_customer_id text;
alter table public.subscriptions add column if not exists payment_mandate_id text;
alter table public.subscriptions add column if not exists mollie_customer_id text;
alter table public.subscriptions add column if not exists mollie_subscription_id text;
alter table public.subscriptions add column if not exists mollie_subscription_status text;
alter table public.subscriptions add column if not exists subscription_invoice_sequence integer default 0;
alter table public.subscriptions add column if not exists next_auto_invoice_run date;
alter table public.subscriptions add column if not exists invoice_generation_log jsonb default '[]'::jsonb;
alter table public.subscriptions add column if not exists internal_notes text;
alter table public.subscriptions add column if not exists is_demo boolean default false;
alter table public.subscriptions add column if not exists is_demo_journey boolean default false;
alter table public.subscriptions add column if not exists environment text default 'production';
alter table public.subscriptions add column if not exists deleted_at timestamptz;
alter table public.subscriptions add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.subscriptions add column if not exists created_at timestamptz default now();
alter table public.subscriptions add column if not exists updated_at timestamptz default now();

create index if not exists subscriptions_customer_id_idx on public.subscriptions(customer_id);
create index if not exists subscriptions_website_id_idx on public.subscriptions(website_id);
create index if not exists subscriptions_project_id_idx on public.subscriptions(project_id);
create index if not exists subscriptions_last_invoice_id_idx on public.subscriptions(last_invoice_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);
create index if not exists subscriptions_next_invoice_date_idx on public.subscriptions(next_invoice_date);
create index if not exists subscriptions_invoice_frequency_idx on public.subscriptions(invoice_frequency);
create index if not exists subscriptions_deleted_at_idx on public.subscriptions(deleted_at);
create unique index if not exists subscriptions_external_id_unique_idx on public.subscriptions(external_id) where external_id is not null and external_id <> '';
create unique index if not exists subscriptions_active_customer_website_plan_unique_idx
on public.subscriptions(customer_id, website_id, plan)
where status = 'active' and deleted_at is null;

alter table public.subscriptions enable row level security;

drop policy if exists "Service role beheert subscriptions" on public.subscriptions;
create policy "Service role beheert subscriptions"
on public.subscriptions
for all
to service_role
using (true)
with check (true);

-- Klant-RLS komt later bij live klantportaal/Auth fase.
-- Tot die tijd lopen admin-acties server-side of gecontroleerd via anon/RLS-test.
