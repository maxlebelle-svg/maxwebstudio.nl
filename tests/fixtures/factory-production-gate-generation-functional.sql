\set ON_ERROR_STOP on

set role service_role;

insert into public.factory_projects(id,relationship_type,relationship_id,factory_type,blueprint_key,blueprint_version,name,status,created_by,updated_at) values
  ('40000000-0000-4000-8000-000000000005','customer','30000000-0000-4000-8000-000000000001','website','website-service-v1',1,'Generation gate','review','20000000-0000-4000-8000-000000000002','2026-07-30T12:00:00Z'),
  ('40000000-0000-4000-8000-000000000006','customer','30000000-0000-4000-8000-000000000001','website','website-service-v1',1,'Unbound override gate','review','20000000-0000-4000-8000-000000000002','2026-07-30T12:00:00Z'),
  ('40000000-0000-4000-8000-000000000007','customer','30000000-0000-4000-8000-000000000001','website','website-service-v1',1,'Dependent source gate','review','20000000-0000-4000-8000-000000000002','2026-07-30T12:00:00Z');

create function pg_temp.generic_gate_batch(input_status text default 'passed') returns jsonb
language sql as $$
  select jsonb_agg(jsonb_build_object(
    'check_key',key_name,'group_key',group_name,'required',true,'status',input_status,'source',source_name,
    'source_version','v1','input_fingerprint',repeat('a',64),
    'evidence',case when input_status='passed' then jsonb_build_object('summary','Trusted supplier PASS','artifactRef','evidence://generation/'||key_name,'observedAt','2026-07-30T12:00:00Z') else '{}'::jsonb end,
    'evidence_hash',repeat('b',64),'blocking_error',case when input_status='passed' then null else 'Proven blocking result' end
  ))
  from (values
    ('product_ready','production','factory_context'),('domain_mapping','domain','domain_center'),('ssl_active','domain','domain_center'),
    ('internal_approval','approval','internal_attestation'),('customer_approval','approval','customer_approval_registry')
  ) checks(key_name,group_name,source_name)
$$;

do $$ declare result jsonb; begin
  result := public.factory_authorize_live_v1(
    '40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002',
    'legacy-current-time-0001','2026-07-29T20:01:00Z'
  );
  if (result->>'authorized')::boolean or result->>'reason' <> 'stale_or_unbound_gate_evidence' then
    raise exception 'historical unbound evidence did not fail closed: %',result;
  end if;
end $$;

do $$ declare generation jsonb; generation_id uuid; result jsonb; begin
  generation := public.factory_begin_gate_generation_v1(
    '40000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000002','dependent-start-0001',false
  );
  generation_id := (generation->>'generationId')::uuid;
  perform public.factory_store_gate_checks_v1(
    '40000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000002','dependent-store-0001',generation_id,pg_temp.generic_gate_batch()
  );
  insert into public.factory_gate_attestations(factory_project_id,attestation_type,status,statement_version,statement_hash,created_by)
  values('40000000-0000-4000-8000-000000000007','internal_approval','active','factory_internal_approval_nl_v1',repeat('c',64),'20000000-0000-4000-8000-000000000001');
  result := public.factory_authorize_live_v1(
    '40000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000002','dependent-stale-0001','2026-07-30T12:00:00Z'
  );
  if (result->>'authorized')::boolean or result->>'reason' <> 'stale_or_unbound_gate_evidence' then
    raise exception 'dependent source change did not invalidate generation: %',result;
  end if;
end $$;

do $$ declare generation jsonb; generation_id uuid; result jsonb; current_updated_at timestamptz; begin
  generation := public.factory_begin_gate_generation_v1(
    '40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','generation-start-0001',true
  );
  generation_id := (generation->>'generationId')::uuid;
  perform public.factory_store_gate_checks_v1(
    '40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','generation-store-0001',generation_id,pg_temp.generic_gate_batch()
  );

  update public.factory_projects
  set configuration='{"relevantChange":true}'::jsonb,updated_at='2026-07-30T12:01:00Z'
  where id='40000000-0000-4000-8000-000000000005';
  select updated_at into current_updated_at from public.factory_projects where id='40000000-0000-4000-8000-000000000005';
  result := public.factory_authorize_live_v1(
    '40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','stale-current-time-0001',current_updated_at
  );
  if (result->>'authorized')::boolean or result->>'reason' <> 'stale_or_unbound_gate_evidence' then
    raise exception 'current caller timestamp rescued stale generation: %',result;
  end if;

  generation := public.factory_begin_gate_generation_v1(
    '40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','generation-start-0002',true
  );
  generation_id := (generation->>'generationId')::uuid;
  perform public.factory_store_gate_checks_v1(
    '40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','generation-store-0002',generation_id,pg_temp.generic_gate_batch()
  );
  result := public.factory_authorize_live_v1(
    '40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','fresh-live-0001',(generation->>'projectUpdatedAt')::timestamptz
  );
  if not (result->>'authorized')::boolean or result->>'releaseMode' <> 'standard' then
    raise exception 'fresh exact generation did not authorize: %',result;
  end if;
  result := public.factory_authorize_live_v1(
    '40000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','fresh-live-0002',(generation->>'projectUpdatedAt')::timestamptz
  );
  if not (result->>'authorized')::boolean or not (result->>'idempotent')::boolean then
    raise exception 'replayed live request was not idempotent: %',result;
  end if;
end $$;

insert into public.factory_gate_overrides(factory_project_id,reason,open_risks,created_by)
values('40000000-0000-4000-8000-000000000006','Controlled unbound generation exception','["Evidence remains deliberately absent"]','20000000-0000-4000-8000-000000000001');

do $$ declare result jsonb; begin
  result := public.factory_authorize_live_v1(
    '40000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001','override-unbound-0001','2026-07-30T12:00:00Z'
  );
  if (result->>'authorized')::boolean or result->>'reason' <> 'stale_or_unbound_gate_evidence' then
    raise exception 'override replaced unbound technical truth: %',result;
  end if;
end $$;

do $$ begin
  begin
    insert into public.factory_gate_checks(factory_project_id,check_key,group_key,status,source,source_version,input_fingerprint,evidence,evidence_hash)
    values('40000000-0000-4000-8000-000000000006','customer_approval','approval','passed','customer_approval_registry','v1',repeat('a',64),'{"summary":"fake","artifactRef":"fake","observedAt":"now"}',repeat('b',64));
    raise exception 'service role direct evidence insert unexpectedly allowed';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
    values('40000000-0000-4000-8000-000000000006','live_authorized','20000000-0000-4000-8000-000000000001','invalid-audit-0001','{}');
    raise exception 'incomplete transition audit unexpectedly allowed';
  exception when check_violation then null; end;
end $$;

do $$ declare authorized_count integer; begin
  select count(*) into authorized_count from public.factory_gate_events
  where factory_project_id='40000000-0000-4000-8000-000000000005' and event_type='live_authorized';
  if authorized_count <> 1 then raise exception 'live authorization replay emitted % events',authorized_count; end if;
  if exists (
    select 1 from public.factory_gate_events
    where factory_project_id in (
        '40000000-0000-4000-8000-000000000005',
        '40000000-0000-4000-8000-000000000006',
        '40000000-0000-4000-8000-000000000007'
      )
      and event_type not in ('check_reported','check_expired','preflight_requested')
      and (actor_profile_id is null or details->>'reason' is null or details->>'previousStatus' is null
        or details->>'newStatus' is null or details->>'projectId' is null or details->>'projectGeneration' is null)
  ) then raise exception 'future transition audit contract is incomplete'; end if;
end $$;

reset role;

select 'PASS_FACTORY_GATE_GENERATION_AND_AUDIT_FUNCTIONAL';
