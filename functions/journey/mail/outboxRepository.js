const { createJourneyLogger } = require("../logger");

function createMailOutboxRepository(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || global.fetch;
  const log = options.log || createJourneyLogger({ logger: options.logger, component: "journey_mail_repository" });
  const config = supabaseConfig(env);
  return {
    claimBatch: (input) => claimBatch({ input, config, fetchImpl, log }),
    beginExecution: (item, command) => beginExecution({ item, command, config, fetchImpl }),
    markExecutionSent: (execution, result) => patchExecution({ execution, patch: { status: "sent", delivery_status: "sent", provider: "resend", provider_message_id: result.id, completed_at: new Date().toISOString(), last_error_code: null, last_error_message: null }, config, fetchImpl }),
    markExecutionFailed: (execution, failure) => patchExecution({ execution, patch: { status: failure.status, failed_at: new Date().toISOString(), last_error_code: failure.errorCategory, last_error_message: safeError(failure.errorCategory) }, config, fetchImpl }),
    markOutboxSent: (item) => patchOutbox({ item, patch: { status: "sent", processed_at: new Date().toISOString(), last_error_code: null, last_error_message: null }, config, fetchImpl }),
    completeOutbox: (item) => patchOutbox({ item, patch: { status: "completed", processed_at: new Date().toISOString(), lease_owner: null, lease_expires_at: null, last_error_code: null, last_error_message: null }, config, fetchImpl }),
    failOutbox: (item, failure) => patchOutbox({ item, patch: { status: failure.status, next_attempt_at: failure.nextAttemptAt, lease_owner: null, lease_expires_at: null, last_error_code: failure.errorCategory, last_error_message: safeError(failure.errorCategory) }, config, fetchImpl }),
  };
}

async function claimBatch({ input = {}, config, fetchImpl, log }) {
  if (!config.available) return unavailable("missing_supabase_config");
  const workerId = safeWorkerId(input.workerId);
  const batchSize = bounded(input.batchSize, 5, 1, 20);
  const leaseSeconds = bounded(input.leaseSeconds, 90, 15, 300);
  try {
    const rows = await rest(fetchImpl, config, "rpc/claim_automation_outbox", {
      method: "POST",
      body: { p_worker_id: workerId, p_batch_size: batchSize, p_lease_seconds: leaseSeconds, p_environment: "test" },
    });
    return { available: true, storageAvailable: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    if (isStorageUnavailable(error)) {
      log.info("mail_storage_unavailable", { operation: "claim_outbox", result: "storage_unavailable", reason: "table_or_rpc_missing" });
      return unavailable("storage_unavailable");
    }
    throw error;
  }
}

async function beginExecution({ item, command, config, fetchImpl }) {
  if (!config.available) return unavailable("missing_supabase_config");
  const idempotencyKey = command.outboxIdempotencyKey;
  const record = {
    outbox_id: item.id,
    automation_key: command.automationKey,
    trigger_event_type: item.event_type,
    template_key: command.templateKey,
    template_version: command.templateVersion,
    provider: "resend",
    status: "processing",
    delivery_status: "not_sent",
    attempt_count: Number(item.attempt_count || 1),
    started_at: new Date().toISOString(),
    idempotency_key: idempotencyKey,
    environment: "test",
    metadata: { testMode: true, recipientFingerprint: command.recipientPolicy.recipientFingerprint },
  };
  try {
    const inserted = await rest(fetchImpl, config, "automation_executions?on_conflict=idempotency_key", { method: "POST", prefer: "resolution=ignore-duplicates,return=representation", body: record });
    if (Array.isArray(inserted) && inserted[0]) return { available: true, created: true, row: inserted[0] };
    const rows = await rest(fetchImpl, config, `automation_executions?select=*&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`, { method: "GET" });
    return { available: true, created: false, row: Array.isArray(rows) ? rows[0] || null : null };
  } catch (error) {
    if (isStorageUnavailable(error)) return unavailable("storage_unavailable");
    throw error;
  }
}

async function patchExecution({ execution, patch: values, config, fetchImpl }) {
  if (!execution?.id) throw repoError("execution_missing", 409);
  return patch(config, fetchImpl, `automation_executions?id=eq.${encodeURIComponent(execution.id)}`, values);
}
async function patchOutbox({ item, patch: values, config, fetchImpl }) {
  if (!item?.id) throw repoError("outbox_item_missing", 409);
  const leaseFilter = item.lease_owner ? `&lease_owner=eq.${encodeURIComponent(item.lease_owner)}` : "";
  return patch(config, fetchImpl, `automation_outbox?id=eq.${encodeURIComponent(item.id)}${leaseFilter}`, values);
}
async function patch(config, fetchImpl, path, values) {
  const rows = await rest(fetchImpl, config, path, { method: "PATCH", prefer: "return=representation", body: { ...values, updated_at: new Date().toISOString() } });
  if (!Array.isArray(rows) || !rows[0]) throw repoError("lease_lost", 409);
  return { available: true, row: rows[0] };
}

async function rest(fetchImpl, config, path, options = {}) {
  if (typeof fetchImpl !== "function") throw repoError("missing_fetch", 500);
  let response;
  const headers = { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.prefer) headers.Prefer = options.prefer;
  try { response = await fetchImpl(`${config.url}/rest/v1/${path}`, { method: options.method || "GET", headers, body: options.body ? JSON.stringify(options.body) : undefined }); }
  catch { throw repoError("supabase_request_failed", 503); }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : []; } catch { throw repoError("invalid_supabase_response", 502); }
  if (!response.ok) { const error = repoError(String(data?.code || "supabase_request_failed"), response.status || 500); error.details = String(data?.message || data?.details || ""); throw error; }
  return data;
}

function isStorageUnavailable(error = {}) { const details = String(error.details || "").toLowerCase(); return error.statusCode === 404 || ["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code) || details.includes("schema cache") || details.includes("does not exist") || details.includes("could not find"); }
function supabaseConfig(env) { const url = String(env.SUPABASE_URL || "").trim().replace(/\/$/, ""); const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim(); return { available: Boolean(/^https:\/\/[^/]+\.supabase\.co$/i.test(url) && key), url, key }; }
function unavailable(reason) { return { available: false, storageAvailable: false, reason, rows: [], row: null }; }
function safeWorkerId(value) { const id = String(value || "").trim(); if (!/^[a-z0-9][a-z0-9._:-]{2,80}$/i.test(id)) throw repoError("invalid_worker_id", 400); return id; }
function bounded(value, fallback, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function safeError(value) { return String(value || "mail_processing_failed").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 120); }
function repoError(code, statusCode) { const error = new Error("Journey mail storage request failed."); error.name = "JourneyMailRepositoryError"; error.code = code; error.statusCode = statusCode; return error; }

module.exports = { createMailOutboxRepository, _private: { isStorageUnavailable, safeWorkerId } };
