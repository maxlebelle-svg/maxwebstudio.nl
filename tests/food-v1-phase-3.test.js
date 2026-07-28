const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/admin-food.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/admin/food/dashboard.css"), "utf8");
const source = fs.readFileSync(path.join(root, "public/admin/food/dashboard.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "public/admin/food/dashboard-bootstrap.js"), "utf8");
const apiSource = fs.readFileSync(path.join(root, "functions/_food-api.js"), "utf8");
const netlify = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
const storefrontFixture = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/food-v1-phase-2-storefront.json"), "utf8"));
const dashboardFixture = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/food-v1-phase-3-dashboard.json"), "utf8"));
const dashboard = require(path.join(root, "public/admin/food/dashboard.js"));
const pilot = dashboardFixture.pilot;
const firstItem = storefrontFixture.menu.categories[0].items[0];
const secondItem = storefrontFixture.menu.categories[1].items[0];

async function freePort() {
  return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close((error) => error ? reject(error) : resolve(port)); }); });
}
async function startDemo() {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, "scripts/food-v1-phase-3-demo-server.mjs"), `--port=${port}`], { cwd: root, env: { ...process.env, FOOD_PUBLIC_ORDERING_ENABLED: "true" }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => { let stderr = ""; const timeout = setTimeout(() => reject(new Error(`Phase 3 server timeout: ${stderr}`)), 5000); child.stderr.on("data", (chunk) => { stderr += chunk; }); child.stdout.on("data", (chunk) => { if (String(chunk).includes("Food v1 Phase 3 dashboard:")) { clearTimeout(timeout); resolve(); } }); child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Phase 3 server exited ${code}: ${stderr}`)); }); });
  return { child, base: `http://127.0.0.1:${port}` };
}
async function stopDemo(child) { if (child.exitCode !== null) return; child.kill("SIGTERM"); await new Promise((resolve) => child.once("exit", resolve)); }
async function request(base, route, options = {}) { const response = await fetch(`${base}${route}`, options); return { response, body: await response.json() }; }
function auth(token, options = {}) { return { ...options, headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } }; }
async function createPilotOrder(base, key = "phase-3-order-attempt-0001") {
  const payload = { fulfilment_type: "pickup", customer: { name: "Lokale dashboardtest", phone: "0612345678" }, pickup: {}, items: [{ item_ref: firstItem.item_ref, quantity: 1 }, { item_ref: secondItem.item_ref, quantity: 1 }], note: "Graag apart verpakken" };
  return request(base, `/api/food/v1/storefronts/${pilot.storefront_slug}/orders`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload) });
}

test("Food-dashboard uses generic clean routes and no Silverado component names", () => {
  assert.match(netlify, /from = "\/admin\/food\/orders\/:orderId"[\s\S]*to = "\/admin-food\.html"/);
  assert.match(netlify, /from = "\/admin\/food\/\*"[\s\S]*to = "\/admin-food\.html"/);
  assert.doesNotMatch(`${html}\n${source}\n${css}`, /silverado/i);
});

test("production bootstrap restores the central Supabase session without a local auth bypass", () => {
  assert.match(bootstrap, /getSession, onAuthStateChange, signOut/);
  assert.match(bootstrap, /session\.access_token/);
  assert.doesNotMatch(bootstrap, /demo-manager-token|localStorage\.setItem|food_account_id/);
});

test("unauthenticated dashboard requests fail closed", async () => {
  const { child, base } = await startDemo();
  try { const result = await request(base, "/api/food/v1/session/context"); assert.equal(result.response.status, 401); assert.equal(result.body.code, "AUTH_REQUIRED"); }
  finally { await stopDemo(child); }
});

test("ordinary customer without Food membership gets no dashboard context", async () => {
  const { child, base } = await startDemo();
  try { const result = await request(base, "/api/food/v1/session/context", auth("demo-customer-token")); assert.equal(result.response.status, 403); assert.equal(result.body.code, "FORBIDDEN"); }
  finally { await stopDemo(child); }
});

test("restaurant context is derived server-side from membership and capability", () => {
  assert.match(apiSource, /async function sessionContext\(event\)/);
  assert.match(apiSource, /profile_id: `eq\.\$\{profile\.id\}`/);
  assert.match(apiSource, /food_has_capability[\s\S]*orders\.management[\s\S]*menu\.management/);
  assert.match(apiSource, /if \(!permissions\.orders_read && !permissions\.menu_read\) return null/);
  assert.doesNotMatch(netlify, /account_id=|location_id=/);
});

test("restaurant member sees only the own server-derived scope", async () => {
  const { child, base } = await startDemo();
  try { const result = await request(base, "/api/food/v1/session/context", auth("demo-manager-token")); assert.equal(result.response.status, 200); assert.equal(result.body.data.scopes.length, 1); assert.equal(result.body.data.scopes[0].location_name, pilot.location_name); }
  finally { await stopDemo(child); }
});

test("tenant A cannot open tenant B account routes", async () => {
  const { child, base } = await startDemo();
  try { const route = `/api/food/v1/accounts/${dashboardFixture.isolation_tenant.account_ref}/orders?location_id=${dashboardFixture.isolation_tenant.location_ref}`; const result = await request(base, route, auth("demo-manager-token")); assert.equal(result.response.status, 404); }
  finally { await stopDemo(child); }
});

test("tenant B cannot open tenant A orders", async () => {
  const { child, base } = await startDemo();
  try { const created = await createPilotOrder(base, "phase-3-isolation-order-01"); const route = `/api/food/v1/accounts/${pilot.account_ref}/orders/${created.body.data.public_reference}`; const result = await request(base, route, auth("demo-tenant-b-token")); assert.equal(result.response.status, 404); }
  finally { await stopDemo(child); }
});

test("dashboard order list and detail use only secured Food API routes", () => {
  assert.match(source, /\/accounts\/\$\{encodeURIComponent\(scope\.account_ref\)\}\/orders\?/);
  assert.match(source, /\/accounts\/\$\{encodeURIComponent\(scope\.account_ref\)\}\/orders\/\$\{encodeURIComponent\(orderId\)\}/);
  assert.doesNotMatch(source, /supabase\.from|rest\/v1\/food_orders/);
});

test("only valid next pickup transitions are offered", () => {
  assert.equal(dashboard.nextStatus("pending", "manager"), "accepted"); assert.equal(dashboard.nextStatus("accepted", "manager"), "preparing"); assert.equal(dashboard.nextStatus("preparing", "manager"), "ready"); assert.equal(dashboard.nextStatus("ready", "manager"), "completed"); assert.equal(dashboard.nextStatus("completed", "manager"), null);
});

test("invalid status transition is rejected by the server", async () => {
  const { child, base } = await startDemo();
  try { await createPilotOrder(base, "phase-3-invalid-transition-01"); const list = await request(base, `/api/food/v1/accounts/${pilot.account_ref}/orders?location_id=${pilot.location_ref}`, auth("demo-manager-token")); const orderId = list.body.data.orders[0].id; const result = await request(base, `/api/food/v1/accounts/${pilot.account_ref}/orders/${orderId}/status`, auth("demo-manager-token", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ready" }) })); assert.equal(result.response.status, 409); assert.equal(result.body.code, "INVALID_TRANSITION"); }
  finally { await stopDemo(child); }
});

test("double status clicks are guarded while server state remains authoritative", () => {
  assert.match(source, /if \(state\.mutation\) return; setBusy\(true\)/);
  assert.match(source, /await api\.transition[\s\S]*await api\.order/);
});

test("kitchen role only receives accepted-to-preparing and preparing-to-ready actions", () => {
  assert.equal(dashboard.nextStatus("pending", "kitchen_staff"), null); assert.equal(dashboard.nextStatus("accepted", "kitchen_staff"), "preparing"); assert.equal(dashboard.nextStatus("preparing", "kitchen_staff"), "ready"); assert.equal(dashboard.nextStatus("ready", "kitchen_staff"), null);
});

test("viewer receives no mutation actions", () => {
  for (const status of ["pending", "accepted", "preparing", "ready"]) assert.equal(dashboard.nextStatus(status, "viewer"), null);
  assert.match(source, /state\.scope\.permissions\.menu_update/);
});

test("manager and owner roles are the only restaurant menu mutators", () => {
  assert.match(apiSource, /const MANAGER_ROLES = new Set\(\["owner", "manager"\]\)/);
  assert.match(apiSource, /membershipFor\(context, item\.location_id, MANAGER_ROLES\)/);
});

test("euro input converts exactly to integer minor units", () => {
  assert.equal(dashboard.parseEuroMinor("12"), 1200); assert.equal(dashboard.parseEuroMinor("12,5"), 1250); assert.equal(dashboard.parseEuroMinor("12.50"), 1250); assert.equal(dashboard.parseEuroMinor("0,01"), 1);
});

test("ambiguous locale and fractional-cent formats are rejected", () => {
  for (const value of ["1.234,56", "1,234.56", "12,345", "12.345", "€ 12,50", "12 50"]) assert.equal(dashboard.parseEuroMinor(value), null);
});

test("negative prices are rejected", () => { assert.equal(dashboard.parseEuroMinor("-1"), null); assert.equal(dashboard.parseEuroMinor("-0,01"), null); });

test("extreme prices are rejected", () => { assert.equal(dashboard.parseEuroMinor("1000000,01"), null); assert.equal(dashboard.parseEuroMinor("999999999999"), null); });

test("authorized availability mutation controls the public menu", async () => {
  const { child, base } = await startDemo();
  try {
    const route = `/api/food/v1/accounts/${pilot.account_ref}/menu/items/${firstItem.item_ref}`;
    const changed = await request(base, route, auth("demo-manager-token", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ available: false }) })); assert.equal(changed.body.data.available, false);
    const publicMenu = await request(base, `/api/food/v1/storefronts/${pilot.storefront_slug}/menu`); assert.equal(publicMenu.body.data.categories.flatMap((category) => category.items).some((item) => item.item_ref === firstItem.item_ref), false);
  } finally { await stopDemo(child); }
});

test("tenant B cannot mutate a tenant A menu item", async () => {
  const { child, base } = await startDemo();
  try { const route = `/api/food/v1/accounts/${pilot.account_ref}/menu/items/${firstItem.item_ref}`; const result = await request(base, route, auth("demo-tenant-b-token", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ price_minor: 1 }) })); assert.equal(result.response.status, 404); }
  finally { await stopDemo(child); }
});

test("price mutation becomes visible through the public storefront API", async () => {
  const { child, base } = await startDemo();
  try { const route = `/api/food/v1/accounts/${pilot.account_ref}/menu/items/${firstItem.item_ref}`; const changed = await request(base, route, auth("demo-manager-token", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ price_minor: 1375 }) })); assert.equal(changed.body.data.price_minor, 1375); const publicMenu = await request(base, `/api/food/v1/storefronts/${pilot.storefront_slug}/menu`); assert.equal(publicMenu.body.data.categories.flatMap((category) => category.items).find((item) => item.item_ref === firstItem.item_ref).price_minor, 1375); }
  finally { await stopDemo(child); }
});

test("historical order snapshot never changes after menu price mutation", async () => {
  const { child, base } = await startDemo();
  try { await createPilotOrder(base, "phase-3-snapshot-order-01"); const list = await request(base, `/api/food/v1/accounts/${pilot.account_ref}/orders?location_id=${pilot.location_ref}`, auth("demo-manager-token")); const orderId = list.body.data.orders[0].id; const before = await request(base, `/api/food/v1/accounts/${pilot.account_ref}/orders/${orderId}`, auth("demo-manager-token")); await request(base, `/api/food/v1/accounts/${pilot.account_ref}/menu/items/${firstItem.item_ref}`, auth("demo-manager-token", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ price_minor: firstItem.price_minor + 500 }) })); const after = await request(base, `/api/food/v1/accounts/${pilot.account_ref}/orders/${orderId}`, auth("demo-manager-token")); assert.equal(after.body.data.items[0].unit_price_minor, before.body.data.items[0].unit_price_minor); assert.equal(after.body.data.total_minor, before.body.data.total_minor); }
  finally { await stopDemo(child); }
});

test("UI does not render tenant ids, membership ids, secrets or idempotency hashes", () => {
  assert.doesNotMatch(html, /food_account_id|location_id|service_role|idempotency|SUPABASE_/i);
  assert.doesNotMatch(`${html}\n${css}`, /[0-9a-f]{8}-[0-9a-f-]{27,}/i);
});

test("session restoration, refresh and logout remain centralized", () => {
  assert.match(bootstrap, /await getSession\(\)/); assert.match(bootstrap, /onAuthStateChange/); assert.match(bootstrap, /await signOut\(\)/); assert.match(bootstrap, /app\.handleLogout/);
});

test("polling stops on logout, route leave and hidden tabs", () => {
  assert.equal(dashboard.POLL_INTERVAL_MS, 5000); assert.match(source, /function stop\(\)[\s\S]*clearInterval/); assert.match(source, /pagehide/); assert.match(source, /visibilitychange[\s\S]*document\.hidden/);
});

test("order detail exposes safe snapshots and status history but no actor profile ids", () => {
  assert.match(apiSource, /food_order_status_history/); assert.match(apiSource, /old_status,new_status,actor_type,reason,created_at/); assert.doesNotMatch(apiSource, /select: "[^"]*actor_profile_id/);
});

test("dashboard provides explicit loading, error, empty and retry states", () => {
  for (const marker of ["data-loading", "data-error", "data-retry", "data-recent-empty", "data-orders-empty", "data-menu-empty"]) assert.match(html, new RegExp(marker));
  assert.match(html, /role="alert"/); assert.match(html, /aria-live="polite"/);
});

test("laptop and tablet layouts remain bounded and keyboard accessible", () => {
  assert.match(css, /grid-template-columns:270px minmax\(0,1fr\)/); assert.match(css, /@media\(max-width:820px\)/); assert.match(css, /overflow-x:auto/); assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion/); assert.match(html, /class="food-skip"/);
});

test("complete local Phase 3 flow links storefront order, dashboard statuses and menu refresh", async () => {
  const { child, base } = await startDemo();
  try {
    const created = await createPilotOrder(base, "phase-3-complete-flow-01"); assert.equal(created.response.status, 201);
    const listRoute = `/api/food/v1/accounts/${pilot.account_ref}/orders?location_id=${pilot.location_ref}`; const list = await request(base, listRoute, auth("demo-manager-token")); assert.equal(list.body.data.orders.length, 1); const orderId = list.body.data.orders[0].id;
    for (const [token, status] of [["demo-manager-token", "accepted"], ["demo-kitchen-token", "preparing"], ["demo-kitchen-token", "ready"]]) { const transitioned = await request(base, `/api/food/v1/accounts/${pilot.account_ref}/orders/${orderId}/status`, auth(token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })); assert.equal(transitioned.body.data.status, status); }
    const detailBefore = await request(base, `/api/food/v1/accounts/${pilot.account_ref}/orders/${orderId}`, auth("demo-manager-token")); assert.equal(detailBefore.body.data.status_history.length, 4); const oldPrice = detailBefore.body.data.items[0].unit_price_minor;
    const newPrice = oldPrice + 125; await request(base, `/api/food/v1/accounts/${pilot.account_ref}/menu/items/${firstItem.item_ref}`, auth("demo-manager-token", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ price_minor: newPrice }) }));
    const refreshedMenu = await request(base, `/api/food/v1/storefronts/${pilot.storefront_slug}/menu`); assert.equal(refreshedMenu.body.data.categories.flatMap((category) => category.items).find((item) => item.item_ref === firstItem.item_ref).price_minor, newPrice);
    const detailAfter = await request(base, `/api/food/v1/accounts/${pilot.account_ref}/orders/${orderId}`, auth("demo-manager-token")); assert.equal(detailAfter.body.data.items[0].unit_price_minor, oldPrice);
    const isolated = await request(base, `/api/food/v1/accounts/${pilot.account_ref}/orders/${orderId}`, auth("demo-tenant-b-token")); assert.equal(isolated.response.status, 404);
  } finally { await stopDemo(child); }
});
