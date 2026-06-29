import { AI_WEBSITE_WIZARD_STEP_STATUS, getAiWebsiteWizardWorkflow } from "../config/aiWebsiteWizardWorkflow.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { createEmptyAiWebsiteWizardState, normalizeAiWebsiteWizardState } from "../models/AIWebsiteWizardState.js";

export const AI_WEBSITE_WIZARD_INTAKE_FIELDS = Object.freeze([
  "companyName",
  "industry",
  "audience",
  "services",
  "region",
  "toneOfVoice",
  "uniqueValue",
  "desiredStyle",
  "colorPreference",
  "existingWebsite",
  "competitors",
  "contactDetails",
  "desiredPages",
  "primaryCta",
  "seoKeywords",
  "customerGoal",
  "customerId",
  "websiteId",
  "projectId",
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
  region: "Regio",
  toneOfVoice: "Tone of voice",
  uniqueValue: "Onderscheidend vermogen",
  desiredStyle: "Gewenste uitstraling",
  colorPreference: "Kleurenvoorkeur",
  existingWebsite: "Bestaande website",
  competitors: "Concurrenten",
  contactDetails: "Contactgegevens",
  desiredPages: "Gewenste pagina's",
  primaryCta: "Belangrijkste CTA",
  seoKeywords: "SEO zoekwoorden",
  customerGoal: "Klantdoel",
  customerId: "Gekoppelde klant",
  websiteId: "Gekoppelde website",
  projectId: "Gekoppeld project",
  notes: "Notities",
});

const WIZARD_WARNINGS = Object.freeze([
  "Geen OpenAI-calls in Fase 19.",
  "Draft-output komt uit lokale template/mock-generator logic.",
  "Geen logo-generatie in Fase 19.",
  "Geen databasewijzigingen of SQL in Fase 19.",
  "Geen nieuwe dependencies in Fase 19.",
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
    region: sanitizeText(industry.region || normalized.metadata.intake?.region),
    toneOfVoice: sanitizeText(business.toneOfVoice || normalized.metadata.intake?.toneOfVoice),
    uniqueValue: sanitizeText(business.uniqueValue),
    desiredStyle: sanitizeText(brand.desiredStyle),
    colorPreference: sanitizeText(colors.colorPreference),
    existingWebsite: sanitizeText(domain.existingWebsite),
    competitors: sanitizeText(industry.competitors || normalized.metadata.intake?.competitors),
    contactDetails: sanitizeText(contact.contactDetails),
    desiredPages: sanitizeText(pages.desiredPages),
    primaryCta: sanitizeText(ctas.primaryCta),
    seoKeywords: sanitizeText(normalized.steps.seo?.data?.keywords || normalized.metadata.intake?.seoKeywords),
    customerGoal: sanitizeText(ctas.customerGoal || normalized.metadata.intake?.customerGoal),
    customerId: sanitizeText(normalized.customerId || normalized.metadata.intake?.customerId),
    websiteId: sanitizeText(normalized.websiteId || normalized.metadata.intake?.websiteId),
    projectId: sanitizeText(normalized.projectId || normalized.metadata.intake?.projectId),
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
      toneOfVoice: intake.toneOfVoice,
      uniqueValue: intake.uniqueValue,
    },
    notes: intake.notes,
    updatedAt: now,
  };
  state.steps.industry_selection = {
    ...state.steps.industry_selection,
    status: stepStatusForData(intake.industry, intake.region, intake.competitors),
    data: {
      industry: intake.industry,
      region: intake.region,
      competitors: intake.competitors,
    },
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
    status: stepStatusForData(intake.primaryCta, intake.customerGoal),
    data: {
      primaryCta: intake.primaryCta,
      secondaryCta: "",
      customerGoal: intake.customerGoal,
    },
    updatedAt: now,
  };
  state.steps.seo = {
    ...state.steps.seo,
    status: stepStatusForData(intake.seoKeywords, intake.region),
    data: {
      keywords: intake.seoKeywords,
      serviceArea: intake.region,
    },
    updatedAt: now,
  };
  state.steps.ai_content = {
    ...state.steps.ai_content,
    status: stepStatusForData(intake.customerGoal, intake.toneOfVoice),
    data: {
      contentApprovalMode: "manual_review",
      customerGoal: intake.customerGoal,
      toneOfVoice: intake.toneOfVoice,
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
  state.customerId = intake.customerId;
  state.websiteId = intake.websiteId;
  state.projectId = intake.projectId;
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

function splitList(value = "", fallback = []) {
  const items = String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

function sentence(value, fallback) {
  return sanitizeText(value) || fallback;
}

export function generateWizardDraftOutput(input = {}) {
  const intake = normalizeIntake(input);
  const company = sentence(intake.companyName, "dit bedrijf");
  const industry = sentence(intake.industry, "deze branche");
  const audience = sentence(intake.audience, "klanten die snel vertrouwen willen krijgen");
  const region = sentence(intake.region, "de regio");
  const primaryCta = sentence(intake.primaryCta, "Vraag een offerte aan");
  const goal = sentence(intake.customerGoal, "meer aanvragen");
  const tone = sentence(intake.toneOfVoice, "professioneel en persoonlijk");
  const style = sentence(intake.desiredStyle, "modern, betrouwbaar en conversiegericht");
  const services = splitList(intake.services, ["Advies", "Uitvoering", "Onderhoud"]);
  const pages = splitList(intake.desiredPages, ["Home", "Diensten", "Over ons", "Projecten", "Contact"]);
  const keywords = splitList(intake.seoKeywords, [industry, `${industry} ${region}`, `${company} ${region}`]);
  const uniqueValue = sentence(intake.uniqueValue, `persoonlijke service, duidelijke communicatie en vakwerk voor ${audience}`);

  const heroTitle = `${company} helpt ${audience} met ${services[0]?.toLowerCase() || industry}.`;
  const heroSubtitle = `Een ${style.toLowerCase()} websiteconcept voor ${industry}, gericht op ${goal.toLowerCase()} in ${region}.`;
  const serviceBlocks = services.slice(0, 6).map((service) => ({
    title: service,
    text: `${company} presenteert ${service.toLowerCase()} helder, overtuigend en met een duidelijke vervolgstap richting ${primaryCta.toLowerCase()}.`,
  }));
  const faqs = [
    {
      question: `Voor wie is ${company} de juiste keuze?`,
      answer: `${company} richt zich op ${audience} en werkt met een ${tone.toLowerCase()} aanpak.`,
    },
    {
      question: "Hoe snel kan ik contact opnemen?",
      answer: `De primaire actie op de website wordt: ${primaryCta}.`,
    },
    {
      question: "Wat maakt deze website anders?",
      answer: `De structuur benadrukt ${uniqueValue.toLowerCase()} en stuurt bezoekers naar concrete aanvragen.`,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    generator: "local_template_mock",
    homepageStructure: pages.map((page, index) => ({
      section: page,
      purpose: index === 0 ? "Direct vertrouwen en conversie opbouwen" : `${page} ondersteunt de klantreis richting ${primaryCta}`,
    })),
    hero: {
      title: heroTitle,
      subtitle: heroSubtitle,
      primaryCta,
      secondaryCta: "Bekijk diensten",
    },
    services: serviceBlocks,
    aboutText: `${company} is een ${industry.toLowerCase()} voor ${audience}. De website moet ${tone.toLowerCase()} aanvoelen, vertrouwen uitstralen en bezoekers helpen om zonder twijfel de stap naar contact te zetten. Het onderscheid zit in ${uniqueValue.toLowerCase()}.`,
    faqs,
    ctas: [
      primaryCta,
      "Plan een kennismaking",
      "Bekijk voorbeelden",
    ],
    seo: {
      title: `${company} - ${industry} in ${region}`,
      metaDescription: `${company} helpt ${audience} met ${services.slice(0, 3).join(", ")}. ${primaryCta} en ontdek wat er mogelijk is.`,
      keywords,
    },
    projectBrief: {
      company,
      industry,
      audience,
      region,
      goal,
      toneOfVoice: tone,
      desiredStyle: style,
      pages,
      notes: intake.notes,
      linkedCustomerId: intake.customerId,
      linkedWebsiteId: intake.websiteId,
      linkedProjectId: intake.projectId,
    },
  };
}

export function generateAndSaveWizardDraftOutput(input = {}, options = {}) {
  const result = saveWizardIntake(input, options);
  const output = generateWizardDraftOutput(result.intake);
  const states = readStates();
  const index = states.findIndex((state) => state.id === result.state.id);
  const state = normalizeAiWebsiteWizardState(index >= 0 ? states[index] : result.state);
  state.metadata = {
    ...state.metadata,
    draftOutput: output,
    draftOutputUpdatedAt: output.generatedAt,
    draftGenerator: output.generator,
  };
  state.status = "ready_for_review";
  state.updatedAt = output.generatedAt;
  if (index >= 0) states[index] = state;
  else states.unshift(state);
  writeStates(states);
  return { state, intake: result.intake, validation: result.validation, output };
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
    latestDraftOutput: drafts[0]?.metadata?.draftOutput || null,
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
  generateWizardDraftOutput,
  generateAndSaveWizardDraftOutput,
  clearWizardDrafts,
  getWizardProgress,
};
