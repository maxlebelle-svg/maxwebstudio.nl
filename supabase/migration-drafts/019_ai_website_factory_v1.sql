-- AI Website Factory v1
-- Purpose: build queue, quality history, generated packages, and preview versioning.

create extension if not exists pgcrypto;

create table if not exists public.website_build_jobs (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid not null references public.demo_journeys(id) on delete cascade,
  lead_id uuid null,
  customer_id uuid null,
  status text not null default 'queued',
  current_step text null,
  progress integer not null default 0,
  preview_version integer not null default 1,
  preview_url text null,
  preview_token text null,
  preview_score integer null,
  quality_report jsonb null,
  generated_package jsonb null,
  build_logs jsonb null,
  error_message text null,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_build_jobs_status_check check (
    status in (
      'queued',
      'briefing',
      'building',
      'quality_check',
      'deploying',
      'completed',
      'quality_failed',
      'retryable',
      'failed'
    )
  ),
  constraint website_build_jobs_progress_check check (progress >= 0 and progress <= 100),
  constraint website_build_jobs_preview_score_check check (preview_score is null or (preview_score >= 0 and preview_score <= 100))
);

create table if not exists public.website_preview_versions (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid not null references public.demo_journeys(id) on delete cascade,
  build_job_id uuid null references public.website_build_jobs(id) on delete set null,
  version integer not null,
  preview_url text,
  preview_token text,
  preview_score integer null,
  quality_report jsonb null,
  generated_package jsonb null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text null,
  constraint website_preview_versions_score_check check (preview_score is null or (preview_score >= 0 and preview_score <= 100)),
  constraint website_preview_versions_unique_version unique (demo_journey_id, version)
);

create index if not exists website_build_jobs_demo_journey_idx on public.website_build_jobs(demo_journey_id, created_at desc);
create index if not exists website_build_jobs_lead_idx on public.website_build_jobs(lead_id, created_at desc);
create index if not exists website_build_jobs_status_idx on public.website_build_jobs(status);
create index if not exists website_build_jobs_current_step_idx on public.website_build_jobs(current_step);
create index if not exists website_build_jobs_preview_token_idx on public.website_build_jobs(preview_token);
create index if not exists website_preview_versions_demo_journey_idx on public.website_preview_versions(demo_journey_id, version desc);
create index if not exists website_preview_versions_active_idx on public.website_preview_versions(demo_journey_id, is_active) where is_active = true;
create index if not exists website_preview_versions_preview_token_idx on public.website_preview_versions(preview_token);

create or replace function public.set_website_factory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists website_build_jobs_set_updated_at on public.website_build_jobs;
create trigger website_build_jobs_set_updated_at
before update on public.website_build_jobs
for each row
execute function public.set_website_factory_updated_at();

alter table public.website_build_jobs enable row level security;
alter table public.website_preview_versions enable row level security;

grant select, insert, update on public.website_build_jobs to service_role;
grant select, insert, update on public.website_preview_versions to service_role;

drop policy if exists "website_build_jobs_no_direct_anon_access" on public.website_build_jobs;
create policy "website_build_jobs_no_direct_anon_access"
on public.website_build_jobs
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "website_preview_versions_no_direct_anon_access" on public.website_preview_versions;
create policy "website_preview_versions_no_direct_anon_access"
on public.website_preview_versions
for all
to anon, authenticated
using (false)
with check (false);
