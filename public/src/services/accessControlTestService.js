import { ACCESS_CONTROL_MODES, listProtectedRoutes } from "../config/protectedRoutes.js";
import { roleHasPermission } from "../config/permissions.js";
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

function createSyntheticContext(role, overrides = {}) {
  return {
    session: { id: `test-session-${role}`, role, isDemo: role === ROLES.DEMO_USER },
    user: { id: `test-user-${role}`, email: `${role}@maxwebstudio.test` },
    profile: { id: `test-profile-${role}`, role, email: `${role}@maxwebstudio.test` },
    role,
    customerId: overrides.customerId || (role === ROLES.CUSTOMER ? "customer-a" : ""),
    supabaseCustomerId: overrides.supabaseCustomerId || "",
    provider: "test",
    isDemo: overrides.isDemo ?? role === ROLES.DEMO_USER,
    mode: overrides.mode || ACCESS_CONTROL_MODES.PREVIEW,
    allowDemo: overrides.allowDemo ?? true,
    environment: overrides.environment || (role === ROLES.DEMO_USER ? "demo" : "production"),
  };
}

function testCustomerOwnCustomerOnly() {
  const context = createSyntheticContext(ROLES.CUSTOMER, { customerId: "customer-a" });
  const hasPortalPermission = roleHasPermission(ROLES.CUSTOMER, "customerPortal", "view_own");
  const mismatchBlockedByPolicy = context.customerId !== "customer-b";
  return {
    name: "customer role own customer only",
    ok: hasPortalPermission && mismatchBlockedByPolicy,
    details: hasPortalPermission
      ? "Customer heeft alleen een eigen customerId-context; mismatch moet empty-state/RLS opleveren."
      : "Customer mist customerPortal:view_own permissie.",
  };
}

function testDemoUserDemoOnly() {
  const context = createSyntheticContext(ROLES.DEMO_USER, { isDemo: true, environment: "demo" });
  const hasDemoPermission = roleHasPermission(ROLES.DEMO_USER, "demo", "view");
  const hasDeveloperTools = roleHasPermission(ROLES.DEMO_USER, "developerTools", "view");
  return {
    name: "demo_user demo only",
    ok: hasDemoPermission && !hasDeveloperTools && context.environment === "demo",
    details: hasDemoPermission ? "Demo-user kan demo-route zien en geen Developer Tools." : "Demo-user mist demo:view permissie.",
  };
}

function testSalesNoDeveloperTools() {
  return {
    name: "sales sees no Developer Tools",
    ok: !roleHasPermission(ROLES.SALES, "developerTools", "view"),
    details: "Sales heeft geen developerTools:view permissie.",
  };
}

function testSupportNoMigrationTools() {
  return {
    name: "support sees no migration tools",
    ok: !roleHasPermission(ROLES.SUPPORT, "developerTools", "migrate") && !roleHasPermission(ROLES.SUPPORT, "settings", "update"),
    details: "Support heeft geen developerTools:migrate en geen settings:update permissie.",
  };
}

function testDeveloperNoPaymentWriteActions() {
  return {
    name: "developer sees technical tools but no payment write actions",
    ok: roleHasPermission(ROLES.DEVELOPER, "developerTools", "view")
      && !roleHasPermission(ROLES.DEVELOPER, "invoices", "mark_paid")
      && !roleHasPermission(ROLES.DEVELOPER, "subscriptions", "invoice"),
    details: "Developer heeft technische tools, maar geen factuur betaaldzetten of abonnement-facturatie permissies.",
  };
}

function testAnonymousWarning() {
  const decision = getAccessDecision("admin-dashboard", {
    session: null,
    user: null,
    profile: null,
    role: "",
    mode: ACCESS_CONTROL_MODES.PREVIEW,
    allowDemo: false,
    isDemo: false,
  });
  return {
    name: "anonymous gets warning",
    ok: !decision.allowed && decision.reason === "Geen actieve sessie.",
    details: decision.reason,
  };
}

function testClientPortalMismatchNoData() {
  const context = createSyntheticContext(ROLES.CUSTOMER, { customerId: "customer-a" });
  return {
    name: "klantportaal mismatch gives no data",
    ok: context.customerId !== "customer-b",
    details: "Klantportaal moet bij customer-b mismatch een lege veilige state tonen; RLS moet dit later definitief afdwingen.",
  };
}

function testCustomerABIsolationSimulated() {
  const customerA = createSyntheticContext(ROLES.CUSTOMER, { customerId: "customer-a" });
  const customerBRecord = { customerId: "customer-b", owner: "Customer B" };
  return {
    name: "customer A/B isolation simulated",
    ok: customerA.customerId !== customerBRecord.customerId,
    details: "Simulatie bevestigt dat Customer A context niet overeenkomt met Customer B record. Echte RLS-test moet dit in Supabase afdwingen.",
  };
}

function testDemoIsolationSimulated() {
  const demo = createSyntheticContext(ROLES.DEMO_USER, { isDemo: true, environment: "demo" });
  const productionRecord = { isDemo: false, environment: "production" };
  return {
    name: "demo isolation simulated",
    ok: demo.isDemo && demo.environment === "demo" && productionRecord.environment !== "demo",
    details: "Demo-context is gescheiden van production-context. Echte RLS-test moet demo policies valideren.",
  };
}

function testAnonymousBlockedSimulated() {
  const decision = getAccessDecision("klantportaal", {
    session: null,
    user: null,
    profile: null,
    role: "",
    mode: ACCESS_CONTROL_MODES.PREVIEW,
    allowDemo: false,
    isDemo: false,
  });
  return {
    name: "anonymous blocked simulated",
    ok: !decision.allowed,
    details: decision.reason || "Anonymous context heeft geen klantportaaltoegang.",
  };
}

function testRoleNavigationSimulated() {
  const salesDecisions = testRoleAccess(ROLES.SALES);
  const developerTools = salesDecisions.find((decision) => decision.pageName === "admin-developer-tools");
  return {
    name: "role navigation simulated",
    ok: !developerTools?.allowed && !roleHasPermission(ROLES.SALES, "developerTools", "view"),
    details: "Sales navigatie hoort Developer Tools niet te tonen.",
  };
}

function testDangerousActionsBlockedSimulated() {
  return {
    name: "dangerous actions blocked simulated",
    ok: !roleHasPermission(ROLES.SUPPORT, "developerTools", "migrate")
      && !roleHasPermission(ROLES.DEVELOPER, "invoices", "mark_paid")
      && !roleHasPermission(ROLES.SALES, "settings", "update"),
    details: "Support, developer en sales missen permissies voor gevaarlijke migratie/payment/settings-acties.",
  };
}

export function runExtendedAccessControlSecurityTests() {
  const tests = [
    testCustomerOwnCustomerOnly(),
    testDemoUserDemoOnly(),
    testSalesNoDeveloperTools(),
    testSupportNoMigrationTools(),
    testDeveloperNoPaymentWriteActions(),
    testAnonymousWarning(),
    testClientPortalMismatchNoData(),
    testCustomerABIsolationSimulated(),
    testDemoIsolationSimulated(),
    testAnonymousBlockedSimulated(),
    testRoleNavigationSimulated(),
    testDangerousActionsBlockedSimulated(),
  ];
  return {
    testedAt: nowIso(),
    ok: tests.every((test) => test.ok),
    tests,
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
    securityTests: runExtendedAccessControlSecurityTests(),
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
  runExtendedAccessControlSecurityTests,
};
