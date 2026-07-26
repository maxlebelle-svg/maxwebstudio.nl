\set ON_ERROR_STOP on

create table public.leads (
  id uuid primary key default extensions.gen_random_uuid(),
  status text not null default 'new',
  call_status text,
  company text,
  website_url text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
