\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005');
insert into public.profiles(id,auth_user_id,name,email,role,status,environment) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Superadmin','super@example.test','super_admin','active','test'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Admin','admin@example.test','admin','active','test'),
  ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','Developer','dev@example.test','developer','active','test'),
  ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','Customer A','a@example.test','customer','active','test'),
  ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','Customer B','b@example.test','customer','active','test');
insert into public.customers(id,profile_id,auth_user_id,name,environment) values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','Customer A','test'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','Customer B','test');
insert into public.factory_projects(id,relationship_type,relationship_id,factory_type,blueprint_key,blueprint_version,name,status,created_by,updated_at) values
  ('40000000-0000-4000-8000-000000000001','customer','30000000-0000-4000-8000-000000000001','website','website-service-v1',1,'Standard gate','review','20000000-0000-4000-8000-000000000002','2026-07-29T20:00:00Z'),
  ('40000000-0000-4000-8000-000000000002','customer','30000000-0000-4000-8000-000000000001','website','website-service-v1',1,'Override gate','review','20000000-0000-4000-8000-000000000002','2026-07-29T20:00:00Z'),
  ('40000000-0000-4000-8000-000000000003','customer','30000000-0000-4000-8000-000000000001','website','website-service-v1',1,'Missing gate','review','20000000-0000-4000-8000-000000000002','2026-07-29T20:00:00Z'),
  ('40000000-0000-4000-8000-000000000004','customer','30000000-0000-4000-8000-000000000001','website','website-service-v1',1,'Changed gate','review','20000000-0000-4000-8000-000000000002','2026-07-29T20:00:00Z');

set role service_role;

do $$ begin
  begin
    update public.factory_projects set status='live' where id='40000000-0000-4000-8000-000000000001';
    raise exception 'direct live update unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;

do $$ declare result jsonb; begin
  result := public.factory_authorize_live_v1('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','missing-checks-0001','2026-07-29T20:00:00Z');
  if (result->>'authorized')::boolean then raise exception 'missing evidence authorized live'; end if;
end $$;

insert into public.factory_gate_checks(factory_project_id,check_key,group_key,status,source,source_version,input_fingerprint,evidence,evidence_hash,checked_by,checked_at,expires_at)
select '40000000-0000-4000-8000-000000000001',key_name,group_name,'passed',source_name,'v1',repeat('a',64),jsonb_build_object('summary','Trusted supplier PASS','artifactRef','evidence://local/'||key_name,'observedAt','2026-07-29T20:00:00Z'),repeat('b',64),'20000000-0000-4000-8000-000000000002','2026-07-29T20:00:00Z','2026-07-30T20:00:00Z'
from (values
 ('product_ready','production','factory_context'),('domain_mapping','domain','domain_center'),('ssl_active','domain','domain_center'),
 ('internal_approval','approval','internal_attestation'),('customer_approval','approval','customer_approval_registry')
) checks(key_name,group_name,source_name);

do $$ declare result jsonb; begin
  result := public.factory_authorize_live_v1('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','standard-live-0001','2026-07-29T20:00:00Z');
  if not (result->>'authorized')::boolean or result->>'releaseMode' <> 'standard' then raise exception 'standard gate authorization failed'; end if;
end $$;

do $$ begin
  begin
    insert into public.factory_gate_overrides(factory_project_id,reason,open_risks,created_by)
    values('40000000-0000-4000-8000-000000000002','Admin may not override', '["Open risk"]','20000000-0000-4000-8000-000000000002');
    raise exception 'ordinary admin override unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.factory_gate_overrides(factory_project_id,reason,open_risks,created_by)
    values('40000000-0000-4000-8000-000000000002','Developer may not override', '["Open risk"]','20000000-0000-4000-8000-000000000003');
    raise exception 'developer override unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.factory_gate_overrides(factory_project_id,reason,open_risks,created_by)
    values('40000000-0000-4000-8000-000000000002','short', '["Open risk"]','20000000-0000-4000-8000-000000000001');
    raise exception 'override without mandatory reason unexpectedly allowed';
  exception when check_violation then null; end;
end $$;

insert into public.factory_gate_overrides(factory_project_id,reason,open_risks,created_by)
values('40000000-0000-4000-8000-000000000002','Controlled local superadmin exception','["All required production proofs remain open"]','20000000-0000-4000-8000-000000000001');

do $$ declare result jsonb; begin
  result := public.factory_authorize_live_v1('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','admin-override-0001','2026-07-29T20:00:00Z');
  if (result->>'authorized')::boolean then raise exception 'ordinary admin consumed override'; end if;
  result := public.factory_authorize_live_v1('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','super-override-0001','2026-07-29T20:00:00Z');
  if not (result->>'authorized')::boolean or result->>'releaseMode' <> 'override' then raise exception 'superadmin override authorization failed'; end if;
end $$;

insert into public.factory_gate_checks(factory_project_id,check_key,group_key,status,source,source_version,input_fingerprint,evidence,evidence_hash,checked_by,checked_at,expires_at)
select '40000000-0000-4000-8000-000000000004',key_name,group_name,'passed',source_name,'v1',repeat('c',64),jsonb_build_object('summary','Trusted supplier PASS','artifactRef','evidence://changed/'||key_name,'observedAt','2026-07-29T20:00:00Z'),repeat('d',64),'20000000-0000-4000-8000-000000000002','2026-07-29T20:00:00Z','2026-07-30T20:00:00Z'
from (values
 ('product_ready','production','factory_context'),('domain_mapping','domain','domain_center'),('ssl_active','domain','domain_center'),
 ('internal_approval','approval','internal_attestation'),('customer_approval','approval','customer_approval_registry')
) checks(key_name,group_name,source_name);
update public.factory_projects set configuration='{"changed":true}'::jsonb,updated_at='2026-07-29T20:01:00Z' where id='40000000-0000-4000-8000-000000000004';
do $$ declare result jsonb; begin
  result := public.factory_authorize_live_v1('40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','changed-source-0001','2026-07-29T20:00:00Z');
  if (result->>'authorized')::boolean then raise exception 'changed project authorized with stale preflight'; end if;
end $$;

reset role;
do $$ declare check_id uuid; event_id uuid; begin
  select id into check_id from public.factory_gate_checks limit 1;
  select id into event_id from public.factory_gate_events limit 1;
  begin update public.factory_gate_checks set status='failed' where id=check_id; raise exception 'check update allowed'; exception when object_not_in_prerequisite_state then null; end;
  begin delete from public.factory_gate_checks where id=check_id; raise exception 'check delete allowed'; exception when object_not_in_prerequisite_state then null; end;
  begin update public.factory_gate_events set details='{}' where id=event_id; raise exception 'event update allowed'; exception when object_not_in_prerequisite_state then null; end;
  begin delete from public.factory_gate_events where id=event_id; raise exception 'event delete allowed'; exception when object_not_in_prerequisite_state then null; end;
end $$;

set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000005';
do $$ begin
  begin
    perform public.factory_record_customer_approval_v1('40000000-0000-4000-8000-000000000003','factory_customer_approval_nl_v1',repeat('e',64));
    raise exception 'cross-tenant customer approval unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.factory_gate_checks(factory_project_id,check_key,group_key,status,source,source_version,input_fingerprint,evidence,evidence_hash)
    values('40000000-0000-4000-8000-000000000003','customer_approval','approval','passed','customer_approval_registry','v1',repeat('a',64),'{"summary":"fake","artifactRef":"fake","observedAt":"now"}',repeat('b',64));
    raise exception 'caller-supplied evidence insert unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ declare blocked integer; authorized integer; begin
  select count(*) into blocked from public.factory_gate_events where event_type='live_attempt_blocked';
  select count(*) into authorized from public.factory_gate_events where event_type='live_authorized';
  if blocked < 3 or authorized <> 2 then raise exception 'live attempt audit totals invalid: blocked %, authorized %',blocked,authorized; end if;
  if not exists(select 1 from public.factory_gate_events where event_type='live_authorized' and details->>'releaseMode'='override') then raise exception 'LIVE VIA UITZONDERING audit missing'; end if;
end $$;

select 'PASS_FACTORY_PRODUCTION_GATE_FUNCTIONAL';
