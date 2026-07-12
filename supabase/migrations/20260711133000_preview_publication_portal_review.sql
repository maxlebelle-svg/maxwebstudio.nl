-- Additive portal review fields for the optional Website Factory preview table.
-- The base table belongs to migration-drafts/019_ai_website_factory_v1.sql and may
-- not exist in environments where that feature has not been promoted yet.
-- Existing timeline flows keep using timelineService and remain outside this migration.

do $migration$
begin
  if to_regclass('public.website_preview_versions') is null then
    raise notice 'Skipping preview publication portal review: public.website_preview_versions does not exist';
    return;
  end if;

  alter table public.website_preview_versions
    add column if not exists customer_id uuid null,
    add column if not exists project_id uuid null,
    add column if not exists website_id uuid null,
    add column if not exists title text null default 'Website-preview',
    add column if not exists customer_summary text null,
    add column if not exists change_summary text null,
    add column if not exists safe_preview_path text null,
    add column if not exists published_to_portal boolean null default false,
    add column if not exists published_at timestamptz null,
    add column if not exists published_by uuid null,
    add column if not exists review_deadline timestamptz null,
    add column if not exists allow_feedback boolean null default true,
    add column if not exists allow_approval boolean null default true,
    add column if not exists notify_customer boolean null default false,
    add column if not exists status text null default 'internal',
    add column if not exists feedback_items jsonb null default '[]'::jsonb,
    add column if not exists approved_at timestamptz null,
    add column if not exists approved_by_auth_user_id uuid null,
    add column if not exists approval_metadata jsonb null default '{}'::jsonb,
    add column if not exists metadata jsonb null default '{}'::jsonb,
    add column if not exists updated_at timestamptz null default now();

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_customer_id_fkey'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_project_id_fkey'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_website_id_fkey'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_website_id_fkey
      foreign key (website_id) references public.websites(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_published_by_fkey'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_published_by_fkey
      foreign key (published_by) references public.profiles(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_approved_by_auth_user_id_fkey'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_approved_by_auth_user_id_fkey
      foreign key (approved_by_auth_user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'website_preview_versions_status_portal_check'
      and conrelid = 'public.website_preview_versions'::regclass
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_status_portal_check
      check (
        status is null
        or status in ('internal', 'ready_for_review', 'feedback_received', 'revision_in_progress', 'approved', 'archived')
      );
  end if;

  create index if not exists website_preview_versions_customer_id_idx
    on public.website_preview_versions(customer_id);

  create index if not exists website_preview_versions_project_id_idx
    on public.website_preview_versions(project_id);

  create index if not exists website_preview_versions_website_id_idx
    on public.website_preview_versions(website_id);

  create index if not exists website_preview_versions_published_to_portal_idx
    on public.website_preview_versions(published_to_portal);

  create index if not exists website_preview_versions_published_at_idx
    on public.website_preview_versions(published_at desc);

  create index if not exists website_preview_versions_customer_portal_published_idx
    on public.website_preview_versions(customer_id, published_to_portal, published_at desc);

  create index if not exists website_preview_versions_website_version_idx
    on public.website_preview_versions(website_id, version desc);

  create index if not exists website_preview_versions_project_portal_idx
    on public.website_preview_versions(project_id, published_to_portal);
end
$migration$;
