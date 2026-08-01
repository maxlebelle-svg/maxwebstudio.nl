const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const foundationPath = path.join(root, "supabase/migrations/20260730150000_commercial_offer_foundation.sql");
const migrationPath = path.join(root, "supabase/migrations/20260731190000_harden_commercial_offer_child_read_scope.sql");
const foundation = fs.readFileSync(foundationPath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");

const expectedFoundationHash = "a6f043620b7bc1e56dc974f0d29631b4fe139aeef2a445342745e5d016a3513e";

function policyBody(policyName) {
  const start = migration.indexOf(`create policy ${policyName}`);
  assert.notEqual(start, -1, `${policyName} is missing`);
  const nextDrop = migration.indexOf("drop policy", start + 1);
  return migration.slice(start, nextDrop === -1 ? migration.length : nextDrop);
}

test("foundation migration remains byte-identical to the certified release candidate", () => {
  assert.equal(crypto.createHash("sha256").update(foundation).digest("hex"), expectedFoundationHash);
});

test("hardening is forward-only, transactional, and limited to three read policies", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.equal((migration.match(/drop policy if exists/g) || []).length, 3);
  assert.equal((migration.match(/create policy/g) || []).length, 3);
  assert.doesNotMatch(migration, /\b(drop table|truncate|delete from|insert into|update\s+public\.|alter table)\b/i);
  assert.doesNotMatch(migration, /commercial_(catalog|offers|offer_events)_.*policy/i);
});

for (const policyName of [
  "commercial_offer_versions_scoped_read",
  "commercial_offer_lines_scoped_read",
  "commercial_offer_documents_scoped_read",
]) {
  test(`${policyName} limits sales roles to their assigned lead or customer`, () => {
    const policy = policyBody(policyName);
    assert.match(policy, /has_app_role\(array\['super_admin','admin','sales_manager'\]\)/);
    assert.match(policy, /has_app_role\(array\['sales_partner','sales'\]\)/);
    assert.match(policy, /relationship_type = 'lead'/);
    assert.match(policy, /relationship_type = 'customer'/);
    assert.match(policy, /assigned_user_id = auth\.uid\(\)/);
    assert.match(policy, /assignedUserId.*auth\.uid/s);
    assert.match(policy, /ownerAuthUserId.*auth\.uid/s);
    assert.match(policy, /ownerProfileId.*current_profile_id/s);
    assert.doesNotMatch(policy, /has_app_role\(array\['super_admin','admin','sales_manager','sales_partner','sales'\]\)/);
  });
}

test("customer visibility remains limited to owned, non-draft immutable evidence", () => {
  for (const policyName of [
    "commercial_offer_versions_scoped_read",
    "commercial_offer_lines_scoped_read",
    "commercial_offer_documents_scoped_read",
  ]) {
    const policy = policyBody(policyName);
    assert.match(policy, /owns_customer\(o\.customer_id\)/);
    assert.match(policy, /status not in \('draft','ready_for_review'\)/);
  }
});
