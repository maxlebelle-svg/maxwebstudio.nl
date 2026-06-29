import { STORAGE_KEYS } from "../config/storageKeys.js";
import {
  CLIENT_PORTAL_DATA_MODES,
  getClientPortalData,
  resolveClientPortalDataMode,
} from "./clientPortalDataService.js";

const FORBIDDEN_KEY_PATTERNS = [
  /internal/i,
  /admin.*note/i,
  /^notes$/i,
  /metadata/i,
  /migration/i,
  /activity/i,
  /paymentProvider/i,
  /mandate/i,
  /^mollie/i,
  /serviceRole/i,
  /secret/i,
  /token/i,
  /session/i,
  /debug/i,
  /authUserId/i,
];

function readJson(key, fallback = null) {
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

function walk(value, path = "", findings = []) {
  if (!value || typeof value !== "object") return findings;
  Object.entries(value).forEach(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      findings.push({ path: childPath, key });
    }
    if (child && typeof child === "object") walk(child, childPath, findings);
  });
  return findings;
}

export function detectSensitiveFields(payload = {}) {
  return walk(payload);
}

export function validateClientPortalPayload(payload = {}) {
  const sensitiveFields = detectSensitiveFields(payload);
  const hasCustomer = Boolean(payload.customer);
  const modules = ["websites", "projects", "quotes", "invoices", "subscriptions", "files"];
  const moduleStatus = Object.fromEntries(modules.map((moduleName) => [moduleName, Array.isArray(payload[moduleName])]));
  return {
    valid: hasCustomer && sensitiveFields.length === 0 && Object.values(moduleStatus).every(Boolean),
    hasCustomer,
    moduleStatus,
    sensitiveFields,
    warningCount: (payload.warnings || []).length,
  };
}

export async function runClientPortalDataTest(customerId, options = {}) {
  const payload = await getClientPortalData(customerId, options);
  const validation = validateClientPortalPayload(payload);
  const result = {
    status: validation.valid ? "passed" : "warning",
    customerId: customerId || "",
    mode: payload.mode,
    validation,
    payload,
    testedAt: new Date().toISOString(),
  };
  writeJson(STORAGE_KEYS.lastClientPortalDataTest, result);
  return result;
}

export function getClientPortalReadinessSummary() {
  const settings = readJson(STORAGE_KEYS.clientPortalSettings, {}) || {};
  const lastTest = readJson(STORAGE_KEYS.lastClientPortalDataTest, null);
  const mode = resolveClientPortalDataMode({ mode: settings.clientPortalDataMode });
  return {
    clientPortalLiveData: "voorbereid",
    portalDataMode: mode,
    supabaseRead: [CLIENT_PORTAL_DATA_MODES.SUPABASE_READ, CLIENT_PORTAL_DATA_MODES.HYBRID].includes(mode) ? "voorbereid/actief" : "voorbereid",
    hybridMode: mode === CLIENT_PORTAL_DATA_MODES.HYBRID ? "actief" : "voorbereid",
    sanitizing: "actief",
    writes: "blocked",
    demoPortal: "active",
    authHardening: "Fase 13",
    lastTest,
  };
}
