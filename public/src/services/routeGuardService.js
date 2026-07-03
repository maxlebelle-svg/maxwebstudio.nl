import { ACCESS_CONTROL_MODES, getProtectedRoute, listProtectedRoutes } from "../config/protectedRoutes.js";
import { roleHasPermission } from "../config/permissions.js";
import { ROLES } from "../config/roles.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { getCurrentSession, getCurrentUser, hasPermission } from "./authService.js";
import { getCurrentProfile, validateProfileAccess } from "./authProfileService.js";
import { logActivity, listRecentActivities } from "./activityLogService.js";

const DEFAULT_ACCESS_SETTINGS = Object.freeze({
  mode: ACCESS_CONTROL_MODES.SOFT,
  allowDemo: true,
});

function nowIso() {
  return new Date().toISOString();
}

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeMode(mode = "") {
  return Object.values(ACCESS_CONTROL_MODES).includes(mode) ? mode : ACCESS_CONTROL_MODES.SOFT;
}

export function getAccessControlSettings() {
  return {
    ...DEFAULT_ACCESS_SETTINGS,
    ...readJson(STORAGE_KEYS.accessControlSettings, {}),
  };
}

export function setAccessControlMode(mode = ACCESS_CONTROL_MODES.SOFT) {
  const settings = {
    ...getAccessControlSettings(),
    mode: normalizeMode(mode),
    updatedAt: nowIso(),
  };
  writeJson(STORAGE_KEYS.accessControlSettings, settings);
  logActivity("access", "settings", "route_guard_evaluated", { mode: settings.mode, reason: "access_mode_updated" });
  return settings;
}

export function resetAccessControlMode() {
  return setAccessControlMode(ACCESS_CONTROL_MODES.SOFT);
}

export function getDefaultRedirectForRole(role) {
  if (role === ROLES.CUSTOMER) return "/klantportaal.html";
  if (role === ROLES.DEMO_USER) return "/demo-klantreis.html";
  return "/admin-dashboard.html";
}

export function getAccessContext(options = {}) {
  const session = getCurrentSession();
  const user = getCurrentUser();
  const profile = getCurrentProfile();
  const settings = getAccessControlSettings();
  return {
    session,
    user,
    profile,
    role: profile?.role || session?.role || "",
    customerId: profile?.customerId || session?.customerId || user?.customerId || "",
    supabaseCustomerId: profile?.supabaseCustomerId || "",
    provider: session?.provider || "none",
    isDemo: Boolean(session?.isDemo || profile?.isDemoUser || user?.isDemo),
    mode: normalizeMode(options.mode || settings.mode),
    allowDemo: options.allowDemo ?? settings.allowDemo ?? true,
    environment: profile?.environment || session?.environment || "local",
  };
}

function decisionBase(route = {}, context = {}, options = {}) {
  return {
    allowed: true,
    decision: "allowed",
    reason: "Toegang toegestaan.",
    pageName: options.pageName || route.pageName || "",
    route: route.path || "",
    role: context.role || "",
    mode: context.mode || ACCESS_CONTROL_MODES.SOFT,
    resource: options.resource || route.requiredPermissions?.[0]?.resource || "",
    action: options.action || route.requiredPermissions?.[0]?.action || "",
    sessionId: context.session?.id || "",
    userId: context.user?.id || "",
    profileId: context.profile?.id || "",
    customerId: options.customerId || context.customerId || "",
    redirectTo: options.redirectTo || route.defaultRedirect || getDefaultRedirectForRole(context.role),
    hardBlocking: context.mode === ACCESS_CONTROL_MODES.HARD,
    timestamp: nowIso(),
  };
}

function applyMode(decision = {}, deniedReason = "") {
  const next = {
    ...decision,
    allowed: false,
    reason: deniedReason || decision.reason,
  };
  if (decision.mode === ACCESS_CONTROL_MODES.PREVIEW) {
    next.decision = "access_denied_preview";
    next.enforced = false;
    return next;
  }
  if (decision.mode === ACCESS_CONTROL_MODES.HARD) {
    next.decision = "access_denied_hard";
    next.enforced = true;
    return next;
  }
  next.decision = "access_denied_soft";
  next.enforced = false;
  return next;
}

export function getAccessDecision(pageName = "", context = getAccessContext(), options = {}) {
  const route = getProtectedRoute(pageName) || {
    pageName,
    requiredRoles: options.allowedRoles || [],
    requiredPermissions: options.resource && options.action ? [{ resource: options.resource, action: options.action }] : [],
    allowDemo: options.allowDemo ?? true,
    defaultRedirect: options.redirectTo || "/login.html",
    hardReady: false,
  };
  const decision = decisionBase(route, context, { ...options, pageName });
  if (route.public) return decision;
  if (!context.session || !context.user) return applyMode(decision, "Geen actieve sessie.");
  if (["disabled", "archived"].includes(String(context.profile?.status || "").toLowerCase())) {
    return applyMode(decision, "Account is gedeactiveerd.");
  }
  if (!context.allowDemo && context.isDemo) return applyMode(decision, "Demo-sessies zijn voor deze route niet toegestaan.");
  if (route.requiredRoles?.length && !route.requiredRoles.includes(context.role)) {
    return applyMode(decision, `Rol ${context.role || "onbekend"} heeft geen toegang tot ${pageName}.`);
  }
  const permissions = options.resource && options.action
    ? [{ resource: options.resource, action: options.action }]
    : route.requiredPermissions || [];
  const missingPermission = permissions.find((permission) => !hasPermission(permission.resource, permission.action));
  if (missingPermission) {
    return applyMode({
      ...decision,
      resource: missingPermission.resource,
      action: missingPermission.action,
    }, `Permissie ontbreekt: ${missingPermission.resource}:${missingPermission.action}.`);
  }
  return decision;
}

export function explainAccessDecision(pageName = "", contextOrRole = getAccessContext()) {
  const context = typeof contextOrRole === "string"
    ? { ...getAccessContext(), role: contextOrRole, mode: ACCESS_CONTROL_MODES.PREVIEW }
    : contextOrRole;
  const decision = getAccessDecision(pageName, context);
  return {
    ...decision,
    explanation: decision.allowed
      ? "Deze route past bij de huidige rol/permissies."
      : `${decision.reason} In preview/soft mode blijft demo-toegang waar veilig mogelijk zichtbaar.`,
  };
}

export function wouldBlockInProduction(pageName = "", role = "") {
  const context = { ...getAccessContext({ mode: ACCESS_CONTROL_MODES.HARD }), role, mode: ACCESS_CONTROL_MODES.HARD };
  return !getAccessDecision(pageName, context).allowed;
}

export function logAccessDecision(decision = {}) {
  const action = decision.decision || (decision.allowed ? "route_guard_evaluated" : "access_warning");
  logActivity("access", decision.pageName || "route", action, {
    pageName: decision.pageName,
    userId: decision.userId,
    profileId: decision.profileId,
    sessionId: decision.sessionId,
    role: decision.role,
    resource: decision.resource,
    action: decision.action,
    mode: decision.mode,
    decision: decision.decision,
    reason: decision.reason,
    timestamp: decision.timestamp || nowIso(),
  });
  return decision;
}

export function showAccessWarning(message = "Deze pagina gebruikt soft access-control. Echte routebeveiliging wordt voorbereid.", options = {}) {
  if (typeof document === "undefined") return null;
  let warning = document.querySelector("[data-route-guard-warning]");
  if (!warning) {
    warning = document.createElement("div");
    warning.dataset.routeGuardWarning = "true";
    warning.className = options.className || "portal-message";
    warning.setAttribute("role", "note");
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = options.title || "Toegangscontrole";
    span.textContent = message;
    warning.append(strong, span);
    (options.target || document.body).prepend(warning);
    logActivity("access", options.pageName || "warning", "access_warning", { message, mode: options.mode || getAccessControlSettings().mode });
    return warning;
  }
  const span = warning.querySelector("span") || warning;
  span.textContent = message;
  logActivity("access", options.pageName || "warning", "access_warning", { message, mode: options.mode || getAccessControlSettings().mode });
  return warning;
}

function enforceDecision(decision = {}, options = {}) {
  logAccessDecision(decision);
  if (!decision.allowed) {
    showAccessWarning(decision.reason, { pageName: decision.pageName, mode: decision.mode, target: options.warningTarget });
    if (decision.enforced && decision.redirectTo && typeof window !== "undefined") {
      window.location.href = decision.redirectTo;
    }
  }
  return decision;
}

export function requireAuth(options = {}) {
  const context = getAccessContext(options);
  const decision = getAccessDecision(options.pageName || "auth", context, options);
  return enforceDecision(decision, options);
}

export function requireRole(allowedRoles = [], options = {}) {
  const context = getAccessContext(options);
  const route = {
    pageName: options.pageName || "role",
    path: options.path || "",
    requiredRoles: allowedRoles,
    requiredPermissions: [],
    allowDemo: options.allowDemo ?? true,
    defaultRedirect: options.redirectTo || getDefaultRedirectForRole(context.role),
  };
  const decision = getAccessDecision(route.pageName, context, { ...options, allowedRoles });
  if (!allowedRoles.includes(context.role)) {
    return enforceDecision(applyMode({ ...decision, ...decisionBase(route, context, options) }, `Rol ${context.role || "onbekend"} is niet toegestaan.`), options);
  }
  return enforceDecision({ ...decision, allowed: true, decision: "allowed" }, options);
}

export function requirePermission(resource, action, options = {}) {
  const context = getAccessContext(options);
  const decision = getAccessDecision(options.pageName || "permission", context, { ...options, resource, action });
  return enforceDecision(decision, options);
}

export function requireCustomerAccess(customerId = "", options = {}) {
  const context = getAccessContext(options);
  const expectedCustomerId = String(customerId || "").trim();
  const ownCustomerId = String(context.customerId || "").trim();
  const baseDecision = getAccessDecision(options.pageName || "klantportaal", context, { ...options, customerId: expectedCustomerId });
  if (!expectedCustomerId || !ownCustomerId || context.isDemo || [ROLES.SUPER_ADMIN, ROLES.ADMIN].includes(context.role)) {
    return enforceDecision({
      ...baseDecision,
      allowed: true,
      decision: "allowed",
      reason: context.isDemo ? "Demo/customer portal bypass toegestaan." : "Customer access voorbereid.",
    }, options);
  }
  if (expectedCustomerId !== ownCustomerId) {
    const decision = applyMode({
      ...baseDecision,
      customerId: expectedCustomerId,
      decision: "customer_access_mismatch",
    }, "Deze sessie hoort bij een andere klant.");
    decision.decision = "customer_access_mismatch";
    return enforceDecision(decision, options);
  }
  return enforceDecision({ ...baseDecision, allowed: true, decision: "allowed", reason: "Customer access match." }, options);
}

export function canAccessPage(pageName) {
  return getAccessDecision(pageName, getAccessContext()).allowed;
}

export function filterActionsByPermission(actions = []) {
  return actions.filter((action) => {
    if (!action.resource || !action.action) return true;
    return validateProfileAccess(getCurrentProfile() || { role: getAccessContext().role }, action.resource, action.action).allowed;
  });
}

export function canShowDeveloperTools() {
  const context = getAccessContext();
  return [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER].includes(context.role)
    && roleHasPermission(context.role, "developerTools", "view");
}

export function canShowMigrationTools() {
  const context = getAccessContext();
  return [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER].includes(context.role)
    && roleHasPermission(context.role, "developerTools", "migrate");
}

export function canShowSettings() {
  const context = getAccessContext();
  return roleHasPermission(context.role, "settings", "view");
}

export function getRouteAccessReadiness() {
  const context = getAccessContext();
  const routes = listProtectedRoutes().map((route) => {
    const decision = getAccessDecision(route.pageName, context);
    return {
      pageName: route.pageName,
      path: route.path,
      allowed: decision.allowed,
      hardReady: route.hardReady,
      mode: context.mode,
      reason: decision.reason,
    };
  });
  return {
    status: "soft actief",
    accessMode: context.mode,
    hardBlocking: context.mode === ACCESS_CONTROL_MODES.HARD,
    currentRole: context.role || "geen sessie",
    sessionProfileMapping: context.profile ? "voorbereid" : "nog geen profile gevonden",
    routes,
    hardReadyRoutes: routes.filter((route) => route.hardReady).map((route) => route.pageName),
    softOnlyRoutes: routes.filter((route) => !route.hardReady).map((route) => route.pageName),
    latestDecisions: listRecentActivities(20).filter((activity) => activity.entityType === "access").slice(0, 8),
    nextPhase: "Fase 13.3 maakt RLS/security definitief.",
  };
}
