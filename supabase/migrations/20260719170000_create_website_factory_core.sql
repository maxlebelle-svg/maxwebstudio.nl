-- RC1.5A: minimal, idempotent Website Factory storage and atomic preview promotion.

begin;

create table public.website_build_jobs (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid not null,
  lead_id uuid null,
  customer_id uuid null,
  status text not null default 'queued',
  package_type text not null,
  generator_version text not null,
  request_fingerprint text not null,
  idempotency_key text not null,
  generated_package jsonb null,
  package_checksum text null,
  error_phase text null,
  error_code text null,
  error_message text null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_build_jobs_demo_journey_id_fkey
    foreign key (demo_journey_id) references public.demo_journeys(id) on delete cascade,
  constraint website_build_jobs_lead_id_fkey
    foreign key (lead_id) references public.leads(id) on delete set null,
  constraint website_build_jobs_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete set null,
  constraint website_build_jobs_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  constraint website_build_jobs_package_type_check
    check (nullif(btrim(package_type), '') is not null),
  constraint website_build_jobs_generator_version_check
    check (nullif(btrim(generator_version), '') is not null),
  constraint website_build_jobs_request_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint website_build_jobs_idempotency_key_check
    check (nullif(btrim(idempotency_key), '') is not null),
  constraint website_build_jobs_succeeded_package_check
    check (
      status <> 'succeeded'
      or (
        generated_package is not null
        and jsonb_typeof(generated_package) = 'object'
        and generated_package <> '{}'::jsonb
        and package_checksum ~ '^[0-9a-f]{64}$'
      )
    ),
  constraint website_build_jobs_journey_fingerprint_key
    unique (demo_journey_id, request_fingerprint),
  constraint website_build_jobs_journey_idempotency_key
    unique (demo_journey_id, idempotency_key)
);

create table public.website_preview_versions (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid not null,
  build_job_id uuid not null,
  version integer not null,
  preview_url text not null,
  preview_token text not null,
  generated_package jsonb not null,
  package_checksum text not null,
  is_active boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint website_preview_versions_demo_journey_id_fkey
    foreign key (demo_journey_id) references public.demo_journeys(id) on delete cascade,
  constraint website_preview_versions_build_job_id_fkey
    foreign key (build_job_id) references public.website_build_jobs(id) on delete restrict,
  constraint website_preview_versions_version_check
    check (version > 0),
  constraint website_preview_versions_preview_url_check
    check (nullif(btrim(preview_url), '') is not null),
  constraint website_preview_versions_preview_token_check
    check (nullif(btrim(preview_token), '') is not null),
  constraint website_preview_versions_package_check
    check (jsonb_typeof(generated_package) = 'object' and generated_package <> '{}'::jsonb),
  constraint website_preview_versions_package_checksum_check
    check (package_checksum ~ '^[0-9a-f]{64}$'),
  constraint website_preview_versions_journey_version_key
    unique (demo_journey_id, version),
  constraint website_preview_versions_build_job_key
    unique (build_job_id),
  constraint website_preview_versions_preview_token_key
    unique (preview_token)
);

create index website_build_jobs_journey_created_idx
  on public.website_build_jobs (demo_journey_id, created_at desc);
create index website_build_jobs_lead_created_idx
  on public.website_build_jobs (lead_id, created_at desc)
  where lead_id is not null;
create index website_build_jobs_customer_created_idx
  on public.website_build_jobs (customer_id, created_at desc)
  where customer_id is not null;
create index website_build_jobs_status_idx
  on public.website_build_jobs (status, updated_at);
create index website_preview_versions_journey_created_idx
  on public.website_preview_versions (demo_journey_id, version desc);
create unique index website_preview_versions_one_active_idx
  on public.website_preview_versions (demo_journey_id)
  where is_active;

create function public.set_website_build_job_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create trigger website_build_jobs_set_updated_at
before update on public.website_build_jobs
for each row
execute function public.set_website_build_job_updated_at();

create function public.validate_website_preview_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  build_record public.website_build_jobs%rowtype;
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'is_active') <> (to_jsonb(old) - 'is_active') then
    raise exception 'website preview versions are immutable'
      using errcode = '55000';
  end if;

  select * into build_record
  from public.website_build_jobs
  where id = new.build_job_id;

  if not found
     or build_record.status <> 'succeeded'
     or build_record.demo_journey_id <> new.demo_journey_id
     or build_record.generated_package is distinct from new.generated_package
     or build_record.package_checksum is distinct from new.package_checksum then
    raise exception 'preview version must exactly match a succeeded build'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create trigger website_preview_versions_validate_and_immutable
before insert or update on public.website_preview_versions
for each row
execute function public.validate_website_preview_version();

create function public.promote_website_factory_preview(
  p_build_job_id uuid,
  p_preview_url text,
  p_preview_token text,
  p_created_by text
)
returns table (
  preview_version_id uuid,
  demo_journey_id uuid,
  build_job_id uuid,
  version integer,
  preview_url text,
  preview_token text,
  generated_package jsonb,
  package_checksum text,
  is_active boolean,
  created_at timestamptz,
  created_by text,
  created boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  build_record public.website_build_jobs%rowtype;
  journey_record public.demo_journeys%rowtype;
  preview_record public.website_preview_versions%rowtype;
  next_version integer;
  merged_package jsonb;
begin
  if nullif(pg_catalog.btrim(p_preview_url), '') is null
     or nullif(pg_catalog.btrim(p_preview_token), '') is null
     or nullif(pg_catalog.btrim(p_created_by), '') is null then
    raise exception 'preview promotion parameters are incomplete'
      using errcode = '22023';
  end if;

  select * into build_record
  from public.website_build_jobs
  where id = p_build_job_id
  for update;

  if not found then
    raise exception 'website build job not found' using errcode = 'P0002';
  end if;
  if build_record.status <> 'succeeded'
     or build_record.generated_package is null
     or build_record.generated_package = '{}'::jsonb
     or build_record.package_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'website build job is not promotable' using errcode = '23514';
  end if;

  select * into journey_record
  from public.demo_journeys
  where id = build_record.demo_journey_id
  for update;

  if not found then
    raise exception 'demo journey for website build job not found' using errcode = 'P0002';
  end if;

  select * into preview_record
  from public.website_preview_versions
  where website_preview_versions.build_job_id = build_record.id;

  if found then
    return query select
      preview_record.id, preview_record.demo_journey_id, preview_record.build_job_id,
      preview_record.version, preview_record.preview_url, preview_record.preview_token,
      preview_record.generated_package, preview_record.package_checksum,
      preview_record.is_active, preview_record.created_at, preview_record.created_by, false;
    return;
  end if;

  select coalesce(max(website_preview_versions.version), 0) + 1
  into next_version
  from public.website_preview_versions
  where website_preview_versions.demo_journey_id = build_record.demo_journey_id;

  insert into public.website_preview_versions (
    demo_journey_id, build_job_id, version, preview_url, preview_token,
    generated_package, package_checksum, is_active, created_by
  ) values (
    build_record.demo_journey_id, build_record.id, next_version,
    pg_catalog.btrim(p_preview_url), pg_catalog.btrim(p_preview_token),
    build_record.generated_package, build_record.package_checksum, false,
    pg_catalog.btrim(p_created_by)
  ) returning * into preview_record;

  update public.website_preview_versions
  set is_active = false
  where website_preview_versions.demo_journey_id = build_record.demo_journey_id
    and website_preview_versions.id <> preview_record.id
    and website_preview_versions.is_active;

  update public.website_preview_versions
  set is_active = true
  where website_preview_versions.id = preview_record.id
  returning * into preview_record;

  merged_package := build_record.generated_package
    || case when journey_record.preview_package ? 'manualPreview'
      then pg_catalog.jsonb_build_object('manualPreview', journey_record.preview_package -> 'manualPreview') else '{}'::jsonb end
    || case when journey_record.preview_package ? 'savedDemoSite'
      then pg_catalog.jsonb_build_object('savedDemoSite', journey_record.preview_package -> 'savedDemoSite') else '{}'::jsonb end
    || case when journey_record.preview_package ? 'linkedRecords'
      then pg_catalog.jsonb_build_object('linkedRecords', journey_record.preview_package -> 'linkedRecords') else '{}'::jsonb end
    || case when journey_record.preview_package ? 'activePreviewSource'
      then pg_catalog.jsonb_build_object('activePreviewSource', journey_record.preview_package -> 'activePreviewSource') else '{}'::jsonb end;

  update public.demo_journeys
  set preview_url = preview_record.preview_url,
      preview_token = preview_record.preview_token,
      preview_package = merged_package,
      preview_generated_at = pg_catalog.clock_timestamp(),
      demo_status = 'interne_preview_klaar',
      updated_by = pg_catalog.btrim(p_created_by)
  where id = build_record.demo_journey_id;

  return query select
    preview_record.id, preview_record.demo_journey_id, preview_record.build_job_id,
    preview_record.version, preview_record.preview_url, preview_record.preview_token,
    preview_record.generated_package, preview_record.package_checksum,
    preview_record.is_active, preview_record.created_at, preview_record.created_by, true;
end;
$function$;

alter table public.website_build_jobs enable row level security;
alter table public.website_preview_versions enable row level security;

revoke all privileges on table public.website_build_jobs
  from public, anon, authenticated, service_role;
revoke all privileges on table public.website_preview_versions
  from public, anon, authenticated, service_role;
revoke all privileges on function public.set_website_build_job_updated_at()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.validate_website_preview_version()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.promote_website_factory_preview(uuid, text, text, text)
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.website_build_jobs
  to service_role;
grant select on table public.website_preview_versions
  to service_role;
grant execute on function public.promote_website_factory_preview(uuid, text, text, text)
  to service_role;

create policy website_build_jobs_no_direct_client_access
on public.website_build_jobs
for all
to anon, authenticated
using (false)
with check (false);

create policy website_preview_versions_no_direct_client_access
on public.website_preview_versions
for all
to anon, authenticated
using (false)
with check (false);

commit;
