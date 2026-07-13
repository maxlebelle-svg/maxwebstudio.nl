const { PRODUCTS, WEBSITE_PRODUCT_IDS } = require("../product-catalog");

const DEFINITION_SCHEMA_VERSION = 1;
const CUSTOMER_ACTION_TYPES = Object.freeze(["none", "provide_information", "review", "approve", "pay"]);
const INTERNAL_ACTION_TYPES = Object.freeze(["none", "qualify", "review", "build", "publish", "handover"]);
const VISIBILITY_TYPES = Object.freeze(["internal", "customer", "both"]);
const COMPLETION_RULES = Object.freeze([
  "event_recorded",
  "payment_confirmed",
  "information_received",
  "internal_confirmation",
  "customer_confirmation",
  "status_confirmed",
]);

const websiteProductCodes = Object.freeze(WEBSITE_PRODUCT_IDS.map((id) => PRODUCTS[id]?.code).filter(Boolean));

const DIRECT_CHECKOUT_DEFINITION = defineJourney({
  definitionKey: "website.direct_checkout",
  version: 1,
  journeyType: "website.direct_checkout",
  productCategory: "website",
  productCodes: websiteProductCodes,
  phases: [
    { key: "order", label: "Bestelling" },
    { key: "onboarding", label: "Onboarding" },
    { key: "production", label: "Productie" },
    { key: "review", label: "Controle" },
    { key: "delivery", label: "Oplevering" },
  ],
  steps: [
    step("order_received", "Bestelling ontvangen", "order", 1, 10, false, "none", "review", "event_recorded", "internal", "payment_confirmed"),
    step("payment_confirmed", "Betaling bevestigd", "order", 2, 15, false, "none", "review", "payment_confirmed", "internal", "onboarding_information"),
    step("onboarding_information", "Onboarding compleet", "onboarding", 3, 15, false, "provide_information", "review", "information_received", "both", "content_ready"),
    step("content_ready", "Content compleet", "onboarding", 4, 10, false, "provide_information", "review", "information_received", "both", "website_build"),
    step("website_build", "Website gebouwd", "production", 5, 20, false, "none", "build", "internal_confirmation", "both", "customer_review"),
    step("customer_review", "Klantcontrole", "review", 6, 10, false, "review", "review", "customer_confirmation", "both", "launch_checks"),
    step("launch_checks", "Livegangcontrole", "delivery", 7, 10, false, "none", "publish", "internal_confirmation", "both", "handover"),
    step("handover", "Oplevering", "delivery", 8, 10, false, "approve", "handover", "status_confirmed", "both", null),
  ],
});

const FREE_PREVIEW_DEFINITION = defineJourney({
  definitionKey: "website.free_preview_sales",
  version: 1,
  journeyType: "website.free_preview_sales",
  productCategory: "website",
  productCodes: websiteProductCodes,
  phases: [
    { key: "sales", label: "Sales" },
    { key: "preview", label: "Gratis preview" },
    { key: "decision", label: "Besluit" },
    { key: "conversion", label: "Opdrachtstart" },
  ],
  steps: [
    step("lead_qualified", "Lead gekwalificeerd", "sales", 1, 10, false, "none", "qualify", "internal_confirmation", "internal", "preview_intake"),
    step("preview_intake", "Preview-intake compleet", "preview", 2, 15, false, "provide_information", "review", "information_received", "both", "preview_build"),
    step("preview_build", "Preview gebouwd", "preview", 3, 25, false, "none", "build", "internal_confirmation", "both", "preview_shared"),
    step("preview_shared", "Preview gedeeld", "preview", 4, 10, false, "review", "publish", "event_recorded", "both", "preview_feedback"),
    step("preview_feedback", "Feedback verwerkt", "preview", 5, 10, true, "provide_information", "review", "customer_confirmation", "both", "preview_approved"),
    step("preview_approved", "Preview goedgekeurd", "decision", 6, 10, false, "approve", "review", "customer_confirmation", "both", "commercial_agreement"),
    step("commercial_agreement", "Opdracht bevestigd", "conversion", 7, 10, false, "approve", "review", "status_confirmed", "both", "payment_confirmed"),
    step("payment_confirmed", "Betaling bevestigd", "conversion", 8, 5, true, "pay", "review", "payment_confirmed", "both", "project_handover"),
    step("project_handover", "Overgedragen aan productie", "conversion", 9, 5, false, "none", "handover", "internal_confirmation", "internal", null),
  ],
});

const DIRECT_CHECKOUT_POST_LAUNCH_DEFINITION = defineJourney({
  definitionKey: "website.direct_checkout",
  version: 2,
  journeyType: "website.direct_checkout",
  productCategory: "website",
  productCodes: websiteProductCodes,
  phases: [
    { key: "order", label: "Bestelling" },
    { key: "onboarding", label: "Onboarding" },
    { key: "production", label: "Productie" },
    { key: "review", label: "Controle" },
    { key: "delivery", label: "Oplevering" },
    { key: "post_launch", label: "Nazorg" },
  ],
  steps: [
    step("order_received", "Bestelling ontvangen", "order", 1, 10, false, "none", "review", "event_recorded", "internal", "payment_confirmed"),
    step("payment_confirmed", "Betaling bevestigd", "order", 2, 15, false, "none", "review", "payment_confirmed", "internal", "onboarding_information"),
    step("onboarding_information", "Onboarding compleet", "onboarding", 3, 15, false, "provide_information", "review", "information_received", "both", "content_ready"),
    step("content_ready", "Content compleet", "onboarding", 4, 10, false, "provide_information", "review", "information_received", "both", "website_build"),
    step("website_build", "Website gebouwd", "production", 5, 15, false, "none", "build", "internal_confirmation", "both", "customer_review"),
    step("customer_review", "Klantcontrole", "review", 6, 10, false, "review", "review", "customer_confirmation", "both", "launch_checks"),
    step("launch_checks", "Livegangcontrole", "delivery", 7, 10, false, "none", "publish", "internal_confirmation", "both", "handover"),
    step("handover", "Technische oplevering", "delivery", 8, 5, false, "none", "handover", "status_confirmed", "both", "website_live"),
    step("website_live", "Website live", "delivery", 9, 5, false, "none", "publish", "status_confirmed", "both", "post_launch_check"),
    step("post_launch_check", "Nazorg en controle", "post_launch", 10, 5, false, "none", "review", "internal_confirmation", "both", null),
  ],
});

const FREE_PREVIEW_POST_LAUNCH_DEFINITION = defineJourney({
  definitionKey: "website.free_preview_sales",
  version: 2,
  journeyType: "website.free_preview_sales",
  productCategory: "website",
  productCodes: websiteProductCodes,
  phases: [
    { key: "sales", label: "Sales" },
    { key: "preview", label: "Gratis preview" },
    { key: "decision", label: "Besluit" },
    { key: "conversion", label: "Opdrachtstart" },
    { key: "delivery", label: "Oplevering" },
    { key: "post_launch", label: "Nazorg" },
  ],
  steps: [
    step("lead_qualified", "Lead gekwalificeerd", "sales", 1, 5, false, "none", "qualify", "internal_confirmation", "internal", "preview_intake"),
    step("preview_intake", "Preview-intake compleet", "preview", 2, 10, false, "provide_information", "review", "information_received", "both", "preview_build"),
    step("preview_build", "Preview gebouwd", "preview", 3, 15, false, "none", "build", "internal_confirmation", "both", "preview_shared"),
    step("preview_shared", "Preview gedeeld", "preview", 4, 5, false, "review", "publish", "event_recorded", "both", "preview_feedback"),
    step("preview_feedback", "Feedback verwerkt", "preview", 5, 5, true, "provide_information", "review", "customer_confirmation", "both", "preview_approved"),
    step("preview_approved", "Preview goedgekeurd", "decision", 6, 5, false, "approve", "review", "customer_confirmation", "both", "commercial_agreement"),
    step("commercial_agreement", "Opdracht bevestigd", "conversion", 7, 10, false, "approve", "review", "status_confirmed", "both", "payment_confirmed"),
    step("payment_confirmed", "Betaling bevestigd", "conversion", 8, 5, true, "pay", "review", "payment_confirmed", "both", "project_handover"),
    step("project_handover", "Overgedragen aan productie", "conversion", 9, 5, false, "none", "handover", "internal_confirmation", "internal", "website_build"),
    step("website_build", "Website gebouwd", "delivery", 10, 15, false, "none", "build", "internal_confirmation", "both", "launch_checks"),
    step("launch_checks", "Livegangcontrole", "delivery", 11, 10, false, "none", "publish", "internal_confirmation", "both", "website_live"),
    step("website_live", "Website live", "delivery", 12, 5, false, "none", "publish", "status_confirmed", "both", "post_launch_check"),
    step("post_launch_check", "Nazorg en controle", "post_launch", 13, 5, false, "none", "review", "internal_confirmation", "both", null),
  ],
});

const JOURNEY_DEFINITIONS = Object.freeze([
  DIRECT_CHECKOUT_DEFINITION,
  FREE_PREVIEW_DEFINITION,
  DIRECT_CHECKOUT_POST_LAUNCH_DEFINITION,
  FREE_PREVIEW_POST_LAUNCH_DEFINITION,
]);

function step(key, label, phaseKey, order, weight, optional, customerActionType, internalActionType, completionRule, visibility, nextStepKey) {
  return { key, label, phaseKey, order, weight, optional, customerActionType, internalActionType, completionRule, visibility, nextStepKey };
}

function defineJourney(input) {
  const definition = {
    schemaVersion: DEFINITION_SCHEMA_VERSION,
    ...input,
    phases: input.phases.map((phase) => Object.freeze({ ...phase })),
    steps: input.steps.map((item) => Object.freeze({ ...item })),
  };
  validateJourneyDefinitionModel(definition);
  return Object.freeze(definition);
}

function validateJourneyDefinitionModel(definition = {}) {
  if (!/^[a-z][a-z0-9._-]{2,127}$/.test(text(definition.definitionKey))) throw definitionError("invalid_definition_key");
  if (!Number.isInteger(definition.version) || definition.version < 1) throw definitionError("invalid_definition_version");
  if (definition.schemaVersion !== DEFINITION_SCHEMA_VERSION) throw definitionError("invalid_schema_version");
  if (!Array.isArray(definition.productCodes) || !definition.productCodes.length) throw definitionError("missing_product_codes");
  const catalogCodes = new Set(Object.values(PRODUCTS).map((product) => product.code));
  if (definition.productCodes.some((code) => !catalogCodes.has(code))) throw definitionError("invalid_product_code");
  if (!Array.isArray(definition.steps) || !definition.steps.length) throw definitionError("missing_steps");
  const phaseKeys = new Set((definition.phases || []).map((phase) => phase.key));
  const stepKeys = new Set();
  const orders = new Set();
  let totalWeight = 0;
  for (const item of definition.steps) {
    if (!/^[a-z][a-z0-9_]{2,79}$/.test(text(item.key)) || stepKeys.has(item.key)) throw definitionError("duplicate_or_invalid_step_key");
    if (!Number.isInteger(item.order) || item.order < 1 || orders.has(item.order)) throw definitionError("duplicate_or_invalid_step_order");
    if (!Number.isFinite(item.weight) || item.weight <= 0 || item.weight > 100) throw definitionError("invalid_step_weight");
    if (!phaseKeys.has(item.phaseKey)) throw definitionError("invalid_step_phase");
    if (!CUSTOMER_ACTION_TYPES.includes(item.customerActionType)) throw definitionError("invalid_customer_action_type");
    if (!INTERNAL_ACTION_TYPES.includes(item.internalActionType)) throw definitionError("invalid_internal_action_type");
    if (!COMPLETION_RULES.includes(item.completionRule)) throw definitionError("invalid_completion_rule");
    if (!VISIBILITY_TYPES.includes(item.visibility)) throw definitionError("invalid_visibility");
    stepKeys.add(item.key);
    orders.add(item.order);
    totalWeight += item.weight;
  }
  if (totalWeight !== 100) throw definitionError("definition_weight_must_equal_100");
  for (const item of definition.steps) {
    if (item.nextStepKey && !stepKeys.has(item.nextStepKey)) throw definitionError("invalid_next_step");
    if (item.nextStepKey === item.key) throw definitionError("recursive_next_step");
  }
  const ordered = [...definition.steps].sort((a, b) => a.order - b.order);
  for (let index = 0; index < ordered.length - 1; index += 1) {
    if (ordered[index].nextStepKey !== ordered[index + 1].key) throw definitionError("inconsistent_next_step_order");
  }
  if (ordered.at(-1)?.nextStepKey) throw definitionError("terminal_step_has_next_step");
  return definition;
}

function getJourneyDefinition(definitionKey, version = 1) {
  return JOURNEY_DEFINITIONS.find((definition) => definition.definitionKey === text(definitionKey) && definition.version === Number(version)) || null;
}

function getJourneyDefinitionForType(journeyType, version = 1) {
  return JOURNEY_DEFINITIONS.find((definition) => definition.journeyType === text(journeyType) && definition.version === Number(version)) || null;
}

function definitionError(code) {
  const error = new Error("Journeydefinition is ongeldig.");
  error.name = "JourneyDefinitionError";
  error.code = code;
  return error;
}

function text(value) {
  return String(value || "").trim();
}

module.exports = {
  COMPLETION_RULES,
  CUSTOMER_ACTION_TYPES,
  DEFINITION_SCHEMA_VERSION,
  DIRECT_CHECKOUT_DEFINITION,
  DIRECT_CHECKOUT_POST_LAUNCH_DEFINITION,
  FREE_PREVIEW_DEFINITION,
  FREE_PREVIEW_POST_LAUNCH_DEFINITION,
  INTERNAL_ACTION_TYPES,
  JOURNEY_DEFINITIONS,
  VISIBILITY_TYPES,
  getJourneyDefinition,
  getJourneyDefinitionForType,
  validateJourneyDefinitionModel,
};
