const { PRODUCTS } = require("../product-catalog");
const { getCompanySettings } = require("../company-settings");
const { calculateJourneyProgress } = require("./progress");
const { getJourneyDefinition, getJourneyDefinitionForType } = require("./definitions");
const { resolveLegacyJourney } = require("./legacyFallback");
const { resolveJourneyFeatureFlag } = require("./featureFlags");
const { FEATURE_FLAGS } = require("./types");
const { createJourneyLogger } = require("./logger");
const { createClientJourneyReadRepository } = require("./clientReadRepository");
const { resolveClientAction } = require("./clientActionPolicy");

const STEP_DESCRIPTIONS = Object.freeze({
  order_received: "We hebben uw bestelling ontvangen en controleren de projectgegevens.",
  payment_confirmed: "De betaling wordt gecontroleerd voordat het project verdergaat.",
  onboarding_information: "We verzamelen de informatie die nodig is om uw project goed te starten.",
  content_ready: "De benodigde teksten, beelden en bestanden worden compleet gemaakt.",
  website_build: "Uw website wordt ontworpen en technisch opgebouwd.",
  customer_review: "Uw ontwerp staat klaar om rustig te beoordelen.",
  launch_checks: "We controleren techniek, inhoud en liveganginstellingen.",
  handover: "We ronden de oplevering en overdracht van uw website af.",
  lead_qualified: "We beoordelen de aanvraag en bepalen de beste vervolgstap.",
  preview_intake: "We verzamelen de informatie voor uw persoonlijke websitepreview.",
  preview_build: "Uw websitepreview wordt ontworpen en opgebouwd.",
  preview_shared: "Uw preview staat klaar om te bekijken.",
  preview_feedback: "Uw opmerkingen worden verzameld en verwerkt.",
  preview_approved: "Uw preview wacht op uw akkoord.",
  commercial_agreement: "De opdracht wordt definitief afgestemd.",
  project_handover: "Het project wordt overgedragen aan het productieteam.",
});

function createClientJourneyReadService(options = {}) {
  const env = options.env || process.env;
  const repository = options.repository || createClientJourneyReadRepository(options);
  const log = options.log || createJourneyLogger({ logger: options.logger, component: "journey_client_service" });
  return { getProgress: (authUserId, context = {}) => getProgress({ authUserId, context, env, repository, log }) };
}

async function getProgress({ authUserId, context, env, repository, log }) {
  const initialEngine = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, context, env);
  const initialUi = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_PROGRESS_UI_ENABLED, context, env);
  if (isDefinitivelyDisabled(initialEngine) || isDefinitivelyDisabled(initialUi)) {
    const gate = isDefinitivelyDisabled(initialEngine) ? initialEngine : initialUi;
    log.info("feature_noop", { operation: "client_progress", result: "disabled", source: "unavailable", featureFlag: gate.flagName, mode: gate.mode, reason: gate.reason });
    return { authorized: true, disabled: true, source: "unavailable", featureFlags: publicFlags(initialEngine, initialUi) };
  }
  const customer = await repository.resolveCustomer(authUserId);
  if (!customer?.id) return { authorized: false, statusCode: 403, reason: "customer_not_linked" };
  const flagContext = { ...context, customerId: customer.id, scopeKey: "client-journey-progress" };
  const engine = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_ENGINE_ENABLED, flagContext, env);
  const ui = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_PROGRESS_UI_ENABLED, flagContext, env);
  if (!engine.enabled || !ui.enabled) {
    const gate = !engine.enabled ? engine : ui;
    log.info("feature_noop", { operation: "client_progress", result: "disabled", source: "unavailable", featureFlag: gate.flagName, mode: gate.mode, reason: gate.reason });
    return { authorized: true, disabled: true, source: "unavailable", featureFlags: publicFlags(engine, ui) };
  }

  const snapshot = await repository.readSnapshot(customer);
  const progress = snapshot.instance ? journeyProgress(snapshot) : legacyProgress(snapshot);
  const action = progress.customerActionRequired ? resolveClientAction(progress.currentStep || {}) : { required: false, found: false, type: "none", url: null, label: null };
  if (progress.customerActionRequired && !action.found) log.info("client_action_mapping", { operation: "client_progress", result: "missing", source: progress.source, actionType: action.type });
  else if (action.found) log.info("client_action_mapping", { operation: "client_progress", result: "found", source: progress.source, actionType: action.type });
  return {
    authorized: true,
    disabled: false,
    featureFlags: publicFlags(engine, ui),
    progress: sanitizeProgress(progress, snapshot, action),
  };
}

function isDefinitivelyDisabled(gate) { return gate.mode === "off" || (gate.mode === "test_only" && !gate.enabled); }

function journeyProgress(snapshot) {
  const row = snapshot.definition;
  const metadata = snapshot.instance.metadata || {};
  const key = metadata.progressDefinitionKey || row?.definition_key;
  const version = metadata.progressDefinitionVersion || row?.version || snapshot.instance.definition_version;
  const definition = getJourneyDefinition(key, version)
    || getJourneyDefinitionForType(snapshot.instance.journey_type, version);
  return calculateJourneyProgress({ instance: { ...snapshot.instance, definition_key: row?.definition_key }, definition });
}

function legacyProgress(snapshot) {
  const progress = resolveLegacyJourney({
    customer: snapshot.customer,
    project: snapshot.project,
    invoice: snapshot.invoice,
    lead: snapshot.lead,
    preview: snapshot.demo ? { status: demoStatus(snapshot.demo.demo_status), updated_at: snapshot.demo.updated_at || snapshot.demo.preview_generated_at } : {},
  });
  if (progress.customerActionRequired && progress.currentStep) {
    const actionStep = ({
      "Preview bekijken": { key: "preview_shared", customerActionType: "review" },
      "Opdracht afstemmen": { key: "commercial_agreement", customerActionType: "approve" },
    })[progress.currentStep.label];
    if (actionStep) progress.currentStep = { ...progress.currentStep, ...actionStep };
  }
  return progress;
}

function sanitizeProgress(progress, snapshot, action) {
  const source = ["journey", "legacy_estimate", "unavailable"].includes(progress.source) ? progress.source : "unavailable";
  const currentStep = publicMilestone(progress.currentStep);
  const assignee = publicContact(snapshot.assignee);
  return {
    source,
    available: progress.available === true,
    percentage: progress.available ? bounded(progress.percentage) : null,
    status: text(progress.status) || (progress.available ? "needs_review" : "unavailable"),
    currentPhase: text(progress.currentPhase) || null,
    currentStep,
    currentStepDescription: currentStep ? STEP_DESCRIPTIONS[currentStep.key] || currentStep.label : null,
    completedMilestones: visibleMilestones(progress.completedSteps),
    remainingMilestones: visibleMilestones(progress.remainingSteps),
    nextStep: publicMilestone(progress.nextStep),
    customerActionRequired: Boolean(progress.customerActionRequired),
    customerAction: {
      type: action.type || "none",
      label: action.label || null,
      url: action.url || null,
      available: Boolean(action.found),
    },
    blocked: Boolean(progress.blocked),
    blocker: progress.blocked ? { label: text(progress.blocker?.label) || "Deze stap heeft aandacht nodig." } : null,
    lastUpdatedAt: validTimestamp(progress.lastUpdatedAt),
    productLabel: productLabel(progress.productCode || snapshot.instance?.product_code || snapshot.customer?.package, progress.journeyType),
    contact: assignee || fallbackContact(),
    estimateLabel: source === "legacy_estimate" ? "Gebaseerd op de huidige projectfase" : null,
    complete: Boolean(progress.complete),
  };
}

function visibleMilestones(steps) { return (Array.isArray(steps) ? steps : []).filter((step) => ["customer", "both"].includes(step.visibility) || !step.visibility).map(publicMilestone).filter(Boolean); }
function publicMilestone(step) { if (!step || typeof step !== "object") return null; return { key: text(step.key), label: text(step.label) || "Projectstap", phaseKey: text(step.phaseKey) || null, order: Number.isFinite(Number(step.order)) ? Number(step.order) : null, optional: step.optional === true, status: safeStepStatus(step.status), customerActionType: text(step.customerActionType) || "none" }; }
function safeStepStatus(value) { const status = text(value).toLowerCase(); return ["pending", "ready", "in_progress", "blocked", "completed", "skipped"].includes(status) ? status : "pending"; }
function publicContact(profile) { if (!profile?.id || text(profile.status || "active").toLowerCase() !== "active") return null; const metadata = profile.metadata && typeof profile.metadata === "object" ? profile.metadata : {}; const name = text(profile.name); if (!name) return null; return { name, role: text(metadata.jobTitle || metadata.job_title) || "Projectcontact", email: businessEmail(profile.email), phone: businessPhone(metadata.businessPhone || metadata.business_phone || metadata.phone), photoUrl: safePhotoUrl(metadata.avatarUrl || metadata.avatar_url || metadata.photoUrl || metadata.photo_url), fallback: false }; }
function fallbackContact() { const settings = getCompanySettings(); return { name: "Team Max Webstudio", role: "Uw vaste webstudioteam", email: settings.primaryEmail, phone: settings.phoneDisplay, photoUrl: null, fallback: true }; }
function productLabel(code, journeyType) { const normalized = text(code).toLowerCase(); const product = Object.values(PRODUCTS).find((item) => [item.code, item.id].map((value) => text(value).toLowerCase()).includes(normalized)); if (product?.name) return product.name; return text(journeyType).includes("preview") ? "Uw websitepreview" : "Uw websiteproject"; }
function businessEmail(value) { const email = text(value).toLowerCase(); return /^[^\s@]+@(?:[a-z0-9-]+\.)*maxwebstudio\.nl$/.test(email) ? email : null; }
function businessPhone(value) { const phone = text(value); return /^[+\d][\d\s().-]{6,24}$/.test(phone) ? phone : null; }
function safePhotoUrl(value) { const url = text(value); if (!url) return null; if (url.startsWith("/assets/") || url.startsWith("/images/")) return url; try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.toString() : null; } catch { return null; } }
function validTimestamp(value) { const date = new Date(value || 0); return value && !Number.isNaN(date.getTime()) ? date.toISOString() : null; }
function bounded(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null; }
function publicFlags(engine, ui) { return { engine: { enabled: engine.enabled, mode: engine.mode }, progressUi: { enabled: ui.enabled, mode: ui.mode } }; }
function demoStatus(value) { return ({ aanvraag_ontvangen: "requested", briefing_klaar: "requested", intern_in_productie: "internal", interne_preview_klaar: "internal", preview_ingepland_voor_klant: "ready_for_review", preview_verstuurd: "ready_for_review", feedback_ontvangen: "feedback_received", aanpassingen_bezig: "feedback_received", definitieve_versie_klaar: "ready_for_review", belafspraak_gepland: "approved", verkocht: "approved" })[text(value).toLowerCase()] || ""; }
function text(value) { return String(value || "").trim(); }

module.exports = { createClientJourneyReadService, _private: { fallbackContact, productLabel, publicContact, sanitizeProgress } };
