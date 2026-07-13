const { calculateJourneyProgress } = require("../progress");
const { FREE_PREVIEW_DEFINITION } = require("../definitions");

function planFeedbackProgress(instance = {}, feedbackId = "") {
  const id = clean(feedbackId);
  const metadata = object(instance.metadata);
  const processed = Array.isArray(metadata.processedFeedbackIds) ? metadata.processedFeedbackIds.map(clean).filter(Boolean) : [];
  const before = progressSnapshot(instance);
  if (!id) return invalid("feedback_id_missing", before);
  if (processed.includes(id)) return { valid: true, duplicate: true, reason: "feedback_progress_already_applied", before, after: before, patch: null };
  if (instance.environment !== "test" || instance.status !== "active") return invalid("journey_not_active_test", before);
  if (before.blocked) return invalid("journey_blocked", before);
  const states = { ...object(metadata.stepStates) };
  if (["completed", "skipped"].includes(clean(states.preview_approved).toLowerCase())) return invalid("approval_already_resolved", before);
  const current = clean(instance.current_step);
  if (current && !["preview_shared", "preview_feedback", "preview_approved"].includes(current)) return invalid("invalid_feedback_transition", before);
  const nextStates = {
    ...states,
    lead_qualified: states.lead_qualified || "completed",
    preview_intake: states.preview_intake || "completed",
    preview_build: states.preview_build || "completed",
    preview_shared: "completed",
    preview_feedback: "completed",
    preview_approved: states.preview_approved || "ready",
  };
  const nextMetadata = {
    ...metadata,
    definitionKey: FREE_PREVIEW_DEFINITION.definitionKey,
    definitionVersion: FREE_PREVIEW_DEFINITION.version,
    stepStates: nextStates,
    processedFeedbackIds: [...processed, id].slice(-50),
    feedbackRevisionPending: true,
  };
  const planned = { ...instance, current_phase: "decision", current_step: "preview_approved", metadata: nextMetadata };
  const after = progressSnapshot(planned);
  return {
    valid: true,
    duplicate: false,
    reason: "feedback_progress_planned",
    before,
    after,
    patch: { current_phase: "decision", current_step: "preview_approved", progress_percent: after.percentage, metadata: nextMetadata },
  };
}

function progressSnapshot(instance) {
  const progress = calculateJourneyProgress({ instance, definition: FREE_PREVIEW_DEFINITION });
  return { percentage: progress.percentage, currentPhase: progress.currentPhase || "", currentStep: progress.currentStep?.key || "", nextStep: progress.nextStep?.key || "", blocked: Boolean(progress.blocked) };
}
function invalid(reason, before) { return { valid: false, duplicate: false, reason, before, after: before, patch: null }; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clean(value) { return String(value || "").trim(); }

module.exports = { planFeedbackProgress };
