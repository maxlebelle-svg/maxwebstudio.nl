-- Max Webstudio - Minimal Client Portal Production Baseline Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW PRODUCTION PREFLIGHT BEFORE EXECUTION
--
-- Purpose:
-- Create only the minimal customer portal production baseline needed for the
-- first live customer portal rollout.
--
-- Run after:
-- - 000_production_existing_tables_alignment.sql
--
-- Explicitly excluded:
-- - leads
-- - crm_tasks
-- - quotes / quote_lines
-- - invoices / invoice_lines
-- - subscriptions
-- - files
-- - ai_drafts / ai_assistant_drafts
-- - settings
-- - demo_emails
-- - activity_logs / import_logs / audit_logs
--
-- Safety rules:
-- - No deletes.
-- - No renames.
-- - No demo seed.
-- - No production Auth activation.
-- - No OpenAI/Mollie/Resend.
-- - No finance, CRM, AI or broad platform tables.

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

-- Existing production may already contain public.change_requests. The 000
-- alignment patch adds the minimum canonical columns. This block only adds the
-- remaining customer portal baseline columns where they are still missing.
alter table public.change_requests
  add column if not exists name text,
  add column if not exists company text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists category text,
  add column if not exists files jsonb default '[]'::jsonb,
  add column if not exists source text default 'website',
  add column if not exists is_demo boolean default false,
  add column if not exists environment text default 'production',
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at timestamptz;

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

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'customers',
    'websites',
    'projects',
    'change_requests',
    'client_portal_messages',
    'client_portal_notifications'
  ]
  loop
    if not exists (
      select 1
      from pg_trigger
      where tgname = format('set_%s_updated_at', target_table)
    ) then
      execute format(
        'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
        target_table,
        target_table
      );
    end if;
  end loop;
end $$;

commit;
