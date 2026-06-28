-- Max Webstudio - Quotes Supabase foundation
-- Doel: veilige voorbereiding voor offerte-migratie vanuit localStorage naar Supabase.
-- Uitvoeren in Supabase SQL Editor. Geen DROP statements.

create extension if not exists "pgcrypto";

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  quote_number text unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_external_id text,
  website_id uuid references public.websites(id) on delete set null,
  website_external_id text,
  project_id uuid references public.projects(id) on delete set null,
  project_external_id text,
  quote_type text,
  title text,
  status text default 'draft',
  quote_date date,
  valid_until date,
  accepted_at timestamptz,
  subtotal numeric default 0,
  vat_amount numeric default 0,
  total_amount numeric default 0,
  proposal text,
  internal_notes text,
  demo_quote_link text,
  converted_to_invoice_id text,
  converted_at timestamptz,
  is_demo boolean default false,
  is_demo_journey boolean default false,
  environment text default 'production',
  demo_scenario_id text,
  demo_journey_id text,
  source text default 'crm',
  metadata jsonb default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  external_id text,
  description text not null,
  quantity numeric default 1,
  unit_price numeric default 0,
  vat_percentage numeric default 21,
  subtotal numeric default 0,
  vat_amount numeric default 0,
  total numeric default 0,
  sort_order integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.quotes add column if not exists external_id text;
alter table public.quotes add column if not exists quote_number text;
alter table public.quotes add column if not exists customer_id uuid;
alter table public.quotes add column if not exists customer_external_id text;
alter table public.quotes add column if not exists website_id uuid;
alter table public.quotes add column if not exists website_external_id text;
alter table public.quotes add column if not exists project_id uuid;
alter table public.quotes add column if not exists project_external_id text;
alter table public.quotes add column if not exists quote_type text;
alter table public.quotes add column if not exists accepted_at timestamptz;
alter table public.quotes add column if not exists deleted_at timestamptz;
alter table public.quotes add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.quote_lines add column if not exists external_id text;
alter table public.quote_lines add column if not exists metadata jsonb default '{}'::jsonb;

create index if not exists idx_quotes_customer_id on public.quotes(customer_id);
create index if not exists idx_quotes_website_id on public.quotes(website_id);
create index if not exists idx_quotes_project_id on public.quotes(project_id);
create index if not exists idx_quotes_status on public.quotes(status);
create index if not exists idx_quotes_quote_number on public.quotes(quote_number);
create index if not exists idx_quotes_external_id on public.quotes(external_id);
create index if not exists idx_quote_lines_quote_id on public.quote_lines(quote_id);

alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;

-- Admin/server-side beheer gebruikt de Supabase service role.
-- Klanttoegang tot offertes komt later via Auth/RLS-audit in de klantportaalfase.
drop policy if exists "quotes_service_role_all" on public.quotes;
create policy "quotes_service_role_all"
on public.quotes
for all
to service_role
using (true)
with check (true);

drop policy if exists "quote_lines_service_role_all" on public.quote_lines;
create policy "quote_lines_service_role_all"
on public.quote_lines
for all
to service_role
using (true)
with check (true);
