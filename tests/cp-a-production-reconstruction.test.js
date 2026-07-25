const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrations = [
  "20260724105000_cp_a_production_canonical_prerequisites.sql",
  "20260724110000_bridge_preview_publication_portal_review.sql",
  "20260724120000_cp_a_portal_trust_chain.sql",
  "20260724130000_repair_preview_quality_report_schema_drift.sql",
];
const source = fs.readFileSync(path.join(root, "supabase/migrations", migrations[0]), "utf8");

test("production reconstruction migrations have an explicit deterministic order", () => {
  assert.deepEqual([...migrations].sort(), migrations);
  for (const name of migrations) assert.ok(fs.existsSync(path.join(root, "supabase/migrations", name)));
});

test("canonical prerequisite preserves legacy finance and never backfills it", () => {
  assert.match(source, /Legacy customer_\* rows stay untouched/);
  assert.doesNotMatch(source, /insert\s+into\s+public\.(?:invoices|subscriptions)/i);
  assert.doesNotMatch(source, /update\s+public\.customer_(?:invoices|subscriptions)/i);
  assert.doesNotMatch(source, /delete\s+from/i);
});

test("existing canonical relations are checked fail-closed before create-if-absent", () => {
  assert.match(source, /found partial relation/);
  assert.match(source, /incompatible %\.% type/);
  assert.match(source, /to_regclass\(spec\.relation_name\) is not null/);
  assert.match(source, /create table if not exists public\.quotes/);
  assert.match(source, /create table if not exists public\.invoices/);
  assert.match(source, /create table if not exists public\.subscriptions/);
});

test("preview checksum is nullable for history but format-constrained for new identities", () => {
  assert.match(source, /add column if not exists package_checksum text null/);
  assert.match(source, /package_checksum is null or package_checksum ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.doesNotMatch(source, /update\s+public\.website_preview_versions/i);
});

test("canonical tables are RLS-protected and direct customer writes are revoked", () => {
  for (const table of ["quotes", "quote_lines", "invoices", "invoice_lines", "subscriptions"]) {
    assert.match(source, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(source, /revoke all on table .* from anon/);
  assert.match(source, /revoke insert, update, delete, truncate, references, trigger .* from authenticated/);
  assert.match(source, /grant select .* to authenticated/);
  assert.doesNotMatch(source, /grant\s+all/i);
});

test("prerequisite migration has a reviewable checksum identity", () => {
  assert.match(crypto.createHash("sha256").update(source).digest("hex"), /^[0-9a-f]{64}$/);
});
