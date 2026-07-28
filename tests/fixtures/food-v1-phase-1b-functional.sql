\set ON_ERROR_STOP on

-- Phase 1A fixture data must already be present in this disposable local database.
select set_config('request.jwt.claim.role','service_role',false);

do $assert_confirmation$
declare
  target_reference text;
  confirmation jsonb;
begin
  select public_reference into target_reference
  from public.food_orders
  where food_account_id = 'f4000000-0000-4000-8000-000000000001'
  order by created_at limit 1;

  confirmation := public.food_get_order_confirmation_v1(
    'fixture-silverado-emmeloord', target_reference
  );
  if confirmation is null
     or confirmation->>'public_reference' <> target_reference
     or confirmation->'storefront'->>'slug' <> 'fixture-silverado-emmeloord'
     or confirmation ? 'id'
     or confirmation ? 'food_account_id'
     or confirmation ? 'location_id'
     or confirmation ? 'customer_snapshot'
     or confirmation::text like '%fixture@example.test%' then
    raise exception 'public confirmation was absent or leaked internal/PII fields';
  end if;

  if public.food_get_order_confirmation_v1(
    'fixture-isolation-restaurant-b', target_reference
  ) is not null then
    raise exception 'tenant B slug unexpectedly resolved tenant A confirmation';
  end if;
  if public.food_get_order_confirmation_v1(
    'fixture-silverado-emmeloord', repeat('0', 32)
  ) is not null then
    raise exception 'unknown confirmation unexpectedly resolved';
  end if;
end
$assert_confirmation$;

do $assert_rate_limit$
declare
  attempt integer;
  allowed boolean;
  current_count integer;
begin
  for attempt in 1..8 loop
    if not public.food_consume_order_rate_limit_v1(
      'fixture-silverado-emmeloord', repeat('a',64), 8, 60
    ) then
      raise exception 'rate limiter rejected allowed attempt %', attempt;
    end if;
  end loop;
  if public.food_consume_order_rate_limit_v1(
    'fixture-silverado-emmeloord', repeat('a',64), 8, 60
  ) then
    raise exception 'rate limiter accepted attempt above threshold';
  end if;
  if not public.food_consume_order_rate_limit_v1(
    'fixture-isolation-restaurant-b', repeat('a',64), 8, 60
  ) then
    raise exception 'rate limiter was not location scoped';
  end if;
  if public.food_consume_order_rate_limit_v1(
    'fixture-missing-location', repeat('d',64), 8, 60
  ) then
    raise exception 'rate limiter unexpectedly allowed a missing location';
  end if;
  if not public.food_consume_order_rate_limit_v1(
    'fixture-silverado-emmeloord', repeat('b',64), 8, 60
  ) then
    raise exception 'rate limiter did not isolate a different client hash';
  end if;
  if not public.food_consume_order_rate_limit_v1(
    'fixture-silverado-emmeloord', repeat('c',64), 8, 60
  ) then
    raise exception 'rate limiter did not isolate a different route/client hash';
  end if;
  update public.food_public_order_rate_limits
  set window_started_at = pg_catalog.clock_timestamp() - interval '61 seconds',
      request_count = 8
  where location_id = 'f5000000-0000-4000-8000-000000000001'
    and rate_key_hash = repeat('b',64);
  allowed := public.food_consume_order_rate_limit_v1(
    'fixture-silverado-emmeloord', repeat('b',64), 8, 60
  );
  select request_count into current_count
  from public.food_public_order_rate_limits
  where location_id = 'f5000000-0000-4000-8000-000000000001'
    and rate_key_hash = repeat('b',64);
  if not allowed or current_count <> 1 then
    raise exception 'rate limiter did not reset an expired window';
  end if;
  begin
    perform public.food_consume_order_rate_limit_v1(
      'fixture-silverado-emmeloord', 'raw-client-address', 8, 60
    );
    raise exception 'raw rate-limit identity unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
end
$assert_rate_limit$;

set role anon;
do $assert_anon$
begin
  begin
    perform * from public.food_public_order_rate_limits;
    raise exception 'anon unexpectedly read Food rate-limit state';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.food_get_order_confirmation_v1(
      'fixture-silverado-emmeloord', repeat('0',32)
    );
    raise exception 'anon unexpectedly invoked confirmation RPC';
  exception when insufficient_privilege then null;
  end;
end
$assert_anon$;
reset role;

select 'PASS_FOOD_V1_PHASE_1B_FUNCTIONAL' as status;
