import { CUSTOMER_DATA_MODES } from "../config/environment.js";
import { ROLES } from "../config/roles.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { PROFILE_STATUSES, normalizeProfile, profileModel } from "../models/Profile.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { logActivity } from "../services/activityLogService.js";

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeArray(key, value) {
  localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = "profile") {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function withId(profile = {}) {
  const normalized = normalizeProfile(profile);
  return {
    ...normalized,
    id: normalized.id || createId("profile"),
    updatedAt: nowIso(),
    createdAt: normalized.createdAt || nowIso(),
  };
}

function readLocalProfiles() {
  return readArray(STORAGE_KEYS.profiles).map(normalizeProfile);
}

function writeLocalProfiles(profiles = []) {
  writeArray(STORAGE_KEYS.profiles, profiles.map(normalizeProfile));
}

function findById(id) {
  return readLocalProfiles().find((profile) => String(profile.id) === String(id)) || null;
}

export function mapLocalProfileToSupabase(profile = {}) {
  const normalized = normalizeProfile(profile);
  return {
    auth_user_id: normalized.authUserId || null,
    email: normalized.email || null,
    name: normalized.name || null,
    role: normalized.role || ROLES.CUSTOMER,
    status: normalized.status || PROFILE_STATUSES.PENDING,
    is_demo: normalized.isDemoUser,
    environment: normalized.environment || "local",
    metadata: {
      ...(normalized.metadata || {}),
      localProfileId: normalized.id,
      customerId: normalized.customerId || "",
      supabaseCustomerId: normalized.supabaseCustomerId || "",
      lastLoginAt: normalized.lastLoginAt || "",
    },
    updated_at: nowIso(),
    created_at: normalized.createdAt || nowIso(),
  };
}

export function mapSupabaseProfileToLocal(row = {}) {
  const metadata = row.metadata || {};
  return normalizeProfile({
    id: row.id,
    authUserId: row.auth_user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    isDemoUser: row.is_demo,
    environment: row.environment || metadata.environment || "supabase",
    customerId: metadata.customerId || "",
    supabaseCustomerId: metadata.supabaseCustomerId || "",
    lastLoginAt: metadata.lastLoginAt || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata,
  });
}

export function validateProfileForSupabase(profile = {}) {
  const normalized = normalizeProfile(profile);
  const errors = [];
  if (!normalized.email) errors.push("E-mailadres ontbreekt.");
  if (!profileModel.roles.includes(normalized.role)) errors.push("Rol is ongeldig.");
  if (!profileModel.statuses.includes(normalized.status)) errors.push("Status is ongeldig.");
  return { valid: errors.length === 0, errors, profile: normalized };
}

export function list() {
  return readLocalProfiles().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function get(id) {
  return findById(id);
}

export function getByAuthUserId(authUserId) {
  return readLocalProfiles().find((profile) => profile.authUserId && String(profile.authUserId) === String(authUserId)) || null;
}

export function getByEmail(email = "") {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return readLocalProfiles().find((profile) => profile.email === normalizedEmail) || null;
}

export function getByCustomerId(customerId) {
  return readLocalProfiles().filter((profile) => profile.customerId && String(profile.customerId) === String(customerId));
}

export function getBySupabaseCustomerId(supabaseCustomerId) {
  return readLocalProfiles().filter((profile) => profile.supabaseCustomerId && String(profile.supabaseCustomerId) === String(supabaseCustomerId));
}

export async function listSupabaseProfiles(options = {}) {
  const rows = await supabaseProvider.getAll("profiles", { limit: options.limit || 100 });
  return rows.map(mapSupabaseProfileToLocal);
}

export function createProfile(data = {}, options = {}) {
  const profile = withId(data);
  if (options.target === "supabase") {
    const validation = validateProfileForSupabase(profile);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    return supabaseProvider
      .createProfile(mapLocalProfileToSupabase(profile), { profileWrite: true })
      .then((result) => mapSupabaseProfileToLocal(result.data));
  }
  const profiles = readLocalProfiles();
  const withoutDuplicate = profiles.filter((item) => String(item.id) !== String(profile.id) && item.email !== profile.email);
  writeLocalProfiles([profile, ...withoutDuplicate]);
  logActivity("profile", profile.id, "profile_created", { role: profile.role, status: profile.status, customerId: profile.customerId });
  return profile;
}

export function updateProfile(id, data = {}, options = {}) {
  const existing = findById(id);
  const next = withId({ ...(existing || {}), ...data, id: existing?.id || id });
  if (options.target === "supabase") {
    return supabaseProvider
      .updateProfile(id, mapLocalProfileToSupabase(next), { profileWrite: true })
      .then((result) => mapSupabaseProfileToLocal(result.data));
  }
  const profiles = readLocalProfiles().map((profile) => String(profile.id) === String(id) ? next : profile);
  if (!profiles.some((profile) => String(profile.id) === String(id))) profiles.unshift(next);
  writeLocalProfiles(profiles);
  logActivity("profile", next.id, "profile_updated", { role: next.role, status: next.status, customerId: next.customerId });
  return next;
}

export function archiveProfile(id, options = {}) {
  const result = updateProfile(id, { status: PROFILE_STATUSES.ARCHIVED, metadata: { ...(findById(id)?.metadata || {}), archivedAt: nowIso() } }, options);
  if (result?.then) {
    return result.then((profile) => {
      logActivity("profile", id, "profile_archived", {});
      return profile;
    });
  }
  logActivity("profile", id, "profile_archived", {});
  return result;
}

export function disableProfile(id, options = {}) {
  const result = updateProfile(id, { status: PROFILE_STATUSES.DISABLED }, options);
  if (result?.then) {
    return result.then((profile) => {
      logActivity("profile", id, "profile_disabled", {});
      return profile;
    });
  }
  logActivity("profile", id, "profile_disabled", {});
  return result;
}

export function reactivateProfile(id, options = {}) {
  const result = updateProfile(id, { status: PROFILE_STATUSES.ACTIVE, metadata: { ...(findById(id)?.metadata || {}), reactivatedAt: nowIso() } }, options);
  if (result?.then) {
    return result.then((profile) => {
      logActivity("profile", id, "profile_reactivated", {});
      return profile;
    });
  }
  logActivity("profile", id, "profile_reactivated", {});
  return result;
}

export async function listByDataMode(mode = CUSTOMER_DATA_MODES.LOCAL) {
  if (mode === CUSTOMER_DATA_MODES.SUPABASE_READ) return listSupabaseProfiles();
  if (mode === CUSTOMER_DATA_MODES.HYBRID) {
    const local = list();
    try {
      const remote = await listSupabaseProfiles();
      const localEmails = new Set(local.map((profile) => profile.email).filter(Boolean));
      return [...remote, ...local.filter((profile) => !localEmails.has(profile.email))];
    } catch {
      return local;
    }
  }
  return list();
}

export const ProfileRepository = {
  list,
  get,
  getByAuthUserId,
  getByEmail,
  getByCustomerId,
  getBySupabaseCustomerId,
  createProfile,
  updateProfile,
  archiveProfile,
  disableProfile,
  reactivateProfile,
  mapLocalProfileToSupabase,
  mapSupabaseProfileToLocal,
  validateProfileForSupabase,
  listSupabaseProfiles,
  listByDataMode,
};
