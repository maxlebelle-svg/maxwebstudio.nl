-- Max Webstudio - Supabase Schema Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION
-- Source docs:
-- - docs/SUPABASE_CANONICAL_SCHEMA.md
-- - docs/SUPABASE_PRODUCTION_READINESS_PLAN.md
-- - docs/SUPABASE_RLS_POLICY_PLAN.md

begin;

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

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_subscription_id_fkey') then
    alter table public.invoices
      add constraint invoices_subscription_id_fkey
      foreign key (subscription_id) references public.subscriptions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quotes_converted_to_invoice_id_fkey') then
    alter table public.quotes
      add constraint quotes_converted_to_invoice_id_fkey
      foreign key (converted_to_invoice_id) references public.invoices(id) on delete set null;
  end if;
end $$;

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

create table if not exists public.client_portal_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  type text,
  title text,
  message text,
  entity_type text,
  entity_id uuid,
  status text not null default 'unread',
  read_at timestamptz,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_portal_notifications_status_check check (status in ('unread', 'read', 'archived')),
  constraint client_portal_notifications_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  draft_type text,
  status text not null default 'draft',
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  provider text default 'local_template_mock',
  reviewed_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_drafts_status_check check (status in ('draft', 'generated', 'reviewed', 'approved', 'archived')),
  constraint ai_drafts_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.ai_assistant_drafts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  entity_type text,
  entity_id uuid,
  action_type text,
  status text not null default 'draft',
  input_summary text,
  output text,
  provider text default 'local_template_mock',
  reviewed_by uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  sent_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_assistant_drafts_status_check check (status in ('draft', 'generated', 'reviewed', 'sent', 'archived')),
  constraint ai_assistant_drafts_environment_check check (environment in ('production', 'test', 'demo'))
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

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'customers', 'leads', 'websites', 'projects', 'quotes', 'quote_lines',
    'invoices', 'invoice_lines', 'subscriptions', 'files', 'change_requests', 'crm_tasks',
    'client_portal_messages', 'client_portal_notifications', 'ai_drafts', 'ai_assistant_drafts',
    'settings', 'demo_emails'
  ]
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = format('set_%s_updated_at', table_name)
    ) then
      execute format(
        'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
        table_name,
        table_name
      );
    end if;
  end loop;
end $$;

commit;
