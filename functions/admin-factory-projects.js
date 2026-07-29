const crypto = require("node:crypto");
const { verifyAdmin } = require("./_admin-auth");
const { getFactoryBlueprint, publicFactoryBlueprints } = require("./_factory-blueprints");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["intake", "ready", "in_production", "review", "live", "paused", "archived"]);
const MAX_BODY_BYTES = 24 * 1024;

exports.handler = async (event) => {
  if (!['GET', 'POST', 'PATCH'].includes(event.httpMethod)) return json(405, { success: false, error: "Deze methode is niet toegestaan." });
  const adminCheck = await verifyAdmin(event, json, {
    module: "factory_hub",
    action: event.httpMethod === "GET" ? "read" : "write",
    allowedRoles: ["super_admin", "admin", "developer", "designer", "support"],
    allowedStatuses: ["active"],
  });
  if (!adminCheck.success) return adminCheck.response;

  try {
    if (event.httpMethod === "GET") return await listProjects(event);
    const body = parseBody(event);
    return event.httpMethod === "POST"
      ? await createProject(body, adminCheck.admin)
      : await updateProject(body, adminCheck.admin);
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error("Factory Hub request failed", { message: error.message, code: error.code || "FACTORY_ERROR" });
    return json(status, { success: false, code: error.code || "FACTORY_ERROR", error: status >= 500 ? "Factory-dossiers konden niet worden verwerkt." : error.message });
  }
};

async function listProjects(event) {
  const query = event.queryStringParameters || {};
  const relationship = relationshipFrom(query, true);
  const params = new URLSearchParams({
    select: "id,relationship_type,relationship_id,factory_type,blueprint_key,blueprint_version,name,status,configuration,created_by,created_at,updated_at",
    order: "updated_at.desc",
    limit: "100",
  });
  params.set("relationship_type", `eq.${relationship.type}`);
  params.set("relationship_id", `eq.${relationship.id}`);
  const projects = await supabase("factory_projects", params, { method: "GET" });
  return json(200, { success: true, blueprints: publicFactoryBlueprints(), projects: Array.isArray(projects) ? projects : [] });
}

async function createProject(body, admin) {
  const relationship = relationshipFrom(body, true);
  const blueprint = getFactoryBlueprint(body.blueprintKey);
  if (!blueprint) throw clientError(400, "BLUEPRINT_UNKNOWN", "Kies een geldige factory-blueprint.");
  await assertRelationshipExists(relationship);
  const name = cleanText(body.name, 2, 160, "Projectnaam");
  const configuration = normalizeConfiguration(body.configuration);
  const row = {
    id: crypto.randomUUID(),
    relationship_type: relationship.type,
    relationship_id: relationship.id,
    factory_type: blueprint.factoryType,
    blueprint_key: blueprint.key,
    blueprint_version: blueprint.version,
    name,
    status: "intake",
    configuration: {
      ...configuration,
      blueprintSnapshot: {
        key: blueprint.key,
        version: blueprint.version,
        modules: [...blueprint.modules],
        stages: [...blueprint.stages],
      },
      safety: { autoPublish: false },
    },
    created_by: UUID.test(admin?.profileId || "") ? admin.profileId : null,
  };
  const created = await supabase("factory_projects", new URLSearchParams({ select: "*" }), {
    method: "POST", body: [row], prefer: "return=representation",
  });
  return json(201, { success: true, project: Array.isArray(created) ? created[0] : created, blueprint });
}

async function updateProject(body, admin) {
  const id = String(body.id || "").trim();
  if (!UUID.test(id)) throw clientError(400, "PROJECT_INVALID", "Het factory-dossier is ongeldig.");
  const patch = {};
  if (body.name !== undefined) patch.name = cleanText(body.name, 2, 160, "Projectnaam");
  if (body.status !== undefined) {
    const status = String(body.status || "").trim();
    if (!STATUSES.has(status)) throw clientError(400, "STATUS_INVALID", "De productiestatus is ongeldig.");
    patch.status = status;
  }
  if (body.configuration !== undefined) patch.configuration = normalizeConfiguration(body.configuration);
  if (!Object.keys(patch).length) throw clientError(400, "NO_CHANGES", "Er zijn geen wijzigingen aangeleverd.");
  patch.updated_at = new Date().toISOString();
  const result = await supabase("factory_projects", new URLSearchParams({ id: `eq.${id}`, select: "*" }), {
    method: "PATCH", body: patch, prefer: "return=representation",
  });
  if (!Array.isArray(result) || !result.length) throw clientError(404, "PROJECT_NOT_FOUND", "Factory-dossier niet gevonden.");
  return json(200, { success: true, project: result[0], updatedBy: admin?.profileId || null });
}

function relationshipFrom(source, required) {
  const type = String(source.relationshipType || "").trim().toLowerCase();
  const id = String(source.relationshipId || "").trim();
  if (!type && !id && !required) return null;
  if (!['lead', 'customer'].includes(type) || !UUID.test(id)) throw clientError(400, "RELATIONSHIP_INVALID", "Selecteer een geldige lead of klant.");
  return { type, id };
}

async function assertRelationshipExists(relationship) {
  const table = relationship.type === "lead" ? "leads" : "customers";
  const rows = await supabase(table, new URLSearchParams({ select: "id", id: `eq.${relationship.id}`, limit: "1" }), { method: "GET" });
  if (!Array.isArray(rows) || !rows.length) throw clientError(404, "RELATIONSHIP_NOT_FOUND", "De gekozen lead of klant bestaat niet meer.");
}

function normalizeConfiguration(value) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw clientError(400, "CONFIGURATION_INVALID", "De factory-configuratie is ongeldig.");
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > 16 * 1024) throw clientError(413, "CONFIGURATION_TOO_LARGE", "De factory-configuratie is te groot.");
  return JSON.parse(serialized);
}

function cleanText(value, min, max, label) {
  const text = String(value || "").trim();
  if (text.length < min || text.length > max || /[<>\u0000-\u001f]/.test(text)) throw clientError(400, "INVALID_TEXT", `${label} is ongeldig.`);
  return text;
}

function parseBody(event) {
  const raw = String(event.body || "");
  if (!raw || Buffer.byteLength(raw, event.isBase64Encoded ? "base64" : "utf8") > MAX_BODY_BYTES) throw clientError(400, "INVALID_BODY", "De aanvraag is leeg of te groot.");
  try { return JSON.parse(event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw); }
  catch { throw clientError(400, "INVALID_JSON", "De aanvraag bevat geen geldige gegevens."); }
}

async function supabase(table, params, options = {}) {
  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!baseUrl || !key) throw clientError(503, "SERVICE_UNAVAILABLE", "Factory-opslag is tijdelijk niet beschikbaar.");
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${params.toString()}`, {
    method: options.method || "GET",
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body === undefined ? {} : { "Content-Type": "application/json" }), ...(options.prefer ? { Prefer: options.prefer } : {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = clientError(response.status === 404 ? 404 : 502, "STORAGE_REJECTED", "Factory-opslag weigerde de aanvraag.");
    error.details = data?.code || "";
    throw error;
  }
  return data;
}

function clientError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" }, body: JSON.stringify(body) }; }

exports._private = { cleanText, getFactoryBlueprint, normalizeConfiguration, relationshipFrom };
