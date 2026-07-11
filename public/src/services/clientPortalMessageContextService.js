import { getSupabaseConfig } from "../config/supabaseConfig.js";
import { saveClientPortalMessageWithWriteFallback } from "./clientPortalMessageWriteService.js";
import { getSession } from "./supabaseAuthProvider.js";

const AUTH_CONFIG_ENDPOINT = "/.netlify/functions/client-auth-config";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const MESSAGE_STATES = Object.freeze({
  LOADING: "loading",
  FOUND: "found",
  MISSING: "missing",
  SEND_SUCCESS: "send_success",
  SEND_ERROR: "send_error",
  ERROR: "error",
});

function safeString(value = "") {
  return String(value || "").trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && safeString(value) !== "") || "";
}

function isUuid(value) {
  return UUID_PATTERN.test(safeString(value));
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

function cleanKey(value = "", max = 120) {
  return cleanString(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

function safeMetadata(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function conversationIdFor(input = {}) {
  const explicit = cleanKey(input.conversationId || input.threadId || input.metadata?.conversationId, 120);
  if (explicit) return explicit;
  const contextType = cleanKey(input.contextType || input.metadata?.contextType || "algemeen", 48);
  const contextId = cleanKey(input.contextId || input.projectId || input.websiteId || input.metadata?.contextId, 80);
  const subject = cleanKey(input.subject || "algemeen", 80);
  return ["portal", contextType || "algemeen", contextId || subject || "gesprek"].join("-");
}

function metadataFor(input = {}, base = {}) {
  const existing = safeMetadata(input.metadata);
  const conversationId = conversationIdFor({ ...input, metadata: existing });
  const contextType = cleanKey(input.contextType || existing.contextType || "algemeen", 48) || "algemeen";
  const idempotencyKey = cleanKey(input.idempotencyKey || existing.idempotencyKey || `${conversationId}-${cleanString(input.body, 80)}`, 160);
  return {
    ...base,
    ...existing,
    conversationId,
    threadId: conversationId,
    contextType,
    contextLabel: cleanString(input.contextLabel || existing.contextLabel || labelForContext(contextType), 80),
    idempotencyKey,
  };
}

function labelForContext(value = "") {
  const key = cleanKey(value, 48);
  return {
    algemeen: "Algemeen",
    websiteproject: "Websiteproject",
    website: "Website",
    review: "Ontwerp en feedback",
    wijziging: "Wijzigingsverzoek",
    factuur: "Factuur",
    branding: "Branding",
    support: "Support",
  }[key] || "Algemeen";
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

function mapPortalMessage(row = {}, source = "supabase-client-portal-messages") {
  const senderType = firstValue(row.sender_type, row.senderType, "admin");
  const metadata = safeMetadata(row.metadata);
  const subject = firstValue(row.subject, metadata.subject, "Bericht");
  const conversationId = firstValue(metadata.conversationId, metadata.threadId, conversationIdFor({ subject, metadata }));
  return {
    id: safeString(row.id),
    customerId: safeString(firstValue(row.customer_id, row.customerId)),
    profileId: safeString(firstValue(row.profile_id, row.profileId)),
    senderProfileId: safeString(firstValue(row.sender_profile_id, row.senderProfileId)),
    senderType,
    sender: senderType === "customer" ? "Klant" : "Max Webstudio",
    subject,
    title: subject,
    body: safeString(row.body),
    message: safeString(row.body),
    status: firstValue(row.status, "open"),
    readAt: firstValue(row.read_at, row.readAt),
    createdAt: firstValue(row.created_at, row.createdAt),
    updatedAt: firstValue(row.updated_at, row.updatedAt),
    metadata,
    conversationId,
    threadId: conversationId,
    contextType: firstValue(metadata.contextType, "algemeen"),
    contextLabel: firstValue(metadata.contextLabel, labelForContext(metadata.contextType || "algemeen")),
    idempotencyKey: firstValue(metadata.idempotencyKey, ""),
    source,
    _source: "supabase",
    _supabaseId: safeString(row.id),
  };
}

function result(state, overrides = {}) {
  return {
    state,
    loading: state === MESSAGE_STATES.LOADING,
    found: state === MESSAGE_STATES.FOUND,
    fallbackAllowed: ![MESSAGE_STATES.FOUND, MESSAGE_STATES.SEND_SUCCESS].includes(state),
    messages: [],
    message: null,
    fallbackUsed: false,
    source: "supabase-client-portal-message-context",
    statusMessage: "",
    error: "",
    ...overrides,
  };
}

function validateInput(input = {}) {
  const subject = cleanString(input.subject, 180);
  const body = cleanString(input.body, 2500);
  const errors = [];
  if (!subject || subject.length < 3) errors.push("Onderwerp is verplicht en moet minimaal 3 tekens bevatten.");
  if (!body || body.length < 5) errors.push("Bericht is verplicht en moet minimaal 5 tekens bevatten.");
  return { valid: errors.length === 0, errors, subject, body };
}

export async function getClientPortalMessageContext(customerContext = {}) {
  try {
    const customerId = safeString(customerContext.supabaseCustomerId || customerContext.customerId || customerContext.customer?.id);
    if (!isUuid(customerId)) {
      return result(MESSAGE_STATES.MISSING, {
        statusMessage: "Geen production-ready customer_id beschikbaar voor berichten.",
      });
    }

    const sessionResult = await getSession();
    const session = sessionResult?.session;
    if (!session?.access_token) {
      return result(MESSAGE_STATES.MISSING, {
        statusMessage: "Geen actieve Supabase Auth-sessie gevonden.",
      });
    }

    const config = await getRuntimePublicConfig();
    if (!publicConfigReady(config)) {
      return result(MESSAGE_STATES.MISSING, {
        statusMessage: "Publieke Supabase berichtenconfiguratie is nog niet beschikbaar.",
      });
    }

    const query = new URLSearchParams({
      customer_id: `eq.${customerId}`,
      select: "*",
      order: "created_at.desc",
      limit: "50",
    });
    const rows = await supabaseRest(config, session, "client_portal_messages", query.toString());
    const messages = (Array.isArray(rows) ? rows : []).map(mapPortalMessage);
    if (!messages.length) {
      return result(MESSAGE_STATES.MISSING, {
        statusMessage: "Geen berichten gevonden voor deze klant.",
      });
    }
    return result(MESSAGE_STATES.FOUND, {
      messages,
      statusMessage: "Berichten gevonden via Supabase.",
    });
  } catch (error) {
    return result(MESSAGE_STATES.ERROR, {
      statusMessage: "Berichten konden niet veilig worden opgehaald.",
      error: sanitizeMessage(error?.message || "Onbekende fout."),
    });
  }
}

export async function saveClientPortalMessageWithSupabaseFallback(input = {}, context = {}) {
  const validation = validateInput(input);
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
    const fallback = await saveClientPortalMessageWithWriteFallback(input, context);
    return {
      ...fallback,
      state: MESSAGE_STATES.MISSING,
      fallbackUsed: true,
      source: "local-fallback-after-missing-supabase-message-context",
    };
  }

  try {
    const payload = {
      customer_id: customerId,
      sender_type: "customer",
      subject: validation.subject,
      body: validation.body,
      status: "open",
      read_at: null,
      is_demo: false,
      environment: environmentForWrite(config),
      metadata: metadataFor(input, {
        createdBy: "client-portal-message-production-foundation",
        frontendFlow: "sprint-6-communication-inbox",
      }),
    };
    const rows = await supabaseRest(config, session, "client_portal_messages", "", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: payload,
    });
    const created = mapPortalMessage(Array.isArray(rows) ? rows[0] : rows, "supabase-client-portal-message-create");
    return result(MESSAGE_STATES.SEND_SUCCESS, {
      message: created,
      messages: [created],
      fallbackUsed: false,
      statusMessage: "Bericht aangemaakt via Supabase.",
    });
  } catch (error) {
    if (isUuid(customerId) && session?.access_token && publicConfigReady(config)) {
      const safeError = new Error("Bericht kon niet veilig worden opgeslagen. Probeer het opnieuw of neem contact op.");
      safeError.cause = sanitizeMessage(error?.message || "Supabase bericht kon niet worden opgeslagen.");
      throw safeError;
    }
    const fallback = await saveClientPortalMessageWithWriteFallback(input, context);
    return {
      ...fallback,
      state: MESSAGE_STATES.SEND_ERROR,
      fallbackUsed: true,
      source: "local-fallback-after-supabase-message-error",
      error: sanitizeMessage(error?.message || "Bericht kon niet via Supabase worden opgeslagen."),
    };
  }
}

export function getClientPortalMessageStates() {
  return MESSAGE_STATES;
}

export const clientPortalMessageContextService = {
  getClientPortalMessageContext,
  saveClientPortalMessageWithSupabaseFallback,
  getClientPortalMessageStates,
};
