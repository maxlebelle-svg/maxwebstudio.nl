const { resolveJourneyFeatureFlag, parseAllowlist } = require("../featureFlags");
const { FEATURE_FLAGS } = require("../types");

function resolveFeedbackOwnership(input = {}, env = process.env) {
  if (!clean(input.recipient)) return decision("none", "recipient_missing", false);
  const instance = input.journeyInstance || {};
  const context = { customerId: clean(input.customerId), journeyInstanceId: clean(instance.id), journeyKey: clean(instance.instance_key), entityId: clean(input.feedbackId), environment: input.runtimeEnvironment || "production" };
  const engine = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env);
  const mail = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_EMAIL_AUTOMATION_ENABLED, context, env);
  if (!engine.enabled || !mail.enabled) return decision("legacy", !engine.enabled ? engine.reason : mail.reason, true);
  const selected = parseAllowlist(env.JOURNEY_FEEDBACK_RECEIVED_TEST_CUSTOMERS);
  if (!selected.has(context.customerId)) return decision("legacy", "customer_not_selected_for_feedback_test", true);
  if (!clean(instance.id)) return decision("legacy", "test_journey_missing", true);
  if (instance.environment !== "test" || instance.status !== "active") return decision("legacy", "test_journey_inactive", true);
  if (instance.metadata?.testOnly !== true || instance.metadata?.feedbackReceivedEmailOwner !== "journey") return decision("legacy", "test_journey_not_feedback_owner", true);
  if (input.transition?.valid !== true) return decision("legacy", input.transition?.reason || "invalid_feedback_transition", true);
  return decision("journey", "explicit_feedback_test_journey_eligible", true);
}

function decision(owner, reason, fallbackAllowed) { return { owner, reason, durable: false, eligibility: owner === "journey" ? "eligible" : "ineligible", fallbackAllowed: owner === "legacy" && fallbackAllowed, eventKey: null, testMode: true }; }
function clean(value) { return String(value || "").trim(); }

module.exports = { resolveFeedbackOwnership };
