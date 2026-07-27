const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const policy = require("../functions/services/profileAccessPolicy");
const migration = fs.readFileSync(path.join(
  __dirname,
  "../supabase/migrations/20260726200000_partner_profile_role_status_foundation.sql"
), "utf8");

test("B1 exposes one canonical role model and normalizes only the legacy sales alias", () => {
  assert.deepEqual(policy.CANONICAL_ROLES, [
    "super_admin", "admin", "sales_manager", "sales_partner", "designer",
    "developer", "support", "customer", "demo_user",
  ]);
  assert.equal(policy.normalizeRole("sales"), "sales_partner");
  assert.equal(policy.normalizeRole("sales-manager"), "sales_manager");
  assert.equal(policy.isCanonicalRole("unknown"), false);
  assert.match(migration, /set role = 'sales_partner'[\s\S]*lower\(btrim\(role\)\) = 'sales'/i);
  const inviteSource = fs.readFileSync(path.join(__dirname, "../functions/admin-invite-user.js"), "utf8");
  assert.match(inviteSource, /CANONICAL_ROLES/);
  assert.match(inviteSource, /CANONICAL_PROFILE_STATUSES/);
  assert.doesNotMatch(inviteSource, /const allowedRoles = new Set\(\["super_admin"/);
});

test("B1 keeps account state separate and transitions fail closed", () => {
  assert.deepEqual(policy.CANONICAL_PROFILE_STATUSES, ["invited", "pending", "active", "disabled", "archived"]);
  assert.equal(policy.canTransitionProfileStatus("invited", "pending"), true);
  assert.equal(policy.canTransitionProfileStatus("pending", "active"), true);
  assert.equal(policy.canTransitionProfileStatus("active", "pending"), false);
  assert.equal(policy.canTransitionProfileStatus("archived", "active"), false);
  assert.match(migration, /Unsupported profile status transition/);
  assert.match(migration, /Partner onboarding uses a separate state machine/);
});

test("invited and pending profiles never receive generic operational access", () => {
  assert.equal(policy.hasOperationalAccess({ role: "sales_partner", status: "invited" }), false);
  assert.equal(policy.hasOperationalAccess({ role: "sales_partner", status: "pending" }), false);
  assert.equal(policy.hasOperationalAccess({ role: "sales_partner", status: "active" }), true);
  assert.equal(policy.hasPartnerOnboardingAccess({ role: "sales_partner", status: "pending" }), true);
  assert.match(migration, /p\.status = 'active'/);
  assert.doesNotMatch(migration, /p\.status[^;]*in \('active',\s*'invited'/i);
});

test("sales manager has read/update only and sales partner is owner-bound", () => {
  assert.match(migration, /create policy leads_sales_manager_select[\s\S]*for select/i);
  assert.match(migration, /create policy leads_sales_manager_update[\s\S]*for update/i);
  assert.doesNotMatch(migration, /create policy leads_sales_manager_[\s\S]{0,80}for (?:all|insert|delete)/i);
  for (const policyName of [
    "leads_sales_partner_select_own",
    "leads_sales_partner_insert_own",
    "leads_sales_partner_update_own",
  ]) {
    const start = migration.indexOf(`create policy ${policyName}`);
    assert.notEqual(start, -1, policyName);
    assert.match(migration.slice(start, start + 500), /assigned_user_id = auth\.uid\(\)/);
  }
  assert.doesNotMatch(migration, /create policy leads_sales_partner_delete/i);
});

test("migration is transactional, preflighted and preserves profile rows", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /unknown profile role/i);
  assert.match(migration, /unknown profile status/i);
  assert.match(migration, /requires leads\.assigned_user_id ownership/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.profiles/i);
  assert.doesNotMatch(migration, /truncate/i);
  assert.doesNotMatch(migration, /drop\s+table/i);
  const dropLegacyRoleConstraint = migration.indexOf("drop constraint if exists profiles_role_check");
  const normalizeLegacySalesRole = migration.indexOf("set role = 'sales_partner'");
  const addCanonicalRoleConstraint = migration.indexOf("add constraint profiles_role_check");
  assert.ok(dropLegacyRoleConstraint < normalizeLegacySalesRole);
  assert.ok(normalizeLegacySalesRole < addCanonicalRoleConstraint);
});
