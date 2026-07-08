const EMAIL_LOG_FIELDS = [
  "id",
  "created_at",
  "updated_at",
  "direction",
  "status",
  "provider",
  "provider_message_id",
  "from_email",
  "from_name",
  "to_email",
  "to_name",
  "reply_to",
  "subject",
  "html_body",
  "text_body",
  "template_key",
  "template_name",
  "customer_id",
  "lead_id",
  "invoice_id",
  "project_id",
  "triggered_by",
  "triggered_by_user_id",
  "error_message",
  "error_code",
  "metadata",
].join(",");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedStatuses = new Set(["pending", "sent", "failed", "delivered", "bounced", "complained", "opened", "clicked"]);

function getSupabaseConfig() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    available: Boolean(supabaseUrl && serviceRoleKey),
    supabaseUrl,
    serviceRoleKey,
  };
}

async function createEmailLog(input = {}) {
  const config = getSupabaseConfig();
  if (!config.available) return { skipped: true, reason: "missing_supabase_config" };

  const record = normalizeLogRecord(input);
  const rows = await supabaseFetch(`${config.supabaseUrl}/rest/v1/email_logs`, {
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

async function updateEmailLog(id, patch = {}) {
  const config = getSupabaseConfig();
  if (!config.available || !isUuid(id)) return { skipped: true, reason: "missing_supabase_config_or_id" };

  const rows = await supabaseFetch(`${config.supabaseUrl}/rest/v1/email_logs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(config.serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=representation",
    },
    body: JSON.stringify(normalizePatch(patch)),
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

async function listEmailLogs(filters = {}) {
  const config = getSupabaseConfig();
  if (!config.available) {
    const error = new Error("Supabase-configuratie ontbreekt.");
    error.statusCode = 500;
    throw error;
  }

  const query = new URLSearchParams();
  query.set("select", EMAIL_LOG_FIELDS);
  query.set("order", "created_at.desc");
  query.set("limit", String(limitNumber(filters.limit, 100, 250)));

  addUuidFilter(query, "customer_id", filters.customerId || filters.customer_id);
  addUuidFilter(query, "lead_id", filters.leadId || filters.lead_id);
  addUuidFilter(query, "invoice_id", filters.invoiceId || filters.invoice_id);
  addUuidFilter(query, "project_id", filters.projectId || filters.project_id);
  addTextFilter(query, "status", filters.status);
  addTextFilter(query, "template_key", filters.templateKey || filters.template_key);
  addTextFilter(query, "to_email", filters.recipient || filters.toEmail || filters.to_email);

  const dateFrom = cleanText(filters.dateFrom || filters.from || filters.startDate);
  const dateTo = cleanText(filters.dateTo || filters.to || filters.endDate);
  if (dateFrom) query.append("created_at", `gte.${dateFrom}`);
  if (dateTo) query.append("created_at", `lte.${dateTo}`);

  const search = cleanText(filters.search || filters.q);
  if (search) {
    const safeSearch = escapeIlike(search);
    query.set("or", `(subject.ilike.*${safeSearch}*,to_email.ilike.*${safeSearch}*,template_name.ilike.*${safeSearch}*,provider_message_id.ilike.*${safeSearch}*)`);
  }

  return supabaseFetch(`${config.supabaseUrl}/rest/v1/email_logs?${query.toString()}`, {
    method: "GET",
    headers: restHeaders(config.serviceRoleKey),
  });
}

async function getEmailLog(id) {
  const config = getSupabaseConfig();
  if (!config.available) {
    const error = new Error("Supabase-configuratie ontbreekt.");
    error.statusCode = 500;
    throw error;
  }
  if (!isUuid(id)) {
    const error = new Error("Ongeldig mail-log ID.");
    error.statusCode = 400;
    throw error;
  }

  const rows = await supabaseFetch(`${config.supabaseUrl}/rest/v1/email_logs?select=${EMAIL_LOG_FIELDS}&id=eq.${encodeURIComponent(id)}&limit=1`, {
    method: "GET",
    headers: restHeaders(config.serviceRoleKey),
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function findEmailLogByProviderMessageId(providerMessageId) {
  const config = getSupabaseConfig();
  const messageId = cleanText(providerMessageId);
  if (!config.available || !messageId) return null;

  const rows = await supabaseFetch(`${config.supabaseUrl}/rest/v1/email_logs?select=${EMAIL_LOG_FIELDS}&provider_message_id=eq.${encodeURIComponent(messageId)}&limit=1`, {
    method: "GET",
    headers: restHeaders(config.serviceRoleKey),
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

function normalizeLogRecord(input = {}) {
  const from = parseAddress(input.from || input.fromEmail || input.from_email);
  const to = parseAddress(Array.isArray(input.to) ? input.to[0] : input.to || input.toEmail || input.to_email);
  const metadata = normalizeMetadata(input.metadata);
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const now = new Date().toISOString();
  return {
    direction: cleanText(input.direction) || "outbound",
    status: normalizeStatus(input.status) || "pending",
    provider: cleanText(input.provider) || "resend",
    provider_message_id: cleanText(input.providerMessageId || input.provider_message_id) || null,
    from_email: cleanEmail(input.fromEmail || input.from_email || from.email) || null,
    from_name: cleanText(input.fromName || input.from_name || from.name) || null,
    to_email: cleanEmail(input.toEmail || input.to_email || to.email) || cleanText(input.toEmail || input.to_email || to.email),
    to_name: cleanText(input.toName || input.to_name || to.name) || null,
    reply_to: cleanText(input.replyTo || input.reply_to) || null,
    subject: cleanText(input.subject),
    html_body: cleanText(input.html || input.htmlBody || input.html_body) || null,
    text_body: cleanText(input.text || input.textBody || input.text_body) || null,
    template_key: cleanText(input.templateKey || input.template_key) || null,
    template_name: cleanText(input.templateName || input.template_name) || null,
    customer_id: uuidOrNull(input.customerId || input.customer_id),
    lead_id: uuidOrNull(input.leadId || input.lead_id),
    invoice_id: uuidOrNull(input.invoiceId || input.invoice_id),
    project_id: uuidOrNull(input.projectId || input.project_id),
    triggered_by: cleanText(input.triggeredBy || input.triggered_by) || null,
    triggered_by_user_id: uuidOrNull(input.triggeredByUserId || input.triggered_by_user_id),
    error_message: cleanText(input.errorMessage || input.error_message) || null,
    error_code: cleanText(input.errorCode || input.error_code) || null,
    metadata: {
      ...metadata,
      toRecipients: Array.isArray(input.to) ? input.to.map(cleanText).filter(Boolean) : metadata.toRecipients,
      bcc: input.bcc ? input.bcc : metadata.bcc,
      attachmentCount: attachments.length || metadata.attachmentCount || 0,
      attachmentNames: attachments.map((attachment) => cleanText(attachment.filename || attachment.name)).filter(Boolean),
    },
    updated_at: now,
  };
}

function normalizePatch(patch = {}) {
  const normalized = {};
  const fieldMap = {
    status: "status",
    providerMessageId: "provider_message_id",
    provider_message_id: "provider_message_id",
    errorMessage: "error_message",
    error_message: "error_message",
    errorCode: "error_code",
    error_code: "error_code",
    metadata: "metadata",
  };

  Object.entries(fieldMap).forEach(([source, target]) => {
    if (!Object.prototype.hasOwnProperty.call(patch, source)) return;
    if (target === "status") normalized[target] = normalizeStatus(patch[source]) || cleanText(patch[source]);
    else if (target === "metadata") normalized[target] = normalizeMetadata(patch[source]);
    else normalized[target] = cleanText(patch[source]) || null;
  });

  normalized.updated_at = new Date().toISOString();
  return normalized;
}

function parseAddress(value = "") {
  const text = cleanText(value);
  const match = text.match(/^(.*?)<([^>]+)>$/);
  if (!match) return { name: "", email: text };
  return { name: cleanText(match[1]).replace(/^"|"$/g, ""), email: cleanText(match[2]) };
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
  const text = cleanText(value);
  if (text) query.set(column, `eq.${text}`);
}

function limitNumber(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(Math.floor(number), max);
}

function normalizeStatus(value) {
  const status = cleanText(value).toLowerCase();
  return allowedStatuses.has(status) ? status : "";
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function uuidOrNull(value) {
  const id = cleanText(value);
  return isUuid(id) ? id : null;
}

function isUuid(value) {
  return uuidPattern.test(cleanText(value));
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return emailPattern.test(email) ? email : "";
}

function cleanText(value) {
  return String(value || "").trim();
}

function escapeIlike(value) {
  return cleanText(value).replace(/[(),*]/g, " ");
}

module.exports = {
  createEmailLog,
  updateEmailLog,
  listEmailLogs,
  getEmailLog,
  findEmailLogByProviderMessageId,
  normalizeLogRecord,
};
