const { corsHeaders } = require("./_cors");
const { randomUUID, createHash } = require("crypto");
const { createTimelineEvent } = require("./services/timelineService");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (!["GET", "POST"].includes(event.httpMethod)) return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });

  const context = getContext();
  if (!context.available) return jsonResponse(500, { success: false, error: "Previewomgeving is nog niet geconfigureerd." });

  try {
    const authUser = await readAuthUser(context, getBearer(event));
    const customer = await resolveCustomerForAuthUser(context, authUser.id);
    if (!customer?.id) return jsonResponse(403, { success: false, error: "Geen klantprofiel gekoppeld aan deze sessie." });

    if (event.httpMethod === "POST") return handlePreviewAction(context, customer, authUser, parsePayload(event.body));

    const versionId = uuidOrEmpty(event.queryStringParameters?.versionId || event.queryStringParameters?.version_id);
    const filter = versionId
      ? `id=eq.${versionId}&customer_id=eq.${customer.id}`
      : `customer_id=eq.${customer.id}`;
    const rows = await readRows(context, "website_preview_versions", [
      "select=id,customer_id,project_id,website_id,version,title,customer_summary,change_summary,safe_preview_path,published_to_portal,published_at,review_deadline,allow_feedback,allow_approval,status,approved_at,feedback_items,created_at",
      filter,
      "published_to_portal=eq.true",
      "order=published_at.desc.nullslast,version.desc",
      "limit=25",
    ].join("&"));

    return jsonResponse(200, {
      success: true,
      customer: { id: customer.id, name: cleanText(customer.name), company: cleanText(customer.company || customer.company_name) },
      previewVersions: rows.map(sanitizeClientVersion),
    });
  } catch (error) {
    console.error("Client preview versions failed", { message: error.message, status: error.status || 500, code: error.code || "" });
    return jsonResponse(error.status || 500, {
      success: false,
      error: isMissingPreviewSchema(error)
        ? "Er staan nog geen gepubliceerde previews klaar."
        : error.message || "Previews konden niet worden geladen.",
      setupRequired: isMissingPreviewSchema(error),
    });
  }
};

async function handlePreviewAction(context, customer, authUser, payload = {}) {
  const action = cleanText(payload.action).toLowerCase();
  const versionId = uuidOrEmpty(payload.previewVersionId || payload.preview_version_id);
  if (!versionId) return jsonResponse(400, { success: false, error: "Previewversie ontbreekt." });
  const version = await readSingle(context, "website_preview_versions", [
    "select=*",
    `id=eq.${versionId}`,
    `customer_id=eq.${customer.id}`,
    "published_to_portal=eq.true",
    "limit=1",
  ].join("&"));
  if (!version?.id) return jsonResponse(404, { success: false, error: "Previewversie niet gevonden voor dit klantaccount." });
  if (action === "feedback") return savePreviewFeedback(context, customer, authUser, version, payload);
  if (action === "approve") return approvePreviewVersion(context, customer, authUser, version, payload);
  return jsonResponse(400, { success: false, error: "Onbekende previewactie." });
}

async function savePreviewFeedback(context, customer, authUser, version, payload) {
  if (version.allow_feedback === false) return jsonResponse(403, { success: false, error: "Feedback is voor deze previewversie gesloten." });
  const comment = cleanText(payload.comment || payload.feedback || payload.description).slice(0, 2500);
  if (!comment) return jsonResponse(400, { success: false, error: "Feedbacktekst ontbreekt." });
  const idempotencyKey = cleanText(payload.idempotencyKey || payload.idempotency_key) || hashText([version.id, authUser.id, comment].join(":"));
  const currentItems = Array.isArray(version.feedback_items) ? version.feedback_items : [];
  const existing = currentItems.find((item) => cleanText(item.idempotencyKey) === idempotencyKey);
  if (existing) {
    await ensureFeedbackSideEffects(context, customer, authUser, version, existing);
    return jsonResponse(200, { success: true, duplicate: true, previewVersion: sanitizeClientVersion(version), feedback: sanitizeFeedbackItem(existing) });
  }

  const now = new Date().toISOString();
  const feedback = {
    id: randomUUID(),
    idempotencyKey,
    page: cleanText(payload.page || "Algemeen").slice(0, 120),
    section: cleanText(payload.section || "Overig").slice(0, 120),
    category: cleanText(payload.category || "algemeen").slice(0, 80),
    priority: cleanText(payload.priority || "normaal").slice(0, 40),
    comment,
    screenshot: cleanText(payload.screenshot || "").slice(0, 500),
    status: "open",
    createdAt: now,
    createdByAuthUserId: authUser.id,
  };
  const nextItems = [...currentItems, feedback];
  const rows = await patchRows(context, "website_preview_versions", `id=eq.${version.id}`, {
    feedback_items: nextItems,
    status: "feedback_received",
    updated_at: now,
  });
  const updated = rows[0] || { ...version, feedback_items: nextItems, status: "feedback_received" };
  await ensureFeedbackSideEffects(context, customer, authUser, version, feedback);
  return jsonResponse(200, { success: true, previewVersion: sanitizeClientVersion(updated), feedback: sanitizeFeedbackItem(feedback) });
}

async function ensureFeedbackSideEffects(context, customer, authUser, version, feedback) {
  await createChangeRequestForFeedback(context, customer, authUser, version, feedback);
  await safeTimeline({
    customerId: customer.id,
    eventType: "feedback_created",
    title: "Feedback ontvangen op website-preview",
    description: feedback.comment,
    module: "website",
    referenceType: "website_preview_version",
    referenceId: version.id,
    actorName: customer.name || authUser.email || "Klant",
    actorRole: "customer",
    severity: feedback.priority === "hoog" ? "warning" : "info",
    metadata: { dedupeKey: `preview_feedback:${feedback.id}`, previewVersionId: version.id, websiteId: version.website_id || "" },
  });
}

async function approvePreviewVersion(context, customer, authUser, version, payload) {
  if (version.allow_approval === false) return jsonResponse(403, { success: false, error: "Goedkeuring is voor deze previewversie gesloten." });
  if (version.approved_at) return jsonResponse(200, { success: true, duplicate: true, previewVersion: sanitizeClientVersion(version) });
  const now = new Date().toISOString();
  const rows = await patchRows(context, "website_preview_versions", `id=eq.${version.id}`, {
    approved_at: now,
    approved_by_auth_user_id: authUser.id,
    status: "approved",
    approval_metadata: {
      approvedByEmail: authUser.email || "",
      approvedByCustomerId: customer.id,
      note: cleanText(payload.note || payload.feedback).slice(0, 1000),
      approvedAt: now,
    },
    updated_at: now,
  });
  const updated = rows[0] || { ...version, approved_at: now, approved_by_auth_user_id: authUser.id, status: "approved" };
  await safeTimeline({
    customerId: customer.id,
    eventType: "preview_approved",
    title: "Website-preview goedgekeurd",
    description: `Preview V${version.version || 1} is goedgekeurd door de klant.`,
    module: "website",
    referenceType: "website_preview_version",
    referenceId: version.id,
    actorName: customer.name || authUser.email || "Klant",
    actorRole: "customer",
    severity: "success",
    metadata: { dedupeKey: `preview_approved:${version.id}`, previewVersionId: version.id, websiteId: version.website_id || "" },
  });
  return jsonResponse(200, { success: true, previewVersion: sanitizeClientVersion(updated) });
}

async function readAuthUser(context, bearer) {
  if (!bearer) {
    const error = new Error("Niet ingelogd.");
    error.status = 401;
    throw error;
  }
  const response = await fetch(`${context.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: { apikey: context.anonKey, Authorization: `Bearer ${bearer}`, Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    const error = new Error("Sessie is ongeldig.");
    error.status = 401;
    throw error;
  }
  return data;
}

async function resolveCustomerForAuthUser(context, authUserId) {
  const direct = await readSingle(context, "customers", `select=*&auth_user_id=eq.${encodeURIComponent(authUserId)}&limit=1`);
  if (direct?.id) return direct;
  const profile = await readSingle(context, "profiles", `select=*&auth_user_id=eq.${encodeURIComponent(authUserId)}&limit=1`);
  if (!profile?.id) return null;
  return readSingle(context, "customers", `select=*&profile_id=eq.${encodeURIComponent(profile.id)}&limit=1`);
}

async function readRows(context, table, query) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
}

async function patchRows(context, table, filter, record) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(record),
  });
}

async function insertRows(context, table, record) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...restHeaders(context.serviceRoleKey), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(record),
  });
}

async function readSingle(context, table, query) {
  const rows = await readRows(context, table, query);
  return Array.isArray(rows) ? rows[0] || null : null;
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
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function sanitizeClientVersion(row = {}) {
  const safePath = cleanText(row.safe_preview_path) || `/preview.html?version=${encodeURIComponent(cleanText(row.id))}`;
  return {
    id: cleanText(row.id),
    projectId: cleanText(row.project_id),
    websiteId: cleanText(row.website_id),
    version: Number(row.version || 1),
    title: cleanText(row.title) || "Website-preview",
    summary: cleanText(row.customer_summary),
    changeSummary: cleanText(row.change_summary),
    safePreviewPath: safePath,
    publishedAt: cleanText(row.published_at),
    reviewDeadline: cleanText(row.review_deadline),
    allowFeedback: row.allow_feedback !== false,
    allowApproval: row.allow_approval !== false,
    status: cleanText(row.status || "ready_for_review"),
    approvedAt: cleanText(row.approved_at),
    feedbackCount: Array.isArray(row.feedback_items) ? row.feedback_items.length : 0,
    feedbackItems: Array.isArray(row.feedback_items) ? row.feedback_items.map(sanitizeFeedbackItem) : [],
  };
}

function sanitizeFeedbackItem(item = {}) {
  return {
    id: cleanText(item.id),
    page: cleanText(item.page),
    section: cleanText(item.section),
    category: cleanText(item.category),
    priority: cleanText(item.priority),
    comment: cleanText(item.comment || item.description),
    status: cleanText(item.status || "open"),
    createdAt: cleanText(item.createdAt || item.created_at),
  };
}

async function createChangeRequestForFeedback(context, customer, authUser, version, feedback) {
  try {
    const existing = await findChangeRequestForFeedback(context, version.id, feedback.id);
    if (existing?.id) return existing;
    const category = feedback.category || "preview-feedback";
    const record = {
      customer_id: customer.id,
      auth_user_id: authUser.id,
      website_id: version.website_id || null,
      project_id: version.project_id || null,
      name: customer.name || authUser.email || "Klant",
      company: customer.company || customer.company_name || "",
      email: customer.email || authUser.email || "",
      title: `Feedback op preview V${version.version || 1}`,
      description: feedback.comment,
      category,
      change_category: category,
      priority: feedback.priority || "normaal",
      status: "nieuw",
      source: "preview_review",
      first_name: firstName(customer.name || authUser.email || "Klant"),
      last_name: lastName(customer.name || authUser.email || "Klant"),
      company_name: customer.company || customer.company_name || "",
      phone: customer.phone || "",
      website: version.website_id || "",
      care_plan: "preview-review",
      internal_classification: "handmatig beoordelen",
      metadata: {
        previewVersionId: version.id,
        feedbackId: feedback.id,
        page: feedback.page,
        section: feedback.section,
        screenshot: feedback.screenshot,
      },
    };
    return await insertCompatibleChangeRequest(context, record);
  } catch (error) {
    console.error("Preview feedback change request skipped", { message: error.message });
    return null;
  }
}

async function insertCompatibleChangeRequest(context, record) {
  const modernRecord = { ...record };
  delete modernRecord.change_category;
  delete modernRecord.first_name;
  delete modernRecord.last_name;
  delete modernRecord.company_name;
  delete modernRecord.phone;
  delete modernRecord.website;
  delete modernRecord.care_plan;
  delete modernRecord.internal_classification;

  const legacyRecord = { ...record };
  delete legacyRecord.customer_id;
  delete legacyRecord.auth_user_id;
  delete legacyRecord.website_id;
  delete legacyRecord.project_id;
  delete legacyRecord.category;

  let lastError = null;
  for (const candidate of [record, modernRecord, legacyRecord]) {
    try {
      const rows = await insertRows(context, "change_requests", candidate);
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      if (!isMissingChangeRequestColumn(error)) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error("Wijzigingsverzoek kon niet worden aangemaakt.");
}

async function findChangeRequestForFeedback(context, previewVersionId, feedbackId) {
  const rows = await readRows(context, "change_requests", [
    "select=id,metadata,source",
    "source=eq.preview_review",
    `metadata->>previewVersionId=eq.${encodeURIComponent(previewVersionId)}`,
    `metadata->>feedbackId=eq.${encodeURIComponent(feedbackId)}`,
    "limit=1",
  ].join("&"));
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function safeTimeline(input) {
  try {
    return await createTimelineEvent(input);
  } catch (error) {
    console.error("Preview review timeline skipped", { message: error.message });
    return null;
  }
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

function hashText(value = "") {
  return createHash("sha256").update(String(value)).digest("hex");
}

function getContext() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const anonKey = cleanText(process.env.SUPABASE_ANON_KEY);
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { available: Boolean(supabaseUrl && anonKey && serviceRoleKey), supabaseUrl, anonKey, serviceRoleKey };
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

function getBearer(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

function uuidOrEmpty(value) {
  const text = cleanText(value);
  return uuidPattern.test(text) ? text : "";
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function isMissingPreviewSchema(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return text.includes("website_preview_versions") || text.includes("schema cache") || text.includes("pgrst205");
}

function isMissingChangeRequestColumn(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return text.includes("schema cache")
    || text.includes("column")
    || text.includes("change_requests")
    || text.includes("null value in column");
}

function firstName(value = "") {
  return cleanText(value).split(/\s+/).filter(Boolean)[0] || "Klant";
}

function lastName(value = "") {
  const parts = cleanText(value).split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" ") : "-";
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders({ methods: "GET, POST, OPTIONS" }) },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
