const { verifyAdmin: defaultVerifyAdmin } = require("./_admin-auth");
const { parseAllowlist, resolveJourneyFeatureFlag } = require("./journey/featureFlags");
const { FEATURE_FLAGS } = require("./journey/types");
const { createPostLaunchRepository } = require("./journey/postLaunch/repository");
const { createPostLaunchCheckService } = require("./journey/postLaunch/service");
function createHandler(options = {}) {
  const env = options.env || process.env; const verifyAdmin = options.verifyAdmin || defaultVerifyAdmin; const repository = options.repository || createPostLaunchRepository({ env, fetchImpl: options.fetchImpl }); const service = options.service || createPostLaunchCheckService({ env, repository, fetchImpl: options.fetchImpl, lookup: options.lookup, logger: options.logger });
  return async (event = {}) => {
    if (event.httpMethod !== "POST") return json(405, { success: false, error: "Alleen POST is toegestaan." });
    const auth = await verifyAdmin(event, json, { module: "journey_post_launch", action: "test_only", allowedRoles: ["super_admin"], allowedStatuses: ["active"], disableLegacyToken: true }); if (!auth.success) return auth.response;
    const payload = body(event.body); const customerId = text(payload.customerId); const websiteId = text(payload.websiteId); const context = { environment: runtime(env), customerId, adminAuthorized: true, scopeKey: "post-launch-check" }; const selected = parseAllowlist(env.JOURNEY_POST_LAUNCH_CHECK_TEST_CUSTOMERS); const engine = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env);
    if (!engine.enabled || !selected.has(customerId)) return json(409, { success: false, testMode: true, reason: !engine.enabled ? engine.reason : "customer_not_selected_for_post_launch_check" });
    if (payload.action === "enable_test") { const result = await repository.enableTestJourney(customerId); return json(result.row ? 200 : 409, { success: Boolean(result.row), testMode: true, reason: result.reason, instanceId: result.row?.id || null }); }
    if (payload.action === "run_test_check") { const result = await service.run({ customerId, websiteId, adminAuthorized: true }); return json(result.success ? 200 : result.status === "duplicate" ? 409 : 503, result); }
    return json(400, { success: false, error: "Onbekende nazorgactie." });
  };
}
function body(value) { try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } } function runtime(env) { return [env.APP_ENV, env.APP_ENVIRONMENT, env.CONTEXT, env.NETLIFY_ENV].some((v) => ["production", "prod"].includes(text(v).toLowerCase())) ? "production" : "test"; } function text(value) { return String(value || "").trim(); } function json(statusCode, value) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(value) }; }
exports.handler = createHandler(); exports.createHandler = createHandler;
