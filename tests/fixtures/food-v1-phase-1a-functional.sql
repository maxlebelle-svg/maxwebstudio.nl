\set ON_ERROR_STOP on

-- Synthetic, disposable-only tenants. No production or verified personal data.
insert into auth.users(id) values
  ('f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000002'),
  ('f1000000-0000-4000-8000-000000000003'),
  ('f1000000-0000-4000-8000-000000000004'),
  ('f1000000-0000-4000-8000-000000000005');

insert into public.profiles(id, auth_user_id, name, role, status, environment) values
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Silverado fixture owner','customer','active','test'),
  ('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','Silverado fixture kitchen','customer','active','test'),
  ('f2000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000003','Tenant B fixture owner','customer','active','test'),
  ('f2000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000004','Unrelated platform customer','customer','active','test'),
  ('f2000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000005','Platform admin fixture','admin','active','test');

insert into public.customers(id, profile_id, auth_user_id, name, company, status, environment) values
  ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Silverado fixture','Silverado Roti Shop','active','test'),
  ('f3000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000003','Tenant B fixture','Isolation Restaurant B','active','test');

insert into public.food_accounts(id, customer_id, name, status, timezone) values
  ('f4000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','Silverado Roti Shop','pilot','Europe/Amsterdam'),
  ('f4000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000002','Isolation Restaurant B','pilot','Europe/Amsterdam');

insert into public.restaurant_locations(
  id, food_account_id, name, slug, status, is_published, timezone, city
) values
  ('f5000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','Silverado Emmeloord','fixture-silverado-emmeloord','active',true,'Europe/Amsterdam','Emmeloord'),
  ('f5000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000002','Isolation Location B','fixture-isolation-restaurant-b','active',true,'Europe/Amsterdam','Teststad');

insert into public.food_account_members(id, food_account_id, location_id, profile_id, role, status) values
  ('f6000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001',null,'f2000000-0000-4000-8000-000000000001','owner','active'),
  ('f6000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002','kitchen_staff','active'),
  ('f6000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000002',null,'f2000000-0000-4000-8000-000000000003','owner','active');

insert into public.food_entitlements(id, food_account_id, capability_key, status, starts_at)
select gen_random_uuid(), account_id, capability_key, 'active', clock_timestamp() - interval '1 hour'
from (values
  ('f4000000-0000-4000-8000-000000000001'::uuid),
  ('f4000000-0000-4000-8000-000000000002'::uuid)
) accounts(account_id)
cross join (values ('ordering.pickup'),('menu.management'),('orders.management')) capabilities(capability_key);

insert into public.restaurant_capabilities(food_account_id, location_id, capability_key, enabled)
select account_id, location_id, capability_key, true
from (values
  ('f4000000-0000-4000-8000-000000000001'::uuid,'f5000000-0000-4000-8000-000000000001'::uuid),
  ('f4000000-0000-4000-8000-000000000002'::uuid,'f5000000-0000-4000-8000-000000000002'::uuid)
) locations(account_id, location_id)
cross join (values ('ordering.pickup'),('menu.management'),('orders.management')) capabilities(capability_key);

insert into public.restaurant_tax_classes(id, food_account_id, code, name, rate_basis_points, valid_from) values
  ('f7000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','food_low','Food laag testtarief',900,clock_timestamp() - interval '1 day'),
  ('f7000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','food_high','Food hoog testtarief',2100,clock_timestamp() - interval '1 day'),
  ('f7000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000002','food_low','Tenant B testtarief',900,clock_timestamp() - interval '1 day');

insert into public.menus(id, food_account_id, location_id, name, status, published_at) values
  ('f8000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','Silverado testmenu','published',clock_timestamp()),
  ('f8000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000002','Tenant B testmenu','published',clock_timestamp());

insert into public.menu_categories(id, food_account_id, location_id, menu_id, name, sort_order) values
  ('f9000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001','Roti testgerechten',10),
  ('f9000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001','Rijst en bami testgerechten',20),
  ('f9000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001','Snacks en drank test',30),
  ('f9000000-0000-4000-8000-000000000004','f4000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000002','f8000000-0000-4000-8000-000000000002','Tenant B testcategorie',10);

insert into public.menu_items(
  id, food_account_id, location_id, category_id, tax_class_id,
  name, description, price_minor, sort_order
) values
  ('fa000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','Test roti kip','Alleen testfixture',1000,10),
  ('fa000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','Test roti vegetarisch','Alleen testfixture',950,20),
  ('fa000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','Test rotirol','Alleen testfixture',800,30),
  ('fa000000-0000-4000-8000-000000000004','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000001','Test nasi kip','Alleen testfixture',1050,10),
  ('fa000000-0000-4000-8000-000000000005','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000001','Test bami kip','Alleen testfixture',1050,20),
  ('fa000000-0000-4000-8000-000000000006','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000001','Test moksi','Alleen testfixture',1200,30),
  ('fa000000-0000-4000-8000-000000000007','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000003','f7000000-0000-4000-8000-000000000001','Test loempia','Alleen testfixture',250,10),
  ('fa000000-0000-4000-8000-000000000008','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000003','f7000000-0000-4000-8000-000000000001','Test bara','Alleen testfixture',300,20),
  ('fa000000-0000-4000-8000-000000000009','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000003','f7000000-0000-4000-8000-000000000002','Test frisdrank','Alleen testfixture',275,30),
  ('fa000000-0000-4000-8000-000000000010','f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000003','f7000000-0000-4000-8000-000000000002','Test dessert','Alleen testfixture',450,40),
  ('fa000000-0000-4000-8000-000000000011','f4000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000002','f9000000-0000-4000-8000-000000000004','f7000000-0000-4000-8000-000000000003','Tenant B testitem','Alleen tenantisolatie',999,10);

-- Tenant A sees only tenant A through RLS.
set role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',false);
do $assert_tenant_a$
begin
  if (select count(*) from public.food_accounts) <> 1
     or (select id from public.food_accounts limit 1) <> 'f4000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'tenant A account isolation failed';
  end if;
  if (select count(*) from public.menu_items) <> 10 then
    raise exception 'tenant A menu isolation failed';
  end if;
end
$assert_tenant_a$;

-- A cannot mutate B; no broad account update grant exists.
do $assert_tenant_write$
begin
  begin
    update public.food_accounts set name = 'forbidden' where id = 'f4000000-0000-4000-8000-000000000002';
    raise exception 'tenant A unexpectedly updated tenant B';
  exception when insufficient_privilege then
    null;
  end;
end
$assert_tenant_write$;

-- Composite FKs reject an A item referencing B category or B tax.
do $assert_cross_tenant_fk$
begin
  begin
    insert into public.menu_items(
      food_account_id, location_id, category_id, tax_class_id, name, price_minor
    ) values (
      'f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
      'f9000000-0000-4000-8000-000000000004','f7000000-0000-4000-8000-000000000001','Forbidden category',100
    );
    raise exception 'cross-tenant category unexpectedly accepted';
  exception when foreign_key_violation then
    null;
  end;
  begin
    insert into public.menu_items(
      food_account_id, location_id, category_id, tax_class_id, name, price_minor
    ) values (
      'f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
      'f9000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000003','Forbidden tax',100
    );
    raise exception 'cross-tenant tax unexpectedly accepted';
  exception when foreign_key_violation then
    null;
  end;
end
$assert_cross_tenant_fk$;

-- Unrelated authenticated platform customer receives no Food rows.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000004',false);
do $assert_outsider$
begin
  if (select count(*) from public.food_accounts) <> 0
     or (select count(*) from public.menu_items) <> 0
     or (select count(*) from public.food_orders) <> 0 then
    raise exception 'unrelated platform role received Food access';
  end if;
end
$assert_outsider$;
reset role;

-- Anon has neither order select nor status update privileges.
set role anon;
do $assert_anon$
begin
  begin
    perform count(*) from public.food_orders;
    raise exception 'anon unexpectedly selected food orders';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.food_orders set status = 'accepted';
    raise exception 'anon unexpectedly updated food order status';
  exception when insufficient_privilege then null;
  end;
end
$assert_anon$;
reset role;

-- Controlled server order creation calculates amounts and protects replays.
set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
create temporary table food_fixture_order_result as
select public.food_create_order_v1(
  'fixture-silverado-emmeloord',
  'fixture-order-key-00000001',
  '[{"menu_item_id":"fa000000-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
  'pickup',
  '{"name":"Testbesteller","phone":"0000000000"}'::jsonb,
  '{}'::jsonb,
  'Testnotitie'
) as result;

do $assert_order$
declare
  order_id uuid;
  replay jsonb;
begin
  order_id := ((select result from food_fixture_order_result)->>'id')::uuid;
  if ((select result from food_fixture_order_result)->>'total_minor')::bigint <> 2000
     or ((select result from food_fixture_order_result)->>'tax_minor')::bigint <> 165 then
    raise exception 'server-side amount or inclusive tax calculation failed';
  end if;
  replay := public.food_create_order_v1(
    'fixture-silverado-emmeloord','fixture-order-key-00000001',
    '[{"menu_item_id":"fa000000-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
    'pickup','{"name":"Testbesteller","phone":"0000000000"}'::jsonb,'{}'::jsonb,'Testnotitie'
  );
  if coalesce((replay->>'idempotent_replay')::boolean,false) is not true
     or (replay->>'id')::uuid <> order_id then
    raise exception 'idempotent replay failed';
  end if;
  begin
    perform public.food_create_order_v1(
      'fixture-silverado-emmeloord','fixture-order-key-00000001',
      '[{"menu_item_id":"fa000000-0000-4000-8000-000000000002","quantity":1}]'::jsonb,
      'pickup','{"name":"Different"}'::jsonb,'{}'::jsonb,null
    );
    raise exception 'idempotency hash conflict unexpectedly accepted';
  exception when unique_violation then null;
  end;
end
$assert_order$;
reset role;
do $assert_single_order$
begin
  if (select count(*) from public.food_orders where idempotency_key = 'fixture-order-key-00000001') <> 1 then
    raise exception 'idempotent replay created a duplicate order';
  end if;
end
$assert_single_order$;

-- Menu edits never alter historical snapshots.
set role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',false);
update public.menu_items set name = 'Test roti kip gewijzigd', price_minor = 1250
where id = 'fa000000-0000-4000-8000-000000000001';
do $assert_snapshot$
begin
  if not exists (
    select 1 from public.food_order_items
    where menu_item_id = 'fa000000-0000-4000-8000-000000000001'
      and item_name_snapshot = 'Test roti kip'
      and unit_price_minor = 1000
  ) then
    raise exception 'historical order snapshot changed with menu';
  end if;
end
$assert_snapshot$;
reset role;

-- Kitchen can perform only its two transitions; every change is appended.
set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
do $assert_status$
declare
  target_order_id uuid := ((select result from food_fixture_order_result)->>'id')::uuid;
begin
  begin
    perform public.food_transition_order_status_v1(
      target_order_id,'accepted','f2000000-0000-4000-8000-000000000002',null
    );
    raise exception 'kitchen unexpectedly accepted a pending order';
  exception when insufficient_privilege then null;
  end;
  perform public.food_transition_order_status_v1(
    target_order_id,'accepted','f2000000-0000-4000-8000-000000000001',null
  );
  perform public.food_transition_order_status_v1(
    target_order_id,'preparing','f2000000-0000-4000-8000-000000000002',null
  );
  perform public.food_transition_order_status_v1(
    target_order_id,'ready','f2000000-0000-4000-8000-000000000002',null
  );
end
$assert_status$;
reset role;
do $assert_history$
declare
  target_order_id uuid := ((select result from food_fixture_order_result)->>'id')::uuid;
begin
  if (select count(*) from public.food_order_status_history history where history.order_id = target_order_id) <> 4 then
    raise exception 'order status history append count failed';
  end if;
  begin
    update public.food_order_status_history set reason = 'forbidden' where order_id = target_order_id;
    raise exception 'status history unexpectedly mutable';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.food_order_status_history where order_id = target_order_id;
    raise exception 'status history unexpectedly deletable';
  exception when sqlstate '55000' then null;
  end;
end
$assert_history$;

-- Database constraints reject invalid money and duplicate scoped keys.
do $assert_constraints$
begin
  begin
    update public.menu_items set price_minor = -1 where id = 'fa000000-0000-4000-8000-000000000011';
    raise exception 'negative money unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.food_order_idempotency(
      food_account_id, location_id, idempotency_key, request_hash, expires_at
    ) values (
      'f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',
      'fixture-order-key-00000001',repeat('a',64),clock_timestamp() + interval '1 hour'
    );
    raise exception 'duplicate idempotency key unexpectedly accepted';
  exception when unique_violation then null;
  end;
end
$assert_constraints$;

select 'PASS_FOOD_V1_PHASE_1A_FUNCTIONAL' as status;
