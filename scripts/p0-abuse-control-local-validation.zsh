#!/bin/zsh
set -euo pipefail

repo_root=${0:A:h:h}
pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
cli_bin=/opt/homebrew/bin/supabase
validation_root=$(mktemp -d /private/tmp/p0-abuse-control.XXXXXXXX)
bootstrap_cluster=$validation_root/bootstrap-postgres
existing_cluster=$validation_root/existing-postgres
bootstrap_project=$validation_root/bootstrap-project
existing_project=$validation_root/existing-project
bootstrap_port=55471
existing_port=55473
bootstrap_url=postgresql://bootstrapadmin@127.0.0.1:${bootstrap_port}/p0_bootstrap?sslmode=disable
existing_url=postgresql://bootstrapadmin@127.0.0.1:${existing_port}/p0_existing?sslmode=disable
candidate=20260721040000_lead_intake_abuse_control.sql
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
  $pg_bin/psql -h 127.0.0.1 -p $port -d $database -v ON_ERROR_STOP=1 -f $repo_root/supabase-bootstrap/config/local-profile.sql >/dev/null
}

cli_up() {
  local url=$1
  local workdir=$2
  env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_PROJECT_ID -u SUPABASE_PROJECT_REF -u SUPABASE_DB_URL -u DATABASE_URL \
    PGSSLMODE=disable $cli_bin migration up --db-url $url --include-all --workdir $workdir --yes --log-level error
}

history() {
  $pg_bin/psql $1 -AtX -c "select coalesce(json_agg(version order by version),'[]'::json)::text from supabase_migrations.schema_migrations"
}

mkdir -p $bootstrap_project/supabase/migrations $existing_project/supabase/migrations
cp $repo_root/supabase-bootstrap/supabase/config.toml $bootstrap_project/supabase/config.toml
cp $repo_root/supabase-bootstrap/supabase/config.toml $existing_project/supabase/config.toml
cp $repo_root/supabase-bootstrap/supabase/migrations/00000000000000_authoritative_baseline.sql $bootstrap_project/supabase/migrations/
for migration in $repo_root/supabase-common/migrations/*.sql; do
  cp $migration $bootstrap_project/supabase/migrations/
done

start_cluster $bootstrap_cluster $bootstrap_port p0_bootstrap
cli_up $bootstrap_url $bootstrap_project >/dev/null
bootstrap_history=$(history $bootstrap_url)
bootstrap_second=$(cli_up $bootstrap_url $bootstrap_project 2>&1)
$pg_bin/psql $bootstrap_url -v ON_ERROR_STOP=1 -f $repo_root/tests/fixtures/p0-abuse-control-functional.sql >/dev/null

rm $bootstrap_project/supabase/migrations/$candidate
start_cluster $existing_cluster $existing_port p0_existing
cli_up $existing_url $bootstrap_project >/dev/null
$pg_bin/psql $existing_url -v ON_ERROR_STOP=1 -c "delete from supabase_migrations.schema_migrations where version='00000000000000'" >/dev/null
for migration in $repo_root/supabase-common/migrations/*.sql; do
  cp $migration $existing_project/supabase/migrations/
done
existing_before=$(history $existing_url)
cli_up $existing_url $existing_project >/dev/null
existing_after=$(history $existing_url)
existing_second=$(cli_up $existing_url $existing_project 2>&1)
$pg_bin/psql $existing_url -v ON_ERROR_STOP=1 -f $repo_root/tests/fixtures/p0-abuse-control-functional.sql >/dev/null

parallel_fingerprint=$(printf '7%.0s' {1..64})
for index in {1..6}; do
  idem=$(printf '%064x' $index)
  $pg_bin/psql $existing_url -AtX -v ON_ERROR_STOP=1 -c \
    "set role service_role; select public.mws_check_lead_intake_abuse_v1('public_lead_intake_v1','$parallel_fingerprint','$idem',null);" \
    > $validation_root/parallel-$index.json &
done
wait
parallel_allowed=$(grep -l '"allowed": true' $validation_root/parallel-*.json | wc -l | tr -d ' ')
parallel_limited=$(grep -l 'short_window_limited' $validation_root/parallel-*.json | wc -l | tr -d ' ')
parallel_rows=$($pg_bin/psql $existing_url -AtX -c "select count(*) from public.lead_intake_abuse_requests where fingerprint_hmac='$parallel_fingerprint'")

replay_fingerprint=$(printf '8%.0s' {1..64})
replay_idempotency=$(printf '9%.0s' {1..64})
for index in {1..8}; do
  $pg_bin/psql $existing_url -AtX -v ON_ERROR_STOP=1 -c \
    "set role service_role; select public.mws_check_lead_intake_abuse_v1('public_lead_intake_v1','$replay_fingerprint','$replay_idempotency',null);" \
    > $validation_root/replay-$index.json &
done
wait
replay_rows=$($pg_bin/psql $existing_url -AtX -c "select count(*) from public.lead_intake_abuse_requests where fingerprint_hmac='$replay_fingerprint'")
replay_unique=$(grep -l 'unique_allowed' $validation_root/replay-*.json | wc -l | tr -d ' ')
replay_allowed=$(grep -l '"allowed": true' $validation_root/replay-*.json | wc -l | tr -d ' ')

security=$($pg_bin/psql $existing_url -AtX -F '|' -c "select c.relrowsecurity, c.relforcerowsecurity, c.relacl::text, p.prosecdef, p.proconfig::text, p.proacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_proc p join pg_namespace pn on pn.oid=p.pronamespace where n.nspname='public' and c.relname='lead_intake_abuse_requests' and pn.nspname='public' and p.proname='mws_check_lead_intake_abuse_v1' limit 1")
pii_columns=$($pg_bin/psql $existing_url -AtX -c "select count(*) from information_schema.columns where table_schema='public' and table_name='lead_intake_abuse_requests' and column_name ~ '(ip|email|phone|name|company|agent|payload|request_body)'")
remaining_rows=$($pg_bin/psql $existing_url -AtX -c "select count(*) from public.lead_intake_abuse_requests")
$pg_bin/psql $existing_url -v ON_ERROR_STOP=1 -c "truncate table public.lead_intake_abuse_requests" >/dev/null
cleanup_rows=$($pg_bin/psql $existing_url -AtX -c "select count(*) from public.lead_intake_abuse_requests")

if [[ $parallel_allowed != 5 || $parallel_limited != 1 || $parallel_rows != 5 ]]; then
  print -u2 "parallel unique limit failed"
  exit 1
fi
if [[ $replay_rows != 1 || $replay_unique != 1 || $replay_allowed != 8 ]]; then
  print -u2 "parallel replay idempotency failed"
  exit 1
fi
if [[ $pii_columns != 0 || $cleanup_rows != 0 ]]; then
  print -u2 "privacy or cleanup invariant failed"
  exit 1
fi

print -r -- "bootstrap_history=$bootstrap_history"
print -r -- "bootstrap_second=${bootstrap_second//$'\n'/ | }"
print -r -- "existing_before=$existing_before"
print -r -- "existing_after=$existing_after"
print -r -- "existing_second=${existing_second//$'\n'/ | }"
print -r -- "parallel_allowed=$parallel_allowed"
print -r -- "parallel_limited=$parallel_limited"
print -r -- "parallel_rows=$parallel_rows"
print -r -- "replay_allowed=$replay_allowed"
print -r -- "replay_unique=$replay_unique"
print -r -- "replay_rows=$replay_rows"
print -r -- "security=$security"
print -r -- "pii_columns=$pii_columns"
print -r -- "remaining_rows_before_final_cleanup=$remaining_rows"
print -r -- "cleanup_rows=$cleanup_rows"
print -r -- "remote_contact=false"
print -r -- "local_clusters_cleaned_on_exit=true"
