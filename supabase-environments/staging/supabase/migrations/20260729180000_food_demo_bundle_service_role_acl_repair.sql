-- Food Demo Bundle ACL Repair: replace direct service_role table access with bounded RPCs.
-- Additive and data preserving. The applied 20260729170000 migration remains immutable.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $preflight$
declare
  target_table text;
begin
  foreach target_table in array array[
    'food_demo_bundles',
    'food_demo_bundle_dispatches',
    'food_demo_bundle_events',
    'food_demo_bundle_rate_limits'
  ] loop
    if pg_catalog.to_regclass('public.' || target_table) is null then
      raise exception using errcode = '55000', message = 'Food Demo Bundle ACL Repair requires table public.' || target_table || '.';
    end if;
  end loop;
  if pg_catalog.to_regprocedure('public.consume_food_demo_bundle_rate_limit(uuid,text,integer)') is null then
    raise exception using errcode = '55000', message = 'Food Demo Bundle ACL Repair requires the existing rate-limit function.';
  end if;
  if not (select rolbypassrls from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception using errcode = '55000', message = 'Food Demo Bundle ACL Repair expects the platform-managed BYPASSRLS role and does not alter it.';
  end if;
end
$preflight$;

create function public.food_demo_bundle_assert_scope_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_relationship_type text,
  input_relationship_id uuid
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor public.profiles%rowtype;
  relationship_metadata jsonb;
  lead_owner uuid;
  customer_profile uuid;
  customer_auth uuid;
begin
  if input_actor_profile_id is null or input_actor_auth_user_id is null
     or input_relationship_type not in ('lead','customer') or input_relationship_id is null then
    raise exception using errcode = '22023', message = 'Invalid Food Demo Bundle actor scope.';
  end if;
  select * into actor from public.profiles where id = input_actor_profile_id;
  if not found or actor.auth_user_id is distinct from input_actor_auth_user_id or actor.status <> 'active'
     or actor.role not in ('super_admin','admin','sales_manager','sales_partner') then
    raise exception using errcode = '42501', message = 'Active Food Demo Bundle admin role required.';
  end if;
  if input_relationship_type = 'lead' then
    select assigned_user_id, metadata into lead_owner, relationship_metadata
    from public.leads where id = input_relationship_id;
    if not found then raise exception using errcode = 'P0002', message = 'Food Demo Bundle lead not found.'; end if;
  else
    select profile_id, auth_user_id, metadata into customer_profile, customer_auth, relationship_metadata
    from public.customers where id = input_relationship_id;
    if not found then raise exception using errcode = 'P0002', message = 'Food Demo Bundle customer not found.'; end if;
  end if;
  if actor.role in ('super_admin','admin','sales_manager') then return; end if;
  if input_relationship_type = 'lead' and (
    lead_owner = input_actor_auth_user_id
    or relationship_metadata->>'assignedUserId' in (input_actor_auth_user_id::text,input_actor_profile_id::text)
    or relationship_metadata->>'assigned_user_id' in (input_actor_auth_user_id::text,input_actor_profile_id::text)
    or relationship_metadata->>'ownerAuthUserId' = input_actor_auth_user_id::text
    or relationship_metadata->>'owner_profile_id' = input_actor_profile_id::text
  ) then return; end if;
  if input_relationship_type = 'customer' and (
    customer_auth = input_actor_auth_user_id or customer_profile = input_actor_profile_id
    or relationship_metadata->>'assignedUserId' in (input_actor_auth_user_id::text,input_actor_profile_id::text)
    or relationship_metadata->>'assigned_user_id' in (input_actor_auth_user_id::text,input_actor_profile_id::text)
    or relationship_metadata->>'ownerAuthUserId' = input_actor_auth_user_id::text
    or relationship_metadata->>'owner_profile_id' = input_actor_profile_id::text
  ) then return; end if;
  raise exception using errcode = '42501', message = 'Food Demo Bundle relationship scope denied.';
end
$$;

create function public.food_demo_bundle_append_event_v1(
  input_bundle_id uuid,
  input_event_type text,
  input_action_key text,
  input_actor_profile_id uuid,
  input_metadata jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if input_bundle_id is null or input_event_type !~ '^[a-z][a-z0-9_]{2,79}$'
     or char_length(input_event_type) > 80 or jsonb_typeof(coalesce(input_metadata,'{}'::jsonb)) <> 'object'
     or pg_column_size(coalesce(input_metadata,'{}'::jsonb)) > 4096 then
    raise exception using errcode = '22023', message = 'Invalid Food Demo Bundle audit event.';
  end if;
  if input_action_key is not null and char_length(input_action_key) not between 16 and 160 then
    raise exception using errcode = '22023', message = 'Invalid Food Demo Bundle audit action key.';
  end if;
  insert into public.food_demo_bundle_events(bundle_id,event_type,action_key,actor_profile_id,metadata)
  values(input_bundle_id,input_event_type,input_action_key,input_actor_profile_id,coalesce(input_metadata,'{}'::jsonb))
  on conflict (bundle_id,action_key) where action_key is not null do nothing;
end
$$;

create function public.food_demo_bundle_read_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_relationship_type text default null,
  input_relationship_id uuid default null,
  input_bundle_id uuid default null
) returns setof public.food_demo_bundles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.food_demo_bundles%rowtype;
begin
  if input_bundle_id is not null then
    select * into target from public.food_demo_bundles where id = input_bundle_id;
    if not found then return; end if;
    perform public.food_demo_bundle_assert_scope_v1(input_actor_profile_id,input_actor_auth_user_id,target.relationship_type,target.relationship_id);
    return query select bundle.* from public.food_demo_bundles bundle where bundle.id = input_bundle_id;
    return;
  end if;
  perform public.food_demo_bundle_assert_scope_v1(input_actor_profile_id,input_actor_auth_user_id,input_relationship_type,input_relationship_id);
  return query
    select bundle.* from public.food_demo_bundles bundle
    where bundle.relationship_type = input_relationship_type and bundle.relationship_id = input_relationship_id
    order by bundle.updated_at desc limit 100;
end
$$;

create function public.food_demo_bundle_upsert_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_relationship_type text,
  input_relationship_id uuid,
  input_factory_project_id uuid,
  input_display_name text,
  input_blueprint_key text
) returns public.food_demo_bundles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  saved public.food_demo_bundles%rowtype;
  recipient text;
  was_created boolean;
begin
  perform public.food_demo_bundle_assert_scope_v1(input_actor_profile_id,input_actor_auth_user_id,input_relationship_type,input_relationship_id);
  if input_blueprint_key <> 'silverado-food-v1' or char_length(btrim(input_display_name)) not between 2 and 160
     or input_display_name ~ '[<>]' or input_display_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Invalid Food Demo Bundle blueprint or display name.';
  end if;
  if input_factory_project_id is not null and not exists (
    select 1 from public.factory_projects project
    where project.id = input_factory_project_id and project.relationship_type = input_relationship_type
      and project.relationship_id = input_relationship_id and project.factory_type = 'food'
  ) then
    raise exception using errcode = '23514', message = 'Food Demo Bundle Factory project scope mismatch.';
  end if;
  if input_relationship_type = 'lead' then select lower(email) into recipient from public.leads where id = input_relationship_id;
  else select lower(email) into recipient from public.customers where id = input_relationship_id; end if;
  if recipient !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then recipient := null; end if;
  was_created := not exists (
    select 1 from public.food_demo_bundles bundle
    where bundle.relationship_type=input_relationship_type and bundle.relationship_id=input_relationship_id
      and bundle.demo_type='food' and bundle.blueprint_key=input_blueprint_key
  );
  insert into public.food_demo_bundles(
    relationship_type,relationship_id,lead_id,customer_id,factory_project_id,demo_type,display_name,
    blueprint_key,blueprint_version,storefront_url,dashboard_url,dashboard_deeplink,qr_asset_url,
    invitation_status,recipient_email,created_by,metadata,updated_at
  ) values (
    input_relationship_type,input_relationship_id,
    case when input_relationship_type='lead' then input_relationship_id end,
    case when input_relationship_type='customer' then input_relationship_id end,
    input_factory_project_id,'food',btrim(input_display_name),input_blueprint_key,1,
    'https://max-webstudio-food-demo.netlify.app/food/silverado-roti-shop-emmeloord',
    'https://max-webstudio-food-demo.netlify.app/admin/food',
    'https://max-webstudio-food-demo.netlify.app/login.html?next=%2Fadmin%2Ffood',
    '/assets/food/silverado/silverado-demo-qr.svg','ready',recipient,input_actor_profile_id,
    '{"runtimeFrozen":true,"pickupOnly":true,"realPayment":false,"selfServiceAccountProven":false}'::jsonb,
    clock_timestamp()
  ) on conflict (relationship_type,relationship_id,demo_type,blueprint_key) do update set
    factory_project_id=excluded.factory_project_id,display_name=excluded.display_name,
    storefront_url=excluded.storefront_url,dashboard_url=excluded.dashboard_url,
    dashboard_deeplink=excluded.dashboard_deeplink,qr_asset_url=excluded.qr_asset_url,
    recipient_email=excluded.recipient_email,metadata=excluded.metadata,updated_at=clock_timestamp()
  returning * into saved;
  perform public.food_demo_bundle_append_event_v1(saved.id,case when was_created then 'bundle_created' else 'bundle_updated' end,null,input_actor_profile_id,jsonb_build_object('blueprintKey',input_blueprint_key));
  return saved;
end
$$;

create function public.food_demo_bundle_update_links_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_bundle_id uuid,
  input_storefront_status text,
  input_dashboard_status text,
  input_action_key text default null
) returns public.food_demo_bundles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.food_demo_bundles%rowtype;
begin
  select * into target from public.food_demo_bundles where id=input_bundle_id for update;
  if not found then raise exception using errcode='P0002',message='Food Demo Bundle not found.'; end if;
  perform public.food_demo_bundle_assert_scope_v1(input_actor_profile_id,input_actor_auth_user_id,target.relationship_type,target.relationship_id);
  if input_storefront_status not in ('reachable','unreachable') or input_dashboard_status not in ('reachable','unreachable') then
    raise exception using errcode='22023',message='Invalid Food Demo Bundle link status.';
  end if;
  update public.food_demo_bundles set storefront_status=input_storefront_status,dashboard_status=input_dashboard_status,updated_at=clock_timestamp()
  where id=input_bundle_id returning * into target;
  perform public.food_demo_bundle_append_event_v1(target.id,'links_checked',nullif(input_action_key,''),input_actor_profile_id,jsonb_build_object('storefrontReachable',input_storefront_status='reachable','dashboardReachable',input_dashboard_status='reachable'));
  return target;
end
$$;

create function public.food_demo_bundle_reserve_dispatch_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_bundle_id uuid,
  input_action_type text,
  input_action_key text,
  input_recipient_kind text,
  input_max_attempts integer
) returns table(duplicate boolean,id uuid,bundle_id uuid,action_type text,action_key text,recipient_kind text,status text,provider_message_id text,error_code text,requested_by uuid,created_at timestamptz,completed_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.food_demo_bundles%rowtype;
  dispatch public.food_demo_bundle_dispatches%rowtype;
begin
  select * into target from public.food_demo_bundles where food_demo_bundles.id=input_bundle_id;
  if not found then raise exception using errcode='P0002',message='Food Demo Bundle not found.'; end if;
  perform public.food_demo_bundle_assert_scope_v1(input_actor_profile_id,input_actor_auth_user_id,target.relationship_type,target.relationship_id);
  if input_action_type not in ('test','send','resend') or char_length(input_action_key) not between 16 and 160
     or input_recipient_kind not in ('internal_test','relationship') or input_max_attempts not between 1 and 20 then
    raise exception using errcode='22023',message='Invalid Food Demo Bundle dispatch reservation.';
  end if;
  if not public.consume_food_demo_bundle_rate_limit(input_actor_profile_id,input_action_type,input_max_attempts) then
    raise exception using errcode='P0001',message='Food Demo Bundle dispatch rate limited.';
  end if;
  select * into dispatch from public.food_demo_bundle_dispatches existing
  where existing.bundle_id=input_bundle_id and existing.action_key=input_action_key;
  if found then
    return query select true,dispatch.id,dispatch.bundle_id,dispatch.action_type,dispatch.action_key,dispatch.recipient_kind,dispatch.status,dispatch.provider_message_id,dispatch.error_code,dispatch.requested_by,dispatch.created_at,dispatch.completed_at;
    return;
  end if;
  insert into public.food_demo_bundle_dispatches(bundle_id,action_type,action_key,recipient_kind,requested_by)
  values(input_bundle_id,input_action_type,input_action_key,input_recipient_kind,input_actor_profile_id)
  returning * into dispatch;
  return query select false,dispatch.id,dispatch.bundle_id,dispatch.action_type,dispatch.action_key,dispatch.recipient_kind,dispatch.status,dispatch.provider_message_id,dispatch.error_code,dispatch.requested_by,dispatch.created_at,dispatch.completed_at;
end
$$;

create function public.food_demo_bundle_complete_dispatch_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_bundle_id uuid,
  input_dispatch_id uuid,
  input_action_type text,
  input_action_key text,
  input_sent boolean,
  input_provider_message_id text,
  input_error_code text
) returns public.food_demo_bundles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.food_demo_bundles%rowtype;
  dispatch public.food_demo_bundle_dispatches%rowtype;
begin
  select * into target from public.food_demo_bundles where id=input_bundle_id for update;
  if not found then raise exception using errcode='P0002',message='Food Demo Bundle not found.'; end if;
  perform public.food_demo_bundle_assert_scope_v1(input_actor_profile_id,input_actor_auth_user_id,target.relationship_type,target.relationship_id);
  select * into dispatch from public.food_demo_bundle_dispatches existing
  where existing.id=input_dispatch_id and existing.bundle_id=input_bundle_id
    and existing.action_type=input_action_type and existing.action_key=input_action_key for update;
  if not found then raise exception using errcode='23514',message='Food Demo Bundle dispatch scope mismatch.'; end if;
  if dispatch.status='reserved' then
    update public.food_demo_bundle_dispatches set status=case when input_sent then 'sent' else 'failed' end,
      provider_message_id=case when input_sent then nullif(left(input_provider_message_id,500),'') end,
      error_code=case when input_sent then null else coalesce(nullif(left(input_error_code,120),''),'provider_send_failed') end,
      completed_at=clock_timestamp() where id=dispatch.id;
  elsif dispatch.status is distinct from (case when input_sent then 'sent' else 'failed' end) then
    raise exception using errcode='55000',message='Food Demo Bundle dispatch transition denied.';
  end if;
  update public.food_demo_bundles set invitation_status=case when input_sent then 'sent' else 'send_failed' end,
    last_sent_at=case when input_sent then clock_timestamp() else last_sent_at end,
    revoked_at=case when input_sent then null else revoked_at end,updated_at=clock_timestamp()
  where id=input_bundle_id returning * into target;
  perform public.food_demo_bundle_append_event_v1(target.id,input_action_type || case when input_sent then '_sent' else '_failed' end,input_action_key,input_actor_profile_id,jsonb_build_object('recipientKind',dispatch.recipient_kind,'errorCode',case when input_sent then null else coalesce(nullif(left(input_error_code,120),''),'provider_send_failed') end));
  return target;
end
$$;

create function public.food_demo_bundle_revoke_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_bundle_id uuid,
  input_action_key text
) returns public.food_demo_bundles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.food_demo_bundles%rowtype;
begin
  if char_length(input_action_key) not between 16 and 160 then raise exception using errcode='22023',message='Invalid Food Demo Bundle revoke key.'; end if;
  select * into target from public.food_demo_bundles where id=input_bundle_id for update;
  if not found then raise exception using errcode='P0002',message='Food Demo Bundle not found.'; end if;
  perform public.food_demo_bundle_assert_scope_v1(input_actor_profile_id,input_actor_auth_user_id,target.relationship_type,target.relationship_id);
  update public.food_demo_bundles set invitation_status='revoked',revoked_at=coalesce(revoked_at,clock_timestamp()),updated_at=clock_timestamp()
  where id=input_bundle_id returning * into target;
  perform public.food_demo_bundle_append_event_v1(target.id,'invitation_revoked',input_action_key,input_actor_profile_id,'{}'::jsonb);
  return target;
end
$$;

revoke all privileges on table
  public.food_demo_bundles,
  public.food_demo_bundle_dispatches,
  public.food_demo_bundle_events,
  public.food_demo_bundle_rate_limits
from public, anon, authenticated, service_role;

revoke all on function
  public.food_demo_bundle_assert_scope_v1(uuid,uuid,text,uuid),
  public.food_demo_bundle_append_event_v1(uuid,text,text,uuid,jsonb),
  public.food_demo_bundle_read_v1(uuid,uuid,text,uuid,uuid),
  public.food_demo_bundle_upsert_v1(uuid,uuid,text,uuid,uuid,text,text),
  public.food_demo_bundle_update_links_v1(uuid,uuid,uuid,text,text,text),
  public.food_demo_bundle_reserve_dispatch_v1(uuid,uuid,uuid,text,text,text,integer),
  public.food_demo_bundle_complete_dispatch_v1(uuid,uuid,uuid,uuid,text,text,boolean,text,text),
  public.food_demo_bundle_revoke_v1(uuid,uuid,uuid,text),
  public.consume_food_demo_bundle_rate_limit(uuid,text,integer),
  public.food_demo_bundle_events_append_only()
from public, anon, authenticated, service_role;

grant execute on function public.food_demo_bundle_read_v1(uuid,uuid,text,uuid,uuid) to service_role;
grant execute on function public.food_demo_bundle_upsert_v1(uuid,uuid,text,uuid,uuid,text,text) to service_role;
grant execute on function public.food_demo_bundle_update_links_v1(uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.food_demo_bundle_reserve_dispatch_v1(uuid,uuid,uuid,text,text,text,integer) to service_role;
grant execute on function public.food_demo_bundle_complete_dispatch_v1(uuid,uuid,uuid,uuid,text,text,boolean,text,text) to service_role;
grant execute on function public.food_demo_bundle_revoke_v1(uuid,uuid,uuid,text) to service_role;

do $postcheck$
declare
  target_table regclass;
  target_function regprocedure;
  forbidden_privilege text;
  function_config text[];
  is_security_definer boolean;
begin
  foreach target_table in array array[
    'public.food_demo_bundles'::regclass,'public.food_demo_bundle_dispatches'::regclass,
    'public.food_demo_bundle_events'::regclass,'public.food_demo_bundle_rate_limits'::regclass
  ] loop
    foreach forbidden_privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if pg_catalog.has_table_privilege('service_role',target_table,forbidden_privilege) then
        raise exception using errcode='55000',message='service_role still has direct ' || forbidden_privilege || ' on ' || target_table::text || '.';
      end if;
    end loop;
  end loop;
  foreach target_function in array array[
    'public.food_demo_bundle_read_v1(uuid,uuid,text,uuid,uuid)'::regprocedure,
    'public.food_demo_bundle_upsert_v1(uuid,uuid,text,uuid,uuid,text,text)'::regprocedure,
    'public.food_demo_bundle_update_links_v1(uuid,uuid,uuid,text,text,text)'::regprocedure,
    'public.food_demo_bundle_reserve_dispatch_v1(uuid,uuid,uuid,text,text,text,integer)'::regprocedure,
    'public.food_demo_bundle_complete_dispatch_v1(uuid,uuid,uuid,uuid,text,text,boolean,text,text)'::regprocedure,
    'public.food_demo_bundle_revoke_v1(uuid,uuid,uuid,text)'::regprocedure
  ] loop
    select proconfig,prosecdef into function_config,is_security_definer from pg_catalog.pg_proc where oid=target_function;
    if not is_security_definer or not coalesce(function_config,array[]::text[]) @> array['search_path=pg_catalog, public']::text[]
       or not pg_catalog.has_function_privilege('service_role',target_function,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',target_function,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',target_function,'EXECUTE') then
      raise exception using errcode='55000',message='Food Demo Bundle RPC ACL or SECURITY DEFINER contract invalid: ' || target_function::text;
    end if;
  end loop;
end
$postcheck$;

comment on function public.food_demo_bundle_read_v1(uuid,uuid,text,uuid,uuid) is 'Bounded relationship-scoped Food Demo Bundle read/list RPC.';
comment on function public.food_demo_bundle_upsert_v1(uuid,uuid,text,uuid,uuid,text,text) is 'Bounded Food Demo Bundle create/update RPC with server-owned blueprint values.';
comment on function public.food_demo_bundle_reserve_dispatch_v1(uuid,uuid,uuid,text,text,text,integer) is 'Atomic rate-limited and idempotent dispatch reservation.';
comment on function public.food_demo_bundle_complete_dispatch_v1(uuid,uuid,uuid,uuid,text,text,boolean,text,text) is 'Atomic dispatch completion, bundle status and append-only audit update.';

commit;
