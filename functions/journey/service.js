const { resolveJourneyFeatureFlag } = require("./featureFlags");
const { createJourneyRepository } = require("./repository");
const { FEATURE_FLAGS } = require("./types");

function createJourneyService(options = {}) {
  const env = options.env || process.env;
  const repository = options.repository || createJourneyRepository(options);

  return {
    getJourneyProgress: (instanceKey, context = {}) => getJourneyProgress({ instanceKey, context, env, repository }),
    listAdminOutbox: (filters, context = {}) => repository.listAutomationOutbox(filters, context),
    listDefinitions: (filters, context = {}) => repository.listJourneyDefinitions(filters, context),
    recordBusinessEvent: (event, settings = {}) => repository.recordJourneyEvent(event, settings),
    recordProviderEvent: (event, context = {}) => repository.recordProviderEvent(event, context),
    registerDefinition: (definition, context = {}) => repository.saveJourneyDefinition(definition, context),
  };
}

async function getJourneyProgress({ instanceKey, context, env, repository }) {
  const progressGate = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_PROGRESS_UI_ENABLED, context, env);
  if (!progressGate.enabled) return noProgress(progressGate.reason, progressGate.mode);

  const engineGate = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env);
  if (!engineGate.enabled) return noProgress("journey_engine_disabled", engineGate.mode);

  const result = await repository.getJourneyInstanceByKey(instanceKey, context);
  if (!result?.row) return { available: Boolean(result?.available), skipped: Boolean(result?.skipped), reason: result?.reason || "journey_not_found", progress: null };
  return {
    available: true,
    skipped: false,
    progress: publicProgress(result.row),
  };
}

function publicProgress(row) {
  return {
    journeyType: text(row.journey_type),
    currentPhase: text(row.current_phase),
    currentStep: text(row.current_step),
    progressPercent: percent(row.progress_percent),
    status: text(row.status),
    nextStepAt: text(row.next_step_at) || null,
    startedAt: text(row.started_at) || null,
    completedAt: text(row.completed_at) || null,
  };
}

function noProgress(reason, mode) {
  return { available: false, skipped: true, reason, mode, progress: null };
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function text(value) {
  return String(value || "").trim();
}

module.exports = { createJourneyService, _private: { publicProgress } };
