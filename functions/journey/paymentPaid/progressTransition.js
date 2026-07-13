const { calculateJourneyProgress } = require("../progress");
const { FREE_PREVIEW_DEFINITION } = require("../definitions");

function planPaymentPaidProgress(instance = {}, paymentReference = "", paymentContext = {}) {
  const reference = text(paymentReference);
  const metadata = object(instance.metadata);
  const processed = Array.isArray(metadata.processedPaymentReferences) ? metadata.processedPaymentReferences.map(text) : [];
  const before = snapshot(instance);
  if (!reference) return invalid("payment_reference_missing", before);
  if (processed.includes(reference)) return { valid: true, duplicate: true, reason: "payment_progress_already_applied", before, after: before, patch: null };
  if (instance.environment !== "test" || instance.status !== "active") return invalid("journey_not_active_test", before);
  if (before.blocked) return invalid("journey_blocked", before);
  if (paymentContext.safe !== true) return invalid("payment_context_unsafe", before);
  if (!paymentContext.journeyRelevant) return { valid: true, duplicate: false, reason: "invoice_payment_not_journey_relevant", before, after: before, patch: null };
  const states = { ...object(metadata.stepStates), commercial_agreement: "completed", payment_confirmed: "completed" };
  if (paymentContext.paymentType === "deposit") states.project_handover = states.project_handover || "ready";
  else states.project_handover = "ready";
  const nextMetadata = { ...metadata, definitionKey: FREE_PREVIEW_DEFINITION.definitionKey, definitionVersion: FREE_PREVIEW_DEFINITION.version, stepStates: states, processedPaymentReferences: [...processed, reference].slice(-50), paymentType: paymentContext.paymentType, commercialCompletionState: paymentContext.commercialCompletionState, remainingComponent: paymentContext.remainingComponent };
  const planned = { ...instance, current_phase: "delivery", current_step: "project_handover", metadata: nextMetadata };
  const after = snapshot(planned);
  return { valid: true, duplicate: false, reason: "payment_progress_planned", before, after, patch: { current_phase: "delivery", current_step: "project_handover", progress_percent: after.percentage, metadata: nextMetadata } };
}
function snapshot(instance) { const value = calculateJourneyProgress({ instance, definition: FREE_PREVIEW_DEFINITION }); return { percentage: value.percentage, currentPhase: value.currentPhase || "", currentStep: value.currentStep?.key || "", nextStep: value.nextStep?.key || "", blocked: Boolean(value.blocked) }; }
function invalid(reason, before) { return { valid: false, duplicate: false, reason, before, after: before, patch: null }; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value || "").trim(); }
module.exports = { planPaymentPaidProgress };
