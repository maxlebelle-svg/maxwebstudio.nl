\set ON_ERROR_STOP on

set role service_role;

do $privilege_matrix$
declare
  table_name text;
  command_name text;
begin
  foreach table_name in array array[
    'commercial_offers',
    'commercial_offer_versions',
    'commercial_offer_lines',
    'commercial_offer_document_bindings',
    'commercial_offer_events'
  ] loop
    if not has_table_privilege(current_user, 'public.' || table_name, 'SELECT') then
      raise exception 'service_role lacks SELECT on %', table_name;
    end if;
    foreach command_name in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(current_user, 'public.' || table_name, command_name) then
        raise exception 'service_role unexpectedly has % on %', command_name, table_name;
      end if;
    end loop;
  end loop;

  if has_table_privilege(current_user, 'public.commercial_catalog_versions', 'SELECT') then
    raise exception 'catalog table was added to the direct Composer read surface';
  end if;

  perform count(*) from public.commercial_offers;
  perform count(*) from public.commercial_offer_versions;
  perform count(*) from public.commercial_offer_lines;
  perform count(*) from public.commercial_offer_document_bindings;
  perform count(*) from public.commercial_offer_events;

  begin
    execute 'insert into public.commercial_offers default values';
    raise exception 'direct INSERT unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'update public.commercial_offer_versions set status=status';
    raise exception 'direct UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'delete from public.commercial_offer_events';
    raise exception 'direct DELETE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end
$privilege_matrix$;

do $bounded_rpcs$
declare
  current_snapshot jsonb;
  current_version uuid;
  event_count_before bigint;
  rpc_result jsonb;
begin
  select v.id, v.snapshot
  into current_version, current_snapshot
  from public.commercial_offer_versions v
  join public.commercial_offers o on o.current_version_id=v.id
  where o.creation_idempotency_key='phase-c:db:first:0001';

  select count(*) into event_count_before from public.commercial_offer_events;

  perform public.commercial_register_catalog_version_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'maxwebstudio-commercial','test-v1',repeat('a',64),
    '{"catalogKey":"maxwebstudio-commercial","version":"test-v1"}'::jsonb
  );

  rpc_result := public.commercial_create_offer_version_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
    'lead','33333333-3333-4333-8333-333333333333',null,
    'Lokaal gecertificeerd voorstel','55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-777777777777',
    current_snapshot,current_snapshot->'lines','[]'::jsonb,
    'Idempotente service-role herlezing','phase-c:db:first:0001'
  );
  if coalesce((rpc_result->>'duplicate')::boolean,false) is not true then
    raise exception 'bounded create RPC did not return its idempotent result';
  end if;

  rpc_result := public.commercial_transition_offer_version_v1(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
    current_version,'ready_for_review',null,'phase-c:db:ready:0003'
  );
  if coalesce((rpc_result->>'duplicate')::boolean,false) is not true then
    raise exception 'bounded transition RPC did not return its idempotent result';
  end if;

  if (select count(*) from public.commercial_offer_events) <> event_count_before then
    raise exception 'idempotent RPC verification changed the audit trail';
  end if;
end
$bounded_rpcs$;

reset role;

select 'PASS_PHASE_BC_COMPOSER_READ_FIX_FUNCTIONAL';
