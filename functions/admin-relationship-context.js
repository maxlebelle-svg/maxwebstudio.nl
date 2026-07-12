const { verifyAdmin } = require("./_admin-auth");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = ["super_admin", "admin", "sales_manager", "sales_partner", "sales", "designer", "developer", "support"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
  const auth = await verifyAdmin(event, json, { module: "relationship_context", action: "resolve", allowedRoles: ROLES });
  if (!auth.success) return auth.response;
  try {
    const input = JSON.parse(event.body || "{}");
    const entityType = text(input.entityType).toLowerCase();
    const leadId = text(input.leadId);
    const customerId = text(input.customerId);
    if ((entityType === "lead") === (entityType === "customer") || (leadId && customerId)) return json(400, { success: false, error: "Kies één geldige lead of klant." });
    const id = entityType === "lead" ? leadId : customerId;
    if (!UUID.test(id)) return json(400, { success: false, error: "Kies een geldige relatie." });
    const config = { url: text(process.env.SUPABASE_URL).replace(/\/$/, ""), key: text(process.env.SUPABASE_SERVICE_ROLE_KEY) };
    if (!config.url || !config.key) return json(503, { success: false, error: "Relatiecontrole is tijdelijk niet beschikbaar." });
    const row = await readEntity(config, entityType, id);
    if (!row || isUnavailable(row)) return json(404, { success: false, error: "Deze relatie is niet beschikbaar." });
    if (!canAccess(auth.admin || {}, entityType, row)) {
      console.warn("Relationship context rejected", { entityType, actor: auth.admin?.id || "legacy", reason: "ownership" });
      return json(403, { success: false, error: "Je hebt geen toegang tot deze relatie." });
    }
    if (entityType === "lead" && UUID.test(text(row.converted_customer_id))) {
      const customer = await readEntity(config, "customer", row.converted_customer_id);
      if (customer && !isUnavailable(customer) && canAccess(auth.admin || {}, "customer", customer, row)) return json(200, { success: true, relationship: mapCustomer(customer) });
    }
    return json(200, { success: true, relationship: entityType === "lead" ? mapLead(row) : mapCustomer(row) });
  } catch (error) {
    console.error("Relationship context resolution failed", { message: error.message });
    return json(error.status || 500, { success: false, error: error.status ? error.message : "De relatie kon niet veilig worden geladen." });
  }
};

async function readEntity(config, type, id) {
  const table = type === "lead" ? "leads" : "customers";
  const select = type === "lead"
    ? "id,company_name,company,contact_name,name,email,phone,website,website_url,status,lead_status,assigned_user_id,assigned_user_name,owner_auth_user_id,owner_profile_id,converted_customer_id,metadata"
    : "id,profile_id,auth_user_id,name,company,email,phone,website,package,status,portal_status,metadata";
  const response = await fetch(`${config.url}/rest/v1/${table}?select=${select}&id=eq.${encodeURIComponent(id)}&limit=1`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json" } });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw Object.assign(new Error("Relatiecontrole is mislukt."), { status: response.status >= 500 ? 503 : 400 });
  return Array.isArray(rows) ? rows[0] : null;
}
function canAccess(admin, type, row, sourceLead = null) {
  const role = text(admin.role).toLowerCase();
  if (["super_admin", "admin", "sales_manager", "developer"].includes(role)) return true;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const ownerIds = [row.assigned_user_id, row.owner_auth_user_id, row.owner_profile_id, meta.assignedUserId, meta.assigned_user_id, meta.ownerAuthUserId, meta.owner_profile_id, sourceLead?.assigned_user_id, sourceLead?.owner_auth_user_id].map(text).filter(Boolean);
  if (["sales_partner", "sales"].includes(role)) return ownerIds.includes(text(admin.id)) || ownerIds.includes(text(admin.profileId));
  return type === "customer" && ["designer", "support"].includes(role);
}
function isUnavailable(row) { return ["deleted", "archived", "gearchiveerd", "inactive"].includes(text(row.status || row.portal_status).toLowerCase()); }
function mapLead(row) { const m = row.metadata || {}; return { entityType: "lead", leadId: row.id, customerId: null, profileId: text(row.owner_profile_id) || null, companyName: text(row.company_name || row.company || row.name), contactName: text(row.contact_name || row.name), websiteUrl: text(row.website_url || row.website), email: text(row.email), phone: text(row.phone), assignedUserId: text(row.assigned_user_id) || null, assignedUserName: text(row.assigned_user_name || m.assignedUserName || m.ownerName), lifecycleStage: text(row.lead_status || row.status) }; }
function mapCustomer(row) { const m = row.metadata || {}; return { entityType: "customer", leadId: null, customerId: row.id, profileId: text(row.profile_id) || null, companyName: text(row.company || row.name), contactName: text(row.name), websiteUrl: text(row.website), email: text(row.email), phone: text(row.phone), assignedUserId: text(m.assignedUserId || m.ownerAuthUserId) || null, assignedUserName: text(m.assignedUserName || m.ownerName), lifecycleStage: text(row.portal_status || row.status || row.package) }; }
function text(value) { return String(value || "").trim(); }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) }; }
