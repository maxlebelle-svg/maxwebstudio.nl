const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bridge = require(path.join(root, "public/src/services/foodAuthBridgeService.js"));
const login = fs.readFileSync(path.join(root, "public/login.html"), "utf8");
const adminBridge = fs.readFileSync(path.join(root, "public/src/services/adminAuthBridgeService.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "public/admin/food/dashboard-bootstrap.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "public/admin/food/dashboard.js"), "utf8");

const origin = "https://demo.maxwebstudio.test";
const managerScope = {
  account_ref: "a0000000-0000-4000-8000-000000000001",
  location_ref: "b0000000-0000-4000-8000-000000000001",
  role: "manager",
  permissions: { orders_read: true, orders_update: true, menu_read: true, menu_update: true },
};

function contextFetch(scopes, options = {}) {
  return async (url, request) => {
    assert.equal(url, "/api/food/v1/session/context");
    assert.equal(request.cache, "no-store");
    assert.equal(request.headers.Authorization, "Bearer test-access-token");
    return {
      ok: options.ok !== false,
      status: options.status || 200,
      json: async () => options.payload || { success: true, data: { platform_role: "customer", scopes } },
    };
  };
}

test("Food redirect allowlist is local, exact and tenant-id free", () => {
  for (const route of [
    "/admin/food",
    "/admin/food/",
    "/admin/food/orders",
    "/admin/food/menu",
    "/admin/food/integrations",
    "/admin/food/orders/123e4567-e89b-12d3-a456-426614174000",
  ]) assert.ok(bridge.canonicalFoodPath(route, origin));

  for (const unsafe of [
    "https://evil.test/admin/food",
    "//demo.maxwebstudio.test/admin/food",
    "javascript:alert(1)",
    "data:text/html,x",
    "/admin/dashboard",
    "/admin/food/settings",
    "/admin/food?account_id=attacker",
    "/admin/food/menu#location-id",
    "/admin/food\\orders",
    "/admin/food/orders/not-a-uuid",
  ]) assert.equal(bridge.canonicalFoodPath(unsafe, origin), "", unsafe);
});

test("Food manager route is granted only after server context validation", async () => {
  const access = await bridge.resolveFoodRouteAccess({
    accessToken: "test-access-token",
    requestedPath: "/admin/food/menu",
    origin,
    fetchImpl: contextFetch([managerScope]),
  });
  assert.equal(access.path, "/admin/food/menu");
  assert.deepEqual(access.context.scopes, [managerScope]);
});

test("missing membership and insufficient route capability fail closed", async () => {
  await assert.rejects(() => bridge.resolveFoodRouteAccess({
    accessToken: "test-access-token",
    requestedPath: "/admin/food",
    origin,
    fetchImpl: contextFetch([], { ok: false, status: 403, payload: { success: false, code: "FORBIDDEN" } }),
  }), { code: "FORBIDDEN", status: 403 });

  await assert.rejects(() => bridge.resolveFoodRouteAccess({
    accessToken: "test-access-token",
    requestedPath: "/admin/food/orders",
    origin,
    fetchImpl: contextFetch([{ ...managerScope, role: "viewer", permissions: { menu_read: true, orders_read: false } }]),
  }), { code: "FOOD_ROUTE_FORBIDDEN", status: 403 });
});

test("server-derived tenant scopes remain isolated and platform admin may receive both", async () => {
  const isolation = { ...managerScope, account_ref: "a0000000-0000-4000-8000-000000000002", location_ref: "b0000000-0000-4000-8000-000000000002" };
  const tenantAccess = await bridge.resolveFoodRouteAccess({ accessToken: "test-access-token", requestedPath: "/admin/food", origin, fetchImpl: contextFetch([isolation]) });
  assert.deepEqual(tenantAccess.context.scopes.map((scope) => scope.account_ref), [isolation.account_ref]);
  const adminAccess = await bridge.resolveFoodRouteAccess({ accessToken: "test-access-token", requestedPath: "/admin/food", origin, fetchImpl: contextFetch([{ ...managerScope, role: "platform_admin" }, { ...isolation, role: "platform_admin" }]) });
  assert.equal(adminAccess.context.scopes.length, 2);
});

test("viewer and kitchen scopes keep their server-declared read boundary", () => {
  assert.equal(bridge.scopeAllowsRoute({ role: "viewer", permissions: { menu_read: true } }, "/admin/food/menu"), true);
  assert.equal(bridge.scopeAllowsRoute({ role: "viewer", permissions: { menu_read: true, orders_read: false } }, "/admin/food/orders"), false);
  assert.equal(bridge.scopeAllowsRoute({ role: "kitchen_staff", permissions: { orders_read: true, menu_read: false } }, "/admin/food/orders"), true);
  assert.equal(bridge.scopeAllowsRoute({ role: "customer", permissions: { orders_read: true, menu_read: true } }, "/admin/food"), false);
});

test("login adds a Food-only gate without widening platform admin roles", () => {
  assert.match(login, /const adminRoles = new Set\(\["developer", "super_admin", "admin", "sales_manager", "sales_partner", "designer", "support"\]\)/);
  assert.doesNotMatch(login, /const adminRoles = new Set\([^\n]*(?:"manager"|"staff"|"kitchen_staff"|"viewer")/);
  assert.match(login, /foodLoginRequest = isFoodAdminPath\(requestedRedirect\)/);
  assert.match(login, /resolveFoodRouteAccess\([\s\S]*accessToken: session\.access_token[\s\S]*requestedPath: requestedRedirect/);
  assert.match(login, /adminAuthBridge\.clearAdminAuthBridge\(\)/);
  assert.match(login, /await auth\.signOut\(\)\.catch/);
  assert.doesNotMatch(login, /[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  assert.doesNotMatch(login, /demo\.maxwebstudio\.nl/i);
  assert.match(adminBridge, /!ADMIN_ROLES\.has\(role\)/);
});

test("dashboard refresh and polling revalidate the server-side Food context", () => {
  assert.match(bootstrap, /resolveFoodRouteAccess\([\s\S]*requestedPath: window\.location\.pathname/);
  assert.match(bootstrap, /await app\.start\(access\.context\)/);
  assert.match(dashboard, /async function revalidateAccess\(\)[\s\S]*await api\.context\(\)/);
  assert.match(dashboard, /if \(!scope\)[\s\S]*error\.code = "FORBIDDEN"/);
  assert.match(dashboard, /revalidateAccess\(\)\.catch\(\(error\) => \{ stop\(\); showError\(error\); \}\)/);
  assert.match(dashboard, /function handleLogout[\s\S]*stop\(\)/);
});
