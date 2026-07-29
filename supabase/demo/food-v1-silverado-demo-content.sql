-- Idempotent presentation-content update for the isolated Food Demo Cloud only.
-- Uses only public Silverado business information and synthetic demo identifiers.
begin;

do $preflight$
begin
  if not exists (
    select 1
    from public.food_accounts account
    join public.restaurant_locations location on location.food_account_id = account.id
    where account.id = 'd4000000-0000-4000-8000-000000000001'
      and location.id = 'd5000000-0000-4000-8000-000000000001'
      and location.slug = 'silverado-roti-shop-emmeloord'
      and account.metadata @> '{"synthetic_demo":true}'::jsonb
  ) then
    raise exception using errcode = '55000', message = 'Silverado content target is not the isolated synthetic demo tenant.';
  end if;

  if exists (
    select 1 from public.food_orders
    where food_account_id = 'd4000000-0000-4000-8000-000000000001'
  ) then
    raise exception using errcode = '55000', message = 'Reset Silverado demo orders before applying the content update.';
  end if;
end
$preflight$;

update public.food_accounts
set name = 'Silverado Roti Shop', updated_at = pg_catalog.clock_timestamp()
where id = 'd4000000-0000-4000-8000-000000000001';

update public.restaurant_locations
set name = 'Silverado Roti Shop',
    phone = '06 38975574',
    street = 'Houttuinen',
    house_number = '166',
    postal_code = '8301 XP',
    city = 'Emmeloord',
    country_code = 'NL',
    configuration = '{
      "public": {
        "intro": "Ontdek de smaken van Suriname bij Silverado in Emmeloord. Gerechten worden met liefde en passie bereid.",
        "logo_url": "/assets/food/silverado/silverado-mark.svg",
        "logo_text": "Silverado",
        "logo_suffix": "🇸🇷",
        "hero_image_url": "/assets/food/silverado/hero-roti.jpg",
        "opening_hours": {
          "monday": [{"open":"15:00","close":"19:00"}],
          "tuesday": [{"open":"15:00","close":"19:00"}],
          "wednesday": [{"open":"15:00","close":"19:00"}],
          "thursday": [{"open":"15:00","close":"19:00"}],
          "friday": [{"open":"15:00","close":"19:00"}],
          "saturday": [],
          "sunday": []
        }
      }
    }'::jsonb,
    updated_at = pg_catalog.clock_timestamp()
where id = 'd5000000-0000-4000-8000-000000000001'
  and food_account_id = 'd4000000-0000-4000-8000-000000000001';

update public.menus
set name = 'Silverado afhaalmenu', updated_at = pg_catalog.clock_timestamp()
where id = 'd8000000-0000-4000-8000-000000000001'
  and food_account_id = 'd4000000-0000-4000-8000-000000000001';

with desired(id, category_id, name, description, price_minor, sort_order, image_url) as (
  values
    ('da000000-0000-4000-8000-000000000001'::uuid, 'd9000000-0000-4000-8000-000000000001'::uuid, 'Roti kip filet met groenten en ei', 'Kipfilet met aardappel, groenten, ei en roti.', 1000, 10, '/assets/food/silverado/hero-roti.jpg'),
    ('da000000-0000-4000-8000-000000000002'::uuid, 'd9000000-0000-4000-8000-000000000001'::uuid, 'Roti drumsticks', 'Roti met drumsticks, aardappel, groenten en ei.', 900, 20, '/assets/food/silverado/roti-drumsticks.jpg'),
    ('da000000-0000-4000-8000-000000000003'::uuid, 'd9000000-0000-4000-8000-000000000001'::uuid, 'Roti rol', 'Gevulde rotirol met kip, aardappel en groenten.', 800, 30, '/assets/food/silverado/roti-roll.jpg'),
    ('da000000-0000-4000-8000-000000000005'::uuid, 'd9000000-0000-4000-8000-000000000002'::uuid, 'Nasi kippenbout', 'Surinaamse nasi met kippenbout.', 900, 10, '/assets/food/silverado/nasi-moksi.jpg'),
    ('da000000-0000-4000-8000-000000000006'::uuid, 'd9000000-0000-4000-8000-000000000002'::uuid, 'Nasi moksi (mix)', 'Surinaamse nasi met een mix van vlees en kip.', 1000, 20, '/assets/food/silverado/nasi-moksi.jpg'),
    ('da000000-0000-4000-8000-000000000007'::uuid, 'd9000000-0000-4000-8000-000000000002'::uuid, 'Bami kippen bout', 'Surinaamse bami met kippenbout.', 900, 30, '/assets/food/silverado/bami-moksi.jpg'),
    ('da000000-0000-4000-8000-000000000008'::uuid, 'd9000000-0000-4000-8000-000000000002'::uuid, 'Bami moksi (mix)', 'Surinaamse bami met een mix van vlees en kip.', 1000, 40, '/assets/food/silverado/bami-moksi.jpg'),
    ('da000000-0000-4000-8000-000000000009'::uuid, 'd9000000-0000-4000-8000-000000000003'::uuid, 'Loempia''s 5 stuks', 'Vijf krokante loempia''s met chilisaus.', 750, 10, '/assets/food/silverado/loempias-5.jpg')
)
update public.menu_items item
set category_id = desired.category_id,
    name = desired.name,
    description = desired.description,
    price_minor = desired.price_minor,
    active = true,
    available = true,
    sort_order = desired.sort_order,
    metadata = jsonb_build_object('synthetic', true, 'public', jsonb_build_object('image_url', desired.image_url)),
    updated_at = pg_catalog.clock_timestamp()
from desired
where item.id = desired.id
  and item.food_account_id = 'd4000000-0000-4000-8000-000000000001'
  and item.location_id = 'd5000000-0000-4000-8000-000000000001';

update public.menu_items
set active = false, available = false, updated_at = pg_catalog.clock_timestamp()
where food_account_id = 'd4000000-0000-4000-8000-000000000001'
  and id in (
    'da000000-0000-4000-8000-000000000004',
    'da000000-0000-4000-8000-000000000010'
  );

insert into public.food_demo_menu_item_baselines(food_account_id, menu_item_id, price_minor, available, active)
select item.food_account_id, item.id, item.price_minor, item.available, item.active
from public.menu_items item
where item.food_account_id = 'd4000000-0000-4000-8000-000000000001'
on conflict (food_account_id, menu_item_id) do update set
  price_minor = excluded.price_minor,
  available = excluded.available,
  active = excluded.active;

do $postcondition$
declare
  active_count integer;
begin
  select count(*) into active_count
  from public.menu_items
  where food_account_id = 'd4000000-0000-4000-8000-000000000001'
    and location_id = 'd5000000-0000-4000-8000-000000000001'
    and active = true;

  if active_count <> 8 then
    raise exception using errcode = '55000', message = 'Silverado content update must leave exactly eight active demo products.';
  end if;
end
$postcondition$;

commit;
