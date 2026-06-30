import { ENVIRONMENTS, PROVIDERS, getCurrentEnvironment, getCurrentProviderType } from "../config/environment.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function storageAvailable() {
  return typeof localStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = "client-portal-message") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  localStorage.setItem(STORAGE_KEYS.lastClientPortalMessageWriteStatus, JSON.stringify(payload));
  return payload;
}

function cleanString(value = "", max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

function keepUuid(value) {
  return isUuid(value) ? String(value) : null;
}

function customerIdentity(customer = {}) {
  return {
    id: String(customer._supabaseId || customer.supabaseCustomerId || customer.id || "").trim(),
    localId: String(customer._localId || customer.localCustomerId || customer.id || "").trim(),
    name: cleanString(customer.name, 160),
    company: cleanString(customer.company, 160),
    email: cleanString(customer.email, 180),
  };
}

export function getClientPortalMessageWriteReadiness() {
  const providerMode = getCurrentProviderType();
  const environment = getCurrentEnvironment();
  const browserFlag = typeof window !== "undefined" && window.__MAXWEBSTUDIO_CLIENT_PORTAL_MESSAGE_WRITE__ === true;
  const flagEnabled = readFlag(STORAGE_KEYS.clientPortalMessageWriteEnabled) || browserFlag;
  const supabaseStatus = supabaseProvider.getStatus();
  const missing = [];
  if (providerMode !== PROVIDERS.SUPABASE_WRITE_TEST) missing.push("Provider mode moet supabase-write-test zijn.");
  if (!flagEnabled) missing.push(`${STORAGE_KEYS.clientPortalMessageWriteEnabled}=true ontbreekt.`);
  if (environment === ENVIRONMENTS.PRODUCTION) missing.push("Productieomgeving blokkeert client portal message write MVP.");
  if (!supabaseStatus.configured) missing.push("Supabase URL/anon key ontbreekt in runtime-config.");

  const allowed = missing.length === 0;
  return {
    allowed,
    missing,
    providerMode,
    environment,
    flagEnabled,
    supabaseConfigured: Boolean(supabaseStatus.configured),
    mode: "client_portal_messages_create_only",
    writesEnabled: allowed,
    table: "client_portal_messages",
    restrictions: [
      "customer create-only",
      "geen update/delete",
      "sender_type blijft customer",
      "sender_profile_id wordt door provider vergrendeld",
      "local fallback actief",
    ],
  };
}

export function validateClientPortalMessageWritePayload(input = {}, context = {}) {
  const customer = customerIdentity(context.customer || {});
  const subject = cleanString(input.subject, 180);
  const body = cleanString(input.body, 2500);
  const errors = [];
  if (!customer.id && !customer.localId) errors.push("Klantcontext ontbreekt.");
  if (!subject || subject.length < 3) errors.push("Onderwerp is verplicht en moet minimaal 3 tekens bevatten.");
  if (!body || body.length < 5) errors.push("Bericht is verplicht en moet minimaal 5 tekens bevatten.");
  return {
    valid: errors.length === 0,
    errors,
    message: {
      id: createId(),
      customerId: customer.id || customer.localId,
      subject,
      title: subject,
      body,
      message: body,
      sender: "Klant",
      senderType: "customer",
      status: "open",
      source: "client_portal",
      isDemo: false,
      environment: "test",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    customer,
  };
}

function saveClientPortalMessageLocally(message = {}) {
  const normalized = {
    ...message,
    id: message.id || createId(),
    status: "open",
    source: message.source || "client_portal_local_fallback",
    createdAt: message.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  const records = readArray(STORAGE_KEYS.clientPortalMessages);
  const next = [normalized, ...records.filter((item) => String(item.id) !== String(normalized.id))];
  writeArray(STORAGE_KEYS.clientPortalMessages, next);
  return normalized;
}

export function mapClientPortalMessageToSupabasePayload(message = {}, customer = {}) {
  return {
    customer_id: keepUuid(customer.id),
    subject: message.subject,
    body: message.body,
    sender_type: "customer",
    status: "open",
    read_at: null,
    is_demo: false,
    environment: "test",
    metadata: {
      createdBy: "client-portal-message-write-mvp",
      safeToArchive: true,
      localMessageId: message.id,
      clientWritePhase: "35D",
    },
  };
}

function mapSupabaseRecordToLocalMessage(record = {}, fallback = {}) {
  return {
    ...fallback,
    id: record.id || fallback.id,
    customerId: record.customer_id || fallback.customerId,
    profileId: record.profile_id || fallback.profileId,
    senderProfileId: record.sender_profile_id || fallback.senderProfileId,
    senderType: record.sender_type || "customer",
    sender: record.sender_type === "customer" ? "Klant" : fallback.sender || "Max Webstudio",
    subject: record.subject || fallback.subject,
    title: record.subject || fallback.title,
    body: record.body || fallback.body,
    message: record.body || fallback.message,
    status: record.status || "open",
    readAt: record.read_at || fallback.readAt,
    source: "supabase_client_portal_message_write_mvp",
    createdAt: record.created_at || fallback.createdAt,
    updatedAt: record.updated_at || fallback.updatedAt,
    _source: "supabase",
    _supabaseId: record.id || "",
  };
}

export async function saveClientPortalMessageWithWriteFallback(input = {}, context = {}) {
  const validation = validateClientPortalMessageWritePayload(input, context);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(" "));
    error.validationErrors = validation.errors;
    throw error;
  }

  const readiness = getClientPortalMessageWriteReadiness();
  if (!readiness.allowed || !isUuid(validation.customer.id)) {
    const localMessage = saveClientPortalMessageLocally(validation.message);
    writeStatus({
      status: "fallback_local",
      fallbackUsed: true,
      reason: !isUuid(validation.customer.id) ? "Remote customer id ontbreekt of is geen UUID." : readiness.missing.join(" "),
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      messageId: localMessage.id,
    });
    return { message: localMessage, fallbackUsed: true, status: "fallback_local", readiness };
  }

  try {
    const payload = mapClientPortalMessageToSupabasePayload(validation.message, validation.customer);
    const result = await supabaseProvider.createClientPortalMessage(payload, { clientPortalMessageWrite: true });
    const localMirror = saveClientPortalMessageLocally(mapSupabaseRecordToLocalMessage(result.data, validation.message));
    writeStatus({
      status: "supabase_created",
      fallbackUsed: false,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      messageId: localMirror.id,
      supabaseMessageId: result.data?.id || "",
    });
    return { message: localMirror, fallbackUsed: false, status: "supabase_created", readiness, result };
  } catch (error) {
    const localMessage = saveClientPortalMessageLocally(validation.message);
    writeStatus({
      status: "fallback_after_supabase_error",
      fallbackUsed: true,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      messageId: localMessage.id,
      error: error.message || "Supabase client portal message write is mislukt.",
    });
    return { message: localMessage, fallbackUsed: true, status: "fallback_after_supabase_error", readiness, error };
  }
}
