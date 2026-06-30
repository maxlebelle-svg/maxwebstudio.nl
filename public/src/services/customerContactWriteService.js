import { ENVIRONMENTS, PROVIDERS, getCurrentEnvironment, getCurrentProviderType } from "../config/environment.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { normalizeCustomer } from "../utils/customerNormalizer.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_UPDATE_KEYS = new Set(["name", "email", "phone", "notes"]);

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
  localStorage.setItem(STORAGE_KEYS.lastCustomerContactWriteStatus, JSON.stringify(payload));
  return payload;
}

function cleanString(value = "", max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function cleanEmail(value = "") {
  return cleanString(value, 180).toLowerCase();
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

function remoteCustomerId(customer = {}) {
  const id = String(customer._supabaseCustomerId || customer.supabaseCustomerId || customer._supabaseId || customer.id || "").trim();
  return isUuid(id) ? id : "";
}

function localCustomerId(customer = {}) {
  return String(customer._localCustomerId || customer.metadata?.localStorageId || customer.externalId || customer.id || "").trim();
}

function blockedUpdateKeys(updates = {}) {
  return Object.keys(updates).filter((key) => !ALLOWED_UPDATE_KEYS.has(key));
}

function saveCustomerContactLocally(customer = {}, updates = {}) {
  const normalized = normalizeCustomer(customer);
  const localId = localCustomerId(normalized);
  const nextCustomer = normalizeCustomer({
    ...normalized,
    name: updates.name ?? normalized.name,
    email: updates.email ?? normalized.email,
    phone: updates.phone ?? normalized.phone,
    notes: updates.notes ?? normalized.notes,
    updatedAt: nowIso(),
    metadata: {
      ...(normalized.metadata || {}),
      customerContactWriteFallbackAt: nowIso(),
    },
  });
  [STORAGE_KEYS.crmCustomers, STORAGE_KEYS.customers].forEach((key) => {
    const records = readArray(key);
    const next = records.map((item) => String(item.id) === String(localId || normalized.id) ? nextCustomer : item);
    if (!next.some((item) => String(item.id) === String(nextCustomer.id))) next.unshift(nextCustomer);
    writeArray(key, next);
  });
  return nextCustomer;
}

function mapSupabaseRecordToLocalCustomer(record = {}, fallback = {}) {
  return normalizeCustomer({
    ...fallback,
    id: record.id || fallback.id,
    name: record.name || fallback.name,
    email: record.email || fallback.email,
    phone: record.phone || fallback.phone,
    notes: record.notes || fallback.notes,
    updatedAt: record.updated_at || fallback.updatedAt,
    metadata: record.metadata && typeof record.metadata === "object" ? record.metadata : fallback.metadata,
    _source: fallback._source === "hybrid" ? "hybrid" : "supabase",
    _supabaseCustomerId: record.id || fallback._supabaseCustomerId || fallback.supabaseCustomerId,
    _localCustomerId: fallback._localCustomerId || fallback.metadata?.localStorageId || "",
  });
}

export function getCustomerContactWriteReadiness() {
  const providerMode = getCurrentProviderType();
  const environment = getCurrentEnvironment();
  const browserFlag = typeof window !== "undefined" && window.__MAXWEBSTUDIO_CUSTOMER_CONTACT_WRITE__ === true;
  const flagEnabled = readFlag(STORAGE_KEYS.customerContactWriteEnabled) || browserFlag;
  const supabaseStatus = supabaseProvider.getStatus();
  const missing = [];
  if (providerMode !== PROVIDERS.SUPABASE_WRITE_TEST) missing.push("Provider mode moet supabase-write-test zijn.");
  if (!flagEnabled) missing.push(`${STORAGE_KEYS.customerContactWriteEnabled}=true ontbreekt.`);
  if (environment === ENVIRONMENTS.PRODUCTION) missing.push("Productieomgeving blokkeert customer contact write MVP.");
  if (!supabaseStatus.configured) missing.push("Supabase URL/anon key ontbreekt in runtime-config.");

  const allowed = missing.length === 0;
  return {
    allowed,
    missing,
    providerMode,
    environment,
    flagEnabled,
    supabaseConfigured: Boolean(supabaseStatus.configured),
    mode: "customer_contact_update_only",
    writesEnabled: allowed,
    table: "customers",
    restrictions: [
      "name/email/phone/notes only",
      "geen create/delete/archive",
      "geen auth/profile/status/ownership updates",
      "local fallback actief",
    ],
  };
}

export function validateCustomerContactWritePayload(customer = {}, updates = {}) {
  const normalized = normalizeCustomer(customer);
  const blocked = blockedUpdateKeys(updates);
  const name = cleanString(updates.name ?? normalized.name, 160);
  const email = cleanEmail(updates.email ?? normalized.email);
  const phone = cleanString(updates.phone ?? normalized.phone, 80);
  const notes = cleanString(updates.notes ?? normalized.notes, 2500);
  const errors = [];
  if (!normalized.id) errors.push("Customer id ontbreekt.");
  if (blocked.length) errors.push(`Customer contact write accepteert alleen name, email, phone en notes. Geblokkeerd: ${blocked.join(", ")}.`);
  if (!name && !email && !phone) errors.push("Minimaal naam, e-mail of telefoon is verplicht.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("E-mailadres is ongeldig.");
  return {
    valid: errors.length === 0,
    errors,
    customer: normalized,
    updates: { name, email, phone, notes },
  };
}

export function mapCustomerContactToSupabasePayload(updates = {}, customer = {}) {
  const existingMetadata = customer.metadata && typeof customer.metadata === "object" ? customer.metadata : {};
  return {
    name: updates.name,
    email: updates.email,
    phone: updates.phone,
    notes: updates.notes,
    updated_at: nowIso(),
    metadata: {
      ...existingMetadata,
      updatedBy: "customer-contact-write-mvp",
      safeToArchive: true,
      clientWritePhase: "35-2B",
      localCustomerId: localCustomerId(customer),
      lastCustomerContactWriteAt: nowIso(),
    },
  };
}

export async function saveCustomerContactWithWriteFallback(customer = {}, updates = {}) {
  const validation = validateCustomerContactWritePayload(customer, updates);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(" "));
    error.validationErrors = validation.errors;
    throw error;
  }

  const readiness = getCustomerContactWriteReadiness();
  const customerId = remoteCustomerId(validation.customer);
  if (!readiness.allowed || !customerId) {
    const localCustomer = saveCustomerContactLocally(validation.customer, validation.updates);
    writeStatus({
      status: "fallback_local",
      fallbackUsed: true,
      reason: !customerId ? "Remote customer id ontbreekt of is geen UUID." : readiness.missing.join(" "),
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      customerId: localCustomer.id,
    });
    return { customer: localCustomer, fallbackUsed: true, status: "fallback_local", readiness };
  }

  try {
    const payload = mapCustomerContactToSupabasePayload(validation.updates, validation.customer);
    const result = await supabaseProvider.updateCustomerContact(customerId, payload, { customerWrite: true });
    const localMirror = mapSupabaseRecordToLocalCustomer(result.data, validation.customer);
    writeStatus({
      status: "supabase_updated",
      fallbackUsed: false,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      customerId: localMirror.id,
      supabaseCustomerId: result.data?.id || "",
    });
    return { customer: localMirror, fallbackUsed: false, status: "supabase_updated", readiness, result };
  } catch (error) {
    const localCustomer = saveCustomerContactLocally(validation.customer, validation.updates);
    writeStatus({
      status: "fallback_after_supabase_error",
      fallbackUsed: true,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      customerId: localCustomer.id,
      error: error.message || "Supabase customer contact write is mislukt.",
    });
    return { customer: localCustomer, fallbackUsed: true, status: "fallback_after_supabase_error", readiness, error };
  }
}
