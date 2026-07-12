const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { createTimelineEvent } = require("./services/timelineService");
const { createHash } = require("crypto");
const { PREVIEW_SOURCES, normalizePreviewSource, resolveActiveDemoPreview } = require("./_demo-preview-source");

const adminRoles = ["super_admin", "admin", "sales_manager"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const previewVersionFields = [
  "id",
  "customer_id",
  "project_id",
  "website_id",
  "demo_journey_id",
  "build_job_id",
  "version",
  "title",
  "customer_summary",
  "change_summary",
  "safe_preview_path",
  "preview_url",
  "preview_token",
  "preview_score",
  "quality_report",
  "generated_package",
  "is_active",
  "published_to_portal",
  "published_at",
  "review_deadline",
  "allow_feedback",
  "allow_approval",
  "status",
  "approved_at",
  "feedback_items",
  "metadata",
  "published_by",
  "created_at",
].join(",");
const websiteFields = "id,customer_id,name,domain,status";
const projectFields = "id,customer_id,website_id,name,status,updated_at";
const customerFields = "id,name,company,email,website";
const demoJourneyFields = "id,lead_id,customer_id,business_name,email,website_url,preview_url,preview_token,preview_package,updated_at,created_at";
const leadFields = "id,customer_id,converted_customer_id";
const legacyLeadFields = "id,converted_customer_id";
const buildJobFields = "id,demo_journey_id,lead_id,customer_id,preview_url,preview_token";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});

  const adminCheck = await verifyAdmin(event, jsonResponse, {
    module: "preview_publication",
    action: event.httpMethod.toLowerCase(),
    allowedRoles: adminRoles,
    allowedStatuses: ["active"],
  });
  if (!adminCheck.success) return adminCheck.response;

  const context = getContext(adminCheck.admin);
  if (!context.available) return jsonResponse(500, { success: false, error: "Previewpublicatie is nog niet geconfigureerd." });

  try {
    if (event.httpMethod === "GET") return await listPreviewVersions(context, event.queryStringParameters || {});
    if (event.httpMethod === "POST") {
      const payload = parsePayload(event.body);
      return payload.action === "publish_customer_preview"
        ? await publishActiveCustomerPreview(context, payload)
        : await publishPreviewVersion(context, payload);
    }
    return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });
  } catch (error) {
    console.error("Preview publication failed", {
      message: error.message,
      status: error.status || 500,
      code: error.code || "",
      details: error.details || "",
    });
    return jsonResponse(error.status || 500, {
      success: false,
      code: error.code || "PREVIEW_PUBLICATION_FAILED",
      error: safeError(error),
      setupRequired: isMissingPreviewSchema(error),
    });
  }
};

async function listPreviewVersions(context, params = {}) {
  const websiteId = uuidOrEmpty(params.websiteId || params.website_id);
  const selectedCustomerId = uuidOrEmpty(params.customerId || params.customer_id);
  const selectedProjectId = uuidOrEmpty(params.projectId || params.project_id);
  if (!websiteId) return jsonResponse(400, { success: false, error: "Website ontbreekt." });
  const website = await readSingle(context, "websites", `select=${websiteFields}&id=eq.${websiteId}&limit=1`);
  if (!website?.id) return jsonResponse(404, { success: false, error: "Website niet gevonden." });
  if (selectedCustomerId && selectedCustomerId !== cleanText(website.customer_id)) {
    throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze website hoort niet bij de geselecteerde klant.", 409);
  }

  const versions = await findPreviewVersionsForWebsite(context, {
    website,
    selectedCustomerId,
    selectedProjectId,
  });
  return jsonResponse(200, { success: true, website: sanitizeWebsite(website), previewVersions: versions.map(sanitizeAdminVersion) });
}

async function publishActiveCustomerPreview(context, payload = {}) {
  const customerId = uuidOrEmpty(payload.customerId || payload.customer_id);
  const projectId = uuidOrEmpty(payload.projectId || payload.project_id);
  const websiteId = uuidOrEmpty(payload.websiteId || payload.website_id);
  const demoJourneyId = uuidOrEmpty(payload.demoJourneyId || payload.demo_journey_id);
  const previewVersionId = uuidOrEmpty(payload.previewVersionId || payload.preview_version_id);
  const previewSource = normalizePreviewSource(payload.previewSource || payload.preview_source);
  if (!customerId) throw previewError("PREVIEW_CUSTOMER_REQUIRED", "Selecteer eerst een geldige klant.", 400);
  if (!websiteId) throw previewError("PREVIEW_WEBSITE_MISMATCH", "Selecteer eerst een website voor deze klant.", 400);
  if (!demoJourneyId) throw previewError("PREVIEW_NOT_FOUND", "Selecteer eerst een geldige preview.", 400);
  if (!previewSource) throw previewError("PREVIEW_SOURCE_INVALID", "Selecteer eerst een geldige previewbron.", 400);

  const website = await readSingle(context, "websites", `select=${websiteFields}&id=eq.${websiteId}&limit=1`);
  if (!website?.id || cleanText(website.customer_id) !== customerId) throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de actieve klant.", 409);
  const journey = await readSingle(context, "demo_journeys", `select=${demoJourneyFields}&id=eq.${demoJourneyId}&limit=1`);
  if (!journey?.id) throw previewError("PREVIEW_NOT_FOUND", "Selecteer eerst een geldige preview.", 404);
  if (journey.customer_id && cleanText(journey.customer_id) !== customerId) throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de actieve klant.", 409);

  const versions = await findPreviewVersionsForWebsite(context, { website, selectedCustomerId: customerId, selectedProjectId: projectId });
  const selectedVersion = previewVersionId ? versions.find((item) => cleanText(item.id) === previewVersionId) : versions[0] || null;
  if (!selectedVersion?.id) throw previewError("PREVIEW_NOT_FOUND", "Geen previewversie gevonden om te publiceren.", 404);
  const ownership = await resolveOwnership(context, selectedVersion, { website, selectedCustomerId: customerId, selectedProjectId: projectId });
  if (!ownership.customer?.id || cleanText(ownership.customer.id) !== customerId) throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de actieve klant.", 409);

  const journeyPackage = journey.preview_package && typeof journey.preview_package === "object" ? journey.preview_package : {};
  const resolved = resolveActiveDemoPreview(journeyPackage, previewSource);
  if (!resolved.available) throw previewError("PREVIEW_SOURCE_UNAVAILABLE", "De geselecteerde previewbron is momenteel niet beschikbaar.", 409);
  const selectedPackage = previewSource === PREVIEW_SOURCES.MANUAL ? resolved.previewPackage : selectedVersion.generated_package;
  if (!selectedPackage?.files?.length) throw previewError("PREVIEW_NOT_FOUND", "De geselecteerde preview kan niet worden geladen.", 409);
  const fingerprint = previewFingerprint({ demoJourneyId, previewSource, previewPackage: selectedPackage });
  let target = versions.find((item) => cleanText(item.metadata?.customerPreviewFingerprint) === fingerprint) || null;
  let created = false;

  if (!target && previewSource === PREVIEW_SOURCES.FACTORY) target = selectedVersion;
  if (!target) {
    const now = new Date().toISOString();
    const versionNumber = Math.max(0, ...versions.map((item) => Number(item.version || 0))) + 1;
    const inserted = await insertRows(context, "website_preview_versions", {
      customer_id: customerId,
      project_id: ownership.project?.id || projectId || null,
      website_id: websiteId,
      demo_journey_id: demoJourneyId,
      version: versionNumber,
      title: cleanText(payload.title) || `${journey.business_name || website.name || "Website"} — klantpreview`,
      customer_summary: cleanText(payload.summary || payload.customerSummary) || "Een nieuwe websiteversie staat klaar voor beoordeling.",
      change_summary: cleanText(payload.changeSummary) || (previewSource === PREVIEW_SOURCES.MANUAL ? "Handmatige ZIP-preview gepubliceerd." : "Website Factory-preview gepubliceerd."),
      preview_url: cleanText(journey.preview_url || selectedVersion.preview_url),
      preview_token: cleanText(journey.preview_token || selectedVersion.preview_token),
      generated_package: selectedPackage,
      quality_report: selectedVersion.quality_report || {},
      is_active: true,
      published_to_portal: false,
      allow_feedback: true,
      allow_approval: true,
      status: "internal",
      feedback_items: [],
      metadata: { customerPreviewFingerprint: fingerprint, previewSource, sourcePreviewVersionId: selectedVersion.id },
      created_by: context.admin.id || null,
      created_at: now,
      updated_at: now,
    });
    target = inserted[0] || null;
    created = true;
  }
  if (!target?.id) throw previewError("PREVIEW_PUBLICATION_FAILED", "De klantpreview kon niet worden gepubliceerd.", 500);

  const response = await publishPreviewVersion(context, {
    ...payload,
    customerId,
    projectId: ownership.project?.id || projectId,
    websiteId,
    previewVersionId: target.id,
    previewSource,
    customerPreviewFingerprint: fingerprint,
    title: target.title || payload.title,
  });
  const body = JSON.parse(response.body || "{}");
  if (body.previewVersion) {
    body.customerPreview = {
      ...body.previewVersion,
      previewSource,
      reviewStatus: body.previewVersion.approvedAt ? "approved" : "ready_for_review",
      createdForPublication: created,
    };
  }
  response.body = JSON.stringify(body);
  await safeTimeline({
    customerId,
    eventType: "customer_preview_published",
    title: "Klantpreview gepubliceerd",
    description: `${target.title || "Website-preview"} is zichtbaar in het klantportaal.`,
    module: "website",
    referenceType: "website_preview_version",
    referenceId: target.id,
    actorName: context.admin.email || "Max Webstudio",
    actorRole: "admin",
    severity: "success",
    metadata: { dedupeKey: `customer_preview_published:${target.id}`, previewVersionId: target.id, previewSource },
  });
  return response;
}

function previewFingerprint({ demoJourneyId = "", previewSource = "", previewPackage = {} } = {}) {
  const files = Array.isArray(previewPackage.files) ? previewPackage.files.map((file) => [file.path, file.size, file.encoding, file.content]) : [];
  return createHash("sha256").update(JSON.stringify({ demoJourneyId, previewSource, files })).digest("hex");
}

async function publishPreviewVersion(context, payload = {}) {
  const previewVersionId = uuidOrEmpty(payload.previewVersionId || payload.preview_version_id);
  const websiteId = uuidOrEmpty(payload.websiteId || payload.website_id);
  const selectedCustomerId = uuidOrEmpty(payload.customerId || payload.customer_id);
  const selectedProjectId = uuidOrEmpty(payload.projectId || payload.project_id);
  if (!websiteId) throw previewError("PREVIEW_WEBSITE_MISMATCH", "Websitecontext ontbreekt.", 400);

  const selectedWebsite = await readSingle(context, "websites", `select=${websiteFields}&id=eq.${websiteId}&limit=1`);
  if (!selectedWebsite?.id) throw previewError("PREVIEW_WEBSITE_MISMATCH", "Website niet gevonden.", 404);
  if (selectedCustomerId && selectedCustomerId !== cleanText(selectedWebsite.customer_id)) {
    return jsonResponse(409, { success: false, code: "PREVIEW_CUSTOMER_MISMATCH", error: "Deze website hoort niet bij de geselecteerde klant." });
  }

  const version = previewVersionId
    ? await readSingle(context, "website_preview_versions", `select=${previewVersionFields}&id=eq.${previewVersionId}&limit=1`)
    : (await findPreviewVersionsForWebsite(context, { website: selectedWebsite, selectedCustomerId, selectedProjectId }))[0] || null;
  if (!version?.id) throw previewError("PREVIEW_NOT_FOUND", "Geen bestaande previewversie gevonden om te publiceren.", 404);

  const ownership = await resolveOwnership(context, version, { website: selectedWebsite, selectedCustomerId, selectedProjectId });
  if (!ownership.customer?.id || !ownership.website?.id) {
    throw previewError("PREVIEW_OWNERSHIP_UNRESOLVED", "Deze preview kan nog niet veilig aan deze klant worden gekoppeld.", 409);
  }

  const now = new Date().toISOString();
  const safePreviewPath = `/preview.html?version=${encodeURIComponent(version.id)}`;
  assertNoRelationConflict(version, ownership);
  const patch = {
    customer_id: ownership.customer.id,
    project_id: ownership.project?.id || version.project_id || null,
    website_id: ownership.website.id,
    title: cleanText(payload.title).slice(0, 140) || version.title || "Website-preview",
    customer_summary: cleanText(payload.summary || payload.customerSummary || payload.customer_summary).slice(0, 500) || null,
    change_summary: cleanText(payload.changeSummary || payload.change_summary).slice(0, 1200) || null,
    review_deadline: parseDateOrNull(payload.reviewDeadline || payload.review_deadline),
    allow_feedback: payload.allowFeedback !== false && payload.allow_feedback !== false,
    allow_approval: payload.allowApproval !== false && payload.allow_approval !== false,
    notify_customer: Boolean(payload.notifyCustomer || payload.notify_customer),
    published_to_portal: true,
    published_at: version.published_at || now,
    published_by: context.admin.profileId || null,
    safe_preview_path: safePreviewPath,
    status: version.approved_at ? "approved" : "ready_for_review",
    metadata: {
      ...(isObject(version.metadata) ? version.metadata : {}),
      ...(normalizePreviewSource(payload.previewSource || payload.preview_source) ? { previewSource: normalizePreviewSource(payload.previewSource || payload.preview_source) } : {}),
      ...(cleanText(payload.customerPreviewFingerprint) ? { customerPreviewFingerprint: cleanText(payload.customerPreviewFingerprint) } : {}),
      publishDedupeKey: `preview_publish:${version.id}`,
      lastPublishedAt: now,
      notificationRequested: Boolean(payload.notifyCustomer || payload.notify_customer),
    },
    updated_at: now,
  };

  const rows = await patchRows(context, "website_preview_versions", `id=eq.${version.id}`, patch);
  const published = rows[0] || { ...version, ...patch };
  await safeTimeline({
    customerId: ownership.customer.id,
    eventType: "preview_shared",
    title: "Website-preview gepubliceerd",
    description: `${patch.title} staat klaar in het klantportaal.`,
    module: "website",
    referenceType: "website_preview_version",
    referenceId: version.id,
    actorName: context.admin.email || "Max Webstudio",
    actorRole: "admin",
    severity: "success",
    metadata: {
      dedupeKey: `preview_publish:${version.id}`,
      websiteId: ownership.website.id,
      projectId: ownership.project?.id || "",
      version: published.version,
    },
  });

  return jsonResponse(200, { success: true, previewVersion: sanitizeAdminVersion(published), website: sanitizeWebsite(ownership.website) });
}

async function findPreviewVersionsForWebsite(context, selection = {}) {
  const website = selection.website;
  const websiteId = cleanText(website?.id);
  const customerId = cleanText(selection.selectedCustomerId || website?.customer_id);
  const modern = await readRows(
    context,
    "website_preview_versions",
    `select=${previewVersionFields}&website_id=eq.${encodeURIComponent(websiteId)}&order=version.desc`
  );

  const legacy = customerId ? await readLegacyPreviewVersions(context, { customerId }) : [];
  const unlinked = legacy.length ? [] : await readRecentUnlinkedFactoryPreviewVersions(context, selection);
  const merged = dedupeById([...modern, ...legacy, ...unlinked]);
  const annotated = [];
  for (const version of merged) {
    let ownership = null;
    try {
      ownership = await resolveOwnership(context, version, selection, { quiet: true });
    } catch (error) {
      ownership = { resolvable: false, code: error.code || "PREVIEW_OWNERSHIP_UNRESOLVED", reason: safeError(error) };
    }
    annotated.push({ ...version, _ownership: ownership });
  }
  return annotated.sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
}

async function readLegacyPreviewVersions(context, { customerId }) {
  const journeyIds = await readLegacyJourneyIdsForCustomer(context, customerId);
  if (!journeyIds.length) return [];
  const rows = await readRows(
    context,
    "website_preview_versions",
    `select=${previewVersionFields}&demo_journey_id=in.(${journeyIds.map(encodeURIComponent).join(",")})&order=version.desc`
  );
  return rows.filter((row) => !cleanText(row.website_id));
}

async function readRecentUnlinkedFactoryPreviewVersions(context, selection = {}) {
  const selectedWebsite = selection.selectedWebsite || selection.website || null;
  if (!uuidOrEmpty(selection.selectedCustomerId) || !selectedWebsite?.id || !uuidOrEmpty(selection.selectedProjectId)) return [];
  return readRows(
    context,
    "website_preview_versions",
    `select=${previewVersionFields}&website_id=is.null&customer_id=is.null&order=created_at.desc&limit=5`
  );
}

async function readLegacyJourneyIdsForCustomer(context, customerId) {
  const ids = new Set();
  const directJourneys = await readRows(context, "demo_journeys", `select=${demoJourneyFields}&customer_id=eq.${encodeURIComponent(customerId)}&limit=100`);
  directJourneys.forEach((journey) => ids.add(cleanText(journey.id)));

  const leads = await readLeadRowsForCustomer(context, customerId);
  const leadIds = leads.map((lead) => cleanText(lead.id)).filter(Boolean);
  if (leadIds.length) {
    const leadJourneys = await readRows(context, "demo_journeys", `select=${demoJourneyFields}&lead_id=in.(${leadIds.map(encodeURIComponent).join(",")})&limit=100`);
    leadJourneys.forEach((journey) => ids.add(cleanText(journey.id)));
  }
  const identityJourneys = await readLegacyJourneysByCustomerIdentity(context, customerId);
  identityJourneys.forEach((journey) => ids.add(cleanText(journey.id)));

  return [...ids].filter(Boolean);
}

async function resolveOwnership(context, version = {}, selection = {}, options = {}) {
  try {
    const selectedWebsite = selection.website?.id
      ? selection.website
      : selection.websiteId ? await readSingle(context, "websites", `select=${websiteFields}&id=eq.${encodeURIComponent(selection.websiteId)}&limit=1`) : null;
    const selectedCustomerId = cleanText(selection.selectedCustomerId || selectedWebsite?.customer_id);
    const selectedProjectId = cleanText(selection.selectedProjectId);

    if (version.website_id) return resolveModernOwnership(context, version, { selectedWebsite, selectedCustomerId, selectedProjectId });
    return resolveLegacyOwnership(context, version, { selectedWebsite, selectedCustomerId, selectedProjectId });
  } catch (error) {
    if (options.quiet) return { resolvable: false, code: error.code || "PREVIEW_OWNERSHIP_UNRESOLVED", reason: safeError(error) };
    throw error;
  }
}

async function resolveModernOwnership(context, version = {}, selection = {}) {
  const website = version.website_id
    ? await readSingle(context, "websites", `select=${websiteFields}&id=eq.${encodeURIComponent(version.website_id)}&limit=1`)
    : selection.selectedWebsite;
  if (!website?.id) throw previewError("PREVIEW_OWNERSHIP_UNRESOLVED", "Deze preview kan nog niet veilig aan deze klant worden gekoppeld.", 409);
  if (selection.selectedWebsite?.id && cleanText(website.id) !== cleanText(selection.selectedWebsite.id)) {
    throw previewError("PREVIEW_WEBSITE_MISMATCH", "Deze preview hoort niet bij de geselecteerde website.", 409);
  }

  const project = version.project_id
    ? await readSingle(context, "projects", `select=${projectFields}&id=eq.${encodeURIComponent(version.project_id)}&limit=1`)
    : selection.selectedProjectId
      ? await readSingle(context, "projects", `select=${projectFields}&id=eq.${encodeURIComponent(selection.selectedProjectId)}&limit=1`)
    : await readSingle(context, "projects", `select=${projectFields}&website_id=eq.${encodeURIComponent(website.id)}&order=updated_at.desc.nullslast&limit=1`);
  if (selection.selectedProjectId && !project?.id) {
    throw previewError("PREVIEW_PROJECT_MISMATCH", "Deze preview hoort niet bij het geselecteerde project.", 409);
  }
  if (selection.selectedProjectId && project?.id && cleanText(project.id) !== selection.selectedProjectId) {
    throw previewError("PREVIEW_PROJECT_MISMATCH", "Deze preview hoort niet bij het geselecteerde project.", 409);
  }
  if (project?.id && (cleanText(project.customer_id) !== cleanText(website.customer_id) || cleanText(project.website_id) !== cleanText(website.id))) {
    throw previewError("PREVIEW_PROJECT_MISMATCH", "Deze preview hoort niet bij het geselecteerde project.", 409);
  }

  const customerId = uuidOrEmpty(version.customer_id || website.customer_id || project?.customer_id);
  if (!customerId) throw previewError("PREVIEW_OWNERSHIP_UNRESOLVED", "Deze preview kan nog niet veilig aan deze klant worden gekoppeld.", 409);
  if (selection.selectedCustomerId && customerId !== selection.selectedCustomerId) {
    throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de geselecteerde klant.", 409);
  }
  const customer = await readSingle(context, "customers", `select=${customerFields}&id=eq.${encodeURIComponent(customerId)}&limit=1`);
  return { resolvable: Boolean(customer?.id && website?.id), customer, project, website, source: "website_id" };
}

async function resolveLegacyOwnership(context, version = {}, selection = {}) {
  const journeyId = uuidOrEmpty(version.demo_journey_id);
  if (!journeyId) throw previewError("PREVIEW_OWNERSHIP_UNRESOLVED", "Deze preview kan nog niet veilig aan deze klant worden gekoppeld.", 409);
  const journey = await readSingle(context, "demo_journeys", `select=${demoJourneyFields}&id=eq.${encodeURIComponent(journeyId)}&limit=1`);
  if (!journey?.id) throw previewError("PREVIEW_OWNERSHIP_UNRESOLVED", "Deze preview kan nog niet veilig aan deze klant worden gekoppeld.", 409);

  const buildJob = version.build_job_id
    ? await readSingle(context, "website_build_jobs", `select=${buildJobFields}&id=eq.${encodeURIComponent(version.build_job_id)}&limit=1`)
    : null;
  if (buildJob?.id && cleanText(buildJob.demo_journey_id) !== cleanText(journey.id)) {
    throw previewError("PREVIEW_OWNERSHIP_UNRESOLVED", "Deze preview kan nog niet veilig aan deze klant worden gekoppeld.", 409);
  }

  const customerIds = new Set([journey.customer_id, buildJob?.customer_id].map(uuidOrEmpty).filter(Boolean));
  if (journey.lead_id) {
    const lead = await readLeadById(context, journey.lead_id);
    [lead?.customer_id, lead?.converted_customer_id, buildJob?.lead_id === lead?.id ? lead?.customer_id : ""].map(uuidOrEmpty).filter(Boolean).forEach((id) => customerIds.add(id));
  }
  const fallbackCustomerId = customerIds.size === 0
    ? await resolveExplicitLegacyCustomerFromSelection(context, journey, selection)
    : "";
  if (customerIds.size !== 1 && !fallbackCustomerId) throw previewError("PREVIEW_OWNERSHIP_UNRESOLVED", "Deze preview kan nog niet veilig aan deze klant worden gekoppeld.", 409);
  const customerId = fallbackCustomerId || [...customerIds][0];
  if (selection.selectedCustomerId && customerId !== selection.selectedCustomerId) {
    throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de geselecteerde klant.", 409);
  }
  if (!selection.selectedWebsite?.id || cleanText(selection.selectedWebsite.customer_id) !== customerId) {
    throw previewError("PREVIEW_WEBSITE_MISMATCH", "Deze preview hoort niet bij de geselecteerde website.", 409);
  }

  const customerWebsites = await readRows(context, "websites", `select=${websiteFields}&customer_id=eq.${encodeURIComponent(customerId)}&limit=3`);
  if (customerWebsites.length !== 1 || cleanText(customerWebsites[0].id) !== cleanText(selection.selectedWebsite.id)) {
    throw previewError("PREVIEW_WEBSITE_MISMATCH", "Deze preview kan nog niet veilig aan deze klant worden gekoppeld.", 409);
  }

  const project = selection.selectedProjectId
    ? await readSingle(context, "projects", `select=${projectFields}&id=eq.${encodeURIComponent(selection.selectedProjectId)}&limit=1`)
    : await readSingle(context, "projects", `select=${projectFields}&website_id=eq.${encodeURIComponent(selection.selectedWebsite.id)}&order=updated_at.desc.nullslast&limit=1`);
  if (project?.id && (cleanText(project.customer_id) !== customerId || cleanText(project.website_id) !== cleanText(selection.selectedWebsite.id))) {
    throw previewError("PREVIEW_PROJECT_MISMATCH", "Deze preview hoort niet bij het geselecteerde project.", 409);
  }

  const customer = await readSingle(context, "customers", `select=${customerFields}&id=eq.${encodeURIComponent(customerId)}&limit=1`);
  return { resolvable: Boolean(customer?.id), customer, project, website: selection.selectedWebsite, source: "demo_journey_id", legacy: true };
}

function assertNoRelationConflict(version = {}, ownership = {}) {
  const checks = [
    ["customer_id", ownership.customer?.id, "PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de geselecteerde klant."],
    ["project_id", ownership.project?.id, "PREVIEW_PROJECT_MISMATCH", "Deze preview hoort niet bij het geselecteerde project."],
    ["website_id", ownership.website?.id, "PREVIEW_WEBSITE_MISMATCH", "Deze preview hoort niet bij de geselecteerde website."],
  ];
  for (const [field, expected, code, message] of checks) {
    const current = cleanText(version[field]);
    if (current && expected && current !== cleanText(expected)) throw previewError(code, message, 409);
  }
}

function dedupeById(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const id = cleanText(row.id);
    if (id && !map.has(id)) map.set(id, row);
  });
  return [...map.values()];
}

async function readRows(context, table, query) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}?${query}`, { method: "GET", headers: restHeaders(context.serviceRoleKey) });
}

async function readLeadRowsForCustomer(context, customerId) {
  const encodedCustomerId = encodeURIComponent(customerId);
  try {
    return await readRows(context, "leads", `select=${leadFields}&or=(customer_id.eq.${encodedCustomerId},converted_customer_id.eq.${encodedCustomerId})&limit=100`);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    try {
      return await readRows(context, "leads", `select=${legacyLeadFields}&converted_customer_id=eq.${encodedCustomerId}&limit=100`);
    } catch (fallbackError) {
      if (!isMissingColumnError(fallbackError)) throw fallbackError;
      return [];
    }
  }
}

async function readLeadById(context, leadId) {
  const encodedLeadId = encodeURIComponent(leadId);
  try {
    return await readSingle(context, "leads", `select=${leadFields}&id=eq.${encodedLeadId}&limit=1`);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    try {
      return await readSingle(context, "leads", `select=${legacyLeadFields}&id=eq.${encodedLeadId}&limit=1`);
    } catch (fallbackError) {
      if (!isMissingColumnError(fallbackError)) throw fallbackError;
      return null;
    }
  }
}

async function readLegacyJourneysByCustomerIdentity(context, customerId) {
  const customer = await readSingle(context, "customers", `select=${customerFields}&id=eq.${encodeURIComponent(customerId)}&limit=1`);
  if (!customer?.id) return [];
  const matches = new Map();
  const email = cleanText(customer.email).toLowerCase();
  const website = cleanText(customer.website);
  if (email) {
    const rows = await readRows(context, "demo_journeys", `select=${demoJourneyFields}&email=eq.${encodeURIComponent(email)}&limit=25`);
    rows.forEach((row) => matches.set(cleanText(row.id), row));
  }
  if (website) {
    const rows = await readRows(context, "demo_journeys", `select=${demoJourneyFields}&website_url=eq.${encodeURIComponent(website)}&limit=25`);
    rows.forEach((row) => matches.set(cleanText(row.id), row));
  }
  return [...matches.values()].filter((journey) => legacyJourneyMatchesCustomer(journey, customer));
}

async function resolveLegacyCustomerFromSelection(context, journey = {}, selection = {}) {
  const selectedCustomerId = uuidOrEmpty(selection.selectedCustomerId);
  if (!selectedCustomerId || !selection.selectedWebsite?.id) return "";
  if (cleanText(selection.selectedWebsite.customer_id) !== selectedCustomerId) return "";
  const project = selection.selectedProjectId
    ? await readSingle(context, "projects", `select=${projectFields}&id=eq.${encodeURIComponent(selection.selectedProjectId)}&limit=1`)
    : await readSingle(context, "projects", `select=${projectFields}&website_id=eq.${encodeURIComponent(selection.selectedWebsite.id)}&order=updated_at.desc.nullslast&limit=1`);
  if (!project?.id || cleanText(project.customer_id) !== selectedCustomerId || cleanText(project.website_id) !== cleanText(selection.selectedWebsite.id)) return "";
  const customer = await readSingle(context, "customers", `select=${customerFields}&id=eq.${encodeURIComponent(selectedCustomerId)}&limit=1`);
  if (!legacyJourneyMatchesCustomer(journey, customer)) return "";
  return selectedCustomerId;
}

async function resolveExplicitLegacyCustomerFromSelection(context, journey = {}, selection = {}) {
  const identityCustomerId = await resolveLegacyCustomerFromSelection(context, journey, selection);
  if (identityCustomerId) return identityCustomerId;
  return "";
}

function legacyJourneyMatchesCustomer(journey = {}, customer = {}) {
  if (!journey?.id || !customer?.id) return false;
  const journeyEmail = cleanText(journey.email).toLowerCase();
  const customerEmail = cleanText(customer.email).toLowerCase();
  if (journeyEmail && customerEmail && journeyEmail === customerEmail) return true;
  const journeyWebsite = normalizeUrlForMatch(journey.website_url);
  const customerWebsite = normalizeUrlForMatch(customer.website);
  return Boolean(journeyWebsite && customerWebsite && journeyWebsite === customerWebsite);
}

function normalizeUrlForMatch(value = "") {
  const text = cleanText(value).toLowerCase();
  if (!text) return "";
  return text.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

async function readSingle(context, table, query) {
  const rows = await readRows(context, table, query);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function patchRows(context, table, filter, record) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { ...restHeaders(context.serviceRoleKey), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(record),
  });
}

async function insertRows(context, table, record) {
  return supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...restHeaders(context.serviceRoleKey), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(record),
  });
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    error.code = data?.code || "";
    error.details = data?.details || "";
    error.hint = data?.hint || "";
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function getContext(admin) {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { available: Boolean(supabaseUrl && serviceRoleKey), supabaseUrl, serviceRoleKey, admin: admin || {} };
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

function sanitizeAdminVersion(row = {}) {
  const ownership = row._ownership || {};
  const legacy = Boolean(!cleanText(row.website_id) && cleanText(row.demo_journey_id));
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    projectId: cleanText(row.project_id),
    websiteId: cleanText(row.website_id),
    demoJourneyId: cleanText(row.demo_journey_id),
    isLegacyFactoryPreview: legacy,
    label: legacy ? "Factory preview - nog niet gekoppeld" : "Gekoppelde preview",
    canPublish: ownership.resolvable !== false,
    ownershipCode: cleanText(ownership.code),
    ownershipMessage: ownership.resolvable === false ? cleanText(ownership.reason) || "Deze preview kan nog niet veilig aan deze klant worden gekoppeld." : "",
    version: Number(row.version || 1),
    title: cleanText(row.title),
    customerSummary: cleanText(row.customer_summary),
    changeSummary: cleanText(row.change_summary),
    safePreviewPath: cleanText(row.safe_preview_path),
    previewUrl: cleanText(row.preview_url),
    previewTokenPresent: Boolean(cleanText(row.preview_token)),
    publishedToPortal: Boolean(row.published_to_portal),
    publishedAt: cleanText(row.published_at),
    reviewDeadline: cleanText(row.review_deadline),
    allowFeedback: row.allow_feedback !== false,
    allowApproval: row.allow_approval !== false,
    status: cleanText(row.status),
    approvedAt: cleanText(row.approved_at),
    feedbackCount: Array.isArray(row.feedback_items) ? row.feedback_items.length : 0,
    previewSource: normalizePreviewSource(row.metadata?.previewSource),
    createdAt: cleanText(row.created_at),
  };
}

function sanitizeWebsite(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    name: cleanText(row.name),
    domain: cleanText(row.domain),
    status: cleanText(row.status),
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

function parseDateOrNull(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function uuidOrEmpty(value) {
  const text = cleanText(value);
  return uuidPattern.test(text) ? text : "";
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isMissingPreviewSchema(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return text.includes("website_preview_versions") || text.includes("schema cache") || text.includes("pgrst205");
}

function isMissingColumnError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.code === "42703" || error.code === "PGRST204" || text.includes("column") || text.includes("schema cache");
}

function safeError(error = {}) {
  if (error.publicMessage) return error.publicMessage;
  return isMissingPreviewSchema(error)
    ? "Previewpublicatie-tabellen ontbreken nog. Voer migratie 20260711133000_preview_publication_portal_review uit."
    : error.message || "Previewpublicatie kon niet worden verwerkt.";
}

function previewError(code, message, status = 409) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.publicMessage = message;
  return error;
}

async function safeTimeline(input) {
  try {
    return await createTimelineEvent(input);
  } catch (error) {
    console.error("Preview publication timeline skipped", { message: error.message });
    return null;
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders({ methods: "GET, POST, OPTIONS" }) },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

exports._private = {
  findPreviewVersionsForWebsite,
  previewFingerprint,
  publishActiveCustomerPreview,
  publishPreviewVersion,
  resolveOwnership,
  sanitizeAdminVersion,
};
