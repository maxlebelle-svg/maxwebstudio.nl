\set ON_ERROR_STOP on

insert into public.food_orders(
  id, food_account_id, location_id, channel, fulfilment_type, status,
  public_reference, idempotency_key, customer_snapshot, fulfilment_snapshot,
  currency, subtotal_minor, tax_minor, total_minor
) values
  (
    'db000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',
    'website','pickup','pending','11111111111111111111111111111111','demo-reset-order-0001',
    '{"name":"Synthetic Demo Guest","phone":"0000000000"}','{}','EUR',1250,103,1250
  ),
  (
    'db000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000002',
    'website','pickup','pending','22222222222222222222222222222222','isolation-order-0001',
    '{"name":"Synthetic Isolation Guest","phone":"0000000000"}','{}','EUR',999,82,999
  );

insert into public.food_order_items(
  id, food_account_id, order_id, menu_item_id, item_name_snapshot,
  quantity, unit_price_minor, line_subtotal_minor, tax_rate_basis_points,
  tax_minor, line_total_minor
) values
  ('dc000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001','Roti kipfilet',1,1250,1250,900,103,1250),
  ('dc000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000002','db000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000011','Synthetic isolation item',1,999,999,900,82,999);

insert into public.food_order_idempotency(
  id, food_account_id, location_id, idempotency_key, request_hash,
  order_id, response_code, expires_at
) values
  ('dd000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','demo-reset-order-0001',repeat('1',64),'db000000-0000-4000-8000-000000000001',201,pg_catalog.clock_timestamp() + interval '1 day'),
  ('dd000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000002','isolation-order-0001',repeat('2',64),'db000000-0000-4000-8000-000000000002',201,pg_catalog.clock_timestamp() + interval '1 day');

update public.menu_items
set price_minor = 1, available = false
where id = 'da000000-0000-4000-8000-000000000001';

do $assert_demo_reset$
declare
  reset_result jsonb;
  replay_result jsonb;
  expected_members bigint;
  expected_taxes bigint;
begin
  select count(*) into expected_members from public.food_account_members
  where food_account_id = 'd4000000-0000-4000-8000-000000000001';
  select count(*) into expected_taxes from public.restaurant_tax_classes
  where food_account_id = 'd4000000-0000-4000-8000-000000000001';

  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  perform pg_catalog.set_config('request.jwt.claims', '{}', true);
  begin
    perform public.food_reset_demo_account_v1(
      'd4000000-0000-4000-8000-000000000001', 'silverado-roti-shop-emmeloord',
      'd2000000-0000-4000-8000-000000000001', 'food-demo-reset:no-service-01'
    );
    raise exception 'reset unexpectedly accepted a non-service caller';
  exception when insufficient_privilege then
    null;
  end;

  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

  begin
    perform public.food_reset_demo_account_v1(
      'd4000000-0000-4000-8000-000000000002', 'synthetic-isolation-restaurant',
      'd2000000-0000-4000-8000-000000000003', 'food-demo-reset:wrong-tenant-01'
    );
    raise exception 'reset unexpectedly accepted the isolation tenant';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.food_reset_demo_account_v1(
      'd4000000-0000-4000-8000-000000000001', 'silverado-roti-shop-emmeloord',
      'd2000000-0000-4000-8000-000000000003', 'food-demo-reset:wrong-actor-001'
    );
    raise exception 'reset unexpectedly accepted a cross-tenant manager';
  exception when insufficient_privilege then
      null;
  end;

  update public.restaurant_capabilities
  set enabled = false
  where food_account_id = 'd4000000-0000-4000-8000-000000000001'
    and location_id = 'd5000000-0000-4000-8000-000000000001'
    and capability_key = 'demo.reset';
  begin
    perform public.food_reset_demo_account_v1(
      'd4000000-0000-4000-8000-000000000001', 'silverado-roti-shop-emmeloord',
      'd2000000-0000-4000-8000-000000000001', 'food-demo-reset:no-capability-01'
    );
    raise exception 'reset unexpectedly accepted a disabled capability';
  exception when insufficient_privilege then
    null;
  end;
  update public.restaurant_capabilities
  set enabled = true
  where food_account_id = 'd4000000-0000-4000-8000-000000000001'
    and location_id = 'd5000000-0000-4000-8000-000000000001'
    and capability_key = 'demo.reset';

  reset_result := public.food_reset_demo_account_v1(
    'd4000000-0000-4000-8000-000000000001', 'silverado-roti-shop-emmeloord',
    'd2000000-0000-4000-8000-000000000001', 'food-demo-reset:functional-001'
  );
  if reset_result ->> 'reset' <> 'true'
     or (reset_result ->> 'orders_deleted')::integer <> 1
     or (reset_result ->> 'order_items_deleted')::integer <> 1
     or (reset_result ->> 'idempotency_records_deleted')::integer <> 1
     or (reset_result ->> 'menu_items_restored')::integer <> 10 then
    raise exception 'reset result did not report the expected bounded mutation: %', reset_result;
  end if;

  if exists (select 1 from public.food_orders where food_account_id = 'd4000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.food_order_items where food_account_id = 'd4000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.food_order_status_history where food_account_id = 'd4000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.food_order_idempotency where food_account_id = 'd4000000-0000-4000-8000-000000000001') then
    raise exception 'reset left Silverado demo-order state behind';
  end if;
  if (select count(*) from public.food_orders where food_account_id = 'd4000000-0000-4000-8000-000000000002') <> 1
     or (select count(*) from public.food_order_items where food_account_id = 'd4000000-0000-4000-8000-000000000002') <> 1
     or (select count(*) from public.food_order_idempotency where food_account_id = 'd4000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'reset crossed the synthetic tenant-isolation boundary';
  end if;
  if not exists (
    select 1 from public.menu_items
    where id = 'da000000-0000-4000-8000-000000000001'
      and price_minor = 1250 and available and active
  ) then
    raise exception 'reset did not restore menu price and availability';
  end if;
  if (select count(*) from public.food_accounts where id = 'd4000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.food_account_members where food_account_id = 'd4000000-0000-4000-8000-000000000001') <> expected_members
     or (select count(*) from public.restaurant_tax_classes where food_account_id = 'd4000000-0000-4000-8000-000000000001') <> expected_taxes then
    raise exception 'reset changed retained tenant, membership or tax configuration';
  end if;
  if (select count(*) from public.food_demo_reset_audit where food_account_id = 'd4000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'reset audit record was not written exactly once';
  end if;

  replay_result := public.food_reset_demo_account_v1(
    'd4000000-0000-4000-8000-000000000001', 'silverado-roti-shop-emmeloord',
    'd2000000-0000-4000-8000-000000000001', 'food-demo-reset:functional-001'
  );
  if replay_result ->> 'idempotent_replay' <> 'true'
     or (select count(*) from public.food_demo_reset_audit where food_account_id = 'd4000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'replayed reset was not idempotent';
  end if;

  perform public.food_reset_demo_account_v1(
    'd4000000-0000-4000-8000-000000000001', 'silverado-roti-shop-emmeloord',
    'd2000000-0000-4000-8000-000000000001', 'food-demo-reset:functional-002'
  );
  perform public.food_reset_demo_account_v1(
    'd4000000-0000-4000-8000-000000000001', 'silverado-roti-shop-emmeloord',
    'd2000000-0000-4000-8000-000000000001', 'food-demo-reset:functional-003'
  );
  begin
    perform public.food_reset_demo_account_v1(
      'd4000000-0000-4000-8000-000000000001', 'silverado-roti-shop-emmeloord',
      'd2000000-0000-4000-8000-000000000001', 'food-demo-reset:functional-004'
    );
    raise exception 'reset rate limit accepted a fourth request';
  exception when sqlstate 'P4290' then
    null;
  end;
end
$assert_demo_reset$;

select 'PASS_FOOD_V1_ONLINE_DEMO_RESET_FUNCTIONAL';
