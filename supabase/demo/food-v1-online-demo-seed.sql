-- Idempotent synthetic seed for the isolated Max Webstudio Food demo project.
-- Contains no auth users, passwords, provider credentials or personal contact data.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.food_demo_accounts') is null
     or pg_catalog.to_regclass('public.food_demo_menu_item_baselines') is null then
    raise exception using errcode = '55000',
      message = 'Food online-demo seed requires the online-demo reset migration.';
  end if;
end
$preflight$;

insert into public.profiles(id, name, role, status, is_demo, environment, metadata)
values
  ('d2000000-0000-4000-8000-000000000001', 'Silverado demo manager', 'customer', 'active', true, 'demo', '{"synthetic":true,"provisioning":"auth-link-required"}'),
  ('d2000000-0000-4000-8000-000000000002', 'Food demo platform admin', 'admin', 'active', true, 'demo', '{"synthetic":true,"provisioning":"auth-link-required"}'),
  ('d2000000-0000-4000-8000-000000000003', 'Isolation demo manager', 'customer', 'active', true, 'demo', '{"synthetic":true,"provisioning":"auth-link-required"}')
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  is_demo = true,
  environment = 'demo',
  metadata = excluded.metadata,
  updated_at = pg_catalog.clock_timestamp();

insert into public.customers(id, profile_id, name, company, status, portal_status, is_demo, environment, metadata)
values
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Silverado Food demo', 'Silverado Roti Shop', 'active', 'prepared', true, 'demo', '{"synthetic":true}'),
  ('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000003', 'Food isolation demo', 'Synthetic Isolation Restaurant', 'active', 'prepared', true, 'demo', '{"synthetic":true}')
on conflict (id) do update set
  name = excluded.name,
  company = excluded.company,
  is_demo = true,
  environment = 'demo',
  metadata = excluded.metadata,
  updated_at = pg_catalog.clock_timestamp();

insert into public.food_accounts(id, customer_id, name, status, timezone, metadata)
values
  ('d4000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Silverado Roti Shop', 'pilot', 'Europe/Amsterdam', '{"synthetic_demo":true}'),
  ('d4000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000002', 'Synthetic Isolation Restaurant', 'pilot', 'Europe/Amsterdam', '{"synthetic_demo":true,"isolation_control":true}')
on conflict (id) do update set
  name = excluded.name,
  status = excluded.status,
  timezone = excluded.timezone,
  metadata = excluded.metadata,
  updated_at = pg_catalog.clock_timestamp();

insert into public.restaurant_locations(
  id, food_account_id, name, slug, status, is_published, timezone, city, configuration
)
values
  (
    'd5000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
    'Silverado Emmeloord', 'silverado-roti-shop-emmeloord', 'active', true,
    'Europe/Amsterdam', 'Emmeloord',
    '{"public":{"intro":"Surinaamse afhaalgerechten in de geïsoleerde Food-demo.","logo_text":"Silverado","logo_suffix":"Demo","hero_image_url":"/assets/demo-images/demo-hero-horeca.jpg","opening_hours":{"monday":[{"open":"15:00","close":"19:00"}],"tuesday":[{"open":"15:00","close":"19:00"}],"wednesday":[{"open":"15:00","close":"19:00"}],"thursday":[{"open":"15:00","close":"19:00"}],"friday":[{"open":"15:00","close":"19:00"}],"saturday":[],"sunday":[]}}}'
  ),
  (
    'd5000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002',
    'Synthetic Isolation Location', 'synthetic-isolation-restaurant', 'active', false,
    'Europe/Amsterdam', 'Teststad', '{"public":{"intro":"Synthetic tenant-isolation control."}}'
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  is_published = excluded.is_published,
  timezone = excluded.timezone,
  city = excluded.city,
  configuration = excluded.configuration,
  updated_at = pg_catalog.clock_timestamp();

insert into public.food_account_members(id, food_account_id, location_id, profile_id, role, status)
values
  ('d6000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', null, 'd2000000-0000-4000-8000-000000000001', 'manager', 'active'),
  ('d6000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001', null, 'd2000000-0000-4000-8000-000000000002', 'owner', 'active'),
  ('d6000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000002', null, 'd2000000-0000-4000-8000-000000000003', 'manager', 'active')
on conflict (id) do update set role = excluded.role, status = 'active', updated_at = pg_catalog.clock_timestamp();

insert into public.food_entitlements(id, food_account_id, capability_key, status, starts_at)
select generated.id, generated.food_account_id, generated.capability_key, 'active', '2026-01-01T00:00:00Z'::timestamptz
from (values
  ('d7000000-0000-4000-8000-000000000001'::uuid, 'd4000000-0000-4000-8000-000000000001'::uuid, 'ordering.pickup'),
  ('d7000000-0000-4000-8000-000000000002'::uuid, 'd4000000-0000-4000-8000-000000000001'::uuid, 'menu.management'),
  ('d7000000-0000-4000-8000-000000000003'::uuid, 'd4000000-0000-4000-8000-000000000001'::uuid, 'orders.management'),
  ('d7000000-0000-4000-8000-000000000004'::uuid, 'd4000000-0000-4000-8000-000000000001'::uuid, 'demo.reset'),
  ('d7000000-0000-4000-8000-000000000005'::uuid, 'd4000000-0000-4000-8000-000000000002'::uuid, 'ordering.pickup'),
  ('d7000000-0000-4000-8000-000000000006'::uuid, 'd4000000-0000-4000-8000-000000000002'::uuid, 'menu.management'),
  ('d7000000-0000-4000-8000-000000000007'::uuid, 'd4000000-0000-4000-8000-000000000002'::uuid, 'orders.management')
) generated(id, food_account_id, capability_key)
on conflict (food_account_id, capability_key) do update set
  status = 'active', starts_at = excluded.starts_at, ends_at = null,
  updated_at = pg_catalog.clock_timestamp();

insert into public.restaurant_capabilities(id, food_account_id, location_id, capability_key, enabled)
select generated.id, generated.food_account_id, generated.location_id, generated.capability_key, true
from (values
  ('d7100000-0000-4000-8000-000000000001'::uuid, 'd4000000-0000-4000-8000-000000000001'::uuid, 'd5000000-0000-4000-8000-000000000001'::uuid, 'ordering.pickup'),
  ('d7100000-0000-4000-8000-000000000002'::uuid, 'd4000000-0000-4000-8000-000000000001'::uuid, 'd5000000-0000-4000-8000-000000000001'::uuid, 'menu.management'),
  ('d7100000-0000-4000-8000-000000000003'::uuid, 'd4000000-0000-4000-8000-000000000001'::uuid, 'd5000000-0000-4000-8000-000000000001'::uuid, 'orders.management'),
  ('d7100000-0000-4000-8000-000000000004'::uuid, 'd4000000-0000-4000-8000-000000000001'::uuid, 'd5000000-0000-4000-8000-000000000001'::uuid, 'demo.reset'),
  ('d7100000-0000-4000-8000-000000000005'::uuid, 'd4000000-0000-4000-8000-000000000002'::uuid, 'd5000000-0000-4000-8000-000000000002'::uuid, 'ordering.pickup'),
  ('d7100000-0000-4000-8000-000000000006'::uuid, 'd4000000-0000-4000-8000-000000000002'::uuid, 'd5000000-0000-4000-8000-000000000002'::uuid, 'menu.management'),
  ('d7100000-0000-4000-8000-000000000007'::uuid, 'd4000000-0000-4000-8000-000000000002'::uuid, 'd5000000-0000-4000-8000-000000000002'::uuid, 'orders.management')
) generated(id, food_account_id, location_id, capability_key)
on conflict (food_account_id, location_id, capability_key) do update set
  enabled = true, updated_at = pg_catalog.clock_timestamp();

insert into public.restaurant_tax_classes(id, food_account_id, code, name, rate_basis_points, valid_from)
values
  ('d7200000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'food_low', 'Food 9%', 900, '2026-01-01T00:00:00Z'),
  ('d7200000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001', 'food_high', 'Food 21%', 2100, '2026-01-01T00:00:00Z'),
  ('d7200000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000002', 'food_low', 'Synthetic Food 9%', 900, '2026-01-01T00:00:00Z')
on conflict (id) do update set
  name = excluded.name, rate_basis_points = excluded.rate_basis_points,
  active = true, updated_at = pg_catalog.clock_timestamp();

insert into public.menus(id, food_account_id, location_id, name, status, published_at)
values
  ('d8000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'Silverado demo-afhaalmenu', 'published', '2026-07-28T12:00:00Z'),
  ('d8000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000002', 'Synthetic isolation menu', 'published', '2026-07-28T12:00:00Z')
on conflict (id) do update set
  name = excluded.name, status = 'published', published_at = excluded.published_at,
  updated_at = pg_catalog.clock_timestamp();

insert into public.menu_categories(id, food_account_id, location_id, menu_id, name, sort_order)
values
  ('d9000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'Roti', 10),
  ('d9000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'Nasi & bami', 20),
  ('d9000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'Extra''s', 30),
  ('d9000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000002', 'Synthetic isolation', 10)
on conflict (id) do update set
  name = excluded.name, sort_order = excluded.sort_order, active = true,
  updated_at = pg_catalog.clock_timestamp();

insert into public.menu_items(
  id, food_account_id, location_id, category_id, tax_class_id,
  name, description, price_minor, active, available, sort_order, metadata
)
values
  ('da000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001','d7200000-0000-4000-8000-000000000001','Roti kipfilet','Synthetisch demogerecht.',1250,true,true,10,'{"synthetic":true}'),
  ('da000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001','d7200000-0000-4000-8000-000000000001','Roti kip','Synthetisch demogerecht.',1150,true,true,20,'{"synthetic":true}'),
  ('da000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001','d7200000-0000-4000-8000-000000000001','Rotirol kip','Synthetisch demogerecht.',850,true,true,30,'{"synthetic":true}'),
  ('da000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001','d7200000-0000-4000-8000-000000000001','Roti vegetarisch','Synthetisch demogerecht.',1050,true,true,40,'{"synthetic":true}'),
  ('da000000-0000-4000-8000-000000000005','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000002','d7200000-0000-4000-8000-000000000001','Nasi kip','Synthetisch demogerecht.',1150,true,true,10,'{"synthetic":true}'),
  ('da000000-0000-4000-8000-000000000006','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000002','d7200000-0000-4000-8000-000000000001','Nasi moksi','Synthetisch demogerecht.',1300,true,true,20,'{"synthetic":true}'),
  ('da000000-0000-4000-8000-000000000007','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000002','d7200000-0000-4000-8000-000000000001','Bami kip','Synthetisch demogerecht.',1150,true,true,30,'{"synthetic":true}'),
  ('da000000-0000-4000-8000-000000000008','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000003','d7200000-0000-4000-8000-000000000001','Rotiplaat','Synthetisch demogerecht.',300,true,true,10,'{"synthetic":true}'),
  ('da000000-0000-4000-8000-000000000009','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000003','d7200000-0000-4000-8000-000000000001','Krokante snack','Synthetisch demogerecht.',250,true,true,20,'{"synthetic":true}'),
  ('da000000-0000-4000-8000-000000000010','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000003','d7200000-0000-4000-8000-000000000001','Huisgemaakte sambal','Synthetisch demogerecht.',100,true,true,30,'{"synthetic":true}'),
  ('da000000-0000-4000-8000-000000000011','d4000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000002','d9000000-0000-4000-8000-000000000004','d7200000-0000-4000-8000-000000000003','Synthetic isolation item','Tenant-isolation control.',999,true,true,10,'{"synthetic":true,"isolation_control":true}')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_minor = excluded.price_minor,
  active = excluded.active,
  available = excluded.available,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = pg_catalog.clock_timestamp();

insert into public.food_demo_accounts(food_account_id, location_id, storefront_slug, enabled)
values ('d4000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'silverado-roti-shop-emmeloord', true)
on conflict (food_account_id) do update set
  location_id = excluded.location_id,
  storefront_slug = excluded.storefront_slug,
  enabled = true,
  updated_at = pg_catalog.clock_timestamp();

insert into public.food_demo_menu_item_baselines(
  food_account_id, menu_item_id, price_minor, available, active
)
select item.food_account_id, item.id, item.price_minor, item.available, item.active
from public.menu_items item
where item.food_account_id = 'd4000000-0000-4000-8000-000000000001'
on conflict (food_account_id, menu_item_id) do update set
  price_minor = excluded.price_minor,
  available = excluded.available,
  active = excluded.active;

commit;
