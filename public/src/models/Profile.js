import { ROLES } from "../config/roles.js";

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
  SALES: ROLES.SALES,
  DEVELOPER: ROLES.DEVELOPER,
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
    role: profileModel.roles.includes(profile.role) ? profile.role : PROFILE_ROLES.CUSTOMER,
    status: profileModel.statuses.includes(profile.status) ? profile.status : PROFILE_STATUSES.PENDING,
    customerId: String(profile.customerId || profile.customer_id || metadata.customerId || "").trim(),
    supabaseCustomerId: String(profile.supabaseCustomerId || profile.supabase_customer_id || metadata.supabaseCustomerId || "").trim(),
    environment: String(profile.environment || metadata.environment || "local").trim(),
    isDemoUser: Boolean(profile.isDemoUser || profile.is_demo || profile.isDemo || metadata.isDemoUser),
    lastLoginAt: profile.lastLoginAt || profile.last_login_at || metadata.lastLoginAt || "",
    createdAt,
    updatedAt: profile.updatedAt || profile.updated_at || createdAt,
    metadata,
  };
}

