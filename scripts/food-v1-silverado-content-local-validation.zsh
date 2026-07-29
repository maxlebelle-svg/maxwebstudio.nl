#!/bin/zsh
set -euo pipefail

silverado_root=${0:A:h:h}
silverado_pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
silverado_validation_root=$(mktemp -d /private/tmp/food-v1-silverado-content.XXXXXXXX)
silverado_cluster=$silverado_validation_root/postgres
silverado_socket=$silverado_validation_root/socket
silverado_database=food_v1_silverado_content
mkdir -p $silverado_socket

silverado_cleanup() {
  if [[ -s $silverado_cluster/postmaster.pid ]]; then
    $silverado_pg_bin/pg_ctl -D $silverado_cluster -m fast stop >/dev/null 2>&1 || true
  fi
  if [[ $silverado_validation_root == /private/tmp/food-v1-silverado-content.* ]]; then
    rm -rf $silverado_validation_root
  fi
}
trap silverado_cleanup EXIT INT TERM

for silverado_remote_key in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL; do
  if [[ -n ${(P)silverado_remote_key:-} ]]; then
    print -u2 "remote environment variable forbidden: $silverado_remote_key"
    exit 1
  fi
done

$silverado_pg_bin/initdb -D $silverado_cluster --no-locale --encoding=UTF8 --auth-host=reject --auth-local=trust >/dev/null
$silverado_pg_bin/pg_ctl -D $silverado_cluster -o "-c listen_addresses='' -k $silverado_socket" -w start >/dev/null
$silverado_pg_bin/createdb -h $silverado_socket $silverado_database
$silverado_pg_bin/psql -h $silverado_socket -d $silverado_database -v ON_ERROR_STOP=1 \
  -f $silverado_root/supabase-bootstrap/config/local-profile.sql >/dev/null

for silverado_migration in \
  supabase/migrations/00000000000000_authoritative_baseline.sql \
  supabase/migrations/20260726200000_partner_profile_role_status_foundation.sql \
  supabase/migrations/20260728160000_food_v1_data_foundation.sql \
  supabase/migrations/20260728161000_food_v1_tenant_security.sql \
  supabase/migrations/20260728162000_food_v1_application_api_support.sql \
  supabase/migrations/20260728163000_food_v1_storefront_confirmation.sql \
  supabase/migrations/20260728210000_food_v1_online_demo_reset.sql \
  supabase/migrations/20260728211000_food_v1_service_role_order_acl_hardening.sql; do
  $silverado_pg_bin/psql -h $silverado_socket -d $silverado_database -v ON_ERROR_STOP=1 \
    -f $silverado_root/$silverado_migration >/dev/null
done

$silverado_pg_bin/psql -h $silverado_socket -d $silverado_database -v ON_ERROR_STOP=1 \
  -f $silverado_root/supabase/demo/food-v1-online-demo-seed.sql >/dev/null

for silverado_content_run in 1 2; do
  $silverado_pg_bin/psql -h $silverado_socket -d $silverado_database -v ON_ERROR_STOP=1 \
    -f $silverado_root/supabase/demo/food-v1-silverado-demo-content.sql >/dev/null
done

silverado_result=$($silverado_pg_bin/psql -h $silverado_socket -d $silverado_database -v ON_ERROR_STOP=1 -AtX <<'SQL'
do $validation$
declare
  actual jsonb;
  expected constant jsonb := '[
    {"name":"Roti kip filet met groenten en ei","price_minor":1000},
    {"name":"Roti drumsticks","price_minor":900},
    {"name":"Roti rol","price_minor":800},
    {"name":"Nasi kippenbout","price_minor":900},
    {"name":"Nasi moksi (mix)","price_minor":1000},
    {"name":"Bami kippen bout","price_minor":900},
    {"name":"Bami moksi (mix)","price_minor":1000},
    {"name":"Loempia''s 5 stuks","price_minor":750}
  ]'::jsonb;
begin
  select jsonb_agg(jsonb_build_object('name', item.name, 'price_minor', item.price_minor) order by item.id)
    into actual
  from public.menu_items item
  where item.food_account_id = 'd4000000-0000-4000-8000-000000000001'
    and item.active = true;

  if actual <> expected then
    raise exception 'Unexpected Silverado product set: %', actual;
  end if;

  if (select count(*) from public.menu_items where food_account_id = 'd4000000-0000-4000-8000-000000000001' and active = false) <> 2 then
    raise exception 'Expected exactly two retired Silverado pilot products.';
  end if;

  if (select count(*) from public.food_demo_menu_item_baselines baseline join public.menu_items item on item.id = baseline.menu_item_id where baseline.food_account_id = 'd4000000-0000-4000-8000-000000000001' and baseline.active = item.active and baseline.available = item.available and baseline.price_minor = item.price_minor) <> 10 then
    raise exception 'Silverado reset baseline is not aligned.';
  end if;

  if (select count(*) from public.menu_items where food_account_id = 'd4000000-0000-4000-8000-000000000002' and active = true) <> 1 then
    raise exception 'Isolation tenant changed unexpectedly.';
  end if;

  if exists (select 1 from public.food_orders) then
    raise exception 'Content validation left order data behind.';
  end if;
end
$validation$;

select 'PASS_FOOD_V1_SILVERADO_CONTENT_LOCAL_VALIDATION';
SQL
)

[[ $silverado_result == *PASS_FOOD_V1_SILVERADO_CONTENT_LOCAL_VALIDATION* ]] || {
  print -u2 -- $silverado_result
  exit 1
}

print -r -- "status=PASS_FOOD_V1_SILVERADO_CONTENT_LOCAL_VALIDATION"
print -r -- "database=isolated Unix-socket-only PostgreSQL cluster"
print -r -- "content_runs=2"
print -r -- "active_products=8"
print -r -- "retired_products=2"
print -r -- "reset_baseline=aligned"
print -r -- "isolation_tenant=unchanged"
print -r -- "production_contact=false"
