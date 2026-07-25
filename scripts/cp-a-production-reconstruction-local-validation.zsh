#!/bin/zsh
set -euo pipefail

repo_root="${0:A:h:h}"
pg_bin="${POSTGRES_BIN:-/Applications/Postgres.app/Contents/Versions/latest/bin}"
scratch_dir="$(mktemp -d /private/tmp/cpa-production-reconstruction.XXXXXX)"
cluster_dir="$scratch_dir/cluster"
socket_dir="$scratch_dir/socket"
port=55439

cleanup() {
  "$pg_bin/pg_ctl" -D "$cluster_dir" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$scratch_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$socket_dir"
"$pg_bin/initdb" -D "$cluster_dir" --no-locale --encoding=UTF8 --auth-host=reject --auth-local=trust >/dev/null
"$pg_bin/pg_ctl" -D "$cluster_dir" -o "-F -p $port -k $socket_dir" -w start >/dev/null

psql=("$pg_bin/psql" -h "$socket_dir" -p "$port" -v ON_ERROR_STOP=1 -X -q)
createdb=("$pg_bin/createdb" -h "$socket_dir" -p "$port")

for database in cpa_production cpa_partial cpa_incompatible; do
  "${createdb[@]}" "$database"
  "${psql[@]}" -d "$database" -f "$repo_root/tests/fixtures/cp-a-production-reconstruction-prestate.sql" >/dev/null
done

migrations=(
  "$repo_root/supabase/migrations/20260724105000_cp_a_production_canonical_prerequisites.sql"
  "$repo_root/supabase/migrations/20260724110000_bridge_preview_publication_portal_review.sql"
  "$repo_root/supabase/migrations/20260724120000_cp_a_portal_trust_chain.sql"
  "$repo_root/supabase/migrations/20260724130000_repair_preview_quality_report_schema_drift.sql"
)

# Production-like missing-canonical prestate, full order, and safe replay of repair migrations.
for migration in "$migrations[@]"; do
  "${psql[@]}" -d cpa_production -f "$migration" >/dev/null
done
"${psql[@]}" -d cpa_production -f "$migrations[1]" >/dev/null
"${psql[@]}" -d cpa_production -f "$migrations[2]" >/dev/null
"${psql[@]}" -d cpa_production -f "$migrations[4]" >/dev/null
"${psql[@]}" -d cpa_production -f "$repo_root/tests/fixtures/cp-a-production-reconstruction-postcheck.sql" >/dev/null
"${psql[@]}" -d cpa_production -f "$repo_root/tests/fixtures/cp-a-portal-trust-chain-functional.sql" >/dev/null

# A partially existing canonical relation must stop and roll back the entire prerequisite.
"${psql[@]}" -d cpa_partial -c 'create table public.quotes (id uuid primary key)' >/dev/null
if "${psql[@]}" -d cpa_partial -f "$migrations[1]" >/dev/null 2>&1; then
  print -u2 'partial canonical relation was accepted'
  exit 1
fi
partial_count="$("${psql[@]}" -d cpa_partial -Atc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('quote_lines','invoices','invoice_lines','subscriptions')")"
[[ "$partial_count" == 0 ]]

# An incompatible preview identity column must also stop without creating canonical relations.
"${psql[@]}" -d cpa_incompatible -c 'alter table public.website_preview_versions add column package_checksum integer' >/dev/null
if "${psql[@]}" -d cpa_incompatible -f "$migrations[1]" >/dev/null 2>&1; then
  print -u2 'incompatible preview identity column was accepted'
  exit 1
fi
incompatible_count="$("${psql[@]}" -d cpa_incompatible -Atc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('quotes','quote_lines','invoices','invoice_lines','subscriptions')")"
[[ "$incompatible_count" == 0 ]]

print 'PASS cp-a production reconstruction PostgreSQL scenarios 10/10'
