const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { createTimelineEvent } = require("./services/timelineService");

const adminRoles = ["super_admin", "admin", "sales_manager"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});

  const adminCheck = await verifyAdmin(event, jsonResponse, {
    module: "preview_publication",
    action: event.httpMethod.toLowerCase(),
    allowedRoles: adminRoles,
    allowedStatuses: ["active"],
  });
  if (!adminCheck.success) return adminCheck.response;

  const context = getContext(adminCheck.admin);
  if (!context.available) return jsonResponse(500, { success: false, error: "Previewpublicatie is nog niet geconfigureerd." });

  try {
    if (event.httpMethod === "GET") return listPreviewVersions(context, event.queryStringParameters || {});
    if (event.httpMethod === "POST") return publishPreviewVersion(context, parsePayload(event.body));
    return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });
  } catch (error) {
    console.error("Preview publication failed", {
      message: error.message,
      status: error.status || 500,
      code: error.code || "",
      details: error.details || "",
    });
    return jsonResponse(error.status || 500, {
      success: false,
      error: safeError(error),
      setupRequired: isMissingPreviewSchema(error),
    });
  }
};

async function listPreviewVersions(context, params = {}) {
  const websiteId = uuidOrEmpty(params.websiteId || params.website_id);
  if (!websiteId) return jsonResponse(400, { success: false, error: "Website ontbreekt." });
  const website = await readSingle(context, "websites", `select=*&id=eq.${websiteId}&limit=1`);
  if (!website?.id) return jsonResponse(404, { success: false, error: "Website niet gevonden." });
  const versions = await readRows(context, "website_preview_versions", `select=*&website_id=eq.${websiteId}&order=version.desc`);
  return jsonResponse(200, { success: true, website: sanitizeWebsite(website), previewVersions: versions.map(sanitizeAdminVersion) });
}

async function publishPreviewVersion(context, payload = {}) {
  const previewVersionId = uuidOrEmpty(payload.previewVersionId || payload.preview_version_id);
  const websiteId = uuidOrEmpty(payload.websiteId || payload.website_id);
  const version = previewVersionId
    ? await readSingle(context, "website_preview_versions", `select=*&id=eq.${previewVersionId}&limit=1`)
    : await readSingle(context, "website_preview_versions", `select=*&website_id=eq.${websiteId}&order=version.desc&limit=1`);
  if (!version?.id) return jsonResponse(404, { success: false, error: "Geen bestaande previewversie gevonden om te publiceren." });

  const ownership = await resolveOwnership(context, version);
  if (!ownership.customer?.id || !ownership.website?.id) {
    return jsonResponse(409, { success: false, error: "Previewversie mist een veilige klant- of websitekoppeling." });
  }

  const now = new Date().toISOString();
  const safePreviewPath = `/preview.html?version=${encodeURIComponent(version.id)}`;
  const patch = {
    customer_id: ownership.customer.id,
    project_id: ownership.project?.id || version.project_id || null,
    website_id: ownership.website.id,
    title: cleanText(payload.title).slice(0, 140) || version.title || "Website-preview",
    customer_summary: cleanText(payload.summary || payload.customerSummary || payload.customer_summary).slice(0, 500) || null,
    change_summary: cleanText(payload.changeSummary || payload.change_summary).slice(0, 1200) || null,
    review_deadline: parseDateOrNull(payload.reviewDeadline || payload.review_deadline),
    allow_feedback: payload.allowFeedback !== false && payload.allow_feedback !== false,
    allow_approval: payload.allowApproval !== false && payload.allow_approval !== false,
    notify_customer: Boolean(payload.notifyCustomer || payload.notify_customer),
    published_to_portal: true,
    published_at: version.published_at || now,
    published_by: context.admin.profileId || null,
    safe_preview_path: safePreviewPath,
    status: version.approved_at ? "approved" : "ready_for_review",
    metadata: {
      ...(isObject(version.metadata) ? version.metadata : {}),
      publishDedupeKey: `preview_publish:${version.id}`,
      lastPublishedAt: now,
      notificationRequested: Boolean(payload.notifyCustomer || payload.notify_customer),
    },
    updated_at: now,
  };

  const rows = await patchRows(context, "website_preview_versions", `id=eq.${version.id}`, patch);
  const published = rows[0] || { ...version, ...patch };
  await safeTimeline({
    customerId: ownership.customer.id,
    eventType: "preview_shared",
    title: "Website-preview gepubliceerd",
    description: `${patch.title} staat klaar in het klantportaal.`,
    module: "website",
    referenceType: "website_preview_version",
    referenceId: version.id,
    actorName: context.admin.email || "Max Webstudio",
    actorRole: "admin",
    severity: "success",
    metadata: {
      dedupeKey: `preview_publish:${version.id}`,
      websiteId: ownership.website.id,
      projectId: ownership.project?.id || "",
      version: published.version,
    },
  });

  return jsonResponse(200, { success: true, previewVersion: sanitizeAdminVersion(published), website: sanitizeWebsite(ownership.website) });
}

async function resolveOwnership(context, version = {}) {
  const website = version.website_id
    ? await readSingle(context, "websites", `select=*&id=eq.${version.website_id}&limit=1`)
    : null;
  const project = version.project_id
    ? await readSingle(context, "projects", `select=*&id=eq.${version.project_id}&limit=1`)
    : website?.id ? await readSingle(context, "projects", `select=*&website_id=eq.${website.id}&order=updated_at.desc&limit=1`) : null;
  const customerId = uuidOrEmpty(version.customer_id || website?.customer_id || project?.customer_id);
  const customer = customerId ? await readSingle(context, "customers", `select=*&id=eq.${customerId}&limit=1`) : null;
  return { customer, project, website };
}

async function readRows(context, table, query) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}?${query}`, { method: "GET", headers: restHeaders(context.serviceRoleKey) });
}

async function readSingle(context, table, query) {
  const rows = await readRows(context, table, query);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function patchRows(context, table, filter, record) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(record),
  });
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    error.code = data?.code || "";
    error.details = data?.details || "";
    error.hint = data?.hint || "";
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function getContext(admin) {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { available: Boolean(supabaseUrl && serviceRoleKey), supabaseUrl, serviceRoleKey, admin: admin || {} };
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };
}

function sanitizeAdminVersion(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    projectId: cleanText(row.project_id),
    websiteId: cleanText(row.website_id),
    version: Number(row.version || 1),
    title: cleanText(row.title),
    customerSummary: cleanText(row.customer_summary),
    changeSummary: cleanText(row.change_summary),
    safePreviewPath: cleanText(row.safe_preview_path),
    publishedToPortal: Boolean(row.published_to_portal),
    publishedAt: cleanText(row.published_at),
    reviewDeadline: cleanText(row.review_deadline),
    allowFeedback: row.allow_feedback !== false,
    allowApproval: row.allow_approval !== false,
    status: cleanText(row.status),
    approvedAt: cleanText(row.approved_at),
    feedbackCount: Array.isArray(row.feedback_items) ? row.feedback_items.length : 0,
    createdAt: cleanText(row.created_at),
  };
}

function sanitizeWebsite(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    name: cleanText(row.name),
    domain: cleanText(row.domain),
    status: cleanText(row.status),
  };
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Ongeldige JSON body.");
    error.status = 400;
    throw error;
  }
}

function parseDateOrNull(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function uuidOrEmpty(value) {
  const text = cleanText(value);
  return uuidPattern.test(text) ? text : "";
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isMissingPreviewSchema(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return text.includes("website_preview_versions") || text.includes("schema cache") || text.includes("pgrst205");
}

function safeError(error = {}) {
  return isMissingPreviewSchema(error)
    ? "Previewpublicatie-tabellen ontbreken nog. Voer migratie 20260711133000_preview_publication_portal_review uit."
    : error.message || "Previewpublicatie kon niet worden verwerkt.";
}

async function safeTimeline(input) {
  try {
    return await createTimelineEvent(input);
  } catch (error) {
    console.error("Preview publication timeline skipped", { message: error.message });
    return null;
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders({ methods: "GET, POST, OPTIONS" }) },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
