const { createWebsiteLiveRepository } = require("../websiteLive/repository");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function createPostLaunchRepository(options = {}) {
  const env = options.env || process.env; const fetchImpl = options.fetchImpl || global.fetch; const liveRepo = createWebsiteLiveRepository({ env, fetchImpl });
  return {
    loadScope: (customerId, websiteId) => loadScope(customerId, websiteId, env, fetchImpl, liveRepo),
    enableTestJourney: (customerId) => enableTestJourney(customerId, env, fetchImpl),
    claimRun: (instance, runKey, startedAt) => patchInstance(instance, { metadata: { ...instance.metadata, postLaunchCheck: { ...(instance.metadata?.postLaunchCheck || {}), activeRunKey: runKey, startedAt } } }, env, fetchImpl),
    finalizeRun: (instance, transition, result) => {
      const progressPatch = transition?.patch || {};
      return patchInstance(instance, { ...progressPatch, metadata: { ...(progressPatch.metadata || instance.metadata), postLaunchCheck: { activeRunKey: null, ...result } } }, env, fetchImpl);
    },
  };
}
async function loadScope(customerId, websiteId, env, fetchImpl, liveRepo) {
  if (!UUID.test(text(customerId)) || !UUID.test(text(websiteId))) return { available: true, reason: "invalid_scope", row: null };
  const config = cfg(env); if (!config.available) return unavailable("missing_supabase_config");
  try {
    const [customers, websites, projects, instances] = await Promise.all([
      get(fetchImpl, config, "customers", { select: "id,profile_id,auth_user_id,status,metadata", id: `eq.${customerId}`, limit: "1" }),
      get(fetchImpl, config, "websites", { select: "id,customer_id,project_id,name,domain,live_url,status,last_deploy_at,metadata,updated_at", id: `eq.${websiteId}`, customer_id: `eq.${customerId}`, limit: "1" }),
      get(fetchImpl, config, "projects", { select: "id,customer_id,website_id,status,phase,progress,metadata,updated_at", customer_id: `eq.${customerId}`, website_id: `eq.${websiteId}`, order: "updated_at.desc", limit: "1" }),
      get(fetchImpl, config, "journey_instances", { select: "id,customer_id,project_id,journey_type,current_phase,current_step,progress_percent,status,environment,metadata,updated_at", customer_id: `eq.${customerId}`, environment: "eq.test", order: "updated_at.desc", limit: "10" }),
    ]);
    const customer = customers[0], website = websites[0], project = projects[0];
    const instance = instances.find((row) => row.metadata?.testOnly === true && row.metadata?.postLaunchCheckOwner === "journey");
    if (!customer || !website || !project || !instance || instance.project_id !== project.id || project.status !== "live") return { available: true, reason: "post_launch_scope_mismatch", row: null };
    const [health, maintenance] = await Promise.all([liveRepo.findHealthWebsite({ profileId: customer.profile_id, authUserId: customer.auth_user_id, liveUrl: website.live_url, domain: website.domain }), liveRepo.findMaintenanceSubscription(project.id)]);
    return { available: true, reason: "post_launch_scope_loaded", row: { customer, website, project, instance, healthWebsite: health.row || null, maintenanceSubscription: maintenance.row || null } };
  } catch { return unavailable("post_launch_scope_read_failed"); }
}
async function enableTestJourney(customerId, env, fetchImpl) {
  if (!UUID.test(text(customerId))) throw coded("invalid_customer_id", 400); const config = cfg(env); if (!config.available) return unavailable("missing_supabase_config");
  const rows = await get(fetchImpl, config, "journey_instances", { select: "id,metadata,updated_at,environment,status", customer_id: `eq.${customerId}`, environment: "eq.test", status: "eq.active", order: "updated_at.desc", limit: "10" });
  const instance = rows.find((row) => row.metadata?.testOnly === true && row.metadata?.websiteLiveEmailOwner === "journey"); if (!instance) return { available: true, row: null, reason: "website_live_test_journey_missing" };
  return patchInstance(instance, { metadata: { ...instance.metadata, postLaunchCheckOwner: "journey", postLaunchCheckTestOnly: true } }, env, fetchImpl);
}
async function patchInstance(instance, patch, env, fetchImpl) {
  const config = cfg(env); if (!config.available) return unavailable("missing_supabase_config"); const query = new URLSearchParams({ id: `eq.${instance.id}` }); if (instance.updated_at) query.set("updated_at", `eq.${instance.updated_at}`);
  const rows = await request(fetchImpl, `${config.url}/rest/v1/journey_instances?${query}`, { method: "PATCH", headers: { ...headers(config.key), "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  return rows?.[0] ? { available: true, row: rows[0], reason: "post_launch_instance_updated" } : { available: true, row: null, reason: "post_launch_write_conflict" };
}
async function get(fetchImpl, config, table, params) { return request(fetchImpl, `${config.url}/rest/v1/${table}?${new URLSearchParams(params)}`, { headers: headers(config.key) }); }
async function request(fetchImpl, url, options) { const response = await fetchImpl(url, options); const raw = await response.text(); let data; try { data = raw ? JSON.parse(raw) : null; } catch { throw coded("invalid_response", 502); } if (!response.ok) throw coded(data?.code || "request_failed", response.status); return data; }
function cfg(env) { const url = text(env.SUPABASE_URL).replace(/\/$/, ""); const key = text(env.SUPABASE_SERVICE_ROLE_KEY); return { available: Boolean(/^https:\/\/[^/]+\.supabase\.co$/i.test(url) && key), url, key }; }
function headers(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" }; }
function unavailable(reason) { return { available: false, row: null, reason }; } function coded(code, statusCode) { return Object.assign(new Error(code), { code, statusCode }); } function text(value) { return String(value || "").trim(); }
module.exports = { createPostLaunchRepository };
