import { ENVIRONMENTS, PROVIDERS, getCurrentEnvironment, getCurrentProviderType } from "../config/environment.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { normalizeWebsite, normalizeWebsiteStatus } from "../utils/websiteNormalizer.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_UPDATE_KEYS = new Set(["status", "carePackage", "notes", "lastCheckedAt"]);
const LOCAL_TO_SUPABASE_STATUS = Object.freeze({
  online: "online",
  development: "development",
  maintenance: "maintenance",
  waiting_client: "waiting_customer",
  offline: "offline",
});
const SUPABASE_TO_LOCAL_STATUS = Object.freeze({
  online: "online",
  development: "development",
  maintenance: "maintenance",
  waiting_customer: "waiting_client",
  offline: "offline",
  archived: "offline",
});

function storageAvailable() {
  return typeof localStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function readFlag(key) {
  if (!storageAvailable()) return false;
  return ["true", "1", "yes", "ja", "enabled"].includes(String(localStorage.getItem(key) || "").toLowerCase());
}

function readArray(key) {
  if (!storageAvailable()) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeArray(key, value = []) {
  if (!storageAvailable()) return value;
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function writeStatus(status = {}) {
  if (!storageAvailable()) return status;
  const payload = {
    ...status,
    checkedAt: status.checkedAt || nowIso(),
  };
  localStorage.setItem(STORAGE_KEYS.lastWebsiteOperationalWriteStatus, JSON.stringify(payload));
  return payload;
}

function cleanString(value = "", max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

function remoteWebsiteId(website = {}) {
  const id = String(website._supabaseWebsiteId || website.supabaseWebsiteId || website._supabaseId || website.id || "").trim();
  return isUuid(id) ? id : "";
}

function localWebsiteId(website = {}) {
  return String(website._localWebsiteId || website.metadata?.localStorageId || website.externalId || website.id || "").trim();
}

function blockedUpdateKeys(updates = {}) {
  return Object.keys(updates).filter((key) => !ALLOWED_UPDATE_KEYS.has(key));
}

function normalizeOperationalStatus(value = "") {
  const status = normalizeWebsiteStatus(value);
  return LOCAL_TO_SUPABASE_STATUS[status] ? status : "";
}

function saveWebsiteOperationalLocally(website = {}, updates = {}) {
  const normalized = normalizeWebsite(website);
  const localId = localWebsiteId(normalized);
  const nextWebsite = normalizeWebsite({
    ...normalized,
    status: updates.status || normalized.status,
    carePackage: updates.carePackage ?? normalized.carePackage,
    maintenancePlan: updates.carePackage ?? normalized.maintenancePlan,
    notes: updates.notes ?? normalized.notes,
    lastCheckedAt: updates.lastCheckedAt || nowIso(),
    updatedAt: nowIso(),
    metadata: {
      ...(normalized.metadata || {}),
      websiteOperationalWriteFallbackAt: nowIso(),
    },
  });
  [STORAGE_KEYS.managedSites, STORAGE_KEYS.websites].forEach((key) => {
    const records = readArray(key);
    const next = records.map((item) => String(item.id) === String(localId || normalized.id) ? nextWebsite : item);
    if (!next.some((item) => String(item.id) === String(nextWebsite.id))) next.unshift(nextWebsite);
    writeArray(key, next);
  });
  return nextWebsite;
}

function mapSupabaseRecordToLocalWebsite(record = {}, fallback = {}) {
  return normalizeWebsite({
    ...fallback,
    id: record.id || fallback.id,
    status: SUPABASE_TO_LOCAL_STATUS[record.status] || record.status || fallback.status,
    carePackage: record.care_package || fallback.carePackage,
    maintenancePlan: record.care_package || fallback.maintenancePlan,
    notes: record.notes || fallback.notes,
    lastCheckedAt: record.last_checked_at || fallback.lastCheckedAt,
    updatedAt: record.updated_at || fallback.updatedAt,
    metadata: record.metadata && typeof record.metadata === "object" ? record.metadata : fallback.metadata,
    _source: fallback._source === "hybrid" ? "hybrid" : "supabase",
    _supabaseWebsiteId: record.id || fallback._supabaseWebsiteId || fallback.supabaseWebsiteId,
    _localWebsiteId: fallback._localWebsiteId || fallback.metadata?.localStorageId || "",
  });
}

export function getWebsiteOperationalWriteReadiness() {
  const providerMode = getCurrentProviderType();
  const environment = getCurrentEnvironment();
  const browserFlag = typeof window !== "undefined" && window.__MAXWEBSTUDIO_WEBSITE_OPERATIONAL_WRITE__ === true;
  const flagEnabled = readFlag(STORAGE_KEYS.websiteOperationalWriteEnabled) || browserFlag;
  const supabaseStatus = supabaseProvider.getStatus();
  const missing = [];
  if (providerMode !== PROVIDERS.SUPABASE_WRITE_TEST) missing.push("Provider mode moet supabase-write-test zijn.");
  if (!flagEnabled) missing.push(`${STORAGE_KEYS.websiteOperationalWriteEnabled}=true ontbreekt.`);
  if (environment === ENVIRONMENTS.PRODUCTION) missing.push("Productieomgeving blokkeert website operational write MVP.");
  if (!supabaseStatus.configured) missing.push("Supabase URL/anon key ontbreekt in runtime-config.");

  const allowed = missing.length === 0;
  return {
    allowed,
    missing,
    providerMode,
    environment,
    flagEnabled,
    supabaseConfigured: Boolean(supabaseStatus.configured),
    mode: "website_operational_update_only",
    writesEnabled: allowed,
    table: "websites",
    restrictions: [
      "status/carePackage/notes/lastCheckedAt only",
      "geen create/delete/archive",
      "geen customer_id/project_id/domain/deployment updates",
      "local fallback actief",
    ],
  };
}

export function validateWebsiteOperationalWritePayload(website = {}, updates = {}) {
  const normalized = normalizeWebsite(website);
  const blocked = blockedUpdateKeys(updates);
  const status = normalizeOperationalStatus(updates.status ?? normalized.status);
  const carePackage = cleanString(updates.carePackage ?? normalized.carePackage, 120);
  const notes = cleanString(updates.notes ?? normalized.notes, 2500);
  const lastCheckedAt = updates.lastCheckedAt || nowIso();
  const errors = [];
  if (!normalized.id) errors.push("Website id ontbreekt.");
  if (blocked.length) errors.push(`Website operational write accepteert alleen status, carePackage, notes en lastCheckedAt. Geblokkeerd: ${blocked.join(", ")}.`);
  if (!status) errors.push("Websitestatus is ongeldig.");
  if (!carePackage) errors.push("Onderhoudspakket is verplicht.");
  return {
    valid: errors.length === 0,
    errors,
    website: normalized,
    updates: { status, carePackage, notes, lastCheckedAt },
  };
}

export function mapWebsiteOperationalToSupabasePayload(updates = {}, website = {}) {
  const existingMetadata = website.metadata && typeof website.metadata === "object" ? website.metadata : {};
  const checkedAt = updates.lastCheckedAt || nowIso();
  return {
    status: LOCAL_TO_SUPABASE_STATUS[updates.status],
    care_package: updates.carePackage,
    notes: updates.notes,
    last_checked_at: checkedAt,
    updated_at: nowIso(),
    metadata: {
      ...existingMetadata,
      updatedBy: "website-operational-write-mvp",
      safeToArchive: true,
      clientWritePhase: "35-2C",
      localWebsiteId: localWebsiteId(website),
      lastWebsiteOperationalWriteAt: checkedAt,
    },
  };
}

export async function saveWebsiteOperationalWithWriteFallback(website = {}, updates = {}) {
  const validation = validateWebsiteOperationalWritePayload(website, updates);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(" "));
    error.validationErrors = validation.errors;
    throw error;
  }

  const readiness = getWebsiteOperationalWriteReadiness();
  const websiteId = remoteWebsiteId(validation.website);
  if (!readiness.allowed || !websiteId) {
    const localWebsite = saveWebsiteOperationalLocally(validation.website, validation.updates);
    writeStatus({
      status: "fallback_local",
      fallbackUsed: true,
      reason: !websiteId ? "Remote website id ontbreekt of is geen UUID." : readiness.missing.join(" "),
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      websiteId: localWebsite.id,
    });
    return { website: localWebsite, fallbackUsed: true, status: "fallback_local", readiness };
  }

  try {
    const payload = mapWebsiteOperationalToSupabasePayload(validation.updates, validation.website);
    const result = await supabaseProvider.updateWebsiteOperational(websiteId, payload, { websiteWrite: true });
    const localMirror = mapSupabaseRecordToLocalWebsite(result.data, validation.website);
    writeStatus({
      status: "supabase_updated",
      fallbackUsed: false,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      websiteId: localMirror.id,
      supabaseWebsiteId: result.data?.id || "",
    });
    return { website: localMirror, fallbackUsed: false, status: "supabase_updated", readiness, result };
  } catch (error) {
    const localWebsite = saveWebsiteOperationalLocally(validation.website, validation.updates);
    writeStatus({
      status: "fallback_after_supabase_error",
      fallbackUsed: true,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      websiteId: localWebsite.id,
      error: error.message || "Supabase website operational write is mislukt.",
    });
    return { website: localWebsite, fallbackUsed: true, status: "fallback_after_supabase_error", readiness, error };
  }
}
