#!/bin/zsh
set -euo pipefail

repo_root=${0:A:h:h}
pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
validation_root=$(mktemp -d /private/tmp/p0-staging-smoke-nonce.XXXXXXXX)
bootstrap_cluster=$validation_root/bootstrap-postgres
existing_cluster=$validation_root/existing-postgres
bootstrap_port=55475
existing_port=55477
bootstrap_url=postgresql://bootstrapadmin@127.0.0.1:${bootstrap_port}/p0_nonce_bootstrap?sslmode=disable
existing_url=postgresql://bootstrapadmin@127.0.0.1:${existing_port}/p0_nonce_existing?sslmode=disable
foundation=$repo_root/supabase-common/migrations/20260721040000_lead_intake_abuse_control.sql
candidate=$repo_root/supabase-common/migrations/20260721050000_p0_staging_smoke_nonce_replay_protection.sql
export PATH=$pg_bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

cleanup() {
  for cluster in $bootstrap_cluster $existing_cluster; do
    if [[ -s $cluster/postmaster.pid ]]; then
      $pg_bin/pg_ctl -D $cluster -m fast stop >/dev/null 2>&1 || true
    fi
  done
  rm -rf $validation_root
}
trap cleanup EXIT INT TERM

for key in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL; do
  if [[ -n ${(P)key:-} ]]; then
    print -u2 "remote environment variable forbidden: $key"
    exit 1
  fi
done

start_cluster() {
  local cluster=$1
  local port=$2
  local database=$3
  $pg_bin/initdb -D $cluster --no-locale --encoding=UTF8 --auth-host=trust --auth-local=trust >/dev/null
  $pg_bin/pg_ctl -D $cluster -o "-h 127.0.0.1 -p $port" -w start >/dev/null
  $pg_bin/createdb -h 127.0.0.1 -p $port $database
  $pg_bin/psql -h 127.0.0.1 -p $port -d $database -v ON_ERROR_STOP=1 -c \
    "create role bootstrapadmin login superuser createdb createrole inherit; create role postgres nologin nosuperuser nocreatedb nocreaterole inherit; create role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit; create role anon nologin nosuperuser nocreatedb nocreaterole noinherit; create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit bypassrls;" >/dev/null
}

start_cluster $bootstrap_cluster $bootstrap_port p0_nonce_bootstrap
$pg_bin/psql $bootstrap_url -v ON_ERROR_STOP=1 -f $foundation -f $candidate >/dev/null
bootstrap_history='["20260721040000","20260721050000"]'
$pg_bin/psql $bootstrap_url -v ON_ERROR_STOP=1 -f $repo_root/tests/fixtures/p0-staging-smoke-nonce-functional.sql >/dev/null

start_cluster $existing_cluster $existing_port p0_nonce_existing
$pg_bin/psql $existing_url -v ON_ERROR_STOP=1 -f $foundation >/dev/null
existing_before='["20260721040000"]'
$pg_bin/psql $existing_url -v ON_ERROR_STOP=1 -f $candidate >/dev/null
existing_after='["20260721040000","20260721050000"]'
$pg_bin/psql $existing_url -v ON_ERROR_STOP=1 -f $repo_root/tests/fixtures/p0-staging-smoke-nonce-functional.sql >/dev/null

nonce_fingerprint=$(printf 'a%.0s' {1..64})
request_binding=$(printf 'b%.0s' {1..64})
target_binding=9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e
for index in {1..10}; do
  $pg_bin/psql $existing_url -AtX -v ON_ERROR_STOP=1 -c \
    "set role service_role; select public.mws_consume_p0_staging_smoke_nonce_v1('p0_staging_smoke_v1','$nonce_fingerprint','$request_binding','$target_binding');" \
    > $validation_root/replay-$index.json &
done
wait
replay_rows=$($pg_bin/psql $existing_url -AtX -c "select count(*) from public.p0_staging_smoke_nonces where nonce_fingerprint='$nonce_fingerprint'")
replay_consumed=$(grep -l '"consumed": true' $validation_root/replay-*.json | wc -l | tr -d ' ')
replay_rejected=$(grep -l '"decision": "replay"' $validation_root/replay-*.json | wc -l | tr -d ' ')

security=$($pg_bin/psql $existing_url -AtX -F '|' -c "select c.relrowsecurity, c.relforcerowsecurity, c.relacl::text, p.prosecdef, p.proconfig::text, p.proacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_proc p join pg_namespace pn on pn.oid=p.pronamespace where n.nspname='public' and c.relname='p0_staging_smoke_nonces' and pn.nspname='public' and p.proname='mws_consume_p0_staging_smoke_nonce_v1' limit 1")
pii_columns=$($pg_bin/psql $existing_url -AtX -c "select count(*) from information_schema.columns where table_schema='public' and table_name='p0_staging_smoke_nonces' and column_name ~ '(ip|email|phone|name|company|agent|payload|request_body|raw|header|secret)'")
remaining_rows=$($pg_bin/psql $existing_url -AtX -c "select count(*) from public.p0_staging_smoke_nonces")
$pg_bin/psql $existing_url -v ON_ERROR_STOP=1 -c "truncate table public.p0_staging_smoke_nonces" >/dev/null
cleanup_rows=$($pg_bin/psql $existing_url -AtX -c "select count(*) from public.p0_staging_smoke_nonces")

if [[ $replay_rows != 1 || $replay_consumed != 1 || $replay_rejected != 9 ]]; then
  print -u2 "parallel one-time nonce consumption failed"
  exit 1
fi
if [[ $pii_columns != 0 || $cleanup_rows != 0 ]]; then
  print -u2 "privacy or cleanup invariant failed"
  exit 1
fi

print -r -- "bootstrap_history=$bootstrap_history"
print -r -- "existing_before=$existing_before"
print -r -- "existing_after=$existing_after"
print -r -- "parallel_contenders=10"
print -r -- "replay_consumed=$replay_consumed"
print -r -- "replay_rejected=$replay_rejected"
print -r -- "replay_rows=$replay_rows"
print -r -- "security=$security"
print -r -- "pii_columns=$pii_columns"
print -r -- "remaining_rows_before_final_cleanup=$remaining_rows"
print -r -- "cleanup_rows=$cleanup_rows"
print -r -- "remote_contact=false"
print -r -- "local_clusters_cleaned_on_exit=true"
