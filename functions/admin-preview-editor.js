const { createHash, randomBytes, randomUUID } = require("crypto");
const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { extractHeroContext, patchFingerprint, patchHeroPackage } = require("./_preview-editor-hero");

const roles = ["super_admin", "admin", "sales_manager"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,160}$/;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  const requestId = text(event.headers?.["x-nf-request-id"] || event.headers?.["X-Nf-Request-Id"] || randomUUID());
  const adminCheck = await verifyAdmin(event, json, {
    module: "preview_editor",
    action: event.httpMethod === "GET" ? "read_hero" : "save_hero",
    allowedRoles: roles,
    allowedStatuses: ["active"],
  });
  if (!adminCheck.success) return adminCheck.response;
  const context = getContext(adminCheck.admin, requestId);
  if (!context.available) return fail(500, "PREVIEW_EDITOR_UNAVAILABLE", "De preview-editor is nog niet geconfigureerd.", "configure_editor", requestId);

  try {
    if (event.httpMethod === "GET") return await readHeroResponse(context, event.queryStringParameters || {});
    if (event.httpMethod === "POST") return await saveHeroResponse(context, parsePayload(event.body));
    return fail(405, "METHOD_NOT_ALLOWED", "Methode niet toegestaan.", "route_request", requestId);
  } catch (error) {
    console.error("Admin preview editor failed", {
      action: event.httpMethod === "GET" ? "read_hero" : "save_hero",
      phase: error.phase || "preview_editor",
      requestId,
      previewVersion: error.previewVersionId || "",
      sectionId: error.sectionId || "",
      actorUserId: context.admin.id || "",
      code: error.code || "PREVIEW_EDITOR_FAILED",
      errorName: error.name || "Error",
      errorMessage: error.message || "Unknown preview editor error",
      databaseCode: error.databaseCode || "",
      databaseMessage: error.databaseMessage || "",
      details: error.details || "",
      hint: error.hint || "",
    });
    return fail(error.status || 500, error.code || "PREVIEW_EDITOR_FAILED", safeMessage(error), error.phase || "preview_editor", requestId);
  }
};

async function readHeroResponse(context, params = {}) {
  const source = await resolveSourceContext(context, params);
  const hero = await extractHeroContext(source.version.generated_package);
  return json(200, {
    success: true,
    requestId: context.requestId,
    hero: sanitizeHero(hero, source.version),
    previewVersion: sanitizeVersion(source.version),
  });
}

async function saveHeroResponse(context, payload = {}) {
  if (text(payload.action || "save_hero_preview") !== "save_hero_preview") throw editorError("ACTION_INVALID", "Onbekende preview-editoractie.", 400, "route_action");
  const source = await resolveSourceContext(context, payload);
  const sourceId = source.version.id;
  const sectionId = text(payload.sectionId || payload.section_id);
  if (sectionId !== "home.hero" || text(payload.sectionType || payload.section_type || "hero") !== "hero") {
    throw withContext(editorError("HERO_SECTION_INVALID", "Alleen de gemarkeerde Hero-sectie kan in deze sprint worden bewerkt.", 400, "validate_section"), sourceId, sectionId);
  }
  const idempotencyKey = text(payload.idempotencyKey || payload.idempotency_key);
  if (!idempotencyPattern.test(idempotencyKey)) throw withContext(editorError("IDEMPOTENCY_KEY_INVALID", "De opslagreferentie is ongeldig.", 400, "validate_idempotency"), sourceId, sectionId);
  const patch = payload.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw withContext(editorError("HERO_PATCH_INVALID", "De Hero-wijziging is ongeldig.", 400, "validate_patch"), sourceId, sectionId);
  if (Object.values(patch).some((value) => typeof value !== "string")) throw withContext(editorError("HERO_PATCH_INVALID", "De Hero-wijziging mag uitsluitend tekstvelden bevatten.", 400, "validate_patch"), sourceId, sectionId);

  const patchHash = patchFingerprint(patch);
  const targetId = deterministicVersionId(context.admin.id, sourceId, idempotencyKey);
  const existing = await readVersion(context, targetId);
  if (existing?.id) return recoverExistingEdit(context, { existing, source, patchHash, idempotencyKey, sectionId });

  const active = await readActiveVersion(context, source.version.demo_journey_id);
  if (!active?.id || active.id !== sourceId) {
    throw withContext(editorError("EDIT_CONFLICT", "Deze preview is ondertussen gewijzigd. Laad de nieuwste versie voordat je opnieuw opslaat.", 409, "validate_active_source"), sourceId, sectionId);
  }

  const patched = await patchHeroPackage(source.version.generated_package, patch, text(payload.baseContentHash || payload.base_content_hash));
  const versionNumber = Number(source.version.version || 0) + 1;
  patched.generatedPackage.version = versionNumber;
  patched.generatedPackage.meta = { ...(patched.generatedPackage.meta || {}), version: versionNumber };
  const previewToken = randomBytes(18).toString("hex");
  const previewUrl = `/.netlify/functions/demo-preview?id=${encodeURIComponent(source.version.demo_journey_id)}&token=${encodeURIComponent(previewToken)}&previewVersionId=${encodeURIComponent(targetId)}`;
  const now = new Date().toISOString();
  const metadata = lineageMetadata(source.version.metadata, {
    parentPreviewVersionId: sourceId,
    sourceBuildJobId: source.version.build_job_id,
    baseContentHash: patched.source.contentHash,
    contentHash: patched.contentHash,
    patchHash,
    idempotencyKey,
    actorId: context.admin.id,
    createdAt: now,
  });
  const record = {
    id: targetId,
    demo_journey_id: source.version.demo_journey_id,
    build_job_id: null,
    customer_id: source.version.customer_id || null,
    project_id: source.version.project_id || null,
    website_id: source.version.website_id || null,
    version: versionNumber,
    title: `${text(source.version.title || "Website-preview").slice(0, 105)} — Hero-concept`,
    customer_summary: null,
    change_summary: "Interne Hero-wijziging; nog niet gepubliceerd.",
    preview_url: previewUrl,
    preview_token: previewToken,
    preview_score: source.version.preview_score ?? null,
    quality_report: source.version.quality_report || {},
    generated_package: patched.generatedPackage,
    is_active: true,
    published_to_portal: false,
    published_at: null,
    published_by: null,
    allow_feedback: true,
    allow_approval: true,
    notify_customer: false,
    status: "internal",
    feedback_items: [],
    approved_at: null,
    approved_by_auth_user_id: null,
    approval_metadata: {},
    metadata,
    created_by: context.admin.id,
    created_at: now,
    updated_at: now,
  };
  let inserted;
  try {
    inserted = (await insertRows(context, "website_preview_versions", record))[0] || record;
  } catch (error) {
    const recovered = await readVersion(context, targetId).catch(() => null);
    if (recovered?.id) return recoverExistingEdit(context, { existing: recovered, source, patchHash, idempotencyKey, sectionId });
    if (isUniqueViolation(error)) throw withContext(editorError("EDIT_CONFLICT", "Deze preview is ondertussen gewijzigd. Laad de nieuwste versie voordat je opnieuw opslaat.", 409, "insert_preview_version"), sourceId, sectionId);
    throw error;
  }
  await activateVersion(context, inserted);
  const hero = await extractHeroContext(inserted.generated_package || record.generated_package);
  return json(201, successBody(context, inserted, hero, false));
}

async function recoverExistingEdit(context, { existing, source, patchHash, idempotencyKey, sectionId }) {
  const metadata = existing.metadata || {};
  if (text(metadata.parentPreviewVersionId) !== source.version.id || text(metadata.editIdempotencyKey) !== idempotencyKey || text(metadata.editPatchHash) !== patchHash) {
    throw withContext(editorError("IDEMPOTENCY_KEY_REUSED", "Deze opslagreferentie is al voor andere wijzigingen gebruikt.", 409, "validate_idempotency_reuse"), source.version.id, sectionId);
  }
  await activateVersion(context, existing);
  const hero = await extractHeroContext(existing.generated_package);
  return json(200, successBody(context, existing, hero, true));
}

async function activateVersion(context, version) {
  await patchRows(context, "website_preview_versions", `demo_journey_id=eq.${encodeURIComponent(version.demo_journey_id)}&id=neq.${encodeURIComponent(version.id)}&is_active=eq.true`, {
    is_active: false,
    updated_at: new Date().toISOString(),
  });
  const rows = await patchRows(context, "website_preview_versions", `id=eq.${encodeURIComponent(version.id)}`, { is_active: true, updated_at: new Date().toISOString() });
  return rows[0] || { ...version, is_active: true };
}

async function resolveSourceContext(context, input = {}) {
  const previewVersionId = uuid(input.previewVersionId || input.preview_version_id);
  if (!previewVersionId) throw editorError("PREVIEW_VERSION_REQUIRED", "Selecteer eerst een geldige previewversie.", 400, "validate_preview_version");
  const version = await readVersion(context, previewVersionId);
  if (!version?.id) throw withContext(editorError("PREVIEW_VERSION_NOT_FOUND", "De previewversie kon niet worden gevonden.", 404, "resolve_preview_version"), previewVersionId, "home.hero");
  if (text(version.metadata?.previewSource) !== "website_factory" || !Array.isArray(version.generated_package?.files)) {
    throw withContext(editorError("HERO_WRITE_UNAVAILABLE", "Alleen nieuwe Website Factory-previews kunnen worden bewerkt.", 409, "validate_preview_source"), previewVersionId, "home.hero");
  }
  const journey = await readOne(context, "demo_journeys", `select=*&id=eq.${encodeURIComponent(version.demo_journey_id)}&limit=1`);
  if (!journey?.id) throw withContext(editorError("PREVIEW_SCOPE_INVALID", "De preview hoort niet bij een geldige klantreis.", 409, "resolve_journey"), previewVersionId, "home.hero");
  assertRequestedScope(version, journey, input);
  await assertStoredRelations(context, version, journey);
  return { version, journey };
}

function assertRequestedScope(version, journey, input = {}) {
  for (const [key, column] of [["customerId", "customer_id"], ["projectId", "project_id"], ["websiteId", "website_id"], ["demoJourneyId", "demo_journey_id"]]) {
    const stored = text(version[column] || (column === "customer_id" ? journey.customer_id : ""));
    const requested = uuid(input[key] || input[key.replace(/([A-Z])/g, "_$1").toLowerCase()]);
    if (stored && (!requested || requested !== stored)) throw editorError("PREVIEW_SCOPE_MISMATCH", "Deze preview hoort niet bij de actieve klantcontext.", 409, "validate_scope");
    if (!stored && requested && key !== "demoJourneyId") throw editorError("PREVIEW_SCOPE_MISMATCH", "Deze preview heeft geen overeenkomstige relatiecontext.", 409, "validate_scope");
  }
}

async function assertStoredRelations(context, version, journey) {
  if (version.customer_id && journey.customer_id && text(version.customer_id) !== text(journey.customer_id)) throw editorError("PREVIEW_SCOPE_MISMATCH", "De klantcontext van deze preview is inconsistent.", 409, "validate_relations");
  const customer = version.customer_id ? await readOne(context, "customers", `select=id&id=eq.${encodeURIComponent(version.customer_id)}&limit=1`) : null;
  if (version.customer_id && !customer?.id) throw editorError("PREVIEW_SCOPE_MISMATCH", "De gekoppelde klant bestaat niet meer.", 409, "validate_relations");
  const website = version.website_id ? await readOne(context, "websites", `select=id,customer_id&id=eq.${encodeURIComponent(version.website_id)}&limit=1`) : null;
  if (version.website_id && (!website?.id || text(website.customer_id) !== text(version.customer_id))) throw editorError("PREVIEW_SCOPE_MISMATCH", "De website hoort niet bij deze klant.", 409, "validate_relations");
  const project = version.project_id ? await readOne(context, "projects", `select=id,customer_id,website_id&id=eq.${encodeURIComponent(version.project_id)}&limit=1`) : null;
  if (version.project_id && (!project?.id || text(project.customer_id) !== text(version.customer_id) || (version.website_id && project.website_id && text(project.website_id) !== text(version.website_id)))) {
    throw editorError("PREVIEW_SCOPE_MISMATCH", "Het project hoort niet bij deze previewcontext.", 409, "validate_relations");
  }
}

async function readVersion(context, id) {
  return readOne(context, "website_preview_versions", `select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
}

async function readActiveVersion(context, demoJourneyId) {
  return readOne(context, "website_preview_versions", `select=*&demo_journey_id=eq.${encodeURIComponent(demoJourneyId)}&is_active=eq.true&order=version.desc&limit=1`);
}

function successBody(context, version, hero, reused) {
  return {
    success: true,
    requestId: context.requestId,
    reused,
    message: "Nieuwe conceptpreview opgeslagen. De klantversie is niet gewijzigd.",
    hero: sanitizeHero(hero, version),
    previewVersion: sanitizeVersion({ ...version, is_active: true }),
  };
}

function sanitizeHero(hero, version) {
  return {
    sectionId: "home.hero",
    sectionType: "hero",
    page: hero.entryFile,
    sourcePreviewVersionId: version.id,
    sourceVersion: Number(version.version || 1),
    baseContentHash: hero.contentHash,
    values: hero.values,
    schema: hero.schema,
    image: hero.image,
  };
}

function sanitizeVersion(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: text(row.id),
    demoJourneyId: text(row.demo_journey_id),
    customerId: text(row.customer_id),
    projectId: text(row.project_id),
    websiteId: text(row.website_id),
    version: Number(row.version || 1),
    title: text(row.title),
    previewUrl: text(row.preview_url),
    previewToken: text(row.preview_token),
    status: text(row.status || "internal"),
    isActive: row.is_active !== false,
    publishedToPortal: Boolean(row.published_to_portal),
    metadata,
    entryFile: text(metadata.entryFile || row.generated_package?.entryFile || row.generated_package?.meta?.entryFile || "index.html"),
    previewStored: true,
    renderable: true,
    editorManifestAvailable: true,
    sectionMarkersAvailable: true,
    editorAvailable: true,
    availability: "editable",
    createdAt: text(row.created_at),
  };
}

function lineageMetadata(sourceMetadata = {}, values = {}) {
  const metadata = { ...(sourceMetadata && typeof sourceMetadata === "object" ? sourceMetadata : {}) };
  for (const key of ["customerPreviewFingerprint", "publishDedupeKey", "lastPublishedAt", "notificationRequested"]) delete metadata[key];
  return {
    ...metadata,
    previewSource: "website_factory",
    parentPreviewVersionId: values.parentPreviewVersionId,
    sourceBuildJobId: text(values.sourceBuildJobId),
    revisionKind: "section_edit",
    editedSectionId: "home.hero",
    editedSectionType: "hero",
    baseContentHash: values.baseContentHash,
    contentHash: values.contentHash,
    editPatchHash: values.patchHash,
    editIdempotencyKey: values.idempotencyKey,
    editorSchemaVersion: 1,
    createdBy: values.actorId,
    createdAt: values.createdAt,
    renderable: true,
    editorManifestAvailable: true,
    sectionMarkersAvailable: true,
  };
}

function deterministicVersionId(actorId, sourceId, key) {
  const hex = createHash("sha256").update(`mws-preview-edit:v1:${actorId}:${sourceId}:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function parsePayload(body) {
  try { return JSON.parse(body || "{}"); } catch { throw editorError("INVALID_JSON", "De request bevat ongeldige JSON.", 400, "parse_request"); }
}

function getContext(admin, requestId) {
  const supabaseUrl = text(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { available: Boolean(supabaseUrl && serviceRoleKey), supabaseUrl, serviceRoleKey, admin, requestId };
}

function headers(key, prefer = "return=representation") {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json", Prefer: prefer };
}

async function readOne(context, table, query) {
  const rows = await request(`${context.supabaseUrl}/rest/v1/${table}?${query}`, { headers: headers(context.serviceRoleKey) });
  return rows[0] || null;
}

async function insertRows(context, table, record) {
  return request(`${context.supabaseUrl}/rest/v1/${table}`, { method: "POST", headers: headers(context.serviceRoleKey), body: JSON.stringify(record) });
}

async function patchRows(context, table, filter, record) {
  return request(`${context.supabaseUrl}/rest/v1/${table}?${filter}`, { method: "PATCH", headers: headers(context.serviceRoleKey), body: JSON.stringify(record) });
}

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = editorError("PREVIEW_EDITOR_DATABASE_FAILED", "De previewwijziging kon niet worden opgeslagen.", response.status || 500, options.method === "POST" ? "insert_preview_version" : options.method === "PATCH" ? "activate_preview_version" : "read_preview_data");
    error.databaseCode = text(body?.code);
    error.databaseMessage = text(body?.message || body?.error);
    error.details = text(body?.details);
    error.hint = text(body?.hint);
    throw error;
  }
  return Array.isArray(body) ? body : [];
}

function isUniqueViolation(error) {
  return error?.databaseCode === "23505" || /duplicate|unique/i.test(`${error?.databaseMessage || ""} ${error?.details || ""}`);
}

function editorError(code, message, status = 400, phase = "preview_editor") {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.phase = phase;
  return error;
}

function withContext(error, previewVersionId, sectionId) {
  error.previewVersionId = previewVersionId;
  error.sectionId = sectionId;
  return error;
}

function safeMessage(error) {
  return error?.code ? error.message : "De preview-editor kon de wijziging niet verwerken.";
}

function fail(statusCode, code, message, phase, requestId) {
  return json(statusCode, { success: false, code, phase, message, requestId });
}

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", ...corsHeaders({ methods: "GET, POST, OPTIONS" }) }, body: statusCode === 204 ? "" : JSON.stringify(body) };
}

function uuid(value) {
  const clean = text(value);
  return uuidPattern.test(clean) ? clean : "";
}

function text(value = "") {
  return String(value || "").trim();
}

exports._private = {
  deterministicVersionId,
  idempotencyPattern,
  lineageMetadata,
  sanitizeHero,
};
