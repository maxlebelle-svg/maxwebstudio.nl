export const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  SALES_MANAGER: "sales_manager",
  SALES_PARTNER: "sales_partner",
  DEVELOPER: "developer",
  DESIGNER: "designer",
  SUPPORT: "support",
  CUSTOMER: "customer",
  DEMO_USER: "demo_user",
});

export const LEGACY_ROLE_ALIASES = Object.freeze({
  sales: ROLES.SALES_PARTNER,
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
  [ROLES.SALES_MANAGER]: {
    label: "Sales Manager",
    description: "Beheert salespartners, leads, klanten, offertes en commerciële opvolging.",
  },
  [ROLES.SALES_PARTNER]: {
    label: "Sales Partner",
    description: "Beheert eigen leads, klanten en offertes binnen de salespartner-scope.",
  },
  [ROLES.DEVELOPER]: {
    label: "Developer",
    description: "Gebruikt developer tools, validatie, migratievoorbereiding en technische data.",
  },
  [ROLES.DESIGNER]: {
    label: "Designer",
    description: "Werkt aan websites, projecten en klantassets zonder financiële of beheerrechten.",
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
  const normalizedRole = normalizeRole(role);
  return ROLE_DEFINITIONS[normalizedRole] || ROLE_DEFINITIONS[ROLES.DEMO_USER];
}

export function getRoleLabel(role) {
  return getRoleDefinition(role).label;
}

export function getAllRoles() {
  return Object.entries(ROLE_DEFINITIONS).map(([role, definition]) => ({ role, ...definition }));
}

export function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return LEGACY_ROLE_ALIASES[normalized] || normalized;
}
