const { resolveJourneyFeatureFlag, parseAllowlist } = require("../featureFlags");
const { FEATURE_FLAGS } = require("../types");

function resolveApprovalOwnership(input = {}, env = process.env) {
  if (!text(input.recipient)) return result("none", "recipient_missing");
  const instance = input.journeyInstance || {};
  const context = { customerId: text(input.customerId), journeyInstanceId: text(instance.id), journeyKey: text(instance.instance_key), entityId: text(input.previewVersionId), environment: input.runtimeEnvironment || "production" };
  const engine = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env);
  const mail = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_EMAIL_AUTOMATION_ENABLED, context, env);
  if (!engine.enabled || !mail.enabled) return result("legacy", !engine.enabled ? engine.reason : mail.reason);
  if (!parseAllowlist(env.JOURNEY_PREVIEW_APPROVED_TEST_CUSTOMERS).has(context.customerId)) return result("legacy", "customer_not_selected_for_approval_test");
  if (!instance.id) return result("legacy", "test_journey_missing");
  if (instance.environment !== "test" || instance.status !== "active" || instance.metadata?.testOnly !== true || instance.metadata?.previewApprovedEmailOwner !== "journey") return result("legacy", "test_journey_not_approval_owner");
  if (input.resolution?.safe !== true) return result("legacy", "approval_next_step_unsafe");
  if (input.transition?.valid !== true) return result("legacy", input.transition?.reason || "invalid_approval_transition");
  return result("journey", "explicit_approval_test_journey_eligible");
}
function result(owner, reason) { return { owner, reason, eligibility: owner === "journey" ? "eligible" : "ineligible", fallbackAllowed: owner === "legacy", durable: false, testMode: true }; }
function text(value) { return String(value || "").trim(); }
module.exports = { resolveApprovalOwnership };
