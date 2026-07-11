const { corsHeaders } = require("./_cors");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "GET") return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });

  const context = getContext();
  if (!context.available) return jsonResponse(500, { success: false, error: "Previewomgeving is nog niet geconfigureerd." });

  try {
    const authUser = await readAuthUser(context, getBearer(event));
    const customer = await resolveCustomerForAuthUser(context, authUser.id);
    if (!customer?.id) return jsonResponse(403, { success: false, error: "Geen klantprofiel gekoppeld aan deze sessie." });

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

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders({ methods: "GET, OPTIONS" }) },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
