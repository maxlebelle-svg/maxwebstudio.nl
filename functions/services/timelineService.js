const TIMELINE_FIELDS = [
  "id",
  "created_at",
  "updated_at",
  "customer_id",
  "lead_id",
  "user_id",
  "event_type",
  "severity",
  "title",
  "description",
  "module",
  "reference_type",
  "reference_id",
  "actor_name",
  "actor_role",
  "icon",
  "is_global",
  "invoice_id",
  "email_log_id",
  "related_type",
  "related_id",
  "is_read",
  "read_at",
  "archived_at",
  "metadata",
].join(",");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const severityValues = new Set(["info", "success", "warning", "error"]);
const allowedEventTypes = new Set([
  "lead_created",
  "lead_updated",
  "customer_created",
  "customer_updated",
  "order_created",
  "terms_accepted",
  "email_sent",
  "email_delivered",
  "email_opened",
  "email_clicked",
  "email_failed",
  "invoice_created",
  "invoice_sent",
  "invoice_paid",
  "payment_created",
  "payment_paid",
  "payment_cancelled",
  "payment_refunded",
  "payment_failed",
  "automation_started",
  "automation_completed",
  "automation_failed",
  "onboarding_opened",
  "onboarding_started",
  "onboarding_saved",
  "onboarding_submitted",
  "onboarding_file_uploaded",
  "onboarding_needs_review",
  "onboarding_approved",
  "onboarding_sent_to_website_factory",
  "onboarding_updated",
  "website_preview_started",
  "website_preview_ready",
  "website_preview_failed",
  "preview_ready",
  "feedback_created",
  "feedback_resolved",
  "revision_started",
  "revision_completed",
  "preview_approved",
  "launch_started",
  "launch_completed",
  "website_live",
  "growth_recommendation_created",
  "upsell_available",
  "upsell_opened",
  "upsell_ordered",
  "review_requested",
  "review_received",
  "maintenance_completed",
  "seo_scan_completed",
  "project_updated",
  "customer_portal_action",
  "health_warning",
  "health_restored",
  "service_warning",
  "service_restored",
  "factory_warning",
  "preview_warning",
  "automation_warning",
  "payment_warning",
  "mail_warning",
  "onboarding_task_completed",
  "factory_started",
  "factory_input_collected",
  "factory_analysis_completed",
  "factory_blueprint_created",
  "factory_content_prepared",
  "factory_branding_applied",
  "factory_media_mapped",
  "factory_seo_prepared",
  "factory_preview_started",
  "factory_preview_ready",
  "factory_failed",
  "preview_opened",
  "preview_shared",
  "domain_requested",
  "domain_connected",
  "hosting_activated",
  "phone_number_requested",
  "phone_number_activated",
  "note_created",
  "status_changed",
  "system_warning",
  "system_error",
]);

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

async function createActivityEvent(input = {}) {
  return createTimelineEvent({
    ...input,
    isGlobal: input.isGlobal ?? input.is_global ?? true,
    module: input.module || moduleForEventType(input.eventType || input.event_type),
  });
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
  addTextFilter(query, "severity", filters.severity);
  addTextFilter(query, "invoice_id", filters.invoiceId || filters.invoice_id);
  addTextFilter(query, "email_log_id", filters.emailLogId || filters.email_log_id);

  const unreadOnly = cleanText(filters.unreadOnly || filters.unread_only).toLowerCase();
  if (unreadOnly === "true" || unreadOnly === "1") query.set("is_read", "eq.false");

  const dateFrom = cleanText(filters.dateFrom || filters.date_from || filters.from);
  const dateTo = cleanText(filters.dateTo || filters.date_to || filters.to);
  if (dateFrom) query.append("created_at", `gte.${dateFrom}`);
  if (dateTo) query.append("created_at", `lte.${dateTo}`);

  const includeArchived = cleanText(filters.includeArchived || filters.include_archived).toLowerCase();
  if (includeArchived !== "true" && includeArchived !== "1") query.set("archived_at", "is.null");

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

async function getTimelineEvent(id) {
  const config = getSupabaseConfig();
  const eventId = uuidOrNull(id);
  if (!config.available) {
    const error = new Error("Supabase-configuratie ontbreekt.");
    error.statusCode = 500;
    throw error;
  }
  if (!eventId) {
    const error = new Error("Ongeldig activity event ID.");
    error.statusCode = 400;
    throw error;
  }

  const rows = await supabaseFetch(`${config.supabaseUrl}/rest/v1/customer_timeline_events?select=${TIMELINE_FIELDS}&id=eq.${encodeURIComponent(eventId)}&limit=1`, {
    method: "GET",
    headers: restHeaders(config.serviceRoleKey),
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function markTimelineEventRead(id) {
  const event = await patchTimelineEvent(id, {
    is_read: true,
    read_at: new Date().toISOString(),
  });
  return event;
}

async function markAllTimelineEventsRead(filters = {}) {
  const config = getSupabaseConfig();
  if (!config.available) {
    const error = new Error("Supabase-configuratie ontbreekt.");
    error.statusCode = 500;
    throw error;
  }

  const query = new URLSearchParams();
  query.set("is_read", "eq.false");
  const globalFilter = cleanText(filters.global || filters.isGlobal || filters.is_global).toLowerCase();
  if (globalFilter === "true" || globalFilter === "1") query.set("is_global", "eq.true");
  query.set("archived_at", "is.null");

  const rows = await supabaseFetch(`${config.supabaseUrl}/rest/v1/customer_timeline_events?${query.toString()}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(config.serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      is_read: true,
      read_at: new Date().toISOString(),
    }),
  });
  return Array.isArray(rows) ? rows : [];
}

async function archiveTimelineEvent(id) {
  return patchTimelineEvent(id, {
    archived_at: new Date().toISOString(),
    is_read: true,
    read_at: new Date().toISOString(),
  });
}

async function patchTimelineEvent(id, patch = {}) {
  const config = getSupabaseConfig();
  const eventId = uuidOrNull(id);
  if (!config.available) {
    const error = new Error("Supabase-configuratie ontbreekt.");
    error.statusCode = 500;
    throw error;
  }
  if (!eventId) {
    const error = new Error("Ongeldig activity event ID.");
    error.statusCode = 400;
    throw error;
  }

  const rows = await supabaseFetch(`${config.supabaseUrl}/rest/v1/customer_timeline_events?id=eq.${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(config.serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
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
    event_type: normalizeEventType(input.eventType || input.event_type),
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
    invoice_id: cleanText(input.invoiceId || input.invoice_id).slice(0, 180) || null,
    email_log_id: cleanText(input.emailLogId || input.email_log_id).slice(0, 180) || null,
    related_type: slugText(input.relatedType || input.related_type) || null,
    related_id: cleanText(input.relatedId || input.related_id).slice(0, 180) || null,
    is_read: Boolean(input.isRead || input.is_read || false),
    read_at: cleanText(input.readAt || input.read_at) || null,
    archived_at: cleanText(input.archivedAt || input.archived_at) || null,
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

function normalizeEventType(value) {
  const eventType = slugText(value);
  if (!eventType) return "note_created";
  return allowedEventTypes.has(eventType) ? eventType : eventType.slice(0, 120);
}

function moduleForEventType(eventType) {
  const type = normalizeEventType(eventType);
  if (type.startsWith("email_")) return "email";
  if (type.startsWith("invoice_")) return "billing";
  if (type.startsWith("payment_")) return "billing";
  if (type.startsWith("automation_")) return "automation";
  if (type.startsWith("lead_")) return "sales";
  if (type.startsWith("customer_")) return "customers";
  if (type.startsWith("customer_portal_")) return "customer_portal";
  if (type.startsWith("health_")) return "platform_health";
  if (type.startsWith("service_")) return "platform_health";
  if (type.endsWith("_warning")) return "platform_health";
  if (type.startsWith("project_")) return "projects";
  if (type.startsWith("onboarding_")) return "onboarding";
  if (type.startsWith("website_")) return "website_factory";
  if (type.startsWith("domain_")) return "domain";
  if (type.startsWith("hosting_")) return "hosting";
  if (type.startsWith("phone_")) return "telefonie";
  if (type.startsWith("system_")) return "system";
  return "general";
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
  createActivityEvent,
  createTimelineEvent,
  getTimelineEvent,
  markAllTimelineEventsRead,
  markTimelineEventRead,
  archiveTimelineEvent,
  listCustomerTimeline,
  listActivityFeed,
  listTimelineEvents,
  normalizeTimelineEvent,
};
