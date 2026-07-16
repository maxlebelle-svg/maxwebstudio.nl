const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { upsertProjectWorkspace, zipFilenameFor } = require("./_project-workspace");
const { createTimelineEvent } = require("./services/timelineService");
const { storedPreviewSource } = require("./_demo-preview-source");
const { buildWebsiteCommercialOrder, normalizeWebsitePackage, readWebsiteCommercialOrder } = require("./_website-commercial-order");
const { sendEmail } = require("./email");
const { createPreviewReadyService } = require("./journey/previewReady/service");
const { resolveWebsiteLiveContext } = require("./journey/websiteLive/contextResolver");
const { createWebsiteLiveRepository } = require("./journey/websiteLive/repository");
const { createWebsiteLiveService } = require("./journey/websiteLive/service");
const { prepareHeroEditorPackage } = require("./_preview-editor-hero");
const { prepareImageEditorPackage } = require("./_preview-editor-image");
const { prepareTextEditorPackage } = require("./_preview-editor-text");
const { randomUUID } = require("crypto");
const {
  buildLogs,
  buildWebsitePackage,
  isBuildStatus,
  makePreviewToken,
  nextPreviewVersion,
  normalizeBuildJob,
  normalizePreviewVersion,
  previewUrlFor,
  runQualityCheck,
} = require("./_website-factory-core");

const staffRoles = ["super_admin", "admin", "sales_manager", "sales_partner"];
const managerRoles = new Set(["super_admin", "admin", "sales_manager"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const previewReadyService = createPreviewReadyService();
const websiteLiveRepository = createWebsiteLiveRepository();
const websiteLiveService = createWebsiteLiveService({ websiteRepository: websiteLiveRepository });
const BUILD_JOB_SUMMARY_FIELDS = [
  "id", "demo_journey_id", "lead_id", "customer_id", "status", "current_step", "progress",
  "preview_version", "preview_url", "preview_token", "preview_score", "build_logs", "error_message",
  "started_at", "finished_at", "created_by", "created_at",
].join(",");
const PREVIEW_RECOVERY_FIELDS = [
  "id", "demo_journey_id", "build_job_id", "customer_id", "project_id", "website_id", "version", "title",
  "preview_url", "preview_token", "preview_score", "quality_report", "metadata", "is_active", "status", "created_by", "created_at",
  "entry_file:generated_package->>entryFile", "package_meta:generated_package->meta",
].join(",");
const RESUMABLE_BUILD_STATUSES = new Set(["queued", "briefing", "building", "quality_check", "deploying", "retryable"]);

async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});

  const adminCheck = await verifyAdmin(event, jsonResponse, {
    module: "website_factory",
    action: event.httpMethod.toLowerCase(),
    allowedRoles: staffRoles,
    allowedStatuses: ["active", "invited"],
  });
  if (!adminCheck.success) return adminCheck.response;

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { success: false, error: "Website Factory API is nog niet geconfigureerd." });
  }

  try {
    const payload = event.httpMethod === "GET" ? event.queryStringParameters || {} : parsePayload(event.body);
    const action = cleanText(payload.action || (event.httpMethod === "GET" ? "get_build_history" : ""));
    const context = {
      supabaseUrl,
      serviceRoleKey,
      admin: adminCheck.admin,
      requestId: cleanText(event.headers?.["x-nf-request-id"] || event.headers?.["X-Nf-Request-Id"]) || randomUUID(),
    };
    if (action === "resolve_context") return resolveWebsiteFactoryContextResponse(context, payload);
    if (action === "sync_commercial_package") return syncCommercialPackageResponse(context, payload);
    if (action === "search_entities") return searchWebsiteFactoryEntitiesResponse(context, payload);
    if (action === "create_build_job") return createBuildJobResponse(context, payload);
    if (action === "run_build_job") return runBuildJobResponse(context, payload);
    if (action === "get_build_status") return getBuildStatusResponse(context, payload);
    if (action === "get_build_history") return getBuildHistoryResponse(context, payload);
    if (action === "generate_website_package") return generatePackageResponse(context, payload);
    if (action === "run_quality_check") return qualityCheckResponse(context, payload);
    if (action === "create_preview_version") return createPreviewVersionResponse(context, payload);
    if (action === "update_demo_journey_preview") return updateJourneyPreviewResponse(context, payload);
    if (action === "start_onboarding_pipeline") return startOnboardingPipelineResponse(context, payload);
    if (["update_launch_checklist", "start_revision", "complete_revision", "resolve_feedback", "start_launch", "complete_launch"].includes(action)) {
      return previewLaunchAutomationResponse(context, payload, action);
    }
    return jsonResponse(400, { success: false, error: "Onbekende Website Factory actie." });
  } catch (error) {
    const missing = isMissingFactoryTableError(error);
    const developerMode = isDeveloperRequest(event);
    console.error("Website Factory API failed", {
      module: error.module || "website_factory",
      reason: error.reason || "",
      phase: error.phase || "",
      action: error.action || "",
      demoJourneyId: error.demoJourneyId || "",
      leadId: error.leadId || "",
      packageType: error.packageType || "",
      method: event.httpMethod,
      path: event.path || "",
      query: event.queryStringParameters || {},
      status: error.status || 500,
      code: error.code || "",
      message: error.message,
      details: error.details || "",
      hint: error.hint || "",
      url: error.url || "",
      responseText: error.responseText || "",
      responseJson: error.responseJson || null,
      stack: error.stack || "",
    });
    return jsonResponse(missing ? 503 : error.status || 500, errorResponse({
      error,
      developerMode,
      module: "website_factory",
      reason: missing ? "missing_website_factory_tables" : "website_factory_failed",
      fallbackMessage: missing
        ? "Website Factory tabellen ontbreken nog. Rol migration 019_ai_website_factory_v1 uit op de actieve Supabase database."
        : "Website Factory kon niet worden verwerkt.",
      setupRequired: missing,
    }));
  }
}

async function resolveWebsiteFactoryContextResponse(context, payload = {}) {
  const rawCustomerId = cleanText(payload.customerId || payload.customer_id);
  if (!rawCustomerId) {
    console.warn("Website Factory context resolution rejected", { reason: "missing_customer_id" });
    return jsonResponse(400, { success: false, code: "missing_customer_id", error: "Selecteer eerst een klant vanuit het Klantenoverzicht." });
  }
  const customerId = cleanUuid(rawCustomerId);
  if (!customerId) {
    console.warn("Website Factory context resolution rejected", { reason: "invalid_customer_id" });
    return jsonResponse(400, { success: false, code: "invalid_customer_id", error: "Deze klant kon niet worden gevonden. Ga terug naar het Klantenoverzicht en probeer het opnieuw." });
  }
  let customer;
  try {
    customer = await readCustomerById(context, customerId);
  } catch (error) {
    console.error("Website Factory customer lookup failed", { reason: "customer_query_failed", status: error.status || 500, code: error.code || "" });
    return jsonResponse(500, { success: false, code: "customer_query_failed", error: "De klantwerkruimte kon niet worden geladen. Probeer het opnieuw." });
  }
  if (!customer) {
    console.warn("Website Factory context resolution rejected", { reason: "customer_not_found" });
    return jsonResponse(404, { success: false, code: "customer_not_found", error: "Deze klant kon niet worden gevonden. Ga terug naar het Klantenoverzicht en probeer het opnieuw." });
  }

  try {
    const [websites, projects, leads, journeys, approvedAssets] = await Promise.all([
      readOptionalCustomerRows(context, "websites", customerId),
      readOptionalCustomerRows(context, "projects", customerId),
      readOptionalCustomerLeads(context, customerId),
      readOptionalCustomerRows(context, "demo_journeys", customerId),
      readOptionalApprovedAssets(context, customerId),
    ]);
    const website = selectPrimaryWebsite(websites) || websiteContextFromCustomer(customer);
    let project = selectPrimaryProject(projects, website);
    const demoJourney = journeys[0] || null;
    const history = demoJourney?.id
      ? await getBuildHistory(context, { demoJourneyId: demoJourney.id }).catch((error) => {
        logOptionalContextFailure("build_history", error);
        return { jobs: [], previewVersions: [], latestJob: null, activeVersion: null };
      })
      : await readPreviewVersionsByCustomer(context, customerId).then((previewVersions) => ({
        jobs: [], previewVersions, latestJob: null, activeVersion: previewVersions.find((item) => item.isActive) || previewVersions[0] || null,
      })).catch((error) => {
        logOptionalContextFailure("customer_preview_versions", error);
        return { jobs: [], previewVersions: [], latestJob: null, activeVersion: null };
      });
    if (project?.id && !readWebsiteCommercialOrder(project)) {
      const factoryPackage = cleanText(demoJourney?.preview_package?.meta?.packageType || demoJourney?.preview_package?.packageType || "");
      if (factoryPackage) project = await persistCommercialPackage(context, { customer, project, website, packageValue: factoryPackage, source: "website_factory_backfill" });
    }
    const normalizedCustomer = normalizeRecord(customer);
    const normalizedWebsite = normalizeRecord(website);
    const normalizedProject = normalizeRecord(project);
    const normalizedJourney = demoJourney ? mapJourney(demoJourney) : null;
    return jsonResponse(200, {
      success: true,
      context: {
        customer: normalizedCustomer,
        lead: leads[0] ? normalizeRecord(leads[0]) : null,
        website: normalizedWebsite,
        websites: websites.map(normalizeRecord),
        project: normalizedProject,
        projects: projects.map(normalizeRecord),
        briefing: normalizedJourney?.generatedBriefing || normalizedProject?.metadata?.briefing || null,
        researchPackage: normalizedJourney?.previewPackage?.researchPackage || normalizedJourney?.previewPackage?.websiteIntelligencePackage?.researchPackage || normalizedProject?.metadata?.researchPackage || null,
        demoJourney: normalizedJourney,
        buildJobs: history.jobs,
        previewVersions: history.previewVersions,
        approvedAssets: approvedAssets.map(normalizeFactoryAsset),
        workspace: {
          relationshipId: customerId,
          entityType: "customer",
          canStartFactory: !normalizedJourney,
          canInitializeWebsite: !normalizedWebsite,
          approvedAssetCount: approvedAssets.length,
        },
        mode: history.latestJob ? "existing_build" : normalizedWebsite ? "existing_website" : "new_website",
        capabilities: {
          canScanWebsite: Boolean(normalizedWebsite?.domain || normalizedWebsite?.live_url || customer.website),
          canStartBuild: true,
          canResumeBuild: Boolean(history.latestJob),
          canCreateWebsite: !normalizedWebsite,
        },
      },
    });
  } catch (error) {
    console.error("Website Factory optional context enrichment failed", {
      errorName: error.name || "Error",
      errorMessage: error.message || "Unknown optional context error",
      reason: "optional_context_enrichment_failed",
      phase: "enrich_customer_context",
      status: error.status || 500,
      code: error.code || "",
    });
    const normalizedCustomer = normalizeRecord(customer);
    const fallbackWebsite = normalizeRecord(websiteContextFromCustomer(customer));
    return jsonResponse(200, {
      success: true,
      code: "optional_context_enrichment_failed",
      warning: "Aanvullende projectgegevens zijn tijdelijk niet beschikbaar.",
      context: {
        customer: normalizedCustomer,
        lead: null,
        website: fallbackWebsite,
        websites: fallbackWebsite ? [fallbackWebsite] : [],
        project: null,
        projects: [],
        briefing: null,
        researchPackage: null,
        demoJourney: null,
        buildJobs: [],
        previewVersions: [],
        approvedAssets: [],
        initialization: {
          hasCustomer: true,
          hasWebsite: Boolean(fallbackWebsite),
          hasProject: false,
          hasDemoJourney: false,
          approvedAssetCount: 0,
        },
        mode: fallbackWebsite ? "existing_website_degraded" : "new_website_degraded",
        capabilities: {
          canScanWebsite: Boolean(fallbackWebsite?.domain || fallbackWebsite?.live_url || customer.website),
          canStartBuild: true,
          canResumeBuild: false,
          canCreateWebsite: !fallbackWebsite,
        },
      },
    });
  }
}

async function syncCommercialPackageResponse(context, payload = {}) {
  const customerId = cleanUuid(payload.customerId || payload.customer_id);
  const projectId = cleanUuid(payload.projectId || payload.project_id);
  const websiteId = cleanUuid(payload.websiteId || payload.website_id);
  if (!customerId || !projectId) return jsonResponse(400, { success: false, code: "commercial_context_required", error: "Klant- en projectcontext ontbreken." });
  const [customer, project, website] = await Promise.all([
    readCustomerById(context, customerId),
    readProjectById(context, projectId),
    websiteId ? readWebsiteById(context, websiteId) : Promise.resolve(null),
  ]);
  if (!customer?.id || !project?.id || cleanText(project.customer_id) !== customerId || (website?.id && cleanText(website.customer_id) !== customerId)) {
    return jsonResponse(409, { success: false, code: "commercial_context_mismatch", error: "Pakketcontext hoort niet bij deze klant." });
  }
  const savedProject = await persistCommercialPackage(context, { customer, project, website, packageValue: payload.packageType || payload.packageCode || payload.packageName, source: "website_factory_selection" });
  const commercialOrder = readWebsiteCommercialOrder(savedProject);
  if (!commercialOrder) return jsonResponse(500, { success: false, code: "commercial_package_not_persisted", error: "Websitepakket kon niet worden opgeslagen." });
  await createTimelineEvent({ customerId, eventType: "website_package_selected", title: "Websitepakket opgeslagen", description: `${commercialOrder.packageName} is gekoppeld aan het websiteproject.`, module: "commercial", referenceType: "project", referenceId: projectId, actorName: context.admin?.email || "Max Webstudio", actorRole: context.admin?.role || "admin", severity: "info", metadata: { dedupeKey: `website_package_selected:${projectId}:${commercialOrder.packageCode}:${commercialOrder.updatedAt}`, packageCode: commercialOrder.packageCode, totalAmountCents: commercialOrder.totalAmountCents, depositAmountCents: commercialOrder.depositAmountCents } }).catch(() => null);
  return jsonResponse(200, { success: true, projectId, customerId, commercialOrder });
}

async function persistCommercialPackage(context, { customer, project, website, packageValue, source }) {
  const current = readWebsiteCommercialOrder(project) || {};
  const selected = normalizeWebsitePackage(packageValue);
  if (!selected) throw Object.assign(new Error("Onbekend websitepakket."), { status: 400, code: "website_package_invalid" });
  if (current.packageCode && current.packageCode !== selected.packageCode) {
    if (current.paymentStatus === "paid") throw Object.assign(new Error("Een betaald websitepakket kan niet stil worden gewijzigd."), { status: 409, code: "paid_package_immutable" });
    const openInvoices = await supabaseFetch(`${context.supabaseUrl}/rest/v1/customer_invoices?select=id,status,mollie_payment_status&notes=ilike.*${encodeURIComponent(`project:${project.id}`)}*&limit=2`, { method: "GET", headers: restHeaders(context.serviceRoleKey) }).catch(() => []);
    if (openInvoices.some((invoice) => !["paid", "canceled", "cancelled", "expired", "failed"].includes(cleanText(invoice.mollie_payment_status || invoice.status).toLowerCase()))) {
      throw Object.assign(new Error("Annuleer eerst het openstaande betaalverzoek voordat je het pakket wijzigt."), { status: 409, code: "open_package_payment_exists" });
    }
  }
  const order = buildWebsiteCommercialOrder({ current: current.paymentStatus && current.paymentStatus !== "paid" ? { ...current, paymentStatus: "not_started" } : current, customerId: customer.id, projectId: project.id, websiteId: website?.id || project.website_id || "", packageValue, source });
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/projects?id=eq.${encodeURIComponent(project.id)}`, { method: "PATCH", headers: { ...restHeaders(context.serviceRoleKey), "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ metadata: { ...(project.metadata || {}), websiteCommercialOrder: order }, updated_at: order.updatedAt }) });
  return rows[0] || { ...project, metadata: { ...(project.metadata || {}), websiteCommercialOrder: order } };
}

async function readOptionalCustomerRows(context, table, customerId) {
  try {
    return await readRowsForCustomer(context, table, customerId);
  } catch (error) {
    logOptionalContextFailure(table, error);
    return [];
  }
}

async function readOptionalCustomerLeads(context, customerId) {
  try {
    return await readLeadsForCustomer(context, customerId);
  } catch (error) {
    logOptionalContextFailure("leads", error);
    return [];
  }
}

async function readOptionalApprovedAssets(context, customerId) {
  try {
    return await supabaseFetch(`${context.supabaseUrl}/rest/v1/files?select=id,customer_id,name,file_type,category,status,mime_type,size_bytes,uploaded_by_type,source_module,is_primary,metadata,created_at,updated_at&customer_id=eq.${encodeURIComponent(customerId)}&status=eq.approved&order=is_primary.desc,created_at.desc&limit=100`, {
      method: "GET",
      headers: restHeaders(context.serviceRoleKey),
    });
  } catch (error) {
    logOptionalContextFailure("approved_assets", error);
    return [];
  }
}

function normalizeFactoryAsset(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    name: cleanText(row.name),
    type: cleanText(row.file_type),
    category: cleanText(row.category),
    status: cleanText(row.status),
    mimeType: cleanText(row.mime_type),
    sizeBytes: Number(row.size_bytes) || 0,
    uploadedByType: cleanText(row.uploaded_by_type),
    sourceModule: cleanText(row.source_module),
    isPrimary: row.is_primary === true,
    usageRightsConfirmed: row.metadata?.usageRightsConfirmed === true || row.usage_rights_confirmed === true,
  };
}

function logOptionalContextFailure(source, error = {}) {
  console.warn("Website Factory optional context unavailable", { source, status: error.status || 500, code: error.code || "" });
}

function websiteContextFromCustomer(customer = {}) {
  const url = cleanText(customer.website || customer.website_url || customer.domain || customer.live_url);
  if (!url) return null;
  return {
    id: null,
    customer_id: cleanText(customer.id),
    name: cleanText(customer.company || customer.company_name || customer.name) || "Website",
    domain: url,
    live_url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
    status: "existing",
    source: "customer",
    metadata: {},
  };
}

async function searchWebsiteFactoryEntitiesResponse(context, payload = {}) {
  const query = cleanText(payload.query || payload.q);
  if (query.length < 2) return jsonResponse(200, { success: true, results: [] });
  const safeQuery = query.replace(/[,%()]/g, " ").trim().slice(0, 80);
  if (safeQuery.length < 2) return jsonResponse(200, { success: true, results: [] });
  try {
    const [customers, leads, websites] = await Promise.all([
      searchRows(context, "customers", ["name", "company", "company_name", "email", "phone", "website", "website_url"], safeQuery, "search_customers"),
      searchRows(context, "leads", ["name", "company", "company_name", "email", "phone", "website_url", "branch", "region"], safeQuery, "search_leads"),
      searchRows(context, "websites", ["name", "domain", "live_url"], safeQuery, "search_websites"),
    ]);
    const websitesByCustomer = new Map();
    websites.forEach((website) => {
      const id = cleanText(website.customer_id || website.profile_id);
      if (id && !websitesByCustomer.has(id)) websitesByCustomer.set(id, website);
    });
    const customerIdsFromWebsites = [...websitesByCustomer.keys()];
    const websiteCustomers = customerIdsFromWebsites.length ? await readCustomersByIds(context, customerIdsFromWebsites) : [];
    const allCustomers = dedupeById([...customers, ...websiteCustomers]);
    const customerResults = allCustomers.map((customer) => entitySearchCustomer(customer, websitesByCustomer.get(cleanText(customer.id))));
    const linkedCustomerIds = new Set(allCustomers.map((customer) => cleanText(customer.id)));
    const leadResults = leads
      .filter((lead) => ![lead.customer_id, lead.converted_customer_id].map(cleanText).some((id) => id && linkedCustomerIds.has(id)))
      .map(entitySearchLead);
    const needle = safeQuery.toLowerCase();
    const results = [...customerResults, ...leadResults]
      .sort((a, b) => Number(searchResultExact(b, needle)) - Number(searchResultExact(a, needle)) || a.title.localeCompare(b.title, "nl"))
      .slice(0, 20);
    return jsonResponse(200, { success: true, results });
  } catch (error) {
    const requestId = cleanText(context.requestId);
    console.error("Website Factory entity search failed", { reason: "entity_search_failed", phase: error.phase || "search_entities", status: error.status || 500, code: error.code || "", requestId });
    return jsonResponse(error.status || 500, { success: false, code: "entity_search_failed", phase: error.phase || "search_entities", requestId, error: "Leads en klanten konden niet worden doorzocht. Probeer het opnieuw." });
  }
}

async function searchRows(context, table, fields, query, phase = "search_entities") {
  const attempts = await Promise.allSettled(fields.map((field) => supabaseFetch(
    `${context.supabaseUrl}/rest/v1/${table}?select=*&${encodeURIComponent(field)}=ilike.*${encodeURIComponent(query)}*&limit=20`,
    { method: "GET", headers: restHeaders(context.serviceRoleKey) }
  )));
  const rows = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? attempt.value : []);
  if (rows.length || attempts.some((attempt) => attempt.status === "fulfilled")) return dedupeById(rows).slice(0, 20);
  const failure = attempts.find((attempt) => attempt.status === "rejected")?.reason || new Error("Entity search failed.");
  failure.phase = phase;
  throw failure;
}

async function readCustomersByIds(context, ids = []) {
  const valid = ids.map(cleanUuid).filter(Boolean).slice(0, 20);
  if (!valid.length) return [];
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/customers?select=*&id=in.(${valid.join(",")})&limit=20`, { method: "GET", headers: restHeaders(context.serviceRoleKey) });
}

function dedupeById(rows = []) { return [...new Map(rows.filter((row) => row?.id).map((row) => [row.id, row])).values()]; }
function normalizedWebsiteValue(row = {}) { return cleanText(row.domain || row.live_url || row.website || row.website_url); }
function entitySearchCustomer(customer = {}, website = null) {
  const websiteValue = normalizedWebsiteValue(website || customer);
  return { entityType: "customer", id: cleanText(customer.id), title: cleanText(customer.company || customer.company_name || customer.name) || "Klant", subtitle: ["Klant", websiteValue, websiteValue ? "Bestaande website" : "Website ontbreekt"].filter(Boolean).join(" · "), website: websiteValue, branch: cleanText(customer.industry || customer.branch), location: cleanText(customer.city || customer.region), status: cleanText(customer.status), hasWebsite: Boolean(websiteValue) };
}
function entitySearchLead(lead = {}) {
  const websiteValue = normalizedWebsiteValue(lead);
  return { entityType: "lead", id: cleanText(lead.id), title: cleanText(lead.company || lead.company_name || lead.name) || "Lead", subtitle: ["Lead", cleanText(lead.branch || lead.industry), websiteValue ? "Website aanwezig" : "Website ontbreekt"].filter(Boolean).join(" · "), website: websiteValue, branch: cleanText(lead.branch || lead.industry), location: cleanText(lead.region || lead.city), status: cleanText(lead.status), hasWebsite: Boolean(websiteValue) };
}
function searchResultExact(result = {}, needle = "") { return [result.title, result.website].map((value) => cleanText(value).toLowerCase()).includes(needle); }

async function readRowsForCustomer(context, table, customerId) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}?select=*&customer_id=eq.${encodeURIComponent(customerId)}&order=updated_at.desc.nullslast&limit=100`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
}

async function readLeadsForCustomer(context, customerId) {
  try {
    return await supabaseFetch(`${context.supabaseUrl}/rest/v1/leads?select=*&or=(customer_id.eq.${encodeURIComponent(customerId)},converted_customer_id.eq.${encodeURIComponent(customerId)})&order=updated_at.desc.nullslast&limit=25`, {
      method: "GET",
      headers: restHeaders(context.serviceRoleKey),
    });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    return supabaseFetch(`${context.supabaseUrl}/rest/v1/leads?select=*&converted_customer_id=eq.${encodeURIComponent(customerId)}&order=updated_at.desc.nullslast&limit=25`, {
      method: "GET",
      headers: restHeaders(context.serviceRoleKey),
    });
  }
}

function selectPrimaryWebsite(websites = []) {
  if (websites.length < 2) return websites[0] || null;
  const explicit = websites.filter((item) => item.is_primary === true || item.primary === true || item.metadata?.isPrimary === true);
  if (explicit.length === 1) return explicit[0];
  const active = websites.filter((item) => ["online", "live", "active", "actief"].includes(cleanText(item.status).toLowerCase()));
  return active.length === 1 ? active[0] : null;
}

function selectPrimaryProject(projects = [], website = null) {
  const linked = website?.id ? projects.filter((item) => cleanText(item.website_id) === cleanText(website.id)) : [];
  return linked[0] || (projects.length === 1 ? projects[0] : null);
}

async function createBuildJobResponse(context, payload) {
  const { job } = await createBuildJob(context, payload);
  return jsonResponse(200, { success: true, job });
}

async function runBuildJobResponse(context, payload) {
  const result = await runBuildJob(context, payload);
  return jsonResponse(200, { success: true, ...sanitizeBuildResult(result) });
}

async function getBuildStatusResponse(context, payload) {
  const id = cleanText(payload.id || payload.jobId || payload.job_id);
  if (!id) return jsonResponse(400, { success: false, error: "Build job id ontbreekt." });
  const row = await readBuildJobById(context, id);
  if (!row) return jsonResponse(404, { success: false, error: "Build job niet gevonden." });
  return jsonResponse(200, { success: true, job: sanitizeBuildJob(normalizeBuildJob(row)) });
}

async function getBuildHistoryResponse(context, payload) {
  const history = await getBuildHistory(context, {
    demoJourneyId: payload.demoJourneyId || payload.demo_journey_id,
    leadId: payload.leadId || payload.lead_id,
  });
  return jsonResponse(200, { success: true, ...history });
}

async function generatePackageResponse(context, payload) {
  const journey = payload.journey || await readJourney(context, payload.demoJourneyId || payload.demo_journey_id);
  if (!journey) return jsonResponse(404, { success: false, error: "Demo-klantreis niet gevonden." });
  const mappedJourney = payload.journey ? { ...mapJourney(journey), ...journey } : mapJourney(journey);
  const packageType = normalizePackageType(payload.packageType || payload.package_type || mappedJourney.packageType);
  const builtPackage = buildWebsitePackage({
    journey: {
      ...mappedJourney,
      packageType,
      googleReviews: payload.googleReviews || payload.google_reviews || mappedJourney.googleReviews || [],
      googleRating: payload.googleRating || payload.google_rating || mappedJourney.googleRating || "",
      googleRatingTotal: payload.googleRatingTotal || payload.google_rating_total || mappedJourney.googleRatingTotal || "",
      googleMapsUrl: payload.googleMapsUrl || payload.google_maps_url || mappedJourney.googleMapsUrl || "",
    },
    briefing: payload.briefing || journey.generated_briefing,
    version: Number(payload.version || 1),
  });
  const imagePreparation = await prepareImageEditorPackage(builtPackage);
  const textPreparation = await prepareTextEditorPackage(imagePreparation.generatedPackage);
  const { generatedPackage } = await prepareHeroEditorPackage(textPreparation.generatedPackage);
  return jsonResponse(200, { success: true, generatedPackage });
}

async function qualityCheckResponse(context, payload) {
  const qualityReport = runQualityCheck({ generatedPackage: payload.generatedPackage || payload.generated_package || {}, journey: payload.journey || {} });
  return jsonResponse(200, { success: true, qualityReport });
}

async function createPreviewVersionResponse(context, payload) {
  const previewVersion = await createPreviewVersion(context, payload);
  return jsonResponse(200, { success: true, previewVersion });
}

async function updateJourneyPreviewResponse(context, payload) {
  const journey = await updateDemoJourneyPreview(context, payload);
  return jsonResponse(200, { success: true, journey });
}

async function startOnboardingPipelineResponse(context, payload) {
  const result = await startOnboardingFactoryPipeline(context, payload);
  return jsonResponse(200, { success: true, ...result });
}

async function previewLaunchAutomationResponse(context, payload, action) {
  const result = await handlePreviewLaunchAutomation(context, payload, action);
  return jsonResponse(200, { success: true, ...result });
}

async function handlePreviewLaunchAutomation(context, payload = {}, action = "") {
  const projectId = cleanUuid(payload.projectId || payload.project_id);
  const customerId = cleanUuid(payload.customerId || payload.customer_id);
  const records = await readOnboardingFactoryRecords(context, { customerId, projectId });
  if (!records.project || !records.customer) {
    const error = new Error("Klant of project kon niet worden gevonden voor preview/livegang.");
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  const metadata = records.project.metadata || {};
  const currentReview = metadata.previewReview && typeof metadata.previewReview === "object" ? metadata.previewReview : metadata.factoryPipeline?.previewReview || {};
  const launch = normalizeLaunchChecklist(currentReview.launch || metadata.launchChecklist || {});
  const review = {
    ...currentReview,
    status: currentReview.status || "preview_ready",
    updatedAt: now,
    launch,
  };
  const wasAlreadyLive = Boolean(currentReview.liveAt);
  let projectPatch = { phase: "Preview gereed", progress: Math.max(Number(records.project.progress) || 0, 75) };
  let eventType = "preview_ready";
  let notificationTitle = "Preview gereed";
  let notificationDescription = "De preview staat klaar voor review.";
  let mailType = "";

  if (action === "update_launch_checklist") {
    review.launch = updateLaunchChecklist(launch, payload.checklist || payload.items || []);
    review.status = review.launch.progress === 100 ? "ready_for_launch" : "approved";
    projectPatch = { phase: review.launch.progress === 100 ? "Klaar voor livegang" : "Live checklist", progress: Math.max(75, review.launch.progress) };
    eventType = review.launch.progress === 100 ? "launch_started" : "project_updated";
    notificationTitle = review.launch.progress === 100 ? "Website klaar voor livegang" : "Live checklist bijgewerkt";
    notificationDescription = `${review.launch.progress}% van de live checklist is afgerond.`;
  }
  if (action === "start_revision") {
    review.status = "revision_in_progress";
    review.revisionStartedAt = now;
    review.revisionCount = Number(review.revisionCount || 0) + 1;
    projectPatch = { status: "in_ontwikkeling", phase: "Revisie bezig", progress: 78 };
    eventType = "revision_started";
    notificationTitle = "Revisie gestart";
    notificationDescription = "Het team verwerkt feedback op de preview.";
  }
  if (action === "complete_revision") {
    review.status = "waiting_for_customer";
    review.revisionCompletedAt = now;
    projectPatch = { status: "feedback", phase: "Preview bijgewerkt", progress: 82 };
    eventType = "revision_completed";
    notificationTitle = "Preview bijgewerkt";
    notificationDescription = "De revisie is afgerond en staat klaar voor klantreview.";
    mailType = "preview_updated";
  }
  if (action === "resolve_feedback") {
    review.feedbackItems = markFeedbackResolved(review.feedbackItems || [], payload.feedbackId || payload.feedback_id);
    review.status = review.feedbackItems.some((item) => item.status === "open") ? "revision_in_progress" : "waiting_for_customer";
    projectPatch = { phase: "Feedback verwerkt", progress: 82 };
    eventType = "feedback_resolved";
    notificationTitle = "Feedback opgelost";
    notificationDescription = "Een feedbackpunt is verwerkt.";
  }
  if (action === "start_launch") {
    review.status = "launching";
    review.launch = { ...launch, status: "launching", startedAt: launch.startedAt || now, updatedAt: now };
    projectPatch = { status: "testen", phase: "Livegang gestart", progress: 90 };
    eventType = "launch_started";
    notificationTitle = "Launch gestart";
    notificationDescription = "De livegang is gestart.";
    mailType = "launch_started";
  }
  if (action === "complete_launch") {
    review.status = "live";
    review.launch = { ...launch, status: "live", progress: 100, completedAt: launch.completedAt || now, updatedAt: now };
    review.liveAt = currentReview.liveAt || now;
    review.livePublicationReference = currentReview.livePublicationReference || records.website?.metadata?.livePublicationReference || records.website?.metadata?.netlifyDeployId || records.website?.metadata?.deploymentId || records.website?.last_deploy_at || review.liveAt;
    review.postLaunch = { ...(currentReview.postLaunch || {}), status: "active", reviewScheduled: false, updatedAt: now };
    projectPatch = { status: "live", phase: "Nazorg actief", progress: 95 };
    eventType = "website_live";
    notificationTitle = "Website live";
    notificationDescription = "De website staat live en de nazorg is gestart.";
    mailType = "website_live";
  }

  const updatedProject = await persistPreviewReview(context, records, review, projectPatch);
  records.project = normalizeRecord(updatedProject?.[0] || { ...records.project, ...projectPatch, metadata: records.project.metadata });
  const stableSideEffectKey = `${eventType}:${records.project?.id || records.customer?.id}:${action === "complete_launch" ? review.livePublicationReference : review.updatedAt}`;
  await factoryTimeline(records, eventType, notificationTitle, notificationDescription, eventType === "website_live" ? "success" : "info", { dedupeKey: stableSideEffectKey, previewReviewStatus: review.status, launchProgress: review.launch?.progress || 0 });
  await factoryNotification(records, notificationTitle, notificationDescription, eventType === "launch_warning" ? "warning" : "success", { dedupeKey: `factory_notification:${stableSideEffectKey}`, notificationType: eventType, launchProgress: review.launch?.progress || 0 });
  let maintenanceSubscription = null;
  if (action === "complete_launch") {
    const [healthLookup, maintenanceLookup] = await Promise.all([
      websiteLiveRepository.findHealthWebsite({ profileId: records.customer?.profile_id, authUserId: records.customer?.auth_user_id, liveUrl: records.website?.live_url, domain: records.website?.domain }).catch(() => ({ row: null })),
      websiteLiveRepository.findMaintenanceSubscription(records.project.id).catch(() => ({ row: null })),
    ]);
    maintenanceSubscription = maintenanceLookup?.row || null;
    let websiteLiveContext;
    try {
      websiteLiveContext = await resolveWebsiteLiveContext({ customer: records.customer, project: records.project, website: records.website, healthWebsite: healthLookup?.row || records.website, review, technicalStored: true, environment: runtimeEnvironment(), journeyType: records.project?.metadata?.journeyType || "website.direct_checkout", publicationSource: "website_factory_verified_publication", maintenanceSubscription });
    } catch (error) {
      websiteLiveContext = { safe: false, reasonCode: "website_live_context_resolution_failed", internalActionRequired: true };
      console.warn("Website live context unavailable", { code: cleanText(error?.code || error?.name || "context_failed") });
    }
    const liveResult = await websiteLiveService.dispatch({
      customerId: records.customer.id,
      websiteId: records.website?.id,
      projectId: records.project.id,
      recipient: records.customer?.email,
      firstName: records.customer?.name,
      websiteLabel: records.website?.name || records.project?.name,
      contactName: "Team Max Webstudio",
      liveAt: review.liveAt,
      websiteLiveContext,
      legacySend: () => wasAlreadyLive ? null : sendPreviewLaunchMail(records, review, "website_live", { ownership: "legacy", liveUrl: websiteLiveContext.safeLiveUrl, websiteReference: records.website?.id || "" }),
    }).catch((error) => ({ owner: "none", reason: cleanText(error?.code || error?.name || "website_live_dispatch_failed") }));
    review.liveMailOwner = liveResult.owner;
    review.liveMailReason = liveResult.reason;
  } else if (mailType) {
    await sendPreviewLaunchMail(records, review, mailType).catch((error) => console.error("Preview launch mail skipped", { message: error.message, type: mailType }));
  }
  return { project: normalizeRecord(updatedProject?.[0] || records.project), previewReview: review, maintenanceSubscription: normalizeRecord(maintenanceSubscription) };
}

async function startOnboardingFactoryPipeline(context, payload = {}) {
  const customerId = cleanUuid(payload.customerId || payload.customer_id);
  const projectId = cleanUuid(payload.projectId || payload.project_id);
  if (!customerId && !projectId) {
    const error = new Error("Kies een klant of project voor de Website Factory pipeline.");
    error.status = 400;
    throw error;
  }

  const records = await readOnboardingFactoryRecords(context, { customerId, projectId });
  if (!records.customer || !records.project) {
    const error = new Error("Klant of project kon niet worden gevonden voor Website Factory.");
    error.status = 404;
    throw error;
  }

  const now = new Date().toISOString();
  const factoryInput = records.project.metadata?.websiteFactoryInput || payload.factoryInput || payload.factory_input || {};
  const onboarding = records.project.metadata?.onboarding || records.customer.metadata?.onboarding || {};
  const runId = cleanText(payload.factoryRunId || payload.factory_run_id) || `factory-${Date.now()}`;
  const analysis = buildFactoryAnalysis({ records, factoryInput, onboarding });
  const blueprint = buildFactoryBlueprint({ factoryInput, analysis });
  const contentPlan = buildContentPlan({ factoryInput, analysis, blueprint });
  const brandingPlan = buildBrandingPlan({ factoryInput, analysis, onboarding });
  const mediaMap = buildMediaMap({ factoryInput, onboarding });
  const seoPlan = buildSeoPlan({ factoryInput, analysis, blueprint });
  const missingInfo = [...new Set([...(analysis.missingCriticalInfo || []), ...(mediaMap.missing || []), ...(seoPlan.missing || [])])];
  const journey = await ensureFactoryJourney(context, { records, factoryInput, analysis, blueprint, contentPlan, brandingPlan, mediaMap, seoPlan });
  const startedAt = now;
  let pipeline = {
    id: runId,
    status: "queued",
    currentStep: "queued",
    startedAt,
    updatedAt: startedAt,
    demoJourneyId: journey.id,
    projectId: records.project.id,
    customerId: records.customer.id,
    onboardingId: onboarding.id || "",
    steps: pipelineSteps("queued"),
    analysis,
    blueprint,
    contentPlan,
    brandingPlan,
    mediaMap,
    seoPlan,
    missingInfo,
  };
  await persistFactoryPipeline(context, records, pipeline, { status: "in_ontwikkeling", phase: "Website Factory queued", progress: 50 });
  await factoryTimeline(records, "factory_started", "Website Factory gestart", "De automatische Website Factory pipeline is gestart.", "info", { runId, demoJourneyId: journey.id });
  await factoryNotification(records, "Website Factory gestart", "Nieuwe onboarding is doorgestuurd naar Website Factory.", "info", { runId });

  try {
    pipeline = advancePipeline(pipeline, "collecting_input");
    await persistFactoryPipeline(context, records, pipeline, { phase: "Factory input verzamelen", progress: 52 });
    await factoryTimeline(records, "factory_input_collected", "Factory input verzameld", "Klant-, project- en onboardinginput is verzameld.", "success", { runId, missingInfo });
    if (missingInfo.length) await factoryNotification(records, "Project mist informatie", missingInfo.slice(0, 5).join(", "), "warning", { runId });

    for (const [status, eventType, title] of [
      ["generating_blueprint", "factory_analysis_completed", "AI analyse voorbereid"],
      ["generating_content", "factory_blueprint_created", "Website blueprint gemaakt"],
      ["applying_branding", "factory_content_prepared", "Content voorbereid"],
      ["preparing_seo", "factory_branding_applied", "Branding toegepast"],
      ["mapping_media", "factory_seo_prepared", "SEO voorbereid"],
      ["building_preview", "factory_media_mapped", "Media gekoppeld"],
    ]) {
      pipeline = advancePipeline(pipeline, status);
      await persistFactoryPipeline(context, records, pipeline, { phase: pipelineLabel(status), progress: pipelineProgress(status) });
      await factoryTimeline(records, eventType, title, pipelineLabel(status), "success", { runId });
    }

    await factoryTimeline(records, "factory_preview_started", "Preview build gestart", "De bestaande Preview Builder maakt een interne preview.", "info", { runId, demoJourneyId: journey.id });
    await factoryNotification(records, "Preview build gestart", "Website Factory bouwt de preview.", "info", { runId });
    const buildResult = await runBuildJob(context, {
      demoJourneyId: journey.id,
      generatedBriefing: factoryInput.generatedBriefing || buildPipelineBriefing({ factoryInput, analysis, blueprint, contentPlan, brandingPlan, mediaMap, seoPlan }),
      packageType: factoryInput.packageType || records.customer.package || "",
    });
    const job = buildResult.job || {};
    const ready = job.status === "completed" || buildResult.previewVersion?.previewUrl || buildResult.journey?.previewUrl;
    pipeline = advancePipeline(pipeline, ready ? "preview_ready" : "failed", {
      buildJobId: job.id || "",
      previewUrl: job.previewUrl || buildResult.previewVersion?.previewUrl || buildResult.journey?.previewUrl || "",
      previewToken: job.previewToken || buildResult.previewVersion?.previewToken || "",
      previewScore: job.previewScore || buildResult.previewVersion?.previewScore || 0,
      finishedAt: new Date().toISOString(),
      buildStatus: job.status || "",
    });
    await persistFactoryPipeline(context, records, pipeline, {
      status: ready ? "feedback" : "in_ontwikkeling",
      phase: ready ? "Preview gereed" : "Preview vraagt aandacht",
      progress: ready ? 75 : 55,
    });
    if (!ready) {
      await factoryTimeline(records, "factory_failed", "Website Factory vraagt aandacht", "De preview kon niet volledig worden afgerond.", "error", { runId, buildJobId: job.id || "" });
      await factoryNotification(records, "Build mislukt", "De preview vraagt aandacht in Website Factory.", "error", { runId });
    } else {
      await factoryTimeline(records, "factory_preview_ready", "Preview gereed", "De website-preview staat klaar voor interne controle.", "success", { runId, buildJobId: job.id || "", previewUrl: pipeline.previewUrl });
      const previewReview = buildInitialPreviewReview({ pipeline, job, journey: buildResult.journey || journey });
      await persistPreviewReview(context, records, previewReview, { status: "feedback", phase: "Wachten op klantreview", progress: 78 });
      await factoryTimeline(records, "preview_ready", "Preview klaar voor klantreview", "De preview staat klaar om met de klant te delen.", "success", { runId, previewUrl: pipeline.previewUrl, version: previewReview.activeVersion });
      await factoryNotification(records, "Preview gereed", "De preview staat klaar voor controle.", "success", { runId, previewUrl: pipeline.previewUrl });
      await previewReadyService.dispatch({
        customerId: records.customer?.id,
        projectId: records.project?.id,
        previewVersionId: buildResult.previewVersion?.id,
        previewVersionLabel: previewReview.activeVersion,
        recipient: records.customer?.email,
        firstName: cleanText(records.customer?.name).split(/\s+/)[0],
        businessLabel: cleanText(records.customer?.company || records.customer?.name || records.project?.name || "uw website"),
        occurredAt: new Date().toISOString(),
        legacySend: () => sendPreviewLaunchMail(records, previewReview, "preview_ready", { ownership: "legacy", previewVersionReference: buildResult.previewVersion?.id || "" }),
      }).catch((error) => console.error("Preview ready mail skipped", { message: error.message }));
    }
    return { factoryRun: sanitizePipeline(pipeline), job, journey: buildResult.journey || journey, previewVersion: buildResult.previewVersion || null };
  } catch (error) {
    pipeline = advancePipeline(pipeline, "failed", {
      errorMessage: "Website Factory kon de preview niet afronden.",
      finishedAt: new Date().toISOString(),
    });
    await persistFactoryPipeline(context, records, pipeline, { status: "in_ontwikkeling", phase: "Website Factory aandacht nodig", progress: 55 });
    await factoryTimeline(records, "factory_failed", "Website Factory mislukt", "De pipeline kon niet volledig worden afgerond.", "error", { runId });
    await factoryNotification(records, "Build mislukt", "De Website Factory pipeline vraagt aandacht.", "error", { runId });
    throw error;
  }
}

async function createBuildJob(context, payload = {}) {
  const demoJourneyId = cleanText(payload.demoJourneyId || payload.demo_journey_id);
  if (!demoJourneyId) {
    const error = new Error("Demo journey id ontbreekt.");
    error.status = 400;
    throw error;
  }
  const journey = await readJourney(context, demoJourneyId);
  if (!journey) {
    const error = new Error("Demo-klantreis niet gevonden.");
    error.status = 404;
    throw error;
  }
  assertCanSeeJourney(journey, context.admin);
  const [jobs, previewVersions] = await Promise.all([
    readBuildJobSummaries(context, { demoJourneyId, limit: 25 }),
    readPreviewVersionSummaries(context, demoJourneyId),
  ]);
  const activeJob = jobs.find((item) => RESUMABLE_BUILD_STATUSES.has(item.status));
  if (activeJob) return { job: activeJob, journey: mapJourney(journey), reusedExisting: true };
  const previewVersion = nextPreviewVersion(previewVersions, jobs);
  const now = new Date().toISOString();
  const rows = await insertBuildJob(context, {
    demo_journey_id: demoJourneyId,
    lead_id: cleanUuid(journey.lead_id) || null,
    customer_id: cleanUuid(journey.customer_id) || null,
    status: "queued",
    current_step: "queued",
    progress: 5,
    preview_version: previewVersion,
    build_logs: buildLogs({ step: "queued", message: `Preview V${previewVersion} build job aangemaakt.`, at: now }),
    created_by: context.admin.id,
    started_at: now,
  });
  return { job: normalizeBuildJob(rows[0] || {}), journey: mapJourney(journey) };
}

async function runBuildJob(context, payload = {}) {
  let phase = "create_build_job";
  let job = null;
  let journey = null;
  try {
    const existingJob = cleanText(payload.jobId || payload.job_id) ? await readBuildJobById(context, payload.jobId || payload.job_id) : null;
    const setup = existingJob
      ? { job: normalizeBuildJob(existingJob), journey: mapJourney(await readJourney(context, existingJob.demo_journey_id)) }
      : await createBuildJob(context, payload);
    job = setup.job;
    journey = setup.journey;
    const persistedPreview = job?.id ? await readPreviewVersionByBuildJobId(context, job.id) : null;
    if (persistedPreview?.id) {
      return recoverBuildFromPreview(context, { job, journey, previewVersion: persistedPreview });
    }
    phase = "validate_journey";
    if (!journey?.id) {
      const error = new Error("Demo-klantreis voor build job ontbreekt.");
      error.status = 404;
      throw error;
    }
    assertCanSeeJourney({ id: journey.id, created_by: journey.createdBy, assigned_to: journey.assignedTo, updated_by: journey.updatedBy }, context.admin);
    const resumeAfterPackage = isPackageResumePoint(job);
    const logs = buildLogs(job.buildLogs, { step: "briefing", message: resumeAfterPackage ? "Bestaande build wordt veilig hervat." : "Briefing gevalideerd." });
    if (!resumeAfterPackage) {
      phase = "patch_build_job_briefing";
      await patchBuildJob(context, job.id, { status: "briefing", current_step: "briefing", progress: 20, build_logs: logs });
    }

    const briefing = cleanText(payload.generatedBriefing || payload.generated_briefing || journey.generatedBriefing);
    if (!briefing) {
      return failBuild(context, job, "Briefing ontbreekt voor websitegeneratie.", logs);
    }

    const packageType = normalizePackageType(payload.packageType || payload.package_type || journey.packageType);
    const previousPackage = normalizePackageType(journey.previewPackage?.meta?.packageType || journey.previewPackage?.packageType || journey.previewPackage?.meta?.packageId || "");
    const packageChanged = Boolean(previousPackage && packageType && previousPackage !== packageType);
    const buildingLogs = buildLogs(logs, {
      step: "building",
      message: packageChanged
        ? `Website package wordt opnieuw gegenereerd: ${previousPackage} naar ${packageType}.`
        : "Website package wordt gegenereerd.",
      previousPackage,
      newPackage: packageType,
      previewVersion: job.previewVersion,
    });
    if (!resumeAfterPackage) {
      phase = "patch_build_job_building";
      await patchBuildJob(context, job.id, { status: "building", current_step: "generate_website_package", progress: 45, build_logs: buildingLogs });
    }
    phase = "generate_website_package";
    const builtPackage = buildWebsitePackage({
      journey: {
        ...journey,
        packageType,
        websiteAnalysis: payload.websiteAnalysis || payload.website_analysis || null,
        googleReviews: payload.googleReviews || payload.google_reviews || [],
        googleRating: payload.googleRating || payload.google_rating || "",
        googleRatingTotal: payload.googleRatingTotal || payload.google_rating_total || "",
        googleMapsUrl: payload.googleMapsUrl || payload.google_maps_url || "",
      },
      briefing,
      version: job.previewVersion,
    });
    phase = "prepare_editor_manifest";
    const imagePreparation = await prepareImageEditorPackage(builtPackage);
    const textPreparation = await prepareTextEditorPackage(imagePreparation.generatedPackage);
    const editorPreparation = await prepareHeroEditorPackage(textPreparation.generatedPackage);
    const generatedPackage = editorPreparation.generatedPackage;
    if (textPreparation.availability !== "editable") {
      console.warn("Website Factory text editor unavailable; build continues read-only", {
        phase,
        buildJobId: job.id,
        reason: textPreparation.reason,
      });
    }
    if (imagePreparation.availability !== "editable") {
      console.warn("Website Factory image editor unavailable; build continues read-only", {
        phase,
        buildJobId: job.id,
        reason: imagePreparation.reason,
      });
    }
    if (editorPreparation.availability !== "editable") {
      console.warn("Website Factory Hero editor unavailable; build continues read-only", {
        phase,
        buildJobId: job.id,
        reason: editorPreparation.reason,
      });
    }

    const qualityLogs = buildLogs(buildingLogs, { step: "quality_check", message: "Quality checker gestart." });
    if (!resumeAfterPackage) {
      phase = "patch_build_job_quality_check";
      await patchBuildJob(context, job.id, { status: "quality_check", current_step: "run_quality_check", progress: 70, generated_package: generatedPackage, build_logs: qualityLogs });
    }
    phase = "run_quality_check";
    const qualityReport = runQualityCheck({ generatedPackage, journey });
    if (!qualityReport.passed) {
      const failedRecord = {
        status: "quality_failed",
        current_step: "quality_check",
        progress: 85,
        preview_score: qualityReport.score,
        quality_report: qualityReport,
        error_message: qualityReport.summary,
        finished_at: new Date().toISOString(),
        build_logs: buildLogs(qualityLogs, { step: "quality_failed", message: qualityReport.summary }),
      };
      await patchBuildJob(context, job.id, failedRecord);
      return { job: normalizeBuildJob({ ...jobRecord(job), ...failedRecord }), journey, previewVersion: null };
    }

    const token = makePreviewToken();
    const previewUrl = previewUrlFor({ journeyId: journey.id, token, previewVersionId: job.id });
    phase = "patch_build_job_deploying";
    await patchBuildJob(context, job.id, {
      status: "deploying",
      current_step: "create_preview_version",
      progress: 90,
      preview_url: previewUrl,
      preview_token: token,
      preview_score: qualityReport.score,
      quality_report: qualityReport,
      build_logs: buildLogs(qualityLogs, { step: "deploying", message: "Interne previewversie wordt opgeslagen." }),
    });

    phase = "create_preview_version";
    const previewVersion = await createPreviewVersion(context, {
      demoJourneyId: journey.id,
      buildJobId: job.id,
      version: job.previewVersion,
      previewUrl,
      previewToken: token,
      previewScore: qualityReport.score,
      qualityReport,
      generatedPackage,
      packageType: generatedPackage.packageType,
      customerId: journey.customerId || payload.customerId || payload.customer_id,
      projectId: journey.projectId || payload.projectId || payload.project_id,
      websiteId: journey.websiteId || payload.websiteId || payload.website_id,
      createdBy: context.admin.id,
    });
    phase = "patch_build_job_completed";
    const completedRecord = {
      status: "completed",
      current_step: "completed",
      progress: 100,
      preview_url: previewUrl,
      preview_token: token,
      preview_score: qualityReport.score,
      finished_at: new Date().toISOString(),
      build_logs: buildLogs(qualityLogs, {
        step: "completed",
        message: `Preview V${job.previewVersion} klaar met score ${qualityReport.score}.`,
        previousPackage,
        newPackage: generatedPackage.packageType,
        previewVersion: job.previewVersion,
      }),
    };
    await patchBuildJob(context, job.id, completedRecord);
    phase = "update_demo_journey_preview";
    const updatedJourney = await updateDemoJourneyPreview(context, {
      demoJourneyId: journey.id,
      generatedBriefing: briefing,
      previewUrl,
      previewToken: token,
      generatedPackage,
      packageType: generatedPackage.packageType,
      status: "interne_preview_klaar",
      persistPackage: false,
    });
    const latestZipFilename = zipFilenameFor({
      businessName: updatedJourney.businessName || journey.businessName,
      websiteUrl: updatedJourney.websiteUrl || journey.websiteUrl,
      version: job.previewVersion,
    });
    phase = "upsert_project_workspace";
    await runOptionalPreviewWrite("upsert_project_workspace", () => upsertProjectWorkspace(context, {
      leadId: updatedJourney.leadId || journey.leadId,
      customerId: updatedJourney.customerId || journey.customerId,
      demoJourneyId: updatedJourney.id || journey.id,
      businessName: updatedJourney.businessName || journey.businessName,
      websiteUrl: updatedJourney.websiteUrl || journey.websiteUrl,
      latestPreviewUrl: previewUrl,
      latestPreviewVersion: job.previewVersion,
      latestZipFilename,
      updatedBy: context.admin.id,
      createdBy: context.admin.id,
    }));
    phase = "create_preview_event";
    await runOptionalPreviewWrite("create_preview_event", () => createJourneyEvent(context, {
      demoJourneyId: journey.id,
      type: "preview",
      title: "Preview klaar",
      description: `Interne preview V${job.previewVersion} staat klaar voor controle.`,
      visible: false,
    }));
    return {
      job: normalizeBuildJob({
        ...jobRecord(job),
        ...completedRecord,
        generated_package: generatedPackage,
        quality_report: qualityReport,
        preview_url: previewUrl,
        preview_token: token,
        preview_score: qualityReport.score,
      }),
      journey: updatedJourney,
      previewVersion,
    };
  } catch (error) {
    error.module = "website_factory";
    error.reason = isMissingFactoryTableError(error) ? "missing_website_factory_tables" : "website_factory_build_failed";
    if (error.phase && error.phase !== phase) error.upstreamPhase = error.phase;
    error.phase = phase;
    error.demoJourneyId = error.demoJourneyId || journey?.id || cleanText(payload.demoJourneyId || payload.demo_journey_id);
    error.leadId = error.leadId || journey?.leadId || cleanText(payload.leadId || payload.lead_id);
    error.packageType = error.packageType || normalizePackageType(payload.packageType || payload.package_type || journey?.packageType);
    if (job?.id && journey?.id) {
      const persistedPreview = await readPreviewVersionByBuildJobId(context, job.id).catch(() => null);
      if (persistedPreview?.id) {
        return recoverBuildFromPreview(context, { job, journey, previewVersion: persistedPreview });
      }
      await markInterruptedBuild(context, job, error, phase);
    }
    throw error;
  }
}

function isPackageResumePoint(job = {}) {
  if (!["quality_check", "deploying", "retryable"].includes(cleanText(job.status))) return false;
  return /quality|deploy|preview_version|patch_build_job_deploying/i.test(cleanText(job.currentStep));
}

async function markInterruptedBuild(context, job, error, phase) {
  const retryable = Number(error?.status || 500) >= 500 || error?.code === "UPSTREAM_TIMEOUT";
  const status = retryable ? "retryable" : "failed";
  const message = retryable
    ? "De previewbuild is onderbroken en kan veilig opnieuw worden geprobeerd."
    : "De previewbuild kon niet worden afgerond.";
  const record = {
    status,
    current_step: phase || "failed",
    progress: Math.max(0, Number(job.progress || 0)),
    error_message: message,
    finished_at: retryable ? null : new Date().toISOString(),
    build_logs: buildLogs(job.buildLogs, { step: status, message, phase: phase || "" }),
  };
  await patchBuildJob(context, job.id, record).catch((patchError) => {
    console.warn("Website Factory build recovery status failed", {
      phase: "mark_interrupted_build",
      buildJobId: job.id,
      status: patchError?.status || 500,
      code: patchError?.code || "",
    });
  });
}

async function recoverBuildFromPreview(context, { job = {}, journey = {}, previewVersion = {} } = {}) {
  const completedRecord = {
    status: "completed",
    current_step: "completed",
    progress: 100,
    preview_url: previewVersion.previewUrl,
    preview_token: previewVersion.previewToken,
    preview_score: previewVersion.previewScore,
    error_message: null,
    finished_at: new Date().toISOString(),
    build_logs: buildLogs(job.buildLogs, { step: "recovered", message: `Bestaande preview V${previewVersion.version || job.previewVersion || 1} hersteld.` }),
  };
  await patchBuildJob(context, job.id, completedRecord);
  let updatedJourney = journey;
  try {
    updatedJourney = await updateDemoJourneyPreview(context, {
      demoJourneyId: journey.id,
      generatedBriefing: journey.generatedBriefing,
      previewUrl: previewVersion.previewUrl,
      previewToken: previewVersion.previewToken,
      status: "interne_preview_klaar",
      persistPackage: false,
    });
  } catch (error) {
    console.warn("Website Factory preview journey recovery skipped", {
      phase: "recover_demo_journey_preview",
      buildJobId: job.id,
      status: error?.status || 500,
      code: error?.code || "",
    });
  }
  await runOptionalPreviewWrite("recover_project_workspace", () => upsertProjectWorkspace(context, {
    leadId: journey.leadId,
    customerId: journey.customerId || previewVersion.customerId,
    demoJourneyId: journey.id,
    businessName: journey.businessName,
    websiteUrl: journey.websiteUrl,
    latestPreviewUrl: previewVersion.previewUrl,
    latestPreviewVersion: previewVersion.version || job.previewVersion,
    latestZipFilename: zipFilenameFor({ businessName: journey.businessName, websiteUrl: journey.websiteUrl, version: previewVersion.version || job.previewVersion || 1 }),
    updatedBy: context.admin.id,
    createdBy: context.admin.id,
  }));
  return {
    job: normalizeBuildJob({ ...jobRecord(job), ...completedRecord }),
    journey: updatedJourney,
    previewVersion: normalizePreviewVersion(previewVersion),
    recovered: true,
  };
}

async function runOptionalPreviewWrite(phase, callback) {
  try {
    return await callback();
  } catch (error) {
    console.warn("Website Factory optional preview write skipped", {
      phase,
      status: error?.status || 500,
      code: error?.code || "",
    });
    return null;
  }
}

async function failBuild(context, job, message, logs = []) {
  const failedRecord = {
    status: "failed",
    current_step: "failed",
    progress: Math.max(Number(job.progress || 0), 20),
    error_message: message,
    finished_at: new Date().toISOString(),
    build_logs: buildLogs(logs, { step: "failed", message }),
  };
  await patchBuildJob(context, job.id, failedRecord);
  return { job: normalizeBuildJob({ ...jobRecord(job), ...failedRecord }), journey: null, previewVersion: null };
}

function jobRecord(job = {}) {
  return {
    id: job.id,
    demo_journey_id: job.demoJourneyId,
    lead_id: job.leadId || null,
    customer_id: job.customerId || null,
    status: job.status,
    current_step: job.currentStep,
    progress: job.progress,
    preview_version: job.previewVersion,
    preview_url: job.previewUrl,
    preview_token: job.previewToken,
    preview_score: job.previewScore,
    quality_report: job.qualityReport,
    generated_package: job.generatedPackage,
    build_logs: job.buildLogs,
    error_message: job.errorMessage,
    started_at: job.startedAt,
    finished_at: job.finishedAt || null,
    created_by: job.createdBy,
    created_at: job.createdAt,
  };
}

function sanitizeBuildJob(job = null) {
  if (!job || typeof job !== "object") return job;
  const { generatedPackage, ...safe } = job;
  return safe;
}

function sanitizePreviewVersion(version = null) {
  if (!version || typeof version !== "object") return version;
  const { generatedPackage, ...safe } = version;
  return safe;
}

function sanitizeBuildResult(result = {}) {
  return {
    ...result,
    job: sanitizeBuildJob(result.job),
    previewVersion: sanitizePreviewVersion(result.previewVersion),
  };
}

async function getBuildHistory(context, { demoJourneyId = "", leadId = "" } = {}) {
  const jobs = await readBuildJobSummaries(context, { demoJourneyId, leadId, limit: 25 });
  const versions = demoJourneyId ? await readPreviewVersionSummaries(context, demoJourneyId) : [];
  return { jobs, previewVersions: versions, latestJob: jobs[0] || null, activeVersion: versions.find((version) => version.isActive) || versions[0] || null };
}

async function readBuildJobSummaries(context, { demoJourneyId = "", leadId = "", limit = 25 } = {}) {
  const query = new URLSearchParams({ select: BUILD_JOB_SUMMARY_FIELDS, order: "created_at.desc", limit: String(limit) });
  if (demoJourneyId) query.set("demo_journey_id", `eq.${demoJourneyId}`);
  if (leadId && cleanUuid(leadId)) query.set("lead_id", `eq.${cleanUuid(leadId)}`);
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_build_jobs?${query.toString()}`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows.map(normalizeBuildJob);
}

async function readPreviewVersionSummaries(context, demoJourneyId) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_preview_versions?select=${encodeURIComponent(PREVIEW_RECOVERY_FIELDS)}&demo_journey_id=eq.${encodeURIComponent(demoJourneyId)}&order=version.desc`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows.map(normalizePreviewVersion);
}

async function createPreviewVersion(context, payload = {}) {
  const demoJourneyId = cleanText(payload.demoJourneyId || payload.demo_journey_id);
  if (!demoJourneyId) {
    const error = new Error("Demo journey id ontbreekt voor previewversie.");
    error.status = 400;
    throw error;
  }
  const buildJobId = cleanText(payload.buildJobId || payload.build_job_id);
  if (buildJobId) {
    const existing = await readPreviewVersionByBuildJobId(context, buildJobId);
    if (existing?.id) return normalizePreviewVersion(existing);
  }
  const generatedPackage = payload.generatedPackage || payload.generated_package || {};
  const files = Array.isArray(generatedPackage.files) ? generatedPackage.files : [];
  const entryFile = cleanText(generatedPackage.entryFile || generatedPackage.meta?.entryFile || "index.html");
  const entryExists = files.some((file) => cleanText(file?.path) === entryFile);
  const editorManifestAvailable = Number(generatedPackage.meta?.editorManifest?.version || 0) === 1;
  const sectionMarkersAvailable = files.some((file) => /\.html?$/i.test(cleanText(file?.path)) && /data-mws-section-id/i.test(cleanText(file?.content)));
  const record = {
    id: cleanUuid(payload.id) || cleanUuid(buildJobId) || randomUUID(),
    demo_journey_id: demoJourneyId,
    build_job_id: buildJobId || null,
    customer_id: cleanUuid(payload.customerId || payload.customer_id) || null,
    project_id: cleanUuid(payload.projectId || payload.project_id) || null,
    website_id: cleanUuid(payload.websiteId || payload.website_id) || null,
    version: Number(payload.version || 1),
    title: cleanText(payload.title || payload.customerTitle || payload.customer_title || "Website-preview"),
    preview_url: cleanText(payload.previewUrl || payload.preview_url),
    preview_token: cleanText(payload.previewToken || payload.preview_token),
    preview_score: Number(payload.previewScore || payload.preview_score || 0),
    quality_report: payload.qualityReport || payload.quality_report || {},
    generated_package: generatedPackage,
    metadata: {
      ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
      previewSource: "website_factory",
      entryFile,
      fileCount: files.length,
      renderable: Boolean(entryExists && cleanText(payload.previewUrl || payload.preview_url) && cleanText(payload.previewToken || payload.preview_token)),
      editorManifestAvailable,
      sectionMarkersAvailable,
    },
    is_active: true,
    status: "internal",
    created_by: cleanText(payload.createdBy || payload.created_by || context.admin.id),
    created_at: new Date().toISOString(),
  };
  try {
    await insertPreviewVersion(context, record);
  } catch (error) {
    const existing = buildJobId ? await readPreviewVersionByBuildJobId(context, buildJobId).catch(() => null) : null;
    if (existing?.id) return existing;
    throw error;
  }
  try {
    await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_preview_versions?demo_journey_id=eq.${encodeURIComponent(demoJourneyId)}&id=neq.${encodeURIComponent(record.id)}`, {
      method: "PATCH",
      headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
  }
  return normalizePreviewVersion(record);
}

async function updateDemoJourneyPreview(context, payload = {}) {
  const demoJourneyId = cleanText(payload.demoJourneyId || payload.demo_journey_id);
  const existingJourney = await readJourney(context, demoJourneyId);
  const existingPackage = existingJourney?.preview_package && typeof existingJourney.preview_package === "object" ? existingJourney.preview_package : {};
  const generatedPackage = payload.generatedPackage || payload.generated_package || {};
  const persistedSource = storedPreviewSource(existingPackage);
  const includeGeneratedPackage = payload.persistPackage !== false;
  const record = {
    generated_briefing: cleanText(payload.generatedBriefing || payload.generated_briefing),
    preview_url: cleanText(payload.previewUrl || payload.preview_url),
    preview_token: cleanText(payload.previewToken || payload.preview_token),
    ...(includeGeneratedPackage ? { preview_package: {
      ...generatedPackage,
      ...(existingPackage.manualPreview ? { manualPreview: existingPackage.manualPreview } : {}),
      ...(existingPackage.savedDemoSite ? { savedDemoSite: existingPackage.savedDemoSite } : {}),
      ...(existingPackage.linkedRecords ? { linkedRecords: existingPackage.linkedRecords } : {}),
      ...(persistedSource ? { activePreviewSource: persistedSource } : {}),
    } } : {}),
    preview_generated_at: new Date().toISOString(),
    demo_status: cleanText(payload.status || "interne_preview_klaar"),
    updated_by: context.admin.id,
    updated_at: new Date().toISOString(),
  };
  const rows = await patchDemoJourneyPreview(context, demoJourneyId, record);
  return mapJourney(rows[0] || {});
}

async function patchDemoJourneyPreview(context, demoJourneyId, record = {}) {
  try {
    return await patchDemoJourneyPreviewRecord(context, demoJourneyId, record);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const { preview_token, preview_package, preview_generated_at, ...fallbackRecord } = record;
    return patchDemoJourneyPreviewRecord(context, demoJourneyId, fallbackRecord);
  }
}

async function patchDemoJourneyPreviewRecord(context, demoJourneyId, record = {}) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/demo_journeys?id=eq.${encodeURIComponent(demoJourneyId)}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

async function readJourney(context, id) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/demo_journeys?select=*&id=eq.${encodeURIComponent(cleanText(id))}&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] || null;
}

async function readBuildJobById(context, id) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_build_jobs?select=${encodeURIComponent(BUILD_JOB_SUMMARY_FIELDS)}&id=eq.${encodeURIComponent(cleanText(id))}&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] || null;
}

async function readPreviewVersionByBuildJobId(context, buildJobId) {
  const id = cleanText(buildJobId);
  if (!id) return null;
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_preview_versions?select=${encodeURIComponent(PREVIEW_RECOVERY_FIELDS)}&build_job_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] ? normalizePreviewVersion(rows[0]) : null;
}

async function readPreviewVersions(context, demoJourneyId) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_preview_versions?select=*&demo_journey_id=eq.${encodeURIComponent(demoJourneyId)}&order=version.desc`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows.map(normalizePreviewVersion);
}

async function readPreviewVersionsByCustomer(context, customerId) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_preview_versions?select=*&customer_id=eq.${encodeURIComponent(customerId)}&order=version.desc&limit=100`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows.map(normalizePreviewVersion);
}

async function patchBuildJob(context, id, record) {
  try {
    return await patchBuildJobRecord(context, id, record);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const fallbackRecord = stripFactoryOptionalColumns(record, ["status", "current_step", "progress", "preview_version", "preview_url"]);
    if (!Object.keys(fallbackRecord).length) throw error;
    return patchBuildJobRecord(context, id, fallbackRecord);
  }
}

async function insertBuildJob(context, record) {
  try {
    return await insertBuildJobRecord(context, record);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    return insertBuildJobRecord(context, stripFactoryOptionalColumns(record, ["demo_journey_id", "status", "current_step", "progress", "preview_version"]));
  }
}

async function insertPreviewVersion(context, record) {
  try {
    return await insertPreviewVersionRecord(context, record);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    return insertPreviewVersionRecord(context, stripFactoryOptionalColumns(record, ["demo_journey_id", "version", "preview_url"]));
  }
}

function patchBuildJobRecord(context, id, record) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/website_build_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

function insertBuildJobRecord(context, record) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/website_build_jobs`, {
    method: "POST",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

function insertPreviewVersionRecord(context, record) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/website_preview_versions`, {
    method: "POST",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

function stripFactoryOptionalColumns(record = {}, keepKeys = []) {
  const keep = new Set(keepKeys);
  return Object.fromEntries(Object.entries(record).filter(([key]) => keep.has(key)));
}

async function createJourneyEvent(context, payload = {}) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/demo_journey_events`, {
    method: "POST",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
    body: JSON.stringify({
      demo_journey_id: payload.demoJourneyId,
      event_type: payload.type,
      title: payload.title,
      description: payload.description,
      visible_to_customer: Boolean(payload.visible),
      created_by: context.admin.id,
    }),
  });
}

async function supabaseFetch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("Supabase request timed out.");
      timeout.name = "UpstreamTimeoutError";
      timeout.status = 504;
      timeout.code = "UPSTREAM_TIMEOUT";
      timeout.phase = "fetch_factory_data";
      timeout.url = url;
      timeout.method = options?.method || "GET";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error("Supabase gaf geen geldige JSON-response terug.");
      error.status = response.status || 500;
      error.url = url;
      error.method = options?.method || "GET";
      error.responseText = text;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    error.code = data?.code || "";
    error.details = data?.details || "";
    error.hint = data?.hint || "";
    error.url = url;
    error.method = options?.method || "GET";
    error.responseText = text;
    error.responseJson = data;
    error.requestBody = options?.body || "";
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function mapJourney(row = {}) {
  return {
    id: cleanText(row.id),
    leadId: cleanText(row.lead_id),
    customerId: cleanText(row.customer_id),
    projectId: cleanText(row.project_id),
    websiteId: cleanText(row.website_id),
    businessName: cleanText(row.business_name),
    contactName: cleanText(row.contact_name),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    websiteUrl: cleanText(row.website_url),
    demoStatus: cleanText(row.demo_status),
    generatedBriefing: cleanText(row.generated_briefing),
    previewUrl: cleanText(row.preview_url),
    previewPackage: row.preview_package && typeof row.preview_package === "object" ? row.preview_package : null,
    packageType: cleanText(row.preview_package?.meta?.packageType || row.preview_package?.packageType || ""),
    internalNotes: cleanText(row.internal_notes),
    assignedTo: cleanText(row.assigned_to),
    createdBy: cleanText(row.created_by),
    updatedBy: cleanText(row.updated_by),
    updatedAt: cleanText(row.updated_at),
  };
}

function assertCanSeeJourney(journey = {}, admin = {}) {
  if (managerRoles.has(cleanText(admin.role).toLowerCase())) return;
  const tokens = [journey.created_by, journey.assigned_to, journey.updated_by, journey.createdBy, journey.assignedTo, journey.updatedBy].map(cleanText);
  if (tokens.includes(cleanText(admin.id))) return;
  const error = new Error("Je mag deze demo-klantreis niet gebruiken voor de Website Factory.");
  error.status = 403;
  throw error;
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

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders({ methods: "GET, POST, PATCH, OPTIONS" }),
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

function errorResponse({ error = {}, developerMode = false, module = "", reason = "", fallbackMessage = "", setupRequired = false } = {}) {
  const message = error.message || fallbackMessage || "Aanvraag kon niet worden verwerkt.";
  const body = {
    success: false,
    module,
    phase: error.phase || "",
    reason,
    message,
    error: developerMode ? message : fallbackMessage || message,
    userMessage: setupRequired
      ? fallbackMessage
      : "De Website Factory kon de aanvraag niet verwerken. Zet Developer Mode aan voor technische details of controleer de serverlogs.",
    code: error.code || "",
    details: developerMode ? cleanText(error.details) : "",
    hint: developerMode ? cleanText(error.hint) : "",
    setupRequired: Boolean(setupRequired),
    diagnostics: {
      module,
      reason,
      phase: error.phase || "",
      action: error.action || "",
      demoJourneyId: cleanText(error.demoJourneyId),
      leadId: cleanText(error.leadId),
      packageType: cleanText(error.packageType),
      status: error.status || 500,
      code: error.code || "",
      method: error.method || "",
      url: developerMode ? cleanText(error.url) : "",
      responseText: developerMode ? cleanText(error.responseText) : "",
      responseJson: developerMode ? error.responseJson || null : null,
      requestBody: developerMode ? cleanText(error.requestBody) : "",
    },
  };
  if (developerMode && error.stack) body.stack = error.stack;
  return body;
}

function isDeveloperRequest(event = {}) {
  const headers = event.headers || {};
  return String(headers["x-mws-developer-mode"] || headers["X-MWS-Developer-Mode"] || "").toLowerCase() === "true";
}

function normalizePackageType(value = "") {
  const text = cleanText(value).toLowerCase();
  if (/premium|1750|uitgebreid|growth|enterprise/.test(text)) return "premium";
  if (/business|995|professional|professioneel|plus|multi/.test(text)) return "business";
  return "starter";
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function runtimeEnvironment() {
  return [process.env.APP_ENV, process.env.APP_ENVIRONMENT, process.env.CONTEXT, process.env.NETLIFY_ENV].some((value) => ["production", "prod"].includes(cleanText(value).toLowerCase())) ? "production" : "test";
}

function cleanUuid(value = "") {
  const text = cleanText(value);
  return uuidPattern.test(text) ? text : "";
}

function isMissingFactoryTableError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.status === 404
    || text.includes("42p01")
    || text.includes("pgrst205")
    || text.includes("schema cache")
    || text.includes("website_build_jobs")
    || text.includes("website_preview_versions");
}

function isMissingColumnError(error = {}) {
  const text = [error.message, error.details, error.hint, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.code === "42703" || error.code === "PGRST204" || text.includes("schema cache") || text.includes("column");
}

async function readOnboardingFactoryRecords(context, { customerId = "", projectId = "" } = {}) {
  const project = projectId
    ? await readProjectById(context, projectId)
    : customerId ? await readLatestProjectByCustomer(context, customerId) : null;
  const customer = customerId
    ? await readCustomerById(context, customerId)
    : project?.customer_id ? await readCustomerById(context, project.customer_id) : null;
  const website = project?.website_id ? await readWebsiteById(context, project.website_id) : customer?.id ? await readLatestWebsiteByCustomer(context, customer.id) : null;
  return {
    customer: normalizeRecord(customer),
    project: normalizeRecord(project),
    website: normalizeRecord(website),
  };
}

async function readProjectById(context, id) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/projects?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] || null;
}

async function readLatestProjectByCustomer(context, customerId) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/projects?select=*&customer_id=eq.${encodeURIComponent(customerId)}&order=updated_at.desc.nullslast&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] || null;
}

async function readCustomerById(context, id) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/customers?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] || null;
}

async function readWebsiteById(context, id) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/websites?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] || null;
}

async function readLatestWebsiteByCustomer(context, customerId) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/websites?select=*&customer_id=eq.${encodeURIComponent(customerId)}&order=updated_at.desc.nullslast&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] || null;
}

function normalizeRecord(row) {
  if (!row) return null;
  return { ...row, metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {} };
}

async function ensureFactoryJourney(context, { records, factoryInput, analysis, blueprint, contentPlan, brandingPlan, mediaMap, seoPlan }) {
  const existingId = cleanText(records.project.metadata?.factoryPipeline?.demoJourneyId || records.project.metadata?.websiteFactoryRun?.demoJourneyId || "");
  if (existingId) {
    const existing = await readJourney(context, existingId).catch(() => null);
    if (existing?.id) {
      await updateFactoryJourney(context, existing.id, { records, factoryInput, analysis, blueprint, contentPlan, brandingPlan, mediaMap, seoPlan });
      return mapJourney({ ...existing, id: existing.id });
    }
  }
  const customerJourney = await readJourneyByCustomer(context, records.customer.id);
  if (customerJourney?.id) {
    await updateFactoryJourney(context, customerJourney.id, { records, factoryInput, analysis, blueprint, contentPlan, brandingPlan, mediaMap, seoPlan });
    return mapJourney(customerJourney);
  }
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/demo_journeys`, {
    method: "POST",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(factoryJourneyRecord(context, { records, factoryInput, analysis, blueprint, contentPlan, brandingPlan, mediaMap, seoPlan })),
  });
  return mapJourney(rows[0] || {});
}

async function readJourneyByCustomer(context, customerId) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/demo_journeys?select=*&customer_id=eq.${encodeURIComponent(customerId)}&order=updated_at.desc.nullslast&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] || null;
}

async function updateFactoryJourney(context, id, bundle) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/demo_journeys?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(factoryJourneyRecord(context, bundle)),
  });
}

function factoryJourneyRecord(context, { records, factoryInput, analysis, blueprint, contentPlan, brandingPlan, mediaMap, seoPlan }) {
  const generatedBriefing = factoryInput.generatedBriefing || buildPipelineBriefing({ factoryInput, analysis, blueprint, contentPlan, brandingPlan, mediaMap, seoPlan });
  return {
    customer_id: records.customer.id,
    business_name: factoryInput.businessName || records.customer.company || records.customer.name || "",
    contact_name: factoryInput.contactName || records.customer.name || "",
    email: factoryInput.email || records.customer.email || "",
    phone: factoryInput.phone || records.customer.phone || "",
    website_url: factoryInput.websiteUrl || records.website?.domain || records.customer.website || "",
    demo_status: "intern_in_productie",
    generated_briefing: generatedBriefing,
    preview_package: {
      source: "customer_onboarding",
      meta: {
        packageType: factoryInput.packageType || records.customer.package || "",
        customerId: records.customer.id,
        projectId: records.project.id,
      },
      factoryInput,
      factoryAnalysis: analysis,
      blueprint,
      contentPlan,
      brandingPlan,
      mediaMap,
      seoPlan,
    },
    internal_notes: [
      "Automatisch gestart vanuit goedgekeurde klantonboarding.",
      `Project: ${records.project.name || records.project.id}`,
      `Compleetheid: ${factoryInput.completeness || 0}%`,
    ].join("\n"),
    assigned_to: cleanText(context.admin?.id || context.admin?.email),
    updated_by: cleanText(context.admin?.id || context.admin?.email),
    created_by: cleanText(context.admin?.id || context.admin?.email),
  };
}

function buildFactoryAnalysis({ records, factoryInput, onboarding }) {
  const branding = factoryInput.branding || {};
  const seo = factoryInput.seo || {};
  const services = cleanArray(factoryInput.services);
  const pages = cleanArray(factoryInput.pages);
  const ctas = cleanArray(factoryInput.ctas);
  const missing = [];
  if (!services.length) missing.push("Diensten");
  if (!pages.length) missing.push("Pagina's");
  if (!factoryInput.businessName) missing.push("Bedrijfsnaam");
  if (!branding.colors) missing.push("Kleuren");
  if (!cleanUploads(factoryInput.uploads).length) missing.push("Uploads");
  if (!seo.keywords?.length) missing.push("SEO zoekwoorden");
  if (!branding.logo && !cleanUploads(factoryInput.uploads).some((file) => /logo/i.test(file.name || ""))) missing.push("Logo");
  return {
    companyType: inferCompanyType(factoryInput, records),
    industry: inferCompanyType(factoryInput, records),
    audience: seo.audience || "Lokale en online klanten",
    toneOfVoice: seo.toneOfVoice || "professioneel, helder en betrouwbaar",
    brandStyle: branding.lookAndFeel || branding.mustHaveMustNot || "premium, rustig en conversiegericht",
    primaryColor: firstColor(branding.colors) || "#102033",
    accentColor: secondColor(branding.colors) || "#14b8a6",
    fontDirection: branding.fontPreference || "moderne sans-serif",
    keyServices: services.slice(0, 8),
    usps: cleanArray(factoryInput.texts?.usps || onboarding.answers?.content?.usps).slice(0, 6),
    primaryCta: ctas[0] || "Offerte aanvragen",
    secondaryCta: ctas[1] || "Contact opnemen",
    seoFocus: seo.keywords || [],
    serviceArea: seo.serviceArea || "",
    conversionGoals: ctas.length ? ctas : ["Aanvragen ontvangen", "Vertrouwen opbouwen", "Contact laagdrempelig maken"],
    missingCriticalInfo: missing,
    preparedAt: new Date().toISOString(),
  };
}

function buildFactoryBlueprint({ factoryInput, analysis }) {
  const requestedPages = cleanArray(factoryInput.pages);
  const basePages = ["Home", "Over ons", "Diensten", "Contact", "FAQ", "Reviews", "Privacy", "Algemene voorwaarden", "404", "Bedankt"];
  const servicePages = analysis.keyServices.slice(0, 6).map((service) => `${service}`);
  const extraPages = requestedPages.filter((page) => !basePages.some((base) => normalizeToken(base) === normalizeToken(page)));
  const pages = [...new Set([...basePages, ...extraPages, ...servicePages])].map((title) => blueprintPage(title, factoryInput, analysis));
  return {
    status: "prepared",
    pages,
    navigation: pages.filter((page) => ["Home", "Over ons", "Diensten", "Contact", "FAQ", "Reviews"].includes(page.title)).map((page) => ({ label: page.title, slug: page.slug })),
    preparedAt: new Date().toISOString(),
  };
}

function blueprintPage(title, factoryInput, analysis) {
  const slug = title === "Home" ? "index" : slugify(title);
  const isService = analysis.keyServices.some((service) => normalizeToken(service) === normalizeToken(title));
  const sections = title === "Home"
    ? ["hero", "diensten", "usp", "werkwijze", "reviews", "contact"]
    : isService ? ["hero", "dienst-uitleg", "voordelen", "faq", "contact"] : ["hero", "content", "cta"];
  return {
    slug: slug === "index" ? "index.html" : `${slug}.html`,
    title,
    goal: isService ? `Conversie voor ${title}` : pageGoal(title),
    sections,
    ctas: cleanArray(factoryInput.ctas).slice(0, 3),
    seoTitle: `${title} - ${factoryInput.businessName || "Website"}`,
    metaDescription: metaDescriptionFor(title, factoryInput, analysis),
    requiredMedia: mediaForPage(title, isService),
    status: "prepared",
  };
}

function buildContentPlan({ factoryInput, analysis, blueprint }) {
  return {
    status: "prepared",
    heroHeadline: `${factoryInput.businessName || "Uw bedrijf"} helpt klanten met ${analysis.keyServices[0] || analysis.industry}.`,
    heroSubtitle: factoryInput.texts?.about || `Professioneel, duidelijk en gericht op ${analysis.audience}.`,
    sectionTitles: blueprint.pages.slice(0, 8).map((page) => ({ page: page.slug, title: page.title })),
    uspBlocks: analysis.usps.length ? analysis.usps : ["Heldere afspraken", "Professionele uitvoering", "Korte lijnen"],
    ctaTexts: [analysis.primaryCta, analysis.secondaryCta].filter(Boolean),
    faq: factoryInput.texts?.faq || "Veelgestelde vragen worden aangevuld zodra extra input beschikbaar is.",
    reviewPlaceholders: factoryInput.texts?.reviews ? [] : ["Reviews worden toegevoegd zodra de klant ze aanlevert."],
    internalLinks: blueprint.pages.slice(0, 6).map((page) => page.slug),
    openGraph: {
      title: `${factoryInput.businessName || "Website"} - ${analysis.primaryCta}`,
      description: metaDescriptionFor("Home", factoryInput, analysis),
    },
  };
}

function buildBrandingPlan({ factoryInput, analysis }) {
  const uploads = cleanUploads(factoryInput.uploads);
  const logo = uploads.find((file) => /logo/i.test(file.name || "")) || null;
  const branding = factoryInput.brandingMetadata || factoryInput.branding || {};
  const brandingLogo = branding.logo || null;
  return {
    status: branding.metadata?.brandingStatus === "linked_to_factory" ? "linked_to_factory" : "prepared",
    logoStatus: logo || brandingLogo ? "available" : "missing",
    logoTask: logo || brandingLogo ? "" : "Voorbereiden in bestaande Logo Studio",
    primaryColor: branding.primaryColor || analysis.primaryColor,
    secondaryColor: branding.secondaryColor || "#f6f8fb",
    accentColor: branding.accentColor || analysis.accentColor,
    backgroundColor: "#ffffff",
    cardStyle: "strak, lichte schaduw, compacte radius",
    buttonStyle: "hoog contrast, duidelijke CTA",
    typographyDirection: branding.typography || analysis.fontDirection,
    spacingDirection: "ruim maar scanbaar",
    iconStyle: branding.iconStyle || "lijniconen, subtiel en functioneel",
    visualMood: analysis.brandStyle,
    logoAsset: brandingLogo,
    favicon: branding.metadata?.variants?.find?.((item) => item.key === "favicon") || null,
    socialImages: branding.metadata?.socialAssets || [],
    downloads: branding.metadata?.downloads || [],
    metadata: branding.metadata || {},
  };
}

function buildMediaMap({ factoryInput }) {
  const uploads = cleanUploads(factoryInput.uploads);
  const byName = (pattern) => uploads.filter((file) => pattern.test([file.name, file.type].join(" ")));
  return {
    status: "prepared",
    hero: byName(/hero|cover|foto|jpg|jpeg|png|webp/i)[0] || null,
    about: byName(/team|over|bedrijf|locatie/i)[0] || null,
    team: byName(/team|persoon|medewerker/i),
    services: byName(/dienst|service|project/i),
    gallery: uploads.filter((file) => /^image\//.test(file.type || "")),
    reviews: byName(/review|testimonial/i),
    certificates: byName(/certificaat|certificate|pdf/i),
    backgrounds: byName(/background|achtergrond|cover/i),
    missing: uploads.length ? [] : ["Uploads ontbreken"],
  };
}

function buildSeoPlan({ factoryInput, analysis, blueprint }) {
  const keywords = cleanArray(factoryInput.seo?.keywords);
  const missing = [];
  if (!keywords.length) missing.push("SEO zoekwoorden");
  if (!factoryInput.seo?.serviceArea) missing.push("Werkgebied");
  return {
    status: "prepared",
    keywords,
    titles: blueprint.pages.map((page) => ({ slug: page.slug, title: page.seoTitle })),
    metaDescriptions: blueprint.pages.map((page) => ({ slug: page.slug, description: page.metaDescription })),
    headings: blueprint.pages.map((page) => ({ slug: page.slug, h1: page.title, h2: page.sections })),
    internalLinks: blueprint.pages.slice(0, 8).map((page) => page.slug),
    openGraph: {
      title: `${factoryInput.businessName || "Website"} - ${analysis.primaryCta}`,
      description: metaDescriptionFor("Home", factoryInput, analysis),
    },
    twitterCards: "summary_large_image",
    schema: ["LocalBusiness", "WebSite", "FAQPage"],
    canonical: factoryInput.websiteUrl || "",
    robots: "index,follow na livegang; noindex tijdens preview",
    altTextDirection: `Beschrijf dienst, locatie en merknaam ${factoryInput.businessName || ""}`.trim(),
    missing,
  };
}

function buildPipelineBriefing({ factoryInput, analysis, blueprint, contentPlan, brandingPlan, mediaMap, seoPlan }) {
  const rows = [
    ["Bedrijf", factoryInput.businessName],
    ["Contact", [factoryInput.contactName, factoryInput.email, factoryInput.phone].filter(Boolean).join(", ")],
    ["Branche", analysis.industry],
    ["Doelgroep", analysis.audience],
    ["Tone of voice", analysis.toneOfVoice],
    ["Diensten", analysis.keyServices.join(", ")],
    ["USP's", analysis.usps.join(", ")],
    ["CTA", [analysis.primaryCta, analysis.secondaryCta].filter(Boolean).join(", ")],
    ["Pagina's", blueprint.pages.map((page) => page.title).join(", ")],
    ["Branding", `${brandingPlan.primaryColor}, ${brandingPlan.accentColor}, ${brandingPlan.visualMood}`],
    ["Media", `Hero: ${mediaMap.hero?.name || "fallback"}, uploads: ${cleanUploads(factoryInput.uploads).length}`],
    ["SEO", seoPlan.keywords.join(", ")],
    ["Ontbrekend", [...analysis.missingCriticalInfo, ...mediaMap.missing, ...seoPlan.missing].join(", ")],
    ["Onboarding briefing", factoryInput.generatedBriefing],
  ];
  return rows.filter(([, value]) => cleanText(value)).map(([label, value]) => `${label}: ${value}`).join("\n");
}

async function persistFactoryPipeline(context, records, pipeline, projectPatch = {}) {
  const metadata = {
    ...(records.project.metadata || {}),
    factoryPipeline: pipeline,
    websiteFactoryRun: {
      id: pipeline.id,
      status: pipeline.status,
      currentStep: pipeline.currentStep,
      demoJourneyId: pipeline.demoJourneyId,
      buildJobId: pipeline.buildJobId || "",
      previewUrl: pipeline.previewUrl || "",
      previewScore: pipeline.previewScore || 0,
      updatedAt: pipeline.updatedAt,
    },
    websiteFactoryAnalysis: pipeline.analysis,
    websiteFactoryBlueprint: pipeline.blueprint,
    websiteFactoryContentPlan: pipeline.contentPlan,
    websiteFactoryBrandingPlan: pipeline.brandingPlan,
    websiteFactoryMediaMap: pipeline.mediaMap,
    websiteFactorySeoPlan: pipeline.seoPlan,
    websiteFactoryAttention: pipeline.missingInfo || [],
  };
  records.project.metadata = metadata;
  const patch = {
    metadata,
    updated_at: new Date().toISOString(),
    ...projectPatch,
  };
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/projects?id=eq.${encodeURIComponent(records.project.id)}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

async function persistPreviewReview(context, records, review, projectPatch = {}) {
  const metadata = {
    ...(records.project.metadata || {}),
    previewReview: review,
    launchChecklist: review.launch,
    postLaunchUpsells: review.postLaunchUpsells || records.project.metadata?.postLaunchUpsells || [],
    postLaunchGrowth: review.postLaunchGrowth || records.project.metadata?.postLaunchGrowth || null,
  };
  records.project.metadata = metadata;
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/projects?id=eq.${encodeURIComponent(records.project.id)}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify({
      metadata,
      updated_at: new Date().toISOString(),
      ...projectPatch,
    }),
  });
}

function normalizeLaunchChecklist(current = {}) {
  const labels = ["domein gekoppeld", "DNS gecontroleerd", "SSL", "favicon", "SEO", "analytics", "formulieren", "e-mail", "mobiel", "snelheid", "privacy", "cookie", "social metadata", "redirects"];
  const existing = Array.isArray(current.checklist) ? current.checklist : [];
  const checklist = labels.map((label) => {
    const found = existing.find((item) => normalizeToken(item.label || item.id) === normalizeToken(label));
    return {
      id: slugify(label),
      label,
      done: Boolean(found?.done),
      updatedAt: cleanText(found?.updatedAt || ""),
      note: cleanText(found?.note || ""),
    };
  });
  return {
    status: cleanText(current.status || "not_started"),
    startedAt: cleanText(current.startedAt || ""),
    completedAt: cleanText(current.completedAt || ""),
    updatedAt: cleanText(current.updatedAt || ""),
    checklist,
    progress: launchProgress(checklist),
    domain: current.domain || {},
    upsells: current.upsells || postLaunchUpsells(),
  };
}

function buildInitialPreviewReview({ pipeline = {}, job = {}, journey = {} } = {}) {
  const now = new Date().toISOString();
  return {
    status: "waiting_for_customer",
    previewStatus: "Preview Ready",
    activeVersion: `v${Number(job.previewVersion || 1)}`,
    version: Number(job.previewVersion || 1),
    previewUrl: cleanText(pipeline.previewUrl || job.previewUrl || journey.previewUrl),
    previewScore: Number(pipeline.previewScore || job.previewScore || 0),
    buildJobId: cleanText(job.id || pipeline.buildJobId),
    buildDate: cleanText(job.completedAt || job.completed_at || pipeline.finishedAt || now),
    latestUpdate: now,
    seoStatus: pipeline.seoPlan?.status || "prepared",
    brandingStatus: pipeline.brandingPlan?.status || "prepared",
    projectStatus: "Waiting For Customer",
    feedbackItems: [],
    revisionCount: 0,
    versions: [{
      id: `v${Number(job.previewVersion || 1)}`,
      version: `v${Number(job.previewVersion || 1)}`,
      date: cleanText(job.completedAt || job.completed_at || pipeline.finishedAt || now),
      builder: "Website Factory",
      status: "preview_ready",
      notes: "Eerste preview klaargezet voor klantreview.",
      previewUrl: cleanText(pipeline.previewUrl || job.previewUrl || journey.previewUrl),
    }],
    launch: normalizeLaunchChecklist({ status: "not_started" }),
  };
}

function updateLaunchChecklist(current = {}, updates = []) {
  const now = new Date().toISOString();
  const byId = new Map((Array.isArray(updates) ? updates : []).map((item) => [normalizeToken(item.id || item.label), item]));
  const checklist = normalizeLaunchChecklist(current).checklist.map((item) => {
    const update = byId.get(normalizeToken(item.id)) || byId.get(normalizeToken(item.label));
    return update ? { ...item, done: Boolean(update.done), note: cleanText(update.note || item.note), updatedAt: now } : item;
  });
  const progress = launchProgress(checklist);
  return {
    ...current,
    checklist,
    progress,
    status: progress === 100 ? "ready_for_launch" : "in_progress",
    updatedAt: now,
  };
}

function markFeedbackResolved(items = [], feedbackId = "") {
  const id = cleanText(feedbackId);
  const now = new Date().toISOString();
  return (Array.isArray(items) ? items : []).map((item, index) => {
    if (id && item.id !== id) return item;
    if (!id && index !== 0) return item;
    return { ...item, status: "resolved", resolvedAt: now };
  });
}

function launchProgress(checklist = []) {
  const rows = Array.isArray(checklist) ? checklist : [];
  return rows.length ? Math.round((rows.filter((item) => item.done).length / rows.length) * 100) : 0;
}

function postLaunchUpsells() {
  return growthUpsellCatalog().map((item) => ({
    ...item,
    status: "aanbevolen",
    source: "commercial_flow",
  }));
}

function growthUpsellCatalog() {
  return [
    ["logo", "Logo ontwerp"], ["branding", "Branding pakket"], ["visitekaartjes", "Visitekaartjes"],
    ["briefpapier", "Briefpapier"], ["flyers", "Flyers"], ["brochures", "Brochures"],
    ["social", "Social media pakket"], ["google", "Google Bedrijfsprofiel"], ["seo", "SEO pakket"],
    ["google_ads", "Google Ads"], ["meta_ads", "Meta Ads"], ["ai_chatbot", "AI Chatbot"],
    ["phone_085", "085-nummer"], ["telefonie", "Zakelijke telefonie"], ["email", "E-mail inrichting"],
    ["extra_pages", "Extra pagina's"], ["extra_languages", "Extra talen"], ["photography", "Fotografie"],
    ["video", "Video"], ["maintenance", "Onderhoud"], ["hosting", "Hosting upgrades"],
    ["backup", "Back-up pakket"], ["security", "Security pakket"], ["analytics", "Analytics"],
    ["heatmaps", "Heatmaps"], ["conversion", "Conversie optimalisatie"],
  ].map(([id, label]) => ({ id, label }));
}

function buildPostLaunchGrowth(records, review, now = new Date().toISOString()) {
  const projectMeta = records.project?.metadata || {};
  const websiteMeta = records.website?.metadata || {};
  const recommendations = buildGrowthRecommendations({ records, review, projectMeta, websiteMeta });
  const health = calculateGrowthHealthScore({ records, review, recommendations, websiteMeta });
  return {
    status: "active",
    onlineSince: review.liveAt || now,
    health,
    recommendations,
    upsells: postLaunchUpsells().map((item) => ({
      ...item,
      priority: recommendations.some((recommendation) => recommendation.upsellId === item.id) ? "high" : "normal",
    })),
    automations: buildGrowthAutomationSchedule(now),
    crmTasks: buildGrowthTasks(recommendations, now),
    updatedAt: now,
  };
}

function buildGrowthRecommendations({ records, review, projectMeta, websiteMeta }) {
  const haystack = statusKey([JSON.stringify(projectMeta), JSON.stringify(websiteMeta), records.project?.notes, records.website?.notes].join(" "));
  const has = (pattern) => pattern.test(haystack);
  const rows = [
    ["logo_missing", "Logo ontbreekt", "Een sterk logo maakt de website herkenbaarder.", "logo", !has(/logo/)],
    ["social_missing", "Social media ontbreekt", "Social media helpt om updates en bewijs zichtbaar te maken.", "social", !has(/social|instagram|facebook|linkedin/)],
    ["google_profile_missing", "Google Bedrijfsprofiel ontbreekt", "Een compleet bedrijfsprofiel vergroot lokale vindbaarheid.", "google", !has(/google.*profiel|google business|bedrijfsprofiel/)],
    ["phone_085_interesting", "085-nummer interessant", "Een zakelijk nummer kan vertrouwen en bereikbaarheid versterken.", "phone_085", !has(/085|telefonie/)],
    ["ai_chatbot_interesting", "AI-chatbot interessant", "Een chatbot kan veelgestelde vragen en leads opvangen.", "ai_chatbot", !has(/chatbot/)],
    ["seo_improve", "SEO verbeteren", "Meer zoekwoorden en landingspagina's kunnen extra aanvragen opleveren.", "seo", !has(/seo.*pakket|seo.*actief/)],
    ["ads_start", "Advertenties starten", "Campagnes kunnen sneller verkeer en aanvragen brengen.", "google_ads", !has(/ads|advertentie/)],
    ["reviews_collect", "Reviews verzamelen", "Nieuwe reviews verhogen vertrouwen na livegang.", "google", !review.reviewRequestedAt],
    ["backup_package", "Back-up pakket", "Een herstelplan geeft rust na livegang.", "backup", !has(/backup|back-up/)],
    ["analytics_needed", "Analytics", "Meetbaar verkeer helpt om gericht te verbeteren.", "analytics", !has(/analytics|meting/)],
  ];
  return rows.filter(([, , , , active]) => active).map(([id, title, reason, upsellId], index) => ({
    id,
    title,
    reason,
    upsellId,
    status: "open",
    priority: index < 4 ? "high" : "normal",
    createdAt: new Date().toISOString(),
  }));
}

function calculateGrowthHealthScore({ records, review, recommendations, websiteMeta }) {
  const launchProgress = Number(review.launch?.progress || 0);
  const online = ["live", "online", "active", "actief"].includes(statusKey(records.project?.status || records.website?.status || review.status));
  const checks = [
    online,
    launchProgress >= 100,
    !recommendations.some((item) => item.id === "seo_improve"),
    !recommendations.some((item) => item.id === "logo_missing"),
    !recommendations.some((item) => item.id === "reviews_collect"),
    !recommendations.some((item) => item.id === "google_profile_missing"),
    !recommendations.some((item) => item.id === "social_missing"),
    statusKey(records.customer?.package || records.project?.care_package || records.website?.care_package).includes("care") || statusKey(JSON.stringify(websiteMeta)).includes("onderhoud"),
    !recommendations.some((item) => item.id === "analytics_needed"),
    !recommendations.some((item) => item.id === "backup_package"),
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return {
    score,
    label: score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 45 ? "Attention" : "Critical",
  };
}

function buildGrowthAutomationSchedule(start = new Date().toISOString()) {
  const base = new Date(start);
  const addDays = (days) => new Date(base.getTime() + days * 86400000).toISOString();
  return [
    [60, "SEO check"], [90, "Nieuwe aanbevelingen"], [180, "Onderhoud"], [365, "Jubileummail"],
  ].map(([days, label]) => ({ label, dueAt: addDays(days), status: "scheduled" }));
}

function buildGrowthTasks(recommendations, start = new Date().toISOString()) {
  const due = new Date(new Date(start).getTime() + 7 * 86400000).toISOString().slice(0, 10);
  return recommendations.slice(0, 6).map((item) => ({
    id: `growth-${item.id}`,
    title: item.title,
    type: "growth",
    status: "open",
    priority: item.priority === "high" ? "hoog" : "normaal",
    dueDate: due,
    notes: item.reason,
  }));
}

async function sendPreviewLaunchMail(records, review, type, ownershipMetadata = {}) {
  const to = cleanText(records.customer?.email);
  if (!to) return null;
  const business = cleanText(records.customer?.company || records.customer?.name || records.project?.name || "uw website");
  const templates = {
    preview_ready: {
      subject: `Preview staat klaar voor ${business}`,
      text: `Beste,\n\nDe eerste website-preview voor ${business} staat klaar. U kunt de preview bekijken en feedback geven via uw klantportaal.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    preview_updated: {
      subject: `Preview bijgewerkt voor ${business}`,
      text: `Beste,\n\nDe preview voor ${business} is bijgewerkt. U kunt opnieuw kijken en eventueel feedback geven in uw klantportaal.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    launch_started: {
      subject: `Livegang voorbereiding gestart voor ${business}`,
      text: `Beste,\n\nWe zijn gestart met de livegangvoorbereiding. We controleren domein, SSL, formulieren, SEO en mobiele weergave.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    website_live: {
      subject: `${business} staat live`,
      text: `Beste,\n\nGoed nieuws: de website staat live.${ownershipMetadata.liveUrl ? `\n\nBekijk de website: ${ownershipMetadata.liveUrl}` : ""}\n\nDe nazorg is gestart. In het klantportaal vindt u de actuele projectstatus en ondersteuning.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
  };
  const template = templates[type];
  if (!template) return null;
  return sendEmail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.text.split("\n").map((line) => `<p>${line || "&nbsp;"}</p>`).join(""),
    templateKey: type,
    templateName: type.replace(/_/g, " "),
    customerId: records.customer?.id,
    projectId: records.project?.id,
    metadata: { previewReviewStatus: review.status, ...ownershipMetadata },
  });
}

function pipelineSteps(activeStatus) {
  const steps = ["queued", "collecting_input", "generating_blueprint", "generating_content", "applying_branding", "preparing_seo", "mapping_media", "building_preview", "preview_ready", "failed"];
  const activeIndex = steps.indexOf(activeStatus);
  return steps.map((status, index) => ({
    status,
    label: pipelineLabel(status),
    state: status === "failed" && activeStatus !== "failed" ? "idle" : index < activeIndex ? "done" : index === activeIndex ? "active" : "idle",
  }));
}

function advancePipeline(pipeline, status, extra = {}) {
  return {
    ...pipeline,
    ...extra,
    status,
    currentStep: status,
    updatedAt: new Date().toISOString(),
    steps: pipelineSteps(status),
  };
}

function sanitizePipeline(pipeline = {}) {
  const { errorStack, ...safe } = pipeline;
  return safe;
}

async function factoryTimeline(records, eventType, title, description, severity = "info", metadata = {}) {
  try {
    return await createTimelineEvent({
      eventType,
      title,
      description,
      module: "website_factory",
      referenceType: "project",
      referenceId: records.project?.id || records.customer?.id,
      customerId: records.customer?.id,
      actorName: "Website Factory",
      actorRole: "automation",
      severity,
      metadata: {
        dedupeKey: `${eventType}:${records.project?.id || records.customer?.id}:${metadata.runId || ""}:${Date.now()}`,
        projectId: records.project?.id || "",
        ...metadata,
      },
    });
  } catch (error) {
    console.error("Factory timeline event skipped", { message: error.message });
    return null;
  }
}

async function factoryNotification(records, title, description, severity = "info", metadata = {}) {
  try {
    return await createTimelineEvent({
      eventType: severity === "error" ? "factory_failed" : "factory_started",
      title,
      description,
      module: "notifications",
      referenceType: "website_factory",
      referenceId: records.project?.id || records.customer?.id,
      customerId: records.customer?.id,
      actorName: "Website Factory",
      actorRole: "automation",
      severity,
      isGlobal: true,
      metadata: {
        dedupeKey: `factory_notification:${records.project?.id || records.customer?.id}:${title}:${Date.now()}`,
        notificationType: "website_factory",
        projectId: records.project?.id || "",
        ...metadata,
      },
    });
  } catch (error) {
    console.error("Factory notification skipped", { message: error.message });
    return null;
  }
}

function pipelineLabel(status) {
  return {
    queued: "In wachtrij",
    collecting_input: "Input verzamelen",
    generating_blueprint: "AI analyse en blueprint",
    generating_content: "Content voorbereiden",
    applying_branding: "Branding toepassen",
    preparing_seo: "SEO voorbereiden",
    mapping_media: "Media koppelen",
    building_preview: "Preview bouwen",
    preview_ready: "Preview gereed",
    failed: "Aandacht nodig",
  }[status] || status;
}

function pipelineProgress(status) {
  return {
    queued: 5,
    collecting_input: 15,
    generating_blueprint: 25,
    generating_content: 35,
    applying_branding: 45,
    preparing_seo: 55,
    mapping_media: 65,
    building_preview: 70,
    preview_ready: 100,
    failed: 55,
  }[status] || 10;
}

function cleanArray(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return String(value || "").split(/\n|,/).map(cleanText).filter(Boolean);
}

function cleanUploads(value) {
  return Array.isArray(value)
    ? value.map((file) => ({
      name: cleanText(file?.name || file?.fileName || file?.filename),
      type: cleanText(file?.type || file?.mimeType || file?.mime_type),
      storagePath: cleanText(file?.storagePath || file?.storage_path || file?.path || file?.url),
      storageStatus: cleanText(file?.storageStatus || file?.storage_status || file?.status),
    })).filter((file) => file.name || file.storagePath)
    : [];
}

function inferCompanyType(factoryInput, records) {
  const text = [factoryInput.generatedBriefing, factoryInput.businessName, records.customer.package, cleanArray(factoryInput.services).join(" ")].join(" ").toLowerCase();
  if (/bouw|aannemer|renovatie|timmer/.test(text)) return "Bouw en renovatie";
  if (/rijschool|rijles|cbr/.test(text)) return "Rijschool";
  if (/installatie|elektra|loodgieter|warmtepomp/.test(text)) return "Installatie en techniek";
  if (/hovenier|tuin/.test(text)) return "Tuin en buitenruimte";
  if (/schoonmaak|reiniging/.test(text)) return "Schoonmaak en facility";
  if (/kapper|salon|beauty|wellness/.test(text)) return "Beauty en verzorging";
  if (/restaurant|horeca|hotel/.test(text)) return "Horeca en hospitality";
  return "Lokale specialist";
}

function firstColor(value = "") {
  return cleanText(value).split(/,|\n|;/).map(cleanText).find(Boolean);
}

function secondColor(value = "") {
  return cleanText(value).split(/,|\n|;/).map(cleanText).filter(Boolean)[1] || "";
}

function normalizeToken(value = "") {
  return cleanText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value = "") {
  return normalizeToken(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pagina";
}

function pageGoal(title = "") {
  const key = normalizeToken(title);
  if (key.includes("contact")) return "Contactaanvragen verzamelen";
  if (key.includes("faq")) return "Bezwaren wegnemen";
  if (key.includes("review")) return "Vertrouwen opbouwen";
  if (key.includes("privacy") || key.includes("voorwaarden")) return "Juridische informatie tonen";
  return "Bezoekers informeren en naar de volgende stap leiden";
}

function metaDescriptionFor(title, factoryInput, analysis) {
  const business = factoryInput.businessName || "het bedrijf";
  const service = analysis.keyServices[0] || analysis.industry || "diensten";
  return `${title} van ${business}: ontdek ${service} met duidelijke informatie en een laagdrempelige route naar contact.`.slice(0, 156);
}

function mediaForPage(title, isService) {
  if (title === "Home") return ["hero", "diensten", "reviews"];
  if (title === "Over ons") return ["team", "locatie"];
  if (isService) return ["dienstbeeld", "projectfoto"];
  if (title === "Reviews") return ["reviewfoto", "logo"];
  return ["optioneel beeld"];
}

module.exports = {
  handler,
  createBuildJob,
  getBuildHistory,
  runBuildJob,
  sanitizeBuildResult,
  startOnboardingFactoryPipeline,
  _private: { searchRows },
};
