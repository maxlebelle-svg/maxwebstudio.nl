const { verifyAdmin } = require("./_admin-auth");

const ALLOWED_ROLES = ["super_admin", "admin", "developer", "sales_manager", "sales_partner"];
const ELEVATED_ROLES = new Set(["super_admin", "admin", "developer", "sales_manager"]);
const TYPES = new Set(["", "all", "lead", "customer"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { success: false, code: "INVALID_METHOD", error: "Alleen GET-verzoeken zijn toegestaan." });
  const auth = await verifyAdmin(event, json, { module: "relationship_search", action: "search", allowedRoles: ALLOWED_ROLES });
  if (!auth.success) return auth.response;

  const params = queryParams(event);
  const query = clean(params.get("q") || params.get("query")).replace(/[,%()]/g, " ").trim().slice(0, 80);
  const type = clean(params.get("type")).toLowerCase();
  const limit = Math.min(Math.max(Number(params.get("limit") || 20), 1), 50);
  const page = Math.min(Math.max(Math.trunc(Number(params.get("page") || 0)), 0), 200);
  const recipientMode = clean(params.get("purpose")).toLowerCase() === "mail-recipient";
  const relationshipType = clean(params.get("relationshipType")).toLowerCase();
  const relationshipId = clean(params.get("relationshipId"));
  if (!TYPES.has(type)) return json(400, { success: false, code: "INVALID_TYPE", error: "Kies Leads, Klanten of Alle." });

  const context = {
    url: clean(process.env.SUPABASE_URL).replace(/\/$/, ""),
    key: clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    admin: auth.admin || {},
  };
  if (!context.url || !context.key) return json(503, { success: false, code: "SERVICE_UNAVAILABLE", error: "Relatiezoeken is tijdelijk niet beschikbaar." });

  try {
    if (recipientMode && relationshipId) {
      if (!["lead", "customer"].includes(relationshipType)) return json(400, { success: false, code: "INVALID_TYPE", error: "Kies een geldige lead of klant." });
      const row = await readEntity(context, relationshipType, relationshipId);
      if (!row || isUnavailable(row)) return json(404, { success: false, code: "NOT_FOUND", error: "De actieve relatie bestaat niet meer of is niet beschikbaar." });
      if (!canAccess(context.admin, relationshipType, row)) return json(403, { success: false, code: "FORBIDDEN", error: "Je hebt geen toegang tot deze relatie." });
      const result = mapResult(relationshipType, row);
      if (!result.email) return json(422, { success: false, code: "EMAIL_MISSING", error: "De actieve relatie heeft geen e-mailadres en kan niet worden geselecteerd." });
      return json(200, { success: true, result, results: [result], limit: 1, page: 0, hasMore: false });
    }
    const tasks = [];
    const selectedTypeCount = !type || type === "all" ? 2 : 1;
    const pageSize = recipientMode ? limit : Math.max(1, Math.ceil(limit / selectedTypeCount));
    const fetchLimit = pageSize + 1;
    const offset = page * pageSize;
    if (!type || type === "all" || type === "customer") tasks.push(query ? searchEntity(context, "customer", query, fetchLimit, offset) : listRecentEntity(context, "customer", fetchLimit, offset));
    if (!type || type === "all" || type === "lead") tasks.push(query ? searchEntity(context, "lead", query, fetchLimit, offset) : listRecentEntity(context, "lead", fetchLimit, offset));
    const groups = await Promise.all(tasks);
    const hasMore = groups.some((group) => group.length > pageSize);
    const rows = groups.flatMap((group) => group.slice(0, pageSize));
    const unique = [...new Map(rows.map((row) => [`${row.entityType}:${row.id}`, row])).values()]
      .filter((row) => !recipientMode || Boolean(row.email))
      .sort((a, b) => Number(exactMatch(b, query)) - Number(exactMatch(a, query)) || relationshipTimestamp(b) - relationshipTimestamp(a) || a.companyName.localeCompare(b.companyName, "nl"));
    return json(200, { success: true, results: recipientMode ? unique.slice(0, limit) : unique, limit, page, hasMore });
  } catch (error) {
    console.error("Relationship search failed", { code: error.code || "SEARCH_FAILED", phase: error.phase || "search", status: error.status || 500 });
    return json(error.status || 500, { success: false, code: error.code || "SEARCH_FAILED", error: "Relaties konden niet worden doorzocht. Probeer het opnieuw." });
  }
};

async function readEntity(context, entityType, id) {
  const table = entityType === "lead" ? "leads" : "customers";
  const params = new URLSearchParams({ select: "*", id: `eq.${id}`, limit: "1" });
  const response = await fetch(`${context.url}/rest/v1/${table}?${params.toString()}`, { headers: restHeaders(context.key) });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw Object.assign(new Error("Relationship query failed."), { status: response.status >= 500 ? 503 : 400, code: "QUERY_FAILED", phase: `read_${table}` });
  return Array.isArray(rows) ? rows[0] : null;
}

async function listRecentEntity(context, entityType, limit, offset = 0) {
  const table = entityType === "lead" ? "leads" : "customers";
  const attempts = await Promise.allSettled(["created_at", "updated_at"].map(async (orderField) => {
    const params = new URLSearchParams({ select: "*", order: `${orderField}.desc.nullslast`, limit: String(limit), offset: String(offset) });
    const response = await fetch(`${context.url}/rest/v1/${table}?${params.toString()}`, { headers: restHeaders(context.key) });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw Object.assign(new Error("Recent relationship query failed."), { status: response.status >= 500 ? 503 : 400, code: "QUERY_FAILED" });
    return Array.isArray(rows) ? rows : [];
  }));
  const fulfilled = attempts.find((attempt) => attempt.status === "fulfilled");
  if (!fulfilled) throw Object.assign(new Error("Recent relationship query failed."), { status: 503, code: "QUERY_FAILED", phase: `recent_${table}` });
  return fulfilled.value.filter((row) => !isUnavailable(row) && canAccess(context.admin, entityType, row)).map((row) => mapResult(entityType, row));
}

async function searchEntity(context, entityType, query, limit, offset = 0) {
  const table = entityType === "lead" ? "leads" : "customers";
  if (normalizeRole(context.admin?.role) === "sales_partner") return searchScopedEntity(context, entityType, query, limit);
  const fields = entityType === "lead" ? ["company_name", "company", "name", "contact_name", "email"] : ["company", "name", "email"];
  const scope = ownershipFilter(context.admin, entityType);
  const attempts = await Promise.allSettled(fields.map(async (field) => {
    const params = new URLSearchParams({ select: "*", limit: String(limit), offset: String(offset) });
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

async function searchScopedEntity(context, entityType, query, limit) {
  const table = entityType === "lead" ? "leads" : "customers";
  const attempts = await Promise.allSettled(ownershipVariants(context.admin, entityType).map(async ({ field, value }) => {
    const params = new URLSearchParams({ select: "*", limit: String(Math.min(Math.max(limit * 5, 50), 100)) });
    params.set(field, `eq.${value}`);
    const response = await fetch(`${context.url}/rest/v1/${table}?${params.toString()}`, { headers: restHeaders(context.key) });
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw Object.assign(new Error("Scoped relationship query failed."), { status: response.status >= 500 ? 503 : 400, code: "QUERY_FAILED" });
    return Array.isArray(rows) ? rows : [];
  }));
  const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
  if (!fulfilled.length) throw Object.assign(new Error("Scoped relationship search failed."), { status: 503, code: "QUERY_FAILED", phase: `search_${table}_scope` });
  return [...new Map(fulfilled.flatMap((attempt) => attempt.value).filter((row) => row?.id).map((row) => [row.id, row])).values()]
    .filter((row) => matchesQuery(row, query) && !isUnavailable(row) && canAccess(context.admin, entityType, row))
    .slice(0, limit)
    .map((row) => mapResult(entityType, row));
}

function ownershipVariants(admin = {}, entityType = "lead") {
  const id = clean(admin.id);
  const profileId = clean(admin.profileId);
  const variants = [];
  const add = (field, value) => { if (value) variants.push({ field, value }); };
  if (entityType === "lead") { add("assigned_user_id", id); add("owner_id", id); add("assigned_to", id); }
  add("owner_auth_user_id", id); add("owner_profile_id", profileId);
  add("metadata->>assignedUserId", id); add("metadata->>assigned_user_id", id);
  add("metadata->>ownerAuthUserId", id); add("metadata->>owner_auth_user_id", id);
  add("metadata->>ownerProfileId", profileId); add("metadata->>owner_profile_id", profileId);
  return variants;
}

function matchesQuery(row = {}, query = "") {
  const needle = clean(query).toLowerCase();
  return [row.company_name, row.company, row.name, row.contact_name, row.email].some((value) => clean(value).toLowerCase().includes(needle));
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
    row.assigned_user_id, row.owner_auth_user_id, row.owner_profile_id, row.owner_id, row.assigned_to,
    meta.assignedUserId, meta.assigned_user_id, meta.ownerAuthUserId, meta.owner_auth_user_id, meta.ownerProfileId, meta.owner_profile_id,
  ].map(clean).filter(Boolean);
  return owners.includes(clean(admin.id)) || owners.includes(clean(admin.profileId));
}

function mapResult(entityType, row = {}) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const relationshipId = clean(row.id);
  return {
    entityType,
    relationshipType: entityType,
    relationshipId,
    id: relationshipId,
    leadId: entityType === "lead" ? relationshipId : null,
    customerId: entityType === "customer" ? relationshipId : null,
    companyName: clean(row.company_name || row.company || row.name) || (entityType === "lead" ? "Onbekende lead" : "Onbekende klant"),
    contactName: clean(row.contact_name || (entityType === "customer" ? row.name : "")),
    email: clean(row.email),
    status: clean(row.lead_status || row.portal_status || row.status || row.package),
    assignedUserName: clean(row.assigned_user_name || meta.assignedUserName || meta.ownerName),
    createdAt: clean(row.created_at || meta.createdAt || meta.created_at || row.updated_at),
  };
}

function isUnavailable(row = {}) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const status = clean(row.status || row.portal_status).toLowerCase();
  const environment = clean(row.environment || meta.environment).toLowerCase();
  return Boolean(row.archived_at || row.deleted_at || row.is_demo || row.is_test || meta.archivedAt || meta.archived_at || meta.deletedAt || meta.deleted_at || meta.isDemo || meta.is_demo || meta.isTest || meta.is_test)
    || ["archived", "gearchiveerd", "deleted", "inactive"].includes(status)
    || ["demo", "test", "testing"].includes(environment);
}

function exactMatch(row, query) { const needle = clean(query).toLowerCase(); return Boolean(needle) && [row.companyName, row.email].map((value) => clean(value).toLowerCase()).includes(needle); }
function relationshipTimestamp(row = {}) { const value = Date.parse(row.createdAt || ""); return Number.isFinite(value) ? value : 0; }
function normalizeRole(value) { return clean(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function restHeaders(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }; }
function clean(value) { return String(value || "").trim(); }
function queryParams(event) { if (event.rawQuery) return new URLSearchParams(event.rawQuery); const params = new URLSearchParams(); Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => { if (value != null) params.set(key, value); }); return params; }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) }; }

exports._test = { canAccess, exactMatch, isUnavailable, listRecentEntity, mapResult, matchesQuery, ownershipFilter, ownershipVariants, readEntity, relationshipTimestamp, searchEntity, searchScopedEntity };
