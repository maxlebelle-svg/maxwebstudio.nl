-- Max Webstudio - Supabase production schema preparation
-- Fase 11.3: voorbereiding/documentatie. Niet automatisch uitvoeren.
-- Geen secrets, geen live switch. LocalStorage blijft actief tot latere fases.

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

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text,
  email text,
  phone text,
  role text default 'customer',
  status text default 'active',
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text,
  company text,
  email text,
  phone text,
  website text,
  package text,
  status text default 'active',
  customer_since date,
  portal_status text default 'prepared',
  notes text,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  name text,
  company text,
  email text,
  phone text,
  source text default 'website',
  interest text,
  status text default 'new',
  converted_customer_id uuid references public.customers(id) on delete set null,
  message text,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.websites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  name text,
  domain text,
  live_url text,
  staging_url text,
  github_repo_url text,
  github_branch text default 'main',
  netlify_project_name text,
  netlify_site_id text,
  status text default 'online',
  hosting_package text,
  care_package text,
  ssl_status text default 'unknown',
  last_deploy_at timestamptz,
  last_update_at timestamptz,
  notes text,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  name text,
  type text,
  status text default 'new',
  phase text,
  progress integer default 0 check (progress >= 0 and progress <= 100),
  start_date date,
  deadline date,
  checklist jsonb default '[]'::jsonb,
  tasks jsonb default '[]'::jsonb,
  timeline jsonb default '[]'::jsonb,
  notes text,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  name text,
  file_type text,
  category text,
  location text,
  storage_path text,
  status text default 'active',
  notes text,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  quote_number text,
  type text,
  title text,
  status text default 'draft',
  quote_date date,
  valid_until date,
  subtotal numeric(12,2) default 0,
  vat numeric(12,2) default 0,
  total numeric(12,2) default 0,
  converted_to_invoice_id uuid,
  proposal text,
  notes text,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text,
  quantity numeric(12,2) default 1,
  unit_price numeric(12,2) default 0,
  vat_rate numeric(5,2) default 21,
  line_total numeric(12,2) default 0,
  position integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  source_quote_id uuid references public.quotes(id) on delete set null,
  subscription_id uuid,
  invoice_number text,
  type text,
  title text,
  status text default 'draft',
  invoice_date date,
  due_date date,
  paid_at timestamptz,
  subtotal numeric(12,2) default 0,
  vat numeric(12,2) default 0,
  total numeric(12,2) default 0,
  payment_link text,
  pdf_file_path text,
  notes text,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text,
  quantity numeric(12,2) default 1,
  unit_price numeric(12,2) default 0,
  vat_rate numeric(5,2) default 21,
  line_total numeric(12,2) default 0,
  position integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  plan text,
  status text default 'active',
  billing_cycle text default 'monthly',
  price_ex_vat numeric(12,2) default 0,
  vat_rate numeric(5,2) default 21,
  total_incl_vat numeric(12,2) default 0,
  start_date date,
  next_invoice_date date,
  last_invoice_id uuid references public.invoices(id) on delete set null,
  last_invoice_date date,
  auto_invoice_enabled boolean default false,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_subscription_id_fkey'
  ) then
    alter table public.invoices
      add constraint invoices_subscription_id_fkey
      foreign key (subscription_id) references public.subscriptions(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quotes_converted_to_invoice_id_fkey'
  ) then
    alter table public.quotes
      add constraint quotes_converted_to_invoice_id_fkey
      foreign key (converted_to_invoice_id) references public.invoices(id) on delete set null;
  end if;
end;
$$;

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  workspace_key text unique default 'default',
  company_name text,
  email text,
  phone text,
  invoice_prefix text default 'INV',
  quote_prefix text default 'OFF',
  default_vat_rate numeric(5,2) default 21,
  payment_term_days integer default 14,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.demo_emails (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  type text,
  subject text,
  recipient text,
  body text,
  status text default 'demo',
  is_demo boolean default true,
  environment text default 'demo',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  action text,
  performed_by text,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.import_logs (
  id uuid primary key default gen_random_uuid(),
  status text,
  mode text,
  imported_keys text[],
  added_records integer default 0,
  skipped_records integer default 0,
  error_message text,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists profiles_auth_user_id_idx on public.profiles(auth_user_id);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists customers_profile_id_idx on public.customers(profile_id);
create index if not exists customers_auth_user_id_idx on public.customers(auth_user_id);
create index if not exists websites_customer_id_idx on public.websites(customer_id);
create index if not exists projects_customer_id_idx on public.projects(customer_id);
create index if not exists projects_website_id_idx on public.projects(website_id);
create index if not exists files_customer_id_idx on public.files(customer_id);
create index if not exists files_project_id_idx on public.files(project_id);
create index if not exists quotes_customer_id_idx on public.quotes(customer_id);
create unique index if not exists quotes_quote_number_idx on public.quotes(quote_number) where quote_number is not null;
create index if not exists quote_lines_quote_id_idx on public.quote_lines(quote_id);
create index if not exists invoices_customer_id_idx on public.invoices(customer_id);
create index if not exists invoices_source_quote_id_idx on public.invoices(source_quote_id);
create index if not exists invoices_subscription_id_idx on public.invoices(subscription_id);
create unique index if not exists invoices_invoice_number_idx on public.invoices(invoice_number) where invoice_number is not null;
create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines(invoice_id);
create index if not exists subscriptions_customer_id_idx on public.subscriptions(customer_id);
create index if not exists subscriptions_website_id_idx on public.subscriptions(website_id);
create index if not exists activity_logs_entity_idx on public.activity_logs(entity_type, entity_id);
create index if not exists activity_logs_profile_id_idx on public.activity_logs(profile_id);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at before update on public.leads for each row execute function public.set_updated_at();
drop trigger if exists set_websites_updated_at on public.websites;
create trigger set_websites_updated_at before update on public.websites for each row execute function public.set_updated_at();
drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
drop trigger if exists set_files_updated_at on public.files;
create trigger set_files_updated_at before update on public.files for each row execute function public.set_updated_at();
drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at before update on public.quotes for each row execute function public.set_updated_at();
drop trigger if exists set_quote_lines_updated_at on public.quote_lines;
create trigger set_quote_lines_updated_at before update on public.quote_lines for each row execute function public.set_updated_at();
drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
drop trigger if exists set_invoice_lines_updated_at on public.invoice_lines;
create trigger set_invoice_lines_updated_at before update on public.invoice_lines for each row execute function public.set_updated_at();
drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
drop trigger if exists set_settings_updated_at on public.settings;
create trigger set_settings_updated_at before update on public.settings for each row execute function public.set_updated_at();
drop trigger if exists set_demo_emails_updated_at on public.demo_emails;
create trigger set_demo_emails_updated_at before update on public.demo_emails for each row execute function public.set_updated_at();
drop trigger if exists set_import_logs_updated_at on public.import_logs;
create trigger set_import_logs_updated_at before update on public.import_logs for each row execute function public.set_updated_at();
