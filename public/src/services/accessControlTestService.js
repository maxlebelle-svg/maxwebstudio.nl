import { ACCESS_CONTROL_MODES, listProtectedRoutes } from "../config/protectedRoutes.js";
import { ROLES } from "../config/roles.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { getAccessContext, getAccessControlSettings, getAccessDecision, getRouteAccessReadiness, requireCustomerAccess } from "./routeGuardService.js";

function nowIso() {
  return new Date().toISOString();
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function testProtectedRoutesRegistry() {
  const routes = listProtectedRoutes();
  return {
    ok: routes.every((route) => route.pageName && route.path && Array.isArray(route.requiredRoles) && Array.isArray(route.requiredPermissions)),
    count: routes.length,
    hardReady: routes.filter((route) => route.hardReady).map((route) => route.pageName),
    softOnly: routes.filter((route) => !route.hardReady).map((route) => route.pageName),
    routes,
  };
}

export function testRoleAccess(role = ROLES.DEMO_USER) {
  const baseContext = getAccessContext({ mode: ACCESS_CONTROL_MODES.PREVIEW });
  const context = {
    ...baseContext,
    role,
    mode: ACCESS_CONTROL_MODES.PREVIEW,
  };
  return listProtectedRoutes().map((route) => getAccessDecision(route.pageName, context));
}

export function testCustomerAccessScenario() {
  const context = getAccessContext({ mode: ACCESS_CONTROL_MODES.SOFT, allowDemo: true });
  const ownCustomerId = context.customerId || "demo-customer";
  const allowed = requireCustomerAccess(ownCustomerId, { mode: ACCESS_CONTROL_MODES.PREVIEW, pageName: "klantportaal", allowDemo: true });
  const mismatch = requireCustomerAccess("other-customer", { mode: ACCESS_CONTROL_MODES.PREVIEW, pageName: "klantportaal", allowDemo: false });
  return {
    ownCustomerId,
    role: context.role,
    allowed,
    mismatch,
  };
}

export function getAccessControlReadinessSummary() {
  const settings = getAccessControlSettings();
  const routeReadiness = getRouteAccessReadiness();
  const registry = testProtectedRoutesRegistry();
  return {
    accessMode: settings.mode,
    currentContext: getAccessContext(),
    permissionsStatus: "role-based permissions actief",
    routeGuardStatus: routeReadiness.status,
    customerAccessStatus: "soft actief / hard voorbereid",
    protectedRoutes: registry.routes.map((route) => ({
      pageName: route.pageName,
      path: route.path,
      hardReady: route.hardReady,
      public: Boolean(route.public),
    })),
    latestDecisions: routeReadiness.latestDecisions,
    hardReadyRoutes: routeReadiness.hardReadyRoutes,
    softOnlyRoutes: routeReadiness.softOnlyRoutes,
  };
}

export function runAccessControlSelfTest() {
  const result = {
    testedAt: nowIso(),
    settings: getAccessControlSettings(),
    registry: testProtectedRoutesRegistry(),
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.SALES, ROLES.SUPPORT, ROLES.CUSTOMER, ROLES.DEMO_USER].map((role) => ({
      role,
      decisions: testRoleAccess(role),
    })),
    customerAccess: testCustomerAccessScenario(),
    readiness: getAccessControlReadinessSummary(),
  };
  writeJson(STORAGE_KEYS.lastAccessControlTest, result);
  return result;
}

export const accessControlTestService = {
  runAccessControlSelfTest,
  testRoleAccess,
  testCustomerAccessScenario,
  testProtectedRoutesRegistry,
  getAccessControlReadinessSummary,
};

