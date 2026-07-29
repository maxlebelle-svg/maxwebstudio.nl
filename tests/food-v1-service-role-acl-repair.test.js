const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationName = "20260728211000_food_v1_service_role_order_acl_hardening.sql";
const migrationPath = path.join(root, "supabase/migrations", migrationName);
const migration = fs.readFileSync(migrationPath, "utf8");
const api = fs.readFileSync(path.join(root, "functions/_food-api.js"), "utf8");
const validation = fs.readFileSync(path.join(root, "scripts/food-v1-service-role-acl-repair-local-validation.zsh"), "utf8");
const fixture = fs.readFileSync(path.join(root, "tests/fixtures/food-v1-service-role-acl-repair-functional.sql"), "utf8");
const demoRepairName = "20260729180000_food_demo_bundle_service_role_acl_repair.sql";
const demoRepair = fs.readFileSync(path.join(root, "supabase/migrations", demoRepairName), "utf8");

const originalChecksums = new Map([
  ["00000000000000_authoritative_baseline.sql", "1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315"],
  ["20260726200000_partner_profile_role_status_foundation.sql", "049f511b70b440733e0f5f00bb0b7fb5b2c184e9eb0fd8ff8fd637dc84d1fbb3"],
  ["20260728160000_food_v1_data_foundation.sql", "9bcb252d2e3e136251b9bf2200aa9c314ae7807712735d9bfeff4d6e69c8cbdf"],
  ["20260728161000_food_v1_tenant_security.sql", "e9511b6a527ce4876287b3070215b2e2376fdb5f8f48a918e81dbf650fb0d3fe"],
  ["20260728162000_food_v1_application_api_support.sql", "bb158c7c424105fa5af78b11f7b314ddf5c48560ff5573dfebcdb89afffc34c0"],
  ["20260728163000_food_v1_storefront_confirmation.sql", "4b1deb237cf8fa86890e5ea58c33ad65aac441d6ac60e4a37e9885fae3bea6ac"],
  ["20260728210000_food_v1_online_demo_reset.sql", "19842a24cacf2976d57693c5232c2f87cab49ef264bbf96d36ae49828471915b"],
]);

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("hardening is one forward-only, fail-closed Food ACL migration", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /lock_timeout = '5s'/);
  assert.match(migration, /statement_timeout = '2min'/);
  assert.doesNotMatch(migration, /\b(drop\s+table|delete\s+from|truncate\s+table|alter\s+role\s+service_role)\b/i);
  assert.match(migration, /expects the platform-managed BYPASSRLS role and does not alter it/);
});

test("all direct service-role order privileges are revoked and only six read models retain SELECT", () => {
  for (const table of ["food_orders", "food_order_items", "food_order_status_history", "food_order_idempotency"]) {
    assert.match(migration, new RegExp(`public\\.${table}`));
    assert.match(fixture, new RegExp(`has_table_privilege\\('service_role', target_table, forbidden_privilege\\)`));
  }
  for (const table of ["food_accounts", "restaurant_locations", "restaurant_tax_classes", "menus", "menu_categories", "menu_items"]) {
    assert.match(migration, new RegExp(`grant select on table[\\s\\S]*public\\.${table}[\\s\\S]*to service_role`, "i"));
  }
  assert.doesNotMatch(api, /serviceQuery\("food_orders"|serviceQuery\("food_order_items"|serviceQuery\("food_order_status_history"|serviceQuery\("food_order_idempotency"/);
});

test("only externally required Food RPCs are restored to service_role", () => {
  for (const name of [
    "food_consume_order_rate_limit_v1", "food_create_order_v1",
    "food_get_order_confirmation_v1", "food_transition_order_status_v1",
    "food_reset_demo_account_v1",
  ]) assert.match(migration, new RegExp(`grant execute on function public\\.${name}`));
  for (const internal of [
    "food_assert_service_role", "food_assert_demo_service_role",
    "food_order_item_immutable_guard", "food_order_history_immutable_guard",
  ]) assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${internal}`));
  assert.match(migration, /SECURITY DEFINER and owned by the Food table owner/);
  assert.match(migration, /search_path=pg_catalog, public, extensions/);
});

test("schema-wide default privileges remain untouched and future Food migrations require explicit ACLs", () => {
  const executableMigration = migration.replace(/--.*$/gm, "");
  assert.doesNotMatch(executableMigration, /alter default privileges/i);
  assert.match(migration, /cannot[\s\S]*target Food table names/);
  const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
    .filter((name) => name > migrationName && name.endsWith(".sql"));
  for (const name of migrations) {
    const sql = fs.readFileSync(path.join(root, "supabase/migrations", name), "utf8");
    const createdTables = [...sql.matchAll(/create table(?: if not exists)? public\.((?:food|restaurant)_\w+|menus|menu_categories|menu_items)\s*\(/gi)];
    for (const [, table] of createdTables) {
      const sameFileRepair = new RegExp(`revoke[\\s\\S]*on table[\\s\\S]*public\\.${table}[\\s\\S]*from[\\s\\S]*service_role`, "i").test(sql);
      const laterExplicitRepair = name < demoRepairName
        && new RegExp(`revoke all privileges on table[\\s\\S]*public\\.${table}[\\s\\S]*from public, anon, authenticated, service_role`, "i").test(demoRepair);
      assert.ok(sameFileRepair || laterExplicitRepair, `${name}:${table} requires a same-file or explicit later forward repair`);
    }
  }
  for (const table of ["food_demo_bundles", "food_demo_bundle_dispatches", "food_demo_bundle_events", "food_demo_bundle_rate_limits"]) {
    assert.match(demoRepair, new RegExp(`public\\.${table}`));
  }
});

test("isolated validation reproduces Supabase grants and proves direct denial plus RPC continuity", () => {
  assert.match(validation, /listen_addresses=''/);
  assert.match(validation, /grant all privileges on all tables in schema public to service_role/);
  assert.match(validation, /food-v1-phase-1a-functional\.sql/);
  assert.match(validation, /food-v1-phase-1b-functional\.sql/);
  assert.match(validation, /food-v1-online-demo-reset-functional\.sql/);
  assert.match(fixture, /insert into public\.food_orders default values/);
  assert.match(fixture, /truncate table public\.food_orders/);
  assert.match(fixture, /PASS_FOOD_V1_SERVICE_ROLE_ACL_REPAIR_FUNCTIONAL/);
  assert.doesNotMatch(validation, /supabase\s+(?:link|db push|migration repair)/i);
});

test("the original seven remote migrations remain byte-for-byte unchanged", () => {
  for (const [name, expected] of originalChecksums) {
    assert.equal(sha256(path.join(root, "supabase/migrations", name)), expected, name);
  }
});
