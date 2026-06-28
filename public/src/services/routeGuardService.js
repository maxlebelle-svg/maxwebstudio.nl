import { ROLES } from "../config/roles.js";
import { getCurrentSession, getCurrentUser, hasPermission } from "./authService.js";

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
