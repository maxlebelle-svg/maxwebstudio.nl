const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _private } = require("../functions/admin-food-demo-bundles");

const root = path.resolve(__dirname, "..");
const migrationName = "20260729180000_food_demo_bundle_service_role_acl_repair.sql";
const migration = fs.readFileSync(path.join(root, "supabase/migrations", migrationName), "utf8");
const original = fs.readFileSync(path.join(root, "supabase/migrations/20260729170000_food_demo_bundles.sql"), "utf8");
const handler = fs.readFileSync(path.join(root, "functions/admin-food-demo-bundles.js"), "utf8");
const validation = fs.readFileSync(path.join(root, "scripts/food-demo-bundle-acl-repair-local-validation.zsh"), "utf8");
const fixture = fs.readFileSync(path.join(root, "tests/fixtures/food-demo-bundle-acl-repair-functional.sql"), "utf8");

const tables = [
  "food_demo_bundles",
  "food_demo_bundle_dispatches",
  "food_demo_bundle_events",
  "food_demo_bundle_rate_limits",
];
const externalRpcs = [
  "food_demo_bundle_read_v1",
  "food_demo_bundle_upsert_v1",
  "food_demo_bundle_update_links_v1",
  "food_demo_bundle_reserve_dispatch_v1",
  "food_demo_bundle_complete_dispatch_v1",
  "food_demo_bundle_revoke_v1",
];

test("repair is a separate forward-only migration and leaves the applied migration intact", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /lock_timeout = '5s'/);
  assert.match(migration, /statement_timeout = '2min'/);
  assert.match(original, /grant all on public\.food_demo_bundles/);
  assert.doesNotMatch(migration, /\b(drop\s+table|truncate\s+table|delete\s+from|alter\s+role)\b/i);
});

test("all four direct service_role table grants are revoked", () => {
  assert.match(migration, /revoke all privileges on table[\s\S]*from public, anon, authenticated, service_role/i);
  for (const table of tables) {
    assert.match(migration, new RegExp(`public\\.${table}`));
    assert.match(fixture, new RegExp(`has_table_privilege\\('service_role','public\\.' \\|\\| target_table,forbidden\\)`));
  }
  assert.match(migration, /has_table_privilege\('service_role',target_table,forbidden_privilege\)/);
});

test("only six bounded bundle RPCs are exposed to service_role", () => {
  for (const rpc of externalRpcs) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`));
    assert.match(handler, new RegExp(rpc));
  }
  for (const internal of ["food_demo_bundle_assert_scope_v1", "food_demo_bundle_append_event_v1", "consume_food_demo_bundle_rate_limit"])
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${internal}`));
  assert.match(migration, /security definer/g);
  assert.match(migration, /set search_path = pg_catalog, public/g);
});

test("bundle runtime has no direct REST path for repaired tables", () => {
  for (const table of tables) {
    assert.doesNotMatch(handler, new RegExp(`/rest/v1/${table}`));
    assert.doesNotMatch(handler, new RegExp(`rest\\([^\\n]+["']${table}["']`));
  }
  assert.match(handler, /disableLegacyToken: true/);
  assert.match(handler, /input_actor_profile_id:admin\.profileId/);
  assert.match(handler, /input_actor_auth_user_id:admin\.id/);
});

test("RPC client sends a POST body and maps a database scope denial to 403", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: false, status: 400, json: async () => ({ code: "42501" }) };
  };
  await assert.rejects(
    _private.bundleRpc(fetchImpl, { url: "https://local.invalid", key: "local-key" }, "food_demo_bundle_read_v1", {
      input_actor_profile_id: "20000000-0000-4000-8000-000000000001",
      input_actor_auth_user_id: "10000000-0000-4000-8000-000000000001",
    }),
    (error) => error.statusCode === 403 && error.code === "RELATIONSHIP_FORBIDDEN",
  );
  assert.equal(request.url, "https://local.invalid/rest/v1/rpc/food_demo_bundle_read_v1");
  assert.equal(request.options.method, "POST");
  assert.doesNotMatch(request.url, /food_demo_bundles(?:\?|$)/);
});

test("isolated validation is local-only and covers scope, idempotency and append-only audit", () => {
  assert.match(validation, /listen_addresses=''/);
  assert.match(validation, /remote environment variable forbidden/);
  assert.match(validation, new RegExp(migrationName));
  assert.match(fixture, /cross-scope read unexpectedly allowed/);
  assert.match(fixture, /idempotent reservation failed/);
  assert.match(fixture, /append-only event update unexpectedly allowed/);
  assert.match(fixture, /PASS_FOOD_DEMO_BUNDLE_ACL_REPAIR_FUNCTIONAL/);
  assert.doesNotMatch(validation, /supabase\s+(?:link|db push|migration repair)/i);
});
