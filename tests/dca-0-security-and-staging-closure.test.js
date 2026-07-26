const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationPath = "supabase/migrations/20260726100000_dca_0_token_safe_invitation_foundation.sql";
const repairPath = "docs/deployment/DCA_0A_PRODUCTION_ORPHAN_REPAIR.sql";
const postcheckPath = "docs/deployment/DCA_0A_PRODUCTION_POSTCHECK.sql";
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read(migrationPath);
const repair = read(repairPath);

test("DCA-0A repair is exact, transactional and fail-closed", () => {
  assert.match(repair, /^begin;/m);
  assert.match(repair, /^commit;/m);
  assert.match(repair, /candidate_count <> 1/);
  assert.match(repair, /for update of publication/);
  assert.match(repair, /enabled = false/);
  assert.match(repair, /revoked_at = clock_timestamp\(\)/);
  assert.match(repair, /DCA_0_ORPHANED_LEAD_PUBLICATION_REPAIR/);
  assert.match(repair, /preview_before/);
  assert.match(repair, /preview version changed unexpectedly/i);
  assert.doesNotMatch(repair, /delete\s+from/i);
  assert.doesNotMatch(repair, /set\s+relationship_id/i);
  assert.doesNotMatch(repair, /public_slug\s*=/i);
});

test("DCA-0A repair rejects zero/multiple candidates and postcheck is read-only", () => {
  assert.match(repair, /expected exactly one candidate/i);
  assert.match(repair, /locked candidate count changed/i);
  assert.match(repair, /current_setting\('dca_0\.fail_closed\.rowcount_must_equal_one'\)/);
  const postcheck = read(postcheckPath);
  assert.match(postcheck, /^begin transaction read only;/m);
  assert.match(postcheck, /active_orphan_count/);
  assert.match(postcheck, /transaction_read_only/);
  assert.match(postcheck, /^rollback;/m);
  assert.doesNotMatch(postcheck, /\b(?:insert|update|delete|truncate|alter|drop|create)\b/i);
});

test("staging parity creates the two missing production structures", () => {
  for (const token of [
    "create table if not exists public.lead_demo_invitations",
    "create table if not exists public.public_preview_publications",
    "lead_demo_invitations_email_normalized",
    "lead_demo_invitations_auth_unique",
    "lead_demo_invitations_email_unique",
    "lead_demo_invitations_lead_unique",
    "lead_demo_invitations_profile_unique",
    "public_preview_publications_active_relationship_unique_idx",
    "public_preview_publications_slug_unique_idx",
    "alter table public.public_preview_publications force row level security",
    "lead_demo_invitations_service_role_all",
  ]) assert.ok(migration.toLowerCase().includes(token.toLowerCase()), token);
  assert.match(migration, /grant select, insert, update, delete on table[\s\S]*public\.website_preview_versions[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /customer_invoices/i);
  assert.match(migration, /to_regclass\('public\.automation_outbox'\) is not null/);
  assert.doesNotMatch(migration, /leads\.customer_id/i);
  assert.match(migration, /lead_record\.converted_customer_id/);
});

test("migration is rerunnable and uses additive or replace-safe DDL", () => {
  assert.match(migration, /create table if not exists public\.lead_demo_invitations/);
  assert.match(migration, /create table if not exists public\.public_preview_publications/);
  assert.match(migration, /create table if not exists public\.client_activation_links/);
  assert.match(migration, /add column if not exists preview_version_id/);
  assert.match(migration, /create unique index if not exists lead_demo_invitations_idempotency_unique/);
  assert.match(migration, /create or replace function public\.dca_0_create_activation_link/);
  assert.match(migration, /drop policy if exists client_activation_links_service_role_all/);
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.doesNotMatch(migration, /\btruncate\b/i);
});

test("activation tokens have 256 bits and only their hash is persisted", () => {
  assert.match(migration, /gen_random_bytes\(32\)/);
  assert.match(migration, /token_digest := public\.dca_0_sha256\(raw_token\)/);
  assert.match(migration, /token_hash text not null/);
  assert.match(migration, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /'\/start\/' \|\| raw_token/);
  assert.doesNotMatch(migration, /\b(?:raw_token|activation_token)\s+(?:text|varchar)[^;]*create table/i);
  assert.doesNotMatch(migration, /insert into public\.email_logs/i);
  assert.doesNotMatch(migration, /insert into public\.(?:demo_journey_events|customer_timeline_events|automation_outbox)/i);
});

test("canonical invitation identity is lead plus journey plus preview plus email", () => {
  assert.match(migration, /lead_record\.id::text[\s\S]*journey_record\.id::text[\s\S]*preview_record\.id::text[\s\S]*normalized_email/);
  assert.match(migration, /on conflict \(idempotency_key\) do nothing/);
  assert.match(migration, /lead_demo_invitations_idempotency_unique/);
  assert.match(migration, /client_activation_links_one_live_token/);
  assert.match(migration, /where status in \('active','opened'\)/);
});

test("rotation, revocation and expiry fail closed", () => {
  assert.match(migration, /set status = 'rotated', revoked_at = pg_catalog\.clock_timestamp\(\)/);
  assert.match(migration, /set status = 'revoked', revoked_at = pg_catalog\.clock_timestamp\(\)/);
  assert.match(migration, /set status = 'expired'/);
  assert.match(migration, /expires_at <= pg_catalog\.clock_timestamp\(\)/);
  assert.match(migration, /status not in \('active','opened'\)/);
});

test("email and customer ownership are server-bound", () => {
  assert.match(migration, /link_record\.intended_email is distinct from normalized_email/);
  assert.match(migration, /customer_record\.auth_user_id is distinct from input_auth_user_id/);
  assert.match(migration, /customer_record\.profile_id is distinct from input_profile_id/);
  assert.match(migration, /project\.customer_id = customer_record\.id/);
  assert.match(migration, /lead\.converted_customer_id = link_record\.customer_id/);
  assert.match(migration, /publication\.relationship_id = link_record\.customer_id/);
  assert.match(migration, /link_record\.customer_id is null/);
});

test("legacy token-bearing invitation planner is disabled", () => {
  assert.match(migration, /legacy planner permanently stores a private preview url/i);
  assert.match(migration, /revoke all on function public\.plan_demo_invitation/);
  assert.match(migration, /from public, anon, authenticated, service_role/);
});

test("browser assets contain no service-role key and no DCA token logger", () => {
  const browserFiles = [
    ...fs.readdirSync(path.join(root, "public"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:html|js|mjs)$/.test(entry.name))
      .map((entry) => path.join(root, "public", entry.name)),
  ];
  for (const filename of browserFiles) {
    const source = fs.readFileSync(filename, "utf8");
    assert.doesNotMatch(source, /(?:SUPABASE_SERVICE_ROLE_KEY|service[_-]?role[_-]?key)\s*[:=]\s*["'`]eyJ/i);
    assert.doesNotMatch(source, /console\.(?:log|info|debug)\([^\n]*(?:activation[_-]?token|preview[_-]?token)/i);
  }
});
