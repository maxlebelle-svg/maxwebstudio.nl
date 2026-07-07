const { verifyAdmin } = require("./_admin-auth");
const { sendEmail } = require("./email");
const { readProjectWorkspace, upsertProjectWorkspace, zipFilenameFor } = require("./_project-workspace");
const { getBuildHistory, runBuildJob } = require("./website-factory");

const staffRoles = ["super_admin", "admin", "sales_manager", "sales_partner"];
const managerRoles = new Set(["super_admin", "admin", "sales_manager"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const demoStatuses = [
  "geen_demo",
  "aanvraag_ontvangen",
  "briefing_klaar",
  "intern_in_productie",
  "interne_preview_klaar",
  "preview_ingepland_voor_klant",
  "preview_verstuurd",
  "feedback_ontvangen",
  "aanpassingen_bezig",
  "definitieve_versie_klaar",
  "belafspraak_gepland",
  "verkocht",
  "afgewezen",
];
const customerVisibleStatuses = new Set([
  "aanvraag_ontvangen",
  "briefing_klaar",
  "intern_in_productie",
  "interne_preview_klaar",
  "preview_ingepland_voor_klant",
  "preview_verstuurd",
  "feedback_ontvangen",
  "aanpassingen_bezig",
  "definitieve_versie_klaar",
  "belafspraak_gepland",
  "verkocht",
]);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});

  const isClientRequest = event.queryStringParameters?.scope === "customer";
  if (isClientRequest && event.httpMethod === "GET") return readCustomerJourney(event);
  if (isClientRequest && event.httpMethod === "POST") return saveCustomerFeedback(event);

  const adminCheck = await verifyAdmin(event, jsonResponse, {
    module: "demo_journey",
    action: event.httpMethod.toLowerCase(),
    allowedRoles: staffRoles,
    allowedStatuses: ["active", "invited"],
  });
  if (!adminCheck.success) return adminCheck.response;

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { success: false, error: "Demo klantreis API is nog niet geconfigureerd." });
  }

  try {
    if (event.httpMethod === "GET") return readAdminJourney({ event, supabaseUrl, serviceRoleKey, admin: adminCheck.admin });
    if (event.httpMethod === "POST") return upsertJourney({ event, supabaseUrl, serviceRoleKey, admin: adminCheck.admin });
    if (event.httpMethod === "PATCH") return upsertJourney({ event, supabaseUrl, serviceRoleKey, admin: adminCheck.admin });
    return jsonResponse(405, { success: false, error: "Methode niet toegestaan voor demo klantreis." });
  } catch (error) {
    const missing = isMissingTableError(error);
    const missingFactory = isMissingFactoryTableError(error);
    const developerMode = isDeveloperRequest(event);
    console.error("Demo journey API failed", {
      module: error.module || "demo_journey",
      reason: error.reason || "",
      phase: error.phase || "",
      action: error.action || "",
      demoJourneyId: error.demoJourneyId || "",
      leadId: error.leadId || "",
      packageType: error.packageType || "",
      method: event.httpMethod,
      path: event.path || "",
      query: event.queryStringParameters || {},
      role: adminCheck.admin?.role || "",
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
    const responseModule = error.module || "demo_journey";
    const responseReason = error.reason || (missing ? "missing_demo_journeys_table" : missingFactory ? "missing_website_factory_tables" : "demo_journey_api_failed");
    return jsonResponse(missing || missingFactory ? 503 : error.status || 500, errorResponse({
      error,
      developerMode,
      module: responseModule,
      reason: responseReason,
      fallbackMessage: missing
        ? "Demo klantreis tabellen ontbreken nog. Rol migration 018_demo_journey_workflow uit op de actieve Supabase database."
        : missingFactory
          ? "Website Factory tabellen ontbreken nog. Rol migration 019_ai_website_factory_v1 uit op de actieve Supabase database."
          : responseModule === "website_factory"
            ? "Website Factory kon de preview niet bouwen."
            : "Demo klantreis kon niet worden verwerkt.",
      setupRequired: missing || missingFactory,
    }));
  }
};

async function readCustomerJourney(event) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !bearer) {
    return jsonResponse(401, { success: false, error: "Log in om uw projecttijdlijn te bekijken." });
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
  });
  const user = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !user?.id) return jsonResponse(401, { success: false, error: "Sessie kon niet worden gecontroleerd." });

  const customerRows = await supabaseFetch(`${supabaseUrl}/rest/v1/customers?select=id,auth_user_id,email&auth_user_id=eq.${encodeURIComponent(user.id)}&limit=10`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const customerIds = customerRows.map((customer) => cleanText(customer.id)).filter(Boolean);
  if (!customerIds.length) return jsonResponse(200, { success: true, journey: null, events: [] });

  const params = new URLSearchParams({
    select: "*",
    customer_id: `in.(${customerIds.join(",")})`,
    order: "updated_at.desc.nullslast",
    limit: "1",
  });
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const journey = rows[0] ? sanitizeCustomerJourney(mapJourney(rows[0])) : null;
  const events = journey?.id ? await readEvents({ supabaseUrl, serviceRoleKey, journeyId: journey.id, customerOnly: true }) : [];
  return jsonResponse(200, { success: true, journey, events });
}

async function saveCustomerFeedback(event) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !bearer) {
    return jsonResponse(401, { success: false, error: "Log in om feedback door te geven." });
  }

  const payload = parsePayload(event.body);
  const feedback = cleanText(payload.feedback);
  if (!feedback) return jsonResponse(400, { success: false, error: "Vul uw feedback in." });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` },
  });
  const user = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !user?.id) return jsonResponse(401, { success: false, error: "Sessie kon niet worden gecontroleerd." });

  const customerRows = await supabaseFetch(`${supabaseUrl}/rest/v1/customers?select=id,auth_user_id,email&auth_user_id=eq.${encodeURIComponent(user.id)}&limit=10`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const customerIds = customerRows.map((customer) => cleanText(customer.id)).filter(Boolean);
  if (!customerIds.length) return jsonResponse(404, { success: false, error: "Klantprofiel niet gevonden." });

  const journeyId = cleanText(payload.id);
  const params = new URLSearchParams({
    select: "*",
    customer_id: `in.(${customerIds.join(",")})`,
    order: "updated_at.desc.nullslast",
    limit: "1",
  });
  if (journeyId) params.set("id", `eq.${journeyId}`);
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const current = rows[0];
  if (!current?.id) return jsonResponse(404, { success: false, error: "Demo-preview niet gevonden." });
  const feedbackAllowedStatuses = new Set(["preview_verstuurd", "feedback_ontvangen", "aanpassingen_bezig", "definitieve_versie_klaar"]);
  if (!feedbackAllowedStatuses.has(normalizeStatus(current.demo_status))) {
    return jsonResponse(400, { success: false, error: "Feedback kan worden verstuurd zodra de preview beschikbaar is." });
  }

  const updatedRows = await patchJourney({
    supabaseUrl,
    serviceRoleKey,
    id: current.id,
    record: {
      feedback,
      demo_status: "feedback_ontvangen",
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
  });
  await createEvent({ supabaseUrl, serviceRoleKey, journeyId: current.id, type: "customer_feedback", title: "Feedback verwerken", description: "Uw opmerkingen zijn ontvangen.", visible: true, createdBy: user.id });
  return jsonResponse(200, {
    success: true,
    journey: sanitizeCustomerJourney(mapJourney(updatedRows[0] || current)),
    events: await readEvents({ supabaseUrl, serviceRoleKey, journeyId: current.id, customerOnly: true }),
  });
}

async function readAdminJourney({ event, supabaseUrl, serviceRoleKey, admin }) {
  const params = event.queryStringParameters || {};
  const leadId = cleanUuid(params.leadId || params.lead_id);
  const id = cleanText(params.id);
  const customerId = cleanUuid(params.customerId || params.customer_id);
  const query = new URLSearchParams({ select: "*", order: "updated_at.desc.nullslast", limit: "25" });
  if (id) query.set("id", `eq.${id}`);
  if (leadId) query.set("lead_id", `eq.${leadId}`);
  if (customerId) query.set("customer_id", `eq.${customerId}`);
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?${query.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const journeys = rows.map(mapJourney).filter((journey) => canAdminSeeJourney(journey, admin));
  const selected = journeys[0] || null;
  const events = selected ? await readEvents({ supabaseUrl, serviceRoleKey, journeyId: selected.id }) : [];
  const factoryHistory = selected ? await readFactoryHistorySafe({ supabaseUrl, serviceRoleKey, admin, journeyId: selected.id }) : { jobs: [], previewVersions: [], latestJob: null, activeVersion: null };
  const projectWorkspace = selected ? await readProjectWorkspace({ supabaseUrl, serviceRoleKey, admin }, { demoJourneyId: selected.id }) : null;
  return jsonResponse(200, { success: true, journey: selected, demoJourney: selected, records: journeys, events, templates: emailTemplates(), buildHistory: factoryHistory, buildStatus: factoryHistory.latestJob || null, projectWorkspace });
}

async function upsertJourney({ event, supabaseUrl, serviceRoleKey, admin }) {
  const payload = parsePayload(event.body);
  const action = cleanText(payload.action);
  const current = await resolveExistingJourney({ supabaseUrl, serviceRoleKey, payload });
  if (current && !canAdminMutateJourney(mapJourney(current), admin)) {
    const error = new Error("Je mag deze demo-klantreis niet wijzigen.");
    error.status = 403;
    throw error;
  }

  if (action === "approve_preview" || action === "approve_delivery") {
    if (normalizeRole(admin.role) !== "super_admin") {
      return jsonResponse(403, { success: false, error: "Alleen Super Admin kan preview of oplevering goedkeuren." });
    }
    if (!current?.id) return jsonResponse(400, { success: false, error: "Sla eerst de demo-klantreis op voordat je goedkeurt." });
    const approvedAt = new Date().toISOString();
    const previewPackage = current.preview_package && typeof current.preview_package === "object" ? current.preview_package : {};
    const approvals = {
      ...(previewPackage.approvals || {}),
      approvalStatus: action === "approve_delivery" ? "delivery_approved" : "preview_approved",
    };
    if (action === "approve_preview") {
      approvals.previewApprovedBy = admin.id;
      approvals.previewApprovedAt = approvedAt;
    } else {
      approvals.deliveryApprovedBy = admin.id;
      approvals.deliveryApprovedAt = approvedAt;
    }
    const record = action === "approve_preview"
      ? {
        approval_status: "preview_approved",
        preview_approved_by: admin.id,
        preview_approved_at: approvedAt,
        preview_package: { ...previewPackage, approvals },
        updated_by: admin.id,
        updated_at: approvedAt,
      }
      : {
        approval_status: "delivery_approved",
        delivery_approved_by: admin.id,
        delivery_approved_at: approvedAt,
        preview_package: { ...previewPackage, approvals },
        updated_by: admin.id,
        updated_at: approvedAt,
      };
    const rows = await patchJourneySafe({ supabaseUrl, serviceRoleKey, id: current.id, record });
    await createEvent({ supabaseUrl, serviceRoleKey, journeyId: current.id, type: "approval", title: action === "approve_preview" ? "Preview goedgekeurd" : "Oplevering goedgekeurd", description: "Super Admin heeft deze stap vrijgegeven.", visible: false, createdBy: admin.id });
    const journey = mapJourney(rows[0] || await readJourneyById({ supabaseUrl, serviceRoleKey, id: current.id }));
    const events = await readEvents({ supabaseUrl, serviceRoleKey, journeyId: current.id });
    return jsonResponse(200, { success: true, journey, demoJourney: journey, events });
  }

  if (action === "generate_email") {
    const template = buildEmailTemplate(payload.emailType || payload.demoStatus || current?.demo_status, current ? mapJourney(current) : payload);
    return jsonResponse(200, { success: true, template });
  }

  if (action === "send_email") {
    const template = buildEmailTemplate(payload.emailType || payload.demoStatus || current?.demo_status, current ? mapJourney(current) : payload);
    const approvalError = emailApprovalError(template.type, current ? mapJourney(current) : payload);
    if (approvalError) return jsonResponse(403, { success: false, error: approvalError, template });
    if (!template.to) return jsonResponse(400, { success: false, error: "E-mailadres ontbreekt voor deze demo-klantreis." });
    const result = await sendEmail({
      to: template.to,
      subject: template.subject,
      text: template.body,
      html: textToHtml(template.body),
    });
    if (current?.id) {
      await patchJourneySafe({ supabaseUrl, serviceRoleKey, id: current.id, record: {
        last_email_status: result.sent ? `sent:${template.type}` : result.warning || "email_not_sent",
        last_email_sent_at: result.sent ? new Date().toISOString() : null,
        next_email_type: nextEmailType(template.type),
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      } });
      await createEvent({ supabaseUrl, serviceRoleKey, journeyId: current.id, type: "email", title: result.sent ? "Mail verstuurd" : "Mail niet verstuurd", description: template.subject, visible: false, createdBy: admin.id });
    }
    return jsonResponse(result.sent ? 200 : 503, { success: result.sent, sent: result.sent, warning: result.warning || "", template });
  }

  if (action === "generate_preview") {
    const packageType = normalizePackageType(payload.packageType || payload.package_type || current?.preview_package?.meta?.packageType || current?.preview_package?.packageType);
    const sourceJourney = current ? mapJourney(current) : mapJourney({
      id: payload.id,
      lead_id: cleanUuid(payload.leadId || payload.lead_id),
      customer_id: cleanUuid(payload.customerId || payload.customer_id),
      business_name: payload.businessName,
      contact_name: payload.contactName,
      email: payload.email,
      phone: payload.phone,
      website_url: payload.websiteUrl,
      demo_status: payload.demoStatus,
      generated_briefing: payload.generatedBriefing,
      preview_url: payload.previewUrl,
      feedback: payload.feedback,
      internal_notes: payload.internalNotes,
      follow_up_at: payload.followUpAt,
      assigned_to: payload.assignedTo,
      created_by: admin.id,
      updated_by: admin.id,
    });
    const briefing = cleanText(payload.generatedBriefing || sourceJourney.generatedBriefing);
    if (!briefing) return jsonResponse(400, { success: false, error: "Maak of vul eerst een websiteplan in." });

    let journeyId = cleanText(sourceJourney.id);
    if (!journeyId) {
      return jsonResponse(400, {
        success: false,
        error: "Sla eerst de demo-aanvraag op.",
        userMessage: "Sla eerst de demo-aanvraag op.",
        diagnostics: {
          action,
          packageType,
          leadId: cleanUuid(payload.leadId || payload.lead_id),
          demoJourneyId: "",
          reason: "preview_requires_existing_demo_journey",
        },
      });
    }
    await patchJourneySafe({
      supabaseUrl,
      serviceRoleKey,
      id: journeyId,
      record: journeyPayload({ ...payload, id: journeyId, demoStatus: sourceJourney.demoStatus || "briefing_klaar", generatedBriefing: briefing }, admin, { create: false }),
    });
    if (!journeyId) return jsonResponse(500, { success: false, error: "Demo-klantreis kon niet worden voorbereid voor preview." });

    let buildResult;
    try {
      buildResult = await runBuildJob({ supabaseUrl, serviceRoleKey, admin }, {
        demoJourneyId: journeyId,
        generatedBriefing: briefing,
        packageType,
        websiteAnalysis: payload.websiteAnalysis || payload.website_analysis || null,
      });
    } catch (error) {
      error.module = "website_factory";
      error.reason = isMissingFactoryTableError(error) ? "missing_website_factory_tables" : "website_factory_build_failed";
      error.phase = error.phase || "run_build_job";
      error.action = action;
      error.demoJourneyId = journeyId;
      error.leadId = cleanUuid(payload.leadId || payload.lead_id || sourceJourney.leadId);
      error.packageType = packageType;
      throw error;
    }
    const journey = buildResult.journey || mapJourney(await readJourneyById({ supabaseUrl, serviceRoleKey, id: journeyId }));
    const previewVersionNumber = buildResult.previewVersion?.version || buildResult.job?.previewVersion || 1;
    const latestZipFilename = zipFilenameFor({ businessName: journey.businessName, websiteUrl: journey.websiteUrl, version: previewVersionNumber });
    const projectWorkspace = await upsertProjectWorkspace({ supabaseUrl, serviceRoleKey, admin }, workspacePayload(journey, {
      latestPreviewUrl: buildResult.job?.previewUrl || journey.previewUrl,
      latestPreviewVersion: previewVersionNumber,
      latestZipFilename,
      updatedBy: admin.id,
    }));
    const events = await readEvents({ supabaseUrl, serviceRoleKey, journeyId });
    const buildHistory = await readFactoryHistorySafe({ supabaseUrl, serviceRoleKey, admin, journeyId });
    return jsonResponse(200, {
      success: true,
      journey,
      demoJourney: journey,
      events,
      buildJob: buildResult.job,
      buildStatus: buildResult.job || null,
      previewVersion: buildResult.previewVersion,
      buildHistory,
      projectWorkspace,
      preview: {
        url: buildResult.job?.previewUrl || journey.previewUrl,
        zipUrl: buildResult.job?.previewUrl ? appendQueryParam(buildResult.job.previewUrl, "format", "zip") : "",
        files: Object.values(buildResult.job?.generatedPackage?.files || []).map((file) => ({ path: file.path, bytes: Buffer.byteLength(file.content || "", "utf8") })),
        package: buildResult.job?.generatedPackage?.meta || null,
      },
      packageUpgrade: {
        previousPackage: normalizePackageType(payload.previousPackage || payload.previous_package || sourceJourney.previewPackage?.meta?.packageType || ""),
        newPackage: packageType,
        demoJourneyId: journeyId,
      },
    });
  }

  const targetId = cleanText(current?.id || payload.id || payload.demoJourneyId || payload.demo_journey_id);
  const record = journeyPayload(payload, admin, { create: !targetId });
  const rows = targetId
    ? await patchJourneySafe({ supabaseUrl, serviceRoleKey, id: targetId, record })
    : await insertJourneySafe({ supabaseUrl, serviceRoleKey, record });
  const journey = mapJourney(rows[0] || {});
  const projectWorkspace = await upsertProjectWorkspace({ supabaseUrl, serviceRoleKey, admin }, workspacePayload(journey, { updatedBy: admin.id, createdBy: admin.id }));
  await createStatusEvents({ supabaseUrl, serviceRoleKey, journey, current: current ? mapJourney(current) : null, admin });
  const events = await readEvents({ supabaseUrl, serviceRoleKey, journeyId: journey.id });
  const buildHistory = journey?.id ? await readFactoryHistorySafe({ supabaseUrl, serviceRoleKey, admin, journeyId: journey.id }) : { latestJob: null };
  return jsonResponse(200, { success: true, journey, demoJourney: journey, reusedExisting: Boolean(targetId && !payload.id), events, template: buildEmailTemplate(journey.demoStatus, journey), buildHistory, buildStatus: buildHistory.latestJob || null, projectWorkspace });
}

function workspacePayload(journey = {}, extra = {}) {
  return {
    leadId: journey.leadId,
    customerId: journey.customerId,
    demoJourneyId: journey.id,
    businessName: journey.businessName,
    websiteUrl: journey.websiteUrl,
    latestPreviewUrl: journey.previewUrl,
    latestPreviewVersion: journey.previewPackage?.version || journey.previewPackage?.meta?.version || null,
    ...extra,
  };
}

function journeyPayload(payload = {}, admin = {}, options = {}) {
  const now = new Date().toISOString();
  const status = normalizeStatus(payload.demoStatus || payload.demo_status || "aanvraag_ontvangen");
  if (!demoStatuses.includes(status)) {
    const error = new Error("Ongeldige demo status.");
    error.status = 400;
    throw error;
  }
  const record = {
    lead_id: cleanUuid(payload.leadId || payload.lead_id) || null,
    customer_id: cleanUuid(payload.customerId || payload.customer_id) || null,
    business_name: cleanText(payload.businessName || payload.business_name || payload.companyName || payload.company),
    contact_name: cleanText(payload.contactName || payload.contact_name || payload.name),
    email: cleanText(payload.email).toLowerCase(),
    phone: cleanText(payload.phone),
    website_url: cleanText(payload.websiteUrl || payload.website_url || payload.website),
    demo_status: status,
    generated_briefing: cleanText(payload.generatedBriefing || payload.generated_briefing),
    preview_url: cleanText(payload.previewUrl || payload.preview_url),
    feedback: cleanText(payload.feedback),
    internal_notes: cleanText(payload.internalNotes || payload.internal_notes || payload.notes),
    follow_up_at: cleanText(payload.followUpAt || payload.follow_up_at) || null,
    assigned_to: cleanText(payload.assignedTo || payload.assigned_to || admin.id) || null,
    email_flow_enabled: Boolean(payload.emailFlowEnabled || payload.email_flow_enabled),
    next_email_type: cleanText(payload.nextEmailType || payload.next_email_type) || nextEmailType(status),
    intake_json: normalizeJson(payload.intake || payload.intake_json),
    intake_summary: cleanText(payload.intakeSummary || payload.intake_summary),
    intake_completeness: clampNumber(payload.intakeCompleteness || payload.intake_completeness, 0, 100),
    asset_metadata: normalizeJson(payload.assetMetadata || payload.asset_metadata, []),
    updated_by: admin.id,
    updated_at: now,
  };
  const approvalStatus = cleanText(payload.approvalStatus || payload.approval_status);
  if (approvalStatus) record.approval_status = approvalStatus;
  if (options.create) {
    record.created_by = admin.id;
    record.created_at = now;
    if (!record.business_name && !record.contact_name && !record.email) {
      const error = new Error("Vul minimaal bedrijfsnaam, contactpersoon of e-mailadres in.");
      error.status = 400;
      throw error;
    }
  }
  Object.keys(record).forEach((key) => {
    if (record[key] === "" && !["email", "phone", "website_url", "preview_url", "feedback", "internal_notes", "generated_briefing"].includes(key)) delete record[key];
  });
  return record;
}

async function insertJourney({ supabaseUrl, serviceRoleKey, record }) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys`, {
    method: "POST",
    headers: { ...restHeaders(serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

async function insertJourneySafe({ supabaseUrl, serviceRoleKey, record }) {
  try {
    return await insertJourney({ supabaseUrl, serviceRoleKey, record });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    return insertJourney({ supabaseUrl, serviceRoleKey, record: stripDraftJourneyColumns(record) });
  }
}

async function patchJourney({ supabaseUrl, serviceRoleKey, id, record }) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...restHeaders(serviceRoleKey), Prefer: "return=representation", "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
}

async function patchJourneySafe({ supabaseUrl, serviceRoleKey, id, record }) {
  try {
    return await patchJourney({ supabaseUrl, serviceRoleKey, id, record });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    return patchJourney({ supabaseUrl, serviceRoleKey, id, record: stripDraftJourneyColumns(record) });
  }
}

function stripDraftJourneyColumns(record = {}) {
  const {
    intake_json,
    intake_summary,
    intake_completeness,
    asset_metadata,
    approval_status,
    preview_approved_by,
    preview_approved_at,
    delivery_approved_by,
    delivery_approved_at,
    ...fallback
  } = record;
  return fallback;
}

async function updatePreviewJourney({ supabaseUrl, serviceRoleKey, id, record }) {
  try {
    return await patchJourney({ supabaseUrl, serviceRoleKey, id, record });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const { preview_token, preview_package, preview_generated_at, ...fallbackRecord } = record;
    return patchJourney({ supabaseUrl, serviceRoleKey, id, record: fallbackRecord });
  }
}

async function resolveExistingJourney({ supabaseUrl, serviceRoleKey, payload = {} }) {
  const explicitId = cleanText(payload.id || payload.demoJourneyId || payload.demo_journey_id);
  if (explicitId) {
    const byId = await readJourneyById({ supabaseUrl, serviceRoleKey, id: explicitId });
    if (byId) return byId;
  }
  const leadId = cleanUuid(payload.leadId || payload.lead_id);
  if (!leadId) return null;
  return readJourneyByLeadId({ supabaseUrl, serviceRoleKey, leadId });
}

async function readJourneyById({ supabaseUrl, serviceRoleKey, id }) {
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return rows[0] || null;
}

async function readJourneyByLeadId({ supabaseUrl, serviceRoleKey, leadId }) {
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?select=*&lead_id=eq.${encodeURIComponent(leadId)}&order=updated_at.desc.nullslast&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return rows[0] || null;
}

async function readEvents({ supabaseUrl, serviceRoleKey, journeyId, customerOnly = false }) {
  const params = new URLSearchParams({
    select: "*",
    demo_journey_id: `eq.${journeyId}`,
    order: "created_at.asc",
  });
  if (customerOnly) params.set("visible_to_customer", "eq.true");
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journey_events?${params.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return rows.map(mapEvent);
}

async function readFactoryHistorySafe({ supabaseUrl, serviceRoleKey, admin, journeyId }) {
  try {
    return await getBuildHistory({ supabaseUrl, serviceRoleKey, admin }, { demoJourneyId: journeyId });
  } catch (error) {
    if (!isMissingFactoryTableError(error)) throw error;
    return {
      jobs: [],
      previewVersions: [],
      latestJob: null,
      activeVersion: null,
      setupRequired: true,
      warning: "Website Factory tabellen ontbreken nog. Rol migration 019_ai_website_factory_v1 uit.",
    };
  }
}

async function createStatusEvents({ supabaseUrl, serviceRoleKey, journey, current, admin }) {
  if (!journey.id) return;
  if (!current) {
    await createEvent({ supabaseUrl, serviceRoleKey, journeyId: journey.id, type: "created", title: "Demo-aanvraag ontvangen", description: "De demo-klantreis is aangemaakt.", visible: true, createdBy: admin.id });
    return;
  }
  if (current.demoStatus !== journey.demoStatus) {
    const customerTitle = customerTimelineStep(journey.demoStatus);
    await createEvent({ supabaseUrl, serviceRoleKey, journeyId: journey.id, type: "status", title: statusLabel(journey.demoStatus), description: "Status bijgewerkt in het salesportaal.", visible: false, createdBy: admin.id });
    if (customerTitle) {
      await createEvent({ supabaseUrl, serviceRoleKey, journeyId: journey.id, type: "customer_status", title: customerTitle, description: customerTimelineDescription(journey.demoStatus), visible: customerVisibleStatuses.has(journey.demoStatus), createdBy: admin.id });
    }
  }
}

async function createEvent({ supabaseUrl, serviceRoleKey, journeyId, type, title, description, visible, createdBy }) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/demo_journey_events`, {
    method: "POST",
    headers: { ...restHeaders(serviceRoleKey), Prefer: "return=minimal", "Content-Type": "application/json" },
    body: JSON.stringify({
      demo_journey_id: journeyId,
      event_type: cleanText(type),
      title: cleanText(title),
      description: cleanText(description),
      visible_to_customer: Boolean(visible),
      created_by: cleanText(createdBy) || null,
    }),
  });
}

function buildEmailTemplate(typeOrStatus = "", journey = {}) {
  const type = emailTypeFor(typeOrStatus);
  const name = cleanText(journey.contactName || journey.contact_name || "u");
  const business = cleanText(journey.businessName || journey.business_name || "uw bedrijf");
  const preview = cleanText(journey.previewUrl || journey.preview_url);
  const previewLink = preview || "[previewlink]";
  const templates = {
    day1_received: {
      subject: "Uw website-aanvraag is ontvangen",
      body: `Beste ${name},\n\nBedankt voor uw aanvraag voor ${business}. We hebben uw gegevens ontvangen en zetten de eerste wensen om naar een helder websiteplan.\n\nVandaag controleren we vooral de basis: doelgroep, aanbod, gewenste uitstraling en de belangrijkste route naar contact. U hoeft nu niets extra's te doen.\n\nVoorbeeld: als u vooral meer offerteaanvragen wilt ontvangen, zorgen we dat de preview daar zichtbaar op stuurt.\n\nMorgen ontvangt u een korte update zodra het concept in voorbereiding is.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    day2_concept: {
      subject: "Uw eerste websiteconcept wordt voorbereid",
      body: `Beste ${name},\n\nWe zijn bezig met het eerste concept voor ${business}. We werken de structuur uit en letten op een sterke eerste indruk, duidelijke diensten, vertrouwen en een eenvoudige route naar contact.\n\nU hoeft nog niets te beoordelen. Deze stap is bedoeld om intern een goede basis neer te zetten voordat u meekijkt.\n\nVoorbeeld: we bepalen alvast welke onderdelen bovenaan moeten staan, zoals diensten, recensies, werkgebied of een duidelijke belknop.\n\nZodra de preview klaarstaat, ontvangt u de link om rustig mee te kijken.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    day3_preview_ready: {
      subject: "Uw eerste website-preview staat klaar",
      body: `Beste ${name},\n\nUw eerste website-preview staat klaar. U kunt de preview hier bekijken:\n${previewLink}\n\nBekijk de preview gerust rustig en geef uw opmerkingen, wensen of correcties door. Het hoeft nog niet perfect te zijn; deze ronde is juist bedoeld om uw feedback goed mee te nemen.\n\nVoorbeeld: u kunt reageren met "de tekst bij diensten mag korter", "de foto's mogen persoonlijker" of "de contactknop mag duidelijker".\n\nNa uw reactie verwerken wij de feedback in de volgende versie.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    day4_feedback_refinement: {
      subject: "We verwerken uw feedback in de website",
      body: `Beste ${name},\n\nWe zijn bezig met het verwerken van de feedback voor ${business}. Daarbij controleren we de teksten, contactgegevens, uitstraling, knoppen en de logische volgorde van de pagina.\n\nAls u nog een laatste punt ziet, kunt u dat vandaag nog doorgeven. Dan nemen we het mee voordat we de oplevering afronden.\n\nVoorbeeld: denk aan openingstijden, telefoonnummer, werkgebied, een dienst die ontbreekt of een zin die net anders moet.\n\nDaarna maken we de website klaar voor de laatste controle.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
    day5_delivery_ready: {
      subject: "Uw website staat klaar voor de laatste controle",
      body: `Beste ${name},\n\nDe website voor ${business} staat klaar voor de laatste controle. U kunt de laatste versie hier bekijken:\n${previewLink}\n\nControleer vooral of de inhoud klopt en of bezoekers makkelijk contact kunnen opnemen. Als alles akkoord is, plannen we de vervolgstap richting oplevering of livegang.\n\nVoorbeeld: bevestig gerust met "akkoord voor livegang" of stuur nog een laatste punt zoals "pas het mobiele nummer nog aan".\n\nNa uw akkoord ronden wij de oplevering netjes af.\n\nMet vriendelijke groet,\nMax Webstudio`,
    },
  };
  return { type, to: cleanText(journey.email).toLowerCase(), ...templates[type] };
}

function emailTemplates() {
  return [
    ["day1_received", "Dag 1 - Aanvraag ontvangen"],
    ["day2_concept", "Dag 2 - Concept in voorbereiding"],
    ["day3_preview_ready", "Dag 3 - Preview klaar"],
    ["day4_feedback_refinement", "Dag 4 - Feedback en verfijning"],
    ["day5_delivery_ready", "Dag 5 - Oplevering klaar"],
  ].map(([type, label]) => ({ type, label }));
}

function emailTypeFor(value = "") {
  const key = normalizeStatus(value);
  if (["day0_received", "day1_received", "aanvraag_ontvangen", "geen_demo"].includes(key)) return "day1_received";
  if (["day1_planned", "day2_concept", "briefing_klaar", "intern_in_productie"].includes(key)) return "day2_concept";
  if (["preview_ready", "day3_preview_ready", "interne_preview_klaar", "preview_ingepland_voor_klant", "preview_verstuurd"].includes(key)) return "day3_preview_ready";
  if (["feedback_received", "day4_feedback_refinement", "feedback_ontvangen", "aanpassingen_bezig"].includes(key)) return "day4_feedback_refinement";
  if (["finalizing", "day5_delivery_ready", "definitieve_versie_klaar", "belafspraak_gepland", "verkocht"].includes(key)) return "day5_delivery_ready";
  return key && emailTemplates().some((item) => item.type === key) ? key : "day1_received";
}

function nextEmailType(type = "") {
  const order = ["day1_received", "day2_concept", "day3_preview_ready", "day4_feedback_refinement", "day5_delivery_ready"];
  const index = order.indexOf(emailTypeFor(type));
  return order[index + 1] || "";
}

function emailApprovalError(type = "", journey = {}) {
  const emailType = emailTypeFor(type);
  if (emailType === "day3_preview_ready" && !journey.previewApprovedAt && !journey.preview_approved_at) {
    return "Dag 3 previewmail vereist eerst Super Admin goedkeuring.";
  }
  if (emailType === "day5_delivery_ready" && !journey.deliveryApprovedAt && !journey.delivery_approved_at) {
    return "Dag 5 oplevermail vereist eerst Super Admin goedkeuring.";
  }
  return "";
}

function customerTimelineStep(status = "") {
  return ({
    aanvraag_ontvangen: "Aanvraag ontvangen",
    briefing_klaar: "Project ingepland",
    intern_in_productie: "Eerste ontwerp wordt voorbereid",
    interne_preview_klaar: "Eerste ontwerp wordt voorbereid",
    preview_ingepland_voor_klant: "Preview klaar",
    preview_verstuurd: "Preview klaar",
    feedback_ontvangen: "Feedback verwerken",
    aanpassingen_bezig: "Feedback verwerken",
    definitieve_versie_klaar: "Website afronden",
    belafspraak_gepland: "Livegang voorbereiden",
    verkocht: "Livegang voorbereiden",
  })[normalizeStatus(status)] || "";
}

function customerTimelineDescription(status = "") {
  return ({
    aanvraag_ontvangen: "We hebben uw wensen ontvangen en gaan aan de slag.",
    briefing_klaar: "De informatie is verwerkt en de planning staat klaar.",
    intern_in_productie: "Het projectteam bereidt de eerste versie voor.",
    interne_preview_klaar: "De eerste versie wordt gecontroleerd.",
    preview_ingepland_voor_klant: "De preview wordt klaargezet voor verzending.",
    preview_verstuurd: "U kunt de preview bekijken en feedback doorgeven.",
    feedback_ontvangen: "Uw opmerkingen zijn ontvangen.",
    aanpassingen_bezig: "We verwerken uw feedback zorgvuldig.",
    definitieve_versie_klaar: "De laatste onderdelen worden afgerond.",
    belafspraak_gepland: "We nemen de laatste stappen samen door.",
    verkocht: "We bereiden de vervolgstappen richting livegang voor.",
  })[normalizeStatus(status)] || "";
}

function sanitizeCustomerJourney(journey = {}) {
  const previewVisibleStatuses = new Set(["preview_verstuurd", "feedback_ontvangen", "aanpassingen_bezig", "definitieve_versie_klaar"]);
  return {
    id: journey.id,
    businessName: journey.businessName,
    contactName: journey.contactName,
    demoStatus: journey.demoStatus,
    previewUrl: previewVisibleStatuses.has(journey.demoStatus) ? journey.previewUrl : "",
    feedback: journey.feedback,
    followUpAt: journey.followUpAt,
    updatedAt: journey.updatedAt,
  };
}

function mapJourney(row = {}) {
  const previewPackage = row.preview_package && typeof row.preview_package === "object" ? row.preview_package : null;
  const approvals = previewPackage?.approvals || {};
  return {
    id: cleanText(row.id),
    leadId: cleanText(row.lead_id),
    customerId: cleanText(row.customer_id),
    businessName: cleanText(row.business_name),
    contactName: cleanText(row.contact_name),
    email: cleanText(row.email),
    phone: cleanText(row.phone),
    websiteUrl: cleanText(row.website_url),
    demoStatus: normalizeStatus(row.demo_status || "geen_demo"),
    generatedBriefing: cleanText(row.generated_briefing),
    previewUrl: cleanText(row.preview_url),
    previewPackage,
    previewGeneratedAt: cleanText(row.preview_generated_at),
    intake: normalizeJson(row.intake_json || previewPackage?.intake || {}, {}),
    intakeSummary: cleanText(row.intake_summary || previewPackage?.intakeSummary),
    intakeCompleteness: clampNumber(row.intake_completeness ?? previewPackage?.intakeCompleteness ?? 0, 0, 100),
    assetMetadata: normalizeJson(row.asset_metadata || previewPackage?.assetMetadata || [], []),
    approvalStatus: cleanText(row.approval_status || approvals.approvalStatus || "pending"),
    previewApprovedBy: cleanText(row.preview_approved_by || approvals.previewApprovedBy),
    previewApprovedAt: cleanText(row.preview_approved_at || approvals.previewApprovedAt),
    deliveryApprovedBy: cleanText(row.delivery_approved_by || approvals.deliveryApprovedBy),
    deliveryApprovedAt: cleanText(row.delivery_approved_at || approvals.deliveryApprovedAt),
    feedback: cleanText(row.feedback),
    internalNotes: cleanText(row.internal_notes),
    followUpAt: cleanText(row.follow_up_at),
    assignedTo: cleanText(row.assigned_to),
    emailFlowEnabled: Boolean(row.email_flow_enabled),
    lastEmailStatus: cleanText(row.last_email_status),
    lastEmailSentAt: cleanText(row.last_email_sent_at),
    nextEmailType: cleanText(row.next_email_type),
    createdBy: cleanText(row.created_by),
    updatedBy: cleanText(row.updated_by),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function mapEvent(row = {}) {
  return {
    id: cleanText(row.id),
    demoJourneyId: cleanText(row.demo_journey_id),
    eventType: cleanText(row.event_type),
    title: cleanText(row.title),
    description: cleanText(row.description),
    visibleToCustomer: Boolean(row.visible_to_customer),
    createdAt: cleanText(row.created_at),
    createdBy: cleanText(row.created_by),
  };
}

function canAdminSeeJourney(journey = {}, admin = {}) {
  if (managerRoles.has(normalizeRole(admin.role))) return true;
  return [journey.createdBy, journey.assignedTo, journey.updatedBy].map(cleanText).includes(cleanText(admin.id));
}

function canAdminMutateJourney(journey = {}, admin = {}) {
  return canAdminSeeJourney(journey, admin);
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

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };
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
  const isPreviewAction = cleanText(error.action) === "generate_preview" || module === "website_factory";
  const previewDetails = [
    error.phase ? `Fase: ${error.phase}` : "",
    reason ? `Reden: ${reason}` : "",
    error.code ? `Code: ${error.code}` : "",
  ].filter(Boolean).join(" · ");
  const previewUserMessage = [
    fallbackMessage || "Preview maken is niet gelukt.",
    previewDetails,
  ].filter(Boolean).join("\n");
  const body = {
    success: false,
    module,
    phase: error.phase || "",
    reason,
    message,
    error: developerMode ? message : fallbackMessage || message,
    userMessage: setupRequired
      ? fallbackMessage
      : isPreviewAction
        ? previewUserMessage
        : "De demo-klantreis kon niet worden opgeslagen. Zet Developer Mode aan voor technische details of controleer de serverlogs.",
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

function textToHtml(value = "") {
  return String(value || "").split("\n").map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`).join("");
}

function formatDutchDate(value = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short" });
}

function statusLabel(status = "") {
  return normalizeStatus(status).split("_").map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : "").join(" ");
}

function normalizeStatus(value = "") {
  return cleanText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizePackageType(value = "") {
  const text = cleanText(value).toLowerCase();
  if (/premium|1750|growth|enterprise/.test(text)) return "premium";
  if (/professional|professioneel|business|995|plus|multi/.test(text)) return "business";
  return "starter";
}

function normalizeRole(value = "") {
  return cleanText(value).toLowerCase();
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function cleanUuid(value = "") {
  const text = cleanText(value);
  return uuidPattern.test(text) ? text : "";
}

function normalizeJson(value, fallback = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function appendQueryParam(url = "", key = "", value = "") {
  const cleanUrl = cleanText(url);
  if (!cleanUrl || !key) return cleanUrl;
  return `${cleanUrl}${cleanUrl.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function escapeHtml(value = "") {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function isMissingTableError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.status === 404
    || text.includes("42p01")
    || text.includes("pgrst205")
    || text.includes("schema cache")
    || text.includes("could not find the table")
    || text.includes("demo_journeys")
    || text.includes("demo_journey_events");
}

function isMissingColumnError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.status === 400
    && (text.includes("42703")
      || text.includes("pgrst204")
      || text.includes("column")
      || text.includes("could not find"));
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
