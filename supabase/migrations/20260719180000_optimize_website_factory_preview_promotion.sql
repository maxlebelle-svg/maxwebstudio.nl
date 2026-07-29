-- RC1.5D: keep atomic preview promotion below the API statement timeout for large packages.

begin;

do $migration_guard$
declare
  promotion_definition_md5 text;
  validation_definition_md5 text;
  validation_trigger_md5 text;
begin
  select pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
  into promotion_definition_md5
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.oid = 'public.promote_website_factory_preview(uuid,text,text,text)'::pg_catalog.regprocedure;

  select pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
  into validation_definition_md5
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.oid = 'public.validate_website_preview_version()'::pg_catalog.regprocedure;

  select pg_catalog.md5(pg_catalog.pg_get_triggerdef(t.oid, true))
  into validation_trigger_md5
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'website_preview_versions'
    and t.tgname = 'website_preview_versions_validate_and_immutable'
    and not t.tgisinternal;

  if promotion_definition_md5 is distinct from 'faa14563e803c069ef873edf00dcac08' then
    raise exception 'unexpected promote_website_factory_preview definition: %', promotion_definition_md5
      using errcode = '55000';
  end if;
  if validation_definition_md5 is distinct from 'bf64b4d0c635faa6fc6dae1a1dfe7c5d' then
    raise exception 'unexpected validate_website_preview_version definition: %', validation_definition_md5
      using errcode = '55000';
  end if;
  if validation_trigger_md5 is distinct from 'd581c570b3a01e86ce1a615a78f002f4' then
    raise exception 'unexpected website preview validation trigger definition: %', validation_trigger_md5
      using errcode = '55000';
  end if;
end;
$migration_guard$;

create or replace function public.validate_website_preview_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  build_record record;
begin
  if tg_op = 'UPDATE' then
    raise exception 'website preview versions are immutable'
      using errcode = '55000';
  end if;

  select status, demo_journey_id, package_checksum
  into build_record
  from public.website_build_jobs
  where id = new.build_job_id;

  if not found
     or build_record.status <> 'succeeded'
     or build_record.demo_journey_id <> new.demo_journey_id
     or build_record.package_checksum is distinct from new.package_checksum then
    raise exception 'preview version must exactly match a succeeded build'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger website_preview_versions_validate_and_immutable
  on public.website_preview_versions;

create trigger website_preview_versions_validate_build
before insert on public.website_preview_versions
for each row
execute function public.validate_website_preview_version();

create trigger website_preview_versions_reject_immutable_update
before update of
  id, demo_journey_id, build_job_id, version, preview_url, preview_token,
  generated_package, package_checksum, created_by, created_at
on public.website_preview_versions
for each row
execute function public.validate_website_preview_version();

create or replace function public.promote_website_factory_preview(
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
  promoted_briefing text;
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
      null::jsonb, preview_record.package_checksum,
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

  promoted_briefing := nullif(
    pg_catalog.btrim(build_record.generated_package #>> '{meta,customerWishes}'),
    ''
  );

  update public.demo_journeys
  set preview_url = preview_record.preview_url,
      preview_token = preview_record.preview_token,
      preview_package = merged_package,
      preview_generated_at = pg_catalog.clock_timestamp(),
      demo_status = 'interne_preview_klaar',
      generated_briefing = coalesce(promoted_briefing, journey_record.generated_briefing),
      updated_by = pg_catalog.btrim(p_created_by)
  where id = build_record.demo_journey_id;

  return query select
    preview_record.id, preview_record.demo_journey_id, preview_record.build_job_id,
    preview_record.version, preview_record.preview_url, preview_record.preview_token,
    null::jsonb, preview_record.package_checksum,
    preview_record.is_active, preview_record.created_at, preview_record.created_by, true;
end;
$function$;

revoke all privileges on function public.validate_website_preview_version()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.promote_website_factory_preview(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.promote_website_factory_preview(uuid, text, text, text)
  to service_role;

commit;
