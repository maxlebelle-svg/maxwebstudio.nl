import { AI_WEBSITE_WIZARD_STEP_STATUS, getAiWebsiteWizardWorkflow } from "../config/aiWebsiteWizardWorkflow.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { createEmptyAiWebsiteWizardState, normalizeAiWebsiteWizardState } from "../models/AIWebsiteWizardState.js";

const WIZARD_WARNINGS = Object.freeze([
  "Geen OpenAI-calls in Fase 15.0.",
  "Geen logo-generatie in Fase 15.0.",
  "Geen databasewijzigingen of SQL in Fase 15.0.",
  "Geen nieuwe dependencies in Fase 15.0.",
  "Wizard state is localStorage-prepared en later migreerbaar naar Supabase.",
]);

function safeLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return null;
}

function readStates() {
  const storage = safeLocalStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.aiWebsiteWizardState) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeAiWebsiteWizardState) : [];
  } catch {
    return [];
  }
}

function writeStates(states = []) {
  const storage = safeLocalStorage();
  if (!storage) return states;
  storage.setItem(STORAGE_KEYS.aiWebsiteWizardState, JSON.stringify(states.map(normalizeAiWebsiteWizardState)));
  return states;
}

export function getAiWebsiteWizardArchitecture() {
  return {
    status: "foundation",
    module: "AI Website Wizard",
    workflow: "step-based",
    stateStorage: STORAGE_KEYS.aiWebsiteWizardState,
    database: "not_created",
    aiCalls: "not_implemented",
    dependencies: "none_added",
    productionImpact: "none",
    layers: [
      "workflow config",
      "state model",
      "wizard service",
      "Developer Mode readiness",
      "future Supabase migration",
      "future AI provider adapter",
    ],
  };
}

export function getAiWebsiteWizardReadiness() {
  const workflow = getAiWebsiteWizardWorkflow();
  return {
    status: "Prepared",
    workflowVersion: workflow.version,
    phaseCount: workflow.phases.length,
    stepCount: workflow.steps.length,
    completedStepCount: workflow.steps.filter((step) => step.requiredInputs.length === 0).length,
    warnings: [...WIZARD_WARNINGS],
    nextCapabilities: [
      "AI intake analyser",
      "AI content provider",
      "logo provider",
      "SEO planner",
      "website scaffold generator",
      "publishing checklist",
    ],
  };
}

export function createWizardDraft(overrides = {}) {
  const states = readStates();
  const draft = createEmptyAiWebsiteWizardState(overrides);
  writeStates([draft, ...states.filter((state) => state.id !== draft.id)]);
  return draft;
}

export function updateWizardStep(stateId, stepId, stepUpdate = {}) {
  const states = readStates();
  const index = states.findIndex((state) => state.id === stateId);
  if (index === -1) return null;
  const state = normalizeAiWebsiteWizardState(states[index]);
  if (!state.steps[stepId]) return null;
  state.steps[stepId] = {
    ...state.steps[stepId],
    ...stepUpdate,
    data: stepUpdate.data && typeof stepUpdate.data === "object" ? { ...stepUpdate.data } : state.steps[stepId].data,
    status: stepUpdate.status || state.steps[stepId].status || AI_WEBSITE_WIZARD_STEP_STATUS.PENDING,
    updatedAt: new Date().toISOString(),
  };
  state.currentStepId = stepId;
  state.updatedAt = new Date().toISOString();
  states[index] = normalizeAiWebsiteWizardState(state);
  writeStates(states);
  return states[index];
}

export function listWizardDrafts() {
  return readStates();
}

export function getWizardProgress(state = {}) {
  const normalized = normalizeAiWebsiteWizardState(state);
  const steps = Object.values(normalized.steps || {});
  const complete = steps.filter((step) => step.status === AI_WEBSITE_WIZARD_STEP_STATUS.COMPLETE).length;
  const blocked = steps.filter((step) => step.status === AI_WEBSITE_WIZARD_STEP_STATUS.BLOCKED).length;
  const total = steps.length || 1;
  return {
    complete,
    blocked,
    total,
    percentage: Math.round((complete / total) * 100),
  };
}

export function getWizardDeveloperSummary() {
  const workflow = getAiWebsiteWizardWorkflow();
  const drafts = listWizardDrafts();
  return {
    architecture: getAiWebsiteWizardArchitecture(),
    readiness: getAiWebsiteWizardReadiness(),
    workflow,
    draftCount: drafts.length,
    latestDraft: drafts[0] || null,
  };
}

export const aiWebsiteWizardService = {
  getAiWebsiteWizardArchitecture,
  getAiWebsiteWizardReadiness,
  getWizardDeveloperSummary,
  getAiWebsiteWizardWorkflow,
  createWizardDraft,
  updateWizardStep,
  listWizardDrafts,
  getWizardProgress,
};
