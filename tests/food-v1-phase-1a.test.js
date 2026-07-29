const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "supabase/migrations/20260728160000_food_v1_data_foundation.sql");
const securityPath = path.join(root, "supabase/migrations/20260728161000_food_v1_tenant_security.sql");
const schema = fs.readFileSync(schemaPath, "utf8");
const security = fs.readFileSync(securityPath, "utf8");
const fixture = fs.readFileSync(path.join(root, "tests/fixtures/food-v1-phase-1a-functional.sql"), "utf8");
const manifestDir = path.join(root, "docs/release-readiness/food-v1-phase-1a-product-migrations");

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("Food v1 foundation is forward-only, preflighted and independent of Silverado code paths", () => {
  assert.match(schema, /^begin;/m);
  assert.match(schema, /^commit;/m);
  assert.match(schema, /requires public\.customers and public\.profiles/i);
  assert.doesNotMatch(schema, /\b(delete\s+from|truncate|drop\s+table|alter\s+table\s+public\.(?:customers|profiles))\b/i);
  assert.doesNotMatch(`${schema}\n${security}`, /silverado/i);
  assert.doesNotMatch(`${schema}\n${security}`, /create (?:table|function) public\.(?:mollie|google|meta|whatsapp|thuisbezorgd|loyalty|reservation)/i);
});

test("all Phase 1A Food relations exist and use UUID primary identities", () => {
  for (const table of [
    "food_accounts", "restaurant_locations", "food_account_members",
    "food_capability_catalog", "food_entitlements", "restaurant_capabilities",
    "restaurant_tax_classes", "menus", "menu_categories", "menu_items",
    "food_orders", "food_order_items", "food_order_status_history",
    "food_order_idempotency",
  ]) {
    assert.match(schema, new RegExp(`create table public\\.${table} \\(`));
  }
  assert.match(schema, /create table public\.food_accounts \([\s\S]*id uuid primary key default gen_random_uuid\(\)/);
});

test("customers remains the platform anchor and food_account_id is the Food boundary", () => {
  assert.match(schema, /customer_id uuid not null unique references public\.customers\(id\) on delete restrict/);
  for (const table of [
    "restaurant_locations", "food_account_members", "food_entitlements",
    "restaurant_capabilities", "restaurant_tax_classes", "menus",
    "menu_categories", "menu_items", "food_orders", "food_order_items",
    "food_order_status_history", "food_order_idempotency",
  ]) {
    const start = schema.indexOf(`create table public.${table}`);
    assert.notEqual(start, -1, table);
    assert.match(schema.slice(start, start + 1800), /food_account_id uuid not null/);
  }
});

test("cross-tenant category, tax, location, order and item references are composite", () => {
  for (const constraint of [
    "food_account_members_location_tenant_fk",
    "restaurant_capabilities_location_tenant_fk",
    "restaurant_capabilities_entitlement_fk",
    "menus_location_tenant_fk",
    "menu_categories_menu_tenant_fk",
    "menu_items_category_tenant_fk",
    "menu_items_tax_tenant_fk",
    "food_orders_location_tenant_fk",
    "food_order_items_order_tenant_fk",
    "food_order_items_menu_tenant_fk",
    "food_order_status_history_order_tenant_fk",
    "food_order_idempotency_location_tenant_fk",
    "food_order_idempotency_order_tenant_fk",
  ]) {
    assert.match(schema, new RegExp(`constraint ${constraint}`));
  }
});

test("money, tax and immutable order snapshots use integer database constraints", () => {
  assert.match(schema, /price_minor bigint not null check \(price_minor between 0 and 100000000\)/);
  assert.match(schema, /rate_basis_points integer not null check \(rate_basis_points between 0 and 10000\)/);
  assert.match(schema, /food_orders_total_check check \(total_minor = subtotal_minor \+ delivery_minor - discount_minor\)/);
  assert.match(schema, /item_name_snapshot text not null/);
  assert.match(schema, /tax_rate_basis_points integer not null/);
  assert.match(security, /Food order item snapshots are immutable/);
  assert.match(security, /Food order financial and customer snapshots are immutable/);
});

test("status values, transitions and append-only history fail closed", () => {
  for (const status of ["pending", "accepted", "preparing", "ready", "out_for_delivery", "completed", "cancelled"]) {
    assert.match(schema, new RegExp(`'${status}'`));
  }
  assert.match(security, /Unsupported food order transition/);
  assert.match(security, /Pickup orders cannot be out for delivery/);
  assert.match(security, /Delivery orders must pass through out_for_delivery/);
  assert.match(security, /Food order status history is append-only/);
  assert.match(security, /before update or delete on public\.food_order_status_history/);
});

test("idempotency is scoped, hashed and enforced inside controlled order creation", () => {
  assert.match(schema, /food_order_idempotency_location_key_unique unique \(location_id, idempotency_key\)/);
  assert.match(schema, /request_hash text not null check \(request_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/);
  assert.match(security, /create function public\.food_create_order_v1/);
  assert.match(security, /digest\([\s\S]*'sha256'/);
  assert.match(security, /Food idempotency key was reused with a different request/);
  assert.match(security, /for update;/);
});

test("controlled order creation ignores client money and recalculates published tenant items", () => {
  const signature = security.slice(security.indexOf("create function public.food_create_order_v1"), security.indexOf("create function public.food_transition_order_status_v1"));
  assert.doesNotMatch(signature, /input_(?:price|subtotal|tax|total|food_account_id)/i);
  assert.match(signature, /menu\.status = 'published'/);
  assert.match(signature, /menu_item\.active/);
  assert.match(signature, /menu_item\.available/);
  assert.match(signature, /line_subtotal := item_price \* item_quantity/);
  assert.match(signature, /round\(\(line_subtotal::numeric \* item_tax_rate::numeric\) \/ \(10000 \+ item_tax_rate\)\)/);
  assert.match(signature, /Only pickup is enabled in the Food v1 pilot foundation/);
  assert.match(signature, /Food order payload is too large/);
  assert.match(signature, /Food order item contains an unsupported field/);
  assert.match(signature, /Food order snapshot contains an unsupported field/);
});

test("capability enforcement separates availability, entitlement and location configuration", () => {
  assert.match(schema, /availability_status in \('unavailable','preview','available'\)/);
  assert.match(schema, /status in \('active','suspended','expired'\)/);
  assert.match(schema, /restaurant_capabilities_entitlement_fk/);
  assert.match(security, /catalog\.availability_status = 'available'/);
  assert.match(security, /entitlement\.status = 'active'/);
  assert.match(security, /configuration\.enabled/);
  for (const key of ["ordering.pickup", "menu.management", "orders.management"]) assert.match(schema, new RegExp(key.replace(".", "\\.")));
});

test("RLS is enabled everywhere and anon receives no direct Food table rights", () => {
  const tables = [
    "food_accounts", "restaurant_locations", "food_account_members",
    "food_capability_catalog", "food_entitlements", "restaurant_capabilities",
    "restaurant_tax_classes", "menus", "menu_categories", "menu_items",
    "food_orders", "food_order_items", "food_order_status_history", "food_order_idempotency",
  ];
  for (const table of tables) {
    assert.match(security, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(security, /revoke all on table[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(security, /grant [^;]* on table public\.food_orders[^;]* to anon/i);
  assert.doesNotMatch(security, /create policy [^;]* on public\.food_orders for insert to anon/i);
  assert.doesNotMatch(security, /grant (?:insert|update|delete)[^;]*public\.food_order_(?:items|status_history)[^;]*to authenticated/i);
  assert.doesNotMatch(security, /grant (?:insert|update|delete)[^;]*public\.food_(?:orders|order_items|order_status_history|order_idempotency)[^;]*to service_role/i);
});

test("Food membership is profile-based, location-aware and separate from platform roles", () => {
  assert.match(schema, /profile_id uuid not null references public\.profiles\(id\)/);
  assert.match(schema, /role text not null check \(role in \('owner','manager','staff','kitchen_staff','viewer'\)\)/);
  assert.match(security, /membership\.profile_id = public\.current_profile_id\(\)/);
  assert.match(security, /membership\.location_id is null[\s\S]*membership\.location_id = target_location_id/);
  assert.match(security, /food_order_items_member_select[\s\S]*parent_order\.location_id/);
  assert.match(security, /food_order_status_history_member_select[\s\S]*parent_order\.location_id/);
  assert.match(security, /actor_profile\.role in \('super_admin','admin'\)/);
  assert.doesNotMatch(schema, /alter table public\.profiles/);
});

test("database mutation RPCs require service role and still validate explicit actor membership", () => {
  assert.match(security, /Food mutation requires service_role plus explicit actor validation/);
  assert.match(security, /perform public\.food_assert_service_role\(\)/g);
  assert.match(security, /membership\.food_account_id = target_order\.food_account_id/);
  assert.match(security, /membership\.profile_id = actor_profile\.id/);
  assert.match(security, /Kitchen role cannot perform this order transition/);
  assert.match(security, /revoke all on function public\.food_create_order_v1[\s\S]*from public, anon, authenticated/);
});

test("fixtures contain two isolated tenants, ten Silverado test items and no provider data", () => {
  assert.match(fixture, /Silverado Roti Shop/);
  assert.match(fixture, /Isolation Restaurant B/);
  assert.equal((fixture.match(/'Alleen testfixture'/g) || []).length, 10);
  assert.match(fixture, /tenant A account isolation failed/);
  assert.match(fixture, /cross-tenant category unexpectedly accepted/);
  assert.match(fixture, /anon unexpectedly selected food orders/);
  assert.match(fixture, /historical order snapshot changed with menu/);
  assert.doesNotMatch(fixture, /mollie|google|whatsapp|thuisbezorgd/i);
});

test("release unit exactly checksums both forward-only product migrations", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, "MANIFEST.json"), "utf8"));
  const fileset = JSON.parse(fs.readFileSync(path.join(manifestDir, "FILESET.json"), "utf8"));
  assert.equal(manifest.remoteExecutionAuthorizedByThisManifest, false);
  assert.deepEqual(manifest.executionOrder, [
    "supabase/migrations/20260728160000_food_v1_data_foundation.sql",
    "supabase/migrations/20260728161000_food_v1_tenant_security.sql",
  ]);
  for (const entry of fileset.files) {
    const file = path.join(root, entry.path);
    assert.equal(fs.statSync(file).size, entry.bytes, entry.path);
    assert.equal(sha256(file), entry.sha256, entry.path);
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json"), "utf8"));
  assert.equal(catalog.releases.filter((release) => release.manifest.includes("food-v1-phase-1a")).length, 1);
});

test("local validation is isolated and rejects every remote database context", () => {
  const script = fs.readFileSync(path.join(root, "scripts/food-v1-phase-1a-local-validation.zsh"), "utf8");
  assert.match(script, /mktemp -d \/private\/tmp\/food-v1-phase-1a/);
  assert.match(script, /listen_addresses=''/);
  for (const key of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_REF", "SUPABASE_DB_URL", "DATABASE_URL"]) {
    assert.match(script, new RegExp(key));
  }
  assert.doesNotMatch(script, /supabase\s+(?:link|db push|migration repair)/i);
});
