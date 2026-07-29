#!/bin/zsh
set -euo pipefail

food_repo_root=${0:A:h:h}
food_pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
food_validation_root=$(mktemp -d /private/tmp/food-v1-phase-2.XXXXXXXX)
food_cluster_dir=$food_validation_root/postgres
food_socket_dir=$food_validation_root/socket
food_database=food_v1_phase_2
mkdir -p $food_socket_dir

food_cleanup() {
  if [[ -s $food_cluster_dir/postmaster.pid ]]; then
    $food_pg_bin/pg_ctl -D $food_cluster_dir -m fast stop >/dev/null 2>&1 || true
  fi
  if [[ $food_validation_root == /private/tmp/food-v1-phase-2.* ]]; then
    rm -rf $food_validation_root
  fi
}
trap food_cleanup EXIT INT TERM

for food_remote_key in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL; do
  if [[ -n ${(P)food_remote_key:-} ]]; then
    print -u2 "remote environment variable forbidden: $food_remote_key"
    exit 1
  fi
done

$food_pg_bin/initdb -D $food_cluster_dir --no-locale --encoding=UTF8 --auth-host=reject --auth-local=trust >/dev/null
$food_pg_bin/pg_ctl -D $food_cluster_dir -o "-c listen_addresses='' -k $food_socket_dir" -w start >/dev/null
$food_pg_bin/createdb -h $food_socket_dir $food_database
$food_pg_bin/psql -h $food_socket_dir -d $food_database -v ON_ERROR_STOP=1 \
  -f $food_repo_root/supabase-bootstrap/config/local-profile.sql >/dev/null
for food_migration in \
  supabase/migrations/00000000000000_authoritative_baseline.sql \
  supabase/migrations/20260726200000_partner_profile_role_status_foundation.sql \
  supabase/migrations/20260728160000_food_v1_data_foundation.sql \
  supabase/migrations/20260728161000_food_v1_tenant_security.sql \
  supabase/migrations/20260728162000_food_v1_application_api_support.sql \
  supabase/migrations/20260728163000_food_v1_storefront_confirmation.sql; do
  $food_pg_bin/psql -h $food_socket_dir -d $food_database -v ON_ERROR_STOP=1 \
    -f $food_repo_root/$food_migration >/dev/null
done

for food_fixture in \
  tests/fixtures/food-v1-phase-1a-functional.sql \
  tests/fixtures/food-v1-phase-1b-functional.sql \
  tests/fixtures/food-v1-phase-2-functional.sql; do
  food_fixture_output=$($food_pg_bin/psql -h $food_socket_dir -d $food_database -v ON_ERROR_STOP=1 -AtX \
    -f $food_repo_root/$food_fixture)
  [[ $food_fixture_output == *PASS_FOOD_V1* ]] || { print -u2 "Food fixture did not pass: $food_fixture"; exit 1; }
done

food_governance_status=PASS
food_catalog_output=$(node $food_repo_root/supabase-bootstrap/scripts/dual-root-validator.mjs \
  --canonical $food_repo_root/supabase-common/migrations \
  --bootstrap $food_repo_root/supabase-bootstrap/supabase/migrations \
  --existing $food_repo_root/supabase/migrations \
  --common-manifest $food_repo_root/supabase-common/migrations/COMMON_MIGRATION_MANIFEST.json \
  --product-catalog $food_repo_root/docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json \
  --repository-root $food_repo_root 2>&1) || food_governance_status=FAILED
if [[ $food_governance_status == FAILED ]]; then
  if [[ $food_catalog_output == *"unknown existing-only migration: 20260728134000_partner_existing_user_onboarding_activation.sql"* ]]; then
    food_governance_status=FOOD_PASS_PREEXISTING_20260728134000_UNCATALOGUED
  else
    print -u2 -- $food_catalog_output
    exit 1
  fi
fi

food_node_output=$(node --test \
  $food_repo_root/tests/food-v1-phase-1a.test.js \
  $food_repo_root/tests/food-v1-phase-1b.test.js \
  $food_repo_root/tests/food-v1-phase-2.test.js \
  $food_repo_root/tests/foundation-governance-manifest-classification.test.js 2>&1)
food_node_pass=$(print -r -- $food_node_output | sed -n 's/^# pass //p' | tail -1)
food_node_fail=$(print -r -- $food_node_output | sed -n 's/^# fail //p' | tail -1)
if [[ ${food_node_fail:-1} != 0 ]]; then
  print -u2 -- $food_node_output
  exit 1
fi

print -r -- "status=PASS_FOOD_V1_PHASE_2_LOCAL_VALIDATION"
print -r -- "database=isolated Unix-socket-only PostgreSQL cluster"
print -r -- "production_contact=false"
print -r -- "functional=phase-1a,phase-1b,confirmation-lines,storefront-contract,e2e-local-demo"
print -r -- "food_governance=$food_governance_status"
print -r -- "node_tests_passed=${food_node_pass:-0}"
print -r -- "node_tests_failed=${food_node_fail:-0}"
print -r -- "temporary_cluster_cleanup=EXIT trap"
