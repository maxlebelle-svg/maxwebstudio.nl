import { getSupabaseConfig } from "../config/supabaseConfig.js";
import { getSession } from "./supabaseAuthProvider.js";

const AUTH_CONFIG_ENDPOINT = "/.netlify/functions/client-auth-config";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const NOTIFICATION_STATES = Object.freeze({
  LOADING: "loading",
  FOUND: "found",
  MISSING: "missing",
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

function sanitizeMessage(value = "") {
  return safeString(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/apikey['":\s]+[A-Za-z0-9._-]+/gi, "apikey [redacted]");
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

async function supabaseRestGet(config, session, table, query) {
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || `${table} kon niet worden gelezen.`);
    error.status = response.status;
    error.table = table;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

function statusForType(type, status) {
  const currentStatus = safeString(status);
  if (currentStatus) return currentStatus;
  if (type === "completed") return "afgerond";
  if (type === "action_required") return "nieuw";
  return "info";
}

function mapNotification(row = {}) {
  const type = firstValue(row.type, "info");
  const ctaTarget = firstValue(row.cta_target, row.action_url, row.actionUrl);
  return {
    id: safeString(row.id),
    supabaseNotificationId: safeString(row.id),
    customerId: safeString(firstValue(row.customer_id, row.customerId)),
    title: firstValue(row.title, "Notificatie"),
    body: firstValue(row.message, row.body),
    message: firstValue(row.message, row.body),
    type,
    status: statusForType(type, row.status),
    relatedType: firstValue(row.related_type, row.relatedType),
    relatedId: firstValue(row.related_id, row.relatedId),
    actionLabel: firstValue(row.cta_label, row.action_label, row.actionLabel),
    actionUrl: ctaTarget,
    ctaLabel: firstValue(row.cta_label, row.action_label, row.actionLabel),
    ctaTarget,
    readAt: firstValue(row.read_at, row.readAt),
    createdAt: firstValue(row.created_at, row.createdAt),
    updatedAt: firstValue(row.updated_at, row.updatedAt),
    source: "supabase-notifications",
    _source: "supabase",
    _supabaseId: safeString(row.id),
  };
}

function result(state, overrides = {}) {
  return {
    state,
    loading: state === NOTIFICATION_STATES.LOADING,
    found: state === NOTIFICATION_STATES.FOUND,
    fallbackAllowed: state !== NOTIFICATION_STATES.FOUND,
    notifications: [],
    source: "supabase-notification-context",
    message: "",
    error: "",
    ...overrides,
  };
}

export async function getClientNotificationContext(customerContext = {}) {
  try {
    const customerId = safeString(customerContext.supabaseCustomerId || customerContext.customerId || customerContext.customer?.id);
    if (!isUuid(customerId)) {
      return result(NOTIFICATION_STATES.MISSING, {
        message: "Geen production-ready customer_id beschikbaar voor notificaties.",
      });
    }

    const sessionResult = await getSession();
    const session = sessionResult?.session;
    if (!session?.access_token) {
      return result(NOTIFICATION_STATES.MISSING, {
        message: "Geen actieve Supabase Auth-sessie gevonden.",
      });
    }

    const config = await getRuntimePublicConfig();
    if (!publicConfigReady(config)) {
      return result(NOTIFICATION_STATES.MISSING, {
        message: "Publieke Supabase notificatieconfiguratie is nog niet beschikbaar.",
      });
    }

    const query = new URLSearchParams({
      customer_id: `eq.${customerId}`,
      select: "*",
      order: "created_at.desc",
      limit: "100",
    }).toString();
    const rows = await supabaseRestGet(config, session, "client_portal_notifications", query);
    const notifications = rows.map(mapNotification);
    if (!notifications.length) {
      return result(NOTIFICATION_STATES.MISSING, {
        message: "Geen notificaties gevonden voor deze klant.",
      });
    }
    return result(NOTIFICATION_STATES.FOUND, {
      notifications,
      message: "Notificaties gevonden via Supabase.",
    });
  } catch (error) {
    return result(NOTIFICATION_STATES.ERROR, {
      message: "Notificaties konden niet veilig worden opgehaald.",
      error: sanitizeMessage(error?.message || "Onbekende fout."),
    });
  }
}

export function getClientNotificationStates() {
  return NOTIFICATION_STATES;
}

export const clientNotificationContextService = {
  getClientNotificationContext,
  getClientNotificationStates,
};
