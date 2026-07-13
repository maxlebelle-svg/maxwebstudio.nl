const { createHash } = require("crypto");
const { createJourneyRepository } = require("../repository");
const { createJourneyLogger } = require("../logger");
const { validateMailCommand } = require("../mail/command");
const { classifyFeedback } = require("./category");
const { resolveFeedbackOwnership } = require("./ownershipResolver");
const { planFeedbackProgress } = require("./progressTransition");
const { createFeedbackReceivedRepository } = require("./repository");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createFeedbackReceivedService(options = {}) {
  const env = options.env || process.env;
  const journeyRepository = options.journeyRepository || createJourneyRepository(options);
  const feedbackRepository = options.feedbackRepository || createFeedbackReceivedRepository(options);
  const log = options.log || createJourneyLogger({ logger: options.logger, component: "feedback_received_ownership" });
  return { dispatch: (input) => dispatch({ input, env, journeyRepository, feedbackRepository, log }) };
}

async function dispatch({ input = {}, env, journeyRepository, feedbackRepository, log }) {
  const legacy = typeof input.legacySend === "function" ? input.legacySend : async () => null;
  const customerId = clean(input.customerId);
  const previewVersionId = clean(input.previewVersionId);
  const feedbackId = clean(input.feedbackId);
  if (!clean(input.recipient)) return result("none", "recipient_missing");
  if (![customerId, previewVersionId, feedbackId].every((value) => UUID.test(value))) return legacyResult(legacy, "stable_feedback_scope_missing");
  const baseOwnershipInput = { ...input, customerId, previewVersionId, feedbackId, runtimeEnvironment: runtimeEnvironment(env) };
  const preflight = resolveFeedbackOwnership({ ...baseOwnershipInput, journeyInstance: null, transition: null }, env);
  if (preflight.reason !== "test_journey_missing") return legacyResult(legacy, preflight.reason);

  let lookup;
  try { lookup = await feedbackRepository.findTestJourney(customerId); } catch { lookup = { available: false, row: null, reason: "storage_read_failed" }; }
  if (!lookup?.available) return legacyResult(legacy, lookup?.reason || "storage_unavailable");
  const transition = planFeedbackProgress(lookup.row || {}, feedbackId);
  const ownership = resolveFeedbackOwnership({ ...baseOwnershipInput, journeyInstance: lookup.row, transition }, env);
  const keys = stableKeys({ customerId, previewVersionId, feedbackId, templateVersion: 1 });
  ownership.eventKey = keys.eventKey;
  if (ownership.owner === "none") return result("none", ownership.reason);
  if (ownership.owner === "legacy") return legacyResult(legacy, ownership.reason);

  const classification = classifyFeedback(input);
  let command;
  try {
    command = validateMailCommand({ automationKey: "journey.feedback_received", templateKey: "journey.feedback_received", templateVersion: 1, journeyEventKey: keys.eventKey, outboxIdempotencyKey: keys.outboxKey, customerReference: customerId, journeyInstanceReference: lookup.row.id, recipient: input.recipient, replyToProfile: { email: "info@maxwebstudio.nl" }, subjectData: { label: clean(input.projectLabel) || "uw website" }, templateData: { firstName: clean(input.firstName), projectLabel: clean(input.projectLabel) || "uw website", previewVersionLabel: clean(input.previewVersionLabel) || "Website-preview", feedbackCategory: classification.label, feedbackPointCount: classification.count, submittedAt: safeDate(input.submittedAt), percentage: transition.after.percentage, currentPhase: "Feedback verwerken", nextStep: "Wij verwerken de wijzigingen en laten het weten zodra een bijgewerkte versie klaarstaat", contactName: clean(input.contactName) || "Team Max Webstudio", contactRole: clean(input.contactRole), contactPhone: clean(input.contactPhone) }, actionUrl: "https://maxwebstudio.nl/klantportaal.html#website-review", locale: "nl", metadata: { scenario: "feedback_received_test_customer", previewVersionReference: previewVersionId, feedbackReference: feedbackFingerprint(feedbackId) } }, { customerId, journeyInstanceId: lookup.row.id, environment: "test" }, env);
  } catch (error) {
    log.info("feedback_validation_fallback", { operation: "feedback_received_dispatch", result: "legacy", owner: "legacy", errorCategory: safeCode(error), testMode: true });
    return legacyResult(legacy, safeCode(error));
  }

  try {
    const stored = await journeyRepository.recordJourneyEvent({ eventKey: keys.eventKey, eventType: "preview.feedback_received", entityType: "preview", entityId: previewVersionId, customerId, journeyInstanceId: lookup.row.id, environment: "test", occurredAt: safeDate(input.submittedAt) || new Date().toISOString(), payload: { source: "client_preview_versions", testMode: true, ownership: "journey", ownershipReason: ownership.reason, previewVersionReference: previewVersionId, feedbackReference: feedbackFingerprint(feedbackId), feedbackCategory: classification.key, feedbackPointCount: classification.count, sideEffects: safeSideEffects(input.sideEffects), progressBefore: transition.before.percentage, progressAfter: transition.after.percentage } }, { context: { customerId, journeyInstanceId: lookup.row.id, journeyKey: lookup.row.instance_key, entityId: feedbackId, environment: "test" }, outbox: { idempotencyKey: keys.outboxKey, effectType: "email.feedback_received", payload: { mailCommand: command, ownership: "journey", ownershipReason: ownership.reason, previewVersionReference: previewVersionId, feedbackReference: feedbackFingerprint(feedbackId), progressBefore: transition.before.percentage, progressAfter: transition.after.percentage } } });
    if (!stored?.available) return legacyResult(legacy, stored?.reason || "storage_unavailable");
    if (!stored?.row?.outbox_id) throw Object.assign(new Error("feedback outbox unavailable"), { code: "outbox_not_created" });
    let progress = { updated: false, reason: transition.duplicate ? "duplicate_progress" : "progress_not_attempted", before: transition.before, after: transition.after };
    try { const update = await feedbackRepository.applyProgress(lookup.row, transition); progress = { updated: Boolean(update?.available && !update?.skipped), reason: update?.reason || "progress_write_failed", before: transition.before, after: transition.after }; } catch { progress.reason = "progress_write_failed"; }
    log.info("feedback_owner_selected", { operation: "feedback_received_dispatch", result: "accepted", owner: "journey", eventType: "preview.feedback_received", entityType: "preview", duplicate: Boolean(stored.row.duplicate), testMode: true });
    return { ...result("journey", stored.row.duplicate ? "duplicate_suppressed" : "journey_outbox_accepted"), durable: true, eligibility: "eligible", fallbackAllowed: false, eventKey: keys.eventKey, outboxId: stored.row.outbox_id, duplicate: Boolean(stored.row.duplicate), feedbackReference: feedbackFingerprint(feedbackId), progress };
  } catch (error) {
    log.error("feedback_journey_enqueue_failed", { operation: "feedback_received_dispatch", result: "failed", owner: "journey", errorCategory: safeCode(error), testMode: true });
    return { ...result("journey", "journey_enqueue_ambiguous_no_legacy"), eligibility: "eligible", fallbackAllowed: false, eventKey: keys.eventKey, failed: true, feedbackReference: feedbackFingerprint(feedbackId) };
  }
}

function stableKeys({ customerId, previewVersionId, feedbackId, templateVersion }) { const scope = hash(`${customerId}:${previewVersionId}:${feedbackId}:email.feedback_received:v${templateVersion}`); return { eventKey: `preview.feedback_received:${scope}`, outboxKey: `preview.feedback_received.email:${scope}:v${templateVersion}` }; }
function safeSideEffects(value = {}) { return { changeRequestReady: value.changeRequestReady === true, timelineReady: value.timelineReady === true, notificationReady: value.notificationReady === true }; }
async function legacyResult(legacy, reason) { await legacy(); return result("legacy", reason); }
function result(owner, reason) { return { owner, reason, durable: false, eligibility: owner === "journey" ? "eligible" : "ineligible", fallbackAllowed: owner === "legacy", eventKey: null, testMode: true, duplicate: false, failed: false }; }
function feedbackFingerprint(value) { return hash(value).slice(0, 16); }
function safeDate(value) { const date = new Date(value || Date.now()); return Number.isNaN(date.getTime()) ? "" : date.toISOString(); }
function runtimeEnvironment(env) { return [env.APP_ENV, env.APP_ENVIRONMENT, env.CONTEXT, env.NETLIFY_ENV].some((value) => ["production", "prod"].includes(clean(value).toLowerCase())) ? "production" : "test"; }
function safeCode(error) { return clean(error?.code || error?.name || "feedback_enqueue_failed").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80).toLowerCase(); }
function hash(value) { return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 40); }
function clean(value) { return String(value || "").trim(); }

module.exports = { createFeedbackReceivedService, _private: { feedbackFingerprint, stableKeys } };
