#!/bin/zsh
set -euo pipefail

repo_root=${0:A:h:h:h}
pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
cli_bin=/opt/homebrew/bin/supabase
poc_root=$(mktemp -d /private/tmp/f0f-dual-root-poc.XXXXXXXX)
bootstrap_cluster=$poc_root/bootstrap-postgres
existing_cluster=$poc_root/existing-postgres
bootstrap_port=55441
existing_port=55443
bootstrap_url=postgresql://bootstrapadmin@127.0.0.1:${bootstrap_port}/f0f_bootstrap?sslmode=disable
existing_url=postgresql://bootstrapadmin@127.0.0.1:${existing_port}/f0f_existing?sslmode=disable
export PATH=$pg_bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

cleanup() {
  for cluster in $bootstrap_cluster $existing_cluster; do
    if [[ -s $cluster/postmaster.pid ]]; then
      $pg_bin/pg_ctl -D $cluster -m fast stop >/dev/null 2>&1 || true
    fi
  done
  rm -rf $poc_root
}
trap cleanup EXIT INT TERM

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
  $pg_bin/psql $1 -AtX -c "select coalesce(json_agg(x order by version),'[]'::json)::text from (select version,name,array_length(statements,1) statement_count from supabase_migrations.schema_migrations) x"
}

canonical=$poc_root/canonical
bootstrap_project=$poc_root/bootstrap-project
existing_project=$poc_root/existing-project
mkdir -p $canonical $bootstrap_project/supabase/migrations $existing_project/supabase/migrations
cp $repo_root/supabase-bootstrap/supabase/config.toml $bootstrap_project/supabase/config.toml
cp $repo_root/supabase-bootstrap/supabase/config.toml $existing_project/supabase/config.toml
cp $repo_root/supabase-bootstrap/supabase/migrations/00000000000000_authoritative_baseline.sql $bootstrap_project/supabase/migrations/
cp $repo_root/supabase/migrations/20260710160200_central_lead_lifecycle_deduplication.sql $existing_project/supabase/migrations/
printf '%s\n' \
  'create schema if not exists f0f_poc;' \
  'create table f0f_poc.dual_root_poc_marker (id integer primary key, applied_at timestamptz not null default now());' \
  'insert into f0f_poc.dual_root_poc_marker(id) values (1);' \
  > $canonical/20260721000100_dual_root_poc_marker.sql
fixture_sha=$(shasum -a 256 $canonical/20260721000100_dual_root_poc_marker.sql | awk '{print $1}')
fixture_size=$(wc -c < $canonical/20260721000100_dual_root_poc_marker.sql | tr -d ' ')

F0F_LOCAL_ONLY=1 node $repo_root/supabase-bootstrap/scripts/select-root.mjs --mode bootstrap --repo-root $repo_root >/dev/null
F0F_LOCAL_ONLY=1 node $repo_root/supabase-bootstrap/scripts/select-root.mjs --mode existing --repo-root $repo_root >/dev/null

start_cluster $bootstrap_cluster $bootstrap_port f0f_bootstrap
cli_up $bootstrap_url $bootstrap_project >/dev/null
bootstrap_after_baseline=$(history $bootstrap_url)
cp $canonical/20260721000100_dual_root_poc_marker.sql $bootstrap_project/supabase/migrations/
cli_up $bootstrap_url $bootstrap_project >/dev/null
bootstrap_after_common=$(history $bootstrap_url)
bootstrap_second=$(cli_up $bootstrap_url $bootstrap_project 2>&1)
bootstrap_after_second=$(history $bootstrap_url)
bootstrap_marker=$($pg_bin/psql $bootstrap_url -AtX -c "select count(*) from f0f_poc.dual_root_poc_marker")

start_cluster $existing_cluster $existing_port f0f_existing
$pg_bin/psql $existing_url -v ON_ERROR_STOP=1 -f $repo_root/supabase-bootstrap/fixtures/existing-minimal-catalog.sql >/dev/null
cli_up $existing_url $existing_project >/dev/null
existing_before_common=$(history $existing_url)
cp $canonical/20260721000100_dual_root_poc_marker.sql $existing_project/supabase/migrations/
identity_manifest=$(node $repo_root/supabase-bootstrap/scripts/dual-root-validator.mjs --canonical $canonical --bootstrap $bootstrap_project/supabase/migrations --existing $existing_project/supabase/migrations)
cli_up $existing_url $existing_project >/dev/null
existing_after_common=$(history $existing_url)
existing_second=$(cli_up $existing_url $existing_project 2>&1)
existing_after_second=$(history $existing_url)
existing_marker=$($pg_bin/psql $existing_url -AtX -c "select count(*) from f0f_poc.dual_root_poc_marker")
existing_baseline_rows=$($pg_bin/psql $existing_url -AtX -c "select count(*) from supabase_migrations.schema_migrations where version='00000000000000'")

printf '%s\n' '-- intentional one-byte-class drift probe' >> $bootstrap_project/supabase/migrations/20260721000100_dual_root_poc_marker.sql
set +e
drift_validator_output=$(node $repo_root/supabase-bootstrap/scripts/dual-root-validator.mjs --canonical $canonical --bootstrap $bootstrap_project/supabase/migrations --existing $existing_project/supabase/migrations 2>&1)
drift_validator_status=$?
set -e
cli_drift_output=$(cli_up $bootstrap_url $bootstrap_project 2>&1)
bootstrap_after_drift=$(history $bootstrap_url)
cp $canonical/20260721000100_dual_root_poc_marker.sql $bootstrap_project/supabase/migrations/20260721000100_dual_root_poc_marker.sql
restored_manifest=$(node $repo_root/supabase-bootstrap/scripts/dual-root-validator.mjs --canonical $canonical --bootstrap $bootstrap_project/supabase/migrations --existing $existing_project/supabase/migrations)
bootstrap_addr=$($pg_bin/psql $bootstrap_url -AtX -c "select inet_server_addr()::text")
existing_addr=$($pg_bin/psql $existing_url -AtX -c "select inet_server_addr()::text")

printf '%s\n' \
  "cli_version=$($cli_bin --version)" \
  "baseline_sha=$(shasum -a 256 $repo_root/supabase-bootstrap/supabase/migrations/00000000000000_authoritative_baseline.sql | awk '{print $1}')" \
  "fixture_sha=$fixture_sha" \
  "fixture_size=$fixture_size" \
  "identity_manifest=$identity_manifest" \
  "bootstrap_after_baseline=$bootstrap_after_baseline" \
  "bootstrap_after_common=$bootstrap_after_common" \
  "bootstrap_after_second=$bootstrap_after_second" \
  "bootstrap_second_output=${bootstrap_second//$'\n'/ | }" \
  "bootstrap_marker=$bootstrap_marker" \
  "existing_before_common=$existing_before_common" \
  "existing_after_common=$existing_after_common" \
  "existing_after_second=$existing_after_second" \
  "existing_second_output=${existing_second//$'\n'/ | }" \
  "existing_baseline_rows=$existing_baseline_rows" \
  "existing_marker=$existing_marker" \
  "drift_validator_status=$drift_validator_status" \
  "drift_validator_output=${drift_validator_output//$'\n'/ | }" \
  "cli_drift_output=${cli_drift_output//$'\n'/ | }" \
  "bootstrap_after_drift=$bootstrap_after_drift" \
  "restored_manifest=$restored_manifest" \
  "bootstrap_address=$bootstrap_addr" \
  "existing_address=$existing_addr" \
  "cleanup_registered=true"
