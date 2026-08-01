const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrations = path.join(root, "supabase", "migrations");
const migrationName = "20260731213000_harden_leads_demo_read_policy.sql";
const migrationPath = path.join(migrations, migrationName);
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";
const migrationSha256 = crypto.createHash("sha256").update(Buffer.from(migration)).digest("hex");
const baseline = fs.readFileSync(path.join(migrations, "00000000000000_authoritative_baseline.sql"), "utf8");
const partnerRoles = fs.readFileSync(path.join(migrations, "20260726200000_partner_profile_role_status_foundation.sql"), "utf8");
const adminLeads = fs.readFileSync(path.join(root, "functions", "admin-leads.js"), "utf8");

const certified = new Map([
  ["20260730150000_commercial_offer_foundation.sql", "a6f043620b7bc1e56dc974f0d29631b4fe139aeef2a445342745e5d016a3513e"],
  ["20260730170000_composer_service_role_read_fix.sql", "c5cfd06648d52225b1833a6214cb1e3f983734199273294824941afbc6dbf89c"],
  ["20260730223000_commercial_offer_phase_d1_mail.sql", "be3a84c026da82650fae95a2d33fc7706c21d84835fc09145838857810c8128c"],
  ["20260731100000_harden_commercial_offer_interest_security.sql", "facbccb7d4fe014c24922f22bb18255c10a0e59bfaceccd0691376aaec2ae58f"],
  ["20260731190000_harden_commercial_offer_child_read_scope.sql", "5cdb759417ef3c68cf4d81da5ed9cc80cefaa994e654167de320ca44f222a99f"],
  ["20260731200000_harden_commercial_offer_sales_assignment_rls.sql", "c9c98e69cb7ac1bbebedb7d13bd43f7b18b51a025ec2637a2cbe416736f16a35"],
]);

test("the six certified commercial migrations remain byte-identical", () => {
  for (const [file, expected] of certified) {
    const source = fs.readFileSync(path.join(migrations, file));
    assert.equal(crypto.createHash("sha256").update(source).digest("hex"), expected, file);
  }
});

test("the historical blanket demo-lead policy reproduces the customer leak", () => {
  assert.match(baseline, /create policy "leads_demo_read"[\s\S]*for select to "authenticated"[\s\S]*is_demo_record\(is_demo, environment\)/);
  assert.doesNotMatch(baseline.match(/create policy "leads_demo_read"[^;]+;/)?.[0] || "", /has_app_role|is_admin_role|is_staff_role/);
});

test("the application has no runtime need for blanket demo-lead visibility", () => {
  assert.match(adminLeads, /const staffRoles = \["super_admin", "admin", "sales_manager", "sales_partner"\]/);
  assert.match(adminLeads, /rows\.map\(mapLead\)\.filter\(\(lead\) => !isDemoLead\(lead\)\)/);
  assert.match(partnerRoles, /leads_admin_manage[\s\S]*has_app_role\(array\['super_admin','admin'\]\)/);
  assert.match(partnerRoles, /leads_sales_manager_select[\s\S]*has_app_role\(array\['sales_manager'\]\)/);
  assert.match(partnerRoles, /leads_sales_partner_select_own[\s\S]*has_app_role\(array\['sales_partner'\]\)[\s\S]*assigned_user_id = auth\.uid\(\)/);
});

test("one forward-only migration removes the blanket policy without replacing it", () => {
  assert.equal(fs.existsSync(migrationPath), true, `${migrationName} is required`);
  assert.equal(migrationSha256, "bdc3b1a612dc34225e46d649a4fcdf09a5d13b31091cc553d39beb690692e4f6");
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.equal((migration.match(/drop policy if exists leads_demo_read on public\.leads;/g) || []).length, 1);
  assert.equal((migration.match(/create policy/g) || []).length, 0);
  assert.doesNotMatch(migration, /\bto\s+(public|authenticated|anon|customer)\b/i);
  assert.doesNotMatch(migration, /\b(grant|revoke|create function|alter table|insert into|update|delete from|truncate|drop table)\b/i);
});

test("the certified ABSENT contract remains absent through every release prefix and rollback", () => {
  const release = [
    "20260730150000_commercial_offer_foundation.sql",
    "20260730170000_composer_service_role_read_fix.sql",
    "20260730223000_commercial_offer_phase_d1_mail.sql",
    "20260731100000_harden_commercial_offer_interest_security.sql",
    "20260731190000_harden_commercial_offer_child_read_scope.sql",
    "20260731200000_harden_commercial_offer_sales_assignment_rls.sql",
    migrationName,
  ];
  const syntheticBaseline = Object.freeze({
    leadsDemoRead: false,
    authFingerprint: "synthetic-auth-state-v1",
    existingDataFingerprint: "synthetic-existing-data-v1",
  });

  for (let prefix = 1; prefix <= release.length; prefix += 1) {
    const state = { ...syntheticBaseline };
    for (const file of release.slice(0, prefix)) {
      const sql = fs.readFileSync(path.join(migrations, file), "utf8");
      if (file !== migrationName) assert.doesNotMatch(sql, /\bleads_demo_read\b/i, file);
      if (file === migrationName) state.leadsDemoRead = false;
    }
    assert.equal(state.leadsDemoRead, false, `forward prefix ${prefix}`);

    // Rollback for migration 7 is intentionally a schema no-op. Earlier prefix
    // rollbacks remove release-owned commercial objects only.
    for (const file of release.slice(0, prefix).reverse()) {
      if (file === migrationName) state.leadsDemoRead = false;
    }
    assert.deepEqual(state, syntheticBaseline, `rollback prefix ${prefix}`);
  }
});

test("no deployed product runtime references leads_demo_read", () => {
  const runtimeRoots = ["functions", "public"];
  const matches = [];
  for (const runtimeRoot of runtimeRoots) {
    const pending = [path.join(root, runtimeRoot)];
    while (pending.length) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(target);
        else if (/\.(?:js|mjs|cjs|html|css|json)$/.test(entry.name)
            && fs.readFileSync(target, "utf8").includes("leads_demo_read")) matches.push(path.relative(root, target));
      }
    }
  }
  assert.deepEqual(matches, []);
});

test("customer, anon, demo_user and unassigned roles receive no substitute lead path", () => {
  for (const forbidden of ["customer", "anon", "demo_user", "designer"]) {
    assert.doesNotMatch(migration, new RegExp(`['\"]${forbidden}['\"]`, "i"));
  }
  assert.doesNotMatch(migration, /is_demo_record\s*\(/);
  assert.doesNotMatch(migration, /environment\s*=|is_demo\s*=|email/i);
});
