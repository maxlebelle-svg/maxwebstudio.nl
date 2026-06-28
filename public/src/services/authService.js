import { ROLES, getRoleDefinition, getRoleLabel } from "../config/roles.js";
import {
  getAuthMode as getFactoryAuthMode,
  getAuthStatus as getFactoryAuthStatus,
  getEmailAuthProvider,
  getSessionAuthProvider,
} from "./authProviderFactory.js";

const demoProvider = () => getSessionAuthProvider();
const emailProvider = () => getEmailAuthProvider();

export function seedDemoUsers() {
  return demoProvider().seedDemoUsers();
}

export function getAuthUsers() {
  return demoProvider().getAuthUsers();
}

export function getCurrentSession() {
  return demoProvider().getCurrentSession();
}

export function getCurrentUser() {
  return demoProvider().getCurrentUser();
}

export function loginDemoUser(role = ROLES.DEMO_USER) {
  return demoProvider().loginDemoUser(role);
}

export function logout() {
  return demoProvider().logout();
}

export function isAuthenticated() {
  return Boolean(getCurrentSession());
}

export function isDemoSession() {
  return Boolean(getCurrentSession()?.isDemo);
}

export function hasPermission(resource, action) {
  return demoProvider().hasPermission(resource, action);
}

export function requirePermission(resource, action) {
  return demoProvider().requirePermission(resource, action);
}

export function getVisibleNavigationItems() {
  return demoProvider().getVisibleNavigationItems();
}

export function getCurrentPermissionPreview() {
  return demoProvider().getCurrentPermissionPreview();
}

export function getLoginRedirectForRole(role, customerId = "") {
  if (role === ROLES.CUSTOMER) {
    return customerId ? `/klantportaal.html?customerId=${encodeURIComponent(customerId)}` : "/klantportaal.html";
  }
  if (role === ROLES.DEMO_USER) return "/demo-klantreis.html";
  return "/admin-dashboard.html";
}

export async function signInWithEmail(email, password) {
  return emailProvider().signInWithEmail(email, password);
}

export async function signUpWithEmail(email, password, metadata = {}) {
  return emailProvider().signUpWithEmail(email, password, metadata);
}

export async function resetPassword(email) {
  return emailProvider().resetPassword(email);
}

export async function updatePassword(newPassword) {
  return emailProvider().updatePassword(newPassword);
}

export function getAuthMode() {
  return getFactoryAuthMode();
}

export function getAuthStatus() {
  return getFactoryAuthStatus();
}

export function saveAccountRequest(payload = {}) {
  return demoProvider().saveAccountRequest(payload);
}

export function listAccountRequests() {
  return demoProvider().listAccountRequests();
}

export function updateAccountRequestStatus(id, status) {
  return demoProvider().updateAccountRequestStatus(id, status);
}

export function deleteAccountRequest(id) {
  return demoProvider().deleteAccountRequest(id);
}

export { ROLES, getRoleLabel, getRoleDefinition };
