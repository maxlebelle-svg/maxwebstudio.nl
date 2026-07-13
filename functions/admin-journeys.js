const { verifyAdmin: defaultVerifyAdmin } = require("./_admin-auth");
const { createAdminJourneyReadService } = require("./journey/adminReadService");
const { createJourneyLogger } = require("./journey/logger");

function createHandler(dependencies = {}) {
  const verifyAdmin = dependencies.verifyAdmin || defaultVerifyAdmin;
  const env = dependencies.env || process.env;
  const log = dependencies.log || createJourneyLogger({ logger: dependencies.logger, component: "admin_journeys_endpoint" });
  const service = dependencies.service || createAdminJourneyReadService({ env, fetchImpl: dependencies.fetchImpl, log, logger: dependencies.logger });

  return async function handler(event = {}) {
    const startedAt = Date.now();
    if (event.httpMethod !== "GET") return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });

    const adminCheck = await verifyAdmin(event, jsonResponse, {
      module: "journeys",
      action: "read",
      allowedRoles: ["super_admin", "admin"],
      allowedStatuses: ["active"],
    });
    if (!adminCheck.success) return adminCheck.response;

    try {
      const filters = sanitizeFilters(event.queryStringParameters || {});
      const result = await service.getOverview(filters, {
        adminAuthorized: true,
        customerId: filters.customerId,
        scopeKey: "admin-journeys",
        environment: runtimeEnvironment(env),
      });
      log.info("admin_journeys_request", {
        operation: "admin_journeys_read",
        result: result.disabled ? "disabled" : "success",
        source: result.source || "unavailable",
        durationMs: Date.now() - startedAt,
        recordCount: result.journeys?.length || 0,
      });
      return jsonResponse(200, {
        success: true,
        readOnly: true,
        ...result,
      });
    } catch (error) {
      log.error("admin_journeys_failed", {
        operation: "admin_journeys_read",
        result: "failed",
        durationMs: Date.now() - startedAt,
        errorCategory: safeErrorCategory(error),
      });
      return jsonResponse(error.statusCode && error.statusCode < 500 ? error.statusCode : 503, {
        success: false,
        readOnly: true,
        error: "Journey-overzicht kon tijdelijk niet worden geladen.",
      });
    }
  };
}

function sanitizeFilters(input) {
  const source = allowed(input.source, ["journey", "legacy_estimate", "unavailable"]);
  const action = allowed(input.action, ["customer", "internal", "blocked"]);
  const environment = allowed(input.environment, ["production", "test", "demo"]);
  return {
    page: boundedInteger(input.page, 1, 1, 100000),
    limit: boundedInteger(input.limit, 25, 1, 100),
    phase: safeFilter(input.phase),
    status: safeFilter(input.status),
    source,
    action,
    environment,
    customerId: uuid(input.customerId || input.customer_id),
  };
}

function runtimeEnvironment(env) {
  const values = [env?.APP_ENV, env?.APP_ENVIRONMENT, env?.CONTEXT, env?.NETLIFY_ENV].map((value) => String(value || "").trim().toLowerCase());
  if (values.some((value) => ["production", "prod"].includes(value))) return "production";
  if (values.some((value) => value === "demo")) return "demo";
  return "test";
}

function safeErrorCategory(error) {
  const category = String(error?.code || error?.name || "journey_read_failed").trim().toLowerCase();
  return /^[a-z0-9_]{2,80}$/.test(category) ? category : "journey_read_failed";
}

function allowed(value, values) {
  const normalized = String(value || "").trim().toLowerCase();
  return values.includes(normalized) ? normalized : "";
}

function safeFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,50}$/.test(normalized) ? normalized : "";
}

function uuid(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized) ? normalized : "";
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" },
    body: JSON.stringify(body),
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
exports._private = { runtimeEnvironment, sanitizeFilters };
