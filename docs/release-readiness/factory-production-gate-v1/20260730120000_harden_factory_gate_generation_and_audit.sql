-- Factory Production Gate v1 P0 hardening. Forward-only; historical evidence remains immutable.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $preflight$
begin
  if pg_catalog.to_regclass('public.factory_projects') is null
     or pg_catalog.to_regclass('public.factory_gate_checks') is null
     or pg_catalog.to_regclass('public.factory_gate_events') is null then
    raise exception using errcode='55000', message='Factory Gate generation hardening requires the applied Production Gate.';
  end if;
end
$preflight$;

alter table public.factory_projects
  add column gate_generation bigint not null default 0 check (gate_generation >= 0),
  add column gate_generation_id uuid,
  add column gate_generation_started_at timestamptz;

alter table public.factory_gate_checks
  add column project_generation bigint,
  add column project_generation_id uuid,
  add column project_generation_fingerprint text
    check (project_generation_fingerprint is null or project_generation_fingerprint ~ '^[0-9a-f]{64}$');

create unique index factory_gate_checks_generation_key_idx
  on public.factory_gate_checks(factory_project_id, project_generation_id, check_key)
  where project_generation_id is not null;

create unique index factory_gate_live_authorized_request_idx
  on public.factory_gate_events(factory_project_id, request_id)
  where event_type = 'live_authorized';

create function public.factory_gate_invalidate_project_generation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.gate_generation := old.gate_generation + 1;
  new.gate_generation_id := null;
  new.gate_generation_started_at := null;
  return new;
end
$$;

create trigger factory_projects_invalidate_gate_generation
before update of relationship_type,relationship_id,factory_type,blueprint_key,blueprint_version,name,configuration
on public.factory_projects
for each row when (
  old.relationship_type is distinct from new.relationship_type
  or old.relationship_id is distinct from new.relationship_id
  or old.factory_type is distinct from new.factory_type
  or old.blueprint_key is distinct from new.blueprint_key
  or old.blueprint_version is distinct from new.blueprint_version
  or old.name is distinct from new.name
  or old.configuration is distinct from new.configuration
)
execute function public.factory_gate_invalidate_project_generation();

create function public.factory_gate_invalidate_dependent_generation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  project_id uuid;
begin
  project_id := case
    when tg_op='DELETE' then old.factory_project_id
    else new.factory_project_id
  end;
  if project_id is not null then
    update public.factory_projects
    set gate_generation=gate_generation+1,
        gate_generation_id=null,
        gate_generation_started_at=null
    where id=project_id;
  end if;
  return case when tg_op='DELETE' then old else new end;
end
$$;

create trigger factory_gate_attestations_invalidate_generation
after insert on public.factory_gate_attestations
for each row execute function public.factory_gate_invalidate_dependent_generation();
create trigger factory_customer_approvals_invalidate_generation
after insert on public.factory_customer_approvals
for each row execute function public.factory_gate_invalidate_dependent_generation();
do $dependent_trigger$
begin
  if pg_catalog.to_regclass('public.food_demo_bundles') is not null then
    execute 'create trigger food_demo_bundles_invalidate_gate_generation '
      || 'after insert or update or delete on public.food_demo_bundles '
      || 'for each row execute function public.factory_gate_invalidate_dependent_generation()';
  end if;
end
$dependent_trigger$;

create function public.factory_gate_validate_event_v2()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  project_generation bigint;
begin
  select gate_generation into project_generation
  from public.factory_projects where id = new.factory_project_id;
  if not found then
    raise exception using errcode='23503', message='Factory Gate audit project context is missing.';
  end if;

  new.details := new.details || jsonb_build_object(
    'projectId', new.factory_project_id,
    'projectGeneration', project_generation
  );

  if new.event_type not in ('check_reported','check_expired','preflight_requested') then
    if new.actor_profile_id is null
       or char_length(btrim(coalesce(new.details->>'reason',''))) not between 3 and 200
       or char_length(btrim(coalesce(new.details->>'previousStatus',''))) not between 1 and 80
       or char_length(btrim(coalesce(new.details->>'newStatus',''))) not between 1 and 80 then
      raise exception using errcode='23514', message='Factory Gate transition audit requires actor, reason, previousStatus and newStatus.';
    end if;
  end if;
  return new;
end
$$;

create trigger factory_gate_events_validate_v2
before insert on public.factory_gate_events
for each row execute function public.factory_gate_validate_event_v2();

create function public.factory_begin_gate_generation_v1(
  input_project_id uuid,
  input_actor_profile_id uuid,
  input_request_id text,
  input_authorize_live boolean default false
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  target public.factory_projects%rowtype;
  generation_id uuid := gen_random_uuid();
begin
  if input_project_id is null or input_actor_profile_id is null
     or char_length(input_request_id) not between 8 and 120 then
    raise exception using errcode='22023', message='Invalid Factory Gate generation input.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id=input_actor_profile_id and role in ('super_admin','admin') and status='active'
  ) then
    raise exception using errcode='42501', message='Active admin generation authorization required.';
  end if;

  select * into target from public.factory_projects where id=input_project_id for update;
  if not found then raise exception using errcode='P0002', message='Factory project not found.'; end if;
  if target.status = 'live' then
    return jsonb_build_object('started',false,'reason','already_live','projectGeneration',target.gate_generation);
  end if;

  update public.factory_projects
  set gate_generation=gate_generation+1,
      gate_generation_id=generation_id,
      gate_generation_started_at=clock_timestamp()
  where id=target.id
  returning * into target;

  insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
  values(target.id,'preflight_requested',input_actor_profile_id,input_request_id,
    jsonb_build_object('authorizeLive',coalesce(input_authorize_live,false),'generationId',generation_id));

  return jsonb_build_object(
    'started',true,
    'generationId',generation_id,
    'projectGeneration',target.gate_generation,
    'projectUpdatedAt',target.updated_at
  );
end
$$;

create function public.factory_store_gate_checks_v1(
  input_project_id uuid,
  input_actor_profile_id uuid,
  input_request_id text,
  input_generation_id uuid,
  input_checks jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  target public.factory_projects%rowtype;
  expected_count integer;
  item jsonb;
  key_name text;
  source_name text;
  group_name text;
  binding_fingerprint text;
  checked_time timestamptz := clock_timestamp();
  inserted_count integer := 0;
begin
  if input_project_id is null or input_actor_profile_id is null or input_generation_id is null
     or char_length(input_request_id) not between 8 and 120
     or jsonb_typeof(input_checks) <> 'array' then
    raise exception using errcode='22023', message='Invalid Factory Gate check batch.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id=input_actor_profile_id and role in ('super_admin','admin') and status='active'
  ) then
    raise exception using errcode='42501', message='Active admin check storage required.';
  end if;

  select * into target from public.factory_projects where id=input_project_id for update;
  if not found then raise exception using errcode='P0002', message='Factory project not found.'; end if;
  if target.gate_generation_id is distinct from input_generation_id then
    raise exception using errcode='55000', message='Factory Gate generation is stale.';
  end if;

  expected_count := case when target.factory_type='food' then 15 else 5 end;
  if jsonb_array_length(input_checks) <> expected_count
     or (select count(distinct value->>'check_key') from jsonb_array_elements(input_checks)) <> expected_count then
    raise exception using errcode='23514', message='Factory Gate check batch is incomplete or duplicated.';
  end if;

  binding_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    target.id::text || ':' || target.gate_generation::text || ':' || target.gate_generation_id::text,
    'UTF8'
  ),'sha256'),'hex');

  for item in select value from jsonb_array_elements(input_checks)
  loop
    if item ?| array['id','factory_project_id','project_generation','project_generation_id','project_generation_fingerprint','checked_at','expires_at','created_at'] then
      raise exception using errcode='22023', message='Caller-controlled Factory Gate binding or timestamp is forbidden.';
    end if;
    key_name := item->>'check_key';
    source_name := item->>'source';
    group_name := item->>'group_key';

    if not (
      (target.factory_type='food' and (key_name,group_name,source_name) in (
        ('restaurant_tenant','food_foundation','food_demo_bundle'),('menu_opening_hours','food_foundation','food_runtime_catalog'),
        ('manager_tenant_isolation','access','food_access_context'),('order_route','experience','food_demo_bundle'),
        ('dashboard_view','experience','food_demo_bundle'),('mobile_validation','experience','food_storefront_probe'),
        ('domain_mapping','domain','domain_center'),('dns_verified','domain','domain_center'),('ssl_active','domain','domain_center'),
        ('business_email_preserved','domain','domain_center'),('mollie_connected','commerce','commerce'),
        ('legal_set','legal','legal_registry'),('internal_approval','approval','internal_attestation'),
        ('customer_approval','approval','customer_approval_registry'),('environment_mode','release','factory_context')
      ))
      or (target.factory_type<>'food' and (key_name,group_name,source_name) in (
        ('product_ready','production','factory_context'),('domain_mapping','domain','domain_center'),
        ('ssl_active','domain','domain_center'),('internal_approval','approval','internal_attestation'),
        ('customer_approval','approval','customer_approval_registry')
      ))
    ) then
      raise exception using errcode='23514', message='Factory Gate supplier mapping is invalid.';
    end if;

    insert into public.factory_gate_checks(
      factory_project_id,check_key,group_key,required,status,source,source_version,input_fingerprint,
      evidence,evidence_hash,blocking_error,checked_by,checked_at,expires_at,
      project_generation,project_generation_id,project_generation_fingerprint
    ) values (
      target.id,key_name,group_name,true,item->>'status',source_name,item->>'source_version',item->>'input_fingerprint',
      coalesce(item->'evidence','{}'::jsonb),item->>'evidence_hash',nullif(item->>'blocking_error',''),input_actor_profile_id,
      checked_time,
      case when item->>'status' <> 'passed' then null
        when key_name in ('internal_approval','customer_approval') then null
        when key_name in ('menu_opening_hours','manager_tenant_isolation') then checked_time + interval '4 hours'
        when key_name in ('restaurant_tenant','mobile_validation','business_email_preserved','legal_set','environment_mode','product_ready') then checked_time + interval '24 hours'
        else checked_time + interval '1 hour' end,
      target.gate_generation,target.gate_generation_id,binding_fingerprint
    );
    inserted_count := inserted_count + 1;

    insert into public.factory_gate_events(factory_project_id,event_type,check_key,actor_profile_id,request_id,details)
    values(target.id,'check_reported',key_name,input_actor_profile_id,input_request_id,
      jsonb_build_object('checkKey',key_name,'provider',source_name,'status',item->>'status','evidenceHash',item->>'evidence_hash','generationId',target.gate_generation_id));
  end loop;

  return jsonb_build_object('stored',true,'count',inserted_count,'generationId',target.gate_generation_id,'projectGeneration',target.gate_generation);
end
$$;

create or replace function public.factory_authorize_live_v1(
  input_project_id uuid,
  input_actor_profile_id uuid,
  input_request_id text,
  input_expected_project_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  target public.factory_projects%rowtype;
  actor_role text;
  expected_count integer;
  bound_count integer;
  blocking_count integer;
  invalid_binding_count integer;
  active_override uuid;
  release_mode text;
  binding_fingerprint text;
  previous_status text;
begin
  if input_project_id is null or input_actor_profile_id is null or char_length(input_request_id) not between 8 and 120
     or input_expected_project_updated_at is null then
    raise exception using errcode='22023', message='Invalid Production Gate authorization input.';
  end if;
  select role into actor_role from public.profiles
  where id=input_actor_profile_id and role in ('super_admin','admin') and status='active';
  if actor_role is null then raise exception using errcode='42501', message='Active admin authorization required.'; end if;

  select * into target from public.factory_projects where id=input_project_id for update;
  if not found then raise exception using errcode='P0002', message='Factory project not found.'; end if;
  if target.status='live' then
    return jsonb_build_object('authorized',true,'idempotent',true,'releaseMode','already_live','project',to_jsonb(target));
  end if;

  if target.updated_at is distinct from input_expected_project_updated_at then
    insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
    values(target.id,'live_attempt_blocked',input_actor_profile_id,input_request_id,
      jsonb_build_object('reason','project_changed_after_preflight','previousStatus',target.status,'newStatus','blocked'));
    return jsonb_build_object('authorized',false,'reason','project_changed_after_preflight');
  end if;

  expected_count := case when target.factory_type='food' then 15 else 5 end;
  binding_fingerprint := case when target.gate_generation_id is null then null else pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    target.id::text || ':' || target.gate_generation::text || ':' || target.gate_generation_id::text,
    'UTF8'
  ),'sha256'),'hex') end;

  select count(*),
         count(*) filter(where status <> 'passed' or expires_at is not null and expires_at <= clock_timestamp()),
         count(*) filter(where project_generation <> target.gate_generation
           or project_generation_id is distinct from target.gate_generation_id
           or project_generation_fingerprint is distinct from binding_fingerprint)
  into bound_count,blocking_count,invalid_binding_count
  from public.factory_gate_checks
  where factory_project_id=target.id and required and project_generation_id=target.gate_generation_id;

  if target.gate_generation_id is null or bound_count <> expected_count or invalid_binding_count <> 0 then
    insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
    values(target.id,'live_attempt_blocked',input_actor_profile_id,input_request_id,
      jsonb_build_object('reason','stale_or_unbound_gate_evidence','previousStatus',target.status,'newStatus','blocked',
        'expected',expected_count,'observed',bound_count,'invalidBindings',invalid_binding_count));
    return jsonb_build_object('authorized',false,'reason','stale_or_unbound_gate_evidence');
  end if;

  select id into active_override from public.factory_gate_overrides
  where factory_project_id=target.id and status='active' and (expires_at is null or expires_at>clock_timestamp())
  order by created_at desc limit 1;
  if active_override is not null and actor_role <> 'super_admin' then
    insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
    values(target.id,'live_attempt_blocked',input_actor_profile_id,input_request_id,
      jsonb_build_object('reason','superadmin_required_for_override','previousStatus',target.status,'newStatus','blocked'));
    return jsonb_build_object('authorized',false,'reason','superadmin_required_for_override');
  end if;
  if active_override is null and blocking_count <> 0 then
    insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
    values(target.id,'live_attempt_blocked',input_actor_profile_id,input_request_id,
      jsonb_build_object('reason','required_checks_blocking','previousStatus',target.status,'newStatus','blocked','blocking',blocking_count));
    return jsonb_build_object('authorized',false,'reason','required_checks_blocking','blocking',blocking_count);
  end if;

  previous_status := target.status;
  release_mode := case when active_override is null then 'standard' else 'override' end;
  perform set_config('app.factory_gate_authorized_project',target.id::text,true);
  update public.factory_projects set status='live',updated_at=clock_timestamp() where id=target.id returning * into target;
  insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
  values(target.id,'live_authorized',input_actor_profile_id,input_request_id,
    jsonb_build_object('reason',case when release_mode='standard' then 'all_required_checks_passed' else 'superadmin_override' end,
      'previousStatus',previous_status,'newStatus','live','releaseMode',release_mode,'overrideId',active_override));
  return jsonb_build_object('authorized',true,'releaseMode',release_mode,'project',to_jsonb(target));
end
$$;

revoke insert on public.factory_gate_checks from service_role;
revoke all on function public.factory_gate_invalidate_project_generation(),public.factory_gate_invalidate_dependent_generation(),public.factory_gate_validate_event_v2(),
  public.factory_begin_gate_generation_v1(uuid,uuid,text,boolean),public.factory_store_gate_checks_v1(uuid,uuid,text,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.factory_begin_gate_generation_v1(uuid,uuid,text,boolean),
  public.factory_store_gate_checks_v1(uuid,uuid,text,uuid,jsonb) to service_role;

do $postcheck$
begin
  if pg_catalog.has_function_privilege('authenticated','public.factory_begin_gate_generation_v1(uuid,uuid,text,boolean)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.factory_begin_gate_generation_v1(uuid,uuid,text,boolean)','EXECUTE')
     or pg_catalog.has_table_privilege('service_role','public.factory_gate_checks','INSERT') then
    raise exception using errcode='55000', message='Factory Gate generation ACL is invalid.';
  end if;
end
$postcheck$;

comment on column public.factory_projects.gate_generation is 'Monotone database-owned Production Gate evidence generation.';
comment on column public.factory_gate_checks.project_generation_fingerprint is 'Database-derived binding to the exact project generation; historical NULL rows fail closed.';

commit;
