import { getCurrentEnvironment } from "../config/environment.js";
import { NAVIGATION_PERMISSIONS, roleHasPermission, getPermissionsForRole } from "../config/permissions.js";
import { ROLES, getRoleDefinition, getRoleLabel } from "../config/roles.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { logActivity, listRecentActivities } from "./activityLogService.js";

const SESSION_DURATION_HOURS = 8;

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix = "auth") {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function addHours(date, hours) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next.toISOString();
}

function findDemoCustomerId() {
  const customers = [
    ...readJson(STORAGE_KEYS.crmCustomers, []),
    ...readJson(STORAGE_KEYS.customers, []),
  ];
  return customers.find((customer) => customer.isDemoJourney)?.id
    || customers.find((customer) => customer.isDemo)?.id
    || customers[0]?.id
    || "";
}

function createDemoUsers() {
  const createdAt = nowIso();
  const customerId = findDemoCustomerId();
  return [
    { id: "demo-super-admin", email: "demo-super-admin@maxwebstudio.local", name: "Demo Super Admin", role: ROLES.SUPER_ADMIN },
    { id: "demo-admin", email: "demo-admin@maxwebstudio.local", name: "Demo Admin", role: ROLES.ADMIN },
    { id: "demo-sales", email: "demo-sales@maxwebstudio.local", name: "Demo Sales", role: ROLES.SALES },
    { id: "demo-developer", email: "demo-developer@maxwebstudio.local", name: "Demo Developer", role: ROLES.DEVELOPER },
    { id: "demo-support", email: "demo-support@maxwebstudio.local", name: "Demo Support", role: ROLES.SUPPORT },
    { id: "demo-customer", email: "demo-klant@maxwebstudio.local", name: "Demo Klant", role: ROLES.CUSTOMER, customerId },
    { id: "demo-user", email: "demo-user@maxwebstudio.local", name: "Demo Gebruiker", role: ROLES.DEMO_USER, customerId },
  ].map((user) => ({
    authUserId: user.id,
    status: "active",
    isDemo: true,
    customerId: "",
    createdAt,
    updatedAt: createdAt,
    ...user,
  }));
}

export function seedDemoUsers() {
  const existingUsers = readJson(STORAGE_KEYS.authUsers, []);
  const existingById = new Map(existingUsers.map((user) => [user.id, user]));
  const demoUsers = createDemoUsers();
  const mergedUsers = [
    ...existingUsers.filter((user) => !demoUsers.some((demoUser) => demoUser.id === user.id)),
    ...demoUsers.map((demoUser) => ({ ...existingById.get(demoUser.id), ...demoUser, updatedAt: nowIso() })),
  ];
  writeJson(STORAGE_KEYS.authUsers, mergedUsers);
  logActivity("auth", "demo_users", "seed_demo_users", { count: demoUsers.length });
  return mergedUsers;
}

export function getAuthUsers() {
  return readJson(STORAGE_KEYS.authUsers, []);
}

export function getCurrentSession() {
  const session = readJson(STORAGE_KEYS.currentSession, null);
  if (!session?.userId) return null;
  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    localStorage.removeItem(STORAGE_KEYS.currentSession);
    return null;
  }
  return session;
}

export function getCurrentUser() {
  const session = getCurrentSession();
  if (!session) return null;
  return getAuthUsers().find((user) => String(user.id) === String(session.userId)) || null;
}

export function loginDemoUser(role = ROLES.DEMO_USER) {
  const users = seedDemoUsers();
  const user = users.find((item) => item.role === role) || users.find((item) => item.role === ROLES.DEMO_USER);
  const startedAt = nowIso();
  const session = {
    id: createId("session"),
    userId: user.id,
    role: user.role,
    roleLabel: getRoleLabel(user.role),
    environment: getCurrentEnvironment(),
    isDemo: true,
    provider: "demo",
    customerId: user.customerId || "",
    startedAt,
    expiresAt: addHours(startedAt, SESSION_DURATION_HOURS),
  };
  writeJson(STORAGE_KEYS.currentSession, session);
  logActivity("auth", user.id, "demo_login", { role: user.role, roleLabel: getRoleLabel(user.role) });
  return { user, session };
}

export function logout() {
  const session = getCurrentSession();
  if (session) logActivity("auth", session.userId, "logout", { role: session.role });
  localStorage.removeItem(STORAGE_KEYS.currentSession);
}

export function hasPermission(resource, action) {
  const session = getCurrentSession();
  if (!session) return false;
  return roleHasPermission(session.role, resource, action);
}

export function requirePermission(resource, action) {
  if (!hasPermission(resource, action)) {
    throw new Error(`Geen permissie voor ${resource}:${action}.`);
  }
  return true;
}

export function getVisibleNavigationItems() {
  return NAVIGATION_PERMISSIONS.filter((item) => hasPermission(item.resource, item.action));
}

export function getCurrentPermissionPreview() {
  const session = getCurrentSession();
  if (!session) return { role: "", roleLabel: "Geen sessie", permissions: {} };
  return {
    role: session.role,
    roleLabel: getRoleLabel(session.role),
    roleDescription: getRoleDefinition(session.role).description,
    permissions: getPermissionsForRole(session.role),
  };
}

export function saveAccountRequest(payload = {}) {
  const requests = readJson(STORAGE_KEYS.accountRequests, []);
  const request = {
    id: createId("account-request"),
    name: String(payload.name || payload.naam || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    company: String(payload.company || payload.bedrijf || "").trim(),
    type: String(payload.type || "klant").trim(),
    status: "nieuw",
    createdAt: nowIso(),
  };
  requests.unshift(request);
  writeJson(STORAGE_KEYS.accountRequests, requests);
  logActivity("auth", request.id, "account_request_created", { type: request.type, status: request.status });
  return request;
}

export function listAccountRequests() {
  return readJson(STORAGE_KEYS.accountRequests, []);
}

export function updateAccountRequestStatus(id, status) {
  const requests = listAccountRequests();
  const next = requests.map((request) => String(request.id) === String(id)
    ? { ...request, status, updatedAt: nowIso() }
    : request);
  writeJson(STORAGE_KEYS.accountRequests, next);
  logActivity("auth", id, "account_request_status", { status });
  return next.find((request) => String(request.id) === String(id)) || null;
}

export function deleteAccountRequest(id) {
  const requests = listAccountRequests();
  writeJson(STORAGE_KEYS.accountRequests, requests.filter((request) => String(request.id) !== String(id)));
  logActivity("auth", id, "account_request_deleted", {});
}

export function getDemoAuthStatus() {
  const users = getAuthUsers();
  const session = getCurrentSession();
  const requests = listAccountRequests();
  const recentAuth = listRecentActivities(12).find((activity) => activity.module === "auth");
  return {
    mode: "demo",
    active: true,
    demoUsers: users.length,
    accountRequests: requests.length,
    session,
    currentUser: getCurrentUser(),
    lastActivity: recentAuth || null,
  };
}

export const demoAuthProvider = {
  type: "demo",
  status: "active",
  seedDemoUsers,
  getAuthUsers,
  loginDemoUser,
  logout,
  getCurrentSession,
  getCurrentUser,
  hasPermission,
  requirePermission,
  getVisibleNavigationItems,
  getCurrentPermissionPreview,
  saveAccountRequest,
  listAccountRequests,
  updateAccountRequestStatus,
  deleteAccountRequest,
  getStatus: getDemoAuthStatus,
};
