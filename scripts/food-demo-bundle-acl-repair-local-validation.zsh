#!/bin/zsh
set -euo pipefail

bundle_acl_root=${0:A:h:h}
bundle_acl_pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
bundle_acl_validation_root=$(mktemp -d /private/tmp/food-demo-bundle-acl.XXXXXXXX)
bundle_acl_cluster=$bundle_acl_validation_root/postgres
bundle_acl_socket=$bundle_acl_validation_root/socket
bundle_acl_database=food_demo_bundle_acl
mkdir -p $bundle_acl_socket

bundle_acl_cleanup() {
  if [[ -s $bundle_acl_cluster/postmaster.pid ]]; then
    $bundle_acl_pg_bin/pg_ctl -D $bundle_acl_cluster -m fast stop >/dev/null 2>&1 || true
  fi
  if [[ $bundle_acl_validation_root == /private/tmp/food-demo-bundle-acl.* ]]; then
    rm -rf $bundle_acl_validation_root
  fi
}
trap bundle_acl_cleanup EXIT INT TERM

for bundle_acl_remote_key in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL; do
  if [[ -n ${(P)bundle_acl_remote_key:-} ]]; then
    print -u2 "remote environment variable forbidden: $bundle_acl_remote_key"
    exit 1
  fi
done

$bundle_acl_pg_bin/initdb -D $bundle_acl_cluster --no-locale --encoding=UTF8 --auth-host=reject --auth-local=trust >/dev/null
$bundle_acl_pg_bin/pg_ctl -D $bundle_acl_cluster -o "-c listen_addresses='' -k $bundle_acl_socket" -w start >/dev/null
$bundle_acl_pg_bin/createdb -h $bundle_acl_socket $bundle_acl_database
$bundle_acl_pg_bin/psql -h $bundle_acl_socket -d $bundle_acl_database -v ON_ERROR_STOP=1 \
  -f $bundle_acl_root/supabase-bootstrap/config/local-profile.sql >/dev/null

for bundle_acl_migration in \
  supabase/migrations/00000000000000_authoritative_baseline.sql \
  supabase/migrations/20260726200000_partner_profile_role_status_foundation.sql \
  supabase/migrations/20260729120000_factory_hub_projects.sql \
  supabase/migrations/20260729170000_food_demo_bundles.sql; do
  $bundle_acl_pg_bin/psql -h $bundle_acl_socket -d $bundle_acl_database -v ON_ERROR_STOP=1 \
    -f $bundle_acl_root/$bundle_acl_migration >/dev/null
done

# Reproduce the direct service_role grants present after the applied bundle migration.
$bundle_acl_pg_bin/psql -h $bundle_acl_socket -d $bundle_acl_database -v ON_ERROR_STOP=1 -c \
  "grant all privileges on table public.food_demo_bundles, public.food_demo_bundle_dispatches, public.food_demo_bundle_events, public.food_demo_bundle_rate_limits to service_role;" >/dev/null

$bundle_acl_pg_bin/psql -h $bundle_acl_socket -d $bundle_acl_database -v ON_ERROR_STOP=1 \
  -f $bundle_acl_root/supabase/migrations/20260729180000_food_demo_bundle_service_role_acl_repair.sql >/dev/null

bundle_acl_result=$($bundle_acl_pg_bin/psql -h $bundle_acl_socket -d $bundle_acl_database -v ON_ERROR_STOP=1 -AtX \
  -f $bundle_acl_root/tests/fixtures/food-demo-bundle-acl-repair-functional.sql)
[[ $bundle_acl_result == *PASS_FOOD_DEMO_BUNDLE_ACL_REPAIR_FUNCTIONAL* ]] || { print -u2 -- $bundle_acl_result; exit 1; }

print -r -- "status=PASS_FOOD_DEMO_BUNDLE_ACL_REPAIR_LOCAL_VALIDATION"
print -r -- "database=isolated Unix-socket-only PostgreSQL cluster"
print -r -- "direct_service_role_bundle_table_access=denied"
print -r -- "bounded_bundle_rpcs=passed"
print -r -- "relationship_scope_and_audit=passed"
print -r -- "production_contact=false"
print -r -- "temporary_cluster_cleanup=EXIT trap"
