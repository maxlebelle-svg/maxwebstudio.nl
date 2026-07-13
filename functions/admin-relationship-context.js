const { verifyAdmin } = require("./_admin-auth");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = ["super_admin", "admin", "sales_manager", "sales_partner", "sales", "designer", "developer", "support"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return failure(405, "INVALID_METHOD", "Alleen POST-verzoeken zijn toegestaan.");
  const auth = await verifyAdmin(event, json, { module: "relationship_context", action: "resolve", allowedRoles: ROLES });
  if (!auth.success) return auth.response;
  try {
    const input = JSON.parse(event.body || "{}");
    if (Number(input.contractVersion) !== 2 || text(event.headers?.["x-relationship-contract"] || event.headers?.["X-Relationship-Contract"]) !== "2") return failure(409, "STALE_DEPLOYMENT", "Vernieuw de pagina en probeer opnieuw.");
    const selection = normalizeSelection(input);
    if (!selection.success) return failure(selection.status, selection.code, selection.error);
    const { relationshipType: entityType, relationshipId: id } = selection;
    const config = { url: text(process.env.SUPABASE_URL).replace(/\/$/, ""), key: text(process.env.SUPABASE_SERVICE_ROLE_KEY) };
    if (!config.url || !config.key) return failure(503, "SERVICE_UNAVAILABLE", "Relatiecontrole is tijdelijk niet beschikbaar.");
    const row = await readEntity(config, entityType, id);
    if (!row) return failure(404, "NOT_FOUND", "Deze relatie is niet beschikbaar.");
    if (isUnavailable(row)) return failure(410, "ARCHIVED", "Deze relatie is gearchiveerd.");
    if (!canAccess(auth.admin || {}, entityType, row)) {
      console.warn("Relationship context rejected", { entityType, actor: auth.admin?.id || "legacy", reason: "ownership" });
      return failure(403, "FORBIDDEN", "Je hebt geen toegang tot deze relatie.");
    }
    if (entityType === "lead" && UUID.test(text(row.converted_customer_id))) {
      const customer = await readEntity(config, "customer", row.converted_customer_id);
      if (customer && !isUnavailable(customer) && canAccess(auth.admin || {}, "customer", customer, row)) return success(mapCustomer(customer));
    }
    return success(entityType === "lead" ? mapLead(row) : mapCustomer(row));
  } catch (error) {
    console.error("Relationship context resolution failed", { code: error.code || "INTERNAL_ERROR", phase: error.phase || "resolve", status: error.status || 500 });
    return failure(error.status || 500, error.code || "INTERNAL_ERROR", error.userMessage || "De relatie kon niet veilig worden geladen.");
  }
};

function normalizeSelection(input = {}) {
  const entityType = text(input.entityType).toLowerCase();
  const relationshipType = text(input.relationshipType).toLowerCase();
  if (entityType && relationshipType && entityType !== relationshipType) return invalid(409, "CONTEXT_MISMATCH", "Het relatietype komt niet overeen.");
  const type = relationshipType || entityType;
  if (!["lead", "customer"].includes(type)) return invalid(400, "INVALID_ENTITY_TYPE", "Kies een geldige lead of klant.");
  const relationshipId = text(input.relationshipId);
  const leadId = text(input.leadId);
  const customerId = text(input.customerId);
  if (leadId && customerId) return invalid(409, "CONTEXT_MISMATCH", "Kies één geldige lead of klant.");
  const typedId = type === "lead" ? leadId : customerId;
  const foreignId = type === "lead" ? customerId : leadId;
  if (foreignId || (relationshipId && typedId && relationshipId !== typedId)) return invalid(409, "CONTEXT_MISMATCH", "De relatie-ID komt niet overeen met het relatietype.");
  const id = relationshipId || typedId;
  if (!UUID.test(id)) return invalid(400, "INVALID_ID", "Kies een geldige relatie.");
  return { success: true, relationshipType: type, relationshipId: id, leadId: type === "lead" ? id : null, customerId: type === "customer" ? id : null };
}

function invalid(status, code, error) { return { success: false, status, code, error }; }

async function readEntity(config, type, id) {
  const table = type === "lead" ? "leads" : "customers";
  const response = await fetch(`${config.url}/rest/v1/${table}?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json" } });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw Object.assign(new Error("Relationship source query failed."), { status: response.status >= 500 ? 503 : 400, code: "RELATIONSHIP_SOURCE_QUERY_FAILED", phase: `read_${table}`, userMessage: "De relatiebron kon niet veilig worden gecontroleerd. Probeer het later opnieuw." });
  return Array.isArray(rows) ? rows[0] : null;
}
function canAccess(admin, type, row, sourceLead = null) {
  const role = text(admin.role).toLowerCase().replace(/[\s-]+/g, "_");
  if (["super_admin", "admin", "sales_manager", "developer"].includes(role)) return true;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const ownerIds = [row.assigned_user_id, row.owner_auth_user_id, row.owner_profile_id, meta.assignedUserId, meta.assigned_user_id, meta.ownerAuthUserId, meta.owner_profile_id, sourceLead?.assigned_user_id, sourceLead?.owner_auth_user_id].map(text).filter(Boolean);
  if (["sales_partner", "sales"].includes(role)) return ownerIds.includes(text(admin.id)) || ownerIds.includes(text(admin.profileId));
  return type === "customer" && ["designer", "support"].includes(role);
}
function isUnavailable(row) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const statuses = [row.status, row.portal_status, meta.status, meta.portalStatus].map((value) => text(value).toLowerCase());
  return Boolean(meta.archivedAt || meta.archived_at || meta.deletedAt || meta.deleted_at) || statuses.some((status) => ["deleted", "archived", "gearchiveerd", "inactive"].includes(status));
}
function mapLead(row) { const m = row.metadata || {}; return { entityType: "lead", relationshipType: "lead", relationshipId: row.id, leadId: row.id, customerId: null, profileId: text(row.owner_profile_id) || null, companyName: text(row.company_name || row.company || row.name), contactName: text(row.contact_name || row.name), websiteUrl: text(row.website_url || row.website), email: text(row.email), phone: text(row.phone), assignedUserId: text(row.assigned_user_id || row.owner_auth_user_id || row.owner_id || row.assigned_to) || null, assignedUserName: text(row.assigned_user_name || row.owner_name || m.assignedUserName || m.ownerName), lifecycleStage: text(row.lead_status || row.status) }; }
function mapCustomer(row) { const m = row.metadata || {}; return { entityType: "customer", relationshipType: "customer", relationshipId: row.id, leadId: null, customerId: row.id, profileId: text(row.profile_id) || null, companyName: text(row.company || row.name), contactName: text(row.name), websiteUrl: text(row.website), email: text(row.email), phone: text(row.phone), assignedUserId: text(row.assigned_user_id || row.owner_auth_user_id || row.owner_id || m.assignedUserId || m.ownerAuthUserId) || null, assignedUserName: text(row.assigned_user_name || row.owner_name || m.assignedUserName || m.ownerName), lifecycleStage: text(row.portal_status || row.status || row.package) }; }
function text(value) { return String(value || "").trim(); }
function success(relationship) { return json(200, { success: true, contractVersion: 2, relationship }); }
function failure(statusCode, code, error) { return json(statusCode, { success: false, contractVersion: 2, code, error }); }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) }; }

exports._test = { canAccess, isUnavailable, mapLead, mapCustomer, normalizeSelection, readEntity };
