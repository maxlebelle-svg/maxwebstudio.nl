const { createHash } = require("crypto");
const { createJourneyRepository } = require("../repository");
const { createJourneyLogger } = require("../logger");
const { validateMailCommand } = require("../mail/command");
const { resolvePreviewReadyOwnership } = require("./ownershipResolver");
const { createPreviewReadyRepository } = require("./repository");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createPreviewReadyService(options = {}) {
  const env = options.env || process.env;
  const journeyRepository = options.journeyRepository || createJourneyRepository(options);
  const previewRepository = options.previewRepository || createPreviewReadyRepository(options);
  const log = options.log || createJourneyLogger({ logger: options.logger, component: "preview_ready_ownership" });
  return { dispatch: (input) => dispatch({ input, env, journeyRepository, previewRepository, log }) };
}

async function dispatch({ input = {}, env, journeyRepository, previewRepository, log }) {
  const legacy = typeof input.legacySend === "function" ? input.legacySend : async () => null;
  const customerId = clean(input.customerId);
  const previewVersionId = clean(input.previewVersionId);
  if (!clean(input.recipient)) return result("none", "recipient_missing");
  if (!UUID.test(customerId) || !UUID.test(previewVersionId)) return legacyResult(legacy, "stable_scope_missing");

  let lookup;
  try { lookup = await previewRepository.findTestJourney(customerId); } catch { lookup = { available: false, row: null, reason: "storage_read_failed" }; }
  if (!lookup?.available) return legacyResult(legacy, lookup?.reason || "storage_unavailable");
  const keys = stableKeys({ customerId, previewVersionId, templateVersion: 1 });
  const ownership = resolvePreviewReadyOwnership({ ...input, customerId, previewVersionId, journeyInstance: lookup.row, runtimeEnvironment: runtimeEnvironment(env) }, env);
  ownership.eventKey = keys.eventKey;
  if (ownership.owner === "none") return result("none", ownership.reason);
  if (ownership.owner === "legacy") return legacyResult(legacy, ownership.reason);

  let command;
  try {
    command = validateMailCommand({
      automationKey: "journey.preview_ready",
      templateKey: "journey.preview_ready",
      templateVersion: 1,
      journeyEventKey: keys.eventKey,
      outboxIdempotencyKey: keys.outboxKey,
      customerReference: customerId,
      journeyInstanceReference: lookup.row.id,
      recipient: input.recipient,
      replyToProfile: { email: "info@maxwebstudio.nl" },
      subjectData: { label: clean(input.businessLabel) || "uw website" },
      templateData: { firstName: clean(input.firstName), projectLabel: clean(input.businessLabel) || "uw website", previewVersionLabel: clean(input.previewVersionLabel) || "Nieuwe versie", percentage: Number(lookup.row.progress_percent || 70), currentPhase: clean(lookup.row.current_phase) || "Preview en controle", nextStep: "Bekijk de preview en geef uw feedback of goedkeuring", contactName: clean(input.contactName) || "Team Max Webstudio", contactRole: clean(input.contactRole), contactPhone: clean(input.contactPhone) },
      actionUrl: `https://maxwebstudio.nl/preview.html?version=${encodeURIComponent(previewVersionId)}`,
      locale: "nl",
      metadata: { scenario: "preview_ready_test_customer", previewVersionReference: previewVersionId },
    }, { customerId, journeyInstanceId: lookup.row.id, environment: "test" }, env);
  } catch (error) {
    log.info("preview_ready_validation_fallback", { operation: "preview_ready_dispatch", result: "legacy", owner: "legacy", errorCategory: safeCode(error), testMode: true });
    return legacyResult(legacy, safeCode(error));
  }
  try {
    const stored = await journeyRepository.recordJourneyEvent({
      eventKey: keys.eventKey, eventType: "preview.ready", entityType: "preview", entityId: previewVersionId,
      customerId, journeyInstanceId: lookup.row.id, environment: "test", occurredAt: input.occurredAt || new Date().toISOString(),
      payload: { source: "website_factory", testMode: true, previewVersionReference: previewVersionId, ownership: "journey" },
    }, { context: { customerId, journeyInstanceId: lookup.row.id, journeyKey: lookup.row.instance_key, entityId: previewVersionId, environment: "test" }, outbox: { idempotencyKey: keys.outboxKey, effectType: "email.preview_ready", payload: { mailCommand: command, ownership: "journey", previewVersionReference: previewVersionId } } });
    if (!stored?.available) return legacyResult(legacy, stored?.reason || "storage_unavailable");
    if (!stored?.row?.outbox_id) throw Object.assign(new Error("durable outbox unavailable"), { code: "outbox_not_created" });
    log.info("preview_ready_owner_selected", { operation: "preview_ready_dispatch", result: "accepted", owner: "journey", eventType: "preview.ready", entityType: "preview", testMode: true, duplicate: Boolean(stored.row.duplicate) });
    return { ...result("journey", stored.row.duplicate ? "duplicate_suppressed" : "journey_outbox_accepted"), durable: true, eligibility: "eligible", fallbackAllowed: false, eventKey: keys.eventKey, duplicate: Boolean(stored.row.duplicate), outboxId: stored.row.outbox_id };
  } catch (error) {
    // A test journey is the durable owner. Never invoke legacy after that ownership
    // was selected: an ambiguous storage response must not create a double send.
    log.error("preview_ready_journey_enqueue_failed", { operation: "preview_ready_dispatch", result: "failed", owner: "journey", errorCategory: safeCode(error), testMode: true });
    return { ...result("journey", "journey_enqueue_ambiguous_no_legacy"), durable: false, eligibility: "eligible", fallbackAllowed: false, eventKey: keys.eventKey, failed: true };
  }
}

async function legacyResult(legacy, reason) { await legacy(); return result("legacy", reason); }
function result(owner, reason) { return { owner, reason, durable: false, eligibility: owner === "journey" ? "eligible" : "ineligible", fallbackAllowed: owner === "legacy", eventKey: null, testMode: true, duplicate: false, failed: false }; }
function stableKeys({ customerId, previewVersionId, templateVersion }) { const scope = hash(`${customerId}:${previewVersionId}:journey.preview_ready:v${templateVersion}`); return { eventKey: `preview.ready:${scope}`, outboxKey: `preview.ready.email:${scope}:v${templateVersion}` }; }
function hash(value) { return createHash("sha256").update(value).digest("hex").slice(0, 40); }
function runtimeEnvironment(env) { return [env.APP_ENV, env.APP_ENVIRONMENT, env.CONTEXT, env.NETLIFY_ENV].some((value) => ["production", "prod"].includes(clean(value).toLowerCase())) ? "production" : "test"; }
function safeCode(error) { return clean(error?.code || error?.name || "enqueue_failed").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80).toLowerCase(); }
function clean(value) { return String(value || "").trim(); }

module.exports = { createPreviewReadyService, _private: { stableKeys } };
