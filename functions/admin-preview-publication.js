const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { createTimelineEvent } = require("./services/timelineService");
const { createHash } = require("crypto");
const { PREVIEW_SOURCES, normalizePreviewSource, resolveActiveDemoPreview } = require("./_demo-preview-source");
const {
  candidateSlug,
  fallbackPreviewUrl,
  isValidPublicSlug,
  preferredSlug,
  publicPreviewUrl,
  slugify,
} = require("./_public-preview");

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
const customerFields = "id,name,company,email,website,metadata,public_preview_slug,public_preview_enabled,public_preview_created_at,public_preview_updated_at,public_preview_revoked_at,updated_at";
const demoJourneyFields = "id,lead_id,customer_id,business_name,email,website_url,preview_url,preview_token,preview_package,updated_at,created_at";
const leadFields = "id,customer_id,converted_customer_id";
const publicLeadFields = "id,company_name,contact_name,status,lead_status,customer_id,converted_customer_id";
const publicLeadFieldsWithoutCustomerId = "id,company_name,contact_name,status,lead_status,converted_customer_id";
const legacyLeadFields = "id,converted_customer_id";
const buildJobFields = "id,demo_journey_id,lead_id,customer_id,preview_url,preview_token";
const publicPublicationFields = "id,relationship_type,relationship_id,public_slug,preview_version_id,enabled,published_at,revoked_at,created_at,updated_at,created_by";

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
    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      return cleanText(params.action) === "current"
        ? await resolveCurrentPublishedPreview(context, params)
        : await listPreviewVersions(context, params);
    }
    if (event.httpMethod === "POST") {
      const payload = parsePayload(event.body);
      if (payload.action === "publish_customer_preview") return publishActiveCustomerPreview(context, payload);
      if (payload.action === "publish_public_preview") return publishPublicPreview(context, payload);
      if (payload.action === "set_public_preview_slug") return setPublicPreviewSlug(context, payload);
      if (payload.action === "revoke_public_preview") return revokePublicPreview(context, payload);
      return publishPreviewVersion(context, payload);
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

async function resolveCurrentPublishedPreview(context, params = {}) {
  const relationship = relationshipFromInput(params);
  const expectedVersionId = uuidOrEmpty(params.previewVersionId || params.preview_version_id);
  if (relationship) {
    const publication = await readPublicPublication(context, relationship, { allowMissingTable: relationship.type === "customer" });
    if (publication?.id) {
      if (expectedVersionId && expectedVersionId !== cleanText(publication.preview_version_id)) {
        throw previewError("PREVIEW_POINTER_MISMATCH", "De publieke preview wijkt af van de geselecteerde versie.", 409);
      }
      const resolved = await validatePublicPreviewOwnership(context, relationship, publication.preview_version_id);
      return jsonResponse(200, {
        success: true,
        relationshipType: relationship.type,
        relationshipId: relationship.id,
        leadId: relationship.type === "lead" ? relationship.id : "",
        customerId: relationship.type === "customer" ? relationship.id : "",
        publishedPreviewVersionId: cleanText(publication.preview_version_id),
        previewVersion: sanitizeAdminVersion(resolved.version),
        ...publicPublicationDetails(publication),
      });
    }
    if (relationship.type === "lead") {
      throw previewError("PREVIEW_POINTER_NOT_FOUND", "Voor deze lead is nog geen publieke demo gepubliceerd.", 404);
    }
  }

  const customerId = relationship?.type === "customer" ? relationship.id : uuidOrEmpty(params.customerId || params.customer_id);
  if (!customerId) throw previewError("PREVIEW_CUSTOMER_REQUIRED", "Selecteer eerst een geldige klant.", 400);
  const customer = await readSingle(context, "customers", `select=${customerFields}&id=eq.${encodeURIComponent(customerId)}&limit=1`);
  if (!customer?.id) throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze klant kon niet worden gevalideerd.", 404);
  const currentPreviewVersionId = uuidOrEmpty(customer.metadata?.publishedPreviewVersionId);
  if (!currentPreviewVersionId) throw previewError("PREVIEW_POINTER_NOT_FOUND", "Voor deze klant is nog geen huidige preview gepubliceerd.", 404);
  if (expectedVersionId && expectedVersionId !== currentPreviewVersionId) {
    throw previewError("PREVIEW_POINTER_MISMATCH", "De gepubliceerde klantpreview wijkt af van de geselecteerde Factory-versie.", 409);
  }
  const version = await readSingle(context, "website_preview_versions", [
    `select=${previewVersionFields}`,
    `id=eq.${encodeURIComponent(currentPreviewVersionId)}`,
    `customer_id=eq.${encodeURIComponent(customerId)}`,
    "published_to_portal=eq.true",
    "limit=1",
  ].join("&"));
  if (!version?.id) throw previewError("PREVIEW_POINTER_INVALID", "De huidige klantpreview is niet beschikbaar voor deze klant.", 409);
  return jsonResponse(200, {
    success: true,
    customerId,
    publishedPreviewVersionId: currentPreviewVersionId,
    previewVersion: sanitizeAdminVersion(version),
    ...publicPreviewDetails(customer),
  });
}

async function setPublicPreviewSlug(context, payload = {}) {
  const relationship = relationshipFromInput(payload);
  const requestedSlug = cleanText(payload.slug || payload.publicPreviewSlug || payload.public_preview_slug);
  if (!relationship) throw previewError("PREVIEW_RELATIONSHIP_REQUIRED", "Selecteer eerst een geldige lead of klant.", 400);
  if (!requestedSlug || requestedSlug !== slugify(requestedSlug) || !isValidPublicSlug(requestedSlug)) {
    throw previewError("PUBLIC_PREVIEW_SLUG_INVALID", "Kies 3 tot 64 kleine letters, cijfers of koppeltekens. Deze naam is niet toegestaan.", 400);
  }
  const publication = await readPublicPublication(context, relationship, { allowMissingTable: relationship.type === "customer" });
  if (publication?.id) {
    await assertPublicSlugAvailable(context, requestedSlug, { publicationId: publication.id, relationship });
    const now = new Date().toISOString();
    const rows = await patchRows(context, "public_preview_publications", `id=eq.${encodeURIComponent(publication.id)}`, {
      public_slug: requestedSlug,
      enabled: true,
      revoked_at: null,
      updated_at: now,
    });
    const updated = rows[0] || { ...publication, public_slug: requestedSlug, enabled: true, revoked_at: null, updated_at: now };
    return jsonResponse(200, {
      success: true,
      relationshipType: relationship.type,
      relationshipId: relationship.id,
      leadId: relationship.type === "lead" ? relationship.id : "",
      customerId: relationship.type === "customer" ? relationship.id : "",
      publishedPreviewVersionId: cleanText(updated.preview_version_id),
      ...publicPublicationDetails(updated),
    });
  }
  if (relationship.type === "lead") throw previewError("PREVIEW_POINTER_NOT_FOUND", "Publiceer eerst een publieke demo voordat u de slug wijzigt.", 409);

  const customerId = relationship.id;
  const customer = await readSingle(context, "customers", `select=${customerFields}&id=eq.${encodeURIComponent(customerId)}&limit=1`);
  if (!customer?.id) throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze klant kon niet worden gevalideerd.", 404);
  if (!uuidOrEmpty(customer.metadata?.publishedPreviewVersionId)) {
    throw previewError("PREVIEW_POINTER_NOT_FOUND", "Publiceer eerst een klantpreview voordat u een publieke link instelt.", 409);
  }
  await assertPublicSlugAvailable(context, requestedSlug, { relationship });
  const now = new Date().toISOString();
  const rows = await patchRows(context, "customers", `id=eq.${customerId}`, {
    public_preview_slug: requestedSlug,
    public_preview_enabled: true,
    public_preview_created_at: customer.public_preview_created_at || now,
    public_preview_updated_at: now,
    public_preview_revoked_at: null,
    updated_at: now,
  });
  const updated = rows[0] || { ...customer, public_preview_slug: requestedSlug, public_preview_enabled: true, public_preview_created_at: customer.public_preview_created_at || now, public_preview_updated_at: now, public_preview_revoked_at: null };
  return jsonResponse(200, { success: true, customerId, ...publicPreviewDetails(updated) });
}

async function revokePublicPreview(context, payload = {}) {
  const relationship = relationshipFromInput(payload);
  if (!relationship) throw previewError("PREVIEW_RELATIONSHIP_REQUIRED", "Selecteer eerst een geldige lead of klant.", 400);
  const publication = await readPublicPublication(context, relationship, { allowMissingTable: relationship.type === "customer" });
  if (publication?.id) {
    const now = new Date().toISOString();
    const rows = await patchRows(context, "public_preview_publications", `id=eq.${encodeURIComponent(publication.id)}`, {
      enabled: false,
      revoked_at: now,
      updated_at: now,
    });
    const updated = rows[0] || { ...publication, enabled: false, revoked_at: now, updated_at: now };
    return jsonResponse(200, {
      success: true,
      relationshipType: relationship.type,
      relationshipId: relationship.id,
      leadId: relationship.type === "lead" ? relationship.id : "",
      customerId: relationship.type === "customer" ? relationship.id : "",
      publishedPreviewVersionId: cleanText(updated.preview_version_id),
      ...publicPublicationDetails(updated),
    });
  }
  if (relationship.type === "lead") throw previewError("PREVIEW_POINTER_NOT_FOUND", "Voor deze lead is nog geen publieke demo gepubliceerd.", 404);

  const customerId = relationship.id;
  const customer = await readSingle(context, "customers", `select=${customerFields}&id=eq.${encodeURIComponent(customerId)}&limit=1`);
  if (!customer?.id) throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze klant kon niet worden gevalideerd.", 404);
  const now = new Date().toISOString();
  const rows = await patchRows(context, "customers", `id=eq.${customerId}`, {
    public_preview_enabled: false,
    public_preview_updated_at: now,
    public_preview_revoked_at: now,
    updated_at: now,
  });
  const updated = rows[0] || { ...customer, public_preview_enabled: false, public_preview_updated_at: now, public_preview_revoked_at: now };
  return jsonResponse(200, { success: true, customerId, ...publicPreviewDetails(updated) });
}

function relationshipFromInput(input = {}) {
  const explicitType = cleanText(input.relationshipType || input.relationship_type).toLowerCase();
  const leadId = uuidOrEmpty(input.leadId || input.lead_id);
  const customerId = uuidOrEmpty(input.customerId || input.customer_id);
  const explicitId = uuidOrEmpty(input.relationshipId || input.relationship_id);
  const type = ["lead", "customer"].includes(explicitType) ? explicitType : customerId ? "customer" : leadId ? "lead" : "";
  const id = explicitId || (type === "lead" ? leadId : type === "customer" ? customerId : "");
  return type && id ? { type, id } : null;
}

async function readRelationshipRecord(context, relationship) {
  if (!relationship) return null;
  if (relationship.type !== "lead") {
    return readSingle(context, "customers", `select=${customerFields}&id=eq.${encodeURIComponent(relationship.id)}&limit=1`);
  }
  try {
    return await readSingle(context, "leads", `select=${publicLeadFields}&id=eq.${encodeURIComponent(relationship.id)}&limit=1`);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    return readSingle(context, "leads", `select=${publicLeadFieldsWithoutCustomerId}&id=eq.${encodeURIComponent(relationship.id)}&limit=1`);
  }
}

async function readPublicPublication(context, relationship, options = {}) {
  if (!relationship) return null;
  try {
    return await readSingle(context, "public_preview_publications", [
      `select=${publicPublicationFields}`,
      `relationship_type=eq.${encodeURIComponent(relationship.type)}`,
      `relationship_id=eq.${encodeURIComponent(relationship.id)}`,
      "order=enabled.desc,updated_at.desc",
      "limit=1",
    ].join("&"));
  } catch (error) {
    if (options.allowMissingTable && isMissingPublicPublicationSchema(error)) return null;
    throw error;
  }
}

async function validatePublicPreviewOwnership(context, relationship, previewVersionId, supplied = {}) {
  const relationshipRecord = supplied.relationshipRecord || await readRelationshipRecord(context, relationship);
  if (!relationshipRecord?.id) {
    throw previewError("PREVIEW_RELATIONSHIP_MISMATCH", "De geselecteerde lead of klant kon niet worden gevalideerd.", 404);
  }
  const version = supplied.version || await readSingle(context, "website_preview_versions", `select=${previewVersionFields}&id=eq.${encodeURIComponent(previewVersionId)}&limit=1`);
  if (!version?.id) throw previewError("PREVIEW_NOT_FOUND", "De geselecteerde previewversie bestaat niet.", 404);
  const files = Array.isArray(version.generated_package?.files) ? version.generated_package.files : [];
  if (!files.length) throw previewError("PREVIEW_NOT_PROCESSED", "De geselecteerde preview is nog niet verwerkt en kan niet worden gedeeld.", 409);
  if (cleanText(version.status).toLowerCase() === "archived") {
    throw previewError("PREVIEW_NOT_SHAREABLE", "Een gearchiveerde preview kan niet publiek worden gedeeld.", 409);
  }

  const journeyId = uuidOrEmpty(version.demo_journey_id);
  const journey = journeyId
    ? await readSingle(context, "demo_journeys", `select=${demoJourneyFields}&id=eq.${encodeURIComponent(journeyId)}&limit=1`)
    : null;

  if (relationship.type === "lead") {
    if (!journey?.id || cleanText(journey.lead_id) !== relationship.id) {
      throw previewError("PREVIEW_LEAD_MISMATCH", "Deze preview hoort niet bij de geselecteerde lead.", 409);
    }
    const linkedCustomerIds = [relationshipRecord.customer_id, relationshipRecord.converted_customer_id].map(uuidOrEmpty).filter(Boolean);
    if (version.customer_id && !linkedCustomerIds.includes(cleanText(version.customer_id))) {
      throw previewError("PREVIEW_LEAD_MISMATCH", "Deze preview is aan een andere relatie gekoppeld.", 409);
    }
    return { relationshipRecord, version, journey };
  }

  if (cleanText(version.customer_id) === relationship.id || cleanText(journey?.customer_id) === relationship.id) {
    return { relationshipRecord, version, journey };
  }
  const journeyLead = journey?.lead_id ? await readLeadById(context, cleanText(journey.lead_id)) : null;
  const convertedCustomerIds = [journeyLead?.customer_id, journeyLead?.converted_customer_id].map(uuidOrEmpty).filter(Boolean);
  if (!convertedCustomerIds.includes(relationship.id)) {
    throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de geselecteerde klant.", 409);
  }
  return { relationshipRecord, version, journey };
}

async function assertPublicSlugAvailable(context, slug, options = {}) {
  let genericCollision = null;
  try {
    genericCollision = await readSingle(context, "public_preview_publications", `select=id,relationship_type,relationship_id&public_slug=eq.${encodeURIComponent(slug)}&limit=1`);
  } catch (error) {
    if (!isMissingPublicPublicationSchema(error)) throw error;
  }
  if (genericCollision?.id && cleanText(genericCollision.id) !== cleanText(options.publicationId)) {
    throw previewError("PUBLIC_PREVIEW_SLUG_TAKEN", "Deze previewnaam is al in gebruik. Kies een andere naam.", 409);
  }
  const legacyCollision = await readSingle(context, "customers", `select=id&public_preview_slug=eq.${encodeURIComponent(slug)}&limit=1`);
  const sameLegacyCustomer = options.relationship?.type === "customer" && cleanText(legacyCollision?.id) === options.relationship.id;
  if (legacyCollision?.id && !sameLegacyCustomer) {
    throw previewError("PUBLIC_PREVIEW_SLUG_TAKEN", "Deze previewnaam is al in gebruik. Kies een andere naam.", 409);
  }
  return true;
}

async function publishPublicPreview(context, payload = {}) {
  const relationship = relationshipFromInput(payload);
  const previewVersionId = uuidOrEmpty(payload.previewVersionId || payload.preview_version_id);
  if (!relationship) throw previewError("PREVIEW_RELATIONSHIP_REQUIRED", "Selecteer eerst een geldige lead of klant.", 400);
  if (!previewVersionId) throw previewError("PREVIEW_VERSION_INVALID", "Selecteer eerst een geldige previewversie.", 400);

  const resolved = await validatePublicPreviewOwnership(context, relationship, previewVersionId);
  const existing = await readPublicPublication(context, relationship);
  const requestedSlug = cleanText(payload.slug || payload.publicSlug || payload.public_slug);
  if (requestedSlug && (requestedSlug !== slugify(requestedSlug) || !isValidPublicSlug(requestedSlug))) {
    throw previewError("PUBLIC_PREVIEW_SLUG_INVALID", "Kies 3 tot 64 kleine letters, cijfers of koppeltekens. Deze naam is niet toegestaan.", 400);
  }
  const preferred = relationship.type === "lead"
    ? preferredSlug({ company: resolved.relationshipRecord.company_name, name: resolved.relationshipRecord.contact_name })
    : preferredSlug(resolved.relationshipRecord);
  const baseSlug = existing?.public_slug || requestedSlug || preferred;
  const now = new Date().toISOString();

  if (existing?.id) {
    await assertPublicSlugAvailable(context, cleanText(existing.public_slug), { publicationId: existing.id, relationship });
    const rows = await patchRows(context, "public_preview_publications", `id=eq.${encodeURIComponent(existing.id)}`, {
      preview_version_id: previewVersionId,
      enabled: true,
      published_at: now,
      revoked_at: null,
      updated_at: now,
    });
    const updated = rows[0] || { ...existing, preview_version_id: previewVersionId, enabled: true, published_at: now, revoked_at: null, updated_at: now };
    return jsonResponse(200, {
      success: true,
      alreadyPublished: cleanText(existing.preview_version_id) === previewVersionId && existing.enabled === true,
      relationshipType: relationship.type,
      relationshipId: relationship.id,
      leadId: relationship.type === "lead" ? relationship.id : "",
      customerId: relationship.type === "customer" ? relationship.id : "",
      publishedPreviewVersionId: previewVersionId,
      previewVersion: sanitizeAdminVersion(resolved.version),
      ...publicPublicationDetails(updated),
    });
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const slug = attempt ? candidateSlug(baseSlug, attempt) : baseSlug;
    try {
      await assertPublicSlugAvailable(context, slug, { relationship });
      const rows = await insertRows(context, "public_preview_publications", {
        relationship_type: relationship.type,
        relationship_id: relationship.id,
        public_slug: slug,
        preview_version_id: previewVersionId,
        enabled: true,
        published_at: now,
        revoked_at: null,
        created_at: now,
        updated_at: now,
        created_by: uuidOrEmpty(context.admin.profileId) || null,
      });
      const created = rows[0];
      if (!created?.id) throw previewError("PUBLIC_PREVIEW_NOT_PERSISTED", "De publieke preview kon niet worden opgeslagen.", 500);
      return jsonResponse(200, {
        success: true,
        relationshipType: relationship.type,
        relationshipId: relationship.id,
        leadId: relationship.type === "lead" ? relationship.id : "",
        customerId: relationship.type === "customer" ? relationship.id : "",
        publishedPreviewVersionId: previewVersionId,
        previewVersion: sanitizeAdminVersion(resolved.version),
        ...publicPublicationDetails(created),
      });
    } catch (error) {
      if (!["PUBLIC_PREVIEW_SLUG_TAKEN", "23505"].includes(error.code)) throw error;
    }
  }
  throw previewError("PUBLIC_PREVIEW_SLUG_UNAVAILABLE", "Er kon geen unieke publieke previewnaam worden gereserveerd.", 409);
}

async function transferPublicPreviewPublication(context, input = {}) {
  const leadId = uuidOrEmpty(input.leadId || input.lead_id);
  const customerId = uuidOrEmpty(input.customerId || input.customer_id);
  if (!leadId || !customerId) throw previewError("PREVIEW_RELATIONSHIP_REQUIRED", "Lead en klant zijn vereist voor overdracht.", 400);
  const lead = await readRelationshipRecord(context, { type: "lead", id: leadId });
  const customer = await readRelationshipRecord(context, { type: "customer", id: customerId });
  if (!lead?.id || !customer?.id) throw previewError("PREVIEW_RELATIONSHIP_MISMATCH", "Lead of klant kon niet worden gevalideerd.", 404);
  if (![lead.customer_id, lead.converted_customer_id].map(uuidOrEmpty).filter(Boolean).includes(customerId)) {
    throw previewError("PREVIEW_TRANSFER_MISMATCH", "Deze lead is niet via de bestaande flow aan deze klant gekoppeld.", 409);
  }
  const source = await readPublicPublication(context, { type: "lead", id: leadId });
  if (!source?.id) throw previewError("PREVIEW_POINTER_NOT_FOUND", "Deze lead heeft geen publieke preview om over te dragen.", 404);
  const target = await readPublicPublication(context, { type: "customer", id: customerId });
  if (target?.id && target.id !== source.id && target.enabled === true) {
    throw previewError("PREVIEW_TRANSFER_CONFLICT", "Deze klant heeft al een actieve publieke preview.", 409);
  }
  await validatePublicPreviewOwnership(context, { type: "lead", id: leadId }, source.preview_version_id, { relationshipRecord: lead });
  const now = new Date().toISOString();
  const rows = await patchRows(context, "public_preview_publications", `id=eq.${encodeURIComponent(source.id)}`, {
    relationship_type: "customer",
    relationship_id: customerId,
    updated_at: now,
  });
  return rows[0] || { ...source, relationship_type: "customer", relationship_id: customerId, updated_at: now };
}

function publicPublicationDetails(publication = {}) {
  const slug = isValidPublicSlug(publication.public_slug) ? publication.public_slug : "";
  const enabled = Boolean(slug && publication.enabled === true && !publication.revoked_at);
  const fallbackUrl = slug ? fallbackPreviewUrl(slug) : "";
  const brandedUrl = slug ? publicPreviewUrl(slug) : "";
  const configuredBaseUrl = cleanText(process.env.PUBLIC_PREVIEW_BASE_URL);
  return {
    relationshipType: cleanText(publication.relationship_type),
    relationshipId: cleanText(publication.relationship_id),
    publicPreviewSlug: slug,
    publicPreviewEnabled: enabled,
    publicPreviewUrl: enabled ? (configuredBaseUrl ? publicPreviewUrl(slug, configuredBaseUrl) : fallbackUrl) : "",
    brandedPublicPreviewUrl: enabled ? brandedUrl : "",
    fallbackPublicPreviewUrl: enabled ? fallbackUrl : "",
    publicPreviewRevokedAt: cleanText(publication.revoked_at),
    publicPreviewUpdatedAt: cleanText(publication.updated_at),
  };
}

async function publishActiveCustomerPreview(context, payload = {}) {
  const customerId = uuidOrEmpty(payload.customerId || payload.customer_id);
  const projectId = uuidOrEmpty(payload.projectId || payload.project_id);
  const websiteId = uuidOrEmpty(payload.websiteId || payload.website_id);
  const demoJourneyId = uuidOrEmpty(payload.demoJourneyId || payload.demo_journey_id);
  const previewVersionId = uuidOrEmpty(payload.previewVersionId || payload.preview_version_id);
  const previewSource = normalizePreviewSource(payload.previewSource || payload.preview_source);
  if (!customerId) throw previewError("PREVIEW_CUSTOMER_REQUIRED", "Selecteer eerst een geldige klant.", 400);
  if (!previewSource) throw previewError("PREVIEW_SOURCE_INVALID", "Selecteer eerst een geldige previewbron.", 400);
  if (!websiteId && previewSource !== PREVIEW_SOURCES.MANUAL) throw previewError("PREVIEW_WEBSITE_MISMATCH", "Selecteer eerst een website voor deze klant.", 400);

  const website = websiteId ? await readSingle(context, "websites", `select=${websiteFields}&id=eq.${websiteId}&limit=1`) : null;
  if (websiteId && (!website?.id || cleanText(website.customer_id) !== customerId)) throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de actieve klant.", 409);
  const journey = demoJourneyId ? await readSingle(context, "demo_journeys", `select=${demoJourneyFields}&id=eq.${demoJourneyId}&limit=1`) : null;
  if (demoJourneyId && !journey?.id) throw previewError("PREVIEW_NOT_FOUND", "Selecteer eerst een geldige preview.", 404);
  if (journey?.customer_id && cleanText(journey.customer_id) !== customerId) throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de actieve klant.", 409);

  const versions = website?.id
    ? await findPreviewVersionsForWebsite(context, { website, selectedCustomerId: customerId, selectedProjectId: projectId })
    : await readRows(context, "website_preview_versions", `select=${previewVersionFields}&customer_id=eq.${customerId}&order=version.desc`);
  const selectedVersion = previewVersionId ? versions.find((item) => cleanText(item.id) === previewVersionId) : versions[0] || null;
  if (!selectedVersion?.id) throw previewError("PREVIEW_NOT_FOUND", "Geen previewversie gevonden om te publiceren.", 404);
  const ownership = previewSource === PREVIEW_SOURCES.MANUAL
    ? await resolveStandaloneManualOwnership(context, selectedVersion, customerId, projectId)
    : await resolveOwnership(context, selectedVersion, { website, selectedCustomerId: customerId, selectedProjectId: projectId });
  if (!ownership.customer?.id || cleanText(ownership.customer.id) !== customerId) throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de actieve klant.", 409);

  const journeyPackage = journey?.preview_package && typeof journey.preview_package === "object" ? journey.preview_package : {};
  const directManualPackage = previewSource === PREVIEW_SOURCES.MANUAL && normalizePreviewSource(selectedVersion.metadata?.previewSource) === PREVIEW_SOURCES.MANUAL
    ? selectedVersion.generated_package : null;
  const resolved = resolveActiveDemoPreview(journeyPackage, previewSource);
  const selectedPackage = directManualPackage || (previewSource === PREVIEW_SOURCES.MANUAL ? resolved.previewPackage : selectedVersion.generated_package);
  if (!directManualPackage && !resolved.available && previewSource === PREVIEW_SOURCES.MANUAL) throw previewError("PREVIEW_SOURCE_UNAVAILABLE", "De geselecteerde previewbron is momenteel niet beschikbaar.", 409);
  if (!selectedPackage?.files?.length) throw previewError("PREVIEW_NOT_FOUND", "De geselecteerde preview kan niet worden geladen.", 409);
  const fingerprint = previewFingerprint({ demoJourneyId, previewSource, previewPackage: selectedPackage });
  let target = previewSource === PREVIEW_SOURCES.MANUAL ? selectedVersion : versions.find((item) => cleanText(item.metadata?.customerPreviewFingerprint) === fingerprint) || null;
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
      title: cleanText(payload.title) || `${journey?.business_name || website.name || "Website"} — klantpreview`,
      customer_summary: cleanText(payload.summary || payload.customerSummary) || "Een nieuwe websiteversie staat klaar voor beoordeling.",
      change_summary: cleanText(payload.changeSummary) || (previewSource === PREVIEW_SOURCES.MANUAL ? "Handmatige ZIP-preview gepubliceerd." : "Website Factory-preview gepubliceerd."),
      preview_url: cleanText(journey?.preview_url || selectedVersion.preview_url),
      preview_token: cleanText(journey?.preview_token || selectedVersion.preview_token),
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
    websiteId: previewSource === PREVIEW_SOURCES.MANUAL ? "" : websiteId,
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
  if (!body.alreadyPublished) await safeTimeline({
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
  const requestedSource = normalizePreviewSource(payload.previewSource || payload.preview_source);
  if (!websiteId && requestedSource !== PREVIEW_SOURCES.MANUAL) throw previewError("PREVIEW_WEBSITE_MISMATCH", "Websitecontext ontbreekt.", 400);

  const selectedWebsite = websiteId ? await readSingle(context, "websites", `select=${websiteFields}&id=eq.${websiteId}&limit=1`) : null;
  if (websiteId && !selectedWebsite?.id) throw previewError("PREVIEW_WEBSITE_MISMATCH", "Website niet gevonden.", 404);
  if (selectedWebsite?.id && selectedCustomerId && selectedCustomerId !== cleanText(selectedWebsite.customer_id)) {
    return jsonResponse(409, { success: false, code: "PREVIEW_CUSTOMER_MISMATCH", error: "Deze website hoort niet bij de geselecteerde klant." });
  }

  const version = previewVersionId
    ? await readSingle(context, "website_preview_versions", `select=${previewVersionFields}&id=eq.${previewVersionId}&limit=1`)
    : selectedWebsite?.id ? (await findPreviewVersionsForWebsite(context, { website: selectedWebsite, selectedCustomerId, selectedProjectId }))[0] || null : null;
  if (!version?.id) throw previewError("PREVIEW_NOT_FOUND", "Geen bestaande previewversie gevonden om te publiceren.", 404);
  const storedSource = normalizePreviewSource(version.metadata?.previewSource || version.generated_package?.meta?.previewSource) || PREVIEW_SOURCES.FACTORY;
  if (requestedSource && requestedSource !== storedSource) {
    throw previewError("PREVIEW_SOURCE_MISMATCH", "De geselecteerde previewbron komt niet overeen met de opgeslagen previewversie.", 409);
  }
  if (storedSource === PREVIEW_SOURCES.MANUAL && !isAllowedManualPreviewUrl(version.preview_url, version.id, version.preview_token)) {
    throw previewError("PREVIEW_URL_INVALID", "De opgeslagen ZIP-preview heeft geen toegestane publieke previewroute.", 409);
  }

  const ownership = selectedWebsite?.id
    ? await resolveOwnership(context, version, { website: selectedWebsite, selectedCustomerId, selectedProjectId })
    : await resolveStandaloneManualOwnership(context, version, selectedCustomerId, selectedProjectId);
  if (!ownership.customer?.id || (!ownership.website?.id && requestedSource !== PREVIEW_SOURCES.MANUAL)) {
    throw previewError("PREVIEW_OWNERSHIP_UNRESOLVED", "Deze preview kan nog niet veilig aan deze klant worden gekoppeld.", 409);
  }

  assertNoRelationConflict(version, ownership);
  if (version.published_to_portal === true && cleanText(ownership.customer.metadata?.publishedPreviewVersionId) === version.id) {
    const sharedCustomer = await persistPublicPreviewPointer(context, ownership.customer, version.id, new Date().toISOString());
    return jsonResponse(200, {
      success: true,
      alreadyPublished: true,
      publishedPreviewVersionId: version.id,
      previewVersion: sanitizeAdminVersion(version),
      website: ownership.website ? sanitizeWebsite(ownership.website) : null,
      ...publicPreviewDetails(sharedCustomer),
    });
  }

  const now = new Date().toISOString();
  const safePreviewPath = `/preview.html?version=${encodeURIComponent(version.id)}`;
  const patch = {
    customer_id: ownership.customer.id,
    project_id: ownership.project?.id || version.project_id || null,
    website_id: ownership.website?.id || version.website_id || null,
    title: cleanText(payload.title).slice(0, 140) || version.title || "Website-preview",
    customer_summary: cleanText(payload.summary || payload.customerSummary || payload.customer_summary).slice(0, 500) || null,
    change_summary: cleanText(payload.changeSummary || payload.change_summary).slice(0, 1200) || null,
    review_deadline: parseDateOrNull(payload.reviewDeadline || payload.review_deadline),
    allow_feedback: payload.allowFeedback !== false && payload.allow_feedback !== false,
    allow_approval: payload.allowApproval !== false && payload.allow_approval !== false,
    notify_customer: Boolean(payload.notifyCustomer || payload.notify_customer),
    published_to_portal: true,
    published_at: now,
    published_by: context.admin.profileId || null,
    safe_preview_path: safePreviewPath,
    status: version.approved_at ? "approved" : "ready_for_review",
    metadata: {
      ...(isObject(version.metadata) ? version.metadata : {}),
      ...(requestedSource ? { previewSource: requestedSource } : {}),
      ...(cleanText(payload.customerPreviewFingerprint) ? { customerPreviewFingerprint: cleanText(payload.customerPreviewFingerprint) } : {}),
      publishDedupeKey: `preview_publish:${version.id}`,
      lastPublishedAt: now,
      notificationRequested: Boolean(payload.notifyCustomer || payload.notify_customer),
    },
    updated_at: now,
  };

  const rows = await patchRows(context, "website_preview_versions", `id=eq.${version.id}`, patch);
  const published = rows[0] || { ...version, ...patch };
  const pointerCustomer = await persistPublicPreviewPointer(context, ownership.customer, version.id, now);
  if (cleanText(pointerCustomer?.metadata?.publishedPreviewVersionId) !== version.id) {
    throw previewError("PREVIEW_POINTER_NOT_PERSISTED", "De klantpreview kon niet als huidige versie worden vastgelegd.", 500);
  }
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
      websiteId: ownership.website?.id || "",
      projectId: ownership.project?.id || "",
      version: published.version,
      publishedPreviewVersionId: version.id,
    },
  });

  return jsonResponse(200, {
    success: true,
    publishedPreviewVersionId: version.id,
    previewVersion: sanitizeAdminVersion(published),
    website: ownership.website ? sanitizeWebsite(ownership.website) : null,
    ...publicPreviewDetails(pointerCustomer),
  });
}

async function persistPublicPreviewPointer(context, customer = {}, versionId = "", now = new Date().toISOString()) {
  const customerId = uuidOrEmpty(customer.id);
  const publishedVersionId = uuidOrEmpty(versionId);
  if (!customerId || !publishedVersionId) throw previewError("PREVIEW_POINTER_NOT_PERSISTED", "De publieke preview kon niet veilig worden gekoppeld.", 500);
  const existingSlug = cleanText(customer.public_preview_slug);
  const base = isValidPublicSlug(existingSlug) ? existingSlug : preferredSlug(customer);
  const customerMetadata = isObject(customer.metadata) ? customer.metadata : {};

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const slug = existingSlug && isValidPublicSlug(existingSlug) ? existingSlug : candidateSlug(base, attempt);
    const collision = await readSingle(context, "customers", `select=id&public_preview_slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (collision?.id && cleanText(collision.id) !== customerId) continue;
    const record = {
      metadata: {
        ...customerMetadata,
        publishedPreviewVersionId: publishedVersionId,
        publishedPreviewUpdatedAt: now,
      },
      public_preview_slug: slug,
      public_preview_enabled: true,
      public_preview_created_at: customer.public_preview_created_at || now,
      public_preview_updated_at: now,
      public_preview_revoked_at: null,
      updated_at: now,
    };
    try {
      const rows = await patchRows(context, "customers", `id=eq.${customerId}`, record);
      return rows[0] || { ...customer, ...record };
    } catch (error) {
      if (error.code !== "23505" || existingSlug) throw error;
    }
  }
  throw previewError("PUBLIC_PREVIEW_SLUG_UNAVAILABLE", "Er kon geen unieke publieke previewnaam worden gereserveerd.", 409);
}

function publicPreviewDetails(customer = {}) {
  const slug = isValidPublicSlug(customer.public_preview_slug) ? customer.public_preview_slug : "";
  const enabled = Boolean(slug && customer.public_preview_enabled === true && !customer.public_preview_revoked_at);
  const fallbackUrl = slug ? fallbackPreviewUrl(slug) : "";
  const brandedUrl = slug ? publicPreviewUrl(slug) : "";
  const configuredBaseUrl = cleanText(process.env.PUBLIC_PREVIEW_BASE_URL);
  return {
    publicPreviewSlug: slug,
    publicPreviewEnabled: enabled,
    publicPreviewUrl: enabled ? (configuredBaseUrl ? publicPreviewUrl(slug, configuredBaseUrl) : fallbackUrl) : "",
    brandedPublicPreviewUrl: enabled ? brandedUrl : "",
    fallbackPublicPreviewUrl: enabled ? fallbackUrl : "",
    publicPreviewRevokedAt: cleanText(customer.public_preview_revoked_at),
    publicPreviewUpdatedAt: cleanText(customer.public_preview_updated_at),
  };
}

async function resolveStandaloneManualOwnership(context, version = {}, selectedCustomerId = "", selectedProjectId = "") {
  const source = normalizePreviewSource(version.metadata?.previewSource || version.generated_package?.meta?.previewSource);
  const customerId = uuidOrEmpty(selectedCustomerId);
  if (source !== PREVIEW_SOURCES.MANUAL || !customerId || cleanText(version.customer_id) !== customerId || !Array.isArray(version.generated_package?.files) || !version.generated_package.files.length) {
    throw previewError("PREVIEW_OWNERSHIP_UNRESOLVED", "Deze preview kan nog niet veilig aan deze klant worden gekoppeld.", 409);
  }
  const customer = await readSingle(context, "customers", `select=${customerFields}&id=eq.${encodeURIComponent(customerId)}&limit=1`);
  if (!customer?.id) throw previewError("PREVIEW_CUSTOMER_MISMATCH", "Deze preview hoort niet bij de actieve klant.", 409);
  const projectId = uuidOrEmpty(selectedProjectId || version.project_id);
  const project = projectId ? await readSingle(context, "projects", `select=${projectFields}&id=eq.${encodeURIComponent(projectId)}&limit=1`) : null;
  if (project?.id && cleanText(project.customer_id) !== customerId) throw previewError("PREVIEW_PROJECT_MISMATCH", "Deze preview hoort niet bij het geselecteerde project.", 409);
  return { resolvable: true, customer, project, website: null, source: "manual_customer_id" };
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

function isAllowedManualPreviewUrl(value = "", previewVersionId = "", expectedPreviewToken = "") {
  const rawUrl = cleanText(value);
  const versionId = uuidOrEmpty(previewVersionId);
  if (!rawUrl || !versionId || /^(javascript|data|blob):/i.test(rawUrl)) return false;
  let url;
  try {
    url = new URL(rawUrl, "https://maxwebstudio.nl");
  } catch {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (hostname !== "maxwebstudio.nl" && !hostname.endsWith(".maxwebstudio.nl"))) return false;
  const previewToken = cleanText(url.searchParams.get("token"));
  return url.pathname === "/.netlify/functions/manual-preview-render"
    && cleanText(url.searchParams.get("version")) === versionId
    && Boolean(previewToken)
    && (!cleanText(expectedPreviewToken) || previewToken === cleanText(expectedPreviewToken));
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isMissingPreviewSchema(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return text.includes("website_preview_versions") || text.includes("public_preview_publications") || text.includes("schema cache") || text.includes("pgrst205");
}

function isMissingPublicPublicationSchema(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.code === "42P01" || error.code === "PGRST205" || text.includes("public_preview_publications");
}

function isMissingColumnError(error = {}) {
  const text = [error.message, error.details, error.code].map((value) => cleanText(value).toLowerCase()).join(" ");
  return error.code === "42703" || error.code === "PGRST204" || text.includes("column") || text.includes("schema cache");
}

function safeError(error = {}) {
  if (error.publicMessage) return error.publicMessage;
  return isMissingPreviewSchema(error)
    ? "Previewpublicatie-tabellen ontbreken nog. Voer de vereiste previewmigraties gecontroleerd uit."
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
  persistPublicPreviewPointer,
  previewFingerprint,
  publicPublicationDetails,
  publicPreviewDetails,
  publishPublicPreview,
  publishActiveCustomerPreview,
  publishPreviewVersion,
  readPublicPublication,
  revokePublicPreview,
  resolveOwnership,
  sanitizeAdminVersion,
  setPublicPreviewSlug,
  transferPublicPreviewPublication,
  validatePublicPreviewOwnership,
  isAllowedManualPreviewUrl,
};
