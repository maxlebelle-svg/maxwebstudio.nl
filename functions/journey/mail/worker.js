const { randomUUID } = require("crypto");
const { sendTrackedEmail } = require("../../services/resendMailService");
const { createJourneyLogger } = require("../logger");
const { validateMailCommand } = require("./command");
const { createMailOutboxRepository } = require("./outboxRepository");
const { evaluateJourneyEmailMode } = require("./recipientPolicy");
const { renderJourneyMail } = require("./templateRenderer");
const { classifyMailError, nextOutboxFailure } = require("./statusModel");

function createJourneyMailWorker(options = {}) {
  const env = options.env || process.env;
  const repository = options.repository || createMailOutboxRepository(options);
  const mailSender = options.mailSender || sendTrackedEmail;
  const log = options.log || createJourneyLogger({ logger: options.logger, component: "journey_mail_worker" });
  const now = options.now || (() => Date.now());
  return { run: (input = {}, context = {}) => runWorker({ input, context, env, repository, mailSender, log, now }) };
}

async function runWorker({ input, context, env, repository, mailSender, log, now }) {
  const startedAt = now();
  const mode = evaluateJourneyEmailMode({ ...context, environment: context.environment || "test", scopeKey: context.scopeKey || "journey-mail-worker" }, env);
  if (!mode.allowed) return summary({ result: "disabled", featureFlagDecision: mode.reason, storageAvailable: null, durationMs: now() - startedAt });
  const batchSize = bounded(input.batchSize || env.JOURNEY_EMAIL_WORKER_BATCH_SIZE, 5, 1, 20);
  const maxDurationMs = bounded(input.maxDurationMs || env.JOURNEY_EMAIL_WORKER_MAX_DURATION_MS, 8000, 500, 20000);
  const workerId = String(input.workerId || `journey-mail-${randomUUID()}`).slice(0, 80);
  const claimed = await repository.claimBatch({ workerId, batchSize, leaseSeconds: Math.ceil(maxDurationMs / 1000) + 30 });
  if (!claimed.available) return summary({ result: "storage_unavailable", featureFlagDecision: mode.reason, storageAvailable: false, durationMs: now() - startedAt });
  const result = summary({ result: "completed", featureFlagDecision: mode.reason, storageAvailable: true, claimed: claimed.rows.length });
  for (const item of claimed.rows) {
    if (now() - startedAt >= maxDurationMs) { result.timedOut += 1; break; }
    const itemResult = await processItem({ item, context, env, repository, mailSender, log, now }).catch((error) => ({ outcome: "failed", errorCategory: safeCategory(error) }));
    result[itemResult.outcome] = (result[itemResult.outcome] || 0) + 1;
  }
  result.durationMs = now() - startedAt;
  log.info("mail_worker_completed", { operation: "process_outbox", result: result.result, recordCount: result.claimed, durationMs: result.durationMs, featureFlagDecision: result.featureFlagDecision, testMode: true });
  return result;
}

async function processItem({ item, context, env, repository, mailSender, log, now }) {
  let execution = null;
  let acceptedProviderId = "";
  try {
    const command = validateMailCommand(item.payload?.mailCommand || item.payload || {}, { ...context, environment: "test", scopeKey: context.scopeKey || "journey-mail-worker" }, env);
    const begun = await repository.beginExecution(item, command);
    if (!begun.available || !begun.row) throw processingError(begun.reason || "execution_storage_unavailable", false);
    execution = begun.row;
    if (execution.provider_message_id || ["sent", "completed"].includes(execution.status)) {
      await repository.completeOutbox(item);
      return { outcome: "recovered", providerResult: "existing_provider_message" };
    }
    const rendered = renderJourneyMail(command);
    const sendResult = await mailSender({
      from: "Max Webstudio <info@maxwebstudio.nl>",
      to: command.recipient,
      replyTo: command.replyToProfile.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateKey: `${rendered.templateKey}.v${rendered.templateVersion}`,
      templateName: command.templateKey === "journey.preview_ready" ? "Journey preview ready v1" : command.templateKey === "journey.feedback_received" ? "Journey feedback received v1" : command.templateKey === "journey.preview_approved" ? "Journey preview approved v1" : "Journey test status update",
      triggeredBy: "journey_mail_worker_test",
      suppressTimelineEvent: true,
      idempotencyKey: providerIdempotencyKey(command.outboxIdempotencyKey),
      timeoutMs: bounded(env.JOURNEY_EMAIL_PROVIDER_TIMEOUT_MS, 5000, 500, 10000),
      metadata: { testMode: true, automationKey: command.automationKey, outboxFingerprint: fingerprint(item.id) },
    });
    if (!sendResult?.sent || !sendResult.id) throw processingError(sendResult?.errorCode || "provider_send_failed", sendResult?.retryable === true, sendResult?.statusCode, sendResult?.ambiguous === true);
    acceptedProviderId = String(sendResult.id);
    await repository.markExecutionSent(execution, sendResult);
    await repository.markOutboxSent(item);
    await repository.completeOutbox(item);
    log.info("mail_item_processed", { operation: "send_test_mail", result: "completed", automationKey: command.automationKey, templateKey: command.templateKey, templateVersion: command.templateVersion, attempt: Number(item.attempt_count || 1), providerResult: "accepted", outboxFingerprint: fingerprint(item.id), testMode: true });
    return { outcome: "completed", providerResult: "accepted" };
  } catch (error) {
    const classification = classifyMailError({ code: error.code, statusCode: error.statusCode, retryable: error.retryable, ambiguous: error.ambiguous });
    const failure = nextOutboxFailure({ attempt: Number(item.attempt_count || 1), maxAttempts: bounded(env.JOURNEY_EMAIL_MAX_ATTEMPTS, 4, 1, 10), retryable: classification.retryable, nowMs: now(), baseMs: bounded(env.JOURNEY_EMAIL_RETRY_BASE_MS, 120000, 100, 3600000), maxMs: bounded(env.JOURNEY_EMAIL_RETRY_MAX_MS, 2700000, 100, 86400000), random: () => 0.5 });
    const acceptedButUnrecorded = Boolean(acceptedProviderId);
    const update = acceptedButUnrecorded
      ? { status: "dead_letter", terminal: true, retryable: false, nextAttemptAt: null, attempt: Number(item.attempt_count || 1), errorCategory: "ambiguous_send" }
      : { ...failure, errorCategory: classification.ambiguous ? "ambiguous_send" : classification.category };
    if (execution?.id) await repository.markExecutionFailed(execution, update).catch(() => null);
    await repository.failOutbox(item, update).catch(() => null);
    log.error("mail_item_failed", { operation: "send_test_mail", result: update.status, errorCategory: update.errorCategory, attempt: Number(item.attempt_count || 1), outboxFingerprint: fingerprint(item.id), testMode: true });
    return { outcome: update.status === "dead_letter" ? "deadLetter" : "failed", errorCategory: update.errorCategory };
  }
}

function summary(values = {}) { return { result: values.result || "completed", featureFlagDecision: values.featureFlagDecision || "", storageAvailable: values.storageAvailable, claimed: values.claimed || 0, completed: 0, recovered: 0, failed: 0, deadLetter: 0, timedOut: 0, durationMs: values.durationMs || 0 }; }
function providerIdempotencyKey(value) { return `journey/${String(value || "").slice(0, 240)}`.slice(0, 256); }
function fingerprint(value) { return require("crypto").createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12); }
function processingError(code, retryable, statusCode = 0, ambiguous = false) { const error = new Error("Journey mail processing failed."); error.code = code; error.retryable = retryable; error.statusCode = statusCode; error.ambiguous = ambiguous; return error; }
function safeCategory(error) { return String(error?.code || error?.name || "mail_processing_failed").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 100).toLowerCase(); }
function bounded(value, fallback, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }

module.exports = { createJourneyMailWorker, _private: { processItem, providerIdempotencyKey } };
