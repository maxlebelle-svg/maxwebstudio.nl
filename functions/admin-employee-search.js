const { verifyAdmin } = require("./_admin-auth");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_ROLES = ["super_admin", "admin", "sales_manager", "sales_partner", "designer", "developer", "support"];
const AUTH_ROLES = [...INTERNAL_ROLES, "sales"];
const SELECT = [
  "id", "auth_user_id", "name", "role", "status", "email",
  "avatarUrl:metadata->>avatarUrl", "avatar_url:metadata->>avatar_url",
  "team:metadata->>team", "serviceAccount:metadata->>serviceAccount", "service_account:metadata->>service_account",
].join(",");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { success: false, code: "INVALID_METHOD", error: "Alleen GET-verzoeken zijn toegestaan." });
  const auth = await verifyAdmin(event, json, { module: "employee_search", action: "perspective_read", allowedRoles: AUTH_ROLES, allowedStatuses: ["active"] });
  if (!auth.success) return auth.response;
  if (normalizeRole(auth.admin?.role) !== "super_admin") return json(403, { success: false, code: "SUPER_ADMIN_REQUIRED", error: "Alleen een super admin kan medewerkers bekijken." });

  const params = queryParams(event);
  const id = clean(params.get("id"));
  const query = clean(params.get("q") || params.get("query")).replace(/[,%()]/g, " ").trim().slice(0, 80);
  const limit = Math.min(Math.max(Number(params.get("limit") || 20), 1), 20);
  if (id && !UUID.test(id)) return json(400, { success: false, code: "INVALID_PROFILE_ID", error: "Kies een geldige medewerker." });
  if (!id && query && query.length < 2) return success(auth.admin, { results: [], limit, hasMore: false });

  const context = { url: clean(process.env.SUPABASE_URL).replace(/\/$/, ""), key: clean(process.env.SUPABASE_SERVICE_ROLE_KEY) };
  if (!context.url || !context.key) return json(503, { success: false, code: "SERVICE_UNAVAILABLE", error: "Medewerkerzoeken is tijdelijk niet beschikbaar." });

  try {
    if (id) {
      const rows = await fetchEmployees(context, { id, limit: 1 });
      const employee = rows.map(mapEmployee).find(Boolean) || null;
      if (!employee) return json(404, { success: false, code: "EMPLOYEE_NOT_FOUND", error: "Deze medewerker is niet beschikbaar." });
      return success(auth.admin, { employee, results: [employee], limit: 1, hasMore: false, perspective: perspectiveMeta(auth.admin, employee) });
    }
    const attempts = query
      ? await Promise.all([fetchEmployees(context, { query, field: "name", limit }), fetchEmployees(context, { query, field: "email", limit })])
      : [await fetchEmployees(context, { limit })];
    const employees = [...new Map(attempts.flat().map((row) => [clean(row.id), row])).values()]
      .map(mapEmployee).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "nl"));
    return success(auth.admin, { results: employees.slice(0, limit), limit, hasMore: employees.length > limit });
  } catch (error) {
    console.error("Employee search failed", { code: error.code || "QUERY_FAILED", status: error.status || 500 });
    return json(error.status || 500, { success: false, code: error.code || "QUERY_FAILED", error: "Medewerkers konden niet veilig worden geladen." });
  }
};

async function fetchEmployees(context, options = {}) {
  const params = new URLSearchParams({ select: SELECT, status: "eq.active", role: `in.(${INTERNAL_ROLES.join(",")})`, order: "name.asc.nullslast", limit: String(options.limit || 20) });
  if (options.id) params.set("id", `eq.${options.id}`);
  if (options.query && options.field) params.set(options.field, `ilike.*${options.query}*`);
  const response = await timedFetch(`${context.url}/rest/v1/profiles?${params}`, { headers: { apikey: context.key, Authorization: `Bearer ${context.key}`, Accept: "application/json" } });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw Object.assign(new Error("Profile query failed."), { status: response.status >= 500 ? 503 : 400, code: "QUERY_FAILED" });
  return Array.isArray(data) ? data : [];
}

function mapEmployee(row = {}) {
  const id = clean(row.id);
  const authUserId = clean(row.auth_user_id);
  const name = clean(row.name);
  const role = normalizeRole(row.role);
  const status = clean(row.status).toLowerCase();
  const email = clean(row.email).toLowerCase();
  if (!UUID.test(id) || !UUID.test(authUserId) || !name || status !== "active" || !INTERNAL_ROLES.includes(role)) return null;
  if (truthy(row.serviceAccount) || truthy(row.service_account) || /^(service|system|automation|noreply|no-reply|bot)[+@._-]/.test(email)) return null;
  return { id, authUserId, name, role, status: "active", avatarUrl: safeAvatarUrl(row.avatarUrl || row.avatar_url), team: clean(row.team).slice(0, 80) || null };
}

function perspectiveMeta(admin, employee) {
  return { actorProfileId: clean(admin?.profileId) || null, viewedProfileId: employee.id, perspectiveActive: true };
}

function safeAvatarUrl(value) {
  const url = clean(value);
  if (!url) return null;
  if (url.startsWith("/assets/") || url.startsWith("/images/")) return url;
  try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.toString() : null; } catch { return null; }
}

async function timedFetch(url, options, timeoutMs = 5000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) { if (error.name === "AbortError") throw Object.assign(new Error("Employee query timed out."), { status: 503, code: "QUERY_TIMEOUT" }); throw error; }
  finally { clearTimeout(timer); }
}

function truthy(value) { return value === true || ["true", "1", "yes"].includes(clean(value).toLowerCase()); }
function normalizeRole(value) { return clean(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function clean(value) { return String(value ?? "").trim(); }
function queryParams(event) { if (event.rawQuery) return new URLSearchParams(event.rawQuery); const params = new URLSearchParams(); Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => { if (value != null) params.set(key, value); }); return params; }
function success(admin, payload) { return json(200, { success: true, actorProfileId: clean(admin?.profileId) || null, perspectiveActive: false, ...payload }); }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" }, body: JSON.stringify(body) }; }

exports._test = { INTERNAL_ROLES, mapEmployee, perspectiveMeta, safeAvatarUrl };
