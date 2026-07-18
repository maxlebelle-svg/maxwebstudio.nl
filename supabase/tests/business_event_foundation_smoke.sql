begin;

select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.business_event_contracts (
  event_type,
  event_version,
  lifecycle_status,
  description,
  allowed_owner_scopes,
  payload_schema,
  max_payload_bytes,
  validator_key,
  registered_by_migration
) values (
  'platform.foundation_tested',
  1,
  'active',
  'Transaction-only contract used to validate the Business Event foundation.',
  array['internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["testId"],"properties":{"testId":{"type":"string","format":"uuid"}}}'::jsonb,
  512,
  'foundation_test_v1',
  'transactional_smoke_test_only'
);

do $$
begin
  if has_table_privilege('anon', 'public.business_events', 'select')
    or has_table_privilege('anon', 'public.business_events', 'insert')
    or has_table_privilege('authenticated', 'public.business_events', 'select')
    or has_table_privilege('authenticated', 'public.business_events', 'insert')
  then
    raise exception 'anon/authenticated must have no Business Event table privileges';
  end if;

  if has_table_privilege('service_role', 'public.business_events', 'insert')
    or has_table_privilege('service_role', 'public.business_events', 'update')
    or has_table_privilege('service_role', 'public.business_event_consumptions', 'update')
  then
    raise exception 'service_role mutations must use bounded functions';
  end if;

  if has_function_privilege(
      'anon',
      'public.record_business_event(text,uuid,text,smallint,timestamp with time zone,text,text,text,text,uuid,uuid,text,text,uuid,text,jsonb)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.record_business_event(text,uuid,text,smallint,timestamp with time zone,text,text,text,text,uuid,uuid,text,text,uuid,text,jsonb)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.record_business_event(text,uuid,text,smallint,timestamp with time zone,text,text,text,text,uuid,uuid,text,text,uuid,text,jsonb)',
      'execute'
    )
  then
    raise exception 'Business Event RPC execute grants are unsafe';
  end if;
end;
$$;

create temporary table business_event_foundation_test_state on commit drop as
select
  (public.record_business_event(
    'internal',
    null::uuid,
    'platform.foundation_tested',
    1::smallint,
    '2026-07-18T12:00:00Z'::timestamptz,
    'system',
    'foundation-smoke-test',
    'business_intelligence',
    'smoke_test:v1',
    '11111111-1111-4111-8111-111111111111'::uuid,
    null::uuid,
    'platform.foundation_tested:v1:22222222-2222-4222-8222-222222222222',
    'foundation_test',
    '22222222-2222-4222-8222-222222222222'::uuid,
    null::text,
    '{"testId":"22222222-2222-4222-8222-222222222222"}'::jsonb
  )).id as event_id;

do $$
declare
  first_id uuid;
  retry_id uuid;
begin
  select event_id into first_id from business_event_foundation_test_state;
  select (public.record_business_event(
    'internal',
    null::uuid,
    'platform.foundation_tested',
    1::smallint,
    '2026-07-18T12:00:00Z'::timestamptz,
    'system',
    'foundation-smoke-test',
    'business_intelligence',
    'smoke_test:v1',
    '11111111-1111-4111-8111-111111111111'::uuid,
    null::uuid,
    'platform.foundation_tested:v1:22222222-2222-4222-8222-222222222222',
    'foundation_test',
    '22222222-2222-4222-8222-222222222222'::uuid,
    null::text,
    '{"testId":"22222222-2222-4222-8222-222222222222"}'::jsonb
  )).id into retry_id;

  if first_id is distinct from retry_id then
    raise exception 'identical retry must return the existing Business Event';
  end if;
end;
$$;

do $$
begin
  perform public.record_business_event(
    'internal',
    null::uuid,
    'platform.foundation_tested',
    1::smallint,
    '2026-07-18T12:00:01Z'::timestamptz,
    'system',
    'foundation-smoke-test',
    'business_intelligence',
    'smoke_test:v1',
    '11111111-1111-4111-8111-111111111111'::uuid,
    null::uuid,
    'platform.foundation_tested:v1:22222222-2222-4222-8222-222222222222',
    'foundation_test',
    '22222222-2222-4222-8222-222222222222'::uuid,
    null::text,
    '{"testId":"22222222-2222-4222-8222-222222222222"}'::jsonb
  );
  raise exception 'deduplication conflict must be rejected';
exception
  when unique_violation then null;
end;
$$;

do $$
declare
  target_id uuid;
begin
  select event_id into target_id from business_event_foundation_test_state;
  begin
    update public.business_events set actor_id = 'mutated' where id = target_id;
    raise exception 'Business Event must reject updates';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    delete from public.business_events where id = target_id;
    raise exception 'Business Event must reject deletes';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

do $$
begin
  begin
    update public.business_event_contracts
    set max_payload_bytes = 1024
    where event_type = 'platform.foundation_tested' and event_version = 1;
    raise exception 'Contract definition must reject updates';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.business_event_contracts
    set lifecycle_status = 'retired', deprecated_at = clock_timestamp()
    where event_type = 'platform.foundation_tested' and event_version = 1;
    raise exception 'Contract lifecycle must not skip deprecated';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

create temporary table business_event_consumption_test_state on commit drop as
select
  (public.create_business_event_consumption(
    (select event_id from business_event_foundation_test_state),
    'foundation_smoke_consumer',
    1::smallint
  )).id as consumption_id;

do $$
declare
  target_id uuid;
  result_record public.business_event_consumptions%rowtype;
begin
  select consumption_id into target_id from business_event_consumption_test_state;
  result_record := public.claim_business_event_consumption(target_id, 'smoke-worker', 60);
  if result_record.status <> 'claimed' or result_record.attempt_count <> 1 then
    raise exception 'claim transition failed';
  end if;

  result_record := public.mark_business_event_consumption_running(target_id, 'smoke-worker');
  if result_record.status <> 'running' then
    raise exception 'running transition failed';
  end if;

  result_record := public.mark_business_event_consumption_completed(target_id, 'smoke-worker');
  if result_record.status <> 'completed' or result_record.completed_at is null then
    raise exception 'completed transition failed';
  end if;
end;
$$;

do $$
declare
  target_id uuid;
begin
  select (public.create_business_event_consumption(
    (select event_id from business_event_foundation_test_state),
    'invalid_transition_consumer',
    1::smallint
  )).id into target_id;

  begin
    update public.business_event_consumptions
    set status = 'completed', completed_at = clock_timestamp()
    where id = target_id;
    raise exception 'invalid consumption transition must be rejected';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end;
$$;

update public.business_event_contracts
set lifecycle_status = 'deprecated', deprecated_at = clock_timestamp()
where event_type = 'platform.foundation_tested' and event_version = 1;

update public.business_event_contracts
set lifecycle_status = 'retired'
where event_type = 'platform.foundation_tested' and event_version = 1;

rollback;
