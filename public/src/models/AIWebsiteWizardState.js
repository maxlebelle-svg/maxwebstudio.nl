import { AI_WEBSITE_WIZARD_STEP_STATUS, AI_WEBSITE_WIZARD_STEPS, AI_WEBSITE_WIZARD_STATUS } from "../config/aiWebsiteWizardWorkflow.js";

/**
 * @typedef {Object} AiWebsiteWizardStepState
 * @property {string} status
 * @property {Record<string, unknown>} data
 * @property {string} notes
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} AiWebsiteWizardState
 * @property {string} id
 * @property {string} customerId
 * @property {string} projectId
 * @property {string} websiteId
 * @property {string} status
 * @property {string} currentStepId
 * @property {string} workflowVersion
 * @property {Record<string, AiWebsiteWizardStepState>} steps
 * @property {Record<string, unknown>} metadata
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export const aiWebsiteWizardStateModel = {
  table: "ai_website_wizard_states",
  primaryKey: "id",
  storageKey: "maxwebstudioAiWebsiteWizardState",
  migrationStatus: "planned",
};

export function createEmptyAiWebsiteWizardState(overrides = {}) {
  const now = new Date().toISOString();
  const steps = Object.fromEntries(AI_WEBSITE_WIZARD_STEPS.map((step) => [
    step.id,
    {
      status: AI_WEBSITE_WIZARD_STEP_STATUS.PENDING,
      data: {},
      notes: "",
      updatedAt: now,
    },
  ]));

  return {
    id: overrides.id || `aiw_${Date.now()}`,
    customerId: overrides.customerId || "",
    projectId: overrides.projectId || "",
    websiteId: overrides.websiteId || "",
    status: overrides.status || AI_WEBSITE_WIZARD_STATUS.PREPARED,
    currentStepId: overrides.currentStepId || AI_WEBSITE_WIZARD_STEPS[0]?.id || "",
    workflowVersion: "15.0",
    steps: overrides.steps || steps,
    metadata: overrides.metadata || {},
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  };
}

export function normalizeAiWebsiteWizardState(input = {}) {
  const base = createEmptyAiWebsiteWizardState(input);
  const now = new Date().toISOString();
  const steps = { ...base.steps };

  Object.entries(input.steps || {}).forEach(([stepId, stepState]) => {
    if (!steps[stepId]) return;
    steps[stepId] = {
      status: stepState.status || steps[stepId].status,
      data: stepState.data && typeof stepState.data === "object" ? { ...stepState.data } : {},
      notes: stepState.notes || "",
      updatedAt: stepState.updatedAt || now,
    };
  });

  return {
    ...base,
    ...input,
    steps,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
    updatedAt: input.updatedAt || now,
  };
}
