-- Project Workspaces
-- Purpose: central CRM/cloud workspace metadata for demo journeys and generated previews.

create extension if not exists pgcrypto;

create table if not exists public.project_workspaces (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null,
  customer_id uuid null,
  demo_journey_id uuid null references public.demo_journeys(id) on delete cascade,
  business_name text,
  website_url text,
  workspace_slug text not null,
  workspace_title text,
  storage_provider text not null default 'internal',
  storage_path text,
  drive_folder_url text null,
  latest_zip_filename text null,
  latest_preview_url text null,
  latest_preview_version integer null,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_workspaces_latest_preview_version_check check (latest_preview_version is null or latest_preview_version > 0)
);

create unique index if not exists project_workspaces_demo_journey_unique_idx
on public.project_workspaces(demo_journey_id)
where demo_journey_id is not null;

create unique index if not exists project_workspaces_workspace_slug_unique_idx
on public.project_workspaces(workspace_slug);

create index if not exists project_workspaces_lead_idx on public.project_workspaces(lead_id);
create index if not exists project_workspaces_customer_idx on public.project_workspaces(customer_id);
create index if not exists project_workspaces_storage_provider_idx on public.project_workspaces(storage_provider);

create or replace function public.set_project_workspaces_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_workspaces_set_updated_at on public.project_workspaces;
create trigger project_workspaces_set_updated_at
before update on public.project_workspaces
for each row
execute function public.set_project_workspaces_updated_at();

alter table public.project_workspaces enable row level security;

grant select, insert, update on public.project_workspaces to service_role;

drop policy if exists "project_workspaces_no_direct_anon_access" on public.project_workspaces;
create policy "project_workspaces_no_direct_anon_access"
on public.project_workspaces
for all
to anon, authenticated
using (false)
with check (false);
