const { verifyAdmin } = require("./_admin-auth");
const { upsertProjectWorkspace, zipFilenameFor } = require("./_project-workspace");
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
    const context = { supabaseUrl, serviceRoleKey, admin: adminCheck.admin };
    if (action === "create_build_job") return createBuildJobResponse(context, payload);
    if (action === "run_build_job") return runBuildJobResponse(context, payload);
    if (action === "get_build_status") return getBuildStatusResponse(context, payload);
    if (action === "get_build_history") return getBuildHistoryResponse(context, payload);
    if (action === "generate_website_package") return generatePackageResponse(context, payload);
    if (action === "run_quality_check") return qualityCheckResponse(context, payload);
    if (action === "create_preview_version") return createPreviewVersionResponse(context, payload);
    if (action === "update_demo_journey_preview") return updateJourneyPreviewResponse(context, payload);
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

async function createBuildJobResponse(context, payload) {
  const { job } = await createBuildJob(context, payload);
  return jsonResponse(200, { success: true, job });
}

async function runBuildJobResponse(context, payload) {
  const result = await runBuildJob(context, payload);
  return jsonResponse(200, { success: true, ...result });
}

async function getBuildStatusResponse(context, payload) {
  const id = cleanText(payload.id || payload.jobId || payload.job_id);
  if (!id) return jsonResponse(400, { success: false, error: "Build job id ontbreekt." });
  const row = await readBuildJobById(context, id);
  if (!row) return jsonResponse(404, { success: false, error: "Build job niet gevonden." });
  return jsonResponse(200, { success: true, job: normalizeBuildJob(row) });
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
  const generatedPackage = buildWebsitePackage({
    journey: { ...mappedJourney, packageType },
    briefing: payload.briefing || journey.generated_briefing,
    version: Number(payload.version || 1),
  });
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
  const history = await getBuildHistory(context, { demoJourneyId });
  const previewVersion = nextPreviewVersion(history.previewVersions, history.jobs);
  const now = new Date().toISOString();
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_build_jobs`, {
    method: "POST",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify({
      demo_journey_id: demoJourneyId,
      lead_id: journey.lead_id || null,
      customer_id: journey.customer_id || null,
      status: "queued",
      current_step: "queued",
      progress: 5,
      preview_version: previewVersion,
      build_logs: buildLogs({ step: "queued", message: `Preview V${previewVersion} build job aangemaakt.`, at: now }),
      created_by: context.admin.id,
      started_at: now,
    }),
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
    phase = "validate_journey";
    if (!journey?.id) {
      const error = new Error("Demo-klantreis voor build job ontbreekt.");
      error.status = 404;
      throw error;
    }
    assertCanSeeJourney({ id: journey.id, created_by: journey.createdBy, assigned_to: journey.assignedTo, updated_by: journey.updatedBy }, context.admin);
    const logs = buildLogs(job.buildLogs, { step: "briefing", message: "Briefing gevalideerd." });
    phase = "patch_build_job_briefing";
    await patchBuildJob(context, job.id, { status: "briefing", current_step: "briefing", progress: 20, build_logs: logs });

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
    phase = "patch_build_job_building";
    await patchBuildJob(context, job.id, { status: "building", current_step: "generate_website_package", progress: 45, build_logs: buildingLogs });
    phase = "generate_website_package";
    const generatedPackage = buildWebsitePackage({ journey: { ...journey, packageType }, briefing, version: job.previewVersion });

    const qualityLogs = buildLogs(buildingLogs, { step: "quality_check", message: "Quality checker gestart." });
    phase = "patch_build_job_quality_check";
    await patchBuildJob(context, job.id, { status: "quality_check", current_step: "run_quality_check", progress: 70, generated_package: generatedPackage, build_logs: qualityLogs });
    phase = "run_quality_check";
    const qualityReport = runQualityCheck({ generatedPackage, journey });
    if (!qualityReport.passed) {
      const failed = await patchBuildJob(context, job.id, {
        status: "quality_failed",
        current_step: "quality_check",
        progress: 85,
        preview_score: qualityReport.score,
        quality_report: qualityReport,
        generated_package: generatedPackage,
        error_message: qualityReport.summary,
        finished_at: new Date().toISOString(),
        build_logs: buildLogs(qualityLogs, { step: "quality_failed", message: qualityReport.summary }),
      });
      return { job: normalizeBuildJob(failed[0] || {}), journey, previewVersion: null };
    }

    const token = makePreviewToken();
    const previewUrl = previewUrlFor({ journeyId: journey.id, token });
    phase = "patch_build_job_deploying";
    await patchBuildJob(context, job.id, {
      status: "deploying",
      current_step: "create_preview_version",
      progress: 90,
      preview_url: previewUrl,
      preview_token: token,
      preview_score: qualityReport.score,
      quality_report: qualityReport,
      generated_package: generatedPackage,
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
      createdBy: context.admin.id,
    });
    phase = "patch_build_job_completed";
    const completedRows = await patchBuildJob(context, job.id, {
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
    });
    phase = "update_demo_journey_preview";
    const updatedJourney = await updateDemoJourneyPreview(context, {
      demoJourneyId: journey.id,
      generatedBriefing: briefing,
      previewUrl,
      previewToken: token,
      generatedPackage,
      packageType: generatedPackage.packageType,
      status: "interne_preview_klaar",
    });
    const latestZipFilename = zipFilenameFor({
      businessName: updatedJourney.businessName || journey.businessName,
      websiteUrl: updatedJourney.websiteUrl || journey.websiteUrl,
      version: job.previewVersion,
    });
    phase = "upsert_project_workspace";
    await upsertProjectWorkspace(context, {
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
    });
    phase = "create_preview_event";
    await createJourneyEvent(context, {
      demoJourneyId: journey.id,
      type: "preview",
      title: "Preview klaar",
      description: `Interne preview V${job.previewVersion} staat klaar voor controle.`,
      visible: false,
    });
    return { job: normalizeBuildJob(completedRows[0] || {}), journey: updatedJourney, previewVersion };
  } catch (error) {
    error.module = "website_factory";
    error.reason = isMissingFactoryTableError(error) ? "missing_website_factory_tables" : "website_factory_build_failed";
    error.phase = error.phase || phase;
    error.demoJourneyId = error.demoJourneyId || journey?.id || cleanText(payload.demoJourneyId || payload.demo_journey_id);
    error.leadId = error.leadId || journey?.leadId || cleanText(payload.leadId || payload.lead_id);
    error.packageType = error.packageType || normalizePackageType(payload.packageType || payload.package_type || journey?.packageType);
    throw error;
  }
}

async function failBuild(context, job, message, logs = []) {
  const rows = await patchBuildJob(context, job.id, {
    status: "failed",
    current_step: "failed",
    progress: Math.max(Number(job.progress || 0), 20),
    error_message: message,
    finished_at: new Date().toISOString(),
    build_logs: buildLogs(logs, { step: "failed", message }),
  });
  return { job: normalizeBuildJob(rows[0] || {}), journey: null, previewVersion: null };
}

async function getBuildHistory(context, { demoJourneyId = "", leadId = "" } = {}) {
  const query = new URLSearchParams({ select: "*", order: "created_at.desc", limit: "25" });
  if (demoJourneyId) query.set("demo_journey_id", `eq.${demoJourneyId}`);
  if (leadId) query.set("lead_id", `eq.${leadId}`);
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_build_jobs?${query.toString()}`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  const jobs = rows.map(normalizeBuildJob);
  const versions = demoJourneyId ? await readPreviewVersions(context, demoJourneyId) : [];
  return { jobs, previewVersions: versions, latestJob: jobs[0] || null, activeVersion: versions.find((version) => version.isActive) || versions[0] || null };
}

async function createPreviewVersion(context, payload = {}) {
  const demoJourneyId = cleanText(payload.demoJourneyId || payload.demo_journey_id);
  if (!demoJourneyId) {
    const error = new Error("Demo journey id ontbreekt voor previewversie.");
    error.status = 400;
    throw error;
  }
  await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_preview_versions?demo_journey_id=eq.${encodeURIComponent(demoJourneyId)}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: false }),
  });
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_preview_versions`, {
    method: "POST",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify({
      demo_journey_id: demoJourneyId,
      build_job_id: cleanText(payload.buildJobId || payload.build_job_id) || null,
      version: Number(payload.version || 1),
      preview_url: cleanText(payload.previewUrl || payload.preview_url),
      preview_token: cleanText(payload.previewToken || payload.preview_token),
      preview_score: Number(payload.previewScore || payload.preview_score || 0),
      quality_report: payload.qualityReport || payload.quality_report || {},
      generated_package: payload.generatedPackage || payload.generated_package || {},
      is_active: true,
      created_by: cleanText(payload.createdBy || payload.created_by || context.admin.id),
    }),
  });
  return normalizePreviewVersion(rows[0] || {});
}

async function updateDemoJourneyPreview(context, payload = {}) {
  const demoJourneyId = cleanText(payload.demoJourneyId || payload.demo_journey_id);
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/demo_journeys?id=eq.${encodeURIComponent(demoJourneyId)}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify({
      generated_briefing: cleanText(payload.generatedBriefing || payload.generated_briefing),
      preview_url: cleanText(payload.previewUrl || payload.preview_url),
      preview_token: cleanText(payload.previewToken || payload.preview_token),
      preview_package: payload.generatedPackage || payload.generated_package || {},
      preview_generated_at: new Date().toISOString(),
      demo_status: cleanText(payload.status || "interne_preview_klaar"),
      updated_by: context.admin.id,
      updated_at: new Date().toISOString(),
    }),
  });
  return mapJourney(rows[0] || {});
}

async function readJourney(context, id) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/demo_journeys?select=*&id=eq.${encodeURIComponent(cleanText(id))}&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] || null;
}

async function readBuildJobById(context, id) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_build_jobs?select=*&id=eq.${encodeURIComponent(cleanText(id))}&limit=1`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows[0] || null;
}

async function readPreviewVersions(context, demoJourneyId) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_preview_versions?select=*&demo_journey_id=eq.${encodeURIComponent(demoJourneyId)}&order=version.desc`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return rows.map(normalizePreviewVersion);
}

async function patchBuildJob(context, id, record) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_build_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  return rows;
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
  const response = await fetch(url, options);
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
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

function errorResponse({ error = {}, developerMode = false, module = "", reason = "", fallbackMessage = "", setupRequired = false } = {}) {
  const message = error.message || fallbackMessage || "Aanvraag kon niet worden verwerkt.";
  const body = {
    success: false,
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

function isMissingFactoryTableError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.status === 404
    || text.includes("42p01")
    || text.includes("pgrst205")
    || text.includes("schema cache")
    || text.includes("website_build_jobs")
    || text.includes("website_preview_versions");
}

module.exports = {
  handler,
  createBuildJob,
  getBuildHistory,
  runBuildJob,
};
