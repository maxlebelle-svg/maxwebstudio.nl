const { verifyAdmin } = require("./_admin-auth");
const { upsertProjectWorkspace, zipFilenameFor } = require("./_project-workspace");
const { createTimelineEvent } = require("./services/timelineService");
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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

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
    if (action === "start_onboarding_pipeline") return startOnboardingPipelineResponse(context, payload);
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
      await factoryNotification(records, "Preview gereed", "De preview staat klaar voor controle.", "success", { runId, previewUrl: pipeline.previewUrl });
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
  const history = await getBuildHistory(context, { demoJourneyId });
  const previewVersion = nextPreviewVersion(history.previewVersions, history.jobs);
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
    const generatedPackage = buildWebsitePackage({
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
  if (leadId && cleanUuid(leadId)) query.set("lead_id", `eq.${cleanUuid(leadId)}`);
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
  try {
    await supabaseFetch(`${context.supabaseUrl}/rest/v1/website_preview_versions?demo_journey_id=eq.${encodeURIComponent(demoJourneyId)}`, {
      method: "PATCH",
      headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
  }
  const rows = await insertPreviewVersion(context, {
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
  });
  return normalizePreviewVersion(rows[0] || {});
}

async function updateDemoJourneyPreview(context, payload = {}) {
  const demoJourneyId = cleanText(payload.demoJourneyId || payload.demo_journey_id);
  const record = {
    generated_briefing: cleanText(payload.generatedBriefing || payload.generated_briefing),
    preview_url: cleanText(payload.previewUrl || payload.preview_url),
    preview_token: cleanText(payload.previewToken || payload.preview_token),
    preview_package: payload.generatedPackage || payload.generated_package || {},
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
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
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
    headers: { ...restHeaders(context.serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
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
  return {
    status: "prepared",
    logoStatus: logo ? "available" : "missing",
    logoTask: logo ? "" : "Voorbereiden in bestaande Logo Studio",
    primaryColor: analysis.primaryColor,
    secondaryColor: "#f6f8fb",
    accentColor: analysis.accentColor,
    backgroundColor: "#ffffff",
    cardStyle: "strak, lichte schaduw, compacte radius",
    buttonStyle: "hoog contrast, duidelijke CTA",
    typographyDirection: analysis.fontDirection,
    spacingDirection: "ruim maar scanbaar",
    iconStyle: "lijniconen, subtiel en functioneel",
    visualMood: analysis.brandStyle,
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
  startOnboardingFactoryPipeline,
};
