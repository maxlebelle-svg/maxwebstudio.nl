-- Factory Production Gate v1. Additive, forward-only and fail-closed.
-- Pending staging candidate: prior applied migrations remain immutable.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $preflight$
begin
  if pg_catalog.to_regclass('public.factory_projects') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.customers') is null then
    raise exception using errcode = '55000', message = 'Factory Production Gate requires Factory Hub, profiles and customers.';
  end if;
end
$preflight$;

create table public.factory_gate_checks (
  id uuid primary key default gen_random_uuid(),
  factory_project_id uuid not null references public.factory_projects(id) on delete cascade,
  check_key text not null check (check_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  group_key text not null check (group_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  required boolean not null default true,
  status text not null check (status in ('not_configured','missing','passed','failed','expired')),
  source text not null check (source in ('food_demo_bundle','food_runtime_catalog','food_access_context','food_storefront_probe','domain_center','commerce','legal_registry','internal_attestation','customer_approval_registry','factory_context')),
  source_version text not null check (char_length(source_version) between 1 and 40),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  evidence jsonb not null default '{}'::jsonb check (
    jsonb_typeof(evidence) = 'object'
    and (status <> 'passed' or (
      char_length(btrim(coalesce(evidence->>'summary',''))) between 1 and 300
      and char_length(btrim(coalesce(evidence->>'artifactRef',''))) between 1 and 500
      and char_length(btrim(coalesce(evidence->>'observedAt',''))) between 1 and 80
    ))
  ),
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  blocking_error text,
  checked_by uuid references public.profiles(id) on delete set null,
  checked_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index factory_gate_checks_project_latest_idx on public.factory_gate_checks(factory_project_id, check_key, checked_at desc, id desc);

create table public.factory_gate_overrides (
  id uuid primary key default gen_random_uuid(),
  factory_project_id uuid not null references public.factory_projects(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  open_risks jsonb not null check (jsonb_typeof(open_risks) = 'array' and jsonb_array_length(open_risks) > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  revoke_reason text
);
create unique index factory_gate_one_active_override_idx on public.factory_gate_overrides(factory_project_id) where status = 'active';

create table public.factory_gate_attestations (
  id uuid primary key default gen_random_uuid(),
  factory_project_id uuid not null references public.factory_projects(id) on delete cascade,
  attestation_type text not null check (attestation_type = 'internal_approval'),
  status text not null default 'active' check (status = 'active'),
  statement_version text not null check (statement_version = 'factory_internal_approval_nl_v1'),
  statement_hash text not null check (statement_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);
create unique index factory_gate_one_internal_attestation_idx on public.factory_gate_attestations(factory_project_id, attestation_type) where status = 'active';

create table public.factory_customer_approvals (
  id uuid primary key default gen_random_uuid(),
  factory_project_id uuid not null references public.factory_projects(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'active' check (status = 'active'),
  statement_version text not null check (statement_version = 'factory_customer_approval_nl_v1'),
  statement_hash text not null check (statement_hash ~ '^[0-9a-f]{64}$'),
  approved_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  approved_at timestamptz not null default clock_timestamp()
);
create unique index factory_customer_approval_once_idx on public.factory_customer_approvals(factory_project_id) where status = 'active';

create table public.factory_gate_events (
  id uuid primary key default gen_random_uuid(),
  factory_project_id uuid not null references public.factory_projects(id) on delete restrict,
  event_type text not null check (event_type in ('check_reported','check_expired','preflight_requested','preflight_passed','preflight_blocked','attestation_created','override_created','override_revoked','live_authorized','live_attempt_blocked')),
  check_key text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  request_id text not null check (char_length(request_id) between 8 and 120),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);
create index factory_gate_events_project_created_idx on public.factory_gate_events(factory_project_id, created_at desc);

create function public.factory_gate_append_only() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception using errcode = '55000', message = 'Factory Production Gate evidence and audit are append-only.';
end
$$;

create trigger factory_gate_checks_no_update before update or delete on public.factory_gate_checks
for each row execute function public.factory_gate_append_only();
create trigger factory_gate_attestations_no_update before update or delete on public.factory_gate_attestations
for each row execute function public.factory_gate_append_only();
create trigger factory_customer_approvals_no_update before update or delete on public.factory_customer_approvals
for each row execute function public.factory_gate_append_only();
create trigger factory_gate_events_no_update before update or delete on public.factory_gate_events
for each row execute function public.factory_gate_append_only();

create function public.factory_gate_overrides_guard() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles where id=new.created_by and role='super_admin' and status='active') then
      raise exception using errcode = '42501', message = 'Only an active superadmin can create a Factory gate override.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then raise exception using errcode = '55000', message = 'Factory gate overrides cannot be deleted.'; end if;
  if old.status <> 'active' or new.status not in ('revoked','expired')
     or (to_jsonb(new) - array['status','revoked_by','revoked_at','revoke_reason'])
        is distinct from (to_jsonb(old) - array['status','revoked_by','revoked_at','revoke_reason']) then
    raise exception using errcode = '55000', message = 'Factory gate override transition denied.';
  end if;
  return new;
end
$$;
create trigger factory_gate_overrides_guard before insert or update or delete on public.factory_gate_overrides
for each row execute function public.factory_gate_overrides_guard();

create function public.factory_projects_block_ungated_live() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.status = 'live' and old.status is distinct from 'live'
     and current_setting('app.factory_gate_authorized_project', true) is distinct from new.id::text then
    raise exception using errcode = '42501', message = 'Factory project live transition requires Production Gate authorization.';
  end if;
  return new;
end
$$;
create trigger factory_projects_require_production_gate before update of status on public.factory_projects
for each row execute function public.factory_projects_block_ungated_live();

create function public.factory_record_customer_approval_v1(
  input_project_id uuid,
  input_statement_version text,
  input_statement_hash text
) returns public.factory_customer_approvals
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  actor_profile uuid;
  target public.factory_projects%rowtype;
  saved public.factory_customer_approvals%rowtype;
begin
  if auth.uid() is null or input_statement_version <> 'factory_customer_approval_nl_v1'
     or input_statement_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid Factory customer approval.';
  end if;
  select id into actor_profile from public.profiles where auth_user_id = auth.uid() and role = 'customer' and status = 'active';
  if actor_profile is null then raise exception using errcode = '42501', message = 'Active customer profile required.'; end if;
  select * into target from public.factory_projects where id = input_project_id and relationship_type = 'customer';
  if not found or not exists (
    select 1 from public.customers customer
    where customer.id = target.relationship_id and (customer.profile_id = actor_profile or customer.auth_user_id = auth.uid())
  ) then raise exception using errcode = '42501', message = 'Factory customer approval scope denied.'; end if;
  insert into public.factory_customer_approvals(factory_project_id,customer_id,statement_version,statement_hash,approved_by_profile_id)
  values(target.id,target.relationship_id,input_statement_version,input_statement_hash,actor_profile)
  on conflict (factory_project_id) where status = 'active' do nothing;
  select * into saved from public.factory_customer_approvals where factory_project_id=target.id and status='active';
  return saved;
end
$$;

create function public.factory_authorize_live_v1(
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
  latest_count integer;
  blocking_count integer;
  active_override uuid;
  release_mode text;
begin
  if input_project_id is null or input_actor_profile_id is null or char_length(input_request_id) not between 8 and 120
     or input_expected_project_updated_at is null then
    raise exception using errcode = '22023', message = 'Invalid Production Gate authorization input.';
  end if;
  select role into actor_role from public.profiles
  where id = input_actor_profile_id and role in ('super_admin','admin') and status = 'active';
  if actor_role is null then raise exception using errcode = '42501', message = 'Active admin authorization required.'; end if;
  select * into target from public.factory_projects where id = input_project_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Factory project not found.'; end if;
  if target.updated_at is distinct from input_expected_project_updated_at then
    insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
    values(target.id,'live_attempt_blocked',input_actor_profile_id,input_request_id,'{"reason":"project_changed_after_preflight"}'::jsonb);
    return jsonb_build_object('authorized',false,'reason','project_changed_after_preflight');
  end if;
  expected_count := case when target.factory_type = 'food' then 15 else 5 end;
  with latest as (
    select distinct on (check_key) check_key,status,expires_at
    from public.factory_gate_checks where factory_project_id=target.id and required
    order by check_key,checked_at desc,id desc
  )
  select count(*),count(*) filter(where status <> 'passed' or expires_at is not null and expires_at <= clock_timestamp())
  into latest_count,blocking_count from latest;
  select id into active_override from public.factory_gate_overrides
  where factory_project_id=target.id and status='active' and (expires_at is null or expires_at>clock_timestamp())
  order by created_at desc limit 1;
  if active_override is not null and actor_role <> 'super_admin' then
    insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
    values(target.id,'live_attempt_blocked',input_actor_profile_id,input_request_id,'{"reason":"superadmin_required_for_override"}'::jsonb);
    return jsonb_build_object('authorized',false,'reason','superadmin_required_for_override');
  end if;
  if active_override is null and (latest_count <> expected_count or blocking_count <> 0) then
    insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
    values(target.id,'live_attempt_blocked',input_actor_profile_id,input_request_id,jsonb_build_object('reason','required_checks_blocking','expected',expected_count,'observed',latest_count,'blocking',blocking_count));
    return jsonb_build_object('authorized',false,'reason','required_checks_blocking','blocking',blocking_count);
  end if;
  release_mode := case when active_override is null then 'standard' else 'override' end;
  perform set_config('app.factory_gate_authorized_project',target.id::text,true);
  update public.factory_projects set status='live',updated_at=clock_timestamp() where id=target.id returning * into target;
  insert into public.factory_gate_events(factory_project_id,event_type,actor_profile_id,request_id,details)
  values(target.id,'live_authorized',input_actor_profile_id,input_request_id,jsonb_build_object('releaseMode',release_mode,'overrideId',active_override));
  return jsonb_build_object('authorized',true,'releaseMode',release_mode,'project',to_jsonb(target));
end
$$;

alter table public.factory_gate_checks enable row level security;
alter table public.factory_gate_overrides enable row level security;
alter table public.factory_gate_attestations enable row level security;
alter table public.factory_customer_approvals enable row level security;
alter table public.factory_gate_events enable row level security;
alter table public.factory_gate_checks force row level security;
alter table public.factory_gate_overrides force row level security;
alter table public.factory_gate_attestations force row level security;
alter table public.factory_customer_approvals force row level security;
alter table public.factory_gate_events force row level security;

revoke all on public.factory_gate_checks,public.factory_gate_overrides,public.factory_gate_attestations,public.factory_customer_approvals,public.factory_gate_events from public,anon,authenticated,service_role;
grant select,insert on public.factory_gate_checks,public.factory_gate_attestations,public.factory_customer_approvals,public.factory_gate_events to service_role;
grant select,insert,update on public.factory_gate_overrides to service_role;

revoke all on function public.factory_gate_append_only(),public.factory_gate_overrides_guard(),public.factory_projects_block_ungated_live(),public.factory_record_customer_approval_v1(uuid,text,text),public.factory_authorize_live_v1(uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.factory_record_customer_approval_v1(uuid,text,text) to authenticated;
grant execute on function public.factory_authorize_live_v1(uuid,uuid,text,timestamptz) to service_role;

do $postcheck$
begin
  if pg_catalog.has_function_privilege('anon','public.factory_authorize_live_v1(uuid,uuid,text,timestamptz)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.factory_authorize_live_v1(uuid,uuid,text,timestamptz)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.factory_authorize_live_v1(uuid,uuid,text,timestamptz)','EXECUTE') then
    raise exception using errcode='55000',message='Factory live authorization ACL is invalid.';
  end if;
end
$postcheck$;

comment on table public.factory_gate_checks is 'Append-only results produced only by named server-side Production Gate suppliers.';
comment on table public.factory_gate_overrides is 'Visible superadmin exceptions; an exception never changes check results.';
comment on table public.factory_gate_events is 'Append-only audit trail for checks, preflights, exceptions and live authorization.';
comment on table public.factory_customer_approvals is 'Canonical immutable customer approval bound to one Factory dossier.';

commit;
