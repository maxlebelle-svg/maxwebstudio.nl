const { createClientJourneyReadService } = require("./journey/clientReadService");
const { createJourneyLogger } = require("./journey/logger");

function createHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  const fetchImpl = dependencies.fetchImpl || global.fetch;
  const log = dependencies.log || createJourneyLogger({ logger: dependencies.logger, component: "client_journey_endpoint" });
  const service = dependencies.service || createClientJourneyReadService({ env, fetchImpl, log, logger: dependencies.logger, repository: dependencies.repository });
  const authenticate = dependencies.authenticate || ((event) => authenticateUser(event, env, fetchImpl));
  return async function handler(event = {}) {
    const startedAt = Date.now();
    if (event.httpMethod !== "GET") return json(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
    try {
      const authUser = await authenticate(event);
      const result = await service.getProgress(authUser.id, { environment: runtimeEnvironment(env), isTest: runtimeEnvironment(env) !== "production" });
      if (!result.authorized) return json(result.statusCode || 403, { success: false, error: "Geen klantprofiel gekoppeld aan deze sessie." });
      log.info("client_progress_request", { operation: "client_progress_read", result: result.disabled ? "disabled" : "success", source: result.progress?.source || "unavailable", featureFlagDecision: result.disabled ? "disabled" : "enabled", durationMs: Date.now() - startedAt });
      return json(200, { success: true, readOnly: true, disabled: Boolean(result.disabled), featureFlags: result.featureFlags, progress: result.progress || null });
    } catch (error) {
      const status = error.statusCode || error.status || 500;
      const unauthorized = status === 401 || status === 403;
      log.error("client_progress_failed", { operation: "client_progress_read", result: "failed", source: "unavailable", durationMs: Date.now() - startedAt, errorCategory: safeCategory(error) });
      return json(unauthorized ? 401 : 503, { success: false, error: unauthorized ? "Log opnieuw in om uw projectvoortgang te bekijken." : "Projectvoortgang is tijdelijk niet beschikbaar." });
    }
  };
}

async function authenticateUser(event, env, fetchImpl) {
  const bearer = getBearer(event);
  if (!bearer) throw endpointError("auth_session_missing", 401);
  const url = String(env?.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env?.SUPABASE_ANON_KEY || "").trim();
  if (!url || !key || typeof fetchImpl !== "function") throw endpointError("auth_not_configured", 500);
  let response;
  try { response = await fetchImpl(`${url}/auth/v1/user`, { method: "GET", headers: { apikey: key, Authorization: `Bearer ${bearer}`, Accept: "application/json" } }); }
  catch { throw endpointError("auth_unavailable", 503); }
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user?.id) throw endpointError("auth_session_invalid", 401);
  return { id: String(user.id) };
}

function getBearer(event) { const header = event?.headers?.authorization || event?.headers?.Authorization || ""; return header.startsWith("Bearer ") ? header.slice(7).trim() : ""; }
function runtimeEnvironment(env) { const values = [env?.APP_ENV, env?.APP_ENVIRONMENT, env?.CONTEXT, env?.NETLIFY_ENV].map((value) => String(value || "").toLowerCase()); if (values.some((value) => ["production", "prod"].includes(value))) return "production"; if (values.includes("demo")) return "demo"; return "test"; }
function endpointError(code, statusCode) { const error = new Error("Client journey endpoint failed."); error.code = code; error.statusCode = statusCode; return error; }
function safeCategory(error) { const value = String(error?.code || error?.name || "client_progress_failed").toLowerCase(); return /^[a-z0-9_]{2,80}$/.test(value) ? value : "client_progress_failed"; }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0", Vary: "Authorization" }, body: JSON.stringify(body) }; }

exports.handler = createHandler();
exports.createHandler = createHandler;
exports._private = { authenticateUser, getBearer, runtimeEnvironment };
