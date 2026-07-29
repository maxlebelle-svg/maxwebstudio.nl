#!/bin/zsh
set -euo pipefail

food_acl_root=${0:A:h:h}
food_acl_pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
food_acl_validation_root=$(mktemp -d /private/tmp/food-v1-service-role-acl.XXXXXXXX)
food_acl_cluster=$food_acl_validation_root/postgres
food_acl_socket=$food_acl_validation_root/socket
food_acl_database=food_v1_service_role_acl
mkdir -p $food_acl_socket

food_acl_cleanup() {
  if [[ -s $food_acl_cluster/postmaster.pid ]]; then
    $food_acl_pg_bin/pg_ctl -D $food_acl_cluster -m fast stop >/dev/null 2>&1 || true
  fi
  if [[ $food_acl_validation_root == /private/tmp/food-v1-service-role-acl.* ]]; then
    rm -rf $food_acl_validation_root
  fi
}
trap food_acl_cleanup EXIT INT TERM

for food_acl_remote_key in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL; do
  if [[ -n ${(P)food_acl_remote_key:-} ]]; then
    print -u2 "remote environment variable forbidden: $food_acl_remote_key"
    exit 1
  fi
done

$food_acl_pg_bin/initdb -D $food_acl_cluster --no-locale --encoding=UTF8 --auth-host=reject --auth-local=trust >/dev/null
$food_acl_pg_bin/pg_ctl -D $food_acl_cluster -o "-c listen_addresses='' -k $food_acl_socket" -w start >/dev/null
$food_acl_pg_bin/createdb -h $food_acl_socket $food_acl_database
$food_acl_pg_bin/psql -h $food_acl_socket -d $food_acl_database -v ON_ERROR_STOP=1 \
  -f $food_acl_root/supabase-bootstrap/config/local-profile.sql >/dev/null

for food_acl_migration in \
  supabase/migrations/00000000000000_authoritative_baseline.sql \
  supabase/migrations/20260726200000_partner_profile_role_status_foundation.sql \
  supabase/migrations/20260728160000_food_v1_data_foundation.sql \
  supabase/migrations/20260728161000_food_v1_tenant_security.sql \
  supabase/migrations/20260728162000_food_v1_application_api_support.sql \
  supabase/migrations/20260728163000_food_v1_storefront_confirmation.sql \
  supabase/migrations/20260728210000_food_v1_online_demo_reset.sql; do
  $food_acl_pg_bin/psql -h $food_acl_socket -d $food_acl_database -v ON_ERROR_STOP=1 \
    -f $food_acl_root/$food_acl_migration >/dev/null
done

# Reproduce Supabase's postgres-owned public-schema defaults that exposed the remote finding.
$food_acl_pg_bin/psql -h $food_acl_socket -d $food_acl_database -v ON_ERROR_STOP=1 -c \
  "grant all privileges on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;" >/dev/null

$food_acl_pg_bin/psql -h $food_acl_socket -d $food_acl_database -v ON_ERROR_STOP=1 \
  -f $food_acl_root/supabase/migrations/20260728211000_food_v1_service_role_order_acl_hardening.sql >/dev/null

food_acl_phase_1a=$($food_acl_pg_bin/psql -h $food_acl_socket -d $food_acl_database -v ON_ERROR_STOP=1 -AtX \
  -f $food_acl_root/tests/fixtures/food-v1-phase-1a-functional.sql)
[[ $food_acl_phase_1a == *PASS_FOOD_V1_PHASE_1A_FUNCTIONAL* ]] || { print -u2 -- $food_acl_phase_1a; exit 1; }

food_acl_phase_1b=$($food_acl_pg_bin/psql -h $food_acl_socket -d $food_acl_database -v ON_ERROR_STOP=1 -AtX \
  -f $food_acl_root/tests/fixtures/food-v1-phase-1b-functional.sql)
[[ $food_acl_phase_1b == *PASS_FOOD_V1_PHASE_1B_FUNCTIONAL* ]] || { print -u2 -- $food_acl_phase_1b; exit 1; }

for food_acl_seed_run in 1 2; do
  $food_acl_pg_bin/psql -h $food_acl_socket -d $food_acl_database -v ON_ERROR_STOP=1 \
    -f $food_acl_root/supabase/demo/food-v1-online-demo-seed.sql >/dev/null
done

food_acl_reset=$($food_acl_pg_bin/psql -h $food_acl_socket -d $food_acl_database -v ON_ERROR_STOP=1 -AtX \
  -f $food_acl_root/tests/fixtures/food-v1-online-demo-reset-functional.sql)
[[ $food_acl_reset == *PASS_FOOD_V1_ONLINE_DEMO_RESET_FUNCTIONAL* ]] || { print -u2 -- $food_acl_reset; exit 1; }

food_acl_poststate=$($food_acl_pg_bin/psql -h $food_acl_socket -d $food_acl_database -v ON_ERROR_STOP=1 -AtX \
  -f $food_acl_root/tests/fixtures/food-v1-service-role-acl-repair-functional.sql)
[[ $food_acl_poststate == *PASS_FOOD_V1_SERVICE_ROLE_ACL_REPAIR_FUNCTIONAL* ]] || { print -u2 -- $food_acl_poststate; exit 1; }

print -r -- "status=PASS_FOOD_V1_SERVICE_ROLE_ACL_REPAIR_LOCAL_VALIDATION"
print -r -- "database=isolated Unix-socket-only PostgreSQL cluster"
print -r -- "supabase_default_acl_reproduction=true"
print -r -- "direct_service_role_order_mutations=denied"
print -r -- "controlled_order_rpcs=passed"
print -r -- "demo_reset_and_isolation=passed"
print -r -- "production_contact=false"
print -r -- "temporary_cluster_cleanup=EXIT trap"
