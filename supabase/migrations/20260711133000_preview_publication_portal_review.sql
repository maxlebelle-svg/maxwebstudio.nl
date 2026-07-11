create extension if not exists pgcrypto;

create table if not exists public.website_preview_versions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid null references public.customers(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  website_id uuid null references public.websites(id) on delete set null,
  demo_journey_id uuid null,
  build_job_id uuid null,
  version integer not null default 1 check (version > 0),
  title text not null default 'Website-preview',
  customer_summary text null,
  change_summary text null,
  preview_url text null,
  safe_preview_path text null,
  preview_token text null,
  preview_score integer null check (preview_score is null or (preview_score >= 0 and preview_score <= 100)),
  quality_report jsonb null,
  generated_package jsonb null,
  is_active boolean not null default true,
  published_to_portal boolean not null default false,
  published_at timestamptz null,
  published_by uuid null,
  review_deadline timestamptz null,
  allow_feedback boolean not null default true,
  allow_approval boolean not null default true,
  notify_customer boolean not null default false,
  status text not null default 'internal'
    check (status in ('internal', 'ready_for_review', 'feedback_received', 'revision_in_progress', 'approved', 'archived')),
  feedback_items jsonb not null default '[]'::jsonb,
  approved_at timestamptz null,
  approved_by_auth_user_id uuid null,
  approval_metadata jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by text null,
  updated_at timestamptz not null default now(),
  unique (website_id, version)
);

alter table public.website_preview_versions
  add column if not exists customer_id uuid references public.customers(id) on delete cascade,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists website_id uuid references public.websites(id) on delete set null,
  add column if not exists demo_journey_id uuid null,
  add column if not exists build_job_id uuid null,
  add column if not exists version integer not null default 1,
  add column if not exists title text not null default 'Website-preview',
  add column if not exists customer_summary text null,
  add column if not exists change_summary text null,
  add column if not exists preview_url text null,
  add column if not exists safe_preview_path text null,
  add column if not exists preview_token text null,
  add column if not exists preview_score integer null,
  add column if not exists quality_report jsonb null,
  add column if not exists generated_package jsonb null,
  add column if not exists is_active boolean not null default true,
  add column if not exists published_to_portal boolean not null default false,
  add column if not exists published_at timestamptz null,
  add column if not exists published_by uuid null,
  add column if not exists review_deadline timestamptz null,
  add column if not exists allow_feedback boolean not null default true,
  add column if not exists allow_approval boolean not null default true,
  add column if not exists notify_customer boolean not null default false,
  add column if not exists status text not null default 'internal',
  add column if not exists feedback_items jsonb not null default '[]'::jsonb,
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_by_auth_user_id uuid null,
  add column if not exists approval_metadata jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by text null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists website_preview_versions_customer_visible_idx
  on public.website_preview_versions(customer_id, published_to_portal, published_at desc)
  where published_to_portal = true;
create index if not exists website_preview_versions_website_version_idx
  on public.website_preview_versions(website_id, version desc);
create index if not exists website_preview_versions_project_idx
  on public.website_preview_versions(project_id, version desc);

create table if not exists public.customer_timeline_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid null references public.customers(id) on delete cascade,
  lead_id uuid null,
  user_id uuid null,
  event_type text not null,
  severity text not null default 'info',
  title text not null,
  description text null,
  module text not null,
  reference_type text null,
  reference_id uuid null,
  actor_name text null,
  actor_role text null,
  icon text null,
  is_global boolean not null default false,
  invoice_id uuid null,
  email_log_id uuid null,
  related_type text null,
  related_id uuid null,
  is_read boolean not null default false,
  read_at timestamptz null,
  archived_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_timeline_events_customer_idx
  on public.customer_timeline_events(customer_id, created_at desc);
create index if not exists customer_timeline_events_dedupe_idx
  on public.customer_timeline_events((metadata->>'dedupeKey'))
  where metadata ? 'dedupeKey';

alter table public.website_preview_versions enable row level security;
alter table public.customer_timeline_events enable row level security;

grant select, insert, update on public.website_preview_versions to service_role;
grant select, insert, update on public.customer_timeline_events to service_role;

drop policy if exists "website_preview_versions_no_direct_client_access" on public.website_preview_versions;
create policy "website_preview_versions_no_direct_client_access"
on public.website_preview_versions
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "customer_timeline_events_no_direct_client_access" on public.customer_timeline_events;
create policy "customer_timeline_events_no_direct_client_access"
on public.customer_timeline_events
for all
to anon, authenticated
using (false)
with check (false);
