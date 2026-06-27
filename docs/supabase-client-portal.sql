-- Supabase schema for Max Web Studio Client Portal.
-- Run this in the Supabase SQL Editor after the base change_requests schema.

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  website text,
  package text,
  status text not null default 'actief',
  customer_since timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists status text not null default 'actief',
  add column if not exists customer_since timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

create table if not exists public.admin_customer_notes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_websites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  customer_auth_user_id uuid references auth.users(id) on delete set null,
  name text,
  domain text,
  live_url text,
  staging_url text,
  netlify_project_name text,
  netlify_site_id text,
  github_repo_url text,
  github_branch text default 'main',
  status text default 'live',
  ssl_status text default 'unknown',
  hosting_status text default 'active',
  last_deploy_at timestamptz,
  last_checked_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.change_requests
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists profiles_auth_user_id_idx
  on public.profiles (auth_user_id);

create index if not exists profiles_email_idx
  on public.profiles (lower(email));

create index if not exists profiles_status_idx
  on public.profiles (status);

create index if not exists profiles_customer_since_idx
  on public.profiles (customer_since);

create index if not exists profiles_archived_at_idx
  on public.profiles (archived_at);

create index if not exists change_requests_auth_user_id_created_at_idx
  on public.change_requests (auth_user_id, created_at desc);

create index if not exists customer_websites_profile_id_idx
  on public.customer_websites (profile_id);

create index if not exists customer_websites_customer_auth_user_id_idx
  on public.customer_websites (customer_auth_user_id);

create index if not exists customer_websites_status_idx
  on public.customer_websites (status);

create index if not exists customer_websites_hosting_status_idx
  on public.customer_websites (hosting_status);

create index if not exists customer_websites_ssl_status_idx
  on public.customer_websites (ssl_status);

alter table public.profiles enable row level security;
alter table public.change_requests enable row level security;
alter table public.admin_customer_notes enable row level security;
alter table public.customer_websites enable row level security;

-- No client policies are created for admin_customer_notes.
-- This table is admin-only and should only be read/written through server-side
-- Netlify Functions with SUPABASE_SERVICE_ROLE_KEY.

drop policy if exists "Clients can read own profile" on public.profiles;
create policy "Clients can read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "Clients can update own profile" on public.profiles;
create policy "Clients can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

drop policy if exists "Clients can read own change requests" on public.change_requests;
create policy "Clients can read own change requests"
  on public.change_requests
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "Clients can read own websites" on public.customer_websites;
create policy "Clients can read own websites"
  on public.customer_websites
  for select
  to authenticated
  using (auth.uid() = customer_auth_user_id);

-- Admin and Netlify Functions continue to use SUPABASE_SERVICE_ROLE_KEY.
-- The service role bypasses RLS and should never be exposed to frontend code.
