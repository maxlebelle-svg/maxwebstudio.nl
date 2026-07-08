import { ROLES } from "./roles.js";

export const ACCESS_CONTROL_MODES = Object.freeze({
  PREVIEW: "preview",
  SOFT: "soft",
  HARD: "hard",
});

export const PROTECTED_ROUTES = Object.freeze({
  "admin-dashboard": {
    pageName: "admin-dashboard",
    path: "/admin-dashboard.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.DESIGNER, ROLES.SALES_MANAGER, ROLES.SALES_PARTNER, ROLES.SUPPORT],
    requiredPermissions: [{ resource: "dashboard", action: "view" }],
    allowDemo: true,
    defaultRedirect: "/login.html",
    hardReady: true,
  },
  "admin-leadfinder": {
    pageName: "admin-leadfinder",
    path: "/admin-sales.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_PARTNER],
    requiredPermissions: [{ resource: "leads", action: "view" }],
    allowDemo: true,
    defaultRedirect: "/admin-sales.html",
    hardReady: true,
  },
  klantportaal: {
    pageName: "klantportaal",
    path: "/klantportaal.html",
    requiredRoles: [ROLES.CUSTOMER, ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEMO_USER],
    requiredPermissions: [{ resource: "customerPortal", action: "view_own" }],
    allowDemo: true,
    defaultRedirect: "/login.html",
    hardReady: false,
    requiresCustomerAccess: true,
  },
  login: {
    pageName: "login",
    path: "/login.html",
    requiredRoles: [],
    requiredPermissions: [],
    allowDemo: true,
    defaultRedirect: "/login.html",
    hardReady: true,
    public: true,
  },
  "demo-klantreis": {
    pageName: "demo-klantreis",
    path: "/demo-klantreis.html",
    requiredRoles: [ROLES.DEMO_USER, ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.SALES_MANAGER, ROLES.SALES_PARTNER],
    requiredPermissions: [{ resource: "demo", action: "view" }],
    allowDemo: true,
    defaultRedirect: "/login.html",
    hardReady: true,
  },
  offerte: {
    pageName: "offerte",
    path: "/offerte.html",
    requiredRoles: [],
    requiredPermissions: [],
    allowDemo: true,
    defaultRedirect: "/login.html",
    hardReady: false,
    public: true,
    demoSafe: true,
  },
  betalen: {
    pageName: "betalen",
    path: "/betalen.html",
    requiredRoles: [],
    requiredPermissions: [],
    allowDemo: true,
    defaultRedirect: "/login.html",
    hardReady: false,
    public: true,
    demoSafe: true,
  },
  "admin-developer-tools": {
    pageName: "admin-developer-tools",
    path: "/admin-dashboard.html#instellingen",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER],
    requiredPermissions: [{ resource: "developerTools", action: "view" }],
    allowDemo: true,
    defaultRedirect: "/admin-dashboard.html",
    hardReady: true,
  },
  "admin-max-brain": {
    pageName: "admin-max-brain",
    path: "/admin-max-brain.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.SUPPORT],
    requiredPermissions: [{ resource: "developerTools", action: "view" }],
    allowDemo: true,
    defaultRedirect: "/admin-dashboard.html",
    hardReady: true,
  },
  "admin-platform-health": {
    pageName: "admin-platform-health",
    path: "/admin-platform-health.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.SUPPORT],
    requiredPermissions: [{ resource: "developerTools", action: "view" }],
    allowDemo: true,
    defaultRedirect: "/admin-dashboard.html",
    hardReady: true,
  },
  "admin-nieuwe-opdracht": {
    pageName: "admin-nieuwe-opdracht",
    path: "/admin-nieuwe-opdracht.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_PARTNER],
    requiredPermissions: [{ resource: "quotes", action: "create" }],
    allowDemo: true,
    defaultRedirect: "/admin-dashboard.html",
    hardReady: true,
  },
});

export function getProtectedRoute(pageName = "") {
  return PROTECTED_ROUTES[pageName] || null;
}

export function listProtectedRoutes() {
  return Object.values(PROTECTED_ROUTES);
}
