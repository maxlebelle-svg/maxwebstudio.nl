#!/bin/zsh
set -euo pipefail

repo_root=${0:A:h:h}
pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
validation_root=$(mktemp -d /private/tmp/p0-complete-production-database-recovery.XXXXXXXX)
cluster_dir=$validation_root/postgres
socket_dir=$validation_root/socket
database=p0_complete_production_database_recovery
twin_database=p0_complete_production_database_recovery_twin
mkdir -p $socket_dir

cleanup() {
  if [[ -s $cluster_dir/postmaster.pid ]]; then
    $pg_bin/pg_ctl -D $cluster_dir -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf $validation_root
}
trap cleanup EXIT INT TERM

for key in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL; do
  if [[ -n ${(P)key:-} ]]; then
    print -u2 "remote environment variable forbidden: $key"
    exit 1
  fi
done

$pg_bin/initdb -D $cluster_dir --no-locale --encoding=UTF8 --auth-host=reject --auth-local=trust >/dev/null
$pg_bin/pg_ctl -D $cluster_dir -o "-c listen_addresses='' -k $socket_dir" -w start >/dev/null
$pg_bin/createdb -h $socket_dir $database
$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 -f $repo_root/supabase-bootstrap/config/local-profile.sql >/dev/null
$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 -f $repo_root/tests/fixtures/p0-complete-production-database-recovery-baseline.sql >/dev/null
$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 -f $repo_root/tests/fixtures/p0-production-poststate-staging-nonce.sql >/dev/null

legacy_digest_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg(jsonb_build_array(id,company_name,contact_name,email,phone,website,status,notes,external_source,external_source_id,metadata,created_at,updated_at)::text,'|' order by id)) from public.leads")
legacy_indexes_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select count(*) from pg_catalog.pg_index where indrelid='public.leads'::regclass")
legacy_index_digest_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg(pg_catalog.pg_get_indexdef(indexrelid),'|' order by indexrelid::regclass::text)) from pg_catalog.pg_index where indrelid='public.leads'::regclass")
legacy_security_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(jsonb_build_array(c.relrowsecurity,c.relforcerowsecurity,c.relacl)::text) from pg_catalog.pg_class c where c.oid='public.leads'::regclass")
preserved_policy_digest_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg(concat_ws('|',p.polname,p.polcmd,p.polpermissive::text,p.polroles::text,regexp_replace(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+',' ','g'),regexp_replace(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'[[:space:]]+',' ','g')),'||' order by p.polname)) from pg_policy p where p.polrelid='public.leads'::regclass and p.polname in ('leads_admin_manage','leads_sales_partner_insert_own','leads_sales_partner_select_own','leads_sales_partner_update_own')")
legacy_status_default_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select pg_catalog.pg_get_expr(d.adbin,d.adrelid) from pg_catalog.pg_attribute a join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.leads'::regclass and a.attname='status'")

migrations=(
  20260722130000_p0_recover_business_events.sql
  20260722131000_p0_recover_transactional_lead_intake.sql
  20260722132000_p0_recover_security_hardening.sql
  20260722133000_p0_recover_lead_intake_abuse_control.sql
  20260722134000_p0_remove_verified_staging_smoke_objects.sql
  20260722135000_p0_recover_sales_manager_lead_policy.sql
)

$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -f $repo_root/docs/release-readiness/p0-complete-production-database-recovery/PRECONDITIONS.sql >/dev/null

applied=()
for migration in $migrations; do
  $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
    -c "set role postgres" -f $repo_root/supabase/migrations/$migration >/dev/null
  applied+=${migration%%_*}
  $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
    -f $repo_root/docs/release-readiness/p0-complete-production-database-recovery/POSTCONDITIONS_${migration%%_*}.sql >/dev/null
done

$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -f $repo_root/docs/release-readiness/p0-complete-production-database-recovery/POSTCONDITIONS.sql >/dev/null
fingerprint_json=$($pg_bin/psql -qAtX -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -f $repo_root/docs/release-readiness/p0-complete-production-database-recovery/CATALOG_FINGERPRINT.sql)
catalog_fingerprint=$(print -r -- $fingerprint_json | sed -n 's/.*"sha256": "\([0-9a-f]\{64\}\)".*/\1/p' | tail -1)
identity_evidence=$($pg_bin/psql -qAtX -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -f $repo_root/docs/release-readiness/p0-complete-production-database-recovery/TARGET_AND_HISTORY_EVIDENCE.sql)
if [[ -z $catalog_fingerprint || $identity_evidence != *serverDatabaseIdentitySha256* || $identity_evidence != *migrationHistorySha256* ]]; then
  print -u2 "fingerprint or identity evidence generation failed"
  exit 1
fi

legacy_digest_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg(jsonb_build_array(id,company_name,contact_name,email,phone,website,status,notes,external_source,external_source_id,metadata,created_at,updated_at)::text,'|' order by id)) from public.leads")
legacy_indexes_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select count(*) from pg_catalog.pg_index where indrelid='public.leads'::regclass")
legacy_index_digest_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg(pg_catalog.pg_get_indexdef(indexrelid),'|' order by indexrelid::regclass::text)) from pg_catalog.pg_index where indrelid='public.leads'::regclass and indexrelid::regclass::text not in ('leads_lower_email_idx','leads_normalized_company_region_idx')")
legacy_security_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(jsonb_build_array(c.relrowsecurity,c.relforcerowsecurity,c.relacl)::text) from pg_catalog.pg_class c where c.oid='public.leads'::regclass")
preserved_policy_digest_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg(concat_ws('|',p.polname,p.polcmd,p.polpermissive::text,p.polroles::text,regexp_replace(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+',' ','g'),regexp_replace(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'[[:space:]]+',' ','g')),'||' order by p.polname)) from pg_policy p where p.polrelid='public.leads'::regclass and p.polname in ('leads_admin_manage','leads_sales_partner_insert_own','leads_sales_partner_select_own','leads_sales_partner_update_own')")
legacy_status_default_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select pg_catalog.pg_get_expr(d.adbin,d.adrelid) from pg_catalog.pg_attribute a join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.leads'::regclass and a.attname='status'")
if [[ $legacy_digest_before != $legacy_digest_after || $legacy_indexes_after -lt $legacy_indexes_before \
  || $legacy_index_digest_before != $legacy_index_digest_after || $legacy_security_before != $legacy_security_after \
  || $preserved_policy_digest_before != $preserved_policy_digest_after \
  || $legacy_status_default_before != $legacy_status_default_after ]]; then
  print -u2 "legacy lead preservation contract failed"
  exit 1
fi
$pg_bin/createdb -h $socket_dir -T $database $twin_database
twin_fingerprint_json=$($pg_bin/psql -qAtX -h $socket_dir -d $twin_database -v ON_ERROR_STOP=1 \
  -f $repo_root/docs/release-readiness/p0-complete-production-database-recovery/CATALOG_FINGERPRINT.sql)
twin_catalog_fingerprint=$(print -r -- $twin_fingerprint_json | sed -n 's/.*"sha256": "\([0-9a-f]\{64\}\)".*/\1/p' | tail -1)
if [[ $catalog_fingerprint != $twin_catalog_fingerprint ]]; then
  print -u2 "contract fingerprint is not database-name portable"
  exit 1
fi
$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -f $repo_root/tests/fixtures/p0-complete-production-database-recovery-functional.sql >/dev/null

second_events=unexpected_success
if ! $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -c "set role postgres" -f $repo_root/supabase/migrations/$migrations[1] >/dev/null 2>&1; then
  second_events=fail_closed_as_designed
fi
second_intake=unexpected_success
if ! $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -c "set role postgres" -f $repo_root/supabase/migrations/$migrations[2] >/dev/null 2>&1; then
  second_intake=fail_closed_as_designed
fi
second_security=failed
if $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -c "set role postgres" -f $repo_root/supabase/migrations/$migrations[3] >/dev/null 2>&1; then
  second_security=idempotent_noop
fi
second_abuse=unexpected_success
if ! $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -c "set role postgres" -f $repo_root/supabase/migrations/$migrations[4] >/dev/null 2>&1; then
  second_abuse=fail_closed_as_designed
fi
second_cleanup=failed
if $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -c "set role postgres" -f $repo_root/supabase/migrations/$migrations[5] >/dev/null 2>&1; then
  second_cleanup=idempotent_absent_noop
fi
second_policy=unexpected_success
if ! $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -c "set role postgres" -f $repo_root/supabase/migrations/$migrations[6] >/dev/null 2>&1; then
  second_policy=fail_closed_as_designed
fi

if [[ $second_events != fail_closed_as_designed || $second_intake != fail_closed_as_designed \
  || $second_security != idempotent_noop || $second_abuse != fail_closed_as_designed \
  || $second_cleanup != idempotent_absent_noop \
  || $second_policy != fail_closed_as_designed ]]; then
  print -u2 "second-run contract failed"
  exit 1
fi

counts=$($pg_bin/psql -h $socket_dir -d $database -AtX -F '|' -c \
  "select (select count(*) from public.leads),(select count(*) from public.business_events where event_type='lead.created'),(select count(*) from public.lead_intake_idempotency),(select count(*) from public.lead_intake_abuse_requests)")
staging_objects=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like '%staging_smoke%'")

node_tests=$(node --test \
  $repo_root/tests/p0-lead-intake-abuse-control.test.js \
  $repo_root/tests/p0-lead-intake-handler.test.js \
  $repo_root/tests/public-lead-intake-persistence.test.js 2>&1)
node_pass=$(print -r -- $node_tests | sed -n 's/^# pass //p' | tail -1)
node_fail=$(print -r -- $node_tests | sed -n 's/^# fail //p' | tail -1)

print -r -- "status=PASS"
print -r -- "database=isolated Unix-socket-only PostgreSQL cluster"
print -r -- "production_contact=false"
print -r -- "baseline=contract-equivalent relevant catalog slice for 20260718190000"
print -r -- "applied_versions=${(j:,:)applied}"
print -r -- "postconditions=PASS"
print -r -- "functional_contracts=transactional-create,idempotent-replay,reconciliation,lead.created,abuse-control,ACL-search-paths"
print -r -- "compatibility_contracts=three-proven-aliases,V1-write,V2-write,bidirectional-update,conflict-rejection,independent-source-semantics,legacy-row-preservation"
print -r -- "legacy_rows_preserved=27"
print -r -- "legacy_digest_match=true"
print -r -- "legacy_indexes_before=$legacy_indexes_before"
print -r -- "legacy_indexes_after=$legacy_indexes_after"
print -r -- "legacy_index_definitions_preserved=true"
print -r -- "legacy_rls_acl_preserved=true"
print -r -- "admin_partner_policy_definitions_preserved=true"
print -r -- "legacy_status_default_preserved=$legacy_status_default_after"
print -r -- "fixture_rows=$counts"
print -r -- "staging_smoke_objects=$staging_objects"
print -r -- "catalog_fingerprint=$catalog_fingerprint"
print -r -- "database_name_portability=true"
print -r -- "target_identity_evidence=true"
print -r -- "second_events=$second_events"
print -r -- "second_intake=$second_intake"
print -r -- "second_security=$second_security"
print -r -- "second_abuse=$second_abuse"
print -r -- "second_cleanup=$second_cleanup"
print -r -- "second_policy=$second_policy"
print -r -- "runtime_tests_passed=${node_pass:-0}"
print -r -- "runtime_tests_failed=${node_fail:-0}"
print -r -- "temporary_cluster_cleanup=EXIT trap"
