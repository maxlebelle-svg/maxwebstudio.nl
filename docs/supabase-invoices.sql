-- Max Webstudio - Supabase invoices foundation
-- Uitvoeren in Supabase SQL Editor na customers/websites/projects/quotes.
-- Veilig/idempotent: geen DROP TABLE, geen bestaande data verwijderen.

create extension if not exists "pgcrypto";

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  invoice_number text unique not null,
  customer_id uuid references public.customers(id) on delete restrict,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  subscription_id uuid null,
  type text default 'Website',
  title text,
  status text default 'draft',
  payment_status text default 'draft',
  invoice_date date,
  due_date date,
  paid_at timestamptz,
  subtotal_amount numeric(12,2) default 0,
  vat_amount numeric(12,2) default 0,
  total_amount numeric(12,2) default 0,
  payment_link text,
  demo_payment_link text,
  mollie_payment_id text,
  pdf_file_path text,
  internal_notes text,
  source_quote_number text,
  is_demo boolean default false,
  is_demo_journey boolean default false,
  environment text default 'production',
  deleted_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.invoices add column if not exists external_id text;
alter table public.invoices add column if not exists invoice_number text;
alter table public.invoices add column if not exists customer_id uuid references public.customers(id) on delete restrict;
alter table public.invoices add column if not exists website_id uuid references public.websites(id) on delete set null;
alter table public.invoices add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.invoices add column if not exists quote_id uuid references public.quotes(id) on delete set null;
alter table public.invoices add column if not exists subscription_id uuid null;
alter table public.invoices add column if not exists type text default 'Website';
alter table public.invoices add column if not exists title text;
alter table public.invoices add column if not exists status text default 'draft';
alter table public.invoices add column if not exists payment_status text default 'draft';
alter table public.invoices add column if not exists invoice_date date;
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists paid_at timestamptz;
alter table public.invoices add column if not exists subtotal_amount numeric(12,2) default 0;
alter table public.invoices add column if not exists vat_amount numeric(12,2) default 0;
alter table public.invoices add column if not exists total_amount numeric(12,2) default 0;
alter table public.invoices add column if not exists payment_link text;
alter table public.invoices add column if not exists demo_payment_link text;
alter table public.invoices add column if not exists mollie_payment_id text;
alter table public.invoices add column if not exists pdf_file_path text;
alter table public.invoices add column if not exists internal_notes text;
alter table public.invoices add column if not exists source_quote_number text;
alter table public.invoices add column if not exists is_demo boolean default false;
alter table public.invoices add column if not exists is_demo_journey boolean default false;
alter table public.invoices add column if not exists environment text default 'production';
alter table public.invoices add column if not exists deleted_at timestamptz;
alter table public.invoices add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.invoices add column if not exists created_at timestamptz default now();
alter table public.invoices add column if not exists updated_at timestamptz default now();

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) default 1,
  unit_price numeric(12,2) default 0,
  vat_percentage numeric(5,2) default 21,
  line_subtotal numeric(12,2) default 0,
  line_vat numeric(12,2) default 0,
  line_total numeric(12,2) default 0,
  sort_order integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.invoice_lines add column if not exists external_id text;
alter table public.invoice_lines add column if not exists invoice_id uuid references public.invoices(id) on delete cascade;
alter table public.invoice_lines add column if not exists description text;
alter table public.invoice_lines add column if not exists quantity numeric(12,2) default 1;
alter table public.invoice_lines add column if not exists unit_price numeric(12,2) default 0;
alter table public.invoice_lines add column if not exists vat_percentage numeric(5,2) default 21;
alter table public.invoice_lines add column if not exists line_subtotal numeric(12,2) default 0;
alter table public.invoice_lines add column if not exists line_vat numeric(12,2) default 0;
alter table public.invoice_lines add column if not exists line_total numeric(12,2) default 0;
alter table public.invoice_lines add column if not exists sort_order integer default 0;
alter table public.invoice_lines add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.invoice_lines add column if not exists created_at timestamptz default now();
alter table public.invoice_lines add column if not exists updated_at timestamptz default now();

create index if not exists invoices_customer_id_idx on public.invoices(customer_id);
create index if not exists invoices_website_id_idx on public.invoices(website_id);
create index if not exists invoices_project_id_idx on public.invoices(project_id);
create index if not exists invoices_quote_id_idx on public.invoices(quote_id);
create index if not exists invoices_subscription_id_idx on public.invoices(subscription_id);
create index if not exists invoices_status_idx on public.invoices(status);
create index if not exists invoices_payment_status_idx on public.invoices(payment_status);
create index if not exists invoices_invoice_date_idx on public.invoices(invoice_date);
create index if not exists invoices_deleted_at_idx on public.invoices(deleted_at);
create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines(invoice_id);
create unique index if not exists invoices_external_id_unique_idx on public.invoices(external_id) where external_id is not null and external_id <> '';
create unique index if not exists invoice_lines_invoice_external_unique_idx on public.invoice_lines(invoice_id, external_id);

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

drop policy if exists "Service role beheert invoices" on public.invoices;
create policy "Service role beheert invoices"
on public.invoices
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role beheert invoice_lines" on public.invoice_lines;
create policy "Service role beheert invoice_lines"
on public.invoice_lines
for all
to service_role
using (true)
with check (true);

-- Klant-RLS komt later bij live klantportaal/Auth fase.
-- Tot die tijd lopen admin-acties server-side of gecontroleerd via anon/RLS-test.
