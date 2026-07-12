const { verifyAdmin } = require("./_admin-auth");

const CONTRACT_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = ["super_admin", "admin", "sales_manager", "sales_partner", "sales", "designer", "developer", "support"];

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return failure(405, "INVALID_METHOD", "Alleen GET-verzoeken zijn toegestaan.");
  const auth = await verifyAdmin(event, json, { module: "relationship_workspace", action: "read", allowedRoles: STAFF_ROLES });
  if (!auth.success) return auth.response;
  try {
    const params = queryParams(event);
    const entityType = clean(params.get("entityType") || params.get("type")).toLowerCase();
    const relationshipId = clean(params.get("id") || (entityType === "lead" ? params.get("leadId") : params.get("customerId")));
    if (!["lead", "customer"].includes(entityType)) return failure(400, "INVALID_ENTITY_TYPE", "Kies een geldige lead of klant.");
    if (!UUID.test(relationshipId)) return failure(400, "INVALID_ID", "Kies een geldige relatie.");

    const context = config();
    if (!context.url || !context.key) return failure(503, "SERVICE_UNAVAILABLE", "De werkruimte is tijdelijk niet beschikbaar.");
    const resolved = await resolveRelationship(context, entityType, relationshipId);
    if (!resolved.relationship) return failure(404, "RELATIONSHIP_NOT_FOUND", "Deze relatie bestaat niet meer.");
    if (isArchived(resolved.relationship)) return failure(410, "ARCHIVED", "Deze relatie is gearchiveerd.");
    if (!canAccess(auth.admin || {}, resolved.relationship)) return failure(403, "FORBIDDEN", "Je hebt geen toegang tot deze relatie.");

    const linkedRecords = await resolveLinkedRecords(context, resolved);
    assertIntegrity(resolved, linkedRecords);
    const counts = await resolveCounts(context, resolved, linkedRecords);
    return json(200, {
      success: true,
      contractVersion: CONTRACT_VERSION,
      relationship: mapRelationship(resolved),
      permissions: permissionsFor(auth.admin || {}, resolved.relationship),
      modules: moduleStates(linkedRecords, counts),
      linkedRecords,
      counts,
      workspaceState: {
        defaultModule: "overview",
        canInitializeWebsite: !linkedRecords.website,
        canInitializeProject: !linkedRecords.project,
        canStartFactory: !linkedRecords.demoJourney,
        resolvedFromConvertedLead: resolved.resolvedFromConvertedLead,
      },
    });
  } catch (error) {
    console.error("Relationship workspace failed", { code: error.code || "INTERNAL_ERROR", message: error.message });
    return failure(error.status || 500, error.code || "INTERNAL_ERROR", error.status ? error.message : "De werkruimte kon niet veilig worden geladen.");
  }
};

async function resolveRelationship(context, entityType, id) {
  if (entityType === "lead") {
    const lead = await one(context, "leads", `id=eq.${encodeURIComponent(id)}`);
    if (!lead) return { relationship: null };
    const convertedCustomerId = uuid(lead.converted_customer_id || lead.customer_id);
    const customer = convertedCustomerId ? await one(context, "customers", `id=eq.${encodeURIComponent(convertedCustomerId)}`) : null;
    if (customer) return { relationship: customer, lead, customer, originalLeadId: lead.id, resolvedFromConvertedLead: true };
    return { relationship: lead, lead, customer: null, originalLeadId: lead.id, resolvedFromConvertedLead: false };
  }
  const customer = await one(context, "customers", `id=eq.${encodeURIComponent(id)}`);
  if (!customer) return { relationship: null };
  const leadRows = await rowsSafe(context, "leads", `or=(converted_customer_id.eq.${encodeURIComponent(id)},customer_id.eq.${encodeURIComponent(id)})&order=updated_at.desc&limit=1`);
  const lead = leadRows[0] || null;
  return { relationship: customer, lead, customer, originalLeadId: lead?.id || uuid(customer.metadata?.originalLeadId || customer.metadata?.createdFromLeadId), resolvedFromConvertedLead: false };
}

async function resolveLinkedRecords(context, resolved) {
  const leadId = resolved.lead?.id || "";
  const customerId = resolved.customer?.id || "";
  const [websites, projects, journeys, files, leadAssets, quotes, invoices, subscriptions, tasks, timelineEvents, emailLogs, workspaces] = await Promise.all([
    customerId ? rowsSafe(context, "websites", `customer_id=eq.${encodeURIComponent(customerId)}&order=updated_at.desc&limit=20`) : [],
    customerId ? rowsSafe(context, "projects", `customer_id=eq.${encodeURIComponent(customerId)}&order=updated_at.desc&limit=20`) : [],
    relationshipRows(context, "demo_journeys", leadId, customerId, "updated_at.desc", 20),
    customerId ? rowsSafe(context, "files", `customer_id=eq.${encodeURIComponent(customerId)}&order=created_at.desc&limit=100`) : [],
    leadId ? rowsSafe(context, "lead_assets", `lead_id=eq.${encodeURIComponent(leadId)}&order=created_at.desc&limit=100`) : [],
    customerId ? rowsSafe(context, "quotes", `customer_id=eq.${encodeURIComponent(customerId)}&order=created_at.desc&limit=50`) : [],
    customerId ? rowsSafe(context, "invoices", `customer_id=eq.${encodeURIComponent(customerId)}&order=created_at.desc&limit=50`) : [],
    customerId ? rowsSafe(context, "subscriptions", `customer_id=eq.${encodeURIComponent(customerId)}&order=created_at.desc&limit=50`) : [],
    relationshipRows(context, "crm_tasks", leadId, customerId, "created_at.desc", 100),
    relationshipRows(context, "customer_timeline_events", leadId, customerId, "created_at.desc", 100),
    relationshipRows(context, "email_logs", leadId, customerId, "created_at.desc", 100),
    relationshipRows(context, "project_workspaces", leadId, customerId, "updated_at.desc", 20),
  ]);
  const website = websites[0] || null;
  const project = projects[0] || null;
  const demoJourney = journeys[0] || null;
  const buildJobs = demoJourney ? await rowsSafe(context, "website_build_jobs", `demo_journey_id=eq.${encodeURIComponent(demoJourney.id)}&order=created_at.desc&limit=20`) : [];
  const previewVersions = demoJourney ? await rowsSafe(context, "website_preview_versions", `demo_journey_id=eq.${encodeURIComponent(demoJourney.id)}&order=version.desc&limit=50`) : [];
  const assets = dedupeRows([...files, ...leadAssets]);
  return {
    lead: sanitize(resolved.lead), customer: sanitize(resolved.customer), website: sanitize(website), project: sanitize(project), demoJourney: sanitize(demoJourney),
    factoryWorkspace: sanitize(workspaces[0] || null), onboarding: onboardingState(resolved, files), brandProfile: brandState(files), domainProfile: domainState(website), hostingProfile: hostingState(website), automationProfile: automationState(emailLogs),
    websites: websites.map(sanitize), projects: projects.map(sanitize), assets: assets.map(sanitizeFile), quotes: quotes.map(sanitize), invoices: invoices.map(sanitizeInvoice), subscriptions: subscriptions.map(sanitize), tasks: tasks.map(sanitize), timelineEvents: timelineEvents.map(sanitize), emailLogs: emailLogs.map(sanitize), buildJobs: buildJobs.map(sanitizeBuild), previewVersions: previewVersions.map(sanitizePreview),
  };
}

async function resolveCounts(context, resolved, linked) {
  return { assets: linked.assets.length, quotes: linked.quotes.length, invoices: linked.invoices.length, subscriptions: linked.subscriptions.length, tasks: linked.tasks.length, timelineEvents: linked.timelineEvents.length, websites: linked.websites.length, projects: linked.projects.length, buildJobs: linked.buildJobs.length, previewVersions: linked.previewVersions.length };
}

function mapRelationship(resolved) {
  const row = resolved.relationship || {};
  const isCustomer = Boolean(resolved.customer);
  const meta = row.metadata || {};
  return { entityType: isCustomer ? "customer" : "lead", relationshipId: row.id, leadId: resolved.lead?.id || null, customerId: resolved.customer?.id || null, originalLeadId: resolved.originalLeadId || null, convertedCustomerId: resolved.customer?.id || null, companyName: clean(row.company_name || row.company || row.name), contactName: clean(row.contact_name || row.name), email: clean(row.email), phone: clean(row.phone), websiteUrl: clean(row.website_url || row.website), lifecycleStage: clean(row.lead_status || row.portal_status || row.status), status: clean(row.status || row.portal_status), assignedUserId: uuid(row.assigned_user_id || row.owner_id || meta.assignedUserId || meta.ownerAuthUserId) || null, assignedUserName: clean(row.assigned_user_name || row.owner_name || meta.assignedUserName || meta.ownerName), archived: isArchived(row) };
}

function permissionsFor(admin, row) {
  const role = clean(admin.role).toLowerCase().replace(/[\s-]+/g, "_");
  const elevated = ["super_admin", "admin", "sales_manager", "developer"].includes(role);
  return { role, canViewCommercial: elevated || ["sales_partner", "sales"].includes(role), canEditRelationship: elevated || ["sales_partner", "sales"].includes(role), canUploadAssets: true, canReviewAssets: elevated || ["designer", "support"].includes(role), canCreatePaidServices: elevated, canManageAutomations: elevated };
}

function moduleStates(linked, counts) {
  return {
    overview: { available: true }, websiteFactory: { available: true, initialized: Boolean(linked.demoJourney), emptyReason: linked.demoJourney ? null : "MODULE_NOT_INITIALIZED" }, demoSites: { available: true, initialized: Boolean(linked.demoJourney) }, aiContent: { available: true, approvedAssets: linked.assets.filter((item) => item.status === "approved").length }, assets: { available: true, count: counts.assets }, seo: { available: true, initialized: Boolean(linked.website) }, social: { available: true }, brand: { available: true, initialized: Boolean(linked.brandProfile?.primaryLogo) }, domain: { available: true, initialized: Boolean(linked.website) }, hostingEmail: { available: true, initialized: Boolean(linked.website) }, phone: { available: true, initialized: false, emptyReason: "MODULE_NOT_INITIALIZED" }, onboarding: { available: true }, roadmap: { available: true, count: counts.tasks }, automations: { available: true }, quotes: { available: true, count: counts.quotes }, invoices: { available: true, count: counts.invoices }, subscriptions: { available: true, count: counts.subscriptions }, communication: { available: true, count: linked.emailLogs.length }, timeline: { available: true, count: counts.timelineEvents }, settings: { available: true } };
}

function assertIntegrity(resolved, linked) {
  const customerId = resolved.customer?.id || "";
  if (!customerId) return;
  for (const row of [...linked.websites, ...linked.projects, ...linked.quotes, ...linked.subscriptions]) {
    if (row?.customer_id && row.customer_id !== customerId) throw coded("DATA_INTEGRITY_ERROR", 409, "Gekoppelde gegevens horen niet bij dezelfde relatie.");
  }
}

function canAccess(admin, row) {
  const role = clean(admin.role).toLowerCase().replace(/[\s-]+/g, "_");
  if (["super_admin", "admin", "sales_manager", "developer"].includes(role)) return true;
  if (["designer", "support"].includes(role)) return true;
  const meta = row.metadata || {};
  const owners = [row.assigned_user_id, row.owner_id, row.owner_auth_user_id, row.owner_profile_id, meta.assignedUserId, meta.ownerAuthUserId, meta.ownerProfileId].map(clean).filter(Boolean);
  return owners.includes(clean(admin.id)) || owners.includes(clean(admin.profileId));
}

function isArchived(row = {}) { const meta = row.metadata || {}; return Boolean(row.archived_at || row.deleted_at || meta.archivedAt || meta.deletedAt) || ["archived", "gearchiveerd", "deleted"].includes(clean(row.status).toLowerCase()); }
function relationOrFilter(leadId, customerId) { const filters = []; if (leadId) filters.push(`lead_id.eq.${encodeURIComponent(leadId)}`); if (customerId) filters.push(`customer_id.eq.${encodeURIComponent(customerId)}`); return filters.length ? `or=(${filters.join(",")})` : ""; }
function onboardingState(resolved, files) { return { initialized: Boolean(resolved.customer), assetCount: files.length, logoReceived: files.some((item) => clean(item.category).toLowerCase() === "logo"), photosReceived: files.filter((item) => ["photo", "foto", "photos"].includes(clean(item.category).toLowerCase())).length }; }
function brandState(files) { const approved = files.filter((item) => clean(item.status).toLowerCase() === "approved"); return { primaryLogo: sanitizeFile(approved.find((item) => item.metadata?.isPrimary || clean(item.category).toLowerCase() === "logo") || null), approvedAssets: approved.length }; }
function domainState(website) { return website ? { domain: clean(website.domain), sslStatus: clean(website.ssl_status), status: clean(website.status) } : null; }
function hostingState(website) { return website ? { package: clean(website.hosting_package), status: clean(website.hosting_status) } : null; }
function automationState(logs) { return { recentMessages: logs.length, initialized: logs.length > 0 }; }
function sanitize(row) { if (!row) return null; const { internal_notes, notes, metadata, ...safe } = row; return { ...safe, metadata: safeMetadata(metadata) }; }
function sanitizeFile(row) { if (!row) return null; const safe = sanitize(row); delete safe.storage_path; delete safe.location; return safe; }
function sanitizeInvoice(row) { if (!row) return null; const safe = sanitize(row); delete safe.mollie_checkout_url; delete safe.pdf_file_path; return safe; }
function sanitizeBuild(row) { if (!row) return null; const safe = sanitize(row); delete safe.build_logs; delete safe.preview_token; delete safe.generated_package; return safe; }
function sanitizePreview(row) { if (!row) return null; const safe = sanitize(row); delete safe.preview_token; delete safe.generated_package; return safe; }
function safeMetadata(value) { if (!value || typeof value !== "object") return {}; const allowed = ["source", "category", "uploadedByType", "isPrimary", "createdFromLeadId", "usageRightsConfirmed", "previewSource"]; return Object.fromEntries(allowed.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])); }

async function one(context, table, filter) { const rows = await rowsSafe(context, table, `${filter}&limit=1`, true); return rows[0] || null; }
async function relationshipRows(context, table, leadId, customerId, order, limit) {
  const queries = [];
  if (customerId) queries.push(rowsSafe(context, table, `customer_id=eq.${encodeURIComponent(customerId)}&order=${order}&limit=${limit}`));
  if (leadId) queries.push(rowsSafe(context, table, `lead_id=eq.${encodeURIComponent(leadId)}&order=${order}&limit=${limit}`));
  return dedupeRows((await Promise.all(queries)).flat());
}
function dedupeRows(rows) { const seen = new Set(); return rows.filter((row) => { const key = clean(row?.id) || JSON.stringify(row); if (seen.has(key)) return false; seen.add(key); return true; }); }
async function rowsSafe(context, table, filter, required = false) {
  const response = await fetch(`${context.url}/rest/v1/${table}?select=*&${filter}`, { headers: { apikey: context.key, Authorization: `Bearer ${context.key}`, Accept: "application/json" } });
  const data = await response.json().catch(() => []);
  if (!response.ok) {
    if (!required && [400, 404].includes(response.status)) return [];
    throw coded("QUERY_FAILED", response.status >= 500 ? 503 : 400, "Werkruimtegegevens konden niet worden gecontroleerd.");
  }
  return Array.isArray(data) ? data : [];
}
function queryParams(event) { if (event.rawQuery) return new URLSearchParams(event.rawQuery); const params = new URLSearchParams(); Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => { if (value != null) params.set(key, value); }); return params; }
function config() { return { url: clean(process.env.SUPABASE_URL).replace(/\/$/, ""), key: clean(process.env.SUPABASE_SERVICE_ROLE_KEY) }; }
function uuid(value) { const normalized = clean(value); return UUID.test(normalized) ? normalized : ""; }
function clean(value) { return String(value || "").trim(); }
function coded(code, status, message) { return Object.assign(new Error(message), { code, status }); }
function failure(statusCode, code, error) { return json(statusCode, { success: false, contractVersion: CONTRACT_VERSION, code, error }); }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) }; }

exports._test = { mapRelationship, moduleStates, assertIntegrity, canAccess, isArchived, sanitizeFile, relationOrFilter };
