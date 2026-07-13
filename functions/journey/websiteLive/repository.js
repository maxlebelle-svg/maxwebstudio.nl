const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createWebsiteLiveRepository(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || global.fetch;
  return {
    findTestJourney: (customerId) => findJourney(customerId, env, fetchImpl),
    enableTestJourney: (customerId) => enableJourney(customerId, env, fetchImpl),
    applyProgress: (instance, transition) => applyProgress(instance, transition, env, fetchImpl),
    findHealthWebsite: (scope) => findHealthWebsite(scope, env, fetchImpl),
    findMaintenanceSubscription: (projectId) => findMaintenanceSubscription(projectId, env, fetchImpl),
  };
}

async function findJourney(customerId, env, fetchImpl) {
  if (!UUID.test(text(customerId))) return { available: true, row: null, reason: "invalid_customer_id" };
  const config = cfg(env); if (!config.available) return unavailable("missing_supabase_config");
  try {
    const query = new URLSearchParams({ select: "id,instance_key,customer_id,journey_type,current_phase,current_step,progress_percent,status,environment,metadata,updated_at", customer_id: `eq.${customerId}`, environment: "eq.test", status: "eq.active", order: "updated_at.desc", limit: "10" });
    const rows = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?${query}`, { headers: headers(config.key) });
    return { available: true, row: (rows || []).find((row) => row.metadata?.testOnly === true && row.metadata?.websiteLiveEmailOwner === "journey") || null };
  } catch { return unavailable("storage_read_failed"); }
}

async function enableJourney(customerId, env, fetchImpl) {
  if (!UUID.test(text(customerId))) throw error("invalid_customer_id", 400);
  const config = cfg(env); if (!config.available) return unavailable("missing_supabase_config");
  const query = new URLSearchParams({ select: "id,instance_key,status,environment,metadata,updated_at", customer_id: `eq.${customerId}`, environment: "eq.test", status: "eq.active", order: "updated_at.desc", limit: "1" });
  const rows = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?${query}`, { headers: headers(config.key) });
  const instance = rows?.[0];
  if (!instance?.id || instance.metadata?.testOnly !== true) return { available: true, row: null, reason: "test_journey_missing" };
  const patch = new URLSearchParams({ id: `eq.${instance.id}` }); if (instance.updated_at) patch.set("updated_at", `eq.${instance.updated_at}`);
  const saved = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?${patch}`, { method: "PATCH", headers: { ...headers(config.key), "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ metadata: { ...instance.metadata, websiteLiveEmailOwner: "journey", websiteLiveTestOnly: true }, updated_at: new Date().toISOString() }) });
  return { available: true, row: saved?.[0] || null, reason: "website_live_test_enabled" };
}

async function applyProgress(instance, transition, env, fetchImpl) {
  if (!instance?.id || !transition?.patch) return { available: true, skipped: true, reason: transition?.duplicate ? "duplicate_progress" : "progress_patch_missing" };
  const config = cfg(env); if (!config.available) return unavailable("missing_supabase_config");
  const query = new URLSearchParams({ id: `eq.${instance.id}` }); if (instance.updated_at) query.set("updated_at", `eq.${instance.updated_at}`);
  try {
    const rows = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?${query}`, { method: "PATCH", headers: { ...headers(config.key), "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ ...transition.patch, updated_at: new Date().toISOString() }) });
    return rows?.[0] ? { available: true, skipped: false, reason: "progress_updated", row: rows[0] } : { available: false, skipped: true, reason: "progress_write_conflict" };
  } catch { return { available: false, skipped: true, reason: "progress_write_failed" }; }
}

async function findHealthWebsite(scope = {}, env, fetchImpl) {
  const config = cfg(env); if (!config.available) return unavailable("missing_supabase_config");
  const profileId = text(scope.profileId); const authUserId = text(scope.authUserId);
  if (!UUID.test(profileId) && !UUID.test(authUserId)) return { available: true, row: null, reason: "health_scope_missing" };
  const query = new URLSearchParams({ select: "id,profile_id,customer_auth_user_id,domain,live_url,status,dns_status,ssl_status,hosting_status,last_deploy_at,last_uptime_check,uptime_status,updated_at", order: "updated_at.desc.nullslast", limit: "10" });
  if (UUID.test(profileId)) query.set("profile_id", `eq.${profileId}`); else query.set("customer_auth_user_id", `eq.${authUserId}`);
  try {
    const rows = await request(fetchImpl, `${config.url}/rest/v1/customer_websites?${query}`, { headers: headers(config.key) });
    const expected = hostname(scope.liveUrl || scope.domain);
    return { available: true, row: (rows || []).find((row) => !expected || [row.live_url, row.domain].map(hostname).includes(expected)) || rows?.[0] || null, reason: "health_read" };
  } catch { return { available: false, row: null, reason: "health_read_failed" }; }
}

async function findMaintenanceSubscription(projectId, env, fetchImpl) {
  if (!UUID.test(text(projectId))) return { available: true, row: null, reason: "project_id_missing" };
  const config = cfg(env); if (!config.available) return unavailable("missing_supabase_config");
  const marker = `websiteMaintenanceProject:${projectId}`;
  const query = new URLSearchParams({ select: "id,status,package_name,start_date,updated_at", notes: `ilike.*${marker}*`, order: "updated_at.desc.nullslast", limit: "1" });
  try { const rows = await request(fetchImpl, `${config.url}/rest/v1/customer_subscriptions?${query}`, { headers: headers(config.key) }); return { available: true, row: rows?.[0] || null, reason: "maintenance_read" }; }
  catch { return { available: false, row: null, reason: "maintenance_read_failed" }; }
}

async function request(fetchImpl, url, options = {}) { const response = await fetchImpl(url, options); const raw = await response.text(); let body; try { body = raw ? JSON.parse(raw) : null; } catch { throw error("invalid_response", 502); } if (!response.ok) throw error(text(body?.code || "request_failed"), response.status); return body; }
function cfg(env) { const url = text(env.SUPABASE_URL).replace(/\/$/, ""); const key = text(env.SUPABASE_SERVICE_ROLE_KEY); return { available: Boolean(/^https:\/\/[^/]+\.supabase\.co$/i.test(url) && key), url, key }; }
function headers(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" }; }
function hostname(value) { try { return new URL(/^https?:/i.test(text(value)) ? text(value) : `https://${text(value)}`).hostname.toLowerCase(); } catch { return ""; } }
function unavailable(reason) { return { available: false, row: null, reason }; }
function error(code, statusCode) { return Object.assign(new Error("Website live journey storage failed."), { code, statusCode }); }
function text(value) { return String(value || "").trim(); }
module.exports = { createWebsiteLiveRepository };
