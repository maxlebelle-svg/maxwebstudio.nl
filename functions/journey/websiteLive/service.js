const { createHash } = require("crypto");
const { createJourneyRepository } = require("../repository");
const { createJourneyLogger } = require("../logger");
const { validateMailCommand } = require("../mail/command");
const { resolveWebsiteLiveOwnership } = require("./ownershipResolver");
const { planWebsiteLiveProgress } = require("./progressTransition");
const { createWebsiteLiveRepository } = require("./repository");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createWebsiteLiveService(options = {}) {
  const env = options.env || process.env;
  const journeyRepository = options.journeyRepository || createJourneyRepository(options);
  const websiteRepository = options.websiteRepository || createWebsiteLiveRepository(options);
  const log = options.log || createJourneyLogger({ logger: options.logger, component: "website_live_ownership" });
  return { dispatch: (input) => dispatch(input, env, journeyRepository, websiteRepository, log) };
}

async function dispatch(input = {}, env, journeyRepository, websiteRepository, log) {
  const legacy = typeof input.legacySend === "function" ? input.legacySend : async () => null;
  const customerId = text(input.customerId);
  const websiteId = text(input.websiteId);
  const projectId = text(input.projectId);
  const recipient = text(input.recipient);
  const context = input.websiteLiveContext || {};
  if (!recipient) return base("none", "recipient_missing");
  if (!UUID.test(customerId) || !UUID.test(websiteId) || !UUID.test(projectId) || !text(context.publicationReference)) return base("none", "stable_website_live_scope_missing");
  const runtimeEnvironment = runtime(env);
  const preflight = resolveWebsiteLiveOwnership({ ...input, customerId, websiteId, runtimeEnvironment, journeyInstance: null, transition: null }, env);
  if (preflight.owner === "none") return base("none", preflight.reason);
  if (preflight.reason !== "test_journey_missing") return legacyResult(legacy, preflight.reason);

  let lookup;
  try { lookup = await websiteRepository.findTestJourney(customerId); } catch { lookup = { available: false, reason: "storage_read_failed" }; }
  if (!lookup?.available) return legacyResult(legacy, lookup?.reason || "storage_unavailable");
  const publicationReference = fingerprint(context.publicationReference);
  const liveHostnameFingerprint = fingerprint(context.safeHostname);
  const transition = planWebsiteLiveProgress(lookup.row || {}, publicationReference, { ...context, liveAt: input.liveAt, liveHostnameFingerprint });
  const ownership = resolveWebsiteLiveOwnership({ ...input, customerId, websiteId, runtimeEnvironment, journeyInstance: lookup.row, transition }, env);
  if (ownership.owner !== "journey") return ownership.owner === "none" ? base("none", ownership.reason) : legacyResult(legacy, ownership.reason);
  const keys = stableKeys({ customerId, websiteId, projectId, publicationReference: context.publicationReference, canonicalHost: context.safeHostname, templateVersion: 1 });
  let command;
  try {
    command = validateMailCommand({
      automationKey: "journey.website_live",
      templateKey: "journey.website_live",
      templateVersion: 1,
      journeyEventKey: keys.eventKey,
      outboxIdempotencyKey: keys.outboxKey,
      customerReference: customerId,
      journeyInstanceReference: lookup.row.id,
      recipient,
      replyToProfile: { email: text(input.replyTo) || "info@maxwebstudio.nl" },
      subjectData: { label: text(input.websiteLabel) || "Website" },
      templateData: {
        firstName: text(input.firstName),
        websiteLabel: text(input.websiteLabel) || "uw website",
        liveUrl: context.safeLiveUrl,
        portalUrl: context.safePortalCta,
        percentage: transition.after.percentage,
        currentPhase: "Nazorg",
        nextStep: nextStepCopy(context.nextStepType),
        maintenanceState: text(context.maintenanceState || "unknown"),
        contactName: text(input.contactName) || "Team Max Webstudio",
      },
      actionUrl: context.safeLiveUrl,
      metadata: { scenario: "website_live_test_customer", websiteReference: websiteId, projectReference: projectId, liveHostnameFingerprint },
    }, { customerId, journeyInstanceId: lookup.row.id, environment: "test" }, env);
  } catch (error) {
    log.info("website_live_validation_fallback", { operation: "website_live_dispatch", result: "legacy", owner: "legacy", errorCategory: code(error), testMode: true });
    return legacyResult(legacy, code(error));
  }

  const payload = safePayload(context, websiteId, projectId, publicationReference, liveHostnameFingerprint, transition, ownership.reason);
  try {
    const stored = await journeyRepository.recordJourneyEvent({
      eventKey: keys.eventKey,
      eventType: "website.live",
      entityType: "website",
      entityId: websiteId,
      customerId,
      journeyInstanceId: lookup.row.id,
      environment: "test",
      occurredAt: safeDate(input.liveAt),
      payload,
    }, {
      context: { customerId, journeyInstanceId: lookup.row.id, journeyKey: lookup.row.instance_key, entityId: websiteId, environment: "test" },
      outbox: { idempotencyKey: keys.outboxKey, effectType: "email.website_live", payload: { mailCommand: command, ...payload } },
    });
    if (!stored?.available) return legacyResult(legacy, stored?.reason || "storage_unavailable");
    if (!stored?.row?.outbox_id) throw Object.assign(new Error("outbox unavailable"), { code: "outbox_not_created" });
    let progress = { updated: false, reason: transition.duplicate ? "duplicate_progress" : "progress_not_attempted" };
    try { const update = await websiteRepository.applyProgress(lookup.row, transition); progress = { updated: Boolean(update?.available && !update?.skipped), reason: update?.reason || "progress_write_failed" }; }
    catch { progress.reason = "progress_write_failed"; }
    return { ...base("journey", stored.row.duplicate ? "duplicate_suppressed" : "journey_outbox_accepted"), durable: true, fallbackAllowed: false, duplicate: Boolean(stored.row.duplicate), eventKey: keys.eventKey, outboxId: stored.row.outbox_id, websiteReference: websiteId, progress };
  } catch (error) {
    log.error("website_live_journey_enqueue_failed", { operation: "website_live_dispatch", result: "failed", owner: "journey", errorCategory: code(error), testMode: true });
    return { ...base("journey", "journey_enqueue_ambiguous_no_legacy"), fallbackAllowed: false, failed: true, eventKey: keys.eventKey, websiteReference: websiteId };
  }
}

function safePayload(context, websiteReference, projectReference, publicationReference, liveHostnameFingerprint, transition, ownershipReason) {
  return {
    source: "website_factory_complete_launch",
    testMode: true,
    ownership: "journey",
    ownershipReason,
    websiteReference,
    projectReference,
    publicationReference,
    publicationSource: text(context.publicationSource),
    journeyType: text(context.journeyType),
    liveState: text(context.liveState),
    urlState: text(context.urlState),
    dnsState: text(context.dnsState),
    sslState: text(context.sslState),
    liveHostnameFingerprint,
    hostnameCategory: text(context.hostnameCategory),
    commercialReadinessState: text(context.commercialReadinessState),
    maintenanceState: text(context.maintenanceState),
    nextStepType: text(context.nextStepType),
    customerActionRequired: context.customerActionRequired === true,
    internalActionRequired: context.internalActionRequired === true,
    progressBefore: transition.before.percentage,
    progressAfter: transition.after.percentage,
    reviewScheduled: false,
  };
}
function stableKeys({ customerId, websiteId, projectId, publicationReference, canonicalHost, templateVersion }) { const scope = hash(`${customerId}:${websiteId}:${projectId}:${publicationReference}:${canonicalHost}:email.website_live:v${templateVersion}`); return { eventKey: `website.live:${scope}`, outboxKey: `website.live.email:${scope}:v${templateVersion}` }; }
function nextStepCopy(type) { return type === "post_launch_check" ? "Wij blijven de livegang tijdens de nazorg controleren en nemen contact op als er iets aandacht vraagt." : "De website gaat over naar nazorg en ondersteuning."; }
async function legacyResult(fn, reason) { await fn(); return base("legacy", reason); }
function base(owner, reason) { return { owner, reason, durable: false, eligibility: owner === "journey" ? "eligible" : "ineligible", fallbackAllowed: owner === "legacy", duplicate: false, failed: false, testMode: true, eventKey: null }; }
function safeDate(value) { const date = new Date(value || Date.now()); return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(); }
function runtime(env) { return [env.APP_ENV, env.APP_ENVIRONMENT, env.CONTEXT, env.NETLIFY_ENV].some((value) => ["prod", "production"].includes(text(value).toLowerCase())) ? "production" : "test"; }
function fingerprint(value) { return hash(value).slice(0, 16); }
function hash(value) { return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 40); }
function code(error) { return text(error?.code || error?.name || "website_live_dispatch_failed").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80).toLowerCase(); }
function text(value) { return String(value || "").trim(); }

module.exports = { createWebsiteLiveService, _private: { fingerprint, stableKeys } };
