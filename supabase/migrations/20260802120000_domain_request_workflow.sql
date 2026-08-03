-- Domain workflow MVP: customer-owned registration, transfer and connection requests.
-- Browser clients never access these tables directly; authenticated Netlify
-- functions apply the customer/admin ownership checks.

create table if not exists public.domain_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  website_id uuid references public.websites(id) on delete set null,
  request_type text not null check (request_type in ('registration', 'transfer', 'connection')),
  domain_name text not null,
  alternative_domains text[] not null default '{}'::text[],
  status text not null default 'awaiting_customer' check (status in (
    'draft', 'awaiting_customer', 'ready_for_review', 'awaiting_approval',
    'scheduled', 'in_progress', 'technical_checks', 'active', 'needs_action',
    'failed', 'cancelled'
  )),
  customer_payload jsonb not null default '{}'::jsonb,
  internal_metadata jsonb not null default '{}'::jsonb,
  transfer_secret_ciphertext text,
  transfer_secret_received_at timestamptz,
  transfer_secret_consumed_at timestamptz,
  customer_submitted_at timestamptz,
  completed_at timestamptz,
  created_by_auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint domain_requests_domain_name_format check (
    domain_name = lower(domain_name)
    and domain_name !~ '^[a-z]+://'
    and domain_name ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  )
);

create index if not exists domain_requests_customer_updated_idx
  on public.domain_requests(customer_id, updated_at desc);
create index if not exists domain_requests_status_updated_idx
  on public.domain_requests(status, updated_at desc);
create unique index if not exists domain_requests_one_open_domain_idx
  on public.domain_requests(customer_id, domain_name)
  where status not in ('active', 'failed', 'cancelled');

create table if not exists public.domain_request_events (
  id uuid primary key default gen_random_uuid(),
  domain_request_id uuid not null references public.domain_requests(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  actor_type text not null check (actor_type in ('customer', 'admin', 'system')),
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);

create index if not exists domain_request_events_request_time_idx
  on public.domain_request_events(domain_request_id, occurred_at desc);

create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  source_request_id uuid references public.domain_requests(id) on delete set null,
  domain_name text not null,
  status text not null default 'active' check (status in ('pending', 'active', 'expired', 'transferring', 'cancelled')),
  legal_owner text,
  registrar text,
  renewal_at date,
  auto_renew boolean not null default false,
  dns_status text not null default 'unknown',
  ssl_status text not null default 'unknown',
  email_status text not null default 'unknown',
  operational_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (customer_id, domain_name)
);

create index if not exists domains_customer_status_idx
  on public.domains(customer_id, status, updated_at desc);

alter table public.domain_requests enable row level security;
alter table public.domain_request_events enable row level security;
alter table public.domains enable row level security;

revoke all on public.domain_requests from public, anon, authenticated;
revoke all on public.domain_request_events from public, anon, authenticated;
revoke all on public.domains from public, anon, authenticated;
grant all on public.domain_requests to service_role;
grant all on public.domain_request_events to service_role;
grant all on public.domains to service_role;

comment on column public.domain_requests.transfer_secret_ciphertext is
  'AES-256-GCM envelope encrypted by the server; never returned by ordinary reads.';
comment on table public.domain_request_events is
  'Append-only application audit trail; safe_metadata must never contain transfer codes or credentials.';
