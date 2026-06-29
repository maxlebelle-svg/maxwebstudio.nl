import { AI_WEBSITE_WIZARD_STEP_STATUS, getAiWebsiteWizardWorkflow } from "../config/aiWebsiteWizardWorkflow.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { createEmptyAiWebsiteWizardState, normalizeAiWebsiteWizardState } from "../models/AIWebsiteWizardState.js";

export const AI_WEBSITE_WIZARD_INTAKE_FIELDS = Object.freeze([
  "companyName",
  "industry",
  "audience",
  "services",
  "uniqueValue",
  "desiredStyle",
  "colorPreference",
  "existingWebsite",
  "contactDetails",
  "desiredPages",
  "primaryCta",
  "notes",
]);

const REQUIRED_INTAKE_FIELDS = Object.freeze([
  "companyName",
  "industry",
  "audience",
  "services",
  "contactDetails",
  "desiredPages",
  "primaryCta",
]);

const INTAKE_FIELD_LABELS = Object.freeze({
  companyName: "Bedrijfsnaam",
  industry: "Branche",
  audience: "Doelgroep",
  services: "Belangrijkste diensten",
  uniqueValue: "Onderscheidend vermogen",
  desiredStyle: "Gewenste uitstraling",
  colorPreference: "Kleurenvoorkeur",
  existingWebsite: "Bestaande website",
  contactDetails: "Contactgegevens",
  desiredPages: "Gewenste pagina's",
  primaryCta: "Belangrijkste CTA",
  notes: "Notities",
});

const WIZARD_WARNINGS = Object.freeze([
  "Geen OpenAI-calls in Fase 15.1.",
  "Geen logo-generatie in Fase 15.1.",
  "Geen databasewijzigingen of SQL in Fase 15.1.",
  "Geen nieuwe dependencies in Fase 15.1.",
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

function sanitizeText(value = "") {
  return String(value || "").trim();
}

function intakeFromState(state = {}) {
  const normalized = normalizeAiWebsiteWizardState(state);
  const business = normalized.steps.business_information?.data || {};
  const industry = normalized.steps.industry_selection?.data || {};
  const brand = normalized.steps.brand_style?.data || {};
  const colors = normalized.steps.colors?.data || {};
  const pages = normalized.steps.pages?.data || {};
  const services = normalized.steps.services?.data || {};
  const contact = normalized.steps.contact_details?.data || {};
  const ctas = normalized.steps.ctas?.data || {};
  const domain = normalized.steps.domain?.data || {};

  return {
    companyName: sanitizeText(business.companyName),
    industry: sanitizeText(industry.industry),
    audience: sanitizeText(business.audience),
    services: sanitizeText(services.services),
    uniqueValue: sanitizeText(business.uniqueValue),
    desiredStyle: sanitizeText(brand.desiredStyle),
    colorPreference: sanitizeText(colors.colorPreference),
    existingWebsite: sanitizeText(domain.existingWebsite),
    contactDetails: sanitizeText(contact.contactDetails),
    desiredPages: sanitizeText(pages.desiredPages),
    primaryCta: sanitizeText(ctas.primaryCta),
    notes: sanitizeText(normalized.metadata.intakeNotes),
  };
}

function normalizeIntake(input = {}) {
  return Object.fromEntries(AI_WEBSITE_WIZARD_INTAKE_FIELDS.map((field) => [field, sanitizeText(input[field])]));
}

function stepStatusForData(...values) {
  return values.some((value) => sanitizeText(value)) ? AI_WEBSITE_WIZARD_STEP_STATUS.COMPLETE : AI_WEBSITE_WIZARD_STEP_STATUS.PENDING;
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

export function getOrCreateWizardDraft(overrides = {}) {
  const drafts = listWizardDrafts();
  return drafts[0] || createWizardDraft(overrides);
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

export function validateWizardIntake(input = {}) {
  const intake = normalizeIntake(input);
  const missing = REQUIRED_INTAKE_FIELDS.filter((field) => !intake[field]);
  return {
    valid: missing.length === 0,
    missing,
    errors: missing.map((field) => `${INTAKE_FIELD_LABELS[field]} is verplicht.`),
  };
}

export function saveWizardIntake(input = {}, options = {}) {
  const states = readStates();
  const intake = normalizeIntake(input);
  const validation = validateWizardIntake(intake);
  const existing = options.stateId
    ? states.find((state) => state.id === options.stateId)
    : states[0];
  const state = normalizeAiWebsiteWizardState(existing || createEmptyAiWebsiteWizardState(options));
  const now = new Date().toISOString();

  state.steps.business_information = {
    ...state.steps.business_information,
    status: stepStatusForData(intake.companyName, intake.audience, intake.uniqueValue),
    data: {
      companyName: intake.companyName,
      audience: intake.audience,
      offer: intake.services,
      uniqueValue: intake.uniqueValue,
    },
    notes: intake.notes,
    updatedAt: now,
  };
  state.steps.industry_selection = {
    ...state.steps.industry_selection,
    status: stepStatusForData(intake.industry),
    data: { industry: intake.industry },
    updatedAt: now,
  };
  state.steps.brand_style = {
    ...state.steps.brand_style,
    status: stepStatusForData(intake.desiredStyle),
    data: {
      desiredStyle: intake.desiredStyle,
      brandPersonality: intake.desiredStyle,
      styleDirection: intake.desiredStyle,
    },
    updatedAt: now,
  };
  state.steps.colors = {
    ...state.steps.colors,
    status: stepStatusForData(intake.colorPreference),
    data: { colorPreference: intake.colorPreference },
    updatedAt: now,
  };
  state.steps.pages = {
    ...state.steps.pages,
    status: stepStatusForData(intake.desiredPages),
    data: {
      desiredPages: intake.desiredPages,
      pageList: intake.desiredPages,
    },
    updatedAt: now,
  };
  state.steps.services = {
    ...state.steps.services,
    status: stepStatusForData(intake.services),
    data: { services: intake.services },
    updatedAt: now,
  };
  state.steps.contact_details = {
    ...state.steps.contact_details,
    status: stepStatusForData(intake.contactDetails),
    data: { contactDetails: intake.contactDetails },
    updatedAt: now,
  };
  state.steps.ctas = {
    ...state.steps.ctas,
    status: stepStatusForData(intake.primaryCta),
    data: {
      primaryCta: intake.primaryCta,
      secondaryCta: "",
    },
    updatedAt: now,
  };
  state.steps.domain = {
    ...state.steps.domain,
    status: stepStatusForData(intake.existingWebsite),
    data: { existingWebsite: intake.existingWebsite },
    updatedAt: now,
  };
  state.currentStepId = validation.valid ? "brand_style" : "business_information";
  state.status = validation.valid ? "in_progress" : state.status;
  state.metadata = {
    ...state.metadata,
    intake: { ...intake },
    intakeNotes: intake.notes,
    intakeValidation: validation,
    intakeUpdatedAt: now,
  };
  state.updatedAt = now;

  const nextStates = [state, ...states.filter((item) => item.id !== state.id)];
  writeStates(nextStates);
  return { state, intake, validation };
}

export function getWizardIntakeSummary(state = null) {
  const normalized = state ? normalizeAiWebsiteWizardState(state) : createEmptyAiWebsiteWizardState();
  const intake = normalizeIntake(normalized.metadata.intake || intakeFromState(normalized));
  return {
    state: normalized,
    intake,
    rows: AI_WEBSITE_WIZARD_INTAKE_FIELDS.map((field) => ({
      field,
      label: INTAKE_FIELD_LABELS[field],
      value: intake[field] || "-",
    })),
    validation: validateWizardIntake(intake),
    progress: getWizardProgress(normalized),
  };
}

export function clearWizardDrafts() {
  writeStates([]);
  return [];
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
  AI_WEBSITE_WIZARD_INTAKE_FIELDS,
  getAiWebsiteWizardArchitecture,
  getAiWebsiteWizardReadiness,
  getWizardDeveloperSummary,
  getAiWebsiteWizardWorkflow,
  getOrCreateWizardDraft,
  createWizardDraft,
  updateWizardStep,
  listWizardDrafts,
  validateWizardIntake,
  saveWizardIntake,
  getWizardIntakeSummary,
  clearWizardDrafts,
  getWizardProgress,
};
