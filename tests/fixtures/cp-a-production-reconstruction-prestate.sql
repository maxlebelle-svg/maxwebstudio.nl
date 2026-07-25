create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table auth.users (id uuid primary key);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id),
  name text,
  role text default 'customer',
  status text default 'active'
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  auth_user_id uuid references auth.users(id),
  name text,
  company text,
  metadata jsonb default '{}'::jsonb
);

create table public.websites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  name text,
  status text,
  archived_at timestamptz
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  website_id uuid references public.websites(id),
  name text,
  status text,
  metadata jsonb default '{}'::jsonb,
  archived_at timestamptz,
  updated_at timestamptz default now()
);

create function public.owns_customer(input_customer_id uuid)
returns boolean language sql stable
set search_path = pg_catalog, public
as $$ select input_customer_id is not null $$;

create table public.demo_journeys (
  id uuid primary key,
  customer_id uuid,
  business_name text
);

create table public.website_build_jobs (
  id uuid primary key,
  demo_journey_id uuid,
  customer_id uuid,
  status text,
  package_type text,
  generator_version text,
  request_fingerprint text,
  idempotency_key text,
  generated_package jsonb,
  package_checksum text,
  created_by text,
  updated_by text
);

-- Production-like preview relation: portal-review fields and quality_report exist,
-- while package_checksum is intentionally absent before reconstruction.
create table public.website_preview_versions (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid,
  build_job_id uuid,
  version integer not null default 1,
  preview_url text,
  preview_token text,
  preview_score numeric,
  quality_report jsonb,
  generated_package jsonb,
  is_active boolean not null default false,
  created_by text,
  created_at timestamptz default now(),
  customer_id uuid null,
  project_id uuid null,
  website_id uuid null,
  title text null default 'Website-preview',
  customer_summary text null,
  change_summary text null,
  safe_preview_path text null,
  published_to_portal boolean null default false,
  published_at timestamptz null,
  published_by uuid null,
  review_deadline timestamptz null,
  allow_feedback boolean null default true,
  allow_approval boolean null default true,
  notify_customer boolean null default false,
  status text null default 'internal',
  feedback_items jsonb null default '[]'::jsonb,
  approved_at timestamptz null,
  approved_by_auth_user_id uuid null,
  approval_metadata jsonb null default '{}'::jsonb,
  metadata jsonb null default '{}'::jsonb,
  updated_at timestamptz null default now()
);

alter table public.website_preview_versions enable row level security;
create policy website_preview_versions_no_direct_client_access
  on public.website_preview_versions for all to authenticated using (false) with check (false);

insert into public.website_preview_versions(id, version, generated_package, is_active, created_by)
values
  ('01000000-0000-4000-8000-000000000001', 1, '{"files":[]}', false, 'legacy'),
  ('01000000-0000-4000-8000-000000000002', 2, '{"files":[]}', false, 'legacy');

create table public.customer_invoices (
  id uuid primary key,
  status text,
  amount numeric(12,2)
);

insert into public.customer_invoices(id, status, amount) values
  ('02000000-0000-4000-8000-000000000001', 'paid', 598.95),
  ('02000000-0000-4000-8000-000000000002', 'paid', 1360.04),
  ('02000000-0000-4000-8000-000000000003', 'paid', 181.50);
