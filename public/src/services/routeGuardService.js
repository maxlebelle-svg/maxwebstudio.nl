import { ROLES } from "../config/roles.js";
import { getCurrentSession, getCurrentUser, hasPermission } from "./authService.js";
import { getCurrentProfile, validateProfileAccess } from "./authProfileService.js";

const PAGE_RULES = Object.freeze({
  "admin-dashboard": { roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES, ROLES.DEVELOPER, ROLES.SUPPORT], resource: "dashboard", action: "view" },
  klantportaal: { roles: [ROLES.CUSTOMER, ROLES.DEMO_USER], resource: "customerPortal", action: "view_own" },
  "demo-klantreis": { roles: [ROLES.ADMIN, ROLES.SALES, ROLES.DEVELOPER, ROLES.DEMO_USER], resource: "demo", action: "view" },
});

export function getDefaultRedirectForRole(role) {
  if (role === ROLES.CUSTOMER) return "/klantportaal.html";
  if (role === ROLES.DEMO_USER) return "/demo-klantreis.html";
  return "/admin-dashboard.html";
}

export function canAccessPage(pageName) {
  const rule = PAGE_RULES[pageName];
  if (!rule) return true;
  const session = getCurrentSession();
  if (!session) return false;
  if (rule.roles?.length && !rule.roles.includes(session.role)) return false;
  if (rule.resource && rule.action) return hasPermission(rule.resource, rule.action);
  return true;
}

export function getAccessContext() {
  const session = getCurrentSession();
  const user = getCurrentUser();
  const profile = getCurrentProfile();
  return {
    session,
    user,
    profile,
    role: profile?.role || session?.role || "",
    provider: session?.provider || "none",
    hardBlocking: false,
    note: "Preview only; harde route guards volgen in Fase 13.2.",
  };
}

export function explainAccessDecision(pageName, role = "") {
  const rule = PAGE_RULES[pageName];
  if (!rule) return { allowed: true, pageName, role, reason: "Geen specifieke paginaregel.", hardBlocking: false };
  if (!role) return { allowed: false, pageName, role, reason: "Geen rol beschikbaar.", hardBlocking: false };
  if (rule.roles?.length && !rule.roles.includes(role)) {
    return { allowed: false, pageName, role, reason: `Rol ${role} staat niet in de voorbereide toegangsregel.`, hardBlocking: false };
  }
  const permission = rule.resource && rule.action
    ? validateProfileAccess({ role, status: "active" }, rule.resource, rule.action)
    : { allowed: true };
  return {
    allowed: Boolean(permission.allowed),
    pageName,
    role,
    resource: rule.resource,
    action: rule.action,
    reason: permission.allowed ? "Rol past bij de voorbereide route-regel." : "Rol mist de voorbereide permissie.",
    hardBlocking: false,
  };
}

export function wouldBlockInProduction(pageName, role = "") {
  return !explainAccessDecision(pageName, role).allowed;
}

export function getRouteAccessReadiness() {
  const context = getAccessContext();
  return {
    status: "voorbereid",
    hardBlocking: false,
    currentRole: context.role || "geen sessie",
    sessionProfileMapping: context.profile ? "voorbereid" : "nog geen profile gevonden",
    pages: Object.keys(PAGE_RULES).map((pageName) => explainAccessDecision(pageName, context.role)),
    nextPhase: "Fase 13.2 maakt route guards hard.",
  };
}

export function showAccessWarning(message = "Deze pagina gebruikt voorlopig demo-toegang. Echte routebeveiliging wordt voorbereid.") {
  let warning = document.querySelector("[data-route-guard-warning]");
  if (!warning) {
    warning = document.createElement("div");
    warning.dataset.routeGuardWarning = "true";
    warning.className = "portal-message";
    warning.setAttribute("role", "note");
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = "Toegangscontrole voorbereid";
    span.textContent = message;
    warning.append(strong, span);
    document.body.prepend(warning);
    return warning;
  }
  const span = warning.querySelector("span") || warning;
  span.textContent = message;
  return warning;
}

export function requireAuth({ allowedRoles = [], redirectTo = "/login.html", pageName = "" } = {}) {
  const session = getCurrentSession();
  const user = getCurrentUser();
  if (!session || !user) {
    showAccessWarning(`Geen actieve sessie. Demo-toegang blijft beschikbaar; echte redirect naar ${redirectTo} volgt later.`);
    return { allowed: false, session: null, user: null, redirectTo };
  }
  if (allowedRoles.length && !allowedRoles.includes(session.role)) {
    showAccessWarning("Je huidige demo-rol heeft normaal geen toegang tot deze pagina. Er wordt nog niet hard geblokkeerd.");
    return { allowed: false, session, user, redirectTo: getDefaultRedirectForRole(session.role) };
  }
  if (pageName && !canAccessPage(pageName)) {
    showAccessWarning("Deze pagina is voorbereid op route guards. De huidige demo-sessie blijft bruikbaar voor testen.");
    return { allowed: false, session, user, redirectTo: getDefaultRedirectForRole(session.role) };
  }
  return { allowed: true, session, user, redirectTo: getDefaultRedirectForRole(session.role) };
}
