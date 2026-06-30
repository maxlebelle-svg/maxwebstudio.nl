import { ENVIRONMENTS, PROVIDERS, getCurrentEnvironment, getCurrentProviderType } from "../config/environment.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const CATEGORIES = new Set(["content", "design", "technical", "seo", "other"]);

function storageAvailable() {
  return typeof localStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = "change-request") {
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
  localStorage.setItem(STORAGE_KEYS.lastChangeRequestWriteStatus, JSON.stringify(payload));
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

function sourceId(record = {}) {
  return String(record._supabaseId || record.supabaseId || record.id || "").trim();
}

function valueSet(records = []) {
  return new Set(records.map(sourceId).filter(Boolean));
}

function selectedRelationId(value = "", allowed = new Set()) {
  const id = String(value || "").trim();
  if (!id || !allowed.has(id)) return "";
  return id;
}

function normalizeCategory(value = "") {
  const category = cleanString(value, 40).toLowerCase();
  return CATEGORIES.has(category) ? category : "other";
}

function normalizePriority(value = "") {
  const priority = cleanString(value, 30).toLowerCase();
  return PRIORITIES.has(priority) ? priority : "normal";
}

function customerIdentity(customer = {}) {
  return {
    id: String(customer._supabaseId || customer.supabaseCustomerId || customer.id || "").trim(),
    localId: String(customer._localId || customer.localCustomerId || customer.id || "").trim(),
    name: cleanString(customer.name, 160),
    company: cleanString(customer.company, 160),
    email: cleanString(customer.email, 180),
    phone: cleanString(customer.phone, 80),
  };
}

export function getChangeRequestWriteReadiness() {
  const providerMode = getCurrentProviderType();
  const environment = getCurrentEnvironment();
  const browserFlag = typeof window !== "undefined" && window.__MAXWEBSTUDIO_CHANGE_REQUEST_WRITE__ === true;
  const flagEnabled = readFlag(STORAGE_KEYS.changeRequestWriteEnabled) || browserFlag;
  const supabaseStatus = supabaseProvider.getStatus();
  const missing = [];
  if (providerMode !== PROVIDERS.SUPABASE_WRITE_TEST) missing.push("Provider mode moet supabase-write-test zijn.");
  if (!flagEnabled) missing.push(`${STORAGE_KEYS.changeRequestWriteEnabled}=true ontbreekt.`);
  if (environment === ENVIRONMENTS.PRODUCTION) missing.push("Productieomgeving blokkeert change request write MVP.");
  if (!supabaseStatus.configured) missing.push("Supabase URL/anon key ontbreekt in runtime-config.");

  const allowed = missing.length === 0;
  return {
    allowed,
    missing,
    providerMode,
    environment,
    flagEnabled,
    supabaseConfigured: Boolean(supabaseStatus.configured),
    mode: "change_requests_create_only",
    writesEnabled: allowed,
    table: "change_requests",
    restrictions: [
      "customer create-only",
      "geen update/delete",
      "status blijft nieuw",
      "auth_user_id wordt door provider vergrendeld",
      "local fallback actief",
    ],
  };
}

export function validateChangeRequestWritePayload(input = {}, context = {}) {
  const customer = customerIdentity(context.customer || {});
  const websiteIds = valueSet(context.websites || []);
  const projectIds = valueSet(context.projects || []);
  const title = cleanString(input.title, 160);
  const description = cleanString(input.description, 2500);
  const category = normalizeCategory(input.category);
  const priority = normalizePriority(input.priority);
  const websiteId = selectedRelationId(input.websiteId, websiteIds);
  const projectId = selectedRelationId(input.projectId, projectIds);
  const errors = [];

  if (!customer.id && !customer.localId) errors.push("Klantcontext ontbreekt.");
  if (!title || title.length < 3) errors.push("Titel is verplicht en moet minimaal 3 tekens bevatten.");
  if (!description || description.length < 5) errors.push("Omschrijving is verplicht en moet minimaal 5 tekens bevatten.");
  if (cleanString(input.websiteId) && !websiteId) errors.push("Geselecteerde website hoort niet bij deze klant.");
  if (cleanString(input.projectId) && !projectId) errors.push("Geselecteerd project hoort niet bij deze klant.");

  return {
    valid: errors.length === 0,
    errors,
    request: {
      id: createId(),
      customerId: customer.id || customer.localId,
      websiteId,
      projectId,
      name: customer.name,
      company: customer.company,
      email: customer.email,
      phone: customer.phone,
      title,
      description,
      category,
      priority,
      status: "nieuw",
      files: [],
      source: "client_portal",
      isDemo: false,
      environment: "test",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    customer,
  };
}

function saveChangeRequestLocally(request = {}) {
  const normalized = {
    ...request,
    id: request.id || createId(),
    status: "nieuw",
    source: request.source || "client_portal_local_fallback",
    createdAt: request.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  const records = readArray(STORAGE_KEYS.changeRequests);
  const next = [normalized, ...records.filter((item) => String(item.id) !== String(normalized.id))];
  writeArray(STORAGE_KEYS.changeRequests, next);
  return normalized;
}

export function mapChangeRequestToSupabasePayload(request = {}, customer = {}) {
  return {
    customer_id: keepUuid(customer.id),
    website_id: keepUuid(request.websiteId),
    project_id: keepUuid(request.projectId),
    name: request.name || null,
    company: request.company || null,
    email: request.email || null,
    phone: request.phone || null,
    title: request.title,
    description: request.description,
    category: request.category || "other",
    priority: request.priority || "normal",
    status: "nieuw",
    files: [],
    source: "client_portal",
    is_demo: false,
    environment: "test",
    metadata: {
      createdBy: "change-request-write-mvp",
      safeToArchive: true,
      localChangeRequestId: request.id,
      clientWritePhase: "35C",
    },
  };
}

function mapSupabaseRecordToLocalChangeRequest(record = {}, fallback = {}) {
  return {
    ...fallback,
    id: record.id || fallback.id,
    customerId: record.customer_id || fallback.customerId,
    websiteId: record.website_id || fallback.websiteId,
    projectId: record.project_id || fallback.projectId,
    name: record.name || fallback.name,
    company: record.company || fallback.company,
    email: record.email || fallback.email,
    phone: record.phone || fallback.phone,
    title: record.title || fallback.title,
    description: record.description || fallback.description,
    category: record.category || fallback.category,
    priority: record.priority || fallback.priority,
    status: record.status || "nieuw",
    files: Array.isArray(record.files) ? record.files : [],
    source: "supabase_change_request_write_mvp",
    createdAt: record.created_at || fallback.createdAt,
    updatedAt: record.updated_at || fallback.updatedAt,
    _source: "supabase",
    _supabaseId: record.id || "",
  };
}

export async function saveChangeRequestWithWriteFallback(input = {}, context = {}) {
  const validation = validateChangeRequestWritePayload(input, context);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(" "));
    error.validationErrors = validation.errors;
    throw error;
  }

  const readiness = getChangeRequestWriteReadiness();
  if (!readiness.allowed || !isUuid(validation.customer.id)) {
    const localRequest = saveChangeRequestLocally(validation.request);
    writeStatus({
      status: "fallback_local",
      fallbackUsed: true,
      reason: !isUuid(validation.customer.id) ? "Remote customer id ontbreekt of is geen UUID." : readiness.missing.join(" "),
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      changeRequestId: localRequest.id,
    });
    return { request: localRequest, fallbackUsed: true, status: "fallback_local", readiness };
  }

  try {
    const payload = mapChangeRequestToSupabasePayload(validation.request, validation.customer);
    const result = await supabaseProvider.createChangeRequest(payload, { changeRequestWrite: true });
    const localMirror = saveChangeRequestLocally(mapSupabaseRecordToLocalChangeRequest(result.data, validation.request));
    writeStatus({
      status: "supabase_created",
      fallbackUsed: false,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      changeRequestId: localMirror.id,
      supabaseChangeRequestId: result.data?.id || "",
    });
    return { request: localMirror, fallbackUsed: false, status: "supabase_created", readiness, result };
  } catch (error) {
    const localRequest = saveChangeRequestLocally(validation.request);
    writeStatus({
      status: "fallback_after_supabase_error",
      fallbackUsed: true,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      changeRequestId: localRequest.id,
      error: error.message || "Supabase change request write is mislukt.",
    });
    return { request: localRequest, fallbackUsed: true, status: "fallback_after_supabase_error", readiness, error };
  }
}
