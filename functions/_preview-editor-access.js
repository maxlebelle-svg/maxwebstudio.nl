const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolvePreviewScope(context, input = {}, options = {}) {
  if (typeof context?.readOne !== "function") throw accessError("PREVIEW_EDITOR_UNAVAILABLE", "De preview-editor is nog niet geconfigureerd.", 500, "configure_editor");
  const previewVersionId = uuid(input.previewVersionId || input.preview_version_id);
  const sectionId = text(options.sectionId || input.sectionId || input.section_id);
  if (!previewVersionId) throw accessError("PREVIEW_VERSION_REQUIRED", "Selecteer eerst een geldige previewversie.", 400, "validate_preview_version");
  const version = await context.readOne("website_preview_versions", `select=*&id=eq.${encodeURIComponent(previewVersionId)}&limit=1`);
  if (!version?.id) throw withContext(accessError("PREVIEW_VERSION_NOT_FOUND", "De previewversie kon niet worden gevonden.", 404, "resolve_preview_version"), previewVersionId, sectionId);
  if (text(version.metadata?.previewSource) !== "website_factory" || !Array.isArray(version.generated_package?.files)) {
    throw withContext(accessError("SECTION_WRITE_UNAVAILABLE", "Alleen nieuwe Website Factory-previews kunnen worden bewerkt.", 409, "validate_preview_source"), previewVersionId, sectionId);
  }
  const journey = await context.readOne("demo_journeys", `select=*&id=eq.${encodeURIComponent(version.demo_journey_id)}&limit=1`);
  if (!journey?.id) throw withContext(accessError("PREVIEW_SCOPE_INVALID", "De preview hoort niet bij een geldige klantreis.", 409, "resolve_journey"), previewVersionId, sectionId);
  assertRequestedScope(version, journey, input);
  await assertStoredRelations(context, version, journey);
  return { version, journey, relationship: relationshipFor(version, journey) };
}

function assertRequestedScope(version, journey, input = {}) {
  for (const [key, column] of [["customerId", "customer_id"], ["projectId", "project_id"], ["websiteId", "website_id"], ["demoJourneyId", "demo_journey_id"]]) {
    const stored = text(version[column] || (column === "customer_id" ? journey.customer_id : ""));
    const requested = uuid(input[key] || input[key.replace(/([A-Z])/g, "_$1").toLowerCase()]);
    if (stored && (!requested || requested !== stored)) throw accessError("PREVIEW_SCOPE_MISMATCH", "Deze preview hoort niet bij de actieve klantcontext.", 409, "validate_scope");
    if (!stored && requested && key !== "demoJourneyId") throw accessError("PREVIEW_SCOPE_MISMATCH", "Deze preview heeft geen overeenkomstige relatiecontext.", 409, "validate_scope");
  }
}

async function assertStoredRelations(context, version, journey) {
  if (version.customer_id && journey.customer_id && text(version.customer_id) !== text(journey.customer_id)) throw accessError("PREVIEW_SCOPE_MISMATCH", "De klantcontext van deze preview is inconsistent.", 409, "validate_relations");
  const customer = version.customer_id ? await context.readOne("customers", `select=id&id=eq.${encodeURIComponent(version.customer_id)}&limit=1`) : null;
  if (version.customer_id && !customer?.id) throw accessError("PREVIEW_SCOPE_MISMATCH", "De gekoppelde klant bestaat niet meer.", 409, "validate_relations");
  const website = version.website_id ? await context.readOne("websites", `select=id,customer_id&id=eq.${encodeURIComponent(version.website_id)}&limit=1`) : null;
  if (version.website_id && (!website?.id || text(website.customer_id) !== text(version.customer_id))) throw accessError("PREVIEW_SCOPE_MISMATCH", "De website hoort niet bij deze klant.", 409, "validate_relations");
  const project = version.project_id ? await context.readOne("projects", `select=id,customer_id,website_id&id=eq.${encodeURIComponent(version.project_id)}&limit=1`) : null;
  if (version.project_id && (!project?.id || text(project.customer_id) !== text(version.customer_id) || (version.website_id && project.website_id && text(project.website_id) !== text(version.website_id)))) {
    throw accessError("PREVIEW_SCOPE_MISMATCH", "Het project hoort niet bij deze previewcontext.", 409, "validate_relations");
  }
}

function relationshipFor(version, journey) {
  if (version.customer_id || journey.customer_id) return { type: "customer", id: text(version.customer_id || journey.customer_id) };
  if (journey.lead_id) return { type: "lead", id: text(journey.lead_id) };
  throw accessError("PREVIEW_SCOPE_INVALID", "De preview heeft geen geldige klant- of leadcontext.", 409, "resolve_relationship");
}

function accessError(code, message, status = 400, phase = "preview_editor") { return Object.assign(new Error(message), { code, status, phase }); }
function withContext(error, previewVersionId, sectionId) { error.previewVersionId = previewVersionId; error.sectionId = sectionId; return error; }
function uuid(value) { const clean = text(value); return UUID.test(clean) ? clean : ""; }
function text(value) { return String(value || "").trim(); }

module.exports = { UUID, accessError, assertRequestedScope, assertStoredRelations, relationshipFor, resolvePreviewScope };
