const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/food.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/food/storefront.css"), "utf8");
const browserSource = fs.readFileSync(path.join(root, "public/food/storefront.js"), "utf8");
const apiSource = fs.readFileSync(path.join(root, "functions/_food-api.js"), "utf8");
const migrationPath = path.join(root, "supabase/migrations/20260728163000_food_v1_storefront_confirmation.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/food-v1-phase-2-storefront.json"), "utf8"));
const storefront = require(path.join(root, "public/food/storefront.js"));
const apiPrivate = require(path.join(root, "functions/_food-api.js"))._private;

const firstItem = fixture.menu.categories[0].items[0];
const secondItem = fixture.menu.categories[1].items[0];

function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function startDemo(orderingEnabled) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, "scripts/food-v1-phase-2-demo-server.mjs"), `--port=${port}`], {
    cwd: root,
    env: { ...process.env, FOOD_PUBLIC_ORDERING_ENABLED: orderingEnabled ? "true" : "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Demo server timeout: ${stderr}`)), 5000);
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Food v1 Phase 2 demo:")) { clearTimeout(timeout); resolve(); }
    });
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Demo server exited ${code}: ${stderr}`)); });
  });
  return { child, base: `http://127.0.0.1:${port}` };
}

async function stopDemo(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

async function apiRequest(base, route, options) {
  const response = await fetch(`${base}${route}`, options);
  return { response, body: await response.json() };
}

test("generic /food/:slug route resolves tenant content without Silverado-specific route code", () => {
  const netlify = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
  assert.match(netlify, /from = "\/food\/:storefrontSlug"[\s\S]*to = "\/food\.html\?storefront=:storefrontSlug"/);
  assert.equal(storefront.storefrontSlug({ pathname: "/food/silverado-roti-shop-emmeloord", search: "" }), fixture.storefront.slug);
  assert.equal(storefront.storefrontSlug({ pathname: "/food/Invalid!", search: "" }), "");
  assert.doesNotMatch(`${html}\n${browserSource}\n${css}`, /silverado/i);
});

test("known pilot fixture contains exactly three categories and at least ten publishable dishes", () => {
  assert.equal(fixture.storefront.name, "Silverado Roti Shop");
  assert.equal(fixture.menu.categories.length, 3);
  assert.equal(fixture.menu.categories.flatMap((category) => category.items).length, 10);
  assert.equal(fixture.menu.categories.every((category) => category.items.every((item) => item.available === true)), true);
});

test("unknown slug has a safe client state and local API 404 contract", () => {
  assert.match(browserSource, /Deze storefront bestaat niet of is niet gepubliceerd/);
  assert.doesNotMatch(browserSource, /food_account_id|location_id/);
});

test("public HTML and fixture expose no tenant, location, tax-class or provider identifiers", () => {
  assert.doesNotMatch(`${html}\n${JSON.stringify(fixture)}`, /food_account_id|location_id|tax_class_id|SUPABASE_|service_role/i);
  assert.doesNotMatch(html, /[0-9a-f]{8}-[0-9a-f-]{27,}/i);
});

test("public menu API still selects only published menus and active categories/items", () => {
  assert.match(apiSource, /status: "eq\.published"/);
  assert.match(apiSource, /menu_id: `eq\.\$\{menu\.id\}`, active: "eq\.true"/);
  assert.match(apiSource, /active: "eq\.true", available: "eq\.true"/);
});

test("tenant wordmark branding is safe, optional and independent from platform branding", () => {
  assert.equal(apiPrivate.safeBrandText("Silverado", 80), "Silverado");
  assert.equal(apiPrivate.safeBrandText("🇸🇷", 8), "🇸🇷");
  assert.equal(apiPrivate.safeBrandText("x\nscript", 80), null);
  assert.match(html, /data-brand-wordmark/);
  assert.match(browserSource, /profile\.branding\?\.logo_text/);
  assert.equal(fixture.storefront.branding.logo_text, "Silverado");
  assert.equal(fixture.storefront.branding.logo_suffix, "🇸🇷");
});

test("unavailable or unknown items cannot enter a restored or mutated cart", () => {
  const unavailable = { ...firstItem, available: false };
  assert.deepEqual(storefront.cartSnapshot({ [firstItem.item_ref]: 2 }, [unavailable]), {});
  assert.deepEqual(storefront.setCartQuantity({}, firstItem.item_ref, 1, new Set()), {});
});

test("cart quantities increase and decrease using immutable item references", () => {
  const available = new Set([firstItem.item_ref]);
  const one = storefront.setCartQuantity({}, firstItem.item_ref, 1, available);
  const two = storefront.setCartQuantity(one, firstItem.item_ref, 2, available);
  assert.deepEqual(two, { [firstItem.item_ref]: 2 });
  assert.equal(storefront.cartTotals(two, [firstItem]).subtotal_minor, firstItem.price_minor * 2);
});

test("quantity zero removes the cart line", () => {
  const available = new Set([firstItem.item_ref]);
  assert.deepEqual(storefront.setCartQuantity({ [firstItem.item_ref]: 1 }, firstItem.item_ref, 0, available), {});
});

test("extreme, negative and fractional cart quantities are rejected", () => {
  const available = new Set([firstItem.item_ref]);
  const original = { [firstItem.item_ref]: 2 };
  for (const quantity of [-1, 1.5, storefront.MAX_QUANTITY + 1]) {
    assert.deepEqual(storefront.setCartQuantity(original, firstItem.item_ref, quantity, available), original);
  }
});

test("checkout markup requires name and phone and constrains optional fields", () => {
  assert.match(html, /name="name"[^>]*maxlength="120"[^>]*required/);
  assert.match(html, /name="phone"[^>]*minlength="6"[^>]*maxlength="32"[^>]*required/);
  assert.match(html, /name="email"[^>]*type="email"/);
  assert.match(html, /name="note"[^>]*maxlength="1000"/);
});

test("pickup payload contains item references and customer fields but no client money or tenant", () => {
  const payload = storefront.buildOrderPayload({ [firstItem.item_ref]: 2 }, [firstItem], { name: "Pilot", phone: "0612345678", email: "pilot@example.test", note: "Test" });
  assert.equal(payload.fulfilment_type, "pickup");
  assert.deepEqual(payload.items, [{ item_ref: firstItem.item_ref, quantity: 2 }]);
  assert.doesNotMatch(JSON.stringify(payload), /price|total|tax|tenant|food_account|delivery/);
});

test("browser API client uses only the existing versioned Food routes", async () => {
  const calls = [];
  const client = storefront.createApiClient(async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  });
  await client.storefront("pilot"); await client.menu("pilot"); await client.createOrder("pilot", {}, "safe-key-00000001"); await client.confirmation("pilot", "a".repeat(32));
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/food/v1/storefronts/pilot",
    "/api/food/v1/storefronts/pilot/menu",
    "/api/food/v1/storefronts/pilot/orders",
    `/api/food/v1/storefronts/pilot/orders/${"a".repeat(32)}/confirmation`,
  ]);
});

test("manipulated local totals cannot affect the server payload or confirmation", () => {
  const payload = storefront.buildOrderPayload({ [firstItem.item_ref]: 1 }, [firstItem], { name: "Pilot", phone: "0612345678", total_minor: 1 });
  assert.equal(payload.total_minor, undefined);
  assert.equal(payload.items[0].price_minor, undefined);
});

test("double-click protection and retry preserve one pending idempotency attempt", () => {
  assert.match(browserSource, /if \(state\.submitting \|\| !state\.profile\?\.ordering\?\.enabled\) return/);
  assert.match(browserSource, /state\.pendingAttempt\.fingerprint !== fingerprint/);
  assert.match(browserSource, /api\.createOrder\(slug, state\.pendingAttempt\.payload, state\.pendingAttempt\.key\)/g);
  assert.equal(storefront.payloadFingerprint({ a: 1 }), storefront.payloadFingerprint({ a: 1 }));
});

test("strong idempotency keys use Web Crypto and have sufficient entropy", () => {
  const first = storefront.createIdempotencyKey(crypto.webcrypto);
  const second = storefront.createIdempotencyKey(crypto.webcrypto);
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
});

test("confirmation migration returns immutable item snapshots and server totals", () => {
  assert.match(migration, /jsonb_agg\(jsonb_build_object\(/);
  for (const field of ["item_name_snapshot", "quantity", "unit_price_minor", "line_total_minor"]) assert.match(migration, new RegExp(field));
  assert.match(browserSource, /confirmation\.total_minor/);
  assert.doesNotMatch(migration, /customer_snapshot|customer_note/);
});

test("confirmation remains slug-bound, reference-bound and exposes no order-list path", () => {
  assert.match(migration, /location\.slug = input_location_slug[\s\S]*food_order\.public_reference = input_public_reference/);
  assert.match(migration, /input_public_reference !~ '\^\[a-f0-9\]\{32\}\$'/);
  assert.doesNotMatch(browserSource, /listOrders|orderList|ordersList/);
});

test("delivery is neither selectable nor sent by the storefront", () => {
  assert.doesNotMatch(html, /<option[^>]*delivery|value="delivery"|name="delivery/i);
  assert.match(browserSource, /fulfilment_type: "pickup"/);
  assert.doesNotMatch(browserSource, /delivery_address|delivery_minor/);
});

test("server feature flag controls ordering and the disabled state remains professional", () => {
  assert.match(apiSource, /FOOD_PUBLIC_ORDERING_ENABLED/);
  assert.match(browserSource, /Online bestellen staat voor deze pilot nog uit/);
  assert.match(browserSource, /nodes\.checkoutOpen\.disabled = !enabled/);
});

test("browser state and diagnostics never persist or log full customer PII", () => {
  assert.match(browserSource, /sessionStorage\.setItem\(storageKey\(\), JSON\.stringify\(state\.cart\)\)/);
  assert.doesNotMatch(browserSource, /localStorage|console\.(?:log|warn|error)|sessionStorage\.setItem\([^\n]*(?:customer|phone|email|payload)/i);
});

test("mobile storefront has 44px controls, sticky cart and narrow viewport layout", () => {
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /\.sticky-cart[\s\S]*position: fixed/);
  assert.match(css, /\.icon-button[\s\S]*width: 44px;[\s\S]*height: 44px/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(html, /data-sticky-cart[^>]*data-cart-open/);
});

test("keyboard and base accessibility contracts are present", () => {
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<dialog[^>]*aria-labelledby="cart-title"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(browserSource, /event\.key === "Escape"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test("opening schedule is sanitized and closed ordering is rejected server-side", () => {
  const config = apiPrivate.publicConfiguration({ public: { opening_hours: { monday: [{ open: "15:00", close: "19:00" }], tuesday: [{ open: "javascript:", close: "19:00" }] } } });
  assert.deepEqual(config.opening_hours.monday, [{ open: "15:00", close: "19:00" }]);
  assert.deepEqual(config.opening_hours.tuesday, []);
  assert.equal(apiPrivate.openingState(config, "Europe/Amsterdam", new Date("2026-07-27T14:00:00Z")).status, "open");
  assert.match(apiSource, /opening\.status === "closed"[\s\S]*STOREFRONT_CLOSED/);
});

test("Phase 2 release unit checksums only the forward-only confirmation migration", () => {
  const directory = path.join(root, "docs/release-readiness/food-v1-phase-2-product-migrations");
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "MANIFEST.json"), "utf8"));
  const fileset = JSON.parse(fs.readFileSync(path.join(directory, "FILESET.json"), "utf8"));
  assert.equal(manifest.remoteExecutionAuthorizedByThisManifest, false);
  assert.deepEqual(manifest.executionOrder, ["supabase/migrations/20260728163000_food_v1_storefront_confirmation.sql"]);
  assert.equal(fileset.files[0].bytes, fs.statSync(migrationPath).size);
  assert.equal(fileset.files[0].sha256, sha256(migrationPath));
  assert.doesNotMatch(migration, /\bdelete\s+from|truncate|drop\s+table/i);
});

test("local demo proves menu → two dishes → server order → idempotent retry → isolated confirmation", async () => {
  const { child, base } = await startDemo(true);
  try {
    const slug = fixture.storefront.slug;
    const profileResult = await apiRequest(base, `/api/food/v1/storefronts/${slug}`);
    const menuResult = await apiRequest(base, `/api/food/v1/storefronts/${slug}/menu`);
    assert.equal(profileResult.response.status, 200);
    assert.equal(profileResult.body.data.ordering.enabled, true);
    assert.equal(menuResult.body.data.categories.length, 3);

    const payload = { fulfilment_type: "pickup", customer: { name: "Lokale E2E", phone: "0612345678" }, pickup: {}, items: [{ item_ref: firstItem.item_ref, quantity: 2 }, { item_ref: secondItem.item_ref, quantity: 1 }] };
    const options = { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "phase-2-e2e-attempt-0001" }, body: JSON.stringify(payload) };
    const created = await apiRequest(base, `/api/food/v1/storefronts/${slug}/orders`, options);
    const replay = await apiRequest(base, `/api/food/v1/storefronts/${slug}/orders`, options);
    assert.equal(created.response.status, 201);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.data.public_reference, created.body.data.public_reference);
    assert.equal(replay.body.data.idempotent_replay, true);

    const confirmed = await apiRequest(base, `/api/food/v1/storefronts/${slug}/orders/${created.body.data.public_reference}/confirmation`);
    assert.equal(confirmed.response.status, 200);
    assert.equal(confirmed.body.data.items.length, 2);
    assert.equal(confirmed.body.data.total_minor, firstItem.price_minor * 2 + secondItem.price_minor);
    assert.doesNotMatch(JSON.stringify(confirmed.body.data), /customer|phone|food_account|location_id/);

    const other = await apiRequest(base, `/api/food/v1/storefronts/${slug}/orders/${"0".repeat(32)}/confirmation`);
    const otherTenant = await apiRequest(base, `/api/food/v1/storefronts/another-restaurant/orders/${created.body.data.public_reference}/confirmation`);
    assert.equal(other.response.status, 404);
    assert.equal(otherTenant.response.status, 404);
  } finally { await stopDemo(child); }
});

test("local demo with server feature flag off permits menu viewing but rejects ordering", async () => {
  const { child, base } = await startDemo(false);
  try {
    const slug = fixture.storefront.slug;
    const profile = await apiRequest(base, `/api/food/v1/storefronts/${slug}`);
    assert.equal(profile.body.data.ordering.enabled, false);
    assert.equal(profile.body.data.ordering.reason, "pilot_disabled");
    const order = await apiRequest(base, `/api/food/v1/storefronts/${slug}/orders`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "phase-2-disabled-0001" }, body: "{}" });
    assert.equal(order.response.status, 503);
    assert.equal(order.body.code, "ORDERING_UNAVAILABLE");
  } finally { await stopDemo(child); }
});
