const { calculateJourneyProgress } = require("../progress");
const { FREE_PREVIEW_DEFINITION } = require("../definitions");

function planApprovalProgress(instance = {}, approvalReference = "", resolution = {}) {
  const reference = text(approvalReference);
  const metadata = object(instance.metadata);
  const processed = Array.isArray(metadata.processedApprovalReferences) ? metadata.processedApprovalReferences.map(text) : [];
  const before = snapshot(instance);
  if (!reference) return invalid("approval_reference_missing", before);
  if (processed.includes(reference)) return { valid: true, duplicate: true, reason: "approval_progress_already_applied", before, after: before, patch: null };
  if (instance.environment !== "test" || instance.status !== "active") return invalid("journey_not_active_test", before);
  if (before.blocked) return invalid("journey_blocked", before);
  if (resolution.safe !== true) return invalid("approval_resolution_unsafe", before);
  const states = { ...object(metadata.stepStates) };
  if (["completed", "skipped"].includes(text(states.preview_approved).toLowerCase())) return invalid("approval_already_resolved", before);
  const nextStates = { ...states, lead_qualified: states.lead_qualified || "completed", preview_intake: states.preview_intake || "completed", preview_build: states.preview_build || "completed", preview_shared: "completed", preview_feedback: states.preview_feedback === "skipped" ? "skipped" : "completed", preview_approved: "completed" };
  let currentStep = "commercial_agreement";
  let currentPhase = "conversion";
  if (["technical_completion", "already_live"].includes(resolution.nextStepType)) {
    nextStates.commercial_agreement = "completed";
    nextStates.payment_confirmed = "completed";
    nextStates.project_handover = resolution.nextStepType === "already_live" ? "completed" : "ready";
    currentStep = "project_handover";
  } else if (["existing_invoice", "approval_processing"].includes(resolution.nextStepType)) {
    nextStates.commercial_agreement = "completed";
    nextStates.payment_confirmed = "ready";
    currentStep = "payment_confirmed";
  } else if (resolution.nextStepType === "financial_review") {
    nextStates.commercial_agreement = "blocked";
  } else {
    nextStates.commercial_agreement = "ready";
  }
  const nextMetadata = { ...metadata, definitionKey: FREE_PREVIEW_DEFINITION.definitionKey, definitionVersion: FREE_PREVIEW_DEFINITION.version, stepStates: nextStates, processedApprovalReferences: [...processed, reference].slice(-50), approvalNextStepType: resolution.nextStepType, approvalReasonCode: resolution.reasonCode };
  const planned = { ...instance, current_phase: currentPhase, current_step: currentStep, metadata: nextMetadata, status: resolution.nextStepType === "already_live" ? "completed" : instance.status };
  const after = snapshot(planned);
  return { valid: true, duplicate: false, reason: "approval_progress_planned", before, after, patch: { current_phase: currentPhase, current_step: currentStep, progress_percent: after.percentage, status: planned.status, metadata: nextMetadata } };
}
function snapshot(instance) { const value = calculateJourneyProgress({ instance, definition: FREE_PREVIEW_DEFINITION }); return { percentage: value.percentage, currentPhase: value.currentPhase || "", currentStep: value.currentStep?.key || "", nextStep: value.nextStep?.key || "", blocked: Boolean(value.blocked) }; }
function invalid(reason, before) { return { valid: false, duplicate: false, reason, before, after: before, patch: null }; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value || "").trim(); }
module.exports = { planApprovalProgress };
