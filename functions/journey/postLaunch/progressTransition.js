const { calculateJourneyProgress } = require("../progress");
const { DIRECT_CHECKOUT_POST_LAUNCH_DEFINITION, FREE_PREVIEW_POST_LAUNCH_DEFINITION } = require("../definitions");
function planPostLaunchProgress(instance = {}, check = {}) {
  const metadata = object(instance.metadata); const states = { ...object(metadata.stepStates) }; const before = snapshot(instance);
  if (instance.environment !== "test" || !["active", "completed"].includes(instance.status)) return invalid("journey_not_active_test", before);
  if (!check.checkKey || !["healthy", "attention_required", "inconclusive"].includes(check.overallResult)) return invalid("post_launch_result_invalid", before);
  if (metadata.completedPostLaunchCheckKeys?.includes(check.checkKey)) return { valid: true, duplicate: true, reason: "post_launch_transition_already_applied", before, after: before, patch: null };
  const definition = String(instance.journey_type) === "website.free_preview_sales" ? FREE_PREVIEW_POST_LAUNCH_DEFINITION : String(instance.journey_type) === "website.direct_checkout" ? DIRECT_CHECKOUT_POST_LAUNCH_DEFINITION : null;
  if (!definition || states.website_live !== "completed") return invalid("website_live_step_incomplete", before);
  states.post_launch_check = check.overallResult === "healthy" ? "completed" : check.overallResult === "attention_required" ? "blocked" : "in_progress";
  const nextMetadata = { ...metadata, progressDefinitionKey: definition.definitionKey, progressDefinitionVersion: definition.version, stepStates: states, postLaunchStatus: check.overallResult, reviewScheduled: false, completedPostLaunchCheckKeys: check.overallResult === "healthy" ? [...(metadata.completedPostLaunchCheckKeys || []), check.checkKey].slice(-20) : (metadata.completedPostLaunchCheckKeys || []) };
  const planned = { ...instance, metadata: nextMetadata, current_phase: "post_launch", current_step: "post_launch_check", status: check.overallResult === "healthy" ? "completed" : "active" };
  const after = snapshot(planned, definition);
  return { valid: true, duplicate: false, reason: "post_launch_progress_planned", before, after, patch: { current_phase: "post_launch", current_step: check.overallResult === "healthy" ? "" : "post_launch_check", progress_percent: after.percentage, status: check.overallResult === "healthy" ? "completed" : "active", completed_at: check.overallResult === "healthy" ? check.checkedAt : null, metadata: nextMetadata } };
}
function snapshot(instance, definition) { const value = calculateJourneyProgress({ instance, definition }); return { percentage: value.percentage, complete: value.complete, blocked: value.blocked }; }
function invalid(reason, before) { return { valid: false, duplicate: false, reason, before, after: before, patch: null }; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
module.exports = { planPostLaunchProgress };
