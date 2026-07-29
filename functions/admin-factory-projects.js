const crypto = require("node:crypto");
const { verifyAdmin } = require("./_admin-auth");
const { getFactoryBlueprint, publicFactoryBlueprints } = require("./_factory-blueprints");
const { summarizeGate } = require("./_factory-production-gate");
const { collectSupplierResults } = require("./_factory-production-gate-suppliers");

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
    if (body.action) return await productionGateAction(body, adminCheck.admin);
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
  const enriched = await attachProductionGates(Array.isArray(projects) ? projects : []);
  return json(200, { success: true, blueprints: publicFactoryBlueprints(), projects: enriched });
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
    if (status === "live") throw clientError(409, "PRODUCTION_GATE_REQUIRED", "Livegang kan uitsluitend via de server-side Production Gate.");
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

async function productionGateAction(body, admin) {
  const action = String(body.action || "").trim();
  rejectCallerEvidence(body);
  const project = await projectById(body.projectId || body.id);
  if (action === "report_check") throw clientError(410, "CALLER_EVIDENCE_REJECTED", "Controlebewijs kan uitsluitend door een vertrouwde server-side leverancier worden vastgesteld.");
  if (action === "refresh_checks") return refreshChecks(project, admin);
  if (action === "preflight") return runPreflight(project, admin, false);
  if (action === "go_live") return runPreflight(project, admin, true);
  if (action === "record_internal_approval") return recordInternalApproval(project, body, admin);
  if (action === "create_override") return createOverride(project, body, admin);
  if (action === "revoke_override") return revokeOverride(project, body, admin);
  throw clientError(400, "ACTION_UNKNOWN", "Deze Production Gate-actie bestaat niet.");
}

function rejectCallerEvidence(body) {
  const forbidden = ["checkKey", "status", "source", "sourceVersion", "fingerprint", "inputFingerprint", "evidence", "expiresAt", "blockingError"];
  if (forbidden.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    throw clientError(400, "CALLER_EVIDENCE_REJECTED", "Caller-supplied controlebewijs is niet toegestaan.");
  }
}

async function refreshChecks(project, admin) {
  assertAdminRole(admin, ["super_admin", "admin"], "Alleen een actieve admin kan de vertrouwde bewijsleveranciers uitvoeren.");
  const rows = await collectSupplierResults(project, admin, supplierAdapters());
  await storeSupplierResults(project, rows, admin);
  return json(200, { success: true, productionGate: await gateForProject(project, true) });
}

async function runPreflight(project, admin, authorizeLive) {
  assertAdminRole(admin, ["super_admin", "admin"], "Alleen een actieve admin kan de Production Gate uitvoeren.");
  await auditGate(project.id, "preflight_requested", admin, { authorizeLive });
  const rows = await collectSupplierResults(project, admin, supplierAdapters());
  await storeSupplierResults(project, rows, admin);
  const gate = await gateForProject(project, true);
  const eventType = gate.canGoLive ? "preflight_passed" : authorizeLive ? "live_attempt_blocked" : "preflight_blocked";
  await auditGate(project.id, eventType, admin, { strictCanGoLive: gate.strictCanGoLive, releaseMode: gate.releaseMode, blockingKeys: gate.blockingKeys });
  if (!gate.canGoLive) {
    if (authorizeLive) throw clientError(409, "PRODUCTION_GATE_BLOCKED", `Livegang is geblokkeerd door ${gate.counts.blocking} verplichte controle${gate.counts.blocking === 1 ? "" : "s"}.`);
    return json(200, { success: true, productionGate: gate });
  }
  if (!authorizeLive) return json(200, { success: true, productionGate: gate });
  const authorization = await supabaseRpc("factory_authorize_live_v1", { input_project_id: project.id, input_actor_profile_id: admin.profileId, input_request_id: crypto.randomUUID(), input_expected_project_updated_at: project.updated_at });
  if (!authorization?.authorized) throw clientError(409, "PRODUCTION_GATE_BLOCKED", "De databasepreflight heeft livegang geblokkeerd.");
  return json(200, { success: true, project: authorization.project || project, productionGate: gate, liveAuthorized: true, releaseMode: authorization.releaseMode });
}

async function storeSupplierResults(project, reports, admin) {
  await gateSupabase("factory_gate_checks", new URLSearchParams(), {
    method: "POST",
    body: reports.map((report) => ({ id: crypto.randomUUID(), factory_project_id: project.id, ...report, checked_by: UUID.test(admin?.profileId || "") ? admin.profileId : null })),
  });
  for (const report of reports) await auditGate(project.id, "check_reported", admin, { checkKey: report.check_key, provider: report.source, status: report.status, evidenceHash: report.evidence_hash }, report.check_key);
}

async function recordInternalApproval(project, body, admin) {
  assertAdminRole(admin, ["super_admin"], "Alleen een actieve superadmin kan interne livegoedkeuring vastleggen.");
  if (!UUID.test(admin?.profileId || "")) throw clientError(403, "SUPERADMIN_REQUIRED", "Een geldig superadminprofiel is vereist.");
  const statement = boundedText(body.statement, 20, 1000, "Goedkeuringsverklaring");
  const statementVersion = "factory_internal_approval_nl_v1";
  const row = { id: crypto.randomUUID(), factory_project_id: project.id, attestation_type: "internal_approval", status: "active", statement_version: statementVersion, statement_hash: crypto.createHash("sha256").update(statement).digest("hex"), created_by: admin.profileId };
  const created = await gateSupabase("factory_gate_attestations", new URLSearchParams({ select: "*" }), { method: "POST", body: [row], prefer: "return=representation" });
  await auditGate(project.id, "attestation_created", admin, { attestationId: created?.[0]?.id || row.id, attestationType: "internal_approval", statementVersion });
  return json(201, { success: true, productionGate: await gateForProject(project, true) });
}

async function createOverride(project, body, admin) {
  if (String(admin?.role || "").trim().toLowerCase() !== "super_admin" || !UUID.test(admin?.profileId || "")) {
    throw clientError(403, "SUPERADMIN_REQUIRED", "Alleen een actieve superadmin kan een live-uitzondering vastleggen.");
  }
  const reason = boundedText(body.reason, 10, 1000, "Reden");
  const risks = Array.isArray(body.openRisks) ? body.openRisks.map((item) => boundedText(item, 3, 300, "Openstaand risico")).slice(0, 20) : [];
  if (!risks.length) throw clientError(400, "OVERRIDE_RISKS_REQUIRED", "Leg minimaal één openstaand risico vast.");
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) throw clientError(400, "OVERRIDE_EXPIRY_INVALID", "De vervaldatum van de uitzondering is ongeldig.");
  await gateSupabase("factory_gate_overrides", new URLSearchParams({ factory_project_id: `eq.${project.id}`, status: "eq.active", expires_at: `lte.${new Date().toISOString()}` }), {
    method: "PATCH", body: { status: "expired" },
  });
  const rows = await gateSupabase("factory_gate_overrides", new URLSearchParams({ select: "*" }), {
    method: "POST", body: [{ id: crypto.randomUUID(), factory_project_id: project.id, status: "active", reason, open_risks: risks, created_by: admin.profileId, expires_at: expiresAt?.toISOString() || null }], prefer: "return=representation",
  });
  await auditGate(project.id, "override_created", admin, { overrideId: rows?.[0]?.id || null, reason, openRisks: risks });
  return json(201, { success: true, override: rows?.[0] || null, productionGate: await gateForProject(project, true) });
}

async function revokeOverride(project, body, admin) {
  if (String(admin?.role || "").trim().toLowerCase() !== "super_admin" || !UUID.test(admin?.profileId || "")) throw clientError(403, "SUPERADMIN_REQUIRED", "Alleen een actieve superadmin kan een live-uitzondering intrekken.");
  const id = String(body.overrideId || "").trim();
  if (!UUID.test(id)) throw clientError(400, "OVERRIDE_INVALID", "De uitzondering is ongeldig.");
  const reason = boundedText(body.reason, 3, 500, "Intrekkingsreden");
  const rows = await gateSupabase("factory_gate_overrides", new URLSearchParams({ id: `eq.${id}`, factory_project_id: `eq.${project.id}`, status: "eq.active", select: "*" }), {
    method: "PATCH", body: { status: "revoked", revoked_by: admin.profileId, revoked_at: new Date().toISOString(), revoke_reason: reason }, prefer: "return=representation",
  });
  if (!rows?.length) throw clientError(404, "OVERRIDE_NOT_FOUND", "Actieve uitzondering niet gevonden.");
  await auditGate(project.id, "override_revoked", admin, { overrideId: id, reason });
  return json(200, { success: true, productionGate: await gateForProject(project, true) });
}

async function projectById(value) {
  const id = String(value || "").trim();
  if (!UUID.test(id)) throw clientError(400, "PROJECT_INVALID", "Het factory-dossier is ongeldig.");
  const rows = await supabase("factory_projects", new URLSearchParams({ id: `eq.${id}`, select: "*", limit: "1" }), { method: "GET" });
  if (!rows?.length) throw clientError(404, "PROJECT_NOT_FOUND", "Factory-dossier niet gevonden.");
  return rows[0];
}

async function attachProductionGates(projects) {
  if (!projects.length) return projects;
  try {
    const ids = projects.map((project) => project.id);
    const params = new URLSearchParams({ factory_project_id: `in.(${ids.join(",")})`, select: "*", order: "checked_at.desc", limit: "1500" });
    const overrideParams = new URLSearchParams({ factory_project_id: `in.(${ids.join(",")})`, status: "eq.active", select: "*", order: "created_at.desc" });
    const [checks, overrides] = await Promise.all([gateSupabase("factory_gate_checks", params), gateSupabase("factory_gate_overrides", overrideParams)]);
    return projects.map((project) => ({ ...project, productionGate: summarizeGate(project, checks.filter((item) => item.factory_project_id === project.id), overrides.filter((item) => item.factory_project_id === project.id)) }));
  } catch (error) {
    if (error.code !== "PRODUCTION_GATE_UNAVAILABLE") throw error;
    return projects.map((project) => ({ ...project, productionGate: { available: false, canGoLive: false, strictCanGoLive: false, releaseMode: "blocked", progress: 0, counts: { total: 0, passed: 0, blocking: 0, failed: 0, expired: 0 }, checks: [], blockingKeys: [], override: null } }));
  }
}

async function gateForProject(project, required = false) {
  try {
    const [checks, overrides] = await Promise.all([
      gateSupabase("factory_gate_checks", new URLSearchParams({ factory_project_id: `eq.${project.id}`, select: "*", order: "checked_at.desc", limit: "500" })),
      gateSupabase("factory_gate_overrides", new URLSearchParams({ factory_project_id: `eq.${project.id}`, status: "eq.active", select: "*", order: "created_at.desc" })),
    ]);
    return { available: true, ...summarizeGate(project, checks, overrides) };
  } catch (error) {
    if (!required && error.code === "PRODUCTION_GATE_UNAVAILABLE") return { available: false, canGoLive: false, strictCanGoLive: false, releaseMode: "blocked", progress: 0, counts: { total: 0, passed: 0, blocking: 0, failed: 0, expired: 0 }, checks: [], blockingKeys: [], override: null };
    throw error;
  }
}

async function auditGate(projectId, eventType, admin, details, checkKey = null) {
  await gateSupabase("factory_gate_events", new URLSearchParams(), { method: "POST", body: [{ id: crypto.randomUUID(), factory_project_id: projectId, event_type: eventType, check_key: checkKey, actor_profile_id: UUID.test(admin?.profileId || "") ? admin.profileId : null, request_id: crypto.randomUUID(), details }] });
}

function supplierAdapters() {
  return {
    rpc: supabaseRpc,
    readTable: (table, params) => supabase(table, params, { method: "GET" }),
    probeUrl: probeUrl,
  };
}

async function probeUrl(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(Number(options.timeoutMs) || 5000, 500), 8000));
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal, headers: { Accept: "text/html" } });
    const body = (await response.text()).slice(0, Math.min(Number(options.maxBytes) || 262144, 262144));
    return { ok: response.ok, status: response.status, body };
  } finally { clearTimeout(timeout); }
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

function boundedText(value, min, max, label) {
  const text = String(value || "").trim();
  if (text.length < min || text.length > max || /[\u0000-\u001f]/.test(text)) throw clientError(400, "INVALID_TEXT", `${label} is ongeldig.`);
  return text;
}

function assertAdminRole(admin, allowed, message) {
  if (!allowed.includes(String(admin?.role || "").trim().toLowerCase())) throw clientError(403, "ROLE_NOT_ALLOWED", message);
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

async function gateSupabase(table, params, options = {}) {
  try { return await supabase(table, params, options); }
  catch (error) {
    if (error.details === "42P01" || error.details === "PGRST205") throw clientError(503, "PRODUCTION_GATE_UNAVAILABLE", "De Production Gate-database is nog niet geactiveerd.");
    throw error;
  }
}

async function supabaseRpc(name, body) {
  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!baseUrl || !key) throw clientError(503, "SERVICE_UNAVAILABLE", "Factory-opslag is tijdelijk niet beschikbaar.");
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data?.code === "55000" ? "PRODUCTION_GATE_BLOCKED" : data?.code === "PGRST202" ? "PRODUCTION_GATE_UNAVAILABLE" : "STORAGE_REJECTED";
    throw clientError(code === "PRODUCTION_GATE_BLOCKED" ? 409 : code === "PRODUCTION_GATE_UNAVAILABLE" ? 503 : 502, code, code === "PRODUCTION_GATE_BLOCKED" ? "Livegang is door de Production Gate geblokkeerd." : "De liveautorisatie kon niet veilig worden opgeslagen.");
  }
  return data;
}

function clientError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" }, body: JSON.stringify(body) }; }

exports._private = { attachProductionGates, boundedText, cleanText, getFactoryBlueprint, normalizeConfiguration, productionGateAction, relationshipFrom };
