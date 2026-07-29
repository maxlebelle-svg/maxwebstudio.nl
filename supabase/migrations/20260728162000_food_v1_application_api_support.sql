-- Max Webstudio Food v1 / Phase 1B: minimal server-only API support.
-- Forward-only and data preserving. Creates no tenant, menu or order rows.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.food_orders') is null
     or pg_catalog.to_regprocedure('public.food_assert_service_role()') is null
     or pg_catalog.to_regprocedure('public.food_has_capability(uuid,uuid,text)') is null then
    raise exception using errcode = '55000',
      message = 'Food v1 Phase 1B requires the complete Phase 1A foundation.';
  end if;
  if pg_catalog.to_regclass('public.food_public_order_rate_limits') is not null then
    raise exception using errcode = '42P07',
      message = 'Food v1 Phase 1B API support already exists; refusing an ambiguous replay.';
  end if;
end
$preflight$;

create table public.food_public_order_rate_limits (
  location_id uuid not null references public.restaurant_locations(id) on delete cascade,
  rate_key_hash text not null check (rate_key_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default pg_catalog.clock_timestamp(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (location_id, rate_key_hash)
);

alter table public.food_public_order_rate_limits enable row level security;
alter table public.food_public_order_rate_limits force row level security;
revoke all on table public.food_public_order_rate_limits from public, anon, authenticated;
grant all on table public.food_public_order_rate_limits to service_role;

create function public.food_consume_order_rate_limit_v1(
  input_location_slug text,
  input_rate_key_hash text,
  input_max_requests integer default 8,
  input_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  target_location public.restaurant_locations%rowtype;
  limit_record public.food_public_order_rate_limits%rowtype;
  audit_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform public.food_assert_service_role();
  if input_rate_key_hash !~ '^[a-f0-9]{64}$'
     or input_max_requests not between 1 and 100
     or input_window_seconds not between 10 and 3600 then
    raise exception using errcode = '22023', message = 'Food order rate-limit input is invalid.';
  end if;

  select location.* into target_location
  from public.restaurant_locations location
  join public.food_accounts account on account.id = location.food_account_id
  where location.slug = input_location_slug
    and location.status = 'active'
    and location.is_published
    and account.status in ('pilot','active');
  if not found or not public.food_has_capability(
    target_location.food_account_id, target_location.id, 'ordering.pickup'
  ) then
    return false;
  end if;

  insert into public.food_public_order_rate_limits(location_id, rate_key_hash)
  values (target_location.id, input_rate_key_hash)
  on conflict (location_id, rate_key_hash) do nothing;

  select * into limit_record
  from public.food_public_order_rate_limits
  where location_id = target_location.id and rate_key_hash = input_rate_key_hash
  for update;

  if limit_record.window_started_at <= audit_now - pg_catalog.make_interval(secs => input_window_seconds) then
    update public.food_public_order_rate_limits
    set window_started_at = audit_now, request_count = 1, updated_at = audit_now
    where location_id = target_location.id and rate_key_hash = input_rate_key_hash;
    return true;
  end if;
  if limit_record.request_count >= input_max_requests then
    update public.food_public_order_rate_limits set updated_at = audit_now
    where location_id = target_location.id and rate_key_hash = input_rate_key_hash;
    return false;
  end if;
  update public.food_public_order_rate_limits
  set request_count = request_count + 1, updated_at = audit_now
  where location_id = target_location.id and rate_key_hash = input_rate_key_hash;
  return true;
end
$function$;

create function public.food_get_order_confirmation_v1(
  input_location_slug text,
  input_public_reference text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  confirmation jsonb;
begin
  perform public.food_assert_service_role();
  if input_public_reference !~ '^[a-f0-9]{32}$' then
    return null;
  end if;

  select jsonb_build_object(
    'public_reference', food_order.public_reference,
    'status', food_order.status,
    'fulfilment_type', food_order.fulfilment_type,
    'currency', food_order.currency,
    'subtotal_minor', food_order.subtotal_minor,
    'tax_minor', food_order.tax_minor,
    'total_minor', food_order.total_minor,
    'created_at', food_order.created_at,
    'storefront', jsonb_build_object('slug', location.slug, 'name', location.name)
  ) into confirmation
  from public.food_orders food_order
  join public.restaurant_locations location
    on location.food_account_id = food_order.food_account_id
   and location.id = food_order.location_id
  join public.food_accounts account on account.id = food_order.food_account_id
  where location.slug = input_location_slug
    and location.status = 'active'
    and location.is_published
    and account.status in ('pilot','active')
    and food_order.public_reference = input_public_reference;
  return confirmation;
end
$function$;

revoke all on function public.food_consume_order_rate_limit_v1(text,text,integer,integer)
  from public, anon, authenticated;
revoke all on function public.food_get_order_confirmation_v1(text,text)
  from public, anon, authenticated;
grant execute on function public.food_consume_order_rate_limit_v1(text,text,integer,integer)
  to service_role;
grant execute on function public.food_get_order_confirmation_v1(text,text)
  to service_role;

commit;
