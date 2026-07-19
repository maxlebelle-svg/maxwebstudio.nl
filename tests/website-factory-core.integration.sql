\set ON_ERROR_STOP on

create function public.rc15_fail_preview_activation()
returns trigger
language plpgsql
as $function$
begin
  if current_setting('rc15.fail_preview_activation', true) = 'on' and new.is_active then
    raise exception 'forced preview activation failure';
  end if;
  return new;
end;
$function$;

create trigger rc15_fail_preview_activation
before update on public.website_preview_versions
for each row execute function public.rc15_fail_preview_activation();

create function public.rc15_fail_journey_update()
returns trigger
language plpgsql
as $function$
begin
  if current_setting('rc15.fail_journey_update', true) = 'on' then
    raise exception 'forced journey update failure';
  end if;
  return new;
end;
$function$;

create trigger rc15_fail_journey_update
before update on public.demo_journeys
for each row execute function public.rc15_fail_journey_update();

do $test$
declare
  lead_one uuid := '11111111-1111-4111-8111-111111111111';
  customer_one uuid := '22222222-2222-4222-8222-222222222222';
  journey_one uuid;
  build_one uuid;
  build_two uuid;
  build_three uuid;
  preview_one uuid;
  preview_two uuid;
  returned_preview uuid;
  returned_version integer;
  checksum_one text := repeat('a', 64);
  checksum_two text := repeat('b', 64);
  checksum_three text := repeat('c', 64);
begin
  if to_regclass('public.website_build_jobs') is null
     or to_regclass('public.website_preview_versions') is null then
    raise exception 'Website Factory core tables are missing';
  end if;

  if has_table_privilege('anon', 'public.website_build_jobs', 'select')
     or has_table_privilege('authenticated', 'public.website_build_jobs', 'select')
     or has_table_privilege('anon', 'public.website_preview_versions', 'select')
     or has_table_privilege('authenticated', 'public.website_preview_versions', 'select') then
    raise exception 'direct client privileges are broader than intended';
  end if;
  if not has_table_privilege('service_role', 'public.website_build_jobs', 'select')
     or not has_table_privilege('service_role', 'public.website_build_jobs', 'insert')
     or not has_table_privilege('service_role', 'public.website_build_jobs', 'update')
     or has_table_privilege('service_role', 'public.website_build_jobs', 'delete')
     or not has_table_privilege('service_role', 'public.website_preview_versions', 'select')
     or has_table_privilege('service_role', 'public.website_preview_versions', 'insert')
     or has_table_privilege('service_role', 'public.website_preview_versions', 'update') then
    raise exception 'service_role grants do not match the Factory contract';
  end if;

  insert into public.leads (id) values (lead_one);
  insert into public.customers (id) values (customer_one);
  insert into public.demo_journeys (lead_id, customer_id, business_name, generated_briefing)
  values (lead_one, customer_one, 'RC1.5A Factory Test', 'Branche: schilder')
  returning id into journey_one;

  insert into public.website_build_jobs (
    demo_journey_id, lead_id, customer_id, status, package_type, generator_version,
    request_fingerprint, idempotency_key, generated_package, package_checksum,
    created_by, updated_by
  ) values (
    journey_one, lead_one, customer_one, 'succeeded', 'starter', 'factory-v1',
    repeat('1', 64), 'request-one', '{"site":"version-one"}'::jsonb, checksum_one,
    'test:owner', 'test:owner'
  ) returning id into build_one;

  select preview_version_id, version into returned_preview, returned_version
  from public.promote_website_factory_preview(build_one, '/preview/one', 'token-one', 'test:owner');
  preview_one := returned_preview;
  if returned_version <> 1 then raise exception 'first preview is not version 1'; end if;

  select preview_version_id, version into returned_preview, returned_version
  from public.promote_website_factory_preview(build_one, '/preview/retry', 'different-retry-token', 'test:owner');
  if returned_preview <> preview_one or returned_version <> 1 then
    raise exception 'identical retry did not reuse preview version 1';
  end if;
  if (select count(*) from public.website_preview_versions where demo_journey_id = journey_one) <> 1 then
    raise exception 'identical retry created a duplicate preview';
  end if;

  begin
    insert into public.website_build_jobs (
      demo_journey_id, status, package_type, generator_version, request_fingerprint,
      idempotency_key, created_by, updated_by
    ) values (
      journey_one, 'queued', 'starter', 'factory-v1', repeat('1', 64),
      'duplicate-fingerprint', 'test:owner', 'test:owner'
    );
    raise exception 'duplicate request fingerprint was accepted';
  exception when unique_violation then null;
  end;

  insert into public.website_build_jobs (
    demo_journey_id, status, package_type, generator_version, request_fingerprint,
    idempotency_key, generated_package, package_checksum, created_by, updated_by
  ) values (
    journey_one, 'succeeded', 'premium', 'factory-v1', repeat('2', 64),
    'request-two', '{"site":"version-two"}'::jsonb, checksum_two, 'test:owner', 'test:owner'
  ) returning id into build_two;

  select preview_version_id, version into preview_two, returned_version
  from public.promote_website_factory_preview(build_two, '/preview/two', 'token-two', 'test:owner');
  if returned_version <> 2 then raise exception 'changed input did not create version 2'; end if;
  if not exists (select 1 from public.website_preview_versions where id = preview_one and not is_active)
     or not exists (select 1 from public.website_preview_versions where id = preview_two and is_active) then
    raise exception 'version 2 promotion did not preserve inactive version 1';
  end if;

  insert into public.website_build_jobs (
    demo_journey_id, status, package_type, generator_version, request_fingerprint,
    idempotency_key, generated_package, package_checksum, created_by, updated_by
  ) values (
    journey_one, 'succeeded', 'business', 'factory-v1', repeat('3', 64),
    'request-three', '{"site":"version-three"}'::jsonb, checksum_three, 'test:owner', 'test:owner'
  ) returning id into build_three;

  begin
    perform * from public.promote_website_factory_preview(build_three, '/preview/three', 'token-two', 'test:owner');
    raise exception 'duplicate token did not fail before activation';
  exception when unique_violation then null;
  end;
  if not exists (select 1 from public.website_preview_versions where id = preview_two and is_active)
     or exists (select 1 from public.website_preview_versions where build_job_id = build_three) then
    raise exception 'failure before preview insert changed the active preview';
  end if;

  perform set_config('rc15.fail_preview_activation', 'on', true);
  begin
    perform * from public.promote_website_factory_preview(build_three, '/preview/three', 'token-three', 'test:owner');
    raise exception 'forced activation failure did not fail';
  exception when others then
    if sqlerrm = 'forced activation failure did not fail' then raise; end if;
  end;
  perform set_config('rc15.fail_preview_activation', 'off', true);
  if not exists (select 1 from public.website_preview_versions where id = preview_two and is_active)
     or exists (select 1 from public.website_preview_versions where build_job_id = build_three) then
    raise exception 'failure after insert did not roll back atomically';
  end if;

  perform set_config('rc15.fail_journey_update', 'on', true);
  begin
    perform * from public.promote_website_factory_preview(build_three, '/preview/three', 'token-three', 'test:owner');
    raise exception 'forced journey failure did not fail';
  exception when others then
    if sqlerrm = 'forced journey failure did not fail' then raise; end if;
  end;
  perform set_config('rc15.fail_journey_update', 'off', true);
  if not exists (select 1 from public.website_preview_versions where id = preview_two and is_active)
     or exists (select 1 from public.website_preview_versions where build_job_id = build_three)
     or (select preview_token from public.demo_journeys where id = journey_one) <> 'token-two' then
    raise exception 'journey update failure did not preserve version 2';
  end if;

  begin
    update public.website_preview_versions
    set generated_package = '{"tampered":true}'::jsonb
    where id = preview_two;
    raise exception 'immutable preview accepted a package update';
  exception when object_not_in_prerequisite_state then null;
  end;

  if (select package_checksum from public.website_preview_versions where id = preview_two) <> checksum_two
     or (select package_checksum from public.website_build_jobs where id = build_two) <> checksum_two then
    raise exception 'package checksum changed after reopen';
  end if;
  if (select count(*) from public.website_preview_versions where demo_journey_id = journey_one and is_active) <> 1 then
    raise exception 'journey does not have exactly one active preview';
  end if;

  delete from public.leads where id = lead_one;
  delete from public.customers where id = customer_one;
  if not exists (select 1 from public.website_build_jobs where id = build_one and lead_id is null and customer_id is null) then
    raise exception 'historical build did not survive parent deletion';
  end if;
end;
$test$;

drop trigger rc15_fail_preview_activation on public.website_preview_versions;
drop function public.rc15_fail_preview_activation();
drop trigger rc15_fail_journey_update on public.demo_journeys;
drop function public.rc15_fail_journey_update();
