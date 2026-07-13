const { verifyAdmin } = require("./_admin-auth");

const CONTRACT_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = ["super_admin", "admin", "sales_manager", "sales_partner", "sales", "developer"];
const OPEN_LEAD_STATUSES = ["new", "nieuw", "lead", "reviewing", "assigned", "call_scheduled", "contact_attempted", "contacted", "follow_up", "appointment_scheduled", "interesting", "qualified", "demo_requested", "demo_building", "demo_ready", "demo_sent", "proposal_sent", "negotiation"];
const OPEN_LEGACY_LEAD_STATUSES = ["new", "nieuw", "lead", "assigned", "contacted", "follow_up", "opvolgen", "interesting", "interesse", "qualified", "proposal_sent", "negotiation"];
const OPEN_TASK_STATUSES = ["new", "open", "in_progress", "waiting_customer"];
const OPEN_QUOTE_STATUSES = ["draft", "concept", "sent", "verzonden", "viewed", "bekeken", "open", "pending"];
const OPEN_INVOICE_STATUSES = ["draft", "concept", "sent", "verzonden", "open", "pending", "expired", "verlopen", "overdue"];
const OVERDUE_INVOICE_STATUSES = ["expired", "verlopen", "overdue"];
const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "actief", "trial", "trialing"];

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return failure(405, "INVALID_METHOD", "Alleen GET-verzoeken zijn toegestaan.");
  const auth = await verifyAdmin(event, json, { module: "dashboard_sidebar_metrics", action: "read", allowedRoles: ALLOWED_ROLES });
  if (!auth.success) return auth.response;
  const context = config();
  if (!context.url || !context.key) return failure(503, "SERVICE_UNAVAILABLE", "Sidebarinformatie is tijdelijk niet beschikbaar.");

  try {
    const params = queryParams(event);
    const entityType = clean(params.get("entityType") || params.get("type")).toLowerCase();
    const relationshipId = clean(params.get("id"));
    const general = await loadGeneralMetrics(context, auth.admin || {});
    if (!entityType && !relationshipId) return success({ general, workspace: null });
    if (!["lead", "customer"].includes(entityType) || !UUID.test(relationshipId)) return failure(400, "INVALID_RELATIONSHIP", "Kies een geldige lead of klant.");

    const resolved = await resolveRelationship(context, entityType, relationshipId);
    if (!resolved.relationship) return failure(404, "RELATIONSHIP_NOT_FOUND", "Deze relatie bestaat niet meer.");
    if (isArchived(resolved.relationship)) return failure(410, "ARCHIVED", "Deze relatie is gearchiveerd.");
    if (!canAccess(auth.admin || {}, resolved.relationship, resolved.lead)) return failure(403, "FORBIDDEN", "Je hebt geen toegang tot deze relatie.");

    const workspace = await loadWorkspaceMetrics(context, resolved);
    return success({ general, workspace });
  } catch (error) {
    console.error("Admin sidebar metrics failed", { code: error.code || "INTERNAL_ERROR", message: error.message });
    return failure(error.status || 500, error.code || "INTERNAL_ERROR", error.status ? error.message : "Sidebarinformatie kon niet veilig worden geladen.");
  }
};

async function loadGeneralMetrics(context, admin) {
  if (!["super_admin", "admin", "sales_manager", "sales_partner", "sales"].includes(normalizeRole(admin.role))) return { openLeads: null, definition: "Niet beschikbaar voor deze rol" };
  const ownership = ownershipFilter(admin);
  try {
    const [modern, legacy] = await Promise.all([
      exactCount(context, "leads", [`lead_status=in.(${OPEN_LEAD_STATUSES.join(",")})`, ownership].filter(Boolean)),
      exactCount(context, "leads", ["lead_status=is.null", `status=in.(${OPEN_LEGACY_LEAD_STATUSES.join(",")})`, ownership].filter(Boolean)),
    ]);
    const openLeads = modern + legacy;
    return { openLeads, definition: "Open leads binnen jouw toegestane scope" };
  } catch (error) {
    return { openLeads: null, definition: "Open leads binnen jouw toegestane scope", errors: [metricError("openLeads", error)] };
  }
}

async function loadWorkspaceMetrics(context, resolved) {
  const leadId = clean(resolved.lead?.id);
  const customerId = clean(resolved.customer?.id);
  const relation = relationFilter(leadId, customerId);
  const customer = customerId ? [`customer_id=eq.${customerId}`] : null;
  const tasks = relation ? [...relation, `status=in.(${OPEN_TASK_STATUSES.join(",")})`, "archived_at=is.null"] : null;
  const queries = {
    assets: () => exactCount(context, "files", relation),
    demoSites: () => exactCount(context, "demo_journeys", relation),
    openTasks: () => exactCount(context, "crm_tasks", tasks),
    timelineEvents: () => exactCount(context, "customer_timeline_events", [...relation, "archived_at=is.null"]),
    mailCount: () => exactCount(context, "email_logs", relation),
    openQuotes: () => customer ? exactCount(context, "quotes", [...customer, `status=in.(${OPEN_QUOTE_STATUSES.join(",")})`]) : null,
    openInvoices: () => customer ? exactCount(context, "invoices", [...customer, `status=in.(${OPEN_INVOICE_STATUSES.join(",")})`]) : null,
    overdueInvoices: () => customer ? exactCount(context, "invoices", [...customer, `status=in.(${OVERDUE_INVOICE_STATUSES.join(",")})`]) : null,
    subscriptions: () => customer ? exactCount(context, "subscriptions", customer) : null,
    activeSubscriptions: () => customer ? exactCount(context, "subscriptions", [...customer, `status=in.(${ACTIVE_SUBSCRIPTION_STATUSES.join(",")})`]) : null,
    website: () => customer ? rows(context, "websites", "id,status,hosting_status,ssl_status,domain", customer, "updated_at.desc", 1) : [],
    project: () => customer ? rows(context, "projects", "id,status,phase,progress", customer, "updated_at.desc", 1) : [],
    journey: () => rows(context, "demo_journeys", "id,demo_status", relation, "updated_at.desc", 1),
    brandAssets: () => rows(context, "files", "id,status,category,is_primary,brandingRole:metadata->>brandingRole", relation, "updated_at.desc", 200),
  };
  const settled = await Promise.all(Object.entries(queries).map(async ([key, run]) => {
    try { return [key, await run(), null]; } catch (error) { return [key, null, metricError(key, error)]; }
  }));
  const values = Object.fromEntries(settled.map(([key, value]) => [key, value]));
  const errors = settled.map(([, , error]) => error).filter(Boolean);
  let buildJob = null;
  let previewVersions = null;
  const journey = values.journey?.[0] || null;
  if (journey?.id) {
    const dependent = await Promise.allSettled([
      rows(context, "website_build_jobs", "id,status,progress", [`demo_journey_id=eq.${journey.id}`], "created_at.desc", 1),
      exactCount(context, "website_preview_versions", [`demo_journey_id=eq.${journey.id}`]),
    ]);
    if (dependent[0].status === "fulfilled") buildJob = dependent[0].value[0] || null; else errors.push(metricError("websiteFactory", dependent[0].reason));
    if (dependent[1].status === "fulfilled") previewVersions = dependent[1].value; else errors.push(metricError("previewVersions", dependent[1].reason));
  }

  const website = values.website?.[0] || null;
  const project = values.project?.[0] || null;
  const brandStatus = deriveBrandStatus(values.brandAssets, values.assets);
  return {
    relationship: mapRelationship(resolved),
    metrics: {
      assets: numberOrNull(values.assets), demoSites: numberOrNull(values.demoSites), openTasks: numberOrNull(values.openTasks),
      timelineEvents: numberOrNull(values.timelineEvents), mailCount: numberOrNull(values.mailCount), openQuotes: numberOrNull(values.openQuotes),
      openInvoices: numberOrNull(values.openInvoices), overdueInvoices: numberOrNull(values.overdueInvoices), subscriptions: numberOrNull(values.subscriptions),
      activeSubscriptions: numberOrNull(values.activeSubscriptions), previewVersions: numberOrNull(previewVersions),
    },
    statuses: {
      websiteFactory: deriveWebsiteFactoryStatus({ website, project, journey, buildJob, previewVersions }),
      brandCenter: brandStatus,
      domainCenter: deriveDomainStatus(website),
      commerce: deriveCommerceStatus(values),
    },
    errors,
  };
}

function deriveWebsiteFactoryStatus({ website, project, journey, buildJob, previewVersions }) {
  const websiteStatus = normalize(website?.status);
  if (["live", "online", "active", "actief"].includes(websiteStatus)) return status("Live", "success");
  const journeyStatus = normalize(journey?.demo_status);
  if (["verkocht", "definitieve versie klaar"].includes(journeyStatus)) return status("Goedgekeurd", "success");
  const buildStatus = normalize(buildJob?.status);
  if (["failed", "quality failed"].includes(buildStatus)) return status("Geblokkeerd", "danger");
  if ((previewVersions || 0) > 0 || ["interne preview klaar", "preview ingepland voor klant", "preview verstuurd", "feedback ontvangen"].includes(journeyStatus)) return status("Preview klaar", "info");
  if (buildJob || project || ["briefing klaar", "intern in productie", "aanpassingen bezig"].includes(journeyStatus)) return status("In productie", "purple");
  if (journey) return status("Niet gestart", "neutral");
  return null;
}

function deriveBrandStatus(files, totalAssets = Array.isArray(files) ? files.length : null) {
  if (!Array.isArray(files)) return null;
  const approvedLogo = files.some((file) => normalize(file.status) === "approved" && (normalize(file.category) === "logo" || file.is_primary || normalize(file.brandingRole) === "primary logo"));
  if (approvedLogo) return status("Logo klaar", "purple");
  return files.length && totalAssets === files.length ? status("Onvolledig", "warning") : null;
}

function deriveDomainStatus(website) {
  if (!website) return null;
  const websiteStatus = normalize(website.status);
  const sslStatus = normalize(website.ssl_status);
  if (["live", "online", "active", "actief"].includes(websiteStatus) && ["active", "valid", "secure", "actief"].includes(sslStatus)) return status("Actief", "success");
  if (["failed", "error", "blocked", "mislukt"].includes(websiteStatus) || ["failed", "error", "expired", "mislukt", "verlopen"].includes(sslStatus)) return status("Actie nodig", "danger");
  if (clean(website.domain)) return status("Ingesteld", "info");
  return status("Niet ingesteld", "neutral");
}

function deriveCommerceStatus(values) {
  if (numberOrNull(values.overdueInvoices) > 0) return status("Achterstallig", "danger");
  if (numberOrNull(values.openInvoices) > 0 || numberOrNull(values.openQuotes) > 0) return status("Actie nodig", "warning");
  if (numberOrNull(values.activeSubscriptions) > 0) return status("Actief", "success");
  return null;
}

async function resolveRelationship(context, entityType, id) {
  if (entityType === "lead") {
    const lead = await one(context, "leads", "id,company_name,status,lead_status,assigned_user_id,assigned_user_name,owner_id,owner_auth_user_id,owner_profile_id,converted_customer_id,customer_id,metadata", [`id=eq.${id}`]);
    if (!lead) return { relationship: null, lead: null, customer: null };
    const customerId = uuid(lead.converted_customer_id || lead.customer_id);
    const customer = customerId ? await one(context, "customers", "id,name,company,status,portal_status,profile_id,auth_user_id,metadata", [`id=eq.${customerId}`]) : null;
    return { relationship: customer || lead, lead, customer };
  }
  const customer = await one(context, "customers", "id,name,company,status,portal_status,profile_id,auth_user_id,metadata", [`id=eq.${id}`]);
  if (!customer) return { relationship: null, lead: null, customer: null };
  const leadRows = await rows(context, "leads", "id,assigned_user_id,assigned_user_name,owner_id,owner_auth_user_id,owner_profile_id,metadata", [`or=(converted_customer_id.eq.${id},customer_id.eq.${id})`], "updated_at.desc", 1);
  return { relationship: customer, customer, lead: leadRows[0] || null };
}

function mapRelationship(resolved) {
  const row = resolved.relationship || {};
  const meta = row.metadata || {};
  return {
    entityType: resolved.customer ? "customer" : "lead",
    leadId: resolved.lead?.id || null,
    customerId: resolved.customer?.id || null,
    companyName: clean(row.company_name || row.company || row.name),
    lifecycleStage: clean(row.lead_status || row.portal_status || row.status),
    assignedUserName: clean(row.assigned_user_name || row.owner_name || meta.assignedUserName || meta.ownerName),
  };
}

function canAccess(admin, row, sourceLead = null) {
  const role = normalizeRole(admin.role);
  if (["super_admin", "admin", "sales_manager", "developer"].includes(role)) return true;
  const meta = row.metadata || {};
  const owners = [row.assigned_user_id, row.owner_auth_user_id, row.owner_profile_id, meta.assignedUserId, meta.assigned_user_id, meta.ownerAuthUserId, meta.owner_profile_id, sourceLead?.assigned_user_id, sourceLead?.owner_auth_user_id].map(clean).filter(Boolean);
  return owners.includes(clean(admin.id)) || owners.includes(clean(admin.profileId));
}

function ownershipFilter(admin) {
  if (!["sales_partner", "sales"].includes(normalizeRole(admin.role))) return "";
  const clauses = [];
  const add = (field, value) => { if (UUID.test(clean(value))) clauses.push(`${field}.eq.${clean(value)}`); };
  add("assigned_user_id", admin.id); add("owner_auth_user_id", admin.id); add("owner_profile_id", admin.profileId);
  add("metadata->>assignedUserId", admin.id); add("metadata->>assigned_user_id", admin.id);
  add("metadata->>ownerAuthUserId", admin.id); add("metadata->>owner_auth_user_id", admin.id);
  add("metadata->>ownerProfileId", admin.profileId); add("metadata->>owner_profile_id", admin.profileId);
  return clauses.length ? `or=(${clauses.join(",")})` : "id=eq.__none__";
}

async function exactCount(context, table, filters = []) {
  if (!filters) return null;
  const url = restUrl(context, table, "id", filters, "", 1);
  const response = await timedFetch(url, { headers: restHeaders(context, { Prefer: "count=exact", Range: "0-0" }) });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw queryError(table, response.status, data);
  const range = response.headers?.get?.("content-range") || "";
  const total = Number(range.split("/")[1]);
  if (!Number.isFinite(total)) throw coded("INVALID_COUNT", 503, `${table} gaf geen betrouwbaar aantal terug.`);
  return total;
}

async function rows(context, table, select, filters = [], order = "", limit = 20) {
  if (!filters) return [];
  const response = await timedFetch(restUrl(context, table, select, filters, order, limit), { headers: restHeaders(context) });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw queryError(table, response.status, data);
  return Array.isArray(data) ? data : [];
}

async function one(context, table, select, filters) { return (await rows(context, table, select, filters, "", 1))[0] || null; }
function restUrl(context, table, select, filters, order, limit) { const params = new URLSearchParams({ select }); filters.filter(Boolean).forEach((filter) => { const index = filter.indexOf("="); params.append(filter.slice(0, index), filter.slice(index + 1)); }); if (order) params.set("order", order); params.set("limit", String(limit)); return `${context.url}/rest/v1/${table}?${params}`; }
async function timedFetch(url, options, timeoutMs = 5000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { return await fetch(url, { ...options, signal: controller.signal }); } catch (error) { if (error.name === "AbortError") throw coded("QUERY_TIMEOUT", 503, "Een sidebarbron reageerde niet op tijd."); throw error; } finally { clearTimeout(timer); } }
function restHeaders(context, extra = {}) { return { apikey: context.key, Authorization: `Bearer ${context.key}`, Accept: "application/json", ...extra }; }
function relationFilter(leadId, customerId) { const clauses = []; if (leadId) clauses.push(`lead_id.eq.${leadId}`); if (customerId) clauses.push(`customer_id.eq.${customerId}`); return clauses.length ? [`or=(${clauses.join(",")})`] : null; }
function queryError(table, statusCode, data) { console.warn("Sidebar metric source unavailable", { table, statusCode, code: data?.code || "" }); return coded("QUERY_FAILED", statusCode >= 500 ? 503 : 400, `${table} kon niet worden gelezen.`); }
function metricError(metric, error) { return { metric, code: error.code || "QUERY_FAILED" }; }
function status(label, tone) { return { label, tone }; }
function numberOrNull(value) { return Number.isFinite(value) ? value : null; }
function isArchived(row = {}) { const meta = row.metadata || {}; return Boolean(row.archived_at || row.deleted_at || meta.archivedAt || meta.deletedAt) || ["archived", "gearchiveerd", "deleted"].includes(normalize(row.status)); }
function normalize(value) { return clean(value).toLowerCase().replace(/[_-]+/g, " "); }
function normalizeRole(value) { return normalize(value).replace(/\s+/g, "_"); }
function uuid(value) { const normalized = clean(value); return UUID.test(normalized) ? normalized : ""; }
function clean(value) { return String(value ?? "").trim(); }
function config() { return { url: clean(process.env.SUPABASE_URL).replace(/\/$/, ""), key: clean(process.env.SUPABASE_SERVICE_ROLE_KEY) }; }
function queryParams(event) { if (event.rawQuery) return new URLSearchParams(event.rawQuery); const params = new URLSearchParams(); Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => { if (value != null) params.set(key, value); }); return params; }
function coded(code, statusCode, message) { return Object.assign(new Error(message), { code, status: statusCode }); }
function success(payload) { return json(200, { success: true, contractVersion: CONTRACT_VERSION, generatedAt: new Date().toISOString(), ...payload }); }
function failure(statusCode, code, error) { return json(statusCode, { success: false, contractVersion: CONTRACT_VERSION, code, error }); }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" }, body: JSON.stringify(body) }; }

exports._test = { canAccess, deriveBrandStatus, deriveCommerceStatus, deriveDomainStatus, deriveWebsiteFactoryStatus, mapRelationship, ownershipFilter, relationFilter };
