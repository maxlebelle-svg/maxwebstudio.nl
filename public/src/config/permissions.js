import { ROLES } from "./roles.js";

export const PERMISSIONS = Object.freeze({
  all: ["*"],
  dashboard: ["view"],
  leads: ["view", "create", "update", "convert"],
  customers: ["view", "create", "update", "archive"],
  websites: ["view", "create", "update", "archive"],
  projects: ["view", "create", "update", "archive"],
  files: ["view", "create", "update", "archive"],
  quotes: ["view", "create", "update", "send", "convert"],
  invoices: ["view", "create", "update", "send", "mark_paid"],
  subscriptions: ["view", "create", "update", "invoice"],
  settings: ["view", "update"],
  integrations: ["view", "update"],
  users: ["view", "update_role", "activate", "deactivate"],
  demo: ["view", "run", "reset"],
  developerTools: ["view", "validate", "migrate", "seed"],
  customerPortal: ["view_own"],
});

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: { "*": ["*"] },
  [ROLES.ADMIN]: {
    dashboard: ["view"],
    leads: ["view", "create", "update", "convert"],
    customers: ["view", "create", "update", "archive"],
    websites: ["view", "create", "update", "archive"],
    projects: ["view", "create", "update", "archive"],
    files: ["view", "create", "update", "archive"],
    quotes: ["view", "create", "update", "send", "convert"],
    invoices: ["view", "create", "update", "send", "mark_paid"],
    subscriptions: ["view", "create", "update", "invoice"],
    settings: ["view", "update"],
    integrations: ["view", "update"],
    users: ["view", "update_role", "activate", "deactivate"],
    demo: ["view", "run", "reset"],
  },
  [ROLES.SALES_MANAGER]: {
    dashboard: ["view"],
    leads: ["view", "create", "update", "convert"],
    customers: ["view", "create", "update"],
    quotes: ["view", "create", "update", "send"],
    invoices: ["view"],
    users: ["view"],
  },
  [ROLES.SALES_PARTNER]: {
    dashboard: ["view"],
    leads: ["view", "create", "update", "convert"],
    customers: ["view", "create", "update"],
    quotes: ["view", "create", "update", "send"],
    invoices: ["view"],
  },
  [ROLES.DEVELOPER]: {
    dashboard: ["view"],
    websites: ["view", "update"],
    projects: ["view"],
    files: ["view"],
    settings: ["view"],
    integrations: ["view"],
    demo: ["view", "run", "reset"],
    developerTools: ["view", "validate", "migrate", "seed"],
  },
  [ROLES.DESIGNER]: {
    dashboard: ["view"],
    customers: ["view"],
    websites: ["view", "update"],
    projects: ["view", "update"],
    files: ["view", "create", "update"],
  },
  [ROLES.SUPPORT]: {
    dashboard: ["view"],
    customers: ["view"],
    websites: ["view"],
    projects: ["view", "update"],
    files: ["view"],
    invoices: ["view"],
  },
  [ROLES.CUSTOMER]: {
    customerPortal: ["view_own"],
  },
  [ROLES.DEMO_USER]: {
    demo: ["view", "run"],
    customerPortal: ["view_own"],
  },
});

export const NAVIGATION_PERMISSIONS = Object.freeze([
  { id: "dashboard", label: "Overzicht", resource: "dashboard", action: "view" },
  { id: "wijzigingsverzoeken", label: "Leads", resource: "leads", action: "view" },
  { id: "klanten", label: "CRM-klanten", resource: "customers", action: "view" },
  { id: "offertes", label: "Offertes", resource: "quotes", action: "view" },
  { id: "facturen", label: "Facturen", resource: "invoices", action: "view" },
  { id: "onderhoud", label: "Onderhoud", resource: "subscriptions", action: "view" },
  { id: "websites", label: "Websites", resource: "websites", action: "view" },
  { id: "projecten", label: "Projecten", resource: "projects", action: "view" },
  { id: "bestanden", label: "Bestanden", resource: "files", action: "view" },
  { id: "klantportaal", label: "Klantportaal", resource: "customerPortal", action: "view_own" },
  { id: "instellingen", label: "Instellingen", resource: "settings", action: "view" },
  { id: "integraties", label: "Integraties", resource: "integrations", action: "view" },
  { id: "demo-omgeving", label: "Demo omgeving", resource: "demo", action: "view" },
]);

export function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLES.DEMO_USER];
}

export function roleHasPermission(role, resource, action) {
  const permissions = getPermissionsForRole(role);
  if (permissions["*"]?.includes("*")) return true;
  const resourceActions = permissions[resource] || [];
  return resourceActions.includes("*") || resourceActions.includes(action);
}
