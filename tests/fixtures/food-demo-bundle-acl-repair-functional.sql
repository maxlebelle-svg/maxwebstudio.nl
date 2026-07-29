\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004');

insert into public.profiles(id,auth_user_id,name,email,role,status,environment) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Local admin','admin@example.test','admin','active','test'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Partner A','a@example.test','sales_partner','active','test'),
  ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','Partner B','b@example.test','sales_partner','active','test'),
  ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','Customer','customer@example.test','customer','active','test');

insert into public.leads(id,company,name,email,assigned_user_id,environment) values
  ('30000000-0000-4000-8000-000000000001','Restaurant A','Contact A','restaurant-a@example.test','10000000-0000-4000-8000-000000000002','test'),
  ('30000000-0000-4000-8000-000000000002','Restaurant B','Contact B','restaurant-b@example.test','10000000-0000-4000-8000-000000000003','test');

insert into public.factory_projects(id,relationship_type,relationship_id,factory_type,blueprint_key,blueprint_version,name,created_by) values
  ('40000000-0000-4000-8000-000000000001','lead','30000000-0000-4000-8000-000000000001','food','silverado-food-v1',1,'Restaurant A Factory','20000000-0000-4000-8000-000000000001');

do $$
declare target_table text; forbidden text; external_rpc text; internal_rpc text;
begin
  foreach target_table in array array['food_demo_bundles','food_demo_bundle_dispatches','food_demo_bundle_events','food_demo_bundle_rate_limits'] loop
    foreach forbidden in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('service_role','public.' || target_table,forbidden) then
        raise exception 'service_role retained % on %', forbidden, target_table;
      end if;
    end loop;
  end loop;
  foreach external_rpc in array array[
    'food_demo_bundle_read_v1(uuid,uuid,text,uuid,uuid)',
    'food_demo_bundle_upsert_v1(uuid,uuid,text,uuid,uuid,text,text)',
    'food_demo_bundle_update_links_v1(uuid,uuid,uuid,text,text,text)',
    'food_demo_bundle_reserve_dispatch_v1(uuid,uuid,uuid,text,text,text,integer)',
    'food_demo_bundle_complete_dispatch_v1(uuid,uuid,uuid,uuid,text,text,boolean,text,text)',
    'food_demo_bundle_revoke_v1(uuid,uuid,uuid,text)'
  ] loop
    if not has_function_privilege('service_role','public.' || external_rpc,'EXECUTE') then
      raise exception 'service_role cannot execute %', external_rpc;
    end if;
  end loop;
  foreach internal_rpc in array array[
    'food_demo_bundle_assert_scope_v1(uuid,uuid,text,uuid)',
    'food_demo_bundle_append_event_v1(uuid,text,text,uuid,jsonb)',
    'consume_food_demo_bundle_rate_limit(uuid,text,integer)'
  ] loop
    if has_function_privilege('service_role','public.' || internal_rpc,'EXECUTE') then
      raise exception 'service_role can execute internal %', internal_rpc;
    end if;
  end loop;
end $$;

set role service_role;

do $$
begin
  begin
    perform * from public.food_demo_bundles;
    raise exception 'direct table read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$
declare bundle public.food_demo_bundles; listed integer; dispatch record;
begin
  bundle := public.food_demo_bundle_upsert_v1(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    'lead','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
    'Restaurant A Demo','silverado-food-v1'
  );
  if bundle.storefront_url <> 'https://max-webstudio-food-demo.netlify.app/food/silverado-roti-shop-emmeloord'
     or bundle.recipient_email <> 'restaurant-a@example.test' then
    raise exception 'server-owned bundle fields failed';
  end if;

  select count(*) into listed from public.food_demo_bundle_read_v1(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    'lead','30000000-0000-4000-8000-000000000001',null
  );
  if listed <> 1 then raise exception 'scoped read failed'; end if;

  bundle := public.food_demo_bundle_update_links_v1(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    bundle.id,'reachable','reachable','links-functional-0001'
  );

  select * into dispatch from public.food_demo_bundle_reserve_dispatch_v1(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    bundle.id,'test','dispatch-functional-0001','internal_test',8
  );
  if dispatch.duplicate then raise exception 'first reservation marked duplicate'; end if;

  perform public.food_demo_bundle_complete_dispatch_v1(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    bundle.id,dispatch.id,'test','dispatch-functional-0001',true,'provider-local-1',null
  );

  select * into dispatch from public.food_demo_bundle_reserve_dispatch_v1(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    bundle.id,'test','dispatch-functional-0001','internal_test',8
  );
  if not dispatch.duplicate or dispatch.status <> 'sent' then raise exception 'idempotent reservation failed'; end if;

  bundle := public.food_demo_bundle_revoke_v1(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    bundle.id,'revoke-functional-0001'
  );
  if bundle.invitation_status <> 'revoked' then raise exception 'revoke failed'; end if;

end $$;

do $$
declare bundle public.food_demo_bundles; dispatch record;
begin
  -- A normal admin can manage either scoped relationship without an override.
  bundle := public.food_demo_bundle_upsert_v1(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    'lead','30000000-0000-4000-8000-000000000002',null,'Restaurant B Demo','silverado-food-v1'
  );
  begin
    perform public.food_demo_bundle_upsert_v1(
      '20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',
      'lead','30000000-0000-4000-8000-000000000002',null,'Denied Demo','silverado-food-v1'
    );
    raise exception 'customer role unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.food_demo_bundle_upsert_v1(
      '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      'lead','30000000-0000-4000-8000-000000000002',null,'Manipulated Demo','attacker-blueprint'
    );
    raise exception 'blueprint manipulation unexpectedly allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.food_demo_bundle_upsert_v1(
      '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      'lead','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',
      'Mismatched Factory Demo','silverado-food-v1'
    );
    raise exception 'Factory scope manipulation unexpectedly allowed';
  exception when check_violation then null;
  end;

  select * into dispatch from public.food_demo_bundle_reserve_dispatch_v1(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    bundle.id,'test','dispatch-transition-0001','internal_test',8
  );
  perform public.food_demo_bundle_complete_dispatch_v1(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    bundle.id,dispatch.id,'test','dispatch-transition-0001',true,'provider-local-2',null
  );
  begin
    perform public.food_demo_bundle_complete_dispatch_v1(
      '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      bundle.id,dispatch.id,'test','dispatch-transition-0001',false,null,'forced-opposite-state'
    );
    raise exception 'invalid dispatch transition unexpectedly allowed';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;

do $$
begin
  perform public.food_demo_bundle_read_v1(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',
    'lead','30000000-0000-4000-8000-000000000002',null
  );
  raise exception 'cross-scope read unexpectedly allowed';
exception when insufficient_privilege then null;
end $$;

reset role;

do $$
declare v_bundle_id uuid; audit_count integer;
begin
  select id into v_bundle_id from public.food_demo_bundles where relationship_id='30000000-0000-4000-8000-000000000001';
  select count(*) into audit_count from public.food_demo_bundle_events where food_demo_bundle_events.bundle_id=v_bundle_id;
  if audit_count < 4 then raise exception 'append-only audit evidence missing'; end if;
  begin
    update public.food_demo_bundle_events set event_type='tampered' where food_demo_bundle_events.bundle_id=v_bundle_id;
    raise exception 'append-only event update unexpectedly allowed';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;

select 'PASS_FOOD_DEMO_BUNDLE_ACL_REPAIR_FUNCTIONAL';
