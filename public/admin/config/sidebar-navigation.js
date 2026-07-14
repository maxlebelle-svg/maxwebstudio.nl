(function initAdminSidebarNavigation(global) {
  "use strict";

  const STAFF_ROLES = Object.freeze([
    "super_admin",
    "admin",
    "sales_manager",
    "sales_partner",
    "developer",
    "designer",
    "support",
  ]);

  const roleGroups = Object.freeze({
    allStaff: STAFF_ROLES,
    sales: Object.freeze(["super_admin", "admin", "sales_manager", "sales_partner"]),
    production: Object.freeze(["super_admin", "admin", "developer", "designer", "support"]),
    management: Object.freeze(["super_admin", "admin"]),
    technical: Object.freeze(["super_admin", "admin", "developer"]),
  });

  function permission(resource, action, roles = roleGroups.allStaff) {
    return Object.freeze({ resource, action, roles });
  }

  function item(id, label, route, icon, options = {}) {
    return Object.freeze({
      id,
      label,
      route,
      icon,
      badge: options.badge || null,
      statusTone: options.statusTone || "neutral",
      workspaceRequired: Boolean(options.workspaceRequired),
      relationshipTypes: Object.freeze([...(options.relationshipTypes || (options.workspaceRequired ? ["lead", "customer"] : []))]),
      permission: options.permission || permission("dashboard", "view"),
      secondary: Boolean(options.secondary),
    });
  }

  const ADMIN_SIDEBAR_NAVIGATION = Object.freeze([
    Object.freeze({
      id: "sales",
      label: "Sales",
      items: Object.freeze([
        item("leads", "Leads", "admin-sales.html", "users", {
          badge: "openLeads",
          statusTone: "info",
          permission: permission("leads", "view", roleGroups.sales),
        }),
        item("sales-agenda", "Agenda", "admin-sales.html#sales-agenda", "calendar", {
          permission: permission("leads", "view", roleGroups.sales),
          secondary: true,
        }),
        item("lead-generator", "Lead Generator", "admin-lead-generator.html", "sparkles", {
          permission: permission("leads", "view", roleGroups.sales),
          secondary: true,
        }),
      ]),
    }),
    Object.freeze({ id: "active-workspace", label: "Actieve werkruimte", type: "workspace", items: Object.freeze([]) }),
    Object.freeze({
      id: "production",
      label: "Production",
      items: Object.freeze([
        item("website-factory", "Website Factory", "admin-website-factory.html", "wand", { badge: "websiteFactory", statusTone: "success", workspaceRequired: true, permission: permission("websites", "update", roleGroups.production) }),
        item("website-qa", "Website QA Scanner", "admin-website-qa-scanner.html", "scan-search", { permission: permission("websites", "view", roleGroups.production), secondary: true }),
        item("demo-sites", "Demo Sites", "admin-demo-sites.html", "monitor", { badge: "demoSites", statusTone: "info", workspaceRequired: true, permission: permission("demo", "view") }),
        item("ai-content-library", "AI Content Library", "admin-ai-content-library.html", "file-text", { badge: "contentItems", statusTone: "purple", workspaceRequired: true, permission: permission("developerTools", "view", roleGroups.technical) }),
        item("asset-manager", "Asset Manager", "admin-assets.html", "folder", { badge: "assets", statusTone: "info", workspaceRequired: true, permission: permission("files", "view", roleGroups.production) }),
        item("seo-studio", "SEO Studio", "admin-seo-studio.html", "search", { badge: "seoScore", statusTone: "success", workspaceRequired: true, permission: permission("websites", "view", roleGroups.production) }),
        item("social-media-studio", "Social Media Studio", "admin-social-media-studio.html", "send", { badge: "socialChannels", statusTone: "purple", workspaceRequired: true, permission: permission("projects", "view", roleGroups.production) }),
        item("brand-center", "Brand Center", "admin-brand-center.html", "palette", { badge: "brandStatus", statusTone: "purple", workspaceRequired: true, permission: permission("websites", "view", roleGroups.production) }),
        item("domain-center", "Domein Center", "admin-domain-center.html", "globe", { badge: "domains", statusTone: "info", workspaceRequired: true, permission: permission("integrations", "view", roleGroups.production) }),
        item("customer-onboarding", "Klant Onboarding", "admin-onboarding.html", "clipboard-check", { badge: "onboardingProgress", statusTone: "warning", workspaceRequired: true, relationshipTypes: ["customer"], permission: permission("customers", "view") }),
        item("roadmap", "Roadmap / Takenbord", "admin-roadmap.html", "list-checks", { badge: "openTasks", statusTone: "warning", permission: permission("developerTools", "view", roleGroups.technical), secondary: true }),
        item("websites", "Websites", "admin-websites.html", "layout", { permission: permission("websites", "view", roleGroups.production), secondary: true }),
        item("projects", "Projecten", "admin-projecten.html", "briefcase", { permission: permission("projects", "view", roleGroups.production), secondary: true }),
      ]),
    }),
    Object.freeze({
      id: "commerce",
      label: "Commerce",
      items: Object.freeze([
        item("new-assignment", "Nieuwe Opdracht", "admin-nieuwe-opdracht.html", "circle-plus", { permission: permission("quotes", "update", roleGroups.sales), secondary: true }),
        item("quotes", "Offertes", "admin-offertes.html", "file-signature", { badge: "openQuotes", statusTone: "warning", workspaceRequired: true, permission: permission("quotes", "view", roleGroups.sales) }),
        item("invoices", "Facturen", "admin-facturen.html", "receipt", { badge: "openInvoices", statusTone: "warning", workspaceRequired: true, permission: permission("invoices", "view", Object.freeze(["super_admin", "admin", "sales_manager"])) }),
        item("subscriptions", "Abonnementen", "admin-facturen.html#onderhoud", "repeat", { badge: "subscriptionStatus", statusTone: "success", workspaceRequired: true, permission: permission("subscriptions", "view", roleGroups.management) }),
      ]),
    }),
    Object.freeze({
      id: "relationship-communication",
      label: "Relatie & communicatie",
      items: Object.freeze([
        item("customers", "Klanten", "admin-klanten.html", "building", { permission: permission("customers", "view") }),
        item("mail-center", "Mail Center", "admin-mail-center.html", "mail", { badge: "mailCount", statusTone: "info", workspaceRequired: true, permission: permission("leads", "view", roleGroups.sales) }),
        item("email-studio", "E-mail Studio", "admin-email-studio.html", "pen-line", { permission: permission("leads", "view", roleGroups.sales) }),
        item("journeys", "Journey & Mail Automation", "admin-journeys.html", "workflow", { permission: permission("dashboard", "view") }),
        item("timeline", "Timeline", "admin-notification-center.html#timeline", "history", { badge: "timelineEvents", statusTone: "neutral", workspaceRequired: true, permission: permission("dashboard", "view") }),
      ]),
    }),
    Object.freeze({
      id: "management",
      label: "Beheer",
      items: Object.freeze([
        item("dashboard", "Dashboard", "admin-dashboard.html", "gauge", { permission: permission("dashboard", "view") }),
        item("notifications", "Notification Center", "admin-notification-center.html", "bell", { permission: permission("dashboard", "view") }),
        item("automations", "Max Automations", "admin-max-automations.html", "workflow", { permission: permission("developerTools", "view", roleGroups.technical) }),
        item("max-brain", "Max Brain", "admin-max-brain.html", "brain", { permission: permission("developerTools", "view", Object.freeze(["super_admin", "admin", "developer", "support"])) }),
        item("platform-health", "Platform Health", "admin-platform-health.html", "activity", { permission: permission("developerTools", "view", roleGroups.technical) }),
        item("settings", "Instellingen", "admin-instellingen.html", "settings", { permission: permission("settings", "view", roleGroups.technical) }),
      ]),
    }),
  ]);

  const api = Object.freeze({ ADMIN_SIDEBAR_NAVIGATION, STAFF_ROLES, roleGroups });
  global.MaxAdminSidebarNavigation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
