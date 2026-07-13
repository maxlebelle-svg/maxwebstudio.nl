const { calculateJourneyProgress } = require("../progress");
const { DIRECT_CHECKOUT_POST_LAUNCH_DEFINITION, FREE_PREVIEW_POST_LAUNCH_DEFINITION } = require("../definitions");

function planWebsiteLiveProgress(instance = {}, websiteLiveReference = "", context = {}) {
  const reference = text(websiteLiveReference);
  const metadata = object(instance.metadata);
  const processed = Array.isArray(metadata.processedWebsiteLiveReferences) ? metadata.processedWebsiteLiveReferences.map(text) : [];
  const before = snapshot(instance);
  if (!reference) return invalid("website_live_reference_missing", before);
  if (processed.includes(reference)) return { valid: true, duplicate: true, reason: "website_live_progress_already_applied", before, after: before, patch: null };
  if (instance.environment !== "test" || instance.status !== "active") return invalid("journey_not_active_test", before);
  if (before.blocked) return invalid("journey_blocked", before);
  if (context.safe !== true) return invalid("website_live_context_unsafe", before);
  const definition = definitionFor(instance, context);
  if (!definition) return invalid("website_live_definition_unavailable", before);
  const states = { ...object(metadata.stepStates) };
  if (definition.journeyType === "website.direct_checkout") {
    for (const key of ["website_build", "customer_review", "launch_checks", "handover", "website_live"]) states[key] = "completed";
  } else {
    for (const key of ["project_handover", "website_build", "launch_checks", "website_live"]) states[key] = "completed";
  }
  states.post_launch_check = states.post_launch_check === "completed" ? "completed" : "ready";
  const nextMetadata = {
    ...metadata,
    progressDefinitionKey: definition.definitionKey,
    progressDefinitionVersion: definition.version,
    stepStates: states,
    processedWebsiteLiveReferences: [...processed, reference].slice(-20),
    liveAt: text(context.liveAt),
    liveHostnameFingerprint: text(context.liveHostnameFingerprint),
    postLaunchStatus: "active",
    reviewScheduled: false,
    maintenanceState: text(context.maintenanceState || "unknown"),
  };
  const planned = { ...instance, current_phase: "post_launch", current_step: "post_launch_check", metadata: nextMetadata };
  const after = snapshot(planned, definition);
  return { valid: true, duplicate: false, reason: "website_live_progress_planned", before, after, patch: { current_phase: "post_launch", current_step: "post_launch_check", progress_percent: after.percentage, metadata: nextMetadata } };
}

function definitionFor(instance, context) {
  const type = text(instance.journey_type || instance.journeyType || object(instance.metadata).journeyType || context.journeyType);
  return type === "website.free_preview_sales" ? FREE_PREVIEW_POST_LAUNCH_DEFINITION : type === "website.direct_checkout" ? DIRECT_CHECKOUT_POST_LAUNCH_DEFINITION : null;
}
function snapshot(instance, definition) { const value = calculateJourneyProgress({ instance, definition }); return { percentage: value.percentage, currentPhase: value.currentPhase || "", currentStep: value.currentStep?.key || "", nextStep: value.nextStep?.key || "", blocked: Boolean(value.blocked) }; }
function invalid(reason, before) { return { valid: false, duplicate: false, reason, before, after: before, patch: null }; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value || "").trim(); }
module.exports = { planWebsiteLiveProgress };
