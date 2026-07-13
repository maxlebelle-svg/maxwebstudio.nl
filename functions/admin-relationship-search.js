const { verifyAdmin } = require("./_admin-auth");

const ALLOWED_ROLES = ["super_admin", "admin", "sales_manager", "sales_partner"];
const ELEVATED_ROLES = new Set(["super_admin", "admin", "sales_manager"]);
const TYPES = new Set(["", "all", "lead", "customer"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { success: false, code: "INVALID_METHOD", error: "Alleen GET-verzoeken zijn toegestaan." });
  const auth = await verifyAdmin(event, json, { module: "relationship_search", action: "search", allowedRoles: ALLOWED_ROLES });
  if (!auth.success) return auth.response;

  const params = queryParams(event);
  const query = clean(params.get("q") || params.get("query")).replace(/[,%()]/g, " ").trim().slice(0, 80);
  const type = clean(params.get("type")).toLowerCase();
  const limit = Math.min(Math.max(Number(params.get("limit") || 20), 1), 20);
  if (!TYPES.has(type)) return json(400, { success: false, code: "INVALID_TYPE", error: "Kies Leads, Klanten of Alle." });
  if (query.length < 2) return json(200, { success: true, results: [], limit, hasMore: false });

  const context = {
    url: clean(process.env.SUPABASE_URL).replace(/\/$/, ""),
    key: clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    admin: auth.admin || {},
  };
  if (!context.url || !context.key) return json(503, { success: false, code: "SERVICE_UNAVAILABLE", error: "Relatiezoeken is tijdelijk niet beschikbaar." });

  try {
    const tasks = [];
    if (!type || type === "all" || type === "customer") tasks.push(searchEntity(context, "customer", query, limit));
    if (!type || type === "all" || type === "lead") tasks.push(searchEntity(context, "lead", query, limit));
    const rows = (await Promise.all(tasks)).flat();
    const unique = [...new Map(rows.map((row) => [`${row.entityType}:${row.id}`, row])).values()]
      .sort((a, b) => Number(exactMatch(b, query)) - Number(exactMatch(a, query)) || a.companyName.localeCompare(b.companyName, "nl"));
    return json(200, { success: true, results: unique.slice(0, limit), limit, hasMore: unique.length > limit });
  } catch (error) {
    console.error("Relationship search failed", { code: error.code || "SEARCH_FAILED", phase: error.phase || "search", status: error.status || 500 });
    return json(error.status || 500, { success: false, code: error.code || "SEARCH_FAILED", error: "Relaties konden niet worden doorzocht. Probeer het opnieuw." });
  }
};

async function searchEntity(context, entityType, query, limit) {
  const table = entityType === "lead" ? "leads" : "customers";
  const fields = entityType === "lead" ? ["company_name", "company", "name", "contact_name", "email"] : ["company", "name", "email"];
  const scope = ownershipFilter(context.admin, entityType);
  const attempts = await Promise.allSettled(fields.map(async (field) => {
    const params = new URLSearchParams({ select: "*", limit: String(limit) });
    params.set(field, `ilike.*${query}*`);
    if (scope) params.set("or", `(${scope})`);
    const response = await fetch(`${context.url}/rest/v1/${table}?${params.toString()}`, { headers: restHeaders(context.key) });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw Object.assign(new Error("Search query failed."), { status: response.status >= 500 ? 503 : 400, code: "QUERY_FAILED" });
    return Array.isArray(rows) ? rows : [];
  }));
  const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
  if (!fulfilled.length) {
    const error = attempts.find((attempt) => attempt.status === "rejected")?.reason || new Error("Search failed.");
    error.phase = `search_${table}`;
    throw error;
  }
  return [...new Map(fulfilled.flatMap((attempt) => attempt.value).filter((row) => row?.id).map((row) => [row.id, row])).values()]
    .filter((row) => !isUnavailable(row) && canAccess(context.admin, entityType, row))
    .map((row) => mapResult(entityType, row));
}

function ownershipFilter(admin = {}, entityType = "lead") {
  const role = normalizeRole(admin.role);
  if (ELEVATED_ROLES.has(role)) return "";
  if (role !== "sales_partner") return "id.eq.__none__";
  const id = clean(admin.id);
  const profileId = clean(admin.profileId);
  const filters = [];
  const add = (field, value) => { if (value) filters.push(`${field}.eq.${value}`); };
  if (entityType === "lead") {
    add("assigned_user_id", id); add("owner_auth_user_id", id); add("owner_profile_id", profileId);
  }
  add("metadata->>assignedUserId", id); add("metadata->>assigned_user_id", id);
  add("metadata->>ownerAuthUserId", id); add("metadata->>owner_auth_user_id", id);
  add("metadata->>ownerProfileId", profileId); add("metadata->>owner_profile_id", profileId);
  return filters.join(",") || "id.eq.__none__";
}

function canAccess(admin = {}, entityType, row = {}) {
  const role = normalizeRole(admin.role);
  if (ELEVATED_ROLES.has(role)) return true;
  if (role !== "sales_partner") return false;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const owners = [
    entityType === "lead" && row.assigned_user_id,
    entityType === "lead" && row.owner_auth_user_id,
    entityType === "lead" && row.owner_profile_id,
    meta.assignedUserId, meta.assigned_user_id, meta.ownerAuthUserId, meta.owner_auth_user_id, meta.ownerProfileId, meta.owner_profile_id,
  ].map(clean).filter(Boolean);
  return owners.includes(clean(admin.id)) || owners.includes(clean(admin.profileId));
}

function mapResult(entityType, row = {}) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    entityType,
    id: clean(row.id),
    companyName: clean(row.company_name || row.company || row.name) || (entityType === "lead" ? "Onbekende lead" : "Onbekende klant"),
    contactName: clean(row.contact_name || (entityType === "customer" ? row.name : "")),
    email: clean(row.email),
    status: clean(row.lead_status || row.portal_status || row.status || row.package),
    assignedUserName: clean(row.assigned_user_name || meta.assignedUserName || meta.ownerName),
  };
}

function isUnavailable(row = {}) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const status = clean(row.status || row.portal_status).toLowerCase();
  return Boolean(row.archived_at || row.deleted_at || meta.archivedAt || meta.archived_at || meta.deletedAt || meta.deleted_at) || ["archived", "gearchiveerd", "deleted", "inactive"].includes(status);
}

function exactMatch(row, query) { return [row.companyName, row.email].map((value) => clean(value).toLowerCase()).includes(clean(query).toLowerCase()); }
function normalizeRole(value) { return clean(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function restHeaders(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }; }
function clean(value) { return String(value || "").trim(); }
function queryParams(event) { if (event.rawQuery) return new URLSearchParams(event.rawQuery); const params = new URLSearchParams(); Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => { if (value != null) params.set(key, value); }); return params; }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) }; }

exports._test = { canAccess, exactMatch, isUnavailable, mapResult, ownershipFilter, searchEntity };
