const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const apiPath = path.join(root, "functions/_food-api.js");
const routerPath = path.join(root, "functions/food-v1.js");
const migrationPath = path.join(root, "supabase/migrations/20260728162000_food_v1_application_api_support.sql");
const api = fs.readFileSync(apiPath, "utf8");
const router = fs.readFileSync(routerPath, "utf8");
const migration = fs.readFileSync(migrationPath, "utf8");
const fixture = fs.readFileSync(path.join(root, "tests/fixtures/food-v1-phase-1b-functional.sql"), "utf8");
const { handler, _private } = require(apiPath);

const accountA = "f4000000-0000-4000-8000-000000000001";
const locationA = "f5000000-0000-4000-8000-000000000001";
const categoryA = "f9000000-0000-4000-8000-000000000001";
const itemA = "fa000000-0000-4000-8000-000000000011";

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function jsonResult(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function event(method, route, options = {}) {
  return {
    httpMethod: method,
    path: `/api/food/v1${route}`,
    headers: options.headers || {},
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    queryStringParameters: options.query || {},
  };
}

function parse(result) {
  return JSON.parse(result.body || "{}");
}

function withEnv(values, fn) {
  const old = {};
  for (const [key, value] of Object.entries(values)) {
    old[key] = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  return Promise.resolve().then(fn).finally(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

const serviceEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
  SITE_URL: "https://maxwebstudio.nl",
  FOOD_PUBLIC_ORDERING_ENABLED: "true",
  FOOD_RATE_LIMIT_SECRET: "0123456789abcdef0123456789abcdef",
};

test("versioned router exposes only the nine Phase 1B contracts and no public order list", () => {
  assert.match(router, /require\("\.\/_food-api"\)/);
  for (const fragment of ["storefronts", "menu", "orders", "confirmation", "accounts", "status", "updateMenuItem"]) assert.equal(api.includes(fragment), true, fragment);
  assert.doesNotMatch(api, /method === "GET"[^\n]*\/storefronts\\\/\(\[\^\/]\+\)\\\/orders\$\//);
  const netlify = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
  assert.match(netlify, /from = "\/api\/food\/v1\/\*"[\s\S]*to = "\/\.netlify\/functions\/food-v1\/:splat"/);
});

test("public menu adapter requests only published, active and available records", () => {
  assert.match(api, /status: "eq\.published"/);
  assert.match(api, /menu_id: `eq\.\$\{menu\.id\}`, active: "eq\.true"/);
  assert.match(api, /active: "eq\.true", available: "eq\.true"/);
});

test("public storefront and menu remove tenant and location identities", async () => withEnv(serviceEnv, async () => {
  const oldFetch = global.fetch;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("restaurant_locations")) return jsonResult([{ id: locationA, food_account_id: accountA, name: "Silverado", slug: "silverado", timezone: "Europe/Amsterdam", phone: null, city: "Emmeloord", country_code: "NL" }]);
    if (value.includes("food_accounts")) return jsonResult([{ id: accountA, name: "Silverado", currency: "EUR", timezone: "Europe/Amsterdam" }]);
    if (value.includes("/menus?")) return jsonResult([{ id: "f8000000-0000-4000-8000-000000000001", name: "Menu", published_at: "2026-07-28T12:00:00Z" }]);
    if (value.includes("menu_categories")) return jsonResult([{ id: categoryA, name: "Roti", sort_order: 1 }]);
    if (value.includes("menu_items")) return jsonResult([{ id: itemA, category_id: categoryA, tax_class_id: "fb000000-0000-4000-8000-000000000001", name: "Roti kip", description: "Test", price_minor: 1495, available: true, sort_order: 1 }]);
    if (value.includes("restaurant_tax_classes")) return jsonResult([{ id: "fb000000-0000-4000-8000-000000000001", rate_basis_points: 900 }]);
    throw new Error(`unexpected URL ${value}`);
  };
  try {
    const result = await handler(event("GET", "/storefronts/silverado/menu"));
    const body = parse(result);
    assert.equal(result.statusCode, 200);
    assert.equal(body.data.categories[0].items[0].price_minor, 1495);
    assert.equal(body.data.categories[0].items[0].item_ref, itemA);
    assert.doesNotMatch(JSON.stringify(body.data), /food_account_id|location_id|tax_class_id|menu_id/);
  } finally { global.fetch = oldFetch; }
}));

test("public order validation rejects delivery, duplicate rows, invalid quantities and mass assignment", () => {
  assert.throws(() => _private.validateOrder({ fulfilment_type: "delivery", customer: {}, pickup: {}, items: [] }), /PICKUP_ONLY/);
  const base = { fulfilment_type: "pickup", customer: { name: "Test", phone: "0612345678" }, pickup: {}, items: [{ item_ref: itemA, quantity: 1 }] };
  assert.throws(() => _private.validateOrder({ ...base, items: [...base.items, ...base.items] }), /INVALID_ITEMS/);
  assert.throws(() => _private.validateOrder({ ...base, items: [{ item_ref: itemA, quantity: 0 }] }), /INVALID_ITEMS/);
  assert.throws(() => _private.validateOrder({ ...base, total_minor: 1 }), /UNKNOWN_FIELD/);
  assert.throws(() => _private.validateOrder({ ...base, customer: { ...base.customer, name: "<script>" } }), /INVALID_REQUEST/);
});

test("manipulated client prices never reach the controlled order RPC", async () => withEnv(serviceEnv, async () => {
  const calls = [];
  const oldFetch = global.fetch;
  global.fetch = async (url) => { calls.push(String(url)); return jsonResult(true); };
  try {
    const result = await handler(event("POST", "/storefronts/silverado/orders", {
      headers: { "idempotency-key": "checkout-attempt-0001", "x-nf-client-connection-ip": "203.0.113.10" },
      body: { fulfilment_type: "pickup", customer: { name: "Test", phone: "0612345678" }, pickup: {}, items: [{ item_ref: itemA, quantity: 1, price_minor: 1 }] },
    }));
    assert.equal(result.statusCode, 400);
    assert.equal(parse(result).code, "UNKNOWN_FIELD");
    assert.equal(calls.some((url) => url.includes("food_create_order_v1")), false);
  } finally { global.fetch = oldFetch; }
}));

test("order creation uses durable limiter then Phase 1A RPC and strips its internal order id", async () => withEnv(serviceEnv, async () => {
  const calls = [];
  const oldFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    if (String(url).includes("food_consume_order_rate_limit_v1")) return jsonResult(true);
    return jsonResult({ id: "fc000000-0000-4000-8000-000000000001", public_reference: "a".repeat(32), status: "pending", currency: "EUR", subtotal_minor: 1495, tax_minor: 123, total_minor: 1495, idempotent_replay: false });
  };
  try {
    const result = await handler(event("POST", "/storefronts/silverado/orders", {
      headers: { "idempotency-key": "checkout-attempt-0001", "x-nf-client-connection-ip": "203.0.113.10" },
      body: { fulfilment_type: "pickup", customer: { name: "Test", phone: "0612345678" }, pickup: {}, items: [{ item_ref: itemA, quantity: 1 }] },
    }));
    const body = parse(result);
    assert.equal(result.statusCode, 201);
    assert.equal(body.data.total_minor, 1495);
    assert.equal(body.data.id, undefined);
    assert.match(body.data.confirmation_path, /a{32}\/confirmation$/);
    assert.match(calls[0].url, /food_consume_order_rate_limit_v1/);
    assert.match(calls[1].url, /food_create_order_v1/);
    assert.equal("price_minor" in calls[1].body, false);
    assert.equal("food_account_id" in calls[1].body, false);
  } finally { global.fetch = oldFetch; }
}));

test("public ordering fails closed without enable flag, HMAC secret, client identity or valid idempotency", async () => {
  const base = event("POST", "/storefronts/silverado/orders", { headers: { "idempotency-key": "checkout-attempt-0001", "x-nf-client-connection-ip": "203.0.113.10" }, body: {} });
  await withEnv({ ...serviceEnv, FOOD_PUBLIC_ORDERING_ENABLED: undefined }, async () => assert.equal((await handler(base)).statusCode, 503));
  await withEnv({ ...serviceEnv, FOOD_RATE_LIMIT_SECRET: "short" }, async () => assert.equal((await handler(base)).statusCode, 503));
  await withEnv(serviceEnv, async () => assert.equal((await handler({ ...base, headers: { "idempotency-key": "checkout-attempt-0001" } })).statusCode, 429));
  await withEnv(serviceEnv, async () => assert.equal((await handler({ ...base, headers: { "x-nf-client-connection-ip": "203.0.113.10" } })).statusCode, 400));
});

test("body size, origin, request-id, timeout and generic error controls are explicit", () => {
  assert.match(api, /MAX_BODY_BYTES = 16 \* 1024/);
  assert.match(api, /origin !== allowedCorsOrigin\(\)/);
  assert.match(api, /UPSTREAM_TIMEOUT_MS = 5000/);
  assert.match(api, /X-Request-Id/);
  assert.doesNotMatch(api, /error\.message|customer_snapshot\s*[:,]\s*safe|console\.(?:log|error)\([^\n]*event\.body/);
});

test("logs contain trace and classified codes but never the submitted PII payload", async () => withEnv(serviceEnv, async () => {
  const entries = [];
  const oldError = console.error;
  console.error = (...args) => entries.push(args);
  try {
    await handler(event("POST", "/storefronts/silverado/orders", {
      headers: { "idempotency-key": "bad" },
      body: { customer: { name: "PRIVATE-NAME", phone: "PRIVATE-PHONE" } },
    }));
    assert.doesNotMatch(JSON.stringify(entries), /PRIVATE-NAME|PRIVATE-PHONE/);
    assert.match(JSON.stringify(entries), /IDEMPOTENCY_KEY_REQUIRED/);
  } finally { console.error = oldError; }
}));

test("confirmation uses a 128-bit opaque reference, slug binding and redacted service-only RPC", () => {
  assert.match(migration, /input_public_reference !~ '\^\[a-f0-9\]\{32\}\$'/);
  assert.match(migration, /location\.slug = input_location_slug[\s\S]*food_order\.public_reference = input_public_reference/);
  assert.doesNotMatch(migration.slice(migration.indexOf("food_get_order_confirmation_v1")), /customer_snapshot|customer_note|food_order\.id,/);
  assert.match(migration, /revoke all on function public\.food_get_order_confirmation_v1\(text,text\)[\s\S]*from public, anon, authenticated/);
});

test("durable order rate limiting is HMAC-keyed, atomic, location-scoped and service-only", () => {
  assert.match(api, /createHmac\("sha256", secret\)\.update\(`food-v1:\$\{slug\}:\$\{client\}`\)/);
  assert.match(migration, /primary key \(location_id, rate_key_hash\)/);
  assert.match(migration, /for update;/);
  assert.match(migration, /request_count >= input_max_requests/);
  assert.match(migration, /force row level security/);
  assert.match(fixture, /rate limiter was not location scoped/);
});

test("idempotency replay and conflicting reuse remain database-enforced by Phase 1A", () => {
  const phase1a = fs.readFileSync(path.join(root, "supabase/migrations/20260728161000_food_v1_tenant_security.sql"), "utf8");
  assert.match(phase1a, /idempotent_replay', true/);
  assert.match(phase1a, /Idempotency key was reused with a different request/i);
  assert.match(api, /code === "23505"[\s\S]*IDEMPOTENCY_CONFLICT/);
});

test("restaurant requests authenticate session then bind account, location, role and capability", () => {
  assert.match(api, /\/auth\/v1\/user/);
  assert.match(api, /food_account_members/);
  assert.match(api, /row\.location_id === locationId/);
  assert.equal((api.match(/"orders\.management"/g) || []).length >= 2, true);
  assert.equal((api.match(/"menu\.management"/g) || []).length >= 2, true);
});

test("order list/detail queries are tenant-bound and safely paginated", () => {
  assert.match(api, /food_account_id: `eq\.\$\{accountId\}`, location_id: `eq\.\$\{locationId\}`/);
  assert.match(api, /limit < 1 \|\| limit > 100/);
  assert.match(api, /offset < 0 \|\| offset > 10000/);
  assert.match(api, /id: `eq\.\$\{orderId\}`, food_account_id: `eq\.\$\{accountId\}`/);
});

test("cross-tenant order access is denied by both URL filters and Phase 1A RLS", () => {
  const phase1a = fs.readFileSync(path.join(root, "supabase/migrations/20260728161000_food_v1_tenant_security.sql"), "utf8");
  assert.match(phase1a, /food_orders_member_select[\s\S]*is_food_member\(food_account_id[\s\S]*location_id/);
  assert.match(api, /membershipFor\(context, row\.location_id/);
  assert.match(fixture, /tenant B slug unexpectedly resolved tenant A confirmation/);
});

test("status mutation delegates exclusively to actor-aware Phase 1A transition RPC", () => {
  assert.match(api, /serviceRpc\("food_transition_order_status_v1"/);
  assert.match(api, /input_actor_profile_id: context\.profile\.id/);
  assert.doesNotMatch(api, /sessionQuery\("food_orders"[^;]*method: "PATCH"/);
  const phase1a = fs.readFileSync(path.join(root, "supabase/migrations/20260728161000_food_v1_tenant_security.sql"), "utf8");
  assert.match(phase1a, /Kitchen role cannot perform this order transition/);
  assert.match(phase1a, /Unsupported food order transition/);
});

test("menu mutation is allowlisted, integer-minor-unit only, manager-only and tenant-bound", () => {
  assert.match(api, /exactObject\(parseJsonBody\(event\), \["price_minor", "available", "active"\]/);
  assert.match(api, /Number\.isSafeInteger\(body\.price_minor\)/);
  assert.match(api, /membershipFor\(context, item\.location_id, MANAGER_ROLES\)/);
  assert.match(api, /food_account_id: `eq\.\$\{accountId\}`, location_id: `eq\.\$\{item\.location_id\}`/);
  assert.match(api, /method: "PATCH", body, prefer: "return=representation"/);
});

test("service role is confined to public read models, limiter, creation, confirmation and transition adapters", () => {
  assert.equal((api.match(/serviceRpc\(/g) || []).length >= 5, true);
  assert.doesNotMatch(api, /serviceQuery\("food_orders"|serviceQuery\("food_order_items"/);
  assert.doesNotMatch(api, /Authorization: `Bearer \$\{config\.serviceKey\}`/);
  assert.match(api, /const token = service \? config\.serviceKey : bearer/);
});

test("API response and source contain no provider secrets or provider integrations", () => {
  assert.doesNotMatch(`${api}\n${migration}`, /mollie|google business|meta|whatsapp|thuisbezorgd/i);
  for (const secret of ["SUPABASE_SERVICE_ROLE_KEY", "FOOD_RATE_LIMIT_SECRET"]) {
    assert.doesNotMatch(api, new RegExp(`body[^\n]*${secret}|data[^\n]*${secret}`));
  }
});

test("Phase 1B migration is forward-only and preserves both Phase 1A migration bytes", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.doesNotMatch(migration, /\b(delete\s+from|truncate|drop\s+table|alter\s+table\s+public\.(?:food_orders|menu_items)\s+drop)\b/i);
  const phase1aFileset = JSON.parse(fs.readFileSync(path.join(root, "docs/release-readiness/food-v1-phase-1a-product-migrations/FILESET.json"), "utf8"));
  for (const entry of phase1aFileset.files) assert.equal(sha256(path.join(root, entry.path)), entry.sha256);
});

test("Phase 1B release unit exactly checksums the new migration and authorizes no remote execution", () => {
  const directory = path.join(root, "docs/release-readiness/food-v1-phase-1b-product-migrations");
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "MANIFEST.json"), "utf8"));
  const fileset = JSON.parse(fs.readFileSync(path.join(directory, "FILESET.json"), "utf8"));
  assert.equal(manifest.remoteExecutionAuthorizedByThisManifest, false);
  assert.deepEqual(manifest.executionOrder, ["supabase/migrations/20260728162000_food_v1_application_api_support.sql"]);
  assert.equal(fileset.files[0].bytes, fs.statSync(migrationPath).size);
  assert.equal(fileset.files[0].sha256, sha256(migrationPath));
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json"), "utf8"));
  assert.equal(catalog.releases.filter((release) => release.manifest.includes("food-v1-phase-1b")).length, 1);
});

test("isolated validation prohibits remote database context and covers Phase 1A plus Phase 1B", () => {
  const script = fs.readFileSync(path.join(root, "scripts/food-v1-phase-1b-local-validation.zsh"), "utf8");
  assert.match(script, /listen_addresses=''/);
  for (const key of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_REF", "SUPABASE_DB_URL", "DATABASE_URL"]) assert.match(script, new RegExp(key));
  assert.match(script, /food-v1-phase-1a-functional\.sql/);
  assert.match(script, /food-v1-phase-1b-functional\.sql/);
  assert.doesNotMatch(script, /supabase\s+(?:link|db push|migration repair)/i);
});
