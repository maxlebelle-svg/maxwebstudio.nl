const { FEATURE_FLAGS, PROCESSING_STATUSES } = require("./types");
const { resolveJourneyFeatureFlag } = require("./featureFlags");
const { createJourneyLogger } = require("./logger");
const {
  validateBusinessEvent,
  validateJourneyDefinition,
  validateOutboxInput,
  validateProviderEvent,
} = require("./validation");

function createJourneyRepository(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || global.fetch;
  const log = options.log || createJourneyLogger({ logger: options.logger, component: "journey_repository" });

  return {
    getJourneyInstanceByKey: (instanceKey, context) => getJourneyInstanceByKey({ instanceKey, context, env, fetchImpl, log }),
    listAutomationOutbox: (filters, context) => listAutomationOutbox({ filters, context, env, fetchImpl, log }),
    listJourneyDefinitions: (filters, context) => listJourneyDefinitions({ filters, context, env, fetchImpl, log }),
    recordJourneyEvent: (input, settings) => recordJourneyEvent({ input, settings, env, fetchImpl, log }),
    recordProviderEvent: (input, context) => recordProviderEvent({ input, context, env, fetchImpl, log }),
    saveJourneyDefinition: (input, context) => saveJourneyDefinition({ input, context, env, fetchImpl, log }),
  };
}

async function listJourneyDefinitions({ filters = {}, context = {}, env, fetchImpl, log }) {
  const gate = gateFeature(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env, log, "list_definitions");
  if (!gate.enabled) return noOp(gate, []);
  const config = supabaseConfig(env);
  if (!config.available) return unavailable("missing_supabase_config", []);
  const query = new URLSearchParams({ select: "*", order: "definition_key.asc,version.desc", limit: String(limit(filters.limit, 100)) });
  if (clean(filters.productCode)) query.set("product_code", `eq.${clean(filters.productCode).toUpperCase()}`);
  if (clean(filters.journeyType)) query.set("journey_type", `eq.${clean(filters.journeyType).toLowerCase()}`);
  const rows = await restFetch(fetchImpl, `${config.url}/rest/v1/journey_definitions?${query}`, { headers: restHeaders(config.key) });
  return { available: true, skipped: false, rows: Array.isArray(rows) ? rows : [] };
}

async function saveJourneyDefinition({ input, context = {}, env, fetchImpl, log }) {
  const gate = gateFeature(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env, log, "save_definition");
  if (!gate.enabled) return noOp(gate, null);
  const definition = validateJourneyDefinition(input);
  const config = supabaseConfig(env);
  if (!config.available) return unavailable("missing_supabase_config", null);
  const query = new URLSearchParams({ on_conflict: "definition_key,version" });
  const rows = await restFetch(fetchImpl, `${config.url}/rest/v1/journey_definitions?${query}`, {
    method: "POST",
    headers: { ...restHeaders(config.key), "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({
      definition_key: definition.definitionKey,
      version: definition.version,
      product_code: definition.productCode,
      journey_type: definition.journeyType,
      status: definition.status,
      config: definition.config,
      checksum: definition.checksum,
    }),
  });
  const row = Array.isArray(rows) ? rows[0] || null : rows;
  return { available: true, skipped: false, duplicate: !row, row };
}

async function getJourneyInstanceByKey({ instanceKey, context = {}, env, fetchImpl, log }) {
  const gate = gateFeature(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env, log, "get_instance");
  if (!gate.enabled) return noOp(gate, null);
  const key = clean(instanceKey).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:-]{2,199}$/.test(key)) return { available: true, skipped: true, reason: "invalid_instance_key", row: null };
  const config = supabaseConfig(env);
  if (!config.available) return unavailable("missing_supabase_config", null);
  const query = new URLSearchParams({ select: "*", instance_key: `eq.${key}`, limit: "1" });
  const rows = await restFetch(fetchImpl, `${config.url}/rest/v1/journey_instances?${query}`, { headers: restHeaders(config.key) });
  return { available: true, skipped: false, row: Array.isArray(rows) ? rows[0] || null : rows };
}

async function recordJourneyEvent({ input, settings = {}, env, fetchImpl, log }) {
  const context = settings.context || {};
  const engineGate = gateFeature(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env, log, "record_event");
  if (!engineGate.enabled) return noOp(engineGate, null);
  const event = validateBusinessEvent(input);
  const config = supabaseConfig(env);
  if (!config.available) return unavailable("missing_supabase_config", null);

  let outbox = null;
  let outboxSkippedReason = "";
  if (settings.outbox) {
    const mailGate = gateFeature(FEATURE_FLAGS.JOURNEY_EMAIL_AUTOMATION_ENABLED, { ...context, environment: event.environment }, env, log, "enqueue_effect");
    if (mailGate.enabled) outbox = validateOutboxInput(settings.outbox);
    else outboxSkippedReason = mailGate.reason;
  }

  const rows = await restFetch(fetchImpl, `${config.url}/rest/v1/rpc/record_journey_event_and_enqueue`, {
    method: "POST",
    headers: { ...restHeaders(config.key), "Content-Type": "application/json" },
    body: JSON.stringify({
      p_event_key: event.eventKey,
      p_event_type: event.eventType,
      p_entity_type: event.entityType,
      p_entity_id: event.entityId,
      p_customer_id: event.customerId,
      p_journey_instance_id: event.journeyInstanceId,
      p_payload: event.payload,
      p_environment: event.environment,
      p_occurred_at: event.occurredAt,
      p_outbox_idempotency_key: outbox?.idempotencyKey || null,
      p_effect_type: outbox?.effectType || null,
      p_effect_payload: outbox?.payload || {},
      p_next_attempt_at: outbox?.nextAttemptAt || null,
    }),
  });
  const row = Array.isArray(rows) ? rows[0] || null : rows;
  log.info("journey_event_recorded", { action: "record_event", duplicate: Boolean(row?.duplicate), eventType: event.eventType, entityType: event.entityType, environment: event.environment });
  return { available: true, skipped: false, row, outboxSkipped: Boolean(outboxSkippedReason), outboxSkippedReason };
}

async function recordProviderEvent({ input, context = {}, env, fetchImpl, log }) {
  const gate = gateFeature(FEATURE_FLAGS.RESEND_EVENT_WEBHOOKS_ENABLED, context, env, log, "record_provider_event");
  if (!gate.enabled) return noOp(gate, null);
  const event = validateProviderEvent(input);
  const config = supabaseConfig(env);
  if (!config.available) return unavailable("missing_supabase_config", null);
  const query = new URLSearchParams({ on_conflict: "provider,provider_event_id" });
  const rows = await restFetch(fetchImpl, `${config.url}/rest/v1/provider_webhook_events?${query}`, {
    method: "POST",
    headers: { ...restHeaders(config.key), "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({
      provider: event.provider,
      provider_event_id: event.providerEventId,
      event_type: event.eventType,
      provider_message_id: event.providerMessageId,
      payload_hash: event.payloadHash,
      signature_verified: event.signatureVerified,
      environment: event.environment,
      payload: event.payload,
    }),
  });
  const row = Array.isArray(rows) ? rows[0] || null : rows;
  log.info("provider_event_recorded", { action: "record_provider_event", duplicate: !row, eventType: event.eventType, provider: event.provider, environment: event.environment });
  return { available: true, skipped: false, duplicate: !row, row };
}

async function listAutomationOutbox({ filters = {}, context = {}, env, fetchImpl, log }) {
  const gate = gateFeature(FEATURE_FLAGS.JOURNEY_ADMIN_ENABLED, context, env, log, "list_outbox");
  if (!gate.enabled) return noOp(gate, []);
  if (context.adminAuthorized !== true) return { available: true, skipped: true, reason: "admin_authorization_required", rows: [] };
  const config = supabaseConfig(env);
  if (!config.available) return unavailable("missing_supabase_config", []);
  const query = new URLSearchParams({ select: "*", order: "created_at.desc", limit: String(limit(filters.limit, 100)) });
  const status = clean(filters.status).toLowerCase();
  if (status && PROCESSING_STATUSES.includes(status)) query.set("status", `eq.${status}`);
  const rows = await restFetch(fetchImpl, `${config.url}/rest/v1/automation_outbox?${query}`, { headers: restHeaders(config.key) });
  return { available: true, skipped: false, rows: Array.isArray(rows) ? rows : [] };
}

function gateFeature(flagName, context, env, log, action) {
  const gate = resolveJourneyFeatureFlag(flagName, context, env);
  if (!gate.enabled) log.info("feature_noop", { action, enabled: false, featureFlag: flagName, mode: gate.mode, reason: gate.reason });
  return gate;
}

async function restFetch(fetchImpl, url, options = {}) {
  if (typeof fetchImpl !== "function") throw repositoryError("missing_fetch", 500);
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch {
    throw repositoryError("supabase_request_failed", 503);
  }
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { throw repositoryError("invalid_supabase_response", response.status || 502); }
  }
  if (!response.ok) throw repositoryError(clean(data?.code) || "supabase_request_failed", response.status || 500);
  return data;
}

function supabaseConfig(env) {
  const url = clean(env?.SUPABASE_URL).replace(/\/$/, "");
  const key = clean(env?.SUPABASE_SERVICE_ROLE_KEY);
  return { available: Boolean(/^https:\/\/[^/]+\.supabase\.co$/i.test(url) && key), url, key };
}

function restHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" };
}

function noOp(gate, value) {
  return { available: false, skipped: true, reason: gate.reason, mode: gate.mode, ...(Array.isArray(value) ? { rows: value } : { row: value }) };
}

function unavailable(reason, value) {
  return { available: false, skipped: true, reason, ...(Array.isArray(value) ? { rows: value } : { row: value }) };
}

function repositoryError(code, statusCode) {
  const error = new Error("Journey repository request failed.");
  error.name = "JourneyRepositoryError";
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function limit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), 250) : fallback;
}

function clean(value) {
  return String(value || "").trim();
}

module.exports = {
  createJourneyRepository,
  _private: { restFetch, supabaseConfig },
};
