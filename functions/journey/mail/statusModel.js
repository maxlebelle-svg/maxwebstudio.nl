const OUTBOX_STATUSES = Object.freeze(["pending", "processing", "sent", "completed", "failed", "cancelled", "dead_letter"]);
const RETRYABLE_STATUSES = Object.freeze(["pending", "failed"]);
const TERMINAL_STATUSES = Object.freeze(["completed", "cancelled", "dead_letter"]);
const MAX_ATTEMPTS_DEFAULT = 4;

function nextOutboxFailure(input = {}) {
  const attempt = positiveInteger(input.attempt, 1);
  const maxAttempts = boundedInteger(input.maxAttempts, MAX_ATTEMPTS_DEFAULT, 1, 10);
  const retryable = input.retryable === true;
  if (!retryable || attempt >= maxAttempts) {
    return { status: "dead_letter", terminal: true, retryable: false, nextAttemptAt: null, attempt };
  }
  return {
    status: "failed",
    terminal: false,
    retryable: true,
    nextAttemptAt: new Date(Number(input.nowMs || Date.now()) + backoffDelayMs(attempt, input)).toISOString(),
    attempt,
  };
}

function backoffDelayMs(attempt, options = {}) {
  const baseMs = boundedInteger(options.baseMs, 2 * 60 * 1000, 100, 60 * 60 * 1000);
  const maxMs = boundedInteger(options.maxMs, 45 * 60 * 1000, baseMs, 24 * 60 * 60 * 1000);
  const jitterRatio = boundedNumber(options.jitterRatio, 0.15, 0, 0.5);
  const random = typeof options.random === "function" ? options.random() : Math.random();
  const raw = Math.min(maxMs, baseMs * (2 ** Math.max(0, positiveInteger(attempt, 1) - 1)));
  const jitter = raw * jitterRatio * ((Math.max(0, Math.min(1, random)) * 2) - 1);
  return Math.max(100, Math.round(raw + jitter));
}

function classifyMailError(input = {}) {
  const code = text(input.code).toLowerCase();
  const status = Number(input.statusCode || input.status || 0);
  if (["provider_timeout", "provider_request_error", "network_error", "concurrent_idempotent_requests"].includes(code)) return result(true, code || "temporary_provider_error", Boolean(input.ambiguous));
  if (status === 429 || status >= 500) return result(true, status === 429 ? "provider_rate_limited" : "provider_temporary_error", Boolean(input.ambiguous));
  if (["recipient_not_allowed", "invalid_recipient", "invalid_mail_command", "template_not_found", "unsafe_action_url", "payload_too_large", "provider_suppressed", "provider_complaint", "invalid_idempotent_request"].includes(code)) return result(false, code, false);
  return result(input.retryable === true, code || "mail_processing_failed", Boolean(input.ambiguous));
}

function result(retryable, category, ambiguous) { return { retryable, category, ambiguous }; }
function positiveInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function boundedInteger(value, fallback, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function boundedNumber(value, fallback, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }
function text(value) { return String(value || "").trim(); }

module.exports = { MAX_ATTEMPTS_DEFAULT, OUTBOX_STATUSES, RETRYABLE_STATUSES, TERMINAL_STATUSES, backoffDelayMs, classifyMailError, nextOutboxFailure };
