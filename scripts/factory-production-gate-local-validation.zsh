#!/bin/zsh
set -euo pipefail

gate_root=${0:A:h:h}
gate_pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
gate_validation_root=$(mktemp -d /private/tmp/factory-production-gate.XXXXXXXX)
gate_cluster=$gate_validation_root/postgres
gate_socket=$gate_validation_root/socket
gate_database=factory_production_gate
mkdir -p $gate_socket

gate_cleanup() {
  if [[ -s $gate_cluster/postmaster.pid ]]; then $gate_pg_bin/pg_ctl -D $gate_cluster -m fast stop >/dev/null 2>&1 || true; fi
  if [[ $gate_validation_root == /private/tmp/factory-production-gate.* ]]; then rm -rf $gate_validation_root; fi
}
trap gate_cleanup EXIT INT TERM

for gate_remote_key in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL; do
  if [[ -n ${(P)gate_remote_key:-} ]]; then print -u2 "remote environment variable forbidden: $gate_remote_key"; exit 1; fi
done

$gate_pg_bin/initdb -D $gate_cluster --no-locale --encoding=UTF8 --auth-host=reject --auth-local=trust >/dev/null
$gate_pg_bin/pg_ctl -D $gate_cluster -o "-c listen_addresses='' -k $gate_socket" -w start >/dev/null
$gate_pg_bin/createdb -h $gate_socket $gate_database
$gate_pg_bin/psql -h $gate_socket -d $gate_database -v ON_ERROR_STOP=1 -f $gate_root/supabase-bootstrap/config/local-profile.sql >/dev/null
for migration in \
  supabase/migrations/00000000000000_authoritative_baseline.sql \
  supabase/migrations/20260726200000_partner_profile_role_status_foundation.sql \
  supabase/migrations/20260729120000_factory_hub_projects.sql \
  supabase/migrations/20260729200000_factory_production_gate.sql; do
  $gate_pg_bin/psql -h $gate_socket -d $gate_database -v ON_ERROR_STOP=1 -f $gate_root/$migration >/dev/null
done

gate_result=$($gate_pg_bin/psql -h $gate_socket -d $gate_database -v ON_ERROR_STOP=1 -AtX -f $gate_root/tests/fixtures/factory-production-gate-functional.sql)
[[ $gate_result == *PASS_FACTORY_PRODUCTION_GATE_FUNCTIONAL* ]] || { print -u2 -- $gate_result; exit 1; }

$gate_pg_bin/psql -h $gate_socket -d $gate_database -v ON_ERROR_STOP=1 \
  -f $gate_root/supabase/migrations/20260730120000_harden_factory_gate_generation_and_audit.sql >/dev/null
gate_hardening_result=$($gate_pg_bin/psql -h $gate_socket -d $gate_database -v ON_ERROR_STOP=1 -AtX \
  -f $gate_root/tests/fixtures/factory-production-gate-generation-functional.sql)
[[ $gate_hardening_result == *PASS_FACTORY_GATE_GENERATION_AND_AUDIT_FUNCTIONAL* ]] || { print -u2 -- $gate_hardening_result; exit 1; }

print -r -- "status=PASS_FACTORY_PRODUCTION_GATE_LOCAL_VALIDATION"
print -r -- "database=isolated Unix-socket-only PostgreSQL cluster"
print -r -- "direct_live_and_caller_evidence=denied"
print -r -- "roles_overrides_audit_invalidation=passed"
print -r -- "project_generation_binding_and_replay=passed"
print -r -- "tenant_scope=passed"
print -r -- "production_contact=false"
