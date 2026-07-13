const { getJourneyDefinition, getJourneyDefinitionForType } = require("./definitions");
const { STEP_STATUSES } = require("./transitions");

function calculateJourneyProgress(input = {}) {
  const instance = input.instance && typeof input.instance === "object" ? input.instance : {};
  const definition = input.definition || resolveDefinition(instance);
  if (!definition) return unavailableProgress(instance, "journey_definition_unavailable");

  const rawStates = readStepStates(instance);
  const steps = [...definition.steps].sort((a, b) => a.order - b.order).map((step) => {
    const rawStatus = String(rawStates[step.key] || "pending").trim().toLowerCase();
    const knownStatus = STEP_STATUSES.includes(rawStatus);
    return { ...step, status: knownStatus ? rawStatus : "pending", rawStatus, knownStatus };
  });
  const totalWeight = steps.reduce((sum, step) => sum + positiveWeight(step.weight), 0);
  const completedWeight = steps.reduce((sum, step) => {
    if (step.status === "completed" || (step.optional && step.status === "skipped")) return sum + positiveWeight(step.weight);
    return sum;
  }, 0);
  const allRequiredComplete = steps.filter((step) => !step.optional).every((step) => step.status === "completed");
  const allOptionalResolved = steps.filter((step) => step.optional).every((step) => ["completed", "skipped"].includes(step.status));
  const instanceComplete = normalizeInstanceStatus(instance.status) === "completed";
  const complete = instanceComplete || (allRequiredComplete && allOptionalResolved);
  const percentage = complete ? 100 : boundedPercentage(totalWeight ? (completedWeight / totalWeight) * 100 : 0);
  const current = selectCurrentStep(steps, instance.current_step || instance.currentStep);
  const completedSteps = steps.filter((step) => step.status === "completed").map(publicStep);
  const remainingSteps = steps.filter((step) => !["completed", "skipped"].includes(step.status)).map(publicStep);
  const next = selectNextStep(steps, current);
  const blocked = steps.find((step) => step.status === "blocked") || null;
  const updatedAt = timestamp(instance.updated_at || instance.updatedAt || instance.started_at || instance.startedAt);

  return {
    source: "journey",
    available: true,
    journeyInstanceId: text(instance.id),
    definitionKey: definition.definitionKey,
    definitionVersion: definition.version,
    journeyType: definition.journeyType,
    status: normalizeInstanceStatus(instance.status),
    percentage,
    currentPhase: current?.phaseKey || text(instance.current_phase || instance.currentPhase),
    currentStep: current ? publicStep(current) : null,
    completedSteps,
    remainingSteps,
    nextStep: next ? publicStep(next) : null,
    customerActionRequired: requiresAction(current?.customerActionType, current?.status),
    internalActionRequired: requiresAction(current?.internalActionType, current?.status),
    blocked: Boolean(blocked),
    blocker: blocked ? { stepKey: blocked.key, label: blocked.label } : null,
    lastUpdatedAt: updatedAt,
    complete,
    hasUnknownStepStatuses: steps.some((step) => !step.knownStatus),
  };
}

function resolveDefinition(instance = {}) {
  const metadata = object(instance.metadata);
  const key = text(metadata.progressDefinitionKey || metadata.progress_definition_key || instance.definition_key || instance.definitionKey || metadata.definitionKey || metadata.definition_key);
  const version = number(metadata.progressDefinitionVersion || metadata.progress_definition_version || instance.definition_version || instance.definitionVersion || metadata.definitionVersion || metadata.definition_version, 1);
  return (key && getJourneyDefinition(key, version))
    || getJourneyDefinitionForType(instance.journey_type || instance.journeyType, version);
}

function readStepStates(instance = {}) {
  const metadata = object(instance.metadata);
  const source = metadata.stepStates || metadata.step_states || instance.stepStates || instance.step_states || {};
  if (Array.isArray(source)) {
    return source.reduce((states, item) => {
      const key = text(item?.key || item?.stepKey || item?.step_key);
      if (key) states[key] = text(item?.status);
      return states;
    }, {});
  }
  return object(source);
}

function selectCurrentStep(steps, explicitKey) {
  const explicit = text(explicitKey);
  if (explicit) {
    const match = steps.find((step) => step.key === explicit && !["completed", "skipped"].includes(step.status));
    if (match) return match;
  }
  return steps.find((step) => step.status === "blocked")
    || steps.find((step) => step.status === "in_progress")
    || steps.find((step) => step.status === "ready")
    || steps.find((step) => !["completed", "skipped"].includes(step.status))
    || null;
}

function selectNextStep(steps, current) {
  if (!current) return null;
  if (current.nextStepKey) return steps.find((step) => step.key === current.nextStepKey && !["completed", "skipped"].includes(step.status)) || null;
  return steps.find((step) => step.order > current.order && !["completed", "skipped"].includes(step.status)) || null;
}

function publicStep(step) {
  return {
    key: step.key,
    label: step.label,
    phaseKey: step.phaseKey,
    order: step.order,
    weight: step.weight,
    optional: step.optional,
    status: step.status,
    visibility: step.visibility,
    customerActionType: step.customerActionType,
    internalActionType: step.internalActionType,
  };
}

function unavailableProgress(instance, reason) {
  return {
    source: "unavailable",
    available: false,
    reason,
    journeyInstanceId: text(instance.id),
    percentage: 0,
    complete: false,
    completedSteps: [],
    remainingSteps: [],
  };
}

function requiresAction(actionType, stepStatus) {
  return Boolean(actionType && actionType !== "none" && ["ready", "in_progress", "blocked"].includes(stepStatus));
}

function normalizeInstanceStatus(value) {
  const status = text(value).toLowerCase();
  return ["active", "paused", "completed", "cancelled", "needs_review"].includes(status) ? status : "needs_review";
}

function boundedPercentage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function positiveWeight(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function timestamp(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) || !value ? null : date.toISOString();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value || "").trim();
}

module.exports = { calculateJourneyProgress, _private: { boundedPercentage, readStepStates, resolveDefinition } };
