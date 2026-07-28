-- Max Webstudio Food v1: isolated online-demo reset primitives.
-- This migration authorizes no remote execution and creates no demo data.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.food_orders') is null
     or pg_catalog.to_regclass('public.food_order_idempotency') is null
     or pg_catalog.to_regprocedure('public.food_assert_service_role()') is null
     or pg_catalog.to_regprocedure('public.food_has_capability(uuid,uuid,text)') is null then
    raise exception using errcode = '55000',
      message = 'Food online-demo reset requires the complete Food v1 foundation.';
  end if;
  if pg_catalog.to_regclass('public.food_demo_accounts') is not null then
    raise exception using errcode = '42P07',
      message = 'Food online-demo reset already exists; refusing an ambiguous replay.';
  end if;
end
$preflight$;

insert into public.food_capability_catalog(key, availability_status, description)
values ('demo.reset', 'available', 'Explicitly gated reset for an isolated Food demo tenant.')
on conflict (key) do update
set availability_status = excluded.availability_status,
    description = excluded.description,
    updated_at = pg_catalog.clock_timestamp();

create table public.food_demo_accounts (
  food_account_id uuid primary key references public.food_accounts(id) on delete restrict,
  location_id uuid not null unique references public.restaurant_locations(id) on delete restrict,
  storefront_slug text not null unique check (
    storefront_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(storefront_slug) between 3 and 100
  ),
  enabled boolean not null default false,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint food_demo_accounts_location_tenant_fk
    foreign key (food_account_id, location_id)
    references public.restaurant_locations(food_account_id, id) on delete restrict
);

create table public.food_demo_menu_item_baselines (
  food_account_id uuid not null,
  menu_item_id uuid not null,
  price_minor bigint not null check (price_minor between 0 and 100000000),
  available boolean not null,
  active boolean not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (food_account_id, menu_item_id),
  constraint food_demo_menu_item_baselines_item_tenant_fk
    foreign key (food_account_id, menu_item_id)
    references public.menu_items(food_account_id, id) on delete restrict
);

create table public.food_demo_reset_rate_limits (
  food_account_id uuid not null references public.food_demo_accounts(food_account_id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  window_started_at timestamptz not null default pg_catalog.clock_timestamp(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (food_account_id, actor_profile_id)
);

create table public.food_demo_reset_audit (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null references public.food_demo_accounts(food_account_id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_type text not null check (actor_type in ('platform_admin','demo_manager')),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint food_demo_reset_audit_idempotency_unique unique (food_account_id, idempotency_key)
);

create index food_demo_reset_audit_created_idx
  on public.food_demo_reset_audit(food_account_id, created_at desc);

alter table public.food_demo_accounts enable row level security;
alter table public.food_demo_accounts force row level security;
alter table public.food_demo_menu_item_baselines enable row level security;
alter table public.food_demo_menu_item_baselines force row level security;
alter table public.food_demo_reset_rate_limits enable row level security;
alter table public.food_demo_reset_rate_limits force row level security;
alter table public.food_demo_reset_audit enable row level security;
alter table public.food_demo_reset_audit force row level security;

revoke all on table public.food_demo_accounts, public.food_demo_menu_item_baselines,
  public.food_demo_reset_rate_limits, public.food_demo_reset_audit
  from public, anon, authenticated;
grant all on table public.food_demo_accounts, public.food_demo_menu_item_baselines,
  public.food_demo_reset_rate_limits, public.food_demo_reset_audit to service_role;

create function public.food_assert_demo_service_role()
returns void
language plpgsql
stable
set search_path = pg_catalog
as $function$
declare
  jwt_role text;
begin
  jwt_role := nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  if jwt_role is null then
    begin
      jwt_role := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    exception when others then
      jwt_role := null;
    end;
  end if;
  if jwt_role is distinct from 'service_role' then
    raise exception using errcode = '42501',
      message = 'Food demo reset requires an explicit service_role claim.';
  end if;
end
$function$;

create or replace function public.food_order_item_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE'
     and pg_catalog.current_setting('app.food_demo_reset', true) = 'on' then
    perform public.food_assert_demo_service_role();
    return old;
  end if;
  raise exception using errcode = '55000', message = 'Food order item snapshots are immutable.';
end
$function$;

create or replace function public.food_order_history_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE'
     and pg_catalog.current_setting('app.food_demo_reset', true) = 'on' then
    perform public.food_assert_demo_service_role();
    return old;
  end if;
  raise exception using errcode = '55000', message = 'Food order status history is append-only.';
end
$function$;

create function public.food_reset_demo_account_v1(
  input_food_account_id uuid,
  input_storefront_slug text,
  input_actor_profile_id uuid,
  input_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  demo_target public.food_demo_accounts%rowtype;
  actor_profile public.profiles%rowtype;
  limiter public.food_demo_reset_rate_limits%rowtype;
  previous_response jsonb;
  actor_kind text;
  audit_now timestamptz := pg_catalog.clock_timestamp();
  deleted_orders bigint := 0;
  deleted_items bigint := 0;
  deleted_history bigint := 0;
  deleted_idempotency bigint := 0;
  restored_items bigint := 0;
  result jsonb;
begin
  perform public.food_assert_demo_service_role();
  if input_food_account_id is null
     or input_actor_profile_id is null
     or input_storefront_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(input_storefront_slug) not between 3 and 100
     or input_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' then
    raise exception using errcode = '22023', message = 'Food demo reset input is invalid.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('food-demo-reset:' || input_food_account_id::text, 0)
  );

  select target.* into demo_target
  from public.food_demo_accounts target
  join public.restaurant_locations location
    on location.food_account_id = target.food_account_id
   and location.id = target.location_id
   and location.slug = target.storefront_slug
  where target.food_account_id = input_food_account_id
    and target.storefront_slug = input_storefront_slug
    and target.enabled
  for update of target;
  if not found then
    raise exception using errcode = '42501', message = 'Food demo reset target is not allowlisted.';
  end if;

  if not public.food_has_capability(
    demo_target.food_account_id, demo_target.location_id, 'demo.reset'
  ) then
    raise exception using errcode = '42501', message = 'Food demo reset capability is disabled.';
  end if;

  select profile.* into actor_profile
  from public.profiles profile
  where profile.id = input_actor_profile_id and profile.status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'Food demo reset actor is not active.';
  end if;

  if actor_profile.role in ('super_admin','admin') then
    actor_kind := 'platform_admin';
  elsif exists (
    select 1 from public.food_account_members membership
    where membership.food_account_id = demo_target.food_account_id
      and membership.profile_id = actor_profile.id
      and membership.status = 'active'
      and membership.role in ('owner','manager')
      and (membership.location_id is null or membership.location_id = demo_target.location_id)
  ) then
    actor_kind := 'demo_manager';
  else
    raise exception using errcode = '42501', message = 'Food demo reset actor is not authorized.';
  end if;

  select audit.response into previous_response
  from public.food_demo_reset_audit audit
  where audit.food_account_id = demo_target.food_account_id
    and audit.idempotency_key = input_idempotency_key;
  if found then
    return previous_response || jsonb_build_object('idempotent_replay', true);
  end if;

  insert into public.food_demo_reset_rate_limits(food_account_id, actor_profile_id, request_count)
  values (demo_target.food_account_id, actor_profile.id, 0)
  on conflict (food_account_id, actor_profile_id) do nothing;

  select rate_limit.* into limiter
  from public.food_demo_reset_rate_limits rate_limit
  where rate_limit.food_account_id = demo_target.food_account_id
    and rate_limit.actor_profile_id = actor_profile.id
  for update;

  if limiter.window_started_at <= audit_now - interval '10 minutes' then
    update public.food_demo_reset_rate_limits
    set window_started_at = audit_now, request_count = 1, updated_at = audit_now
    where food_account_id = demo_target.food_account_id
      and actor_profile_id = actor_profile.id;
  elsif limiter.request_count >= 3 then
    raise exception using errcode = 'P4290', message = 'Food demo reset rate limit exceeded.';
  else
    update public.food_demo_reset_rate_limits
    set request_count = request_count + 1, updated_at = audit_now
    where food_account_id = demo_target.food_account_id
      and actor_profile_id = actor_profile.id;
  end if;

  perform pg_catalog.set_config('app.food_demo_reset', 'on', true);

  with deleted as (
    delete from public.food_order_status_history
    where food_account_id = demo_target.food_account_id
    returning 1
  ) select count(*) into deleted_history from deleted;

  with deleted as (
    delete from public.food_order_items
    where food_account_id = demo_target.food_account_id
    returning 1
  ) select count(*) into deleted_items from deleted;

  with deleted as (
    delete from public.food_order_idempotency
    where food_account_id = demo_target.food_account_id
    returning 1
  ) select count(*) into deleted_idempotency from deleted;

  with deleted as (
    delete from public.food_orders
    where food_account_id = demo_target.food_account_id
    returning 1
  ) select count(*) into deleted_orders from deleted;

  with restored as (
    update public.menu_items item
    set price_minor = baseline.price_minor,
        available = baseline.available,
        active = baseline.active,
        updated_at = audit_now
    from public.food_demo_menu_item_baselines baseline
    where baseline.food_account_id = demo_target.food_account_id
      and item.food_account_id = baseline.food_account_id
      and item.id = baseline.menu_item_id
    returning 1
  ) select count(*) into restored_items from restored;

  result := jsonb_build_object(
    'reset', true,
    'food_account_id', demo_target.food_account_id,
    'storefront_slug', demo_target.storefront_slug,
    'orders_deleted', deleted_orders,
    'order_items_deleted', deleted_items,
    'status_history_deleted', deleted_history,
    'idempotency_records_deleted', deleted_idempotency,
    'menu_items_restored', restored_items,
    'idempotent_replay', false,
    'completed_at', audit_now
  );

  insert into public.food_demo_reset_audit(
    food_account_id, actor_profile_id, actor_type, idempotency_key, response, created_at
  ) values (
    demo_target.food_account_id, actor_profile.id, actor_kind,
    input_idempotency_key, result, audit_now
  );
  return result;
end
$function$;

revoke all on function public.food_reset_demo_account_v1(uuid,text,uuid,text)
  from public, anon, authenticated;
revoke all on function public.food_assert_demo_service_role()
  from public, anon, authenticated;
grant execute on function public.food_assert_demo_service_role() to service_role;
grant execute on function public.food_reset_demo_account_v1(uuid,text,uuid,text)
  to service_role;

commit;
