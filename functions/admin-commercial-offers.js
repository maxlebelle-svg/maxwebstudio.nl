const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { buildOfferVersion, catalogRegistrationPayload } = require("./services/commercialOfferService");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WRITE_ROLES = ["super_admin", "admin", "sales_manager", "sales_partner", "sales"];
const PHASE_B_TRANSITIONS = new Set(["ready_for_review", "revoked", "superseded"]);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { success: false, code: "METHOD_NOT_ALLOWED", error: "Methode niet toegestaan." });
  const auth = await verifyAdmin(event, json, {
    module: "commercial_offers",
    action: "write",
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
function parseBody(event) { const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : String(event.body || ""); if (!raw || Buffer.byteLength(raw) > 131072) throw problem(400, "BODY_INVALID", "De aanvraag is leeg of te groot."); try { return JSON.parse(raw); } catch { throw problem(400, "JSON_INVALID", "De aanvraag bevat geen geldige gegevens."); } }
function boundedKey(value) { const key = clean(value); if (key.length < 16 || key.length > 150 || !/^[a-zA-Z0-9:_-]+$/.test(key)) throw problem(400, "ACTION_KEY_INVALID", "De actiebeveiliging ontbreekt."); return key; }
function uuid(value, message) { const result = clean(value); if (!UUID.test(result)) throw problem(400, "UUID_INVALID", message); return result; }
function clean(value) { return String(value || "").trim(); }
function problem(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }
function json(statusCode, body) { return { statusCode, headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { PHASE_B_TRANSITIONS, buildOfferVersion, validateDocuments };
