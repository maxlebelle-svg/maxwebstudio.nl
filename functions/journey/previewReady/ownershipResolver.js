const { resolveJourneyFeatureFlag, parseAllowlist } = require("../featureFlags");
const { FEATURE_FLAGS } = require("../types");

function resolvePreviewReadyOwnership(input = {}, env = process.env) {
  const customerId = clean(input.customerId);
  const recipient = clean(input.recipient).toLowerCase();
  if (!recipient) return decision("none", "recipient_missing", false, false);

  const context = {
    customerId,
    journeyInstanceId: clean(input.journeyInstance?.id),
    journeyKey: clean(input.journeyInstance?.instance_key),
    entityId: clean(input.previewVersionId),
    environment: input.runtimeEnvironment || "production",
  };
  const engine = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env);
  const mail = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_EMAIL_AUTOMATION_ENABLED, context, env);
  if (!engine.enabled || !mail.enabled) return decision("legacy", !engine.enabled ? engine.reason : mail.reason, false, true);

  const selectedCustomers = parseAllowlist(env.JOURNEY_PREVIEW_READY_TEST_CUSTOMERS);
  if (!customerId || !selectedCustomers.has(customerId)) return decision("legacy", "customer_not_selected_for_preview_ready_test", false, true);
  const instance = input.journeyInstance || {};
  if (!clean(instance.id)) return decision("legacy", "test_journey_missing", false, true);
  if (instance.environment !== "test" || instance.status !== "active") return decision("legacy", "test_journey_inactive", false, true);
  if (instance.metadata?.testOnly !== true || instance.metadata?.previewReadyEmailOwner !== "journey") return decision("legacy", "test_journey_not_owner", false, true);
  return decision("journey", "explicit_test_journey_eligible", false, true);
}

function decision(owner, reason, durable, fallbackAllowed) { return { owner, reason, durable, eligibility: owner === "journey" ? "eligible" : "ineligible", fallbackAllowed, eventKey: null, testMode: true }; }
function clean(value) { return String(value || "").trim(); }

module.exports = { resolvePreviewReadyOwnership };
