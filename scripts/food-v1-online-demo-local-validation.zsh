#!/bin/zsh
set -euo pipefail

food_demo_root=${0:A:h:h}
food_demo_pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
food_demo_validation_root=$(mktemp -d /private/tmp/food-v1-online-demo.XXXXXXXX)
food_demo_cluster=$food_demo_validation_root/postgres
food_demo_socket=$food_demo_validation_root/socket
food_demo_database=food_v1_online_demo
mkdir -p $food_demo_socket

food_demo_cleanup() {
  if [[ -s $food_demo_cluster/postmaster.pid ]]; then
    $food_demo_pg_bin/pg_ctl -D $food_demo_cluster -m fast stop >/dev/null 2>&1 || true
  fi
  if [[ $food_demo_validation_root == /private/tmp/food-v1-online-demo.* ]]; then
    rm -rf $food_demo_validation_root
  fi
}
trap food_demo_cleanup EXIT INT TERM

for food_demo_remote_key in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL; do
  if [[ -n ${(P)food_demo_remote_key:-} ]]; then
    print -u2 "remote environment variable forbidden: $food_demo_remote_key"
    exit 1
  fi
done

$food_demo_pg_bin/initdb -D $food_demo_cluster --no-locale --encoding=UTF8 --auth-host=reject --auth-local=trust >/dev/null
$food_demo_pg_bin/pg_ctl -D $food_demo_cluster -o "-c listen_addresses='' -k $food_demo_socket" -w start >/dev/null
$food_demo_pg_bin/createdb -h $food_demo_socket $food_demo_database
$food_demo_pg_bin/psql -h $food_demo_socket -d $food_demo_database -v ON_ERROR_STOP=1 \
  -f $food_demo_root/supabase-bootstrap/config/local-profile.sql >/dev/null

for food_demo_migration in \
  supabase/migrations/00000000000000_authoritative_baseline.sql \
  supabase/migrations/20260726200000_partner_profile_role_status_foundation.sql \
  supabase/migrations/20260728160000_food_v1_data_foundation.sql \
  supabase/migrations/20260728161000_food_v1_tenant_security.sql \
  supabase/migrations/20260728162000_food_v1_application_api_support.sql \
  supabase/migrations/20260728163000_food_v1_storefront_confirmation.sql \
  supabase/migrations/20260728210000_food_v1_online_demo_reset.sql; do
  $food_demo_pg_bin/psql -h $food_demo_socket -d $food_demo_database -v ON_ERROR_STOP=1 \
    -f $food_demo_root/$food_demo_migration >/dev/null
done

for food_demo_seed_run in 1 2; do
  $food_demo_pg_bin/psql -h $food_demo_socket -d $food_demo_database -v ON_ERROR_STOP=1 \
    -f $food_demo_root/supabase/demo/food-v1-online-demo-seed.sql >/dev/null
done

food_demo_fixture_output=$($food_demo_pg_bin/psql -h $food_demo_socket -d $food_demo_database \
  -v ON_ERROR_STOP=1 -AtX -f $food_demo_root/tests/fixtures/food-v1-online-demo-reset-functional.sql)
[[ $food_demo_fixture_output == *PASS_FOOD_V1_ONLINE_DEMO_RESET_FUNCTIONAL* ]] || {
  print -u2 -- $food_demo_fixture_output
  exit 1
}

print -r -- "status=PASS_FOOD_V1_ONLINE_DEMO_LOCAL_VALIDATION"
print -r -- "database=isolated Unix-socket-only PostgreSQL cluster"
print -r -- "seed_runs=2"
print -r -- "tenant_isolation=verified"
print -r -- "reset_idempotency=verified"
print -r -- "reset_rate_limit=verified"
print -r -- "production_contact=false"
print -r -- "temporary_cluster_cleanup=EXIT trap"
