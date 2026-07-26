-- FOUNDATION F0-b — LOCAL AUTHORITATIVE BASELINE
-- WARNING: ONLY FOR A COMPLETELY EMPTY LOCAL DATABASE.
-- DO NOT APPLY TO AN EXISTING SUPABASE PROJECT.
-- NO PRODUCTION USE WITHOUT F0-c AND F0-d APPROVAL.
-- CURRENT LINEAGE GAPS (20260720160000 AND 20260720200000) ARE NOT RESOLVED.
-- This file is a target-state baseline, not a reconstruction of missing historical migrations.


-- 01-08. Extensions, platform schemas, tables, constraints and base indexes.

-- Max Webstudio - Supabase Schema Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION
-- Source docs:
-- - docs/SUPABASE_CANONICAL_SCHEMA.md
-- - docs/SUPABASE_PRODUCTION_READINESS_PLAN.md
-- - docs/SUPABASE_RLS_POLICY_PLAN.md

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
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text,
  email text,
  phone text,
  role text not null default 'customer',
  status text not null default 'active',
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  last_login_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('super_admin', 'admin', 'sales', 'support', 'developer', 'customer', 'demo_user')),
  constraint profiles_status_check check (status in ('active', 'pending', 'disabled', 'archived')),
  constraint profiles_environment_check check (environment in ('production', 'test', 'demo'))
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
  status text not null default 'active',
  customer_since date,
  portal_status text not null default 'prepared',
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_status_check check (status in ('active', 'onboarding', 'paused', 'archived')),
  constraint customers_portal_status_check check (portal_status in ('prepared', 'invited', 'active', 'disabled')),
  constraint customers_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'website',
  company text,
  name text,
  email text,
  phone text,
  branch text,
  region text,
  website_url text,
  website_status text default 'unknown',
  lead_score integer default 0 check (lead_score >= 0 and lead_score <= 100),
  call_status text default 'new',
  follow_up_date date,
  status text not null default 'new',
  converted_customer_id uuid references public.customers(id) on delete set null,
  converted_at timestamptz,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_status_check check (status in ('new', 'qualified', 'contacted', 'follow_up', 'converted', 'lost', 'archived')),
  constraint leads_environment_check check (environment in ('production', 'test', 'demo'))
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
  status text not null default 'online',
  hosting_package text,
  care_package text,
  ssl_status text default 'unknown',
  hosting_status text default 'unknown',
  uptime_status text default 'unknown',
  dns_status text default 'unknown',
  performance_score integer check (performance_score is null or (performance_score >= 0 and performance_score <= 100)),
  seo_score integer check (seo_score is null or (seo_score >= 0 and seo_score <= 100)),
  mobile_score integer check (mobile_score is null or (mobile_score >= 0 and mobile_score <= 100)),
  desktop_score integer check (desktop_score is null or (desktop_score >= 0 and desktop_score <= 100)),
  monitor_enabled boolean not null default true,
  last_deploy_at timestamptz,
  last_update_at timestamptz,
  last_checked_at timestamptz,
  last_uptime_check timestamptz,
  ssl_expires_at timestamptz,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint websites_status_check check (status in ('online', 'development', 'maintenance', 'waiting_customer', 'offline', 'archived')),
  constraint websites_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  name text,
  type text,
  status text not null default 'new',
  phase text,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  start_date date,
  deadline date,
  checklist jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_status_check check (status in ('new', 'onboarding', 'design', 'development', 'feedback', 'testing', 'live', 'maintenance', 'paused', 'archived')),
  constraint projects_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  quote_number text,
  type text,
  title text,
  status text not null default 'draft',
  quote_date date,
  valid_until date,
  subtotal numeric(12,2) not null default 0,
  vat numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  converted_to_invoice_id uuid,
  accepted_at timestamptz,
  sent_at timestamptz,
  proposal text,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_status_check check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'archived')),
  constraint quotes_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  vat_rate numeric(5,2) not null default 21,
  line_total numeric(12,2) not null default 0,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  status text not null default 'draft',
  invoice_date date,
  due_date date,
  paid_at timestamptz,
  subtotal numeric(12,2) not null default 0,
  vat numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_link text,
  pdf_file_path text,
  mollie_payment_id text,
  mollie_checkout_url text,
  mollie_payment_status text,
  mollie_payment_created_at timestamptz,
  mollie_payment_expires_at timestamptz,
  email_sent_at timestamptz,
  payment_reminder_sent_at timestamptz,
  paid_email_sent_at timestamptz,
  expired_email_sent_at timestamptz,
  email_last_error text,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_status_check check (status in ('draft', 'sent', 'paid', 'expired', 'canceled', 'failed', 'archived')),
  constraint invoices_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  vat_rate numeric(5,2) not null default 21,
  line_total numeric(12,2) not null default 0,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  plan text,
  status text not null default 'active',
  billing_cycle text not null default 'monthly',
  price_ex_vat numeric(12,2) not null default 0,
  vat_rate numeric(5,2) not null default 21,
  total_incl_vat numeric(12,2) not null default 0,
  start_date date,
  next_invoice_date date,
  last_invoice_id uuid references public.invoices(id) on delete set null,
  last_invoice_date date,
  auto_invoice_enabled boolean not null default false,
  mollie_customer_id text,
  mollie_subscription_id text,
  mollie_mandate_id text,
  mandate_status text,
  mandate_checkout_url text,
  retry_status text,
  subscription_risk_level text not null default 'normal',
  internal_notes text,
  last_payment_at timestamptz,
  next_payment_at timestamptz,
  canceled_at timestamptz,
  paused_at timestamptz,
  resumed_at timestamptz,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check check (status in ('active', 'pending_mandate', 'paused', 'canceled', 'expired', 'archived')),
  constraint subscriptions_billing_cycle_check check (billing_cycle in ('monthly', 'quarterly', 'yearly')),
  constraint subscriptions_risk_check check (subscription_risk_level in ('normal', 'attention', 'high')),
  constraint subscriptions_environment_check check (environment in ('production', 'test', 'demo'))
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
  status text not null default 'active',
  is_client_visible boolean not null default false,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint files_status_check check (status in ('active', 'in_review', 'approved', 'archived')),
  constraint files_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  name text,
  company text,
  email text,
  phone text,
  title text,
  description text,
  category text,
  priority text default 'normal',
  status text not null default 'nieuw',
  files jsonb not null default '[]'::jsonb,
  source text default 'website',
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint change_requests_status_check check (status in ('nieuw', 'in_behandeling', 'wacht_op_klant', 'afgerond', 'archived')),
  constraint change_requests_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint change_requests_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  title text,
  status text not null default 'open',
  priority text not null default 'normal',
  due_date date,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_tasks_status_check check (status in ('new', 'open', 'in_progress', 'waiting_customer', 'completed', 'archived')),
  constraint crm_tasks_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint crm_tasks_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.client_portal_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_type text not null default 'admin',
  subject text,
  body text,
  status text not null default 'open',
  read_at timestamptz,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_portal_messages_status_check check (status in ('open', 'sent', 'read', 'archived')),
  constraint client_portal_messages_sender_check check (sender_type in ('admin', 'support', 'customer', 'system')),
  constraint client_portal_messages_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  workspace_key text unique default 'default',
  company_name text,
  email text,
  phone text,
  invoice_prefix text,
  quote_prefix text,
  default_vat_rate numeric(5,2) default 21,
  payment_term_days integer default 14,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.demo_emails (
  id uuid primary key default gen_random_uuid(),
  to_email text,
  subject text,
  body text,
  status text default 'draft',
  is_demo boolean not null default true,
  environment text not null default 'demo',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text,
  entity_id uuid,
  customer_id uuid references public.customers(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  environment text not null default 'production',
  created_at timestamptz not null default now()
);

create table if not exists public.import_logs (
  id uuid primary key default gen_random_uuid(),
  filename text,
  mode text,
  status text,
  recognized_keys jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text,
  entity_id uuid,
  result text not null default 'success',
  ip_hash text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_result_check check (result in ('success', 'failed', 'blocked', 'approved', 'rejected'))
);


-- Circular foreign keys deferred until both relations exist.

alter table public.invoices add constraint invoices_subscription_id_fkey foreign key (subscription_id) references public.subscriptions(id) on delete set null;
alter table public.quotes add constraint quotes_converted_to_invoice_id_fkey foreign key (converted_to_invoice_id) references public.invoices(id) on delete set null;


-- 09. Hardened identity and tenant helpers.
create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = pg_catalog
as $$ select p.id from public.profiles as p where p.auth_user_id = auth.uid() and coalesce(p.status, 'active') = 'active' limit 1 $$;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = pg_catalog
as $$ select coalesce(p.role, 'anonymous') from public.profiles as p where p.auth_user_id = auth.uid() and coalesce(p.status, 'active') = 'active' limit 1 $$;

create or replace function public.has_app_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = pg_catalog
as $$ select coalesce(public.current_app_role(), 'anonymous') = any(allowed_roles) $$;

create or replace function public.is_admin_role()
returns boolean language sql stable security definer set search_path = pg_catalog
as $$ select public.has_app_role(array['super_admin', 'admin']) $$;

create or replace function public.is_staff_role()
returns boolean language sql stable security definer set search_path = pg_catalog
as $$ select public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer']) $$;

create or replace function public.is_demo_context()
returns boolean language sql stable security definer set search_path = pg_catalog
as $$ select exists(select 1 from public.profiles as p where p.auth_user_id = auth.uid() and coalesce(p.status, 'active') = 'active' and (p.role = 'demo_user' or coalesce(p.is_demo, false) or p.environment = 'demo')) $$;

create or replace function public.owns_customer(target_customer_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$ select exists(select 1 from public.customers as c where c.id = target_customer_id and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id())) $$;

create or replace function public.is_demo_record(record_is_demo boolean, record_environment text)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$ select public.is_demo_context() and (coalesce(record_is_demo, false) or coalesce(record_environment, '') = 'demo') $$;


-- 04-11. Locally evidenced incremental definitions folded into final state.


-- Locally evidenced source: supabase/migrations/20260710160200_central_lead_lifecycle_deduplication.sql
-- Central lead lifecycle, qualification fields and deduplication support.
-- Non-destructive and idempotent for older and newer public.leads schemas.

alter table public.leads
  add column if not exists lead_status text not null default 'new',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists rejection_reason text,
  add column if not exists rejection_note text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid,
  add column if not exists normalized_company_name text,
  add column if not exists normalized_domain text,
  add column if not exists normalized_phone text,
  add column if not exists external_source text,
  add column if not exists external_source_id text,
  add column if not exists last_activity_at timestamptz,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_action_at timestamptz,
  add column if not exists lead_score_reasoning text,
  add column if not exists lead_score_updated_at timestamptz;

create or replace function public.mws_normalize_domain(input text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(trim(coalesce(input, ''))), '^https?://', ''),
        '^www\.',
        ''
      ),
      '/.*$',
      ''
    ),
    ''
  );
$$;

create or replace function public.mws_normalize_phone(input text)
returns text
language sql
immutable
as $$
  select nullif(
    case
      when regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') like '0031%' then '31' || substring(regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') from 5)
      when regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') like '310%' then '31' || substring(regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') from 4)
      when regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') like '0%' then '31' || substring(regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') from 2)
      else regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g')
    end,
    ''
  );
$$;

create or replace function public.mws_normalize_company_name(input text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          lower(coalesce(input, '')),
          '\m(b\.?v\.?|vof|v\.?o\.?f\.?|eenmanszaak|holding|nederland)\M',
          ' ',
          'gi'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

do $$
declare
  has_call_status boolean;
  has_company_name boolean;
  has_company boolean;
  has_website boolean;
  has_website_url boolean;
  has_interest boolean;
  has_source boolean;
  company_expr text;
  website_expr text;
  source_expr text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'call_status'
  ) into has_call_status;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'company_name'
  ) into has_company_name;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'company'
  ) into has_company;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'website'
  ) into has_website;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'website_url'
  ) into has_website_url;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'interest'
  ) into has_interest;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'source'
  ) into has_source;

  execute format(
    'update public.leads
      set lead_status = case
        when %1$s in (''interesting'', ''not_interesting'', ''reviewing'', ''assigned'', ''call_scheduled'', ''contacted'', ''follow_up'', ''demo_requested'', ''demo_building'', ''demo_ready'', ''demo_sent'', ''proposal_sent'', ''won'', ''lost'', ''customer'') then %1$s
        when %2$s in (''lost'', ''geen_interesse'') then ''not_interesting''
        when %2$s in (''qualified'', ''interesse'') then ''interesting''
        when %2$s in (''contacted'', ''gebeld'') then ''contacted''
        when %2$s in (''follow_up'', ''opvolgen'', ''contact_planned'', ''bellen'', ''te_bellen'') then ''follow_up''
        when %2$s in (''converted'', ''geconverteerd'', ''customer_active'', ''klant_actief'') then ''customer''
        when %2$s in (''won'', ''verkocht'') then ''won''
        else ''new''
      end
    where lead_status is null
      or lead_status = ''''
      or lead_status = ''new''',
    'lower(coalesce(lead_status, ''''))',
    case
      when has_call_status then 'lower(coalesce(call_status, status, ''''))'
      else 'lower(coalesce(status, ''''))'
    end
  );

  company_expr := concat_ws(
    ', ',
    case when has_company_name then 'company_name' end,
    case when has_company then 'company' end,
    'metadata->>''companyName''',
    'metadata->>''company'''
  );
  website_expr := concat_ws(
    ', ',
    case when has_website then 'website' end,
    case when has_website_url then 'website_url' end,
    case when has_interest then 'interest' end,
    'metadata->>''websiteUrl''',
    'metadata->>''website'''
  );
  source_expr := concat_ws(
    ', ',
    case when has_source then 'source' end,
    'metadata->>''source'''
  );

  execute format(
    'update public.leads
      set normalized_company_name = coalesce(normalized_company_name, public.mws_normalize_company_name(coalesce(%s))),
          normalized_domain = coalesce(normalized_domain, public.mws_normalize_domain(coalesce(%s))),
          normalized_phone = coalesce(normalized_phone, public.mws_normalize_phone(phone)),
          external_source = coalesce(nullif(external_source, ''''), %s),
          external_source_id = coalesce(nullif(external_source_id, ''''), metadata->>''externalSourceId'', metadata->>''external_source_id'', metadata->>''googlePlaceId'', metadata->>''google_place_id''),
          last_activity_at = coalesce(last_activity_at, updated_at, created_at)
      where normalized_company_name is null
        or normalized_domain is null
        or normalized_phone is null
        or external_source is null
        or external_source_id is null
        or last_activity_at is null',
    company_expr,
    website_expr,
    source_expr
  );
end $$;

create index if not exists leads_lead_status_idx on public.leads(lead_status);
create index if not exists leads_reviewed_at_idx on public.leads(reviewed_at desc);
create index if not exists leads_rejection_reason_idx on public.leads(rejection_reason);
create index if not exists leads_assigned_user_id_idx on public.leads(assigned_user_id);
create index if not exists leads_last_activity_at_idx on public.leads(last_activity_at desc);
create index if not exists leads_external_source_id_idx on public.leads(external_source, external_source_id)
  where external_source_id is not null and external_source_id <> '';
create index if not exists leads_normalized_domain_idx on public.leads(normalized_domain)
  where normalized_domain is not null and normalized_domain <> '';
create index if not exists leads_normalized_phone_idx on public.leads(normalized_phone)
  where normalized_phone is not null and normalized_phone <> '';
create index if not exists leads_normalized_company_name_idx on public.leads(normalized_company_name)
  where normalized_company_name is not null and normalized_company_name <> '';

do $$
begin
  if not exists (
    select 1
    from public.leads
    where external_source_id is not null and external_source_id <> ''
    group by external_source, external_source_id
    having count(*) > 1
  ) then
    create unique index if not exists leads_unique_external_source_id_idx
      on public.leads(external_source, external_source_id)
      where external_source_id is not null and external_source_id <> '';
  else
    raise notice 'Skipped unique external_source_id index because duplicates exist.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from public.leads
    where normalized_domain is not null and normalized_domain <> ''
    group by normalized_domain
    having count(*) > 1
  ) then
    create unique index if not exists leads_unique_normalized_domain_idx
      on public.leads(normalized_domain)
      where normalized_domain is not null and normalized_domain <> '';
  else
    raise notice 'Skipped unique normalized_domain index because duplicates exist. Backend deduplication remains authoritative.';
  end if;
end $$;

alter table public.leads
  drop constraint if exists leads_lead_status_check;

alter table public.leads
  add constraint leads_lead_status_check check (
    lead_status in (
      'new',
      'reviewing',
      'interesting',
      'not_interesting',
      'assigned',
      'call_scheduled',
      'contacted',
      'follow_up',
      'demo_requested',
      'demo_building',
      'demo_ready',
      'demo_sent',
      'proposal_sent',
      'won',
      'lost',
      'customer'
    )
  );

comment on column public.leads.lead_status is 'Central lifecycle status for lead generator, sales and CRM follow-up.';
comment on column public.leads.normalized_domain is 'Deduplication identifier. Stores root domain such as voorbeeld.nl.';
comment on column public.leads.external_source_id is 'Hard deduplication identifier such as Google Place ID or external business/location id.';


-- Locally evidenced source: supabase/migrations/20260710170500_sales_assignment_calling_follow_up_pipeline.sql
-- Sales assignment, calling and follow-up pipeline.
-- Non-destructive extension of the central public.leads lifecycle.

alter table public.leads
  add column if not exists last_contacted_by uuid,
  add column if not exists last_call_outcome text,
  add column if not exists next_action_type text,
  add column if not exists next_action_note text,
  add column if not exists next_action_assigned_user_id uuid,
  add column if not exists next_action_created_automatically boolean not null default false,
  add column if not exists appointment_at timestamptz,
  add column if not exists appointment_type text,
  add column if not exists appointment_location text,
  add column if not exists won_at timestamptz,
  add column if not exists won_by uuid,
  add column if not exists lost_at timestamptz,
  add column if not exists lost_by uuid,
  add column if not exists lost_reason text,
  add column if not exists lost_note text;

alter table public.leads
  drop constraint if exists leads_lead_status_check;

alter table public.leads
  add constraint leads_lead_status_check check (
    lead_status in (
      'new',
      'reviewing',
      'interesting',
      'not_interesting',
      'assigned',
      'call_scheduled',
      'contact_attempted',
      'contacted',
      'follow_up',
      'appointment_scheduled',
      'demo_requested',
      'demo_building',
      'demo_ready',
      'demo_sent',
      'proposal_sent',
      'negotiation',
      'won',
      'lost',
      'customer'
    )
  );

alter table public.leads
  drop constraint if exists leads_next_action_type_check;

alter table public.leads
  add constraint leads_next_action_type_check check (
    next_action_type is null
    or next_action_type in (
      'call',
      'email',
      'send_demo',
      'create_demo',
      'send_proposal',
      'follow_up',
      'appointment',
      'await_response',
      'custom'
    )
  );

create index if not exists leads_next_action_at_idx
  on public.leads(next_action_at)
  where next_action_at is not null;

create index if not exists leads_next_action_assigned_user_id_idx
  on public.leads(next_action_assigned_user_id)
  where next_action_assigned_user_id is not null;

create index if not exists leads_last_contacted_at_idx
  on public.leads(last_contacted_at desc)
  where last_contacted_at is not null;

create index if not exists leads_last_call_outcome_idx
  on public.leads(last_call_outcome)
  where last_call_outcome is not null and last_call_outcome <> '';

comment on column public.leads.next_action_type is 'Current active sales next action for the lead.';
comment on column public.leads.next_action_at is 'Scheduled timestamp for the active sales next action.';
comment on column public.leads.next_action_note is 'Short note for the active sales next action.';
comment on column public.leads.last_call_outcome is 'Last registered call/contact outcome for sales follow-up.';


-- Locally evidenced source: supabase/migrations/20260712123000_relationship_asset_library.sql

alter table public.files add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.files add column if not exists original_lead_id uuid references public.leads(id) on delete set null;
alter table public.files add column if not exists uploaded_by_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.files add column if not exists uploaded_by_type text not null default 'admin';
alter table public.files add column if not exists source_module text not null default 'asset_manager';
alter table public.files add column if not exists original_filename text;
alter table public.files add column if not exists mime_type text;
alter table public.files add column if not exists size_bytes bigint not null default 0;
alter table public.files add column if not exists checksum text;
alter table public.files add column if not exists usage_rights_confirmed boolean not null default false;
alter table public.files add column if not exists is_primary boolean not null default false;
alter table public.files add column if not exists replaced_file_id uuid references public.files(id) on delete set null;
alter table public.files drop constraint if exists files_status_check;
alter table public.files add constraint files_status_check check (status in ('new','reviewing','active','in_review','approved','rejected','replaced','archived'));
alter table public.files add constraint files_one_relationship_check check (num_nonnulls(lead_id, customer_id) = 1);
alter table public.files add constraint files_uploader_type_check check (uploaded_by_type in ('admin','sales','customer','system'));

create unique index if not exists files_customer_checksum_unique on public.files(customer_id, checksum) where customer_id is not null and checksum is not null and status <> 'archived';
create unique index if not exists files_lead_checksum_unique on public.files(lead_id, checksum) where lead_id is not null and checksum is not null and status <> 'archived';
create index if not exists files_lead_id_idx on public.files(lead_id, created_at desc);
create index if not exists files_customer_review_idx on public.files(customer_id, status, created_at desc);

create table if not exists public.asset_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  original_lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  instructions text,
  requested_categories text[] not null default '{}',
  minimum_count integer not null default 1 check (minimum_count between 1 and 100),
  deadline date,
  status text not null default 'open' check (status in ('open','partial','complete','expired','cancelled')),
  created_by_auth_user_id uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_requests_one_relationship_check check (num_nonnulls(lead_id, customer_id) = 1)
);
create index if not exists asset_requests_customer_idx on public.asset_requests(customer_id, status, created_at desc);
create index if not exists asset_requests_lead_idx on public.asset_requests(lead_id, status, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('relationship-assets','relationship-assets',false,8388608,array['image/jpeg','image/png','image/webp','image/svg+xml','video/mp4','video/webm','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

alter table public.files enable row level security;
alter table public.asset_requests enable row level security;
drop policy if exists files_customer_read_own on public.files;
create policy files_customer_read_own on public.files for select to authenticated using (customer_id is not null and public.owns_customer(customer_id) and is_client_visible = true);
drop policy if exists asset_requests_customer_read_own on public.asset_requests;
create policy asset_requests_customer_read_own on public.asset_requests for select to authenticated using (customer_id is not null and public.owns_customer(customer_id));
grant select on public.files, public.asset_requests to authenticated;
grant select, insert, update on public.files, public.asset_requests to service_role;


-- Locally evidenced source: supabase/migrations/20260712170000_relationship_asset_policy_hardening.sql

-- Customer asset reads must always respect both ownership and client visibility.
-- Older permissive policy names are removed because PostgreSQL ORs permissive
-- policies and would otherwise make hidden review records readable again.
alter table public.files enable row level security;
drop policy if exists "customers read own files" on public.files;
drop policy if exists files_owner_read on public.files;
drop policy if exists files_customer_read_own on public.files;
create policy files_customer_read_own
on public.files
for select
to authenticated
using (
  customer_id is not null
  and public.owns_customer(customer_id)
  and is_client_visible = true
  and exists (
    select 1
    from public.customers as customer
    left join public.profiles as profile on profile.id = customer.profile_id
    where customer.id = files.customer_id
      and lower(coalesce(customer.status, 'active')) not in (
        'archived', 'gearchiveerd', 'deleted', 'verwijderd', 'inactive',
        'inactief', 'niet_actief', 'niet actief', 'disabled', 'blocked',
        'geblokkeerd', 'revoked'
      )
      and lower(coalesce(customer.portal_status, 'prepared')) not in (
        'archived', 'gearchiveerd', 'deleted', 'verwijderd', 'inactive',
        'inactief', 'niet_actief', 'niet actief', 'disabled', 'blocked',
        'geblokkeerd', 'revoked'
      )
      and (
        customer.profile_id is null
        or lower(coalesce(profile.status, 'disabled')) = 'active'
      )
  )
);


-- Locally evidenced source: supabase/migrations/20260718120000_business_event_foundation.sql

create extension if not exists pgcrypto;

create table public.business_event_contracts (
  event_type text not null,
  event_version smallint not null,
  lifecycle_status text not null default 'active',
  description text not null,
  allowed_owner_scopes text[] not null,
  payload_schema jsonb not null,
  max_payload_bytes integer not null,
  validator_key text not null,
  schema_checksum text not null default '',
  registered_by_migration text not null,
  registered_at timestamptz not null default now(),
  deprecated_at timestamptz,

  constraint business_event_contracts_pkey primary key (event_type, event_version),
  constraint business_event_contracts_validator_key_key unique (validator_key),
  constraint business_event_contracts_event_type_check check (
    char_length(event_type) between 3 and 120
    and event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  constraint business_event_contracts_event_version_check check (event_version > 0),
  constraint business_event_contracts_lifecycle_status_check check (
    lifecycle_status in ('active', 'deprecated', 'retired')
  ),
  constraint business_event_contracts_description_check check (
    char_length(btrim(description)) between 1 and 1000
  ),
  constraint business_event_contracts_owner_scopes_check check (
    allowed_owner_scopes = array['customer']::text[]
    or allowed_owner_scopes = array['internal']::text[]
    or allowed_owner_scopes = array['customer', 'internal']::text[]
  ),
  constraint business_event_contracts_payload_schema_check check (
    jsonb_typeof(payload_schema) = 'object'
  ),
  constraint business_event_contracts_payload_limit_check check (
    max_payload_bytes between 1 and 1048576
  ),
  constraint business_event_contracts_validator_key_check check (
    char_length(validator_key) between 3 and 120
    and validator_key ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint business_event_contracts_checksum_check check (
    schema_checksum ~ '^[0-9a-f]{32}$'
  ),
  constraint business_event_contracts_migration_check check (
    char_length(btrim(registered_by_migration)) between 1 and 180
  ),
  constraint business_event_contracts_lifecycle_timestamp_check check (
    (lifecycle_status = 'active' and deprecated_at is null)
    or (lifecycle_status in ('deprecated', 'retired') and deprecated_at is not null)
  )
);

create table public.business_events (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null,
  customer_id uuid references public.customers(id) on delete restrict,
  event_type text not null,
  event_version smallint not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor_type text not null,
  actor_id text,
  source_module text not null,
  source_operation text,
  correlation_id uuid,
  causation_id uuid references public.business_events(id) on delete restrict,
  deduplication_key text not null,
  subject_type text not null,
  subject_uuid uuid,
  subject_external_id text,
  payload jsonb not null,
  retention_until timestamptz not null default (now() + interval '24 months'),

  constraint business_events_contract_fkey foreign key (event_type, event_version)
    references public.business_event_contracts(event_type, event_version)
    on update restrict on delete restrict,
  constraint business_events_owner_scope_check check (
    owner_scope in ('customer', 'internal')
  ),
  constraint business_events_owner_customer_check check (
    (owner_scope = 'customer' and customer_id is not null)
    or (owner_scope = 'internal' and customer_id is null)
  ),
  constraint business_events_event_type_check check (
    char_length(event_type) between 3 and 120
    and event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  constraint business_events_event_version_check check (event_version > 0),
  constraint business_events_actor_type_check check (
    char_length(actor_type) between 1 and 60
    and actor_type ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint business_events_actor_id_check check (
    actor_id is null or char_length(btrim(actor_id)) between 1 and 255
  ),
  constraint business_events_source_module_check check (
    char_length(source_module) between 1 and 80
    and source_module ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint business_events_source_operation_check check (
    source_operation is null
    or (
      char_length(source_operation) between 1 and 120
      and source_operation ~ '^[a-zA-Z0-9_.:-]+$'
    )
  ),
  constraint business_events_deduplication_key_check check (
    char_length(btrim(deduplication_key)) between 1 and 240
  ),
  constraint business_events_subject_type_check check (
    char_length(subject_type) between 1 and 80
    and subject_type ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint business_events_subject_identity_check check (
    num_nonnulls(subject_uuid, subject_external_id) = 1
  ),
  constraint business_events_subject_external_id_check check (
    subject_external_id is null
    or char_length(btrim(subject_external_id)) between 1 and 255
  ),
  constraint business_events_payload_object_check check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint business_events_platform_payload_ceiling_check check (
    octet_length(convert_to(payload::text, 'UTF8')) <= 1048576
  ),
  constraint business_events_occurrence_check check (
    occurred_at <= recorded_at + interval '5 minutes'
  ),
  constraint business_events_retention_check check (
    retention_until > recorded_at
  ),
  constraint business_events_no_self_causation_check check (
    causation_id is null or causation_id <> id
  )
);

create table public.business_event_consumptions (
  id uuid primary key default gen_random_uuid(),
  business_event_id uuid not null references public.business_events(id) on delete restrict,
  consumer_name text not null,
  consumer_version smallint not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_event_consumptions_event_consumer_key unique (
    business_event_id,
    consumer_name,
    consumer_version
  ),
  constraint business_event_consumptions_consumer_name_check check (
    char_length(consumer_name) between 1 and 120
    and consumer_name ~ '^[a-z][a-z0-9_.:-]*$'
  ),
  constraint business_event_consumptions_consumer_version_check check (
    consumer_version > 0
  ),
  constraint business_event_consumptions_status_check check (
    status in (
      'pending',
      'claimed',
      'running',
      'completed',
      'failed',
      'retry_waiting',
      'dead_letter',
      'cancelled'
    )
  ),
  constraint business_event_consumptions_attempt_count_check check (
    attempt_count >= 0
  ),
  constraint business_event_consumptions_locked_by_check check (
    locked_by is null or char_length(btrim(locked_by)) between 1 and 160
  ),
  constraint business_event_consumptions_error_code_check check (
    last_error_code is null
    or (
      char_length(last_error_code) between 1 and 120
      and last_error_code ~ '^[a-zA-Z0-9_.:-]+$'
    )
  ),
  constraint business_event_consumptions_error_message_check check (
    last_error_message is null or char_length(last_error_message) <= 2000
  ),
  constraint business_event_consumptions_lock_tuple_check check (
    num_nonnulls(locked_at, locked_by, lease_expires_at) in (0, 3)
  ),
  constraint business_event_consumptions_lease_order_check check (
    lease_expires_at is null or lease_expires_at > locked_at
  ),
  constraint business_event_consumptions_time_order_check check (
    (started_at is null or started_at >= created_at)
    and (completed_at is null or completed_at >= created_at)
  )
);

create unique index business_events_customer_deduplication_key
  on public.business_events(customer_id, source_module, deduplication_key)
  where owner_scope = 'customer';

create unique index business_events_internal_deduplication_key
  on public.business_events(source_module, deduplication_key)
  where owner_scope = 'internal';

create index business_events_customer_recorded_at_idx
  on public.business_events(customer_id, recorded_at desc)
  where customer_id is not null;

create index business_events_type_recorded_at_idx
  on public.business_events(event_type, event_version, recorded_at desc);

create index business_events_correlation_id_idx
  on public.business_events(correlation_id)
  where correlation_id is not null;

create index business_events_causation_id_idx
  on public.business_events(causation_id)
  where causation_id is not null;

create index business_events_retention_until_idx
  on public.business_events(retention_until);

create index business_event_consumptions_ready_idx
  on public.business_event_consumptions(status, next_attempt_at)
  where status in ('pending', 'retry_waiting');

create index business_event_consumptions_active_lease_idx
  on public.business_event_consumptions(lease_expires_at)
  where status in ('claimed', 'running');

create or replace function public.business_event_contract_before_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  definition_text text;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'Business event contract definitions cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' then
    if new.event_type is distinct from old.event_type
      or new.event_version is distinct from old.event_version
      or new.description is distinct from old.description
      or new.allowed_owner_scopes is distinct from old.allowed_owner_scopes
      or new.payload_schema is distinct from old.payload_schema
      or new.max_payload_bytes is distinct from old.max_payload_bytes
      or new.validator_key is distinct from old.validator_key
      or new.schema_checksum is distinct from old.schema_checksum
      or new.registered_by_migration is distinct from old.registered_by_migration
      or new.registered_at is distinct from old.registered_at
    then
      raise exception using
        errcode = '55000',
        message = 'Business event contract definitions are immutable.';
    end if;

    if old.lifecycle_status = 'active' and new.lifecycle_status = 'deprecated' then
      new.deprecated_at := coalesce(new.deprecated_at, clock_timestamp());
    elsif old.lifecycle_status = 'deprecated' and new.lifecycle_status = 'retired' then
      new.deprecated_at := old.deprecated_at;
    else
      raise exception using
        errcode = '55000',
        message = format(
          'Unsupported business event contract lifecycle transition: %s -> %s.',
          old.lifecycle_status,
          new.lifecycle_status
        );
    end if;

    return new;
  end if;

  definition_text := concat_ws(
    E'\x1f',
    new.event_type,
    new.event_version::text,
    array_to_string(new.allowed_owner_scopes, ','),
    new.payload_schema::text,
    new.max_payload_bytes::text,
    new.validator_key
  );
  new.schema_checksum := md5(definition_text);
  return new;
end;
$$;

create trigger business_event_contract_write_guard
before insert or update or delete on public.business_event_contracts
for each row
execute function public.business_event_contract_before_write();

create or replace function public.validate_business_event_foundation_test_v1(
  input_payload jsonb
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  test_id uuid;
begin
  if jsonb_typeof(input_payload) <> 'object'
    or not (input_payload ? 'testId')
    or (input_payload - 'testId') <> '{}'::jsonb
    or jsonb_typeof(input_payload -> 'testId') <> 'string'
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid foundation test event payload.';
  end if;

  begin
    test_id := (input_payload ->> 'testId')::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'Foundation test event testId must be a UUID.';
  end;

  if test_id is null then
    raise exception using
      errcode = '22023',
      message = 'Foundation test event testId is required.';
  end if;
end;
$$;

create or replace function public.dispatch_business_event_payload_validation(
  input_validator_key text,
  input_payload jsonb
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  case input_validator_key
    when 'foundation_test_v1' then
      perform public.validate_business_event_foundation_test_v1(input_payload);
    else
      raise exception using
        errcode = '22023',
        message = format(
          'Unsupported business event payload validator: %s.',
          coalesce(input_validator_key, '<null>')
        );
  end case;
end;
$$;

create or replace function public.business_event_before_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  contract_record public.business_event_contracts%rowtype;
  cause_record public.business_events%rowtype;
  payload_bytes integer;
begin
  select *
  into contract_record
  from public.business_event_contracts
  where event_type = new.event_type
    and event_version = new.event_version;

  if not found then
    raise exception using
      errcode = '22023',
      message = format(
        'Unsupported business event contract: %s v%s.',
        new.event_type,
        new.event_version
      );
  end if;

  if contract_record.lifecycle_status = 'retired' then
    raise exception using
      errcode = '22023',
      message = format(
        'Business event contract is retired: %s v%s.',
        new.event_type,
        new.event_version
      );
  end if;

  if not (new.owner_scope = any(contract_record.allowed_owner_scopes)) then
    raise exception using
      errcode = '22023',
      message = 'Business event owner scope is not allowed by its contract.';
  end if;

  payload_bytes := octet_length(convert_to(new.payload::text, 'UTF8'));
  if payload_bytes > contract_record.max_payload_bytes then
    raise exception using
      errcode = '22001',
      message = format(
        'Business event payload is %s bytes; contract maximum is %s bytes.',
        payload_bytes,
        contract_record.max_payload_bytes
      );
  end if;

  perform public.dispatch_business_event_payload_validation(
    contract_record.validator_key,
    new.payload
  );

  if new.causation_id is not null then
    select *
    into cause_record
    from public.business_events
    where id = new.causation_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'Causation business event does not exist.';
    end if;

    if cause_record.owner_scope is distinct from new.owner_scope
      or cause_record.customer_id is distinct from new.customer_id
    then
      raise exception using
        errcode = '23514',
        message = 'Causation business event belongs to another ownership scope.';
    end if;
  end if;

  return new;
end;
$$;

create trigger business_event_insert_validator
before insert on public.business_events
for each row
execute function public.business_event_before_insert();

create or replace function public.prevent_business_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Business events are append-only and cannot be updated or deleted.';
end;
$$;

create trigger business_event_append_only_guard
before update or delete on public.business_events
for each row
execute function public.prevent_business_event_mutation();

create or replace function public.business_event_consumption_before_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  transition_allowed boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'Business event consumptions cannot be deleted.';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending'
      or new.attempt_count <> 0
      or num_nonnulls(
        new.next_attempt_at,
        new.locked_at,
        new.locked_by,
        new.lease_expires_at,
        new.last_error_code,
        new.last_error_message,
        new.started_at,
        new.completed_at
      ) <> 0
    then
      raise exception using
        errcode = '23514',
        message = 'New business event consumptions must start in a clean pending state.';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.business_event_id is distinct from old.business_event_id
    or new.consumer_name is distinct from old.consumer_name
    or new.consumer_version is distinct from old.consumer_version
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '55000',
      message = 'Business event consumption identity is immutable.';
  end if;

  transition_allowed := case old.status
    when 'pending' then new.status in ('claimed', 'cancelled')
    when 'claimed' then new.status in ('running', 'pending', 'cancelled')
    when 'running' then new.status in ('completed', 'failed')
    when 'failed' then new.status in ('retry_waiting', 'dead_letter')
    when 'retry_waiting' then new.status in ('pending', 'cancelled')
    else false
  end;

  if not transition_allowed then
    raise exception using
      errcode = '55000',
      message = format(
        'Unsupported business event consumption transition: %s -> %s.',
        old.status,
        new.status
      );
  end if;

  if old.status = 'pending' and new.status = 'claimed' then
    if new.attempt_count <> old.attempt_count + 1 then
      raise exception using
        errcode = '23514',
        message = 'Claiming a consumption must increment attempt_count exactly once.';
    end if;
  elsif new.attempt_count <> old.attempt_count then
    raise exception using
      errcode = '23514',
      message = 'Only a pending-to-claimed transition may change attempt_count.';
  end if;

  if new.status = 'pending' then
    if num_nonnulls(
      new.next_attempt_at,
      new.locked_at,
      new.locked_by,
      new.lease_expires_at,
      new.last_error_code,
      new.last_error_message,
      new.started_at,
      new.completed_at
    ) <> 0 then
      raise exception using errcode = '23514', message = 'Pending consumption state is invalid.';
    end if;
  elsif new.status = 'claimed' then
    if num_nonnulls(new.locked_at, new.locked_by, new.lease_expires_at) <> 3
      or num_nonnulls(
        new.next_attempt_at,
        new.last_error_code,
        new.last_error_message,
        new.started_at,
        new.completed_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Claimed consumption state is invalid.';
    end if;
  elsif new.status = 'running' then
    if num_nonnulls(new.locked_at, new.locked_by, new.lease_expires_at, new.started_at) <> 4
      or num_nonnulls(
        new.next_attempt_at,
        new.last_error_code,
        new.last_error_message,
        new.completed_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Running consumption state is invalid.';
    end if;
  elsif new.status = 'completed' then
    if new.started_at is null
      or new.completed_at is null
      or num_nonnulls(
        new.next_attempt_at,
        new.locked_at,
        new.locked_by,
        new.lease_expires_at,
        new.last_error_code,
        new.last_error_message
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Completed consumption state is invalid.';
    end if;
  elsif new.status = 'failed' then
    if new.started_at is null
      or new.last_error_code is null
      or num_nonnulls(
        new.next_attempt_at,
        new.locked_at,
        new.locked_by,
        new.lease_expires_at,
        new.completed_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Failed consumption state is invalid.';
    end if;
  elsif new.status = 'retry_waiting' then
    if new.started_at is null
      or new.last_error_code is null
      or new.next_attempt_at is null
      or num_nonnulls(
        new.locked_at,
        new.locked_by,
        new.lease_expires_at,
        new.completed_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Retry-waiting consumption state is invalid.';
    end if;
  elsif new.status = 'dead_letter' then
    if new.started_at is null
      or new.last_error_code is null
      or new.completed_at is null
      or num_nonnulls(
        new.next_attempt_at,
        new.locked_at,
        new.locked_by,
        new.lease_expires_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Dead-letter consumption state is invalid.';
    end if;
  elsif new.status = 'cancelled' then
    if new.completed_at is null
      or num_nonnulls(
        new.next_attempt_at,
        new.locked_at,
        new.locked_by,
        new.lease_expires_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Cancelled consumption state is invalid.';
    end if;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger business_event_consumption_write_guard
before insert or update or delete on public.business_event_consumptions
for each row
execute function public.business_event_consumption_before_write();

create or replace function public.assert_business_event_service_role()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  jwt_role text;
begin
  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  if jwt_role is null then
    begin
      jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    exception
      when invalid_text_representation then
        jwt_role := null;
    end;
  end if;

  if coalesce(jwt_role, session_user::text) <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Business event operations require the service role.';
  end if;
end;
$$;

create or replace function public.record_business_event(
  input_owner_scope text,
  input_customer_id uuid,
  input_event_type text,
  input_event_version smallint,
  input_occurred_at timestamptz,
  input_actor_type text,
  input_actor_id text,
  input_source_module text,
  input_source_operation text,
  input_correlation_id uuid,
  input_causation_id uuid,
  input_deduplication_key text,
  input_subject_type text,
  input_subject_uuid uuid,
  input_subject_external_id text,
  input_payload jsonb
)
returns public.business_events
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_event public.business_events%rowtype;
  inserted_event public.business_events%rowtype;
  insert_attempt integer;
begin
  perform public.assert_business_event_service_role();

  for insert_attempt in 1..2 loop
    select *
    into existing_event
    from public.business_events
    where source_module = input_source_module
      and deduplication_key = input_deduplication_key
      and (
        (
          input_owner_scope = 'customer'
          and owner_scope = 'customer'
          and customer_id = input_customer_id
        )
        or (
          input_owner_scope = 'internal'
          and owner_scope = 'internal'
          and customer_id is null
        )
      )
    limit 1;

    if found then
      if existing_event.owner_scope is not distinct from input_owner_scope
        and existing_event.customer_id is not distinct from input_customer_id
        and existing_event.event_type is not distinct from input_event_type
        and existing_event.event_version is not distinct from input_event_version
        and existing_event.occurred_at is not distinct from input_occurred_at
        and existing_event.actor_type is not distinct from input_actor_type
        and existing_event.actor_id is not distinct from input_actor_id
        and existing_event.source_module is not distinct from input_source_module
        and existing_event.source_operation is not distinct from input_source_operation
        and existing_event.correlation_id is not distinct from input_correlation_id
        and existing_event.causation_id is not distinct from input_causation_id
        and existing_event.deduplication_key is not distinct from input_deduplication_key
        and existing_event.subject_type is not distinct from input_subject_type
        and existing_event.subject_uuid is not distinct from input_subject_uuid
        and existing_event.subject_external_id is not distinct from input_subject_external_id
        and existing_event.payload is not distinct from input_payload
      then
        return existing_event;
      end if;

      raise exception using
        errcode = '23505',
        constraint = case
          when input_owner_scope = 'customer'
            then 'business_events_customer_deduplication_key'
          else 'business_events_internal_deduplication_key'
        end,
        message = 'Business event deduplication conflict: immutable input differs.';
    end if;

    begin
      insert into public.business_events (
        owner_scope,
        customer_id,
        event_type,
        event_version,
        occurred_at,
        actor_type,
        actor_id,
        source_module,
        source_operation,
        correlation_id,
        causation_id,
        deduplication_key,
        subject_type,
        subject_uuid,
        subject_external_id,
        payload
      ) values (
        input_owner_scope,
        input_customer_id,
        input_event_type,
        input_event_version,
        input_occurred_at,
        input_actor_type,
        input_actor_id,
        input_source_module,
        input_source_operation,
        input_correlation_id,
        input_causation_id,
        input_deduplication_key,
        input_subject_type,
        input_subject_uuid,
        input_subject_external_id,
        input_payload
      )
      returning * into inserted_event;
      return inserted_event;
    exception
      when unique_violation then
        if insert_attempt = 2 then
          raise;
        end if;
    end;
  end loop;

  raise exception using
    errcode = '40001',
    message = 'Business event insert could not be reconciled after a concurrent insert.';
end;
$$;

create or replace function public.create_business_event_consumption(
  input_business_event_id uuid,
  input_consumer_name text,
  input_consumer_version smallint
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();

  insert into public.business_event_consumptions (
    business_event_id,
    consumer_name,
    consumer_version
  ) values (
    input_business_event_id,
    input_consumer_name,
    input_consumer_version
  )
  on conflict (business_event_id, consumer_name, consumer_version)
  do nothing
  returning * into consumption_record;

  if consumption_record.id is null then
    select * into consumption_record
    from public.business_event_consumptions
    where business_event_id = input_business_event_id
      and consumer_name = input_consumer_name
      and consumer_version = input_consumer_version;
  end if;

  return consumption_record;
end;
$$;

create or replace function public.claim_business_event_consumption(
  input_consumption_id uuid,
  input_worker_id text,
  input_lease_seconds integer default 60
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  if char_length(btrim(input_worker_id)) not between 1 and 160
    or input_lease_seconds not between 5 and 3600
  then
    raise exception using errcode = '22023', message = 'Invalid consumption claim parameters.';
  end if;

  update public.business_event_consumptions
  set status = 'claimed',
      attempt_count = attempt_count + 1,
      locked_at = clock_timestamp(),
      locked_by = input_worker_id,
      lease_expires_at = clock_timestamp() + make_interval(secs => input_lease_seconds),
      next_attempt_at = null,
      last_error_code = null,
      last_error_message = null,
      started_at = null,
      completed_at = null
  where id = input_consumption_id
    and status = 'pending'
  returning * into consumption_record;

  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Consumption is not available for claim.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.mark_business_event_consumption_running(
  input_consumption_id uuid,
  input_worker_id text
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'running', started_at = clock_timestamp()
  where id = input_consumption_id
    and status = 'claimed'
    and locked_by = input_worker_id
    and lease_expires_at > clock_timestamp()
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Consumption claim is invalid or expired.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.mark_business_event_consumption_completed(
  input_consumption_id uuid,
  input_worker_id text
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'completed',
      completed_at = clock_timestamp(),
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = input_consumption_id
    and status = 'running'
    and locked_by = input_worker_id
    and lease_expires_at > clock_timestamp()
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Running consumption is not completable by this worker.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.mark_business_event_consumption_failed(
  input_consumption_id uuid,
  input_worker_id text,
  input_error_code text,
  input_error_message text default null
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'failed',
      last_error_code = input_error_code,
      last_error_message = left(input_error_message, 2000),
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = input_consumption_id
    and status = 'running'
    and locked_by = input_worker_id
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Running consumption is not fail-able by this worker.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.schedule_business_event_consumption_retry(
  input_consumption_id uuid,
  input_next_attempt_at timestamptz
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  if input_next_attempt_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'Retry time must be in the future.';
  end if;
  update public.business_event_consumptions
  set status = 'retry_waiting', next_attempt_at = input_next_attempt_at
  where id = input_consumption_id and status = 'failed'
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Only failed consumptions may be scheduled for retry.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.release_business_event_consumption_retry(
  input_consumption_id uuid
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'pending',
      next_attempt_at = null,
      last_error_code = null,
      last_error_message = null,
      started_at = null
  where id = input_consumption_id
    and status = 'retry_waiting'
    and next_attempt_at <= clock_timestamp()
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Consumption retry is not due.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.mark_business_event_consumption_dead_letter(
  input_consumption_id uuid
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'dead_letter', completed_at = clock_timestamp()
  where id = input_consumption_id and status = 'failed'
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Only failed consumptions may enter dead letter.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.cancel_business_event_consumption(
  input_consumption_id uuid,
  input_worker_id text default null
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'cancelled',
      completed_at = clock_timestamp(),
      next_attempt_at = null,
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = input_consumption_id
    and status in ('pending', 'retry_waiting', 'claimed')
    and (status <> 'claimed' or locked_by = input_worker_id)
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Consumption cannot be cancelled in its current state.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.recover_expired_business_event_consumption_claim(
  input_consumption_id uuid
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'pending',
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = input_consumption_id
    and status = 'claimed'
    and lease_expires_at <= clock_timestamp()
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Consumption claim is not expired or recoverable.';
  end if;
  return consumption_record;
end;
$$;

alter table public.business_event_contracts enable row level security;
alter table public.business_events enable row level security;
alter table public.business_event_consumptions enable row level security;

create policy business_event_contracts_service_read
on public.business_event_contracts
for select
to service_role
using (true);

create policy business_events_service_read
on public.business_events
for select
to service_role
using (true);

create policy business_event_consumptions_service_read
on public.business_event_consumptions
for select
to service_role
using (true);

revoke all on table public.business_event_contracts from public, anon, authenticated, service_role;
revoke all on table public.business_events from public, anon, authenticated, service_role;
revoke all on table public.business_event_consumptions from public, anon, authenticated, service_role;

grant select on table public.business_event_contracts to service_role;
grant select on table public.business_events to service_role;
grant select on table public.business_event_consumptions to service_role;

revoke all on function public.business_event_contract_before_write() from public, anon, authenticated, service_role;
revoke all on function public.validate_business_event_foundation_test_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.dispatch_business_event_payload_validation(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.business_event_before_insert() from public, anon, authenticated, service_role;
revoke all on function public.prevent_business_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.business_event_consumption_before_write() from public, anon, authenticated, service_role;
revoke all on function public.assert_business_event_service_role() from public, anon, authenticated, service_role;

revoke all on function public.record_business_event(
  text, uuid, text, smallint, timestamptz, text, text, text, text,
  uuid, uuid, text, text, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_business_event(
  text, uuid, text, smallint, timestamptz, text, text, text, text,
  uuid, uuid, text, text, uuid, text, jsonb
) to service_role;

revoke all on function public.create_business_event_consumption(uuid, text, smallint) from public, anon, authenticated, service_role;
grant execute on function public.create_business_event_consumption(uuid, text, smallint) to service_role;

revoke all on function public.claim_business_event_consumption(uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_business_event_consumption(uuid, text, integer) to service_role;

revoke all on function public.mark_business_event_consumption_running(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.mark_business_event_consumption_running(uuid, text) to service_role;

revoke all on function public.mark_business_event_consumption_completed(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.mark_business_event_consumption_completed(uuid, text) to service_role;

revoke all on function public.mark_business_event_consumption_failed(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.mark_business_event_consumption_failed(uuid, text, text, text) to service_role;

revoke all on function public.schedule_business_event_consumption_retry(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.schedule_business_event_consumption_retry(uuid, timestamptz) to service_role;

revoke all on function public.release_business_event_consumption_retry(uuid) from public, anon, authenticated, service_role;
grant execute on function public.release_business_event_consumption_retry(uuid) to service_role;

revoke all on function public.mark_business_event_consumption_dead_letter(uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_business_event_consumption_dead_letter(uuid) to service_role;

revoke all on function public.cancel_business_event_consumption(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cancel_business_event_consumption(uuid, text) to service_role;

revoke all on function public.recover_expired_business_event_consumption_claim(uuid) from public, anon, authenticated, service_role;
grant execute on function public.recover_expired_business_event_consumption_claim(uuid) to service_role;


-- Locally evidenced source: supabase/migrations/20260718222000_social_event_contracts.sql

create or replace function public.assert_social_event_json_keys_v1(
  input_payload jsonb,
  input_expected_keys text[]
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if jsonb_typeof(input_payload) <> 'object'
    or not (input_payload ?& input_expected_keys)
    or exists (
      select 1
      from jsonb_object_keys(input_payload) as supplied_key
      where not (supplied_key = any(input_expected_keys))
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Social event payload keys do not match the registered contract.';
  end if;
end;
$$;

create or replace function public.social_event_uuid_v1(
  input_payload jsonb,
  input_key text
)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  parsed_uuid uuid;
begin
  if jsonb_typeof(input_payload -> input_key) <> 'string' then
    raise exception using errcode = '22023', message = format('%s must be a UUID string.', input_key);
  end if;

  begin
    parsed_uuid := (input_payload ->> input_key)::uuid;
  exception
    when invalid_text_representation then
      raise exception using errcode = '22023', message = format('%s must be a UUID string.', input_key);
  end;
  return parsed_uuid;
end;
$$;

create or replace function public.social_event_positive_integer_v1(
  input_payload jsonb,
  input_key text
)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  parsed_integer integer;
begin
  if jsonb_typeof(input_payload -> input_key) <> 'number'
    or (input_payload ->> input_key) !~ '^[1-9][0-9]*$'
  then
    raise exception using errcode = '22023', message = format('%s must be a positive integer.', input_key);
  end if;

  begin
    parsed_integer := (input_payload ->> input_key)::integer;
  exception
    when numeric_value_out_of_range then
      raise exception using errcode = '22023', message = format('%s is outside the integer range.', input_key);
  end;
  return parsed_integer;
end;
$$;

create or replace function public.social_event_sha256_v1(
  input_payload jsonb,
  input_key text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  hash_value text;
begin
  hash_value := input_payload ->> input_key;
  if jsonb_typeof(input_payload -> input_key) <> 'string'
    or hash_value !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = format('%s must be a lowercase SHA-256 hex value.', input_key);
  end if;
  return hash_value;
end;
$$;

create or replace function public.social_event_platform_v1(input_payload jsonb)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  platform_value text;
begin
  platform_value := input_payload ->> 'platform';
  if jsonb_typeof(input_payload -> 'platform') <> 'string'
    or platform_value not in ('facebook', 'instagram')
  then
    raise exception using errcode = '22023', message = 'platform must be facebook or instagram.';
  end if;
  return platform_value;
end;
$$;

create or replace function public.parse_social_event_utc_timestamp_v1(
  input_payload jsonb,
  input_key text
)
returns timestamptz
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  timestamp_text text;
  parsed_timestamp timestamptz;
begin
  timestamp_text := input_payload ->> input_key;
  if jsonb_typeof(input_payload -> input_key) <> 'string'
    or timestamp_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  then
    raise exception using
      errcode = '22023',
      message = format('%s must use canonical UTC format YYYY-MM-DDTHH:MM:SS.mmmZ.', input_key);
  end if;

  begin
    parsed_timestamp := timestamp_text::timestamptz;
  exception
    when datetime_field_overflow then
      raise exception using errcode = '22023', message = format('%s is not a valid UTC timestamp.', input_key);
  end;
  return parsed_timestamp;
end;
$$;

create or replace function public.canonical_social_content_v1(input_content jsonb)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  canonical_caption text;
  canonical_hashtags jsonb;
  canonical_media jsonb;
  canonical_platform text;
begin
  perform public.assert_social_event_json_keys_v1(
    input_content,
    array['caption', 'hashtags', 'media', 'platform']::text[]
  );

  if jsonb_typeof(input_content -> 'caption') <> 'string'
    or char_length(input_content ->> 'caption') not between 1 and 5000
    or jsonb_typeof(input_content -> 'hashtags') <> 'array'
    or jsonb_array_length(input_content -> 'hashtags') > 30
    or jsonb_typeof(input_content -> 'media') <> 'array'
    or jsonb_array_length(input_content -> 'media') > 10
  then
    raise exception using errcode = '22023', message = 'Canonical social content has an invalid shape.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(input_content -> 'hashtags') as hashtag
    where jsonb_typeof(hashtag) <> 'string'
      or char_length(hashtag #>> '{}') not between 1 and 100
  ) or exists (
    select 1
    from jsonb_array_elements(input_content -> 'media') as media_id
    where jsonb_typeof(media_id) <> 'string'
      or (media_id #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception using errcode = '22023', message = 'Canonical social content arrays are invalid.';
  end if;

  canonical_platform := public.social_event_platform_v1(input_content);
  canonical_caption := normalize(
    replace(replace(input_content ->> 'caption', E'\r\n', E'\n'), E'\r', E'\n'),
    NFC
  );

  select coalesce(
    jsonb_agg(
      to_jsonb(normalize(replace(replace(hashtag, E'\r\n', E'\n'), E'\r', E'\n'), NFC))
      order by ordinal_position
    ),
    '[]'::jsonb
  )
  into canonical_hashtags
  from jsonb_array_elements_text(input_content -> 'hashtags') with ordinality as tags(hashtag, ordinal_position);

  select coalesce(
    jsonb_agg(to_jsonb((media_id::uuid)::text) order by ordinal_position),
    '[]'::jsonb
  )
  into canonical_media
  from jsonb_array_elements_text(input_content -> 'media') with ordinality as media(media_id, ordinal_position);

  return '{"caption":' || to_jsonb(canonical_caption)::text
    || ',"hashtags":' || canonical_hashtags::text
    || ',"media":' || canonical_media::text
    || ',"platform":' || to_jsonb(canonical_platform)::text
    || '}';
end;
$$;

create or replace function public.social_content_hash_v1(input_content jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(
      convert_to(public.canonical_social_content_v1(input_content), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function public.validate_social_content_created_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(input_payload, array['masterContentId', 'origin']::text[]);
  perform public.social_event_uuid_v1(input_payload, 'masterContentId');
  if jsonb_typeof(input_payload -> 'origin') <> 'string'
    or (input_payload ->> 'origin') not in ('ai', 'employee', 'website_signal')
  then
    raise exception using errcode = '22023', message = 'origin is invalid.';
  end if;
end;
$$;

create or replace function public.validate_social_content_revision_created_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(
    input_payload,
    array['revisionId','masterContentId','variantId','revisionNumber','platform','contentHash','supersedesRevisionId']::text[]
  );
  perform public.social_event_uuid_v1(input_payload, 'revisionId');
  perform public.social_event_uuid_v1(input_payload, 'masterContentId');
  perform public.social_event_uuid_v1(input_payload, 'variantId');
  perform public.social_event_positive_integer_v1(input_payload, 'revisionNumber');
  perform public.social_event_platform_v1(input_payload);
  perform public.social_event_sha256_v1(input_payload, 'contentHash');
  if input_payload -> 'supersedesRevisionId' <> 'null'::jsonb then
    perform public.social_event_uuid_v1(input_payload, 'supersedesRevisionId');
  end if;
end;
$$;

create or replace function public.validate_social_content_approved_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(
    input_payload,
    array['approvalId','revisionId','variantId','revisionNumber','contentHash','platform','approvalChannel']::text[]
  );
  perform public.social_event_uuid_v1(input_payload, 'approvalId');
  perform public.social_event_uuid_v1(input_payload, 'revisionId');
  perform public.social_event_uuid_v1(input_payload, 'variantId');
  perform public.social_event_positive_integer_v1(input_payload, 'revisionNumber');
  perform public.social_event_sha256_v1(input_payload, 'contentHash');
  perform public.social_event_platform_v1(input_payload);
  if jsonb_typeof(input_payload -> 'approvalChannel') <> 'string'
    or (input_payload ->> 'approvalChannel') not in ('client_portal', 'internal_admin')
  then
    raise exception using errcode = '22023', message = 'approvalChannel is invalid.';
  end if;
end;
$$;

create or replace function public.validate_social_publication_requested_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(
    input_payload,
    array['deliveryJobId','approvalId','revisionId','variantId','revisionNumber','contentHash','socialAccountId','platform','scheduledFor']::text[]
  );
  perform public.social_event_uuid_v1(input_payload, 'deliveryJobId');
  perform public.social_event_uuid_v1(input_payload, 'approvalId');
  perform public.social_event_uuid_v1(input_payload, 'revisionId');
  perform public.social_event_uuid_v1(input_payload, 'variantId');
  perform public.social_event_uuid_v1(input_payload, 'socialAccountId');
  perform public.social_event_positive_integer_v1(input_payload, 'revisionNumber');
  perform public.social_event_sha256_v1(input_payload, 'contentHash');
  perform public.social_event_platform_v1(input_payload);
  perform public.parse_social_event_utc_timestamp_v1(input_payload, 'scheduledFor');
end;
$$;

create or replace function public.validate_social_publication_succeeded_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(
    input_payload,
    array['deliveryJobId','deliveryAttemptId','revisionId','revisionNumber','contentHash','socialAccountId','platform','providerPublicationId','publishedAt']::text[]
  );
  perform public.social_event_uuid_v1(input_payload, 'deliveryJobId');
  perform public.social_event_uuid_v1(input_payload, 'deliveryAttemptId');
  perform public.social_event_uuid_v1(input_payload, 'revisionId');
  perform public.social_event_uuid_v1(input_payload, 'socialAccountId');
  perform public.social_event_positive_integer_v1(input_payload, 'revisionNumber');
  perform public.social_event_sha256_v1(input_payload, 'contentHash');
  perform public.social_event_platform_v1(input_payload);
  perform public.parse_social_event_utc_timestamp_v1(input_payload, 'publishedAt');
  if jsonb_typeof(input_payload -> 'providerPublicationId') <> 'string'
    or char_length(btrim(input_payload ->> 'providerPublicationId')) not between 1 and 255
  then
    raise exception using errcode = '22023', message = 'providerPublicationId is invalid.';
  end if;
end;
$$;

create or replace function public.validate_social_publication_failed_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(
    input_payload,
    array['deliveryJobId','deliveryAttemptId','revisionId','revisionNumber','contentHash','socialAccountId','platform','errorCategory','attemptCount','failedAt']::text[]
  );
  perform public.social_event_uuid_v1(input_payload, 'deliveryJobId');
  perform public.social_event_uuid_v1(input_payload, 'deliveryAttemptId');
  perform public.social_event_uuid_v1(input_payload, 'revisionId');
  perform public.social_event_uuid_v1(input_payload, 'socialAccountId');
  perform public.social_event_positive_integer_v1(input_payload, 'revisionNumber');
  perform public.social_event_positive_integer_v1(input_payload, 'attemptCount');
  perform public.social_event_sha256_v1(input_payload, 'contentHash');
  perform public.social_event_platform_v1(input_payload);
  perform public.parse_social_event_utc_timestamp_v1(input_payload, 'failedAt');
  if jsonb_typeof(input_payload -> 'errorCategory') <> 'string'
    or (input_payload ->> 'errorCategory') not in (
      'provider_rejected','authentication_required','account_unavailable','content_invalid',
      'media_invalid','rate_limit_exhausted','delivery_expired','internal_error'
    )
  then
    raise exception using errcode = '22023', message = 'errorCategory is invalid.';
  end if;
end;
$$;

create or replace function public.dispatch_business_event_payload_validation(
  input_validator_key text,
  input_payload jsonb
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  case input_validator_key
    when 'foundation_test_v1' then perform public.validate_business_event_foundation_test_v1(input_payload);
    when 'social_content_created_v1' then perform public.validate_social_content_created_v1(input_payload);
    when 'social_content_revision_created_v1' then perform public.validate_social_content_revision_created_v1(input_payload);
    when 'social_content_approved_v1' then perform public.validate_social_content_approved_v1(input_payload);
    when 'social_publication_requested_v1' then perform public.validate_social_publication_requested_v1(input_payload);
    when 'social_publication_succeeded_v1' then perform public.validate_social_publication_succeeded_v1(input_payload);
    when 'social_publication_failed_v1' then perform public.validate_social_publication_failed_v1(input_payload);
    else
      raise exception using
        errcode = '22023',
        message = format('Unsupported business event payload validator: %s.', coalesce(input_validator_key, '<null>'));
  end case;
end;
$$;

create or replace function public.dispatch_business_event_context_validation(
  input_validator_key text,
  input_owner_scope text,
  input_customer_id uuid,
  input_subject_type text,
  input_subject_uuid uuid,
  input_subject_external_id text,
  input_source_module text,
  input_source_operation text,
  input_causation_id uuid,
  input_deduplication_key text,
  input_occurred_at timestamptz,
  input_payload jsonb
)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  cause_record public.business_events%rowtype;
  relevant_subject_uuid uuid;
  expected_subject_type text;
  expected_operation text;
  expected_deduplication_key text;
  result_timestamp timestamptz;
begin
  if input_validator_key = 'foundation_test_v1' then
    return;
  end if;

  if input_source_module <> 'social_studio' then
    raise exception using errcode = '23514', message = 'Social events require source_module social_studio.';
  end if;

  case input_validator_key
    when 'social_content_created_v1' then
      relevant_subject_uuid := public.social_event_uuid_v1(input_payload, 'masterContentId');
      expected_subject_type := 'social_master_content';
      expected_operation := 'content_created:v1';
      expected_deduplication_key := 'social.content_created:v1:' || relevant_subject_uuid::text;
      if input_payload ->> 'origin' = 'website_signal' and input_causation_id is null then
        raise exception using errcode = '23514', message = 'website_signal content requires causation_id.';
      end if;

    when 'social_content_revision_created_v1' then
      relevant_subject_uuid := public.social_event_uuid_v1(input_payload, 'revisionId');
      expected_subject_type := 'social_content_revision';
      expected_operation := 'content_revision_created:v1';
      expected_deduplication_key := 'social.content_revision_created:v1:' || relevant_subject_uuid::text;
      if input_causation_id is null then
        raise exception using errcode = '23514', message = 'Content revision requires causation_id.';
      end if;
      select * into cause_record from public.business_events where id = input_causation_id;
      if input_payload -> 'supersedesRevisionId' = 'null'::jsonb then
        if cause_record.event_type <> 'social.content_created'
          or cause_record.subject_uuid is distinct from public.social_event_uuid_v1(input_payload, 'masterContentId')
        then
          raise exception using errcode = '23514', message = 'Initial revision must be caused by its master content event.';
        end if;
      elsif cause_record.event_type <> 'social.content_revision_created'
        or cause_record.subject_uuid is distinct from public.social_event_uuid_v1(input_payload, 'supersedesRevisionId')
        or cause_record.payload ->> 'masterContentId' is distinct from input_payload ->> 'masterContentId'
        or cause_record.payload ->> 'variantId' is distinct from input_payload ->> 'variantId'
        or cause_record.payload ->> 'platform' is distinct from input_payload ->> 'platform'
      then
        raise exception using errcode = '23514', message = 'Revision lineage does not match the superseded revision.';
      end if;

    when 'social_content_approved_v1' then
      relevant_subject_uuid := public.social_event_uuid_v1(input_payload, 'approvalId');
      expected_subject_type := 'social_approval';
      expected_operation := 'content_approved:v1';
      expected_deduplication_key := 'social.content_approved:v1:' || relevant_subject_uuid::text;
      if input_owner_scope = 'internal' and input_payload ->> 'approvalChannel' = 'client_portal' then
        raise exception using errcode = '23514', message = 'client_portal approval is customer-only.';
      end if;
      if input_causation_id is null then
        raise exception using errcode = '23514', message = 'Approval requires causation_id.';
      end if;
      select * into cause_record from public.business_events where id = input_causation_id;
      if cause_record.event_type <> 'social.content_revision_created'
        or cause_record.subject_uuid is distinct from public.social_event_uuid_v1(input_payload, 'revisionId')
        or cause_record.payload ->> 'variantId' is distinct from input_payload ->> 'variantId'
        or cause_record.payload ->> 'revisionNumber' is distinct from input_payload ->> 'revisionNumber'
        or cause_record.payload ->> 'contentHash' is distinct from input_payload ->> 'contentHash'
        or cause_record.payload ->> 'platform' is distinct from input_payload ->> 'platform'
      then
        raise exception using errcode = '23514', message = 'Approval does not match its caused revision.';
      end if;

    when 'social_publication_requested_v1' then
      relevant_subject_uuid := public.social_event_uuid_v1(input_payload, 'deliveryJobId');
      expected_subject_type := 'delivery_job';
      expected_operation := 'publication_requested:v1';
      expected_deduplication_key := 'social.publication_requested:v1:' || relevant_subject_uuid::text;
      if public.parse_social_event_utc_timestamp_v1(input_payload, 'scheduledFor') < input_occurred_at then
        raise exception using errcode = '23514', message = 'scheduledFor cannot precede the publication request.';
      end if;
      if input_causation_id is null then
        raise exception using errcode = '23514', message = 'Publication request requires causation_id.';
      end if;
      select * into cause_record from public.business_events where id = input_causation_id;
      if cause_record.event_type <> 'social.content_approved'
        or cause_record.subject_uuid is distinct from public.social_event_uuid_v1(input_payload, 'approvalId')
        or cause_record.payload ->> 'revisionId' is distinct from input_payload ->> 'revisionId'
        or cause_record.payload ->> 'variantId' is distinct from input_payload ->> 'variantId'
        or cause_record.payload ->> 'revisionNumber' is distinct from input_payload ->> 'revisionNumber'
        or cause_record.payload ->> 'contentHash' is distinct from input_payload ->> 'contentHash'
        or cause_record.payload ->> 'platform' is distinct from input_payload ->> 'platform'
      then
        raise exception using errcode = '23514', message = 'Publication request does not match its approval.';
      end if;

    when 'social_publication_succeeded_v1', 'social_publication_failed_v1' then
      relevant_subject_uuid := public.social_event_uuid_v1(input_payload, 'deliveryJobId');
      expected_subject_type := 'delivery_job';
      expected_operation := case input_validator_key
        when 'social_publication_succeeded_v1' then 'publication_succeeded:v1'
        else 'publication_failed:v1'
      end;
      expected_deduplication_key := 'social.publication_terminal:v1:' || relevant_subject_uuid::text;
      if input_causation_id is null then
        raise exception using errcode = '23514', message = 'Publication result requires causation_id.';
      end if;
      select * into cause_record from public.business_events where id = input_causation_id;
      result_timestamp := case input_validator_key
        when 'social_publication_succeeded_v1' then public.parse_social_event_utc_timestamp_v1(input_payload, 'publishedAt')
        else public.parse_social_event_utc_timestamp_v1(input_payload, 'failedAt')
      end;
      if cause_record.event_type <> 'social.publication_requested'
        or cause_record.subject_uuid is distinct from relevant_subject_uuid
        or cause_record.payload ->> 'revisionId' is distinct from input_payload ->> 'revisionId'
        or cause_record.payload ->> 'revisionNumber' is distinct from input_payload ->> 'revisionNumber'
        or cause_record.payload ->> 'contentHash' is distinct from input_payload ->> 'contentHash'
        or cause_record.payload ->> 'socialAccountId' is distinct from input_payload ->> 'socialAccountId'
        or cause_record.payload ->> 'platform' is distinct from input_payload ->> 'platform'
      then
        raise exception using errcode = '23514', message = 'Publication result does not match its request.';
      end if;
      if input_occurred_at < cause_record.occurred_at
        or result_timestamp < cause_record.occurred_at
        or result_timestamp is distinct from input_occurred_at
      then
        raise exception using errcode = '23514', message = 'Publication result timestamp precedes or differs from its event time.';
      end if;

    else
      raise exception using errcode = '22023', message = 'Unsupported social event context validator.';
  end case;

  if input_subject_type <> expected_subject_type
    or input_subject_uuid is distinct from relevant_subject_uuid
    or input_subject_external_id is not null
  then
    raise exception using errcode = '23514', message = 'Social event subject does not match its payload.';
  end if;
  if input_source_operation is distinct from expected_operation then
    raise exception using errcode = '23514', message = 'Social event source_operation is invalid.';
  end if;
  if input_deduplication_key is distinct from expected_deduplication_key then
    raise exception using errcode = '23514', message = 'Social event deduplication key is invalid.';
  end if;
end;
$$;

create or replace function public.business_event_before_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  contract_record public.business_event_contracts%rowtype;
  cause_record public.business_events%rowtype;
  payload_bytes integer;
begin
  select * into contract_record
  from public.business_event_contracts
  where event_type = new.event_type and event_version = new.event_version;

  if not found then
    raise exception using errcode = '22023', message = format('Unsupported business event contract: %s v%s.', new.event_type, new.event_version);
  end if;
  if contract_record.lifecycle_status = 'retired' then
    raise exception using errcode = '22023', message = format('Business event contract is retired: %s v%s.', new.event_type, new.event_version);
  end if;
  if not (new.owner_scope = any(contract_record.allowed_owner_scopes)) then
    raise exception using errcode = '22023', message = 'Business event owner scope is not allowed by its contract.';
  end if;

  payload_bytes := octet_length(convert_to(new.payload::text, 'UTF8'));
  if payload_bytes > contract_record.max_payload_bytes then
    raise exception using
      errcode = '22001',
      message = format('Business event payload is %s bytes; contract maximum is %s bytes.', payload_bytes, contract_record.max_payload_bytes);
  end if;

  perform public.dispatch_business_event_payload_validation(contract_record.validator_key, new.payload);

  if new.causation_id is not null then
    select * into cause_record from public.business_events where id = new.causation_id;
    if not found then
      raise exception using errcode = '23503', message = 'Causation business event does not exist.';
    end if;
    if cause_record.owner_scope is distinct from new.owner_scope
      or cause_record.customer_id is distinct from new.customer_id
    then
      raise exception using errcode = '23514', message = 'Causation business event belongs to another ownership scope.';
    end if;
  end if;

  perform public.dispatch_business_event_context_validation(
    contract_record.validator_key,
    new.owner_scope,
    new.customer_id,
    new.subject_type,
    new.subject_uuid,
    new.subject_external_id,
    new.source_module,
    new.source_operation,
    new.causation_id,
    new.deduplication_key,
    new.occurred_at,
    new.payload
  );
  return new;
end;
$$;

insert into public.business_event_contracts (
  event_type,event_version,lifecycle_status,description,allowed_owner_scopes,
  payload_schema,max_payload_bytes,validator_key,registered_by_migration
) values
(
  'social.content_created',1,'active','A Social Studio master content identity was created.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["masterContentId","origin"],"properties":{"masterContentId":{"type":"string","format":"uuid"},"origin":{"enum":["ai","employee","website_signal"]}}}'::jsonb,
  512,'social_content_created_v1','20260718222000_social_event_contracts'
),
(
  'social.content_revision_created',1,'active','An immutable publishable social content revision was created.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["revisionId","masterContentId","variantId","revisionNumber","platform","contentHash","supersedesRevisionId"],"properties":{"revisionId":{"type":"string","format":"uuid"},"masterContentId":{"type":"string","format":"uuid"},"variantId":{"type":"string","format":"uuid"},"revisionNumber":{"type":"integer","minimum":1},"platform":{"enum":["facebook","instagram"]},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"supersedesRevisionId":{"type":["string","null"],"format":"uuid"}}}'::jsonb,
  1024,'social_content_revision_created_v1','20260718222000_social_event_contracts'
),
(
  'social.content_approved',1,'active','An exact social content revision was approved.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["approvalId","revisionId","variantId","revisionNumber","contentHash","platform","approvalChannel"],"properties":{"approvalId":{"type":"string","format":"uuid"},"revisionId":{"type":"string","format":"uuid"},"variantId":{"type":"string","format":"uuid"},"revisionNumber":{"type":"integer","minimum":1},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"platform":{"enum":["facebook","instagram"]},"approvalChannel":{"enum":["client_portal","internal_admin"]}}}'::jsonb,
  1024,'social_content_approved_v1','20260718222000_social_event_contracts'
),
(
  'social.publication_requested',1,'active','A validated social publication request was accepted as a delivery job.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["deliveryJobId","approvalId","revisionId","variantId","revisionNumber","contentHash","socialAccountId","platform","scheduledFor"],"properties":{"deliveryJobId":{"type":"string","format":"uuid"},"approvalId":{"type":"string","format":"uuid"},"revisionId":{"type":"string","format":"uuid"},"variantId":{"type":"string","format":"uuid"},"revisionNumber":{"type":"integer","minimum":1},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"socialAccountId":{"type":"string","format":"uuid"},"platform":{"enum":["facebook","instagram"]},"scheduledFor":{"type":"string","format":"date-time"}}}'::jsonb,
  1536,'social_publication_requested_v1','20260718222000_social_event_contracts'
),
(
  'social.publication_succeeded',1,'active','A social publication was confirmed by its provider.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["deliveryJobId","deliveryAttemptId","revisionId","revisionNumber","contentHash","socialAccountId","platform","providerPublicationId","publishedAt"],"properties":{"deliveryJobId":{"type":"string","format":"uuid"},"deliveryAttemptId":{"type":"string","format":"uuid"},"revisionId":{"type":"string","format":"uuid"},"revisionNumber":{"type":"integer","minimum":1},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"socialAccountId":{"type":"string","format":"uuid"},"platform":{"enum":["facebook","instagram"]},"providerPublicationId":{"type":"string","minLength":1,"maxLength":255},"publishedAt":{"type":"string","format":"date-time"}}}'::jsonb,
  1536,'social_publication_succeeded_v1','20260718222000_social_event_contracts'
),
(
  'social.publication_failed',1,'active','A social publication reached a definitive non-ambiguous failure.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["deliveryJobId","deliveryAttemptId","revisionId","revisionNumber","contentHash","socialAccountId","platform","errorCategory","attemptCount","failedAt"],"properties":{"deliveryJobId":{"type":"string","format":"uuid"},"deliveryAttemptId":{"type":"string","format":"uuid"},"revisionId":{"type":"string","format":"uuid"},"revisionNumber":{"type":"integer","minimum":1},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"socialAccountId":{"type":"string","format":"uuid"},"platform":{"enum":["facebook","instagram"]},"errorCategory":{"enum":["provider_rejected","authentication_required","account_unavailable","content_invalid","media_invalid","rate_limit_exhausted","delivery_expired","internal_error"]},"attemptCount":{"type":"integer","minimum":1},"failedAt":{"type":"string","format":"date-time"}}}'::jsonb,
  1536,'social_publication_failed_v1','20260718222000_social_event_contracts'
);

revoke all on function public.assert_social_event_json_keys_v1(jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function public.social_event_uuid_v1(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.social_event_positive_integer_v1(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.social_event_sha256_v1(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.social_event_platform_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.parse_social_event_utc_timestamp_v1(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.canonical_social_content_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.social_content_hash_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_content_created_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_content_revision_created_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_content_approved_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_publication_requested_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_publication_succeeded_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_publication_failed_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.dispatch_business_event_context_validation(text,text,uuid,text,uuid,text,text,text,uuid,text,timestamptz,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.dispatch_business_event_payload_validation(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.business_event_before_insert() from public,anon,authenticated,service_role;

-- Locally evidenced source from codex/rc1-clean-migration-lineage: supabase/migrations/20260719160000_create_demo_journey_workflow.sql
-- RC1.2B: canonical Demo Journey storage required for sales validation.
--
-- Relationship contract:
-- - a canonical journey may belong to a lead, a customer, or both during conversion;
-- - a controlled manual/unlinked journey is allowed only while it retains a stable
--   business, contact, or e-mail identity;
-- - deleting a related lead or customer detaches that relation without deleting
--   the journey or the remaining parent record.

create table public.demo_journeys (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null,
  customer_id uuid null,
  business_name text null,
  contact_name text null,
  email text null,
  phone text null,
  website_url text null,
  demo_status text not null default 'geen_demo',
  generated_briefing text null,
  preview_url text null,
  preview_token text null,
  preview_package jsonb not null default '{}'::jsonb,
  preview_generated_at timestamptz null,
  feedback text null,
  internal_notes text null,
  follow_up_at timestamptz null,
  assigned_to text null,
  email_flow_enabled boolean not null default false,
  last_email_status text null,
  last_email_sent_at timestamptz null,
  next_email_type text null,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_journeys_lead_id_fkey
    foreign key (lead_id) references public.leads(id) on delete set null,
  constraint demo_journeys_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete set null,
  constraint demo_journeys_relationship_identity_check check (
    lead_id is not null
    or customer_id is not null
    or nullif(btrim(business_name), '') is not null
    or nullif(btrim(contact_name), '') is not null
    or nullif(btrim(email), '') is not null
  ),
  constraint demo_journeys_preview_token_check check (
    preview_token is null or nullif(btrim(preview_token), '') is not null
  ),
  constraint demo_journeys_demo_status_check check (
    demo_status in (
      'geen_demo',
      'aanvraag_ontvangen',
      'briefing_klaar',
      'intern_in_productie',
      'interne_preview_klaar',
      'preview_ingepland_voor_klant',
      'preview_verstuurd',
      'feedback_ontvangen',
      'aanpassingen_bezig',
      'definitieve_versie_klaar',
      'belafspraak_gepland',
      'verkocht',
      'afgewezen'
    )
  )
);

comment on table public.demo_journeys is
  'Canonical Demo Journey storage for lead, customer, or controlled transition workflows.';
comment on constraint demo_journeys_relationship_identity_check on public.demo_journeys is
  'Allows lead-only, customer-only, both during conversion, or a controlled unlinked journey with stable contact identity.';

create table public.demo_journey_events (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid not null,
  event_type text null,
  title text null,
  description text null,
  visible_to_customer boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text null,
  constraint demo_journey_events_demo_journey_id_fkey
    foreign key (demo_journey_id) references public.demo_journeys(id) on delete cascade
);

create index demo_journeys_lead_id_idx
  on public.demo_journeys (lead_id);
create index demo_journeys_customer_id_idx
  on public.demo_journeys (customer_id);
create index demo_journeys_status_idx
  on public.demo_journeys (demo_status);
create index demo_journeys_follow_up_at_idx
  on public.demo_journeys (follow_up_at);
create unique index demo_journeys_preview_token_unique_idx
  on public.demo_journeys (preview_token)
  where preview_token is not null;
create index demo_journey_events_journey_idx
  on public.demo_journey_events (demo_journey_id, created_at);
create index demo_journey_events_customer_visible_idx
  on public.demo_journey_events (demo_journey_id, visible_to_customer, created_at);

create function public.set_demo_journey_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

revoke all privileges on function public.set_demo_journey_updated_at()
  from public, anon, authenticated;
grant execute on function public.set_demo_journey_updated_at()
  to service_role;

create trigger demo_journeys_set_updated_at
before update on public.demo_journeys
for each row
execute function public.set_demo_journey_updated_at();

alter table public.demo_journeys enable row level security;
alter table public.demo_journey_events enable row level security;

revoke all privileges on table public.demo_journeys
  from public, anon, authenticated, service_role;
revoke all privileges on table public.demo_journey_events
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.demo_journeys
  to service_role;
grant select, insert, update, delete on table public.demo_journey_events
  to service_role;

create policy demo_journeys_no_direct_client_access
on public.demo_journeys
for all
to anon, authenticated
using (false)
with check (false);

create policy demo_journey_events_no_direct_client_access
on public.demo_journey_events
for all
to anon, authenticated
using (false)
with check (false);


-- Locally evidenced source from codex/rc1-clean-migration-lineage: supabase/migrations/20260719170000_create_website_factory_core.sql
-- RC1.5A: minimal, idempotent Website Factory storage and atomic preview promotion.

create table public.website_build_jobs (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid not null,
  lead_id uuid null,
  customer_id uuid null,
  status text not null default 'queued',
  package_type text not null,
  generator_version text not null,
  request_fingerprint text not null,
  idempotency_key text not null,
  generated_package jsonb null,
  package_checksum text null,
  error_phase text null,
  error_code text null,
  error_message text null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_build_jobs_demo_journey_id_fkey
    foreign key (demo_journey_id) references public.demo_journeys(id) on delete cascade,
  constraint website_build_jobs_lead_id_fkey
    foreign key (lead_id) references public.leads(id) on delete set null,
  constraint website_build_jobs_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete set null,
  constraint website_build_jobs_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  constraint website_build_jobs_package_type_check
    check (nullif(btrim(package_type), '') is not null),
  constraint website_build_jobs_generator_version_check
    check (nullif(btrim(generator_version), '') is not null),
  constraint website_build_jobs_request_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint website_build_jobs_idempotency_key_check
    check (nullif(btrim(idempotency_key), '') is not null),
  constraint website_build_jobs_succeeded_package_check
    check (
      status <> 'succeeded'
      or (
        generated_package is not null
        and jsonb_typeof(generated_package) = 'object'
        and generated_package <> '{}'::jsonb
        and package_checksum ~ '^[0-9a-f]{64}$'
      )
    ),
  constraint website_build_jobs_journey_fingerprint_key
    unique (demo_journey_id, request_fingerprint),
  constraint website_build_jobs_journey_idempotency_key
    unique (demo_journey_id, idempotency_key)
);

create table public.website_preview_versions (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid not null,
  build_job_id uuid not null,
  version integer not null,
  preview_url text not null,
  preview_token text not null,
  generated_package jsonb not null,
  package_checksum text not null,
  is_active boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint website_preview_versions_demo_journey_id_fkey
    foreign key (demo_journey_id) references public.demo_journeys(id) on delete cascade,
  constraint website_preview_versions_build_job_id_fkey
    foreign key (build_job_id) references public.website_build_jobs(id) on delete restrict,
  constraint website_preview_versions_version_check
    check (version > 0),
  constraint website_preview_versions_preview_url_check
    check (nullif(btrim(preview_url), '') is not null),
  constraint website_preview_versions_preview_token_check
    check (nullif(btrim(preview_token), '') is not null),
  constraint website_preview_versions_package_check
    check (jsonb_typeof(generated_package) = 'object' and generated_package <> '{}'::jsonb),
  constraint website_preview_versions_package_checksum_check
    check (package_checksum ~ '^[0-9a-f]{64}$'),
  constraint website_preview_versions_journey_version_key
    unique (demo_journey_id, version),
  constraint website_preview_versions_build_job_key
    unique (build_job_id),
  constraint website_preview_versions_preview_token_key
    unique (preview_token)
);

create index website_build_jobs_journey_created_idx
  on public.website_build_jobs (demo_journey_id, created_at desc);
create index website_build_jobs_lead_created_idx
  on public.website_build_jobs (lead_id, created_at desc)
  where lead_id is not null;
create index website_build_jobs_customer_created_idx
  on public.website_build_jobs (customer_id, created_at desc)
  where customer_id is not null;
create index website_build_jobs_status_idx
  on public.website_build_jobs (status, updated_at);
create index website_preview_versions_journey_created_idx
  on public.website_preview_versions (demo_journey_id, version desc);
create unique index website_preview_versions_one_active_idx
  on public.website_preview_versions (demo_journey_id)
  where is_active;

create function public.set_website_build_job_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create trigger website_build_jobs_set_updated_at
before update on public.website_build_jobs
for each row
execute function public.set_website_build_job_updated_at();

create function public.validate_website_preview_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  build_record public.website_build_jobs%rowtype;
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'is_active') <> (to_jsonb(old) - 'is_active') then
    raise exception 'website preview versions are immutable'
      using errcode = '55000';
  end if;

  select * into build_record
  from public.website_build_jobs
  where id = new.build_job_id;

  if not found
     or build_record.status <> 'succeeded'
     or build_record.demo_journey_id <> new.demo_journey_id
     or build_record.generated_package is distinct from new.generated_package
     or build_record.package_checksum is distinct from new.package_checksum then
    raise exception 'preview version must exactly match a succeeded build'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create trigger website_preview_versions_validate_and_immutable
before insert or update on public.website_preview_versions
for each row
execute function public.validate_website_preview_version();

create function public.promote_website_factory_preview(
  p_build_job_id uuid,
  p_preview_url text,
  p_preview_token text,
  p_created_by text
)
returns table (
  preview_version_id uuid,
  demo_journey_id uuid,
  build_job_id uuid,
  version integer,
  preview_url text,
  preview_token text,
  generated_package jsonb,
  package_checksum text,
  is_active boolean,
  created_at timestamptz,
  created_by text,
  created boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  build_record public.website_build_jobs%rowtype;
  journey_record public.demo_journeys%rowtype;
  preview_record public.website_preview_versions%rowtype;
  next_version integer;
  merged_package jsonb;
begin
  if nullif(pg_catalog.btrim(p_preview_url), '') is null
     or nullif(pg_catalog.btrim(p_preview_token), '') is null
     or nullif(pg_catalog.btrim(p_created_by), '') is null then
    raise exception 'preview promotion parameters are incomplete'
      using errcode = '22023';
  end if;

  select * into build_record
  from public.website_build_jobs
  where id = p_build_job_id
  for update;

  if not found then
    raise exception 'website build job not found' using errcode = 'P0002';
  end if;
  if build_record.status <> 'succeeded'
     or build_record.generated_package is null
     or build_record.generated_package = '{}'::jsonb
     or build_record.package_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'website build job is not promotable' using errcode = '23514';
  end if;

  select * into journey_record
  from public.demo_journeys
  where id = build_record.demo_journey_id
  for update;

  if not found then
    raise exception 'demo journey for website build job not found' using errcode = 'P0002';
  end if;

  select * into preview_record
  from public.website_preview_versions
  where website_preview_versions.build_job_id = build_record.id;

  if found then
    return query select
      preview_record.id, preview_record.demo_journey_id, preview_record.build_job_id,
      preview_record.version, preview_record.preview_url, preview_record.preview_token,
      preview_record.generated_package, preview_record.package_checksum,
      preview_record.is_active, preview_record.created_at, preview_record.created_by, false;
    return;
  end if;

  select coalesce(max(website_preview_versions.version), 0) + 1
  into next_version
  from public.website_preview_versions
  where website_preview_versions.demo_journey_id = build_record.demo_journey_id;

  insert into public.website_preview_versions (
    demo_journey_id, build_job_id, version, preview_url, preview_token,
    generated_package, package_checksum, is_active, created_by
  ) values (
    build_record.demo_journey_id, build_record.id, next_version,
    pg_catalog.btrim(p_preview_url), pg_catalog.btrim(p_preview_token),
    build_record.generated_package, build_record.package_checksum, false,
    pg_catalog.btrim(p_created_by)
  ) returning * into preview_record;

  update public.website_preview_versions
  set is_active = false
  where website_preview_versions.demo_journey_id = build_record.demo_journey_id
    and website_preview_versions.id <> preview_record.id
    and website_preview_versions.is_active;

  update public.website_preview_versions
  set is_active = true
  where website_preview_versions.id = preview_record.id
  returning * into preview_record;

  merged_package := build_record.generated_package
    || case when journey_record.preview_package ? 'manualPreview'
      then pg_catalog.jsonb_build_object('manualPreview', journey_record.preview_package -> 'manualPreview') else '{}'::jsonb end
    || case when journey_record.preview_package ? 'savedDemoSite'
      then pg_catalog.jsonb_build_object('savedDemoSite', journey_record.preview_package -> 'savedDemoSite') else '{}'::jsonb end
    || case when journey_record.preview_package ? 'linkedRecords'
      then pg_catalog.jsonb_build_object('linkedRecords', journey_record.preview_package -> 'linkedRecords') else '{}'::jsonb end
    || case when journey_record.preview_package ? 'activePreviewSource'
      then pg_catalog.jsonb_build_object('activePreviewSource', journey_record.preview_package -> 'activePreviewSource') else '{}'::jsonb end;

  update public.demo_journeys
  set preview_url = preview_record.preview_url,
      preview_token = preview_record.preview_token,
      preview_package = merged_package,
      preview_generated_at = pg_catalog.clock_timestamp(),
      demo_status = 'interne_preview_klaar',
      updated_by = pg_catalog.btrim(p_created_by)
  where id = build_record.demo_journey_id;

  return query select
    preview_record.id, preview_record.demo_journey_id, preview_record.build_job_id,
    preview_record.version, preview_record.preview_url, preview_record.preview_token,
    preview_record.generated_package, preview_record.package_checksum,
    preview_record.is_active, preview_record.created_at, preview_record.created_by, true;
end;
$function$;

alter table public.website_build_jobs enable row level security;
alter table public.website_preview_versions enable row level security;

revoke all privileges on table public.website_build_jobs
  from public, anon, authenticated, service_role;
revoke all privileges on table public.website_preview_versions
  from public, anon, authenticated, service_role;
revoke all privileges on function public.set_website_build_job_updated_at()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.validate_website_preview_version()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.promote_website_factory_preview(uuid, text, text, text)
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.website_build_jobs
  to service_role;
grant select on table public.website_preview_versions
  to service_role;
grant execute on function public.promote_website_factory_preview(uuid, text, text, text)
  to service_role;

create policy website_build_jobs_no_direct_client_access
on public.website_build_jobs
for all
to anon, authenticated
using (false)
with check (false);

create policy website_preview_versions_no_direct_client_access
on public.website_preview_versions
for all
to anon, authenticated
using (false)
with check (false);


-- Locally evidenced source from codex/rc1-clean-migration-lineage: supabase/migrations/20260719180000_optimize_website_factory_preview_promotion.sql
-- RC1.5D: keep atomic preview promotion below the API statement timeout for large packages.

do $migration_guard$
declare
  promotion_definition_md5 text;
  validation_definition_md5 text;
  validation_trigger_md5 text;
begin
  select pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
  into promotion_definition_md5
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.oid = 'public.promote_website_factory_preview(uuid,text,text,text)'::pg_catalog.regprocedure;

  select pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
  into validation_definition_md5
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.oid = 'public.validate_website_preview_version()'::pg_catalog.regprocedure;

  select pg_catalog.md5(pg_catalog.pg_get_triggerdef(t.oid, true))
  into validation_trigger_md5
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'website_preview_versions'
    and t.tgname = 'website_preview_versions_validate_and_immutable'
    and not t.tgisinternal;

  if promotion_definition_md5 is distinct from 'faa14563e803c069ef873edf00dcac08' then
    raise exception 'unexpected promote_website_factory_preview definition: %', promotion_definition_md5
      using errcode = '55000';
  end if;
  if validation_definition_md5 is distinct from 'bf64b4d0c635faa6fc6dae1a1dfe7c5d' then
    raise exception 'unexpected validate_website_preview_version definition: %', validation_definition_md5
      using errcode = '55000';
  end if;
  if validation_trigger_md5 is distinct from 'd581c570b3a01e86ce1a615a78f002f4' then
    raise exception 'unexpected website preview validation trigger definition: %', validation_trigger_md5
      using errcode = '55000';
  end if;
end;
$migration_guard$;

create or replace function public.validate_website_preview_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  build_record record;
begin
  if tg_op = 'UPDATE' then
    raise exception 'website preview versions are immutable'
      using errcode = '55000';
  end if;

  select status, demo_journey_id, package_checksum
  into build_record
  from public.website_build_jobs
  where id = new.build_job_id;

  if not found
     or build_record.status <> 'succeeded'
     or build_record.demo_journey_id <> new.demo_journey_id
     or build_record.package_checksum is distinct from new.package_checksum then
    raise exception 'preview version must exactly match a succeeded build'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger website_preview_versions_validate_and_immutable
  on public.website_preview_versions;

create trigger website_preview_versions_validate_build
before insert on public.website_preview_versions
for each row
execute function public.validate_website_preview_version();

create trigger website_preview_versions_reject_immutable_update
before update of
  id, demo_journey_id, build_job_id, version, preview_url, preview_token,
  generated_package, package_checksum, created_by, created_at
on public.website_preview_versions
for each row
execute function public.validate_website_preview_version();

create or replace function public.promote_website_factory_preview(
  p_build_job_id uuid,
  p_preview_url text,
  p_preview_token text,
  p_created_by text
)
returns table (
  preview_version_id uuid,
  demo_journey_id uuid,
  build_job_id uuid,
  version integer,
  preview_url text,
  preview_token text,
  generated_package jsonb,
  package_checksum text,
  is_active boolean,
  created_at timestamptz,
  created_by text,
  created boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  build_record public.website_build_jobs%rowtype;
  journey_record public.demo_journeys%rowtype;
  preview_record public.website_preview_versions%rowtype;
  next_version integer;
  merged_package jsonb;
  promoted_briefing text;
begin
  if nullif(pg_catalog.btrim(p_preview_url), '') is null
     or nullif(pg_catalog.btrim(p_preview_token), '') is null
     or nullif(pg_catalog.btrim(p_created_by), '') is null then
    raise exception 'preview promotion parameters are incomplete'
      using errcode = '22023';
  end if;

  select * into build_record
  from public.website_build_jobs
  where id = p_build_job_id
  for update;

  if not found then
    raise exception 'website build job not found' using errcode = 'P0002';
  end if;
  if build_record.status <> 'succeeded'
     or build_record.generated_package is null
     or build_record.generated_package = '{}'::jsonb
     or build_record.package_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'website build job is not promotable' using errcode = '23514';
  end if;

  select * into journey_record
  from public.demo_journeys
  where id = build_record.demo_journey_id
  for update;

  if not found then
    raise exception 'demo journey for website build job not found' using errcode = 'P0002';
  end if;

  select * into preview_record
  from public.website_preview_versions
  where website_preview_versions.build_job_id = build_record.id;

  if found then
    return query select
      preview_record.id, preview_record.demo_journey_id, preview_record.build_job_id,
      preview_record.version, preview_record.preview_url, preview_record.preview_token,
      null::jsonb, preview_record.package_checksum,
      preview_record.is_active, preview_record.created_at, preview_record.created_by, false;
    return;
  end if;

  select coalesce(max(website_preview_versions.version), 0) + 1
  into next_version
  from public.website_preview_versions
  where website_preview_versions.demo_journey_id = build_record.demo_journey_id;

  insert into public.website_preview_versions (
    demo_journey_id, build_job_id, version, preview_url, preview_token,
    generated_package, package_checksum, is_active, created_by
  ) values (
    build_record.demo_journey_id, build_record.id, next_version,
    pg_catalog.btrim(p_preview_url), pg_catalog.btrim(p_preview_token),
    build_record.generated_package, build_record.package_checksum, false,
    pg_catalog.btrim(p_created_by)
  ) returning * into preview_record;

  update public.website_preview_versions
  set is_active = false
  where website_preview_versions.demo_journey_id = build_record.demo_journey_id
    and website_preview_versions.id <> preview_record.id
    and website_preview_versions.is_active;

  update public.website_preview_versions
  set is_active = true
  where website_preview_versions.id = preview_record.id
  returning * into preview_record;

  merged_package := build_record.generated_package
    || case when journey_record.preview_package ? 'manualPreview'
      then pg_catalog.jsonb_build_object('manualPreview', journey_record.preview_package -> 'manualPreview') else '{}'::jsonb end
    || case when journey_record.preview_package ? 'savedDemoSite'
      then pg_catalog.jsonb_build_object('savedDemoSite', journey_record.preview_package -> 'savedDemoSite') else '{}'::jsonb end
    || case when journey_record.preview_package ? 'linkedRecords'
      then pg_catalog.jsonb_build_object('linkedRecords', journey_record.preview_package -> 'linkedRecords') else '{}'::jsonb end
    || case when journey_record.preview_package ? 'activePreviewSource'
      then pg_catalog.jsonb_build_object('activePreviewSource', journey_record.preview_package -> 'activePreviewSource') else '{}'::jsonb end;

  promoted_briefing := nullif(
    pg_catalog.btrim(build_record.generated_package #>> '{meta,customerWishes}'),
    ''
  );

  update public.demo_journeys
  set preview_url = preview_record.preview_url,
      preview_token = preview_record.preview_token,
      preview_package = merged_package,
      preview_generated_at = pg_catalog.clock_timestamp(),
      demo_status = 'interne_preview_klaar',
      generated_briefing = coalesce(promoted_briefing, journey_record.generated_briefing),
      updated_by = pg_catalog.btrim(p_created_by)
  where id = build_record.demo_journey_id;

  return query select
    preview_record.id, preview_record.demo_journey_id, preview_record.build_job_id,
    preview_record.version, preview_record.preview_url, preview_record.preview_token,
    null::jsonb, preview_record.package_checksum,
    preview_record.is_active, preview_record.created_at, preview_record.created_by, true;
end;
$function$;

revoke all privileges on function public.validate_website_preview_version()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.promote_website_factory_preview(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.promote_website_factory_preview(uuid, text, text, text)
  to service_role;


-- Locally evidenced source from codex/rc1-clean-migration-lineage: supabase/migrations/20260719190000_create_demo_invitation_delivery_foundation.sql
-- RC1.6B: durable, idempotent demo invitation delivery and preview-open tracking.
-- This migration creates storage and bounded RPCs only. It never calls a provider.

create extension if not exists pgcrypto;

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  direction text not null default 'outbound',
  status text not null default 'planned',
  provider text not null default 'resend',
  provider_message_id text null,
  provider_metadata jsonb not null default '{}'::jsonb,
  message_type text not null default 'generic',
  template_key text null,
  template_name text null,
  template_id text null,
  template_version integer null,
  from_email text null,
  from_name text null,
  to_email text not null,
  normalized_recipient_email text not null,
  to_name text null,
  reply_to text null,
  subject text not null,
  html_body text null,
  text_body text null,
  customer_id uuid null,
  lead_id uuid null,
  invoice_id uuid null,
  project_id uuid null,
  demo_journey_id uuid null,
  preview_version_id uuid null,
  preview_version integer null,
  preview_checksum text null,
  preview_token_fingerprint text null,
  preview_url text null,
  public_reference text null,
  idempotency_key text not null,
  owner_user_id uuid null,
  triggered_by text null,
  triggered_by_user_id uuid null,
  created_by text not null,
  attempt_count integer not null default 0,
  claimed_at timestamptz null,
  claimed_by text null,
  claim_token_hash text null,
  send_started_at timestamptz null,
  sent_at timestamptz null,
  last_error_at timestamptz null,
  error_code text null,
  error_category text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_logs_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null,
  constraint email_logs_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete set null,
  constraint email_logs_demo_journey_id_fkey foreign key (demo_journey_id) references public.demo_journeys(id) on delete restrict,
  constraint email_logs_preview_version_id_fkey foreign key (preview_version_id) references public.website_preview_versions(id) on delete restrict,
  constraint email_logs_status_check check (status in ('planned','sending','sent','failed','delivery_unknown','cancelled','pending','delivered','bounced','complained','opened','clicked')),
  constraint email_logs_direction_check check (direction in ('outbound','inbound')),
  constraint email_logs_recipient_check check (normalized_recipient_email = lower(btrim(to_email)) and normalized_recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint email_logs_idempotency_key_check check (idempotency_key ~ '^[0-9a-f]{64}$'),
  constraint email_logs_attempt_count_check check (attempt_count >= 0),
  constraint email_logs_provider_metadata_check check (jsonb_typeof(provider_metadata) = 'object'),
  constraint email_logs_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint email_logs_demo_invitation_snapshot_check check (
    message_type <> 'demo_preview_invitation'
    or (
      direction = 'outbound'
      and demo_journey_id is not null and preview_version_id is not null
      and preview_version > 0 and preview_checksum ~ '^[0-9a-f]{64}$'
      and preview_token_fingerprint ~ '^[0-9a-f]{64}$'
      and nullif(btrim(preview_url), '') is not null
      and public_reference ~ '^[0-9a-f]{64}$'
      and nullif(btrim(template_id), '') is not null and template_version > 0
      and owner_user_id is not null
    )
  ),
  constraint email_logs_sending_claim_check check (
    status <> 'sending'
    or (claimed_at is not null and send_started_at is not null and nullif(btrim(claimed_by), '') is not null and claim_token_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint email_logs_sent_result_check check (status <> 'sent' or (sent_at is not null and nullif(btrim(provider_message_id), '') is not null)),
  constraint email_logs_unknown_result_check check (status <> 'delivery_unknown' or last_error_at is not null),
  constraint email_logs_idempotency_key_unique unique (idempotency_key),
  constraint email_logs_public_reference_unique unique (public_reference)
);

create index email_logs_journey_created_idx on public.email_logs (demo_journey_id, created_at desc) where demo_journey_id is not null;
create index email_logs_preview_created_idx on public.email_logs (preview_version_id, created_at desc) where preview_version_id is not null;
create index email_logs_lead_created_idx on public.email_logs (lead_id, created_at desc) where lead_id is not null;
create index email_logs_customer_created_idx on public.email_logs (customer_id, created_at desc) where customer_id is not null;
create index email_logs_status_updated_idx on public.email_logs (status, updated_at);
create index email_logs_provider_message_idx on public.email_logs (provider_message_id) where provider_message_id is not null;
create index email_logs_recipient_created_idx on public.email_logs (normalized_recipient_email, created_at desc);

create function public.assert_demo_invitation_service_role()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare jwt_role text;
begin
  jwt_role := nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  if jwt_role is null then
    begin
      jwt_role := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    exception when others then jwt_role := null;
    end;
  end if;
  if jwt_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Demo invitation RPC requires service_role.';
  end if;
end;
$function$;

create function public.set_email_log_updated_at()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin new.updated_at := pg_catalog.clock_timestamp(); return new; end;
$function$;

create function public.guard_email_log_snapshot()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin
  if old.message_type = 'demo_preview_invitation' and (
    old.idempotency_key is distinct from new.idempotency_key or old.demo_journey_id is distinct from new.demo_journey_id
    or old.preview_version_id is distinct from new.preview_version_id or old.preview_version is distinct from new.preview_version
    or old.preview_checksum is distinct from new.preview_checksum or old.preview_token_fingerprint is distinct from new.preview_token_fingerprint
    or old.preview_url is distinct from new.preview_url or old.public_reference is distinct from new.public_reference
    or old.normalized_recipient_email is distinct from new.normalized_recipient_email
    or old.template_id is distinct from new.template_id or old.template_version is distinct from new.template_version
  ) then
    raise exception using errcode = '55000', message = 'Demo invitation snapshots are immutable.';
  end if;
  return new;
end;
$function$;

create trigger email_logs_set_updated_at before update on public.email_logs for each row execute function public.set_email_log_updated_at();
create trigger email_logs_guard_snapshot before update on public.email_logs for each row execute function public.guard_email_log_snapshot();

create function public.plan_demo_invitation(
  input_demo_journey_id uuid, input_preview_version_id uuid,
  input_template_id text, input_template_version integer, input_recipient_email text,
  input_subject text, input_html_body text, input_text_body text,
  input_idempotency_key text, input_public_reference text,
  input_preview_token_fingerprint text, input_created_by text, input_requesting_user_id uuid default null
)
returns table (email_log_id uuid, status text, created boolean, owner_user_id uuid, preview_url text, public_reference text, provider_message_id text)
language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  journey_record public.demo_journeys%rowtype;
  preview_record public.website_preview_versions%rowtype;
  lead_record public.leads%rowtype;
  log_record public.email_logs%rowtype;
  normalized_email text := pg_catalog.lower(pg_catalog.btrim(input_recipient_email));
  expected_key text;
  expected_reference text;
  delivery_url text;
  resolved_owner uuid;
  did_create boolean := false;
begin
  perform public.assert_demo_invitation_service_role();
  if input_template_version < 1 or nullif(pg_catalog.btrim(input_template_id),'') is null
     or nullif(pg_catalog.btrim(input_created_by),'') is null
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or nullif(pg_catalog.btrim(input_subject),'') is null
     or nullif(pg_catalog.btrim(input_html_body),'') is null
     or nullif(pg_catalog.btrim(input_text_body),'') is null then
    raise exception using errcode = '22023', message = 'Demo invitation input is incomplete.';
  end if;

  select * into journey_record from public.demo_journeys where id=input_demo_journey_id for share;
  if not found then raise exception using errcode='P0002', message='Demo journey not found.'; end if;
  select * into preview_record from public.website_preview_versions
    where id=input_preview_version_id and demo_journey_id=input_demo_journey_id and is_active for share;
  if not found then raise exception using errcode='23514', message='Active preview version does not match the demo journey.'; end if;
  if journey_record.preview_token is distinct from preview_record.preview_token
     or journey_record.preview_url is distinct from preview_record.preview_url then
    raise exception using errcode='23514', message='Journey and active preview binding do not match.';
  end if;
  if input_preview_token_fingerprint is distinct from encode(public.digest(preview_record.preview_token,'sha256'),'hex') then
    raise exception using errcode='23514', message='Preview token fingerprint does not match.';
  end if;
  if journey_record.email is not null and pg_catalog.lower(pg_catalog.btrim(journey_record.email)) <> normalized_email then
    raise exception using errcode='23514', message='Recipient does not match the demo journey.';
  end if;

  expected_key := encode(public.digest(
    'demo_preview_invitation' || chr(10) || input_demo_journey_id::text || chr(10) || input_preview_version_id::text || chr(10)
    || pg_catalog.btrim(input_template_id) || chr(10) || input_template_version::text || chr(10) || normalized_email,
    'sha256'),'hex');
  expected_reference := encode(public.digest('demo_invitation_public' || chr(10) || expected_key,'sha256'),'hex');
  if input_idempotency_key is distinct from expected_key or input_public_reference is distinct from expected_reference then
    raise exception using errcode='23514', message='Demo invitation identity is invalid.';
  end if;

  if journey_record.lead_id is not null then
    select * into lead_record from public.leads where id=journey_record.lead_id for share;
    if not found then raise exception using errcode='23503', message='Demo journey lead was not found.'; end if;
    resolved_owner := coalesce(lead_record.assigned_user_id, input_requesting_user_id, lead_record.assigned_by);
  else
    resolved_owner := input_requesting_user_id;
  end if;
  if resolved_owner is null then
    select id into resolved_owner from public.profiles
    where lower(coalesce(status,'active')) in ('active','invited')
      and lower(coalesce(role,'')) in ('super_admin','admin','sales','sales_manager','sales_partner')
    order by created_at, id limit 1;
  end if;
  if resolved_owner is null then raise exception using errcode='23514', message='No responsible owner is available for the demo invitation.'; end if;

  delivery_url := preview_record.preview_url || case when position('?' in preview_record.preview_url)>0 then '&' else '?' end
    || 'invitation=' || expected_reference;
  if position(delivery_url in input_html_body)=0 or position(delivery_url in input_text_body)=0 then
    raise exception using errcode='23514', message='Demo invitation content is not bound to the planned preview URL.';
  end if;

  insert into public.email_logs (
    status, provider, message_type, template_key, template_name, template_id, template_version,
    to_email, normalized_recipient_email, subject, html_body, text_body,
    customer_id, lead_id, demo_journey_id, preview_version_id, preview_version, preview_checksum,
    preview_token_fingerprint, preview_url, public_reference, idempotency_key, owner_user_id,
    triggered_by, triggered_by_user_id, created_by
  ) values (
    'planned','resend','demo_preview_invitation',pg_catalog.btrim(input_template_id),'Persoonlijke demo-uitnodiging',
    pg_catalog.btrim(input_template_id),input_template_version,normalized_email,normalized_email,
    pg_catalog.btrim(input_subject),input_html_body,input_text_body,
    journey_record.customer_id,journey_record.lead_id,journey_record.id,preview_record.id,preview_record.version,preview_record.package_checksum,
    input_preview_token_fingerprint,delivery_url,expected_reference,expected_key,resolved_owner,
    'demo_journey',input_requesting_user_id,pg_catalog.btrim(input_created_by)
  ) on conflict (idempotency_key) do nothing returning * into log_record;
  if log_record.id is null then
    select * into log_record from public.email_logs where idempotency_key=expected_key;
  else did_create := true;
  end if;
  if log_record.demo_journey_id <> input_demo_journey_id or log_record.preview_version_id <> input_preview_version_id
     or log_record.normalized_recipient_email <> normalized_email then
    raise exception using errcode='23514', message='Existing invitation does not match the logical request.';
  end if;
  return query select log_record.id,log_record.status,did_create,log_record.owner_user_id,log_record.preview_url,log_record.public_reference,log_record.provider_message_id;
end;
$function$;

create function public.claim_demo_invitation(input_email_log_id uuid, input_claim_token text, input_claimed_by text)
returns table (email_log_id uuid, status text, claimed boolean, attempt_count integer, preview_url text, provider_message_id text)
language plpgsql security definer set search_path = pg_catalog
as $function$
declare log_record public.email_logs%rowtype; did_claim boolean := false;
begin
  perform public.assert_demo_invitation_service_role();
  if char_length(pg_catalog.btrim(input_claim_token)) < 32 or nullif(pg_catalog.btrim(input_claimed_by),'') is null then
    raise exception using errcode='22023', message='Provider claim input is invalid.';
  end if;
  update public.email_logs as logs set status='sending',attempt_count=logs.attempt_count+1,claimed_at=clock_timestamp(),
    claimed_by=pg_catalog.btrim(input_claimed_by),claim_token_hash=encode(public.digest(input_claim_token,'sha256'),'hex'),send_started_at=clock_timestamp()
  where logs.id=input_email_log_id and logs.message_type='demo_preview_invitation' and logs.status='planned'
  returning * into log_record;
  if log_record.id is null then select * into log_record from public.email_logs where id=input_email_log_id; else did_claim := true; end if;
  if log_record.id is null then raise exception using errcode='P0002', message='Demo invitation not found.'; end if;
  return query select log_record.id,log_record.status,did_claim,log_record.attempt_count,log_record.preview_url,log_record.provider_message_id;
end;
$function$;

create function public.complete_demo_invitation(
  input_email_log_id uuid, input_claim_token text, input_outcome text,
  input_provider_message_id text default null, input_provider_metadata jsonb default '{}'::jsonb,
  input_error_code text default null, input_error_category text default null, input_error_message text default null
)
returns table (email_log_id uuid, status text, provider_message_id text, sent_at timestamptz)
language plpgsql security definer set search_path = pg_catalog
as $function$
declare log_record public.email_logs%rowtype; now_value timestamptz := clock_timestamp();
begin
  perform public.assert_demo_invitation_service_role();
  if input_outcome not in ('sent','failed','delivery_unknown') or jsonb_typeof(coalesce(input_provider_metadata,'{}'::jsonb)) <> 'object' then
    raise exception using errcode='22023', message='Provider outcome is invalid.';
  end if;
  select * into log_record from public.email_logs where id=input_email_log_id for update;
  if not found then raise exception using errcode='P0002', message='Demo invitation not found.'; end if;
  if log_record.status='sent' then return query select log_record.id,log_record.status,log_record.provider_message_id,log_record.sent_at; return; end if;
  if log_record.status <> 'sending' or log_record.claim_token_hash is distinct from encode(public.digest(input_claim_token,'sha256'),'hex') then
    raise exception using errcode='55000', message='Demo invitation provider claim is invalid.';
  end if;
  if input_outcome='sent' and nullif(pg_catalog.btrim(input_provider_message_id),'') is null then
    raise exception using errcode='22023', message='Successful provider outcome requires a message id.';
  end if;
  update public.email_logs set status=input_outcome,provider_message_id=nullif(pg_catalog.btrim(input_provider_message_id),''),
    provider_metadata=coalesce(input_provider_metadata,'{}'::jsonb),sent_at=case when input_outcome='sent' then now_value else null end,
    last_error_at=case when input_outcome<>'sent' then now_value else null end,error_code=nullif(pg_catalog.btrim(input_error_code),''),
    error_category=nullif(pg_catalog.btrim(input_error_category),''),error_message=left(nullif(pg_catalog.btrim(input_error_message),''),500)
  where id=log_record.id returning * into log_record;
  if input_outcome='sent' then
    update public.demo_journeys set demo_status='preview_verstuurd',last_email_status='sent:demo_preview_invitation',
      last_email_sent_at=now_value,next_email_type='day4_feedback_refinement',follow_up_at=now_value+interval '24 hours',
      assigned_to=coalesce(nullif(assigned_to,''),log_record.owner_user_id::text),updated_by=log_record.created_by
    where id=log_record.demo_journey_id;
    if log_record.lead_id is not null then
      update public.leads set lead_status='demo_sent',assigned_user_id=coalesce(assigned_user_id,log_record.owner_user_id),
        assigned_at=coalesce(assigned_at,now_value),next_action_type='follow_up',
        next_action_note='Controleer of de lead de persoonlijke demo heeft bekeken en neem contact op.',
        next_action_at=now_value+interval '24 hours',next_action_assigned_user_id=log_record.owner_user_id,
        next_action_created_automatically=true,last_contacted_at=now_value,last_activity_at=now_value
      where id=log_record.lead_id;
    end if;
    insert into public.demo_journey_events (demo_journey_id,event_type,title,description,visible_to_customer,created_by)
      select log_record.demo_journey_id,'email','Persoonlijke demo verstuurd','De persoonlijke demo-uitnodiging is verzonden.',false,log_record.created_by
      where not exists (select 1 from public.demo_journey_events where demo_journey_id=log_record.demo_journey_id and event_type='email' and description='mail:'||log_record.id::text);
  end if;
  return query select log_record.id,log_record.status,log_record.provider_message_id,log_record.sent_at;
end;
$function$;

alter table public.email_logs enable row level security;
revoke all privileges on table public.email_logs from public,anon,authenticated,service_role;
grant select,insert,update on table public.email_logs to service_role;
create policy email_logs_no_direct_client_access on public.email_logs for all to anon,authenticated using(false) with check(false);

revoke all on function public.assert_demo_invitation_service_role() from public,anon,authenticated,service_role;
revoke all on function public.plan_demo_invitation(uuid,uuid,text,integer,text,text,text,text,text,text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.claim_demo_invitation(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.complete_demo_invitation(uuid,text,text,text,jsonb,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.plan_demo_invitation(uuid,uuid,text,integer,text,text,text,text,text,text,text,text,uuid) to service_role;
grant execute on function public.claim_demo_invitation(uuid,text,text) to service_role;
grant execute on function public.complete_demo_invitation(uuid,text,text,text,jsonb,text,text,text) to service_role;

-- Dependency-reordered local source: supabase/migrations/20260711133000_preview_publication_portal_review.sql
-- Additive portal review fields for the optional Website Factory preview table.
-- The base table belongs to migration-drafts/019_ai_website_factory_v1.sql and may
-- not exist in environments where that feature has not been promoted yet.
-- Existing timeline flows keep using timelineService and remain outside this migration.

do $migration$
begin
  if to_regclass('public.website_preview_versions') is null then
    raise notice 'Skipping preview publication portal review: public.website_preview_versions does not exist';
    return;
  end if;

  alter table public.website_preview_versions
    add column if not exists customer_id uuid null,
    add column if not exists project_id uuid null,
    add column if not exists website_id uuid null,
    add column if not exists title text null default 'Website-preview',
    add column if not exists customer_summary text null,
    add column if not exists change_summary text null,
    add column if not exists safe_preview_path text null,
    add column if not exists published_to_portal boolean null default false,
    add column if not exists published_at timestamptz null,
    add column if not exists published_by uuid null,
    add column if not exists review_deadline timestamptz null,
    add column if not exists allow_feedback boolean null default true,
    add column if not exists allow_approval boolean null default true,
    add column if not exists notify_customer boolean null default false,
    add column if not exists status text null default 'internal',
    add column if not exists feedback_items jsonb null default '[]'::jsonb,
    add column if not exists approved_at timestamptz null,
    add column if not exists approved_by_auth_user_id uuid null,
    add column if not exists approval_metadata jsonb null default '{}'::jsonb,
    add column if not exists metadata jsonb null default '{}'::jsonb,
    add column if not exists updated_at timestamptz null default now();

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_customer_id_fkey'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_project_id_fkey'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_website_id_fkey'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_website_id_fkey
      foreign key (website_id) references public.websites(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_published_by_fkey'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_published_by_fkey
      foreign key (published_by) references public.profiles(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_approved_by_auth_user_id_fkey'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_approved_by_auth_user_id_fkey
      foreign key (approved_by_auth_user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_status_portal_check'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_status_portal_check
      check (
        status is null
        or status in ('internal', 'ready_for_review', 'feedback_received', 'revision_in_progress', 'approved', 'archived')
      );
  end if;

  create index if not exists website_preview_versions_customer_id_idx
    on public.website_preview_versions(customer_id);

  create index if not exists website_preview_versions_project_id_idx
    on public.website_preview_versions(project_id);

  create index if not exists website_preview_versions_website_id_idx
    on public.website_preview_versions(website_id);

  create index if not exists website_preview_versions_published_to_portal_idx
    on public.website_preview_versions(published_to_portal);

  create index if not exists website_preview_versions_published_at_idx
    on public.website_preview_versions(published_at desc);

  create index if not exists website_preview_versions_customer_portal_published_idx
    on public.website_preview_versions(customer_id, published_to_portal, published_at desc);

  create index if not exists website_preview_versions_website_version_idx
    on public.website_preview_versions(website_id, version desc);

  create index if not exists website_preview_versions_project_portal_idx
    on public.website_preview_versions(project_id, published_to_portal);
end
$migration$;


-- Canonical final-state table derived from the closed named runtime catalogs.
-- The absent RPC bodies are deliberately not reconstructed here.
create table public.lead_intake_idempotency (
  idempotency_key text primary key,
  payload_hash text not null,
  lead_id uuid,
  lead_id_snapshot uuid not null,
  duplicate boolean not null,
  match_reason text,
  merged_fields text[] not null default array[]::text[],
  business_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint lead_intake_idempotency_key_check check (idempotency_key ~ '^lead-intake:v1:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text),
  constraint lead_intake_idempotency_payload_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'::text),
  constraint lead_intake_idempotency_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete set null,
  constraint lead_intake_idempotency_business_event_id_fkey foreign key (business_event_id) references public.business_events(id) on delete restrict,
  constraint lead_intake_idempotency_result_check check (duplicate and match_reason is not null or not duplicate and match_reason is null and business_event_id is not null),
  constraint lead_intake_idempotency_retention_check check (updated_at >= created_at and expires_at = (created_at + interval '30 days'))
);


-- 08. Complete reviewed runtime index set for included tables.
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_customer_id_idx ON public.activity_logs USING btree (customer_id);
CREATE INDEX IF NOT EXISTS activity_logs_entity_idx ON public.activity_logs USING btree (entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS activity_logs_pkey ON public.activity_logs USING btree (id);
CREATE INDEX IF NOT EXISTS asset_requests_customer_idx ON public.asset_requests USING btree (customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS asset_requests_lead_idx ON public.asset_requests USING btree (lead_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS asset_requests_pkey ON public.asset_requests USING btree (id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_profile_idx ON public.audit_logs USING btree (actor_profile_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs USING btree (entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_pkey ON public.audit_logs USING btree (id);
CREATE INDEX IF NOT EXISTS business_event_consumptions_active_lease_idx ON public.business_event_consumptions USING btree (lease_expires_at) WHERE (status = ANY (ARRAY['claimed'::text, 'running'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS business_event_consumptions_event_consumer_key ON public.business_event_consumptions USING btree (business_event_id, consumer_name, consumer_version);
CREATE UNIQUE INDEX IF NOT EXISTS business_event_consumptions_pkey ON public.business_event_consumptions USING btree (id);
CREATE INDEX IF NOT EXISTS business_event_consumptions_ready_idx ON public.business_event_consumptions USING btree (status, next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'retry_waiting'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS business_event_contracts_pkey ON public.business_event_contracts USING btree (event_type, event_version);
CREATE UNIQUE INDEX IF NOT EXISTS business_event_contracts_validator_key_key ON public.business_event_contracts USING btree (validator_key);
CREATE INDEX IF NOT EXISTS business_events_causation_id_idx ON public.business_events USING btree (causation_id) WHERE (causation_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS business_events_correlation_id_idx ON public.business_events USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS business_events_customer_deduplication_key ON public.business_events USING btree (customer_id, source_module, deduplication_key) WHERE (owner_scope = 'customer'::text);
CREATE INDEX IF NOT EXISTS business_events_customer_recorded_at_idx ON public.business_events USING btree (customer_id, recorded_at DESC) WHERE (customer_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS business_events_internal_deduplication_key ON public.business_events USING btree (source_module, deduplication_key) WHERE (owner_scope = 'internal'::text);
CREATE UNIQUE INDEX IF NOT EXISTS business_events_pkey ON public.business_events USING btree (id);
CREATE INDEX IF NOT EXISTS business_events_retention_until_idx ON public.business_events USING btree (retention_until);
CREATE INDEX IF NOT EXISTS business_events_type_recorded_at_idx ON public.business_events USING btree (event_type, event_version, recorded_at DESC);
CREATE INDEX IF NOT EXISTS change_requests_auth_user_id_idx ON public.change_requests USING btree (auth_user_id);
CREATE INDEX IF NOT EXISTS change_requests_created_at_idx ON public.change_requests USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS change_requests_customer_id_idx ON public.change_requests USING btree (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS change_requests_pkey ON public.change_requests USING btree (id);
CREATE INDEX IF NOT EXISTS change_requests_status_idx ON public.change_requests USING btree (status);
CREATE INDEX IF NOT EXISTS client_portal_messages_customer_id_idx ON public.client_portal_messages USING btree (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_portal_messages_pkey ON public.client_portal_messages USING btree (id);
CREATE INDEX IF NOT EXISTS client_portal_messages_status_idx ON public.client_portal_messages USING btree (status);
CREATE INDEX IF NOT EXISTS crm_tasks_assigned_profile_idx ON public.crm_tasks USING btree (assigned_profile_id);
CREATE INDEX IF NOT EXISTS crm_tasks_customer_id_idx ON public.crm_tasks USING btree (customer_id);
CREATE INDEX IF NOT EXISTS crm_tasks_lead_id_idx ON public.crm_tasks USING btree (lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS crm_tasks_pkey ON public.crm_tasks USING btree (id);
CREATE INDEX IF NOT EXISTS crm_tasks_status_due_idx ON public.crm_tasks USING btree (status, due_date);
CREATE INDEX IF NOT EXISTS customers_auth_user_id_idx ON public.customers USING btree (auth_user_id);
CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers USING btree (lower(email));
CREATE INDEX IF NOT EXISTS customers_environment_idx ON public.customers USING btree (environment, is_demo);
CREATE UNIQUE INDEX IF NOT EXISTS customers_pkey ON public.customers USING btree (id);
CREATE INDEX IF NOT EXISTS customers_profile_id_idx ON public.customers USING btree (profile_id);
CREATE INDEX IF NOT EXISTS customers_status_idx ON public.customers USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS demo_emails_pkey ON public.demo_emails USING btree (id);
CREATE INDEX IF NOT EXISTS demo_journey_events_customer_visible_idx ON public.demo_journey_events USING btree (demo_journey_id, visible_to_customer, created_at);
CREATE INDEX IF NOT EXISTS demo_journey_events_journey_idx ON public.demo_journey_events USING btree (demo_journey_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS demo_journey_events_pkey ON public.demo_journey_events USING btree (id);
CREATE INDEX IF NOT EXISTS demo_journeys_customer_id_idx ON public.demo_journeys USING btree (customer_id);
CREATE INDEX IF NOT EXISTS demo_journeys_follow_up_at_idx ON public.demo_journeys USING btree (follow_up_at);
CREATE INDEX IF NOT EXISTS demo_journeys_lead_id_idx ON public.demo_journeys USING btree (lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS demo_journeys_pkey ON public.demo_journeys USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS demo_journeys_preview_token_unique_idx ON public.demo_journeys USING btree (preview_token) WHERE (preview_token IS NOT NULL);
CREATE INDEX IF NOT EXISTS demo_journeys_status_idx ON public.demo_journeys USING btree (demo_status);
CREATE INDEX IF NOT EXISTS email_logs_customer_created_idx ON public.email_logs USING btree (customer_id, created_at DESC) WHERE (customer_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS email_logs_idempotency_key_unique ON public.email_logs USING btree (idempotency_key);
CREATE INDEX IF NOT EXISTS email_logs_journey_created_idx ON public.email_logs USING btree (demo_journey_id, created_at DESC) WHERE (demo_journey_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS email_logs_lead_created_idx ON public.email_logs USING btree (lead_id, created_at DESC) WHERE (lead_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS email_logs_pkey ON public.email_logs USING btree (id);
CREATE INDEX IF NOT EXISTS email_logs_preview_created_idx ON public.email_logs USING btree (preview_version_id, created_at DESC) WHERE (preview_version_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS email_logs_provider_message_idx ON public.email_logs USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS email_logs_public_reference_unique ON public.email_logs USING btree (public_reference);
CREATE INDEX IF NOT EXISTS email_logs_recipient_created_idx ON public.email_logs USING btree (normalized_recipient_email, created_at DESC);
CREATE INDEX IF NOT EXISTS email_logs_status_updated_idx ON public.email_logs USING btree (status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS files_customer_checksum_unique ON public.files USING btree (customer_id, checksum) WHERE ((customer_id IS NOT NULL) AND (checksum IS NOT NULL) AND (status <> 'archived'::text));
CREATE INDEX IF NOT EXISTS files_customer_id_idx ON public.files USING btree (customer_id);
CREATE INDEX IF NOT EXISTS files_customer_review_idx ON public.files USING btree (customer_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS files_lead_checksum_unique ON public.files USING btree (lead_id, checksum) WHERE ((lead_id IS NOT NULL) AND (checksum IS NOT NULL) AND (status <> 'archived'::text));
CREATE INDEX IF NOT EXISTS files_lead_id_idx ON public.files USING btree (lead_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS files_pkey ON public.files USING btree (id);
CREATE INDEX IF NOT EXISTS files_project_id_idx ON public.files USING btree (project_id);
CREATE INDEX IF NOT EXISTS files_status_category_idx ON public.files USING btree (status, category);
CREATE INDEX IF NOT EXISTS files_storage_path_idx ON public.files USING btree (storage_path);
CREATE UNIQUE INDEX IF NOT EXISTS import_logs_pkey ON public.import_logs USING btree (id);
CREATE INDEX IF NOT EXISTS invoice_lines_invoice_id_idx ON public.invoice_lines USING btree (invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_lines_pkey ON public.invoice_lines USING btree (id);
CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON public.invoices USING btree (customer_id);
CREATE INDEX IF NOT EXISTS invoices_mollie_payment_idx ON public.invoices USING btree (mollie_payment_id);
CREATE INDEX IF NOT EXISTS invoices_number_idx ON public.invoices USING btree (invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_pkey ON public.invoices USING btree (id);
CREATE INDEX IF NOT EXISTS invoices_project_id_idx ON public.invoices USING btree (project_id);
CREATE INDEX IF NOT EXISTS invoices_status_due_idx ON public.invoices USING btree (status, due_date);
CREATE INDEX IF NOT EXISTS invoices_subscription_id_idx ON public.invoices USING btree (subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS lead_intake_idempotency_pkey ON public.lead_intake_idempotency USING btree (idempotency_key);
CREATE INDEX IF NOT EXISTS leads_assigned_user_id_idx ON public.leads USING btree (assigned_user_id);
CREATE INDEX IF NOT EXISTS leads_converted_customer_idx ON public.leads USING btree (converted_customer_id);
CREATE INDEX IF NOT EXISTS leads_external_source_id_idx ON public.leads USING btree (external_source, external_source_id) WHERE ((external_source_id IS NOT NULL) AND (external_source_id <> ''::text));
CREATE INDEX IF NOT EXISTS leads_follow_up_idx ON public.leads USING btree (follow_up_date);
CREATE INDEX IF NOT EXISTS leads_last_activity_at_idx ON public.leads USING btree (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS leads_last_call_outcome_idx ON public.leads USING btree (last_call_outcome) WHERE ((last_call_outcome IS NOT NULL) AND (last_call_outcome <> ''::text));
CREATE INDEX IF NOT EXISTS leads_last_contacted_at_idx ON public.leads USING btree (last_contacted_at DESC) WHERE (last_contacted_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS leads_lead_status_idx ON public.leads USING btree (lead_status);
CREATE INDEX IF NOT EXISTS leads_lower_email_idx ON public.leads USING btree (lower(email)) WHERE ((email IS NOT NULL) AND (btrim(email) <> ''::text));
CREATE INDEX IF NOT EXISTS leads_next_action_assigned_user_id_idx ON public.leads USING btree (next_action_assigned_user_id) WHERE (next_action_assigned_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS leads_next_action_at_idx ON public.leads USING btree (next_action_at) WHERE (next_action_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS leads_normalized_company_name_idx ON public.leads USING btree (normalized_company_name) WHERE ((normalized_company_name IS NOT NULL) AND (normalized_company_name <> ''::text));
CREATE INDEX IF NOT EXISTS leads_normalized_company_region_idx ON public.leads USING btree (normalized_company_name, lower(regexp_replace(COALESCE(region, ''::text), '[[:space:]]+'::text, ' '::text, 'g'::text))) WHERE ((normalized_company_name IS NOT NULL) AND (normalized_company_name <> ''::text));
CREATE INDEX IF NOT EXISTS leads_normalized_domain_idx ON public.leads USING btree (normalized_domain) WHERE ((normalized_domain IS NOT NULL) AND (normalized_domain <> ''::text));
CREATE INDEX IF NOT EXISTS leads_normalized_phone_idx ON public.leads USING btree (normalized_phone) WHERE ((normalized_phone IS NOT NULL) AND (normalized_phone <> ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS leads_pkey ON public.leads USING btree (id);
CREATE INDEX IF NOT EXISTS leads_rejection_reason_idx ON public.leads USING btree (rejection_reason);
CREATE INDEX IF NOT EXISTS leads_reviewed_at_idx ON public.leads USING btree (reviewed_at DESC);
CREATE INDEX IF NOT EXISTS leads_score_idx ON public.leads USING btree (lead_score);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS leads_unique_external_source_id_idx ON public.leads USING btree (external_source, external_source_id) WHERE ((external_source_id IS NOT NULL) AND (external_source_id <> ''::text));
CREATE INDEX IF NOT EXISTS profiles_auth_user_id_idx ON public.profiles USING btree (auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_key ON public.profiles USING btree (auth_user_id);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles USING btree (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_pkey ON public.profiles USING btree (id);
CREATE INDEX IF NOT EXISTS profiles_role_status_idx ON public.profiles USING btree (role, status);
CREATE INDEX IF NOT EXISTS projects_customer_id_idx ON public.projects USING btree (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS projects_pkey ON public.projects USING btree (id);
CREATE INDEX IF NOT EXISTS projects_status_deadline_idx ON public.projects USING btree (status, deadline);
CREATE INDEX IF NOT EXISTS projects_website_id_idx ON public.projects USING btree (website_id);
CREATE UNIQUE INDEX IF NOT EXISTS quote_lines_pkey ON public.quote_lines USING btree (id);
CREATE INDEX IF NOT EXISTS quote_lines_quote_id_idx ON public.quote_lines USING btree (quote_id);
CREATE INDEX IF NOT EXISTS quotes_customer_id_idx ON public.quotes USING btree (customer_id);
CREATE INDEX IF NOT EXISTS quotes_number_idx ON public.quotes USING btree (quote_number);
CREATE UNIQUE INDEX IF NOT EXISTS quotes_pkey ON public.quotes USING btree (id);
CREATE INDEX IF NOT EXISTS quotes_project_id_idx ON public.quotes USING btree (project_id);
CREATE INDEX IF NOT EXISTS quotes_status_idx ON public.quotes USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS settings_pkey ON public.settings USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS settings_workspace_key_key ON public.settings USING btree (workspace_key);
CREATE INDEX IF NOT EXISTS subscriptions_customer_id_idx ON public.subscriptions USING btree (customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_next_invoice_idx ON public.subscriptions USING btree (next_invoice_date);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_pkey ON public.subscriptions USING btree (id);
CREATE INDEX IF NOT EXISTS subscriptions_risk_idx ON public.subscriptions USING btree (subscription_risk_level);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions USING btree (status);
CREATE INDEX IF NOT EXISTS subscriptions_website_id_idx ON public.subscriptions USING btree (website_id);
CREATE INDEX IF NOT EXISTS website_build_jobs_customer_created_idx ON public.website_build_jobs USING btree (customer_id, created_at DESC) WHERE (customer_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS website_build_jobs_journey_created_idx ON public.website_build_jobs USING btree (demo_journey_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS website_build_jobs_journey_fingerprint_key ON public.website_build_jobs USING btree (demo_journey_id, request_fingerprint);
CREATE UNIQUE INDEX IF NOT EXISTS website_build_jobs_journey_idempotency_key ON public.website_build_jobs USING btree (demo_journey_id, idempotency_key);
CREATE INDEX IF NOT EXISTS website_build_jobs_lead_created_idx ON public.website_build_jobs USING btree (lead_id, created_at DESC) WHERE (lead_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS website_build_jobs_pkey ON public.website_build_jobs USING btree (id);
CREATE INDEX IF NOT EXISTS website_build_jobs_status_idx ON public.website_build_jobs USING btree (status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS website_preview_versions_build_job_key ON public.website_preview_versions USING btree (build_job_id);
CREATE INDEX IF NOT EXISTS website_preview_versions_journey_created_idx ON public.website_preview_versions USING btree (demo_journey_id, version DESC);
CREATE UNIQUE INDEX IF NOT EXISTS website_preview_versions_journey_version_key ON public.website_preview_versions USING btree (demo_journey_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS website_preview_versions_one_active_idx ON public.website_preview_versions USING btree (demo_journey_id) WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS website_preview_versions_pkey ON public.website_preview_versions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS website_preview_versions_preview_token_key ON public.website_preview_versions USING btree (preview_token);
CREATE INDEX IF NOT EXISTS websites_customer_id_idx ON public.websites USING btree (customer_id);
CREATE INDEX IF NOT EXISTS websites_domain_idx ON public.websites USING btree (lower(domain));
CREATE UNIQUE INDEX IF NOT EXISTS websites_pkey ON public.websites USING btree (id);
CREATE INDEX IF NOT EXISTS websites_status_idx ON public.websites USING btree (status);


-- 11. Exact reviewed trigger set for included runtime tables.
drop trigger if exists "business_event_consumption_write_guard" on public."business_event_consumptions";
CREATE TRIGGER business_event_consumption_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.business_event_consumptions FOR EACH ROW EXECUTE FUNCTION public.business_event_consumption_before_write();
drop trigger if exists "business_event_contract_write_guard" on public."business_event_contracts";
CREATE TRIGGER business_event_contract_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.business_event_contracts FOR EACH ROW EXECUTE FUNCTION public.business_event_contract_before_write();
drop trigger if exists "business_event_append_only_guard" on public."business_events";
CREATE TRIGGER business_event_append_only_guard BEFORE DELETE OR UPDATE ON public.business_events FOR EACH ROW EXECUTE FUNCTION public.prevent_business_event_mutation();
drop trigger if exists "business_event_insert_validator" on public."business_events";
CREATE TRIGGER business_event_insert_validator BEFORE INSERT ON public.business_events FOR EACH ROW EXECUTE FUNCTION public.business_event_before_insert();
drop trigger if exists "set_change_requests_updated_at" on public."change_requests";
CREATE TRIGGER set_change_requests_updated_at BEFORE UPDATE ON public.change_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_client_portal_messages_updated_at" on public."client_portal_messages";
CREATE TRIGGER set_client_portal_messages_updated_at BEFORE UPDATE ON public.client_portal_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_crm_tasks_updated_at" on public."crm_tasks";
CREATE TRIGGER set_crm_tasks_updated_at BEFORE UPDATE ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_customers_updated_at" on public."customers";
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_demo_emails_updated_at" on public."demo_emails";
CREATE TRIGGER set_demo_emails_updated_at BEFORE UPDATE ON public.demo_emails FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "demo_journeys_set_updated_at" on public."demo_journeys";
CREATE TRIGGER demo_journeys_set_updated_at BEFORE UPDATE ON public.demo_journeys FOR EACH ROW EXECUTE FUNCTION public.set_demo_journey_updated_at();
drop trigger if exists "email_logs_guard_snapshot" on public."email_logs";
CREATE TRIGGER email_logs_guard_snapshot BEFORE UPDATE ON public.email_logs FOR EACH ROW EXECUTE FUNCTION public.guard_email_log_snapshot();
drop trigger if exists "email_logs_set_updated_at" on public."email_logs";
CREATE TRIGGER email_logs_set_updated_at BEFORE UPDATE ON public.email_logs FOR EACH ROW EXECUTE FUNCTION public.set_email_log_updated_at();
drop trigger if exists "set_files_updated_at" on public."files";
CREATE TRIGGER set_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_invoice_lines_updated_at" on public."invoice_lines";
CREATE TRIGGER set_invoice_lines_updated_at BEFORE UPDATE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_invoices_updated_at" on public."invoices";
CREATE TRIGGER set_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_leads_updated_at" on public."leads";
CREATE TRIGGER set_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_profiles_updated_at" on public."profiles";
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_projects_updated_at" on public."projects";
CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_quote_lines_updated_at" on public."quote_lines";
CREATE TRIGGER set_quote_lines_updated_at BEFORE UPDATE ON public.quote_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_quotes_updated_at" on public."quotes";
CREATE TRIGGER set_quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_settings_updated_at" on public."settings";
CREATE TRIGGER set_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "set_subscriptions_updated_at" on public."subscriptions";
CREATE TRIGGER set_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
drop trigger if exists "website_build_jobs_set_updated_at" on public."website_build_jobs";
CREATE TRIGGER website_build_jobs_set_updated_at BEFORE UPDATE ON public.website_build_jobs FOR EACH ROW EXECUTE FUNCTION public.set_website_build_job_updated_at();
drop trigger if exists "website_preview_versions_reject_immutable_update" on public."website_preview_versions";
CREATE TRIGGER website_preview_versions_reject_immutable_update BEFORE UPDATE OF id, demo_journey_id, build_job_id, version, preview_url, preview_token, generated_package, package_checksum, created_by, created_at ON public.website_preview_versions FOR EACH ROW EXECUTE FUNCTION public.validate_website_preview_version();
drop trigger if exists "website_preview_versions_validate_build" on public."website_preview_versions";
CREATE TRIGGER website_preview_versions_validate_build BEFORE INSERT ON public.website_preview_versions FOR EACH ROW EXECUTE FUNCTION public.validate_website_preview_version();
drop trigger if exists "set_websites_updated_at" on public."websites";
CREATE TRIGGER set_websites_updated_at BEFORE UPDATE ON public.websites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 12/14. RLS and least-privilege grants. Forced RLS remains deliberately disabled.
do $$ declare t text; begin foreach t in array array['profiles','customers','leads','websites','projects','quotes','quote_lines','invoices','invoice_lines','subscriptions','files','change_requests','crm_tasks','client_portal_messages','settings','demo_emails','activity_logs','import_logs','audit_logs','business_events','business_event_contracts','business_event_consumptions','asset_requests','lead_intake_idempotency','demo_journeys','demo_journey_events','email_logs','website_build_jobs','website_preview_versions']
loop execute pg_catalog.format('alter table public.%I enable row level security', t); end loop; end $$;
revoke all privileges on all tables in schema public from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
grant select, insert, update, delete on table public.profiles, public.customers, public.leads, public.websites, public.projects, public.quotes, public.quote_lines, public.invoices, public.invoice_lines, public.subscriptions, public.files, public.change_requests, public.crm_tasks, public.client_portal_messages, public.settings, public.demo_emails, public.activity_logs, public.import_logs, public.audit_logs, public.business_events, public.business_event_contracts, public.business_event_consumptions, public.asset_requests, public.demo_journeys, public.demo_journey_events, public.email_logs, public.website_build_jobs, public.website_preview_versions to service_role;
grant usage, select, update on all sequences in schema public to service_role;
grant select on table public.profiles, public.customers, public.websites, public.projects, public.quotes, public.quote_lines, public.invoices, public.invoice_lines, public.subscriptions, public.files, public.change_requests, public.crm_tasks, public.client_portal_messages, public.settings, public.demo_emails, public.activity_logs, public.import_logs, public.audit_logs, public.asset_requests to authenticated;
grant insert on table public.change_requests, public.client_portal_messages to authenticated;
grant update on table public.customers, public.websites, public.projects, public.change_requests, public.client_portal_messages to authenticated;

revoke all privileges on all functions in schema public from public, anon, authenticated, service_role;
grant execute on function public.cancel_business_event_consumption(uuid,text) to service_role;
grant execute on function public.claim_business_event_consumption(uuid,text,integer) to service_role;
grant execute on function public.claim_demo_invitation(uuid,text,text) to service_role;
grant execute on function public.complete_demo_invitation(uuid,text,text,text,jsonb,text,text,text) to service_role;
grant execute on function public.create_business_event_consumption(uuid,text,smallint) to service_role;
grant execute on function public.current_app_role() to service_role, authenticated;
grant execute on function public.current_profile_id() to service_role, authenticated;
grant execute on function public.guard_email_log_snapshot() to service_role;
grant execute on function public.has_app_role(text[]) to service_role, authenticated;
grant execute on function public.is_admin_role() to service_role, authenticated;
grant execute on function public.is_demo_context() to service_role, authenticated;
grant execute on function public.is_demo_record(boolean,text) to service_role, authenticated;
grant execute on function public.is_staff_role() to service_role, authenticated;
grant execute on function public.mark_business_event_consumption_completed(uuid,text) to service_role;
grant execute on function public.mark_business_event_consumption_dead_letter(uuid) to service_role;
grant execute on function public.mark_business_event_consumption_failed(uuid,text,text,text) to service_role;
grant execute on function public.mark_business_event_consumption_running(uuid,text) to service_role;
grant execute on function public.mws_normalize_company_name(text) to service_role;
grant execute on function public.mws_normalize_domain(text) to service_role;
grant execute on function public.mws_normalize_phone(text) to service_role;
grant execute on function public.owns_customer(uuid) to service_role, authenticated;
grant execute on function public.plan_demo_invitation(uuid,uuid,text,integer,text,text,text,text,text,text,text,text,uuid) to service_role;
grant execute on function public.promote_website_factory_preview(uuid,text,text,text) to service_role;
grant execute on function public.record_business_event(text,uuid,text,smallint,timestamp with time zone,text,text,text,text,uuid,uuid,text,text,uuid,text,jsonb) to service_role;
grant execute on function public.recover_expired_business_event_consumption_claim(uuid) to service_role;
grant execute on function public.release_business_event_consumption_retry(uuid) to service_role;
grant execute on function public.schedule_business_event_consumption_retry(uuid,timestamp with time zone) to service_role;
grant execute on function public.set_demo_journey_updated_at() to service_role;
grant execute on function public.set_email_log_updated_at() to service_role;
grant execute on function public.set_updated_at() to service_role;


-- 13. Replace transient source policies with the reviewed target-role set.
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_catalog.pg_policies where schemaname = 'public'
  loop execute pg_catalog.format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;
create policy "activity_logs_internal_insert" on public."activity_logs" as permissive for insert to "authenticated" with check (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text, 'sales'::text, 'support'::text, 'developer'::text]));
create policy "activity_logs_internal_read" on public."activity_logs" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text, 'developer'::text]));
create policy "asset_requests_customer_read_own" on public."asset_requests" as permissive for select to "authenticated" using (customer_id IS NOT NULL AND public.owns_customer(customer_id));
create policy "audit_logs_admin_read" on public."audit_logs" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text]));
create policy "audit_logs_server_insert_placeholder" on public."audit_logs" as permissive for insert to "authenticated" with check (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text, 'developer'::text]));
create policy "business_event_consumptions_service_read" on public."business_event_consumptions" as permissive for select to "service_role" using (true);
create policy "business_event_contracts_service_read" on public."business_event_contracts" as permissive for select to "service_role" using (true);
create policy "business_events_service_read" on public."business_events" as permissive for select to "service_role" using (true);
create policy "change_requests_admin_manage" on public."change_requests" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "change_requests_customer_insert" on public."change_requests" as permissive for insert to "authenticated" with check (auth_user_id = auth.uid() AND customer_id IS NOT NULL AND public.owns_customer(customer_id) AND (website_id IS NULL OR (EXISTS ( SELECT 1
   FROM websites w
  WHERE w.id = change_requests.website_id AND w.customer_id = change_requests.customer_id))) AND (project_id IS NULL OR (EXISTS ( SELECT 1
   FROM projects p
  WHERE p.id = change_requests.project_id AND p.customer_id = change_requests.customer_id))));
create policy "change_requests_owner_read" on public."change_requests" as permissive for select to "authenticated" using (auth_user_id = auth.uid() AND (customer_id IS NULL OR public.owns_customer(customer_id)) OR auth_user_id IS NULL AND customer_id IS NOT NULL AND public.owns_customer(customer_id));
create policy "change_requests_staff_read" on public."change_requests" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['sales'::text, 'support'::text, 'developer'::text]));
create policy "change_requests_support_update" on public."change_requests" as permissive for update to "authenticated" using (public.has_app_role(ARRAY['support'::text])) with check (public.has_app_role(ARRAY['support'::text]));
create policy "client_portal_messages_admin_support_manage" on public."client_portal_messages" as permissive for all to "authenticated" using (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text, 'support'::text])) with check (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text, 'support'::text]));
create policy "client_portal_messages_owner_insert" on public."client_portal_messages" as permissive for insert to "authenticated" with check (customer_id IS NOT NULL AND public.owns_customer(customer_id) AND sender_type = 'customer'::text AND status = 'open'::text AND sender_profile_id = public.current_profile_id() AND (profile_id IS NULL OR profile_id = public.current_profile_id()));
create policy "client_portal_messages_owner_read" on public."client_portal_messages" as permissive for select to "authenticated" using (public.owns_customer(customer_id));
create policy "crm_tasks_admin_manage" on public."crm_tasks" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "crm_tasks_developer_read" on public."crm_tasks" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['developer'::text]));
create policy "crm_tasks_sales_support_manage" on public."crm_tasks" as permissive for all to "authenticated" using (public.has_app_role(ARRAY['sales'::text, 'support'::text])) with check (public.has_app_role(ARRAY['sales'::text, 'support'::text]));
create policy "customers_admin_manage" on public."customers" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "customers_demo_read" on public."customers" as permissive for select to "authenticated" using (public.is_demo_record(is_demo, environment));
create policy "customers_owner_read" on public."customers" as permissive for select to "authenticated" using (public.owns_customer(id));
create policy "customers_sales_update" on public."customers" as permissive for update to "authenticated" using (public.has_app_role(ARRAY['sales'::text])) with check (public.has_app_role(ARRAY['sales'::text]));
create policy "customers_staff_read" on public."customers" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['sales'::text, 'support'::text, 'developer'::text]));
create policy "demo_emails_demo_read" on public."demo_emails" as permissive for select to "authenticated" using (public.is_demo_record(is_demo, environment));
create policy "demo_emails_internal_manage" on public."demo_emails" as permissive for all to "authenticated" using (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text, 'sales'::text, 'developer'::text])) with check (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text, 'sales'::text, 'developer'::text]));
create policy "demo_journey_events_no_direct_client_access" on public."demo_journey_events" as permissive for all to "anon", "authenticated" using (false) with check (false);
create policy "demo_journeys_no_direct_client_access" on public."demo_journeys" as permissive for all to "anon", "authenticated" using (false) with check (false);
create policy "email_logs_no_direct_client_access" on public."email_logs" as permissive for all to "anon", "authenticated" using (false) with check (false);
create policy "files_admin_manage" on public."files" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "files_customer_read_own" on public."files" as permissive for select to "authenticated" using (customer_id IS NOT NULL AND public.owns_customer(customer_id) AND is_client_visible = true AND (EXISTS ( SELECT 1
   FROM customers customer
     LEFT JOIN profiles profile ON profile.id = customer.profile_id
  WHERE customer.id = files.customer_id AND (lower(COALESCE(customer.status, 'active'::text)) <> ALL (ARRAY['archived'::text, 'gearchiveerd'::text, 'deleted'::text, 'verwijderd'::text, 'inactive'::text, 'inactief'::text, 'niet_actief'::text, 'niet actief'::text, 'disabled'::text, 'blocked'::text, 'geblokkeerd'::text, 'revoked'::text])) AND (lower(COALESCE(customer.portal_status, 'prepared'::text)) <> ALL (ARRAY['archived'::text, 'gearchiveerd'::text, 'deleted'::text, 'verwijderd'::text, 'inactive'::text, 'inactief'::text, 'niet_actief'::text, 'niet actief'::text, 'disabled'::text, 'blocked'::text, 'geblokkeerd'::text, 'revoked'::text])) AND (customer.profile_id IS NULL OR lower(COALESCE(profile.status, 'disabled'::text)) = 'active'::text))));
create policy "files_demo_read" on public."files" as permissive for select to "authenticated" using (public.is_demo_record(is_demo, environment));
create policy "files_staff_read" on public."files" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['sales'::text, 'support'::text, 'developer'::text]));
create policy "import_logs_admin_developer_read" on public."import_logs" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text, 'developer'::text]));
create policy "invoice_lines_admin_manage" on public."invoice_lines" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "invoice_lines_owner_read" on public."invoice_lines" as permissive for select to "authenticated" using ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE i.id = invoice_lines.invoice_id AND public.owns_customer(i.customer_id))));
create policy "invoice_lines_staff_read" on public."invoice_lines" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['sales'::text, 'support'::text, 'developer'::text]));
create policy "invoices_admin_manage" on public."invoices" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "invoices_demo_read" on public."invoices" as permissive for select to "authenticated" using (public.is_demo_record(is_demo, environment));
create policy "invoices_owner_read" on public."invoices" as permissive for select to "authenticated" using (public.owns_customer(customer_id));
create policy "invoices_staff_read" on public."invoices" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['sales'::text, 'support'::text, 'developer'::text]));
create policy "leads_admin_sales_manage" on public."leads" as permissive for all to "authenticated" using (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text, 'sales'::text])) with check (public.has_app_role(ARRAY['super_admin'::text, 'admin'::text, 'sales'::text]));
create policy "leads_demo_read" on public."leads" as permissive for select to "authenticated" using (public.is_demo_record(is_demo, environment));
create policy "leads_support_developer_read" on public."leads" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['support'::text, 'developer'::text]));
create policy "profiles_admin_manage" on public."profiles" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "profiles_developer_read" on public."profiles" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['developer'::text]));
create policy "profiles_self_read" on public."profiles" as permissive for select to "authenticated" using (auth_user_id = auth.uid());
create policy "projects_admin_manage" on public."projects" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "projects_demo_read" on public."projects" as permissive for select to "authenticated" using (public.is_demo_record(is_demo, environment));
create policy "projects_owner_read" on public."projects" as permissive for select to "authenticated" using (public.owns_customer(customer_id));
create policy "projects_staff_read" on public."projects" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['sales'::text, 'support'::text, 'developer'::text]));
create policy "projects_support_update" on public."projects" as permissive for update to "authenticated" using (public.has_app_role(ARRAY['support'::text])) with check (public.has_app_role(ARRAY['support'::text]));
create policy "quote_lines_admin_sales_manage" on public."quote_lines" as permissive for all to "authenticated" using (public.is_admin_role() OR public.has_app_role(ARRAY['sales'::text])) with check (public.is_admin_role() OR public.has_app_role(ARRAY['sales'::text]));
create policy "quote_lines_owner_read" on public."quote_lines" as permissive for select to "authenticated" using ((EXISTS ( SELECT 1
   FROM quotes q
  WHERE q.id = quote_lines.quote_id AND public.owns_customer(q.customer_id))));
create policy "quote_lines_staff_read" on public."quote_lines" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['support'::text, 'developer'::text]));
create policy "quotes_admin_manage" on public."quotes" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "quotes_demo_read" on public."quotes" as permissive for select to "authenticated" using (public.is_demo_record(is_demo, environment));
create policy "quotes_owner_read" on public."quotes" as permissive for select to "authenticated" using (public.owns_customer(customer_id));
create policy "quotes_sales_manage" on public."quotes" as permissive for all to "authenticated" using (public.has_app_role(ARRAY['sales'::text])) with check (public.has_app_role(ARRAY['sales'::text]));
create policy "quotes_staff_read" on public."quotes" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['support'::text, 'developer'::text]));
create policy "settings_admin_manage" on public."settings" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "settings_developer_read" on public."settings" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['developer'::text]));
create policy "subscriptions_admin_manage" on public."subscriptions" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "subscriptions_demo_read" on public."subscriptions" as permissive for select to "authenticated" using (public.is_demo_record(is_demo, environment));
create policy "subscriptions_owner_read" on public."subscriptions" as permissive for select to "authenticated" using (public.owns_customer(customer_id));
create policy "subscriptions_staff_read" on public."subscriptions" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['sales'::text, 'support'::text, 'developer'::text]));
create policy "website_build_jobs_no_direct_client_access" on public."website_build_jobs" as permissive for all to "anon", "authenticated" using (false) with check (false);
create policy "website_preview_versions_no_direct_client_access" on public."website_preview_versions" as permissive for all to "anon", "authenticated" using (false) with check (false);
create policy "websites_admin_manage" on public."websites" as permissive for all to "authenticated" using (public.is_admin_role()) with check (public.is_admin_role());
create policy "websites_demo_read" on public."websites" as permissive for select to "authenticated" using (public.is_demo_record(is_demo, environment));
create policy "websites_developer_update" on public."websites" as permissive for update to "authenticated" using (public.has_app_role(ARRAY['developer'::text])) with check (public.has_app_role(ARRAY['developer'::text]));
create policy "websites_owner_read" on public."websites" as permissive for select to "authenticated" using (public.owns_customer(customer_id));
create policy "websites_staff_read" on public."websites" as permissive for select to "authenticated" using (public.has_app_role(ARRAY['sales'::text, 'support'::text, 'developer'::text]));


-- 15. Storage bucket configuration is declared by the folded relationship-asset source above.


-- 16. Empty-database, non-mutating validation assertions.
do $$ begin
  if (select count(*) from pg_catalog.pg_tables where schemaname = 'public' and tablename = any(array['profiles','customers','leads','websites','projects','quotes','quote_lines','invoices','invoice_lines','subscriptions','files','change_requests','crm_tasks','client_portal_messages','settings','demo_emails','activity_logs','import_logs','audit_logs','business_events','business_event_contracts','business_event_consumptions','asset_requests','lead_intake_idempotency','demo_journeys','demo_journey_events','email_logs','website_build_jobs','website_preview_versions'])) <> 29 then
    raise exception 'F0-b expected 29 included public tables';
  end if;
  if exists (select 1 from pg_catalog.pg_constraint where conname = 'files_one_relationship_check' and not convalidated) then
    raise exception 'files_one_relationship_check must be validated in an empty rebuild';
  end if;
  if exists (select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename = any(array['media_assets','asset_ingest_operations','asset_ingest_operation_events','ai_drafts','ai_assistant_drafts','client_portal_notifications','demo_preview_accesses'])) then
    raise exception 'excluded table found in F0-b baseline';
  end if;
end $$;
