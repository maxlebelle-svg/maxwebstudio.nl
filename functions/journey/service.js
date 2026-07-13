const { resolveJourneyFeatureFlag } = require("./featureFlags");
const { createJourneyRepository } = require("./repository");
const { FEATURE_FLAGS } = require("./types");
const { calculateJourneyProgress } = require("./progress");

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
  const progress = calculateJourneyProgress({ instance: result.row });
  if (!progress.available) return { available: false, skipped: true, reason: progress.reason, progress: null };
  return {
    available: true,
    skipped: false,
    progress,
  };
}

function noProgress(reason, mode) {
  return { available: false, skipped: true, reason, mode, progress: null };
}

module.exports = { createJourneyService };
