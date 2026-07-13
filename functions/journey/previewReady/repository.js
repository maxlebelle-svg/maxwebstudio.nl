const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createPreviewReadyRepository(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || global.fetch;
  return {
    findTestJourney: (customerId) => findTestJourney({ customerId, env, fetchImpl }),
    ensureTestJourney: (input) => ensureTestJourney({ input, env, fetchImpl }),
  };
}

async function findTestJourney({ customerId, env, fetchImpl }) {
  if (!UUID.test(String(customerId || ""))) return { available: true, row: null, reason: "invalid_customer_id" };
  const config = supabaseConfig(env);
  if (!config.available) return { available: false, row: null, reason: "missing_supabase_config" };
  const query = new URLSearchParams({
    select: "id,instance_key,customer_id,project_id,current_phase,current_step,progress_percent,status,environment,metadata,updated_at",
    customer_id: `eq.${customerId}`,
    environment: "eq.test",
    status: "eq.active",
    order: "updated_at.desc",
    limit: "10",
  });
  try {
    const rows = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?${query}`, { headers: headers(config.key) });
    const row = (rows || []).find((item) => item.metadata?.testOnly === true && item.metadata?.previewReadyEmailOwner === "journey") || null;
    return { available: true, row };
  } catch (error) {
    return { available: false, row: null, reason: missing(error) ? "storage_unavailable" : "storage_read_failed" };
  }
}

async function ensureTestJourney({ input, env, fetchImpl }) {
  const customerId = String(input.customerId || "").trim();
  const projectId = String(input.projectId || "").trim();
  if (!UUID.test(customerId) || (projectId && !UUID.test(projectId))) throw validationError("invalid_test_journey_scope");
  const config = supabaseConfig(env);
  if (!config.available) return { available: false, row: null, reason: "missing_supabase_config" };
  const definitionRows = await request(fetchImpl, `${config.url}/rest/v1/journey_definitions?on_conflict=definition_key%2Cversion`, {
    method: "POST", headers: { ...headers(config.key), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ definition_key: "website.preview_ready_test", version: 1, product_code: safeProduct(input.productCode), journey_type: "website.preview_ready_test", status: "published", config: { testOnly: true, effects: ["email.preview_ready"] }, checksum: "preview-ready-test-v1" }),
  });
  const definition = Array.isArray(definitionRows) ? definitionRows[0] : definitionRows;
  if (!definition?.id) return { available: false, row: null, reason: "definition_write_failed" };
  const instanceKey = `preview-ready-test:${customerId}`;
  const instanceRows = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?on_conflict=instance_key`, {
    method: "POST", headers: { ...headers(config.key), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ instance_key: instanceKey, definition_id: definition.id, customer_id: customerId, project_id: projectId || null, product_code: safeProduct(input.productCode), journey_type: "website.preview_ready_test", definition_version: 1, current_phase: "preview", current_step: "preview_shared", progress_percent: 70, status: "active", environment: "test", metadata: { testOnly: true, previewReadyEmailOwner: "journey", createdBy: "super_admin_test_action" } }),
  });
  return { available: true, row: Array.isArray(instanceRows) ? instanceRows[0] || null : instanceRows };
}

async function request(fetchImpl, url, options = {}) {
  if (typeof fetchImpl !== "function") throw Object.assign(new Error("request unavailable"), { code: "missing_fetch" });
  const response = await fetchImpl(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw Object.assign(new Error("journey storage request failed"), { code: String(body?.code || "request_failed"), statusCode: response.status });
  return body;
}
function supabaseConfig(env) { const url = String(env.SUPABASE_URL || "").replace(/\/$/, ""); const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim(); return { available: Boolean(/^https:\/\/[^/]+\.supabase\.co$/i.test(url) && key), url, key }; }
function headers(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" }; }
function safeProduct(value) { const code = String(value || "WEB-STARTER").trim().toUpperCase(); return /^WEB-[A-Z0-9_-]+$/.test(code) ? code : "WEB-STARTER"; }
function missing(error) { return error?.statusCode === 404 || ["42P01", "PGRST205"].includes(error?.code); }
function validationError(code) { const error = new Error("Ongeldige testjourney."); error.code = code; error.statusCode = 400; return error; }

module.exports = { createPreviewReadyRepository, _private: { safeProduct } };
