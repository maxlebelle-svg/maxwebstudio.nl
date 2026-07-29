const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const netlify = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
const storefront = fs.readFileSync(path.join(root, "public/food.html"), "utf8");
const dashboardHtml = fs.readFileSync(path.join(root, "public/admin-food.html"), "utf8");
const dashboardJs = fs.readFileSync(path.join(root, "public/admin/food/dashboard.js"), "utf8");
const apiSource = fs.readFileSync(path.join(root, "functions/_food-api.js"), "utf8");
const resetMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260728210000_food_v1_online_demo_reset.sql"), "utf8");
const seed = fs.readFileSync(path.join(root, "supabase/demo/food-v1-online-demo-seed.sql"), "utf8");
const bundleDir = path.join(root, "docs/release-readiness/food-v1-online-demo-bundle");
const bundleManifest = JSON.parse(fs.readFileSync(path.join(bundleDir, "MANIFEST.json"), "utf8"));
const bundleFileset = JSON.parse(fs.readFileSync(path.join(bundleDir, "FILESET.json"), "utf8"));
const { handler, _private } = require(path.join(root, "functions/_food-api.js"));

const ROBOTS = "noindex, nofollow, noarchive, nosnippet";
const DEMO_ACCOUNT = "d4000000-0000-4000-8000-000000000001";
const DEMO_SLUG = "silverado-roti-shop-emmeloord";

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function headerRules(source) {
  return [...source.matchAll(/\[\[headers\]\]\s+for = "([^"]+)"\s+\[headers\.values\]([\s\S]*?)(?=\n\[\[|$)/g)]
    .map((match) => ({ pattern: match[1], body: match[2] }));
}

function matchingRule(route) {
  return headerRules(netlify).filter((rule) => {
    if (!rule.pattern.includes("*")) return route === rule.pattern;
    const prefix = rule.pattern.slice(0, rule.pattern.indexOf("*"));
    return route.startsWith(prefix);
  }).sort((left, right) => right.pattern.replace("*", "").length - left.pattern.replace("*", "").length)[0];
}

async function withEnv(values, action) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { return await action(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

function resetEvent(accountId = DEMO_ACCOUNT, slug = DEMO_SLUG) {
  return {
    httpMethod: "POST",
    path: `/api/food/v1/accounts/${accountId}/demo-reset`,
    headers: { "content-type": "application/json", "idempotency-key": "food-demo-reset:test-0001" },
    body: JSON.stringify({ storefront_slug: slug, confirmation: `HERSTEL ${slug}` }),
  };
}

test("Food storefront, dashboard and API routes resolve to complete robot-denial headers", () => {
  for (const route of [
    "/food/silverado-roti-shop-emmeloord", "/food.html", "/admin/food", "/admin/food/orders",
    "/admin-food.html", "/api/food/v1/storefronts/silverado-roti-shop-emmeloord",
    "/.netlify/functions/food-v1/accounts/demo",
  ]) {
    const rule = matchingRule(route);
    assert.ok(rule, route);
    assert.match(rule.body, new RegExp(`X-Robots-Tag = "${ROBOTS}"`), route);
  }
});

test("non-Food production routes receive no Food-specific robot rule", () => {
  for (const route of ["/", "/diensten", "/admin-sales.html", "/api/global-search"]) {
    const rule = matchingRule(route);
    assert.ok(!rule || !rule.pattern.includes("food"), route);
  }
});

test("both Food HTML entrypoints carry the complete robots meta policy", () => {
  for (const html of [storefront, dashboardHtml]) {
    assert.match(html, new RegExp(`<meta name="robots" content="${ROBOTS}"`));
  }
});

test("Food API responses carry the complete X-Robots-Tag policy", async () => {
  const result = await handler({ httpMethod: "GET", path: "/api/food/v1/not-found", headers: {} });
  assert.equal(result.headers["X-Robots-Tag"], ROBOTS);
});

test("demo reset defaults off and requires the exact food_demo environment", async () => {
  await withEnv({ APP_ENVIRONMENT: undefined, FOOD_DEMO_RESET_ENABLED: undefined, FOOD_DEMO_RESET_ALLOWLIST: undefined }, async () => {
    assert.equal(_private.demoResetEnabled(), false);
    const result = await handler(resetEvent());
    assert.equal(result.statusCode, 404);
    assert.equal(JSON.parse(result.body).code, "DEMO_RESET_UNAVAILABLE");
  });
  await withEnv({ APP_ENVIRONMENT: "staging", FOOD_DEMO_RESET_ENABLED: "true", FOOD_DEMO_RESET_ALLOWLIST: DEMO_ACCOUNT }, async () => {
    assert.equal(_private.demoResetEnabled(), false);
  });
});

test("enabled reset still fails without an authenticated session", async () => {
  await withEnv({ APP_ENVIRONMENT: "food_demo", FOOD_DEMO_RESET_ENABLED: "true", FOOD_DEMO_RESET_ALLOWLIST: DEMO_ACCOUNT }, async () => {
    const result = await handler(resetEvent());
    assert.equal(result.statusCode, 401);
    assert.equal(JSON.parse(result.body).code, "AUTH_REQUIRED");
  });
});

test("demo ordering override is fail-closed, environment-bound and allowlisted", async () => {
  await withEnv({ APP_ENVIRONMENT: undefined, FOOD_DEMO_ORDERING_OVERRIDE_ENABLED: undefined, FOOD_DEMO_RESET_ALLOWLIST: DEMO_ACCOUNT }, async () => {
    assert.equal(_private.demoOrderingOverrideAllowed(DEMO_ACCOUNT, DEMO_SLUG), false);
  });
  await withEnv({ APP_ENVIRONMENT: "staging", FOOD_DEMO_ORDERING_OVERRIDE_ENABLED: "true", FOOD_DEMO_RESET_ALLOWLIST: DEMO_ACCOUNT }, async () => {
    assert.equal(_private.demoOrderingOverrideAllowed(DEMO_ACCOUNT, DEMO_SLUG), false);
  });
  await withEnv({ APP_ENVIRONMENT: "food_demo", FOOD_DEMO_ORDERING_OVERRIDE_ENABLED: "true", FOOD_DEMO_RESET_ALLOWLIST: DEMO_ACCOUNT }, async () => {
    assert.equal(_private.demoOrderingOverrideAllowed(DEMO_ACCOUNT, DEMO_SLUG), true);
    assert.equal(_private.demoOrderingOverrideAllowed("d4000000-0000-4000-8000-000000000002", "synthetic-isolation-restaurant"), false);
  });
});

test("live demo UI labels ordering and dashboard orders explicitly as demo/test", () => {
  assert.match(apiSource, /demo_mode: demoOrderingOverride/);
  assert.match(apiSource, /demo_mode: demoResetEnabled\(\)/);
  assert.match(fs.readFileSync(path.join(root, "public/food/storefront.js"), "utf8"), /Demo bestellen actief/);
  assert.match(dashboardJs, /Demo\/test/);
  assert.match(dashboardJs, /Food beheer.*Demo|productSubtitle.*Demo/);
});

test("server allowlist rejects a different tenant before any database mutation", async () => {
  await withEnv({ APP_ENVIRONMENT: "food_demo", FOOD_DEMO_RESET_ENABLED: "true", FOOD_DEMO_RESET_ALLOWLIST: DEMO_ACCOUNT }, async () => {
    const result = await handler(resetEvent("d4000000-0000-4000-8000-000000000002", "synthetic-isolation-restaurant"));
    assert.equal(result.statusCode, 403);
    assert.equal(JSON.parse(result.body).code, "DEMO_TARGET_NOT_ALLOWED");
  });
});

test("browser reset requires an explicit typed confirmation and server-issued capability", () => {
  assert.match(dashboardHtml, /data-demo-reset-dialog/);
  assert.match(dashboardHtml, /data-demo-reset-confirm disabled/);
  assert.match(dashboardJs, /HERSTEL \$\{state\.scope\.storefront_slug\}/);
  assert.match(dashboardJs, /state\.scope\.permissions\.demo_reset/);
  assert.match(apiSource, /requireCapability\(context, accountId, location\.id, "demo\.reset"\)/);
  assert.match(apiSource, /APP_ENVIRONMENT === "food_demo"/);
  assert.doesNotMatch(dashboardJs, /APP_ENVIRONMENT|FOOD_DEMO_RESET_ENABLED|FOOD_DEMO_RESET_ALLOWLIST/);
});

test("database reset is service-only, locked, audited, rate-limited and tenant-bounded", () => {
  for (const marker of [
    "food_assert_demo_service_role", "pg_advisory_xact_lock", "food_demo_reset_audit",
    "food_demo_reset_rate_limits", "food_demo_menu_item_baselines", "P4290",
    "input_food_account_id", "input_storefront_slug", "input_actor_profile_id", "input_idempotency_key",
  ]) assert.match(resetMigration, new RegExp(marker));
  assert.match(resetMigration, /delete from public\.food_orders\s+where food_account_id = demo_target\.food_account_id/);
  assert.match(resetMigration, /membership\.role in \('owner','manager'\)/);
  assert.match(resetMigration, /actor_profile\.role in \('super_admin','admin'\)/);
  assert.match(resetMigration, /remote execution/i);
});

test("demo seed is synthetic, idempotent and contains the exact requested topology", () => {
  assert.match(seed, /on conflict/gi);
  assert.equal((seed.match(/'da000000-0000-4000-8000-0000000000(?:0[1-9]|10)'/g) || []).length, 10);
  assert.equal((seed.match(/'d9000000-0000-4000-8000-00000000000[1-3]'/g) || []).length >= 3, true);
  assert.match(seed, /Silverado Roti Shop/);
  assert.match(seed, /Synthetic Isolation Restaurant/);
  assert.match(seed, /'manager', 'active'/);
  assert.match(seed, /'admin', 'active'/);
  assert.doesNotMatch(seed, /@[A-Za-z0-9.-]+|password\s*=|SUPABASE_|MOLLIE_|api[_-]?key/i);
});

test("online-demo migration bundle is exactly ordered, checksummed and non-authorizing", () => {
  const expected = [
    "supabase/migrations/00000000000000_authoritative_baseline.sql",
    "supabase/migrations/20260726200000_partner_profile_role_status_foundation.sql",
    "supabase/migrations/20260728160000_food_v1_data_foundation.sql",
    "supabase/migrations/20260728161000_food_v1_tenant_security.sql",
    "supabase/migrations/20260728162000_food_v1_application_api_support.sql",
    "supabase/migrations/20260728163000_food_v1_storefront_confirmation.sql",
    "supabase/migrations/20260728210000_food_v1_online_demo_reset.sql",
  ];
  assert.deepEqual(bundleManifest.executionOrder, expected);
  assert.deepEqual(bundleFileset.files.map((entry) => entry.path), expected);
  assert.equal(bundleManifest.targetEnvironment, "food-demo");
  assert.equal(bundleManifest.productionAllowed, false);
  assert.equal(bundleManifest.stagingAllowed, false);
  assert.equal(bundleManifest.remoteExecutionAuthorizedByThisManifest, false);
  for (const entry of [...bundleFileset.files, ...bundleFileset.seedFiles]) {
    const file = path.join(root, entry.path);
    assert.equal(fs.statSync(file).size, entry.bytes, entry.path);
    assert.equal(sha256(file), entry.sha256, entry.path);
  }
});

test("local validator applies the allowlist only and proves seed idempotency twice", () => {
  const validator = fs.readFileSync(path.join(root, "scripts/food-v1-online-demo-local-validation.zsh"), "utf8");
  assert.match(validator, /for food_demo_seed_run in 1 2/);
  assert.match(validator, /listen_addresses=''/);
  assert.match(validator, /food-v1-online-demo-reset-functional\.sql/);
  for (const key of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_REF", "SUPABASE_DB_URL", "DATABASE_URL"]) assert.match(validator, new RegExp(key));
  assert.doesNotMatch(validator, /supabase\s+(?:link|db push|migration up)|netlify\s+deploy|git\s+push/i);
});
