const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createFeedbackReceivedRepository(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || global.fetch;
  return {
    findTestJourney: (customerId) => findTestJourney({ customerId, env, fetchImpl }),
    applyProgress: (instance, transition) => applyProgress({ instance, transition, env, fetchImpl }),
    enableTestJourney: (customerId) => enableTestJourney({ customerId, env, fetchImpl }),
  };
}

async function findTestJourney({ customerId, env, fetchImpl }) {
  if (!UUID.test(String(customerId || ""))) return { available: true, row: null, reason: "invalid_customer_id" };
  const config = supabaseConfig(env);
  if (!config.available) return unavailable("missing_supabase_config");
  const query = new URLSearchParams({ select: "id,instance_key,customer_id,project_id,current_phase,current_step,progress_percent,status,environment,metadata,updated_at", customer_id: `eq.${customerId}`, environment: "eq.test", status: "eq.active", order: "updated_at.desc", limit: "10" });
  try {
    const rows = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?${query}`, { headers: headers(config.key) });
    const row = (rows || []).find((item) => item.metadata?.testOnly === true && item.metadata?.feedbackReceivedEmailOwner === "journey") || null;
    return { available: true, row };
  } catch (error) { return unavailable(missing(error) ? "storage_unavailable" : "storage_read_failed"); }
}

async function applyProgress({ instance, transition, env, fetchImpl }) {
  if (!instance?.id || !transition?.patch) return { available: true, skipped: true, reason: transition?.duplicate ? "duplicate_progress" : "progress_patch_missing", row: instance || null };
  const config = supabaseConfig(env);
  if (!config.available) return unavailable("missing_supabase_config");
  const query = new URLSearchParams({ id: `eq.${instance.id}` });
  if (instance.updated_at) query.set("updated_at", `eq.${instance.updated_at}`);
  try {
    const rows = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?${query}`, { method: "PATCH", headers: { ...headers(config.key), "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ ...transition.patch, updated_at: new Date().toISOString() }) });
    if (!Array.isArray(rows) || !rows[0]) return { available: false, skipped: true, reason: "progress_write_conflict", row: null };
    return { available: true, skipped: false, reason: "progress_updated", row: rows[0] };
  } catch { return { available: false, skipped: true, reason: "progress_write_failed", row: null }; }
}

async function enableTestJourney({ customerId, env, fetchImpl }) {
  if (!UUID.test(String(customerId || ""))) throw validationError("invalid_customer_id");
  const config = supabaseConfig(env);
  if (!config.available) return unavailable("missing_supabase_config");
  const query = new URLSearchParams({ select: "id,instance_key,status,environment,metadata,updated_at", customer_id: `eq.${customerId}`, environment: "eq.test", status: "eq.active", order: "updated_at.desc", limit: "1" });
  const rows = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?${query}`, { headers: headers(config.key) });
  const instance = Array.isArray(rows) ? rows[0] : null;
  if (!instance?.id || instance.metadata?.testOnly !== true) return { available: true, row: null, reason: "test_journey_missing" };
  const patchQuery = new URLSearchParams({ id: `eq.${instance.id}` });
  if (instance.updated_at) patchQuery.set("updated_at", `eq.${instance.updated_at}`);
  const patched = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?${patchQuery}`, { method: "PATCH", headers: { ...headers(config.key), "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ metadata: { ...(instance.metadata || {}), feedbackReceivedEmailOwner: "journey", feedbackReceivedTestOnly: true }, updated_at: new Date().toISOString() }) });
  return { available: true, row: Array.isArray(patched) ? patched[0] || null : null, reason: "feedback_test_enabled" };
}

async function request(fetchImpl, url, options = {}) { if (typeof fetchImpl !== "function") throw validationError("missing_fetch"); const response = await fetchImpl(url, options); const text = await response.text(); let body; try { body = text ? JSON.parse(text) : null; } catch { throw Object.assign(new Error("invalid response"), { code: "invalid_response", statusCode: 502 }); } if (!response.ok) throw Object.assign(new Error("journey storage request failed"), { code: String(body?.code || "request_failed"), statusCode: response.status }); return body; }
function supabaseConfig(env) { const url = String(env.SUPABASE_URL || "").replace(/\/$/, ""); const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim(); return { available: Boolean(/^https:\/\/[^/]+\.supabase\.co$/i.test(url) && key), url, key }; }
function headers(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" }; }
function unavailable(reason) { return { available: false, row: null, reason }; }
function missing(error) { return error?.statusCode === 404 || ["42P01", "PGRST205"].includes(error?.code); }
function validationError(code) { const error = new Error("Ongeldige feedbacktestconfiguratie."); error.code = code; error.statusCode = 400; return error; }

module.exports = { createFeedbackReceivedRepository };
