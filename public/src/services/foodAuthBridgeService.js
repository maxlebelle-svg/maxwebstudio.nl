(function foodAuthBridgeModule(globalScope) {
  "use strict";

  const FOOD_ROLES = new Set(["owner", "manager", "staff", "kitchen_staff", "viewer", "platform_admin"]);
  const ORDER_DETAIL = /^\/admin\/food\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const FOOD_ROUTES = new Set([
    "/admin/food",
    "/admin/food/orders",
    "/admin/food/menu",
    "/admin/food/integrations",
  ]);

  function accessError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
  }

  function canonicalFoodPath(value = "", origin = globalScope.location?.origin || "https://maxwebstudio.invalid") {
    const raw = String(value || "").trim();
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return "";
    try {
      const parsed = new URL(raw, origin);
      if (parsed.origin !== origin || parsed.username || parsed.password || parsed.search || parsed.hash) return "";
      const pathname = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/$/, "") : parsed.pathname;
      return FOOD_ROUTES.has(pathname) || ORDER_DETAIL.test(pathname) ? pathname : "";
    } catch {
      return "";
    }
  }

  function routePermission(pathname = "") {
    if (/^\/admin\/food\/orders(?:\/|$)/.test(pathname)) return "orders_read";
    if (pathname === "/admin/food/menu") return "menu_read";
    return "food_read";
  }

  function scopeAllowsRoute(scope = {}, pathname = "") {
    if (!FOOD_ROLES.has(String(scope.role || ""))) return false;
    const permissions = scope.permissions || {};
    const required = routePermission(pathname);
    if (required === "orders_read") return permissions.orders_read === true;
    if (required === "menu_read") return permissions.menu_read === true;
    return permissions.orders_read === true || permissions.menu_read === true;
  }

  async function resolveFoodRouteAccess(options = {}) {
    const accessToken = String(options.accessToken || "").trim();
    const requestedPath = canonicalFoodPath(options.requestedPath, options.origin);
    const fetchImpl = options.fetchImpl || globalScope.fetch?.bind(globalScope);
    if (!requestedPath) throw accessError("FOOD_ROUTE_NOT_ALLOWED", 403, "Deze Food-route is niet toegestaan.");
    if (!accessToken) throw accessError("AUTH_REQUIRED", 401, "Inloggen is vereist.");
    if (typeof fetchImpl !== "function") throw accessError("FOOD_CONTEXT_UNAVAILABLE", 503, "De Food-context is niet beschikbaar.");

    const response = await fetchImpl("/api/food/v1/session/context", {
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) {
      throw accessError(payload.code || (response.status === 401 ? "AUTH_REQUIRED" : "FORBIDDEN"), response.status, payload.error || "Deze Food-route is niet toegestaan.");
    }
    const context = payload.data || {};
    const scopes = Array.isArray(context.scopes) ? context.scopes.filter((scope) => scopeAllowsRoute(scope, requestedPath)) : [];
    if (!scopes.length) throw accessError("FOOD_ROUTE_FORBIDDEN", 403, "Deze Food-route is niet toegestaan.");
    return { path: requestedPath, context: { ...context, scopes } };
  }

  const exported = { canonicalFoodPath, resolveFoodRouteAccess, routePermission, scopeAllowsRoute };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  globalScope.MaxFoodAuthBridge = exported;
})(typeof window !== "undefined" ? window : globalThis);
