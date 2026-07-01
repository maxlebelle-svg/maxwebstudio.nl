import { getSupabaseConfig } from "../config/supabaseConfig.js";
import { saveChangeRequestWithWriteFallback } from "./changeRequestWriteService.js";
import { getSession } from "./supabaseAuthProvider.js";

const AUTH_CONFIG_ENDPOINT = "/.netlify/functions/client-auth-config";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const CHANGE_REQUEST_STATES = Object.freeze({
  LOADING: "loading",
  FOUND: "found",
  MISSING: "missing",
  CREATE_SUCCESS: "create_success",
  CREATE_ERROR: "create_error",
  ERROR: "error",
});

const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const CATEGORIES = new Set(["content", "design", "technical", "seo", "other"]);

function safeString(value = "") {
  return String(value || "").trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && safeString(value) !== "") || "";
}

function isUuid(value) {
  return UUID_PATTERN.test(safeString(value));
}

function keepUuid(value) {
  return isUuid(value) ? safeString(value) : null;
}

function normalizePublicConfig(config = {}) {
  return {
    url: safeString(config.supabaseUrl || config.SUPABASE_URL || config.url).replace(/\/$/, ""),
    anonKey: safeString(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || config.anonKey),
    appEnv: safeString(config.appEnv || config.APP_ENV),
    appEnvironment: safeString(config.appEnvironment || config.APP_ENVIRONMENT),
  };
}

function isSafeSupabaseUrl(value = "") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function publicConfigReady(config = {}) {
  return Boolean(isSafeSupabaseUrl(config.url) && config.anonKey);
}

function environmentForWrite(config = {}) {
  const env = safeString(config.appEnv || config.appEnvironment).toLowerCase();
  if (["test", "staging"].includes(env)) return "test";
  return "production";
}

function sanitizeMessage(value = "") {
  return safeString(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/apikey['":\s]+[A-Za-z0-9._-]+/gi, "apikey [redacted]");
}

function cleanString(value = "", max = 2500) {
  return safeString(value).slice(0, max);
}

function normalizePriority(value = "") {
  const priority = cleanString(value, 30).toLowerCase();
  return PRIORITIES.has(priority) ? priority : "normal";
}

function normalizeCategory(value = "") {
  const category = cleanString(value, 40).toLowerCase();
  return CATEGORIES.has(category) ? category : "other";
}

async function getRuntimePublicConfig() {
  let endpointConfig = {};
  try {
    const response = await fetch(AUTH_CONFIG_ENDPOINT, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) endpointConfig = await response.json();
  } catch {
    endpointConfig = {};
  }

  return normalizePublicConfig({
    ...getSupabaseConfig(),
    ...(window.__MAXWEBSTUDIO_SUPABASE_CONFIG__ || {}),
    ...endpointConfig,
  });
}

async function supabaseRest(config, session, table, query = "", options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || `${table} kon niet worden gelezen.`);
    error.status = response.status;
    error.table = table;
    throw error;
  }
  return payload;
}

function mapChangeRequest(row = {}, source = "supabase-change-requests") {
  return {
    id: safeString(row.id),
    customerId: safeString(firstValue(row.customer_id, row.customerId)),
    websiteId: safeString(firstValue(row.website_id, row.websiteId)),
    projectId: safeString(firstValue(row.project_id, row.projectId)),
    name: safeString(row.name),
    company: safeString(row.company),
    email: safeString(row.email),
    phone: safeString(row.phone),
    title: firstValue(row.title, "Wijzigingsverzoek"),
    description: safeString(row.description),
    category: firstValue(row.category, "other"),
    changeCategory: firstValue(row.category, row.changeCategory, "other"),
    priority: firstValue(row.priority, "normal"),
    status: firstValue(row.status, "nieuw"),
    fileNames: Array.isArray(row.files) ? row.files.map((file) => file?.name || file).filter(Boolean) : [],
    createdAt: firstValue(row.created_at, row.createdAt),
    updatedAt: firstValue(row.updated_at, row.updatedAt),
    source,
    _source: "supabase",
    _supabaseId: safeString(row.id),
  };
}

function result(state, overrides = {}) {
  return {
    state,
    loading: state === CHANGE_REQUEST_STATES.LOADING,
    found: state === CHANGE_REQUEST_STATES.FOUND,
    fallbackAllowed: ![CHANGE_REQUEST_STATES.FOUND, CHANGE_REQUEST_STATES.CREATE_SUCCESS].includes(state),
    changeRequests: [],
    request: null,
    fallbackUsed: false,
    source: "supabase-change-request-context",
    message: "",
    error: "",
    ...overrides,
  };
}

function allowedRelationId(value = "", records = []) {
  const id = safeString(value);
  if (!id) return "";
  return records.some((record) => safeString(record.id || record._supabaseId || record.supabaseId) === id) ? id : "";
}

function validateInput(input = {}, context = {}) {
  const title = cleanString(input.title, 160);
  const description = cleanString(input.description, 2500);
  const category = normalizeCategory(input.category || input.type);
  const priority = normalizePriority(input.priority);
  const websiteId = allowedRelationId(input.websiteId, context.websites || []);
  const projectId = allowedRelationId(input.projectId, context.projects || []);
  const errors = [];
  if (!title || title.length < 3) errors.push("Titel is verplicht en moet minimaal 3 tekens bevatten.");
  if (!description || description.length < 5) errors.push("Omschrijving is verplicht en moet minimaal 5 tekens bevatten.");
  if (safeString(input.websiteId) && !websiteId) errors.push("Geselecteerde website hoort niet bij deze klant.");
  if (safeString(input.projectId) && !projectId) errors.push("Geselecteerd project hoort niet bij deze klant.");
  return { valid: errors.length === 0, errors, title, description, category, priority, websiteId, projectId };
}

export async function getClientChangeRequestContext(customerContext = {}) {
  try {
    const customerId = safeString(customerContext.supabaseCustomerId || customerContext.customerId || customerContext.customer?.id);
    if (!isUuid(customerId)) {
      return result(CHANGE_REQUEST_STATES.MISSING, {
        message: "Geen production-ready customer_id beschikbaar voor wijzigingsverzoeken.",
      });
    }

    const sessionResult = await getSession();
    const session = sessionResult?.session;
    if (!session?.access_token) {
      return result(CHANGE_REQUEST_STATES.MISSING, {
        message: "Geen actieve Supabase Auth-sessie gevonden.",
      });
    }

    const config = await getRuntimePublicConfig();
    if (!publicConfigReady(config)) {
      return result(CHANGE_REQUEST_STATES.MISSING, {
        message: "Publieke Supabase wijzigingsverzoekconfiguratie is nog niet beschikbaar.",
      });
    }

    const query = new URLSearchParams({
      customer_id: `eq.${customerId}`,
      select: "*",
      order: "created_at.desc",
      limit: "50",
    });
    const rows = await supabaseRest(config, session, "change_requests", query.toString());
    const changeRequests = (Array.isArray(rows) ? rows : []).map(mapChangeRequest);
    if (!changeRequests.length) {
      return result(CHANGE_REQUEST_STATES.MISSING, {
        message: "Geen wijzigingsverzoeken gevonden voor deze klant.",
      });
    }
    return result(CHANGE_REQUEST_STATES.FOUND, {
      changeRequests,
      message: "Wijzigingsverzoeken gevonden via Supabase.",
    });
  } catch (error) {
    return result(CHANGE_REQUEST_STATES.ERROR, {
      message: "Wijzigingsverzoeken konden niet veilig worden opgehaald.",
      error: sanitizeMessage(error?.message || "Onbekende fout."),
    });
  }
}

export async function saveClientChangeRequestWithSupabaseFallback(input = {}, context = {}) {
  const validation = validateInput(input, context);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(" "));
    error.validationErrors = validation.errors;
    throw error;
  }

  const customerId = safeString(context.supabaseCustomerId || context.customer?.supabaseCustomerId || context.customer?.id);
  const sessionResult = await getSession();
  const session = sessionResult?.session;
  const config = await getRuntimePublicConfig();

  if (!isUuid(customerId) || !session?.access_token || !publicConfigReady(config)) {
    const fallback = await saveChangeRequestWithWriteFallback(input, context);
    return {
      ...fallback,
      state: CHANGE_REQUEST_STATES.MISSING,
      fallbackUsed: true,
      source: "local-fallback-after-missing-supabase-change-request-context",
    };
  }

  try {
    const payload = {
      customer_id: customerId,
      auth_user_id: session.user?.id || null,
      website_id: keepUuid(validation.websiteId),
      project_id: keepUuid(validation.projectId),
      name: context.customer?.name || null,
      company: context.customer?.company || null,
      email: context.customer?.email || null,
      phone: context.customer?.phone || null,
      title: validation.title,
      description: validation.description,
      category: validation.category,
      priority: validation.priority,
      status: "nieuw",
      files: [],
      source: "client_portal",
      is_demo: false,
      environment: environmentForWrite(config),
      metadata: {
        createdBy: "client-change-request-production-foundation",
        type: validation.category,
        frontendFlow: "epic-2a-4",
      },
    };
    const rows = await supabaseRest(config, session, "change_requests", "", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: payload,
    });
    const created = mapChangeRequest(Array.isArray(rows) ? rows[0] : rows, "supabase-change-request-create");
    return result(CHANGE_REQUEST_STATES.CREATE_SUCCESS, {
      request: created,
      changeRequests: [created],
      fallbackUsed: false,
      message: "Wijzigingsverzoek aangemaakt via Supabase.",
    });
  } catch (error) {
    const fallback = await saveChangeRequestWithWriteFallback(input, context);
    return {
      ...fallback,
      state: CHANGE_REQUEST_STATES.CREATE_ERROR,
      fallbackUsed: true,
      source: "local-fallback-after-supabase-change-request-error",
      error: sanitizeMessage(error?.message || "Wijzigingsverzoek kon niet via Supabase worden opgeslagen."),
    };
  }
}

export function getClientChangeRequestStates() {
  return CHANGE_REQUEST_STATES;
}

export const clientChangeRequestContextService = {
  getClientChangeRequestContext,
  saveClientChangeRequestWithSupabaseFallback,
  getClientChangeRequestStates,
};
