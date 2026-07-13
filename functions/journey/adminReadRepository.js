const { resolveJourneyFeatureFlag } = require("./featureFlags");
const { createJourneyLogger } = require("./logger");
const { FEATURE_FLAGS } = require("./types");

const TABLE_SELECTS = Object.freeze({
  journeyDefinitions: ["journey_definitions", "id,definition_key,version,product_code,journey_type,status,config,created_at,updated_at"],
  journeyInstances: ["journey_instances", "id,instance_key,definition_id,customer_id,project_id,order_id,product_code,journey_type,definition_version,current_phase,current_step,progress_percent,status,next_step_at,environment,metadata,started_at,completed_at,cancelled_at,created_at,updated_at"],
  journeyEvents: ["journey_events", "id,event_type,entity_type,entity_id,customer_id,journey_instance_id,environment,occurred_at,received_at"],
  customers: ["customers", "id,auth_user_id,profile_id,company,package,status,environment,metadata,created_at,updated_at"],
  projects: ["projects", "id,customer_id,website_id,type,status,phase,progress,environment,metadata,created_at,updated_at"],
  invoices: ["customer_invoices", "id,profile_id,customer_auth_user_id,status,mollie_payment_status,paid_at,notes,created_at,updated_at"],
  leads: ["leads", "id,company_name,status,source,converted_customer_id,environment,metadata,created_at,updated_at"],
  demoJourneys: ["demo_journeys", "id,lead_id,customer_id,business_name,demo_status,preview_generated_at,environment,created_at,updated_at"],
  automationOutbox: ["automation_outbox", "id,event_key,event_type,entity_type,entity_id,effect_type,status,attempt_count,next_attempt_at,processed_at,last_error_code,environment,created_at,updated_at,feedback_reference:payload->>feedbackReference,ownership_reason:payload->>ownershipReason,progress_before:payload->>progressBefore,progress_after:payload->>progressAfter"],
  automationExecutions: ["automation_executions", "id,outbox_id,automation_key,template_key,template_version,provider,status,delivery_status,attempt_count,provider_message_id,last_error_code,environment,created_at,updated_at"],
  emailLogs: ["email_logs", "id,status,template_key,customer_id,project_id,error_code,metadata,created_at,updated_at"],
});

function createAdminJourneyReadRepository(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || global.fetch;
  const log = options.log || createJourneyLogger({ logger: options.logger, component: "journey_admin_repository" });
  return {
    readSnapshot: (filters = {}, context = {}) => readSnapshot({ filters, context, env, fetchImpl, log }),
  };
}

async function readSnapshot({ filters, context, env, fetchImpl, log }) {
  const engineGate = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env);
  const adminGate = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ADMIN_ENABLED, context, env);
  if (!engineGate.enabled || !adminGate.enabled) {
    const gate = !engineGate.enabled ? engineGate : adminGate;
    log.info("feature_noop", { operation: "admin_snapshot", result: "disabled", featureFlag: gate.flagName, mode: gate.mode, reason: gate.reason });
    return emptySnapshot({ available: false, skipped: true, reason: gate.reason, mode: gate.mode });
  }
  if (context.adminAuthorized !== true) return emptySnapshot({ available: false, skipped: true, reason: "admin_authorization_required" });
  const config = supabaseConfig(env);
  if (!config.available) return emptySnapshot({ available: false, skipped: true, reason: "missing_supabase_config" });

  const customerId = safeId(filters.customerId || filters.customer_id);
  const environment = safeEnvironment(filters.environment);
  const tasks = Object.entries(TABLE_SELECTS).map(async ([key, [table, select]]) => {
    const query = new URLSearchParams({ select, limit: table === "journey_events" ? "100" : "500" });
    query.set("order", table === "journey_events" ? "occurred_at.desc" : "updated_at.desc.nullslast");
    if (environment && ["journey_instances", "journey_events"].includes(table)) query.set("environment", `eq.${environment}`);
    if (customerId && ["journey_instances", "journey_events", "projects", "demo_journeys"].includes(table)) query.set("customer_id", `eq.${customerId}`);
    if (customerId && table === "customers") query.set("id", `eq.${customerId}`);
    const result = await safeReadTable(fetchImpl, config, table, query);
    return [key, result];
  });
  const entries = await Promise.all(tasks);
  const results = Object.fromEntries(entries);
  const warnings = Object.entries(results).filter(([, result]) => !result.available).map(([key, result]) => ({ source: key, reason: result.reason }));
  return {
    available: true,
    skipped: false,
    journeyTablesAvailable: results.journeyInstances.available && results.journeyDefinitions.available,
    mailStorageAvailable: results.automationOutbox.available && results.automationExecutions.available,
    warnings,
    data: Object.fromEntries(Object.entries(results).map(([key, result]) => [key, result.rows])),
  };
}

async function safeReadTable(fetchImpl, config, table, query) {
  try {
    const rows = await restFetch(fetchImpl, `${config.url}/rest/v1/${table}?${query.toString()}`, { headers: restHeaders(config.key) });
    return { available: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    if (isMissingRelationError(error)) return { available: false, reason: "table_missing", rows: [] };
    return { available: false, reason: "table_read_failed", rows: [] };
  }
}

async function restFetch(fetchImpl, url, options) {
  if (typeof fetchImpl !== "function") throw repositoryError("missing_fetch", 500);
  let response;
  try { response = await fetchImpl(url, options); } catch { throw repositoryError("request_failed", 503); }
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { throw repositoryError("invalid_response", response.status || 502); }
  }
  if (!response.ok) {
    const error = repositoryError(String(data?.code || "request_failed"), response.status || 500);
    error.details = String(data?.details || data?.message || "");
    throw error;
  }
  return data;
}

function isMissingRelationError(error = {}) {
  const details = String(error.details || "").toLowerCase();
  return error.statusCode === 404
    || ["42P01", "PGRST205"].includes(error.code)
    || details.includes("schema cache")
    || details.includes("does not exist")
    || details.includes("could not find the table");
}

function emptySnapshot(input) {
  return { ...input, journeyTablesAvailable: false, mailStorageAvailable: false, warnings: [], data: Object.fromEntries(Object.keys(TABLE_SELECTS).map((key) => [key, []])) };
}

function supabaseConfig(env) {
  const url = String(env?.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { available: Boolean(/^https:\/\/[^/]+\.supabase\.co$/i.test(url) && key), url, key };
}

function restHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public" };
}

function safeId(value) {
  const id = String(value || "").trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : "";
}

function safeEnvironment(value) {
  const environment = String(value || "").trim().toLowerCase();
  return ["production", "test", "demo"].includes(environment) ? environment : "";
}

function repositoryError(code, statusCode) {
  const error = new Error("Journey admin read failed.");
  error.name = "JourneyAdminRepositoryError";
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

module.exports = { createAdminJourneyReadRepository, _private: { isMissingRelationError, safeReadTable } };
