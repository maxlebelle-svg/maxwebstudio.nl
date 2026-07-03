import { ROLES, normalizeRole } from "../config/roles.js";

export const PROFILE_STATUSES = Object.freeze({
  ACTIVE: "active",
  INVITED: "invited",
  PENDING: "pending",
  DISABLED: "disabled",
  ARCHIVED: "archived",
});

export const PROFILE_ROLES = Object.freeze({
  SUPER_ADMIN: ROLES.SUPER_ADMIN,
  ADMIN: ROLES.ADMIN,
  SALES_MANAGER: ROLES.SALES_MANAGER,
  SALES_PARTNER: ROLES.SALES_PARTNER,
  DEVELOPER: ROLES.DEVELOPER,
  DESIGNER: ROLES.DESIGNER,
  SUPPORT: ROLES.SUPPORT,
  CUSTOMER: ROLES.CUSTOMER,
  DEMO_USER: ROLES.DEMO_USER,
});

export const profileModel = {
  table: "profiles",
  primaryKey: "id",
  authKey: "authUserId",
  statuses: Object.values(PROFILE_STATUSES),
  roles: Object.values(PROFILE_ROLES),
};

function nowIso() {
  return new Date().toISOString();
}

export function normalizeProfile(profile = {}) {
  const createdAt = profile.createdAt || profile.created_at || nowIso();
  const metadata = {
    ...(profile.metadata || {}),
  };
  return {
    id: String(profile.id || profile.profileId || "").trim(),
    authUserId: String(profile.authUserId || profile.auth_user_id || "").trim(),
    email: String(profile.email || "").trim().toLowerCase(),
    name: String(profile.name || profile.full_name || "").trim(),
    role: profileModel.roles.includes(normalizeRole(profile.role)) ? normalizeRole(profile.role) : PROFILE_ROLES.CUSTOMER,
    status: profileModel.statuses.includes(profile.status) ? profile.status : PROFILE_STATUSES.PENDING,
    employeeNumber: String(profile.employeeNumber || profile.employee_number || metadata.employeeNumber || "").trim(),
    company: String(profile.company || metadata.company || "").trim(),
    website: String(profile.website || metadata.website || "").trim(),
    package: String(profile.package || metadata.package || "").trim(),
    customerId: String(profile.customerId || profile.customer_id || metadata.customerId || "").trim(),
    supabaseCustomerId: String(profile.supabaseCustomerId || profile.supabase_customer_id || metadata.supabaseCustomerId || "").trim(),
    environment: String(profile.environment || metadata.environment || "local").trim(),
    isDemoUser: Boolean(profile.isDemoUser || profile.is_demo || profile.isDemo || metadata.isDemoUser),
    lastLoginAt: profile.lastLoginAt || profile.last_login_at || metadata.lastLoginAt || "",
    createdBy: String(profile.createdBy || profile.created_by || metadata.createdBy || "").trim(),
    createdAt,
    updatedAt: profile.updatedAt || profile.updated_at || createdAt,
    metadata,
  };
}
