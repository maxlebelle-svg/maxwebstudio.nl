export const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  SALES: "sales",
  DEVELOPER: "developer",
  SUPPORT: "support",
  CUSTOMER: "customer",
  DEMO_USER: "demo_user",
});

export const ROLE_DEFINITIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: {
    label: "Super Admin",
    description: "Volledige toegang tot platform, instellingen, migratie en alle modules.",
  },
  [ROLES.ADMIN]: {
    label: "Admin",
    description: "Beheert klanten, sales, projecten, facturen, demo en platforminstellingen.",
  },
  [ROLES.SALES]: {
    label: "Sales",
    description: "Beheert leads, klanten, offertes en facturen op salesniveau.",
  },
  [ROLES.DEVELOPER]: {
    label: "Developer",
    description: "Gebruikt developer tools, validatie, migratievoorbereiding en technische data.",
  },
  [ROLES.SUPPORT]: {
    label: "Support",
    description: "Bekijkt klanten, projecten, websites en facturen voor ondersteuning.",
  },
  [ROLES.CUSTOMER]: {
    label: "Klant",
    description: "Ziet alleen eigen klantportaaldata zodra echte auth/RLS actief is.",
  },
  [ROLES.DEMO_USER]: {
    label: "Demo gebruiker",
    description: "Gebruikt alleen demo-klantreis en demo-omgeving als salespresentatie.",
  },
});

export function getRoleDefinition(role) {
  return ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS[ROLES.DEMO_USER];
}

export function getRoleLabel(role) {
  return getRoleDefinition(role).label;
}

export function getAllRoles() {
  return Object.entries(ROLE_DEFINITIONS).map(([role, definition]) => ({ role, ...definition }));
}
