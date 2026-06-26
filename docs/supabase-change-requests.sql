-- Supabase schema for Max Web Studio change requests.
-- Run this in the Supabase SQL Editor for the project connected to Netlify.

create extension if not exists pgcrypto;

create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  company_name text not null,
  email text not null,
  phone text not null,
  website text not null,
  care_plan text not null,
  change_category text not null,
  priority text not null,
  title text not null,
  description text not null,
  file_names jsonb not null default '[]'::jsonb,
  internal_classification text not null,
  status text not null default 'nieuw',
  source text not null default 'website',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists change_requests_created_at_idx
  on public.change_requests (created_at desc);

create index if not exists change_requests_status_idx
  on public.change_requests (status);

create index if not exists change_requests_email_idx
  on public.change_requests (email);

alter table public.change_requests enable row level security;

-- No public policies are added here.
-- Netlify Functions should insert using SUPABASE_SERVICE_ROLE_KEY only.

-- Storage bucket for uploaded change request files.
-- This bucket may stay private. Files are uploaded and opened only through Netlify Functions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'change-request-files',
  'change-request-files',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No public storage policies are needed.
-- Server-side access uses SUPABASE_SERVICE_ROLE_KEY from Netlify Functions.
