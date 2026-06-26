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

alter table public.profiles enable row level security;
alter table public.change_requests enable row level security;
alter table public.admin_customer_notes enable row level security;

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

-- Admin and Netlify Functions continue to use SUPABASE_SERVICE_ROLE_KEY.
-- The service role bypasses RLS and should never be exposed to frontend code.
