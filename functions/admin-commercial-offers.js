const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { buildOfferVersion, catalogRegistrationPayload } = require("./services/commercialOfferService");
const { adminCatalog } = require("./_commercial-catalog");
const { DOCUMENTS, validateReadyDocuments } = require("./services/commercialDocumentRegistry");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WRITE_ROLES = ["super_admin", "admin", "sales_manager", "sales_partner", "sales"];
const PHASE_B_TRANSITIONS = new Set(["ready_for_review", "revoked", "superseded"]);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { success: false, code: "METHOD_NOT_ALLOWED", error: "Methode niet toegestaan." });
  const auth = await verifyAdmin(event, json, {
    module: "commercial_offers",
    action: event.httpMethod === "GET" ? "read" : "write",
    allowedRoles: WRITE_ROLES,
    allowedStatuses: ["active"],
    disableLegacyToken: true,
  });
  if (!auth.success) return auth.response;

  try {
    const input = parseBody(event);
    const action = clean(input.action).toLowerCase();
    const actor = { id: auth.admin.id, profileId: auth.admin.profileId, role: auth.admin.role };
    if (!UUID.test(clean(actor.id)) || !UUID.test(clean(actor.profileId))) throw problem(403, "ACTOR_INVALID", "De actieve beheerder kon niet veilig worden vastgesteld.");
    if (event.httpMethod === "GET") {
      const config = runtimeConfig();
      if (!config.ready) throw problem(503, "OFFER_STORAGE_UNAVAILABLE", "De commerciële opslag is niet geconfigureerd.");
      return await readComposerContext(event.queryStringParameters || {}, actor, config);
    }
    if (action === "prepare_snapshot") {
      return json(200, { success: true, persisted: false, snapshot: buildOfferVersion(input, actor) });
    }
    const config = runtimeConfig();
    if (!config.ready) throw problem(503, "OFFER_STORAGE_UNAVAILABLE", "De commerciële opslag is niet geconfigureerd.");
    if (action === "create_version") return createVersion(input, actor, config);
    if (action === "transition") return transition(input, actor, config);
    throw problem(400, "ACTION_INVALID", "Kies een geldige commerciële offeractie.");
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    console.error("Commercial offer action failed", { code: error.code || "OFFER_ACTION_FAILED", status });
    return json(status, { success: false, code: error.code || "OFFER_ACTION_FAILED", error: status >= 500 ? "De offeractie kon niet veilig worden verwerkt." : error.message });
  }
};

async function createVersion(input, actor, config) {
  const relationshipType = clean(input.relationshipType).toLowerCase();
  const relationshipId = uuid(input.relationshipId, "Kies een geldige lead of klant.");
  if (!["lead", "customer"].includes(relationshipType)) throw problem(400, "RELATIONSHIP_INVALID", "Kies een geldige lead of klant.");
  const offerId = input.offerId ? uuid(input.offerId, "Het voorstel is ongeldig.") : null;
  const demoJourneyId = input.demoJourneyId ? uuid(input.demoJourneyId, "De gekoppelde demo is ongeldig.") : null;
  const factoryProjectId = input.factoryProjectId ? uuid(input.factoryProjectId, "Het Factory-dossier is ongeldig.") : null;
  const actionKey = boundedKey(input.actionKey);
  const title = clean(input.title);
  if (title.length < 2 || title.length > 180) throw problem(400, "TITLE_INVALID", "Geef het voorstel een geldige titel.");
  const documents = validateDocuments(input.documents);
  const snapshot = buildOfferVersion(input, actor);
  await assertLinkedResources({ relationshipType, relationshipId, demoJourneyId, factoryProjectId }, config);
  const catalog = catalogRegistrationPayload();
  if (["super_admin", "admin"].includes(clean(actor.role).toLowerCase().replace(/[\s-]+/g, "_"))) {
    await rpc(config, "commercial_register_catalog_version_v1", {
      input_actor_profile_id: actor.profileId,
      input_actor_auth_user_id: actor.id,
      input_catalog_key: catalog.catalog_key,
      input_version: catalog.version,
      input_checksum_sha256: catalog.checksum_sha256,
      input_catalog_snapshot: catalog.snapshot,
    });
  }
  const result = await rpc(config, "commercial_create_offer_version_v1", {
    input_actor_profile_id: actor.profileId,
    input_actor_auth_user_id: actor.id,
    input_relationship_type: relationshipType,
    input_relationship_id: relationshipId,
    input_offer_id: offerId,
    input_title: title,
    input_demo_journey_id: demoJourneyId,
    input_factory_project_id: factoryProjectId,
    input_snapshot: snapshot,
    input_lines: snapshot.lines,
    input_documents: documents,
    input_change_reason: clean(input.changeReason) || null,
    input_idempotency_key: actionKey,
  });
  return json(201, { success: true, offer: result, catalogVersion: snapshot.catalogVersion, snapshotChecksum: snapshot.checksum });
}

async function transition(input, actor, config) {
  const offerVersionId = uuid(input.offerVersionId, "De aanbodversie is ongeldig.");
  const targetStatus = clean(input.targetStatus).toLowerCase();
  if (!PHASE_B_TRANSITIONS.has(targetStatus)) throw problem(409, "PHASE_B_TRANSITION_BLOCKED", "Deze status vereist een latere, afzonderlijk gecertificeerde fase.");
  if (targetStatus === "ready_for_review") await assertReadyForReview(offerVersionId, actor, config);
  const result = await rpc(config, "commercial_transition_offer_version_v1", {
    input_actor_profile_id: actor.profileId,
    input_actor_auth_user_id: actor.id,
    input_offer_version_id: offerVersionId,
    input_target_status: targetStatus,
    input_reason: clean(input.reason) || null,
    input_idempotency_key: boundedKey(input.actionKey),
  });
  return json(200, { success: true, offer: result });
}

async function readComposerContext(query, actor, config) {
  const relationshipType = clean(query.relationshipType).toLowerCase();
  const relationshipId = uuid(query.relationshipId, "Kies een geldige lead of klant.");
  if (!["lead", "customer"].includes(relationshipType)) throw problem(400, "RELATIONSHIP_INVALID", "Kies een geldige lead of klant.");
  const relationship = await loadRelationship(relationshipType, relationshipId, config);
  assertRelationshipAccess(actor, relationshipType, relationship);
  const [demos, factoryProjects, history] = await Promise.all([
    loadDemos(relationshipType, relationshipId, config),
    rest(config, `factory_projects?select=id,relationship_type,relationship_id,factory_type,blueprint_key,blueprint_version,name,status,created_at,updated_at&relationship_type=eq.${relationshipType}&relationship_id=eq.${relationshipId}&order=updated_at.desc&limit=30`),
    loadHistory(relationshipType, relationshipId, clean(query.offerId), config),
  ]);
  return json(200, {
    success: true,
    actor: { role: normalizeRole(actor.role), profileId: actor.profileId },
    relationship: mapRelationship(relationshipType, relationship),
    demos: demos.map(mapDemo),
    factoryProjects,
    catalog: adminCatalog(),
    documents: DOCUMENTS,
    history,
    capabilities: {
      customPrices: normalizeRole(actor.role) === "super_admin",
      testMail: false,
      definitiveSend: false,
      providersEnabled: false,
    },
  });
}

async function assertReadyForReview(offerVersionId, actor, config) {
  const versions = await rest(config, `commercial_offer_versions?select=id,offer_id,status,has_non_binding_lines,snapshot&id=eq.${offerVersionId}&limit=1`);
  const version = versions[0];
  if (!version) throw problem(404, "OFFER_NOT_FOUND", "De aanbodversie bestaat niet.");
  const offers = await rest(config, `commercial_offers?select=id,relationship_type,relationship_id&id=eq.${version.offer_id}&limit=1`);
  const offer = offers[0];
  if (!offer) throw problem(404, "OFFER_NOT_FOUND", "Het voorstel bestaat niet.");
  const relationship = await loadRelationship(offer.relationship_type, offer.relationship_id, config);
  assertRelationshipAccess(actor, offer.relationship_type, relationship);
  if (version.has_non_binding_lines) throw problem(409, "NON_BINDING_LINES", "Bevestig eerst alle vanaf- en op-aanvraagprijzen.");
  const bindings = await rest(config, `commercial_offer_document_bindings?select=document_type,version_code,checksum_sha256,required&offer_version_id=eq.${offerVersionId}`);
  const readiness = validateReadyDocuments(version.snapshot || {}, bindings);
  if (!readiness.ready) throw problem(409, "DOCUMENTS_INCOMPLETE", `Verplichte documenten ontbreken of hebben een ongeldige checksum: ${readiness.missing.join(", ")}.`);
}

async function loadRelationship(type, id, config) {
  const table = type === "lead" ? "leads" : "customers";
  const rows = await rest(config, `${table}?select=*&id=eq.${id}&limit=1`);
  if (!rows[0]) throw problem(404, "RELATIONSHIP_NOT_FOUND", "De geselecteerde relatie bestaat niet.");
  return rows[0];
}

function assertRelationshipAccess(actor, type, record) {
  const actorRole = normalizeRole(actor.role);
  if (["super_admin", "admin", "sales_manager"].includes(actorRole)) return;
  const metadata = record?.metadata && typeof record.metadata === "object" ? record.metadata : {};
  const actorAuthId = clean(actor.id);
  const actorProfileId = clean(actor.profileId);
  const authOwners = [metadata.assignedUserId, metadata.ownerAuthUserId];
  if (type === "lead") authOwners.push(record.assigned_user_id, record.assigned_to, record.owner_id);
  const allowed = authOwners.map(clean).includes(actorAuthId)
    || [metadata.ownerProfileId, metadata.assignedProfileId].map(clean).includes(actorProfileId);
  if (!allowed) throw problem(403, "OFFER_FORBIDDEN", "U mag voor deze relatie geen voorstel beheren.");
}

async function loadDemos(type, id, config) {
  const filter = type === "lead" ? `lead_id=eq.${id}` : `customer_id=eq.${id}`;
  return rest(config, `demo_journeys?select=id,business_name,contact_name,demo_status,preview_url,preview_package,preview_generated_at,updated_at&${filter}&order=updated_at.desc&limit=30`);
}

async function assertLinkedResources({ relationshipType, relationshipId, demoJourneyId, factoryProjectId }, config) {
  if (demoJourneyId) {
    const relationshipColumn = relationshipType === "lead" ? "lead_id" : "customer_id";
    const demos = await rest(config, `demo_journeys?select=id,${relationshipColumn}&id=eq.${demoJourneyId}&${relationshipColumn}=eq.${relationshipId}&limit=1`);
    if (!demos[0]) throw problem(409, "DEMO_RELATIONSHIP_MISMATCH", "De geselecteerde demo hoort niet bij deze relatie.");
  }
  if (factoryProjectId) {
    const projects = await rest(config, `factory_projects?select=id&id=eq.${factoryProjectId}&relationship_type=eq.${relationshipType}&relationship_id=eq.${relationshipId}&limit=1`);
    if (!projects[0]) throw problem(409, "FACTORY_RELATIONSHIP_MISMATCH", "Het geselecteerde Factory-dossier hoort niet bij deze relatie.");
  }
}

async function loadHistory(type, id, requestedOfferId, config) {
  let offerQuery = `commercial_offers?select=id,title,status,current_version_id,demo_journey_id,factory_project_id,created_by_profile_id,created_at,updated_at&relationship_type=eq.${type}&relationship_id=eq.${id}&order=updated_at.desc&limit=50`;
  if (requestedOfferId) offerQuery += `&id=eq.${uuid(requestedOfferId, "Het voorstel is ongeldig.")}`;
  const offers = await rest(config, offerQuery);
  if (!offers.length) return [];
  const offerIds = offers.map((offer) => offer.id);
  const filter = `in.(${offerIds.join(",")})`;
  const versions = await rest(config, `commercial_offer_versions?select=*&offer_id=${filter}&order=version_number.desc`);
  const versionFilter = `in.(${versions.map((version) => version.id).join(",") || "00000000-0000-0000-0000-000000000000"})`;
  const [lines, documents, events] = await Promise.all([
    rest(config, `commercial_offer_lines?select=*&offer_version_id=${versionFilter}&order=position.asc`),
    rest(config, `commercial_offer_document_bindings?select=*&offer_version_id=${versionFilter}&order=document_type.asc`),
    rest(config, `commercial_offer_events?select=offer_id,offer_version_id,event_type,actor_profile_id,actor_role,reason,previous_status,new_status,occurred_at,safe_metadata&offer_id=${filter}&order=occurred_at.desc`),
  ]);
  return offers.map((offer) => ({
    ...offer,
    versions: versions.filter((version) => version.offer_id === offer.id).map((version) => ({
      ...version,
      lines: lines.filter((line) => line.offer_version_id === version.id),
      documents: documents.filter((document) => document.offer_version_id === version.id),
      events: events.filter((event) => event.offer_version_id === version.id),
    })),
    events: events.filter((event) => event.offer_id === offer.id),
  }));
}

function mapRelationship(type, record) {
  return {
    type,
    id: record.id,
    companyName: clean(record.company_name || record.company || record.name),
    contactName: clean(record.contact_name || record.name),
    email: clean(record.email).toLowerCase(),
    phone: clean(record.phone),
    website: clean(record.website || record.website_url),
    missing: [!clean(record.company_name || record.company || record.name) && "bedrijfsnaam", !clean(record.contact_name || record.name) && "contactpersoon", !clean(record.email) && "e-mailadres", !clean(record.phone) && "telefoonnummer"].filter(Boolean),
  };
}

function mapDemo(row) {
  const meta = row.preview_package && typeof row.preview_package === "object" ? row.preview_package : {};
  const desktopUrl = safePreviewUrl(row.preview_url);
  const mobileUrl = safePreviewUrl(meta.mobileUrl) || desktopUrl;
  return {
    id: row.id,
    name: clean(row.business_name || meta.name || "Demo"),
    type: clean(meta.factoryType || meta.type || "website"),
    desktopUrl,
    mobileUrl,
    qrTarget: safePreviewUrl(meta.qrTarget) || mobileUrl,
    status: clean(row.demo_status),
    expiresAt: clean(meta.expiresAt),
    updatedAt: row.updated_at,
  };
}

function safePreviewUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : "";
  } catch { return ""; }
}

async function rest(config, path) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json" } });
  const data = await response.json().catch(() => null);
  if (response.ok && Array.isArray(data)) return data;
  console.error("Commercial composer read failed", { status: response.status, code: clean(data?.code), resource: clean(path).split("?")[0] });
  throw problem(503, "OFFER_READ_UNAVAILABLE", "De commerciële context kon niet veilig worden geladen.");
}

function validateDocuments(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 30) throw problem(400, "DOCUMENTS_INVALID", "De documentbindingen zijn ongeldig.");
  return value.map((entry) => {
    const checksumSha256 = clean(entry.checksumSha256).toLowerCase();
    const documentType = clean(entry.documentType).toLowerCase();
    const versionCode = clean(entry.versionCode);
    const storageBucket = clean(entry.storageBucket) || null;
    const storagePath = clean(entry.storagePath) || null;
    const sourceUrl = safeHttpsUrl(entry.sourceUrl);
    if (!/^[a-f0-9]{64}$/.test(checksumSha256) || !documentType || versionCode.length < 1 || versionCode.length > 120) throw problem(400, "DOCUMENT_INVALID", "Een documentversie of checksum is ongeldig.");
    if (Boolean(storageBucket && storagePath) === Boolean(sourceUrl)) throw problem(400, "DOCUMENT_SOURCE_INVALID", "Een document vereist exact één veilige bron.");
    return { documentType, versionCode, templateCode: clean(entry.templateCode) || null, checksumSha256, storageBucket, storagePath, sourceUrl, required: entry.required !== false, metadata: {} };
  });
}

function safeHttpsUrl(value) {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("unsafe");
    return parsed.toString();
  } catch { throw problem(400, "DOCUMENT_URL_INVALID", "Document-URL moet een veilige HTTPS-URL zijn."); }
}

async function rpc(config, name, body) {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (response.ok) return data;
  const code = clean(data?.code);
  if (code === "42501") throw problem(403, "OFFER_FORBIDDEN", "U mag voor deze relatie geen voorstel beheren.");
  if (["22023", "23514", "40001", "55000"].includes(code)) throw problem(409, "OFFER_STATE_REJECTED", "De offeractie past niet bij de actuele, veilige status.");
  if (code === "P0002") throw problem(404, "OFFER_NOT_FOUND", "De aanbodversie bestaat niet.");
  throw problem(503, "OFFER_RPC_UNAVAILABLE", "De beveiligde offeropslag is tijdelijk niet beschikbaar.");
}

function runtimeConfig() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { url, key, ready: Boolean(url && key) };
}
function parseBody(event) { if (event.httpMethod === "GET") return {}; const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : String(event.body || ""); if (!raw || Buffer.byteLength(raw) > 131072) throw problem(400, "BODY_INVALID", "De aanvraag is leeg of te groot."); try { return JSON.parse(raw); } catch { throw problem(400, "JSON_INVALID", "De aanvraag bevat geen geldige gegevens."); } }
function boundedKey(value) { const key = clean(value); if (key.length < 16 || key.length > 150 || !/^[a-zA-Z0-9:_-]+$/.test(key)) throw problem(400, "ACTION_KEY_INVALID", "De actiebeveiliging ontbreekt."); return key; }
function uuid(value, message) { const result = clean(value); if (!UUID.test(result)) throw problem(400, "UUID_INVALID", message); return result; }
function clean(value) { return String(value || "").trim(); }
function normalizeRole(value) { return clean(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function problem(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }
function json(statusCode, body) { return { statusCode, headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { PHASE_B_TRANSITIONS, buildOfferVersion, validateDocuments, assertRelationshipAccess, assertLinkedResources, mapRelationship, mapDemo, safePreviewUrl };
