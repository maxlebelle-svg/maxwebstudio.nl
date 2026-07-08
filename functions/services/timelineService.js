const TIMELINE_FIELDS = [
  "id",
  "created_at",
  "updated_at",
  "customer_id",
  "lead_id",
  "user_id",
  "event_type",
  "title",
  "description",
  "module",
  "reference_type",
  "reference_id",
  "actor_name",
  "actor_role",
  "icon",
  "severity",
  "is_global",
  "metadata",
].join(",");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const severityValues = new Set(["info", "success", "warning", "error"]);

function getSupabaseConfig() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    available: Boolean(supabaseUrl && serviceRoleKey),
    supabaseUrl,
    serviceRoleKey,
  };
}

async function createTimelineEvent(input = {}) {
  const config = getSupabaseConfig();
  if (!config.available) return { skipped: true, reason: "missing_supabase_config" };

  const record = normalizeTimelineEvent(input);
  if (!record.event_type || !record.title || !record.module) {
    return { skipped: true, reason: "missing_required_timeline_fields" };
  }

  const dedupeKey = cleanText(record.metadata?.dedupeKey);
  if (dedupeKey) {
    const existing = await findEventByDedupeKey(config, dedupeKey);
    if (existing) return { skipped: true, reason: "duplicate_dedupe_key", event: existing };
  }

  const rows = await supabaseFetch(`${config.supabaseUrl}/rest/v1/customer_timeline_events`, {
    method: "POST",
    headers: {
      ...restHeaders(config.serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=representation",
    },
    body: JSON.stringify(record),
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

async function listCustomerTimeline(customerId, filters = {}) {
  const id = uuidOrNull(customerId);
  if (!id) {
    const error = new Error("Kies een geldige klant.");
    error.statusCode = 400;
    throw error;
  }
  return listTimelineEvents({ ...filters, customerId: id, global: "" });
}

async function listActivityFeed(filters = {}) {
  return listTimelineEvents({ ...filters, global: "true" });
}

async function listTimelineEvents(filters = {}) {
  const config = getSupabaseConfig();
  if (!config.available) {
    const error = new Error("Supabase-configuratie ontbreekt.");
    error.statusCode = 500;
    throw error;
  }

  const query = new URLSearchParams();
  query.set("select", TIMELINE_FIELDS);
  query.set("order", "created_at.desc");
  query.set("limit", String(limitNumber(filters.limit, 50, 200)));

  addUuidFilter(query, "customer_id", filters.customerId || filters.customer_id);
  addUuidFilter(query, "lead_id", filters.leadId || filters.lead_id);
  addTextFilter(query, "module", filters.module);
  addTextFilter(query, "event_type", filters.eventType || filters.event_type);

  const globalFilter = cleanText(filters.global || filters.isGlobal || filters.is_global).toLowerCase();
  if (globalFilter === "true" || globalFilter === "1") query.set("is_global", "eq.true");
  if (globalFilter === "false" || globalFilter === "0") query.set("is_global", "eq.false");

  const search = cleanText(filters.search || filters.q);
  if (search) {
    const safeSearch = escapeIlike(search);
    query.set("or", `(title.ilike.*${safeSearch}*,description.ilike.*${safeSearch}*,actor_name.ilike.*${safeSearch}*,module.ilike.*${safeSearch}*,event_type.ilike.*${safeSearch}*)`);
  }

  return supabaseFetch(`${config.supabaseUrl}/rest/v1/customer_timeline_events?${query.toString()}`, {
    method: "GET",
    headers: restHeaders(config.serviceRoleKey),
  });
}

function normalizeTimelineEvent(input = {}) {
  const metadata = normalizeMetadata(input.metadata);
  const customerId = uuidOrNull(input.customerId || input.customer_id);
  const leadId = uuidOrNull(input.leadId || input.lead_id);
  const isGlobal = typeof input.isGlobal === "boolean"
    ? input.isGlobal
    : typeof input.is_global === "boolean"
      ? input.is_global
      : true;

  return {
    customer_id: customerId,
    lead_id: leadId,
    user_id: uuidOrNull(input.userId || input.user_id),
    event_type: slugText(input.eventType || input.event_type),
    title: cleanText(input.title).slice(0, 220),
    description: cleanText(input.description).slice(0, 2000) || null,
    module: slugText(input.module || "general"),
    reference_type: slugText(input.referenceType || input.reference_type) || null,
    reference_id: cleanText(input.referenceId || input.reference_id).slice(0, 180) || null,
    actor_name: cleanText(input.actorName || input.actor_name || "Max CRM").slice(0, 160) || null,
    actor_role: cleanText(input.actorRole || input.actor_role).slice(0, 80) || null,
    icon: cleanText(input.icon).slice(0, 24) || "•",
    severity: normalizeSeverity(input.severity),
    is_global: Boolean(isGlobal || !customerId),
    metadata,
  };
}

async function findEventByDedupeKey(config, dedupeKey) {
  const query = new URLSearchParams();
  query.set("select", TIMELINE_FIELDS);
  query.set("metadata->>dedupeKey", `eq.${dedupeKey}`);
  query.set("limit", "1");
  const rows = await supabaseFetch(`${config.supabaseUrl}/rest/v1/customer_timeline_events?${query.toString()}`, {
    method: "GET",
    headers: restHeaders(config.serviceRoleKey),
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error("Supabase gaf geen geldige JSON-response terug.");
      error.status = response.status;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
  };
}

function addUuidFilter(query, column, value) {
  const id = uuidOrNull(value);
  if (id) query.set(column, `eq.${id}`);
}

function addTextFilter(query, column, value) {
  const text = slugText(value);
  if (text) query.set(column, `eq.${text}`);
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeSeverity(value) {
  const severity = slugText(value || "info");
  return severityValues.has(severity) ? severity : "info";
}

function limitNumber(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(Math.floor(number), max);
}

function uuidOrNull(value) {
  const id = cleanText(value);
  return uuidPattern.test(id) ? id : null;
}

function slugText(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9_/-]+/g, "_").replace(/^_+|_+$/g, "");
}

function cleanText(value) {
  return String(value || "").trim();
}

function escapeIlike(value) {
  return cleanText(value).replace(/[(),*]/g, " ");
}

module.exports = {
  createTimelineEvent,
  listCustomerTimeline,
  listActivityFeed,
  normalizeTimelineEvent,
};
