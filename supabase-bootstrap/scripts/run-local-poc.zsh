#!/bin/zsh
set -euo pipefail

repo_root=${0:A:h:h:h}
pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
cli_bin=/opt/homebrew/bin/supabase
poc_root=$(mktemp -d /private/tmp/f0e-bootstrap-poc.XXXXXXXX)
cluster_dir=$poc_root/postgres
poc_port=55441
db_url=postgresql://bootstrapadmin@127.0.0.1:${poc_port}/f0e_poc?sslmode=disable
export PATH=$pg_bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

cleanup() {
  if [[ -s $cluster_dir/postmaster.pid ]]; then
    $pg_bin/pg_ctl -D $cluster_dir -m fast stop >/dev/null 2>&1 || true
  fi
  F0E_LOCAL_ONLY=1 node $repo_root/supabase-bootstrap/scripts/cleanup.mjs --workspace $poc_root >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

$pg_bin/initdb -D $cluster_dir --no-locale --encoding=UTF8 --auth-host=trust --auth-local=trust >/dev/null
$pg_bin/pg_ctl -D $cluster_dir -o "-h 127.0.0.1 -p $poc_port" -w start >/dev/null
$pg_bin/createdb -h 127.0.0.1 -p $poc_port f0e_poc
$pg_bin/psql -h 127.0.0.1 -p $poc_port -d f0e_poc -v ON_ERROR_STOP=1 -f $repo_root/supabase-bootstrap/config/local-profile.sql >/dev/null

boot_migrations=$(F0E_LOCAL_ONLY=1 node $repo_root/supabase-bootstrap/scripts/init.mjs --workspace $poc_root)
boot_project=${boot_migrations:h:h}

env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_PROJECT_ID -u SUPABASE_PROJECT_REF -u SUPABASE_DB_URL -u DATABASE_URL \
  PGSSLMODE=disable $cli_bin migration up --db-url $db_url --include-all --workdir $boot_project --yes --log-level error >/dev/null

baseline_history=$($pg_bin/psql $db_url -AtX -c "select coalesce(json_agg(x order by version),'[]'::json)::text from (select version,name,array_length(statements,1) statement_count from supabase_migrations.schema_migrations) x")
baseline_count=$($pg_bin/psql $db_url -AtX -c "select count(*) from supabase_migrations.schema_migrations")

common_project=$poc_root/common-project
mkdir -p $common_project/supabase/migrations
cp $repo_root/supabase-bootstrap/supabase/config.toml $common_project/supabase/config.toml
printf '%s\n' \
  'create schema if not exists f0e_poc;' \
  'create table f0e_poc.bootstrap_poc_marker (id integer primary key, applied_at timestamptz not null default now());' \
  'insert into f0e_poc.bootstrap_poc_marker(id) values (1);' \
  > $common_project/supabase/migrations/20260721000100_bootstrap_poc_marker.sql
dummy_sha=$(shasum -a 256 $common_project/supabase/migrations/20260721000100_bootstrap_poc_marker.sql | awk '{print $1}')

set +e
common_output=$(env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_PROJECT_ID -u SUPABASE_PROJECT_REF -u SUPABASE_DB_URL -u DATABASE_URL \
  PGSSLMODE=disable $cli_bin migration up --db-url $db_url --include-all --workdir $common_project --yes --log-level error 2>&1)
common_status=$?
set -e
common_history=$($pg_bin/psql $db_url -AtX -c "select coalesce(json_agg(x order by version),'[]'::json)::text from (select version,name,array_length(statements,1) statement_count from supabase_migrations.schema_migrations) x")
common_count=$($pg_bin/psql $db_url -AtX -c "select count(*) from supabase_migrations.schema_migrations")
history_columns=$($pg_bin/psql $db_url -AtX -F ',' -c "select column_name||':'||data_type||':'||is_nullable from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' order by ordinal_position")

public_tables=$($pg_bin/psql $db_url -AtX -c "select count(*) from pg_tables where schemaname='public'")
role_count=$($pg_bin/psql $db_url -AtX -c "select count(*) from pg_roles where rolname in ('bootstrapadmin','postgres','authenticated','anon','service_role')")
placeholder_count=$($pg_bin/psql $db_url -AtX -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','storage') and c.relname in ('users','buckets','objects') and c.relkind='r'")
storage_objects=$($pg_bin/psql $db_url -AtX -c "select count(*) from storage.objects")
test_buckets=$($pg_bin/psql $db_url -AtX -c "select count(*) from storage.buckets where id ilike '%test%' or name ilike '%test%'")
server_addr=$($pg_bin/psql $db_url -AtX -c "select inet_server_addr()::text")
marker_exists=$($pg_bin/psql $db_url -AtX -c "select to_regclass('f0e_poc.bootstrap_poc_marker') is not null")
baseline_sha=$(shasum -a 256 $repo_root/supabase/migrations/00000000000000_authoritative_baseline.sql | awk '{print $1}')

printf '%s\n' \
  "cli_version=$($cli_bin --version)" \
  "baseline_sha256=$baseline_sha" \
  "dummy_sha256=$dummy_sha" \
  "baseline_history=$baseline_history" \
  "baseline_history_count=$baseline_count" \
  "history_columns=$history_columns" \
  "common_exit_status=$common_status" \
  "common_history=$common_history" \
  "common_history_count=$common_count" \
  "common_cli_output=${common_output//$'\n'/ | }" \
  "public_tables=$public_tables" \
  "required_roles=$role_count" \
  "placeholder_tables=$placeholder_count" \
  "storage_objects=$storage_objects" \
  "test_buckets=$test_buckets" \
  "server_address=$server_addr" \
  "marker_exists=$marker_exists" \
  "cleanup_registered=true"
