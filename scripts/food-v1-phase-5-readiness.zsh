#!/bin/zsh
set -euo pipefail

food_phase5_root=${0:A:h:h}

for food_phase5_remote_key in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL; do
  if [[ -n ${(P)food_phase5_remote_key:-} ]]; then
    print -u2 "remote environment variable forbidden: $food_phase5_remote_key"
    exit 1
  fi
done

cd $food_phase5_root

node --check functions/_food-api.js
node --check public/food/storefront.js
node --check public/admin/food/dashboard.js
node --check public/admin/food/dashboard-bootstrap.js
node --check scripts/food-v1-phase-3-demo-server.mjs

food_phase5_node_output=$(node --test \
  tests/food-v1-phase-1a.test.js \
  tests/food-v1-phase-1b.test.js \
  tests/food-v1-phase-2.test.js \
  tests/food-v1-phase-3.test.js \
  tests/food-v1-phase-4.test.js \
  tests/food-v1-phase-5.test.js \
  tests/admin-auth-guard.test.js \
  tests/admin-sidebar-rollout.test.js \
  tests/access-governance.test.js 2>&1)
food_phase5_node_pass=$(print -r -- $food_phase5_node_output | sed -n 's/^# pass //p' | tail -1)
food_phase5_node_fail=$(print -r -- $food_phase5_node_output | sed -n 's/^# fail //p' | tail -1)
if [[ ${food_phase5_node_fail:-1} != 0 ]]; then
  print -u2 -- $food_phase5_node_output
  exit 1
fi

food_phase5_database_output=$($food_phase5_root/scripts/food-v1-phase-2-local-validation.zsh)
[[ $food_phase5_database_output == *"status=PASS_FOOD_V1_PHASE_2_LOCAL_VALIDATION"* ]] || {
  print -u2 -- $food_phase5_database_output
  exit 1
}

git diff --check

print -r -- "status=PASS_FOOD_V1_PHASE_5_DEMO_READY_LOCAL"
print -r -- "production_contact=false"
print -r -- "providers_contacted=false"
print -r -- "node_tests_passed=${food_phase5_node_pass:-0}"
print -r -- "node_tests_failed=${food_phase5_node_fail:-0}"
print -r -- "database_validation=PASS_FOOD_V1_PHASE_2_LOCAL_VALIDATION"
print -r -- "demo_reset=verified"
print -r -- "integrations=truthful_status_only"
