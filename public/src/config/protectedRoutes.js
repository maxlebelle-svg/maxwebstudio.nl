import { ROLES } from "./roles.js";

const ALL_STAFF_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.DEVELOPER,
  ROLES.DESIGNER,
  ROLES.SALES_MANAGER,
  ROLES.SALES_PARTNER,
  ROLES.SUPPORT,
]);

const SALES_ROLES = Object.freeze([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_PARTNER]);
const CUSTOMER_ROLES = Object.freeze([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_PARTNER, ROLES.SUPPORT]);
const PRODUCTION_ROLES = Object.freeze([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.DESIGNER, ROLES.SUPPORT]);
const DEVELOPER_ROLES = Object.freeze([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER]);

function adminRoute(path, options = {}) {
  const pageName = path.replace(/^\//, "").replace(/\.html$/, "");
  return {
    pageName,
    path,
    requiredRoles: options.requiredRoles || ALL_STAFF_ROLES,
    requiredPermissions: options.requiredPermissions || [{ resource: "dashboard", action: "view" }],
    allowDemo: false,
    defaultRedirect: "/admin-dashboard.html",
    hardReady: true,
  };
}

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
    allowDemo: false,
    defaultRedirect: "/login.html",
    hardReady: true,
  },
  "admin-ai-content-library": adminRoute("/admin-ai-content-library.html", {
    requiredRoles: DEVELOPER_ROLES,
    requiredPermissions: [{ resource: "developerTools", action: "view" }],
  }),
  "admin-assets": adminRoute("/admin-assets.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "files", action: "view" }],
  }),
  "admin-brand-center-lab": adminRoute("/admin-brand-center-lab.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "websites", action: "view" }],
  }),
  "admin-brand-center": adminRoute("/admin-brand-center.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "websites", action: "view" }],
  }),
  "admin-demo-sites": adminRoute("/admin-demo-sites.html", {
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.DESIGNER, ROLES.SALES_MANAGER, ROLES.SALES_PARTNER],
    requiredPermissions: [{ resource: "demo", action: "view" }],
  }),
  "admin-domain-center": adminRoute("/admin-domain-center.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "integrations", action: "view" }],
  }),
  "admin-email-studio": adminRoute("/admin-email-studio.html", {
    requiredRoles: SALES_ROLES,
    requiredPermissions: [{ resource: "leads", action: "view" }],
  }),
  "admin-facturen": adminRoute("/admin-facturen.html", {
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER],
    requiredPermissions: [{ resource: "invoices", action: "view" }],
  }),
  "admin-instellingen": adminRoute("/admin-instellingen.html", {
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER],
    requiredPermissions: [{ resource: "settings", action: "view" }],
  }),
  "admin-klanten": adminRoute("/admin-klanten.html", {
    requiredRoles: CUSTOMER_ROLES,
    requiredPermissions: [{ resource: "customers", action: "view" }],
  }),
  "admin-leadfinder": {
    pageName: "admin-leadfinder",
    path: "/admin-sales.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_PARTNER],
    requiredPermissions: [{ resource: "leads", action: "view" }],
    allowDemo: false,
    defaultRedirect: "/admin-sales.html",
    hardReady: true,
  },
  "admin-lead-generator": adminRoute("/admin-lead-generator.html", {
    requiredRoles: SALES_ROLES,
    requiredPermissions: [{ resource: "leads", action: "view" }],
  }),
  "admin-logo-studio": adminRoute("/admin-logo-studio.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "websites", action: "view" }],
  }),
  "admin-mail-center": adminRoute("/admin-mail-center.html", {
    requiredRoles: SALES_ROLES,
    requiredPermissions: [{ resource: "leads", action: "view" }],
  }),
  "admin-max-automations": adminRoute("/admin-max-automations.html", {
    requiredRoles: DEVELOPER_ROLES,
    requiredPermissions: [{ resource: "developerTools", action: "view" }],
  }),
  "admin-notification-center": adminRoute("/admin-notification-center.html"),
  "admin-offertes": adminRoute("/admin-offertes.html", {
    requiredRoles: SALES_ROLES,
    requiredPermissions: [{ resource: "quotes", action: "view" }],
  }),
  "admin-projecten": adminRoute("/admin-projecten.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "projects", action: "view" }],
  }),
  "admin-roadmap": adminRoute("/admin-roadmap.html", {
    requiredRoles: DEVELOPER_ROLES,
    requiredPermissions: [{ resource: "developerTools", action: "view" }],
  }),
  "admin-sales": adminRoute("/admin-sales.html", {
    requiredRoles: SALES_ROLES,
    requiredPermissions: [{ resource: "leads", action: "view" }],
  }),
  "admin-seo-studio": adminRoute("/admin-seo-studio.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "websites", action: "view" }],
  }),
  "admin-social-media-studio": adminRoute("/admin-social-media-studio.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "projects", action: "view" }],
  }),
  "admin-website-factory": adminRoute("/admin-website-factory.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "websites", action: "update" }],
  }),
  "admin-website-qa-scanner": adminRoute("/admin-website-qa-scanner.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "websites", action: "view" }],
  }),
  "admin-websites": adminRoute("/admin-websites.html", {
    requiredRoles: PRODUCTION_ROLES,
    requiredPermissions: [{ resource: "websites", action: "view" }],
  }),
  klantportaal: {
    pageName: "klantportaal",
    path: "/klantportaal.html",
    requiredRoles: [ROLES.CUSTOMER, ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEMO_USER],
    requiredPermissions: [{ resource: "customerPortal", action: "view_own" }],
    allowDemo: false,
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
    allowDemo: false,
    defaultRedirect: "/admin-dashboard.html",
    hardReady: true,
  },
  "admin-max-brain": {
    pageName: "admin-max-brain",
    path: "/admin-max-brain.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.SUPPORT],
    requiredPermissions: [{ resource: "developerTools", action: "view" }],
    allowDemo: false,
    defaultRedirect: "/admin-dashboard.html",
    hardReady: true,
  },
  "admin-platform-health": {
    pageName: "admin-platform-health",
    path: "/admin-platform-health.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DEVELOPER, ROLES.SUPPORT],
    requiredPermissions: [{ resource: "developerTools", action: "view" }],
    allowDemo: false,
    defaultRedirect: "/admin-dashboard.html",
    hardReady: true,
  },
  "admin-nieuwe-opdracht": {
    pageName: "admin-nieuwe-opdracht",
    path: "/admin-nieuwe-opdracht.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_PARTNER],
    requiredPermissions: [{ resource: "quotes", action: "create" }],
    allowDemo: false,
    defaultRedirect: "/admin-dashboard.html",
    hardReady: true,
  },
  "admin-onboarding": {
    pageName: "admin-onboarding",
    path: "/admin-onboarding.html",
    requiredRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_PARTNER, ROLES.SUPPORT],
    requiredPermissions: [{ resource: "customers", action: "view" }],
    allowDemo: false,
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
