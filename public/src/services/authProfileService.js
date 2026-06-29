import { roleHasPermission } from "../config/permissions.js";
import { ROLES } from "../config/roles.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { PROFILE_STATUSES, normalizeProfile } from "../models/Profile.js";
import { CustomerRepository } from "../repositories/CustomerRepository.js";
import { ProfileRepository } from "../repositories/ProfileRepository.js";
import { getAuthStatus, getAuthUsers, getCurrentSession, getCurrentUser, listAccountRequests, updateAccountRequestStatus } from "./authService.js";
import { logActivity } from "./activityLogService.js";

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function roleFromRequestType(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("medewerker")) return ROLES.SUPPORT;
  if (normalized.includes("developer")) return ROLES.DEVELOPER;
  if (normalized.includes("sales")) return ROLES.SALES;
  return ROLES.CUSTOMER;
}

function findCustomerForEmail(email = "") {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  return CustomerRepository.list().find((customer) => String(customer.email || "").trim().toLowerCase() === normalizedEmail) || null;
}

export function syncDemoUserToProfile(demoUser = {}) {
  if (!demoUser?.id && !demoUser?.authUserId) return null;
  const authUserId = demoUser.authUserId || demoUser.id;
  const existing = ProfileRepository.getByAuthUserId(authUserId) || ProfileRepository.getByEmail(demoUser.email);
  const payload = normalizeProfile({
    ...(existing || {}),
    id: existing?.id || `profile-${authUserId}`,
    authUserId,
    email: demoUser.email,
    name: demoUser.name,
    role: demoUser.role || ROLES.DEMO_USER,
    status: PROFILE_STATUSES.ACTIVE,
    customerId: demoUser.customerId || existing?.customerId || "",
    environment: "demo",
    isDemoUser: true,
    lastLoginAt: nowIso(),
    metadata: {
      ...(existing?.metadata || {}),
      source: "demoAuthProvider",
      demoUserId: demoUser.id || "",
    },
  });
  return existing
    ? ProfileRepository.updateProfile(existing.id, payload)
    : ProfileRepository.createProfile(payload);
}

export function resolveProfileForSession(session = getCurrentSession()) {
  if (!session?.userId) {
    logActivity("profile", "session", "auth_profile_warning", { reason: "no_session" });
    return null;
  }
  const currentUser = getCurrentUser();
  const profile = ProfileRepository.getByAuthUserId(session.userId)
    || ProfileRepository.getByEmail(currentUser?.email || "");
  if (profile) {
    logActivity("profile", profile.id, "session_profile_resolved", { role: profile.role, source: "profile_repository" });
    return profile;
  }
  if (currentUser?.isDemo || session.isDemo) {
    const synced = syncDemoUserToProfile(currentUser);
    logActivity("profile", synced?.id || session.userId, "session_profile_resolved", { role: synced?.role || session.role, source: "demo_sync" });
    return synced;
  }
  logActivity("profile", session.userId, "auth_profile_warning", { reason: "profile_not_found" });
  return null;
}

export function getCurrentProfile() {
  return resolveProfileForSession(getCurrentSession());
}

export function prepareProfileFromAccountRequest(accountRequest = {}) {
  const existing = ProfileRepository.getByEmail(accountRequest.email);
  const linkedCustomer = findCustomerForEmail(accountRequest.email);
  const payload = normalizeProfile({
    ...(existing || {}),
    id: existing?.id || `profile-request-${accountRequest.id}`,
    email: accountRequest.email,
    name: accountRequest.name,
    role: roleFromRequestType(accountRequest.type),
    status: PROFILE_STATUSES.PENDING,
    customerId: linkedCustomer?.id || existing?.customerId || "",
    supabaseCustomerId: linkedCustomer?.supabaseCustomerId || linkedCustomer?._supabaseCustomerId || existing?.supabaseCustomerId || "",
    environment: "local",
    isDemoUser: false,
    metadata: {
      ...(existing?.metadata || {}),
      accountRequestId: accountRequest.id,
      accountRequestType: accountRequest.type || "klant",
      company: accountRequest.company || "",
      preparedForSupabaseAuth: true,
    },
  });
  const saved = existing
    ? ProfileRepository.updateProfile(existing.id, payload)
    : ProfileRepository.createProfile(payload);
  updateAccountRequestStatus(accountRequest.id, "profile_prepared");
  logActivity("profile", saved.id, "account_request_profile_prepared", { accountRequestId: accountRequest.id, customerId: saved.customerId });
  return saved;
}

export function linkProfileToCustomer(profileId, customerId, options = {}) {
  const profile = ProfileRepository.get(profileId);
  if (!profile) throw new Error("Profile niet gevonden.");
  const updated = ProfileRepository.updateProfile(profileId, {
    customerId,
    supabaseCustomerId: options.supabaseCustomerId || profile.supabaseCustomerId || "",
    metadata: {
      ...(profile.metadata || {}),
      linkedCustomerAt: nowIso(),
    },
  });
  logActivity("profile", profileId, "profile_linked_to_customer", { customerId, supabaseCustomerId: options.supabaseCustomerId || "" });
  return updated;
}

export function linkProfileToSupabaseCustomer(profileId, supabaseCustomerId, options = {}) {
  const profile = ProfileRepository.get(profileId);
  if (!profile) throw new Error("Profile niet gevonden.");
  const updated = ProfileRepository.updateProfile(profileId, {
    supabaseCustomerId,
    customerId: options.customerId || profile.customerId || "",
    metadata: {
      ...(profile.metadata || {}),
      linkedSupabaseCustomerAt: nowIso(),
    },
  });
  logActivity("profile", profileId, "profile_linked_to_customer", { customerId: options.customerId || "", supabaseCustomerId });
  return updated;
}

export function validateProfileAccess(profile = {}, resource = "", action = "") {
  const normalized = normalizeProfile(profile);
  return {
    allowed: roleHasPermission(normalized.role, resource, action),
    role: normalized.role,
    status: normalized.status,
    productionBlocking: false,
    reason: "Preview only; harde route guards volgen in Fase 13.2.",
  };
}

export function getProfileReadinessSummary() {
  const profiles = ProfileRepository.list();
  const requests = listAccountRequests();
  const authUsers = getAuthUsers();
  const authStatus = getAuthStatus();
  const session = getCurrentSession();
  const currentProfile = resolveProfileForSession(session);
  const linkedProfiles = profiles.filter((profile) => profile.customerId || profile.supabaseCustomerId);
  const summary = {
    demoUsers: authUsers.filter((user) => user.isDemo || String(user.email || "").includes("@maxwebstudio.local")).length,
    accountRequests: requests.length,
    preparedProfiles: profiles.filter((profile) => profile.metadata?.preparedForSupabaseAuth || profile.status === PROFILE_STATUSES.PENDING).length,
    profilesTableStatus: "voorbereid",
    supabaseAuthProviderStatus: authStatus.supabaseAuthActive ? "actief" : "nog niet actief",
    rolesConfigStatus: "gereed",
    permissionsConfigStatus: "gereed",
    sessionProfileMappingStatus: currentProfile ? "voorbereid" : "geen actieve mapping",
    customerProfileLinkStatus: linkedProfiles.length ? `${linkedProfiles.length} koppeling(en)` : "voorbereid, nog geen koppelingen",
    profileCount: profiles.length,
    currentProfile,
    hardRouteGuards: "Fase 13.2",
    rlsHardening: "Fase 13.2/13.3",
  };
  writeJson(STORAGE_KEYS.lastProfileReadinessTest, { ...summary, testedAt: nowIso(), currentProfile: currentProfile?.id || "" });
  return summary;
}

export function prepareProfilesFromAccountRequests() {
  return listAccountRequests()
    .filter((request) => !["rejected"].includes(request.status))
    .map((request) => prepareProfileFromAccountRequest(request));
}

export const authProfileService = {
  getCurrentProfile,
  resolveProfileForSession,
  syncDemoUserToProfile,
  prepareProfileFromAccountRequest,
  linkProfileToCustomer,
  linkProfileToSupabaseCustomer,
  validateProfileAccess,
  getProfileReadinessSummary,
  prepareProfilesFromAccountRequests,
  readProfiles: () => readArray(STORAGE_KEYS.profiles),
};

