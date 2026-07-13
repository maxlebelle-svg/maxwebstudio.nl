const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DIRECT_CHECKOUT_DEFINITION,
  FREE_PREVIEW_DEFINITION,
  JOURNEY_DEFINITIONS,
  validateJourneyDefinitionModel,
} = require("../functions/journey/definitions");
const { resolveLegacyJourney } = require("../functions/journey/legacyFallback");
const { calculateJourneyProgress } = require("../functions/journey/progress");
const { validateStepTransition } = require("../functions/journey/transitions");

function instance(definition, stepStates = {}, overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    journey_type: definition.journeyType,
    definition_version: definition.version,
    status: "active",
    metadata: { definitionKey: definition.definitionKey, stepStates },
    updated_at: "2026-07-13T12:00:00.000Z",
    ...overrides,
  };
}

function states(definition, status = "pending") {
  return Object.fromEntries(definition.steps.map((step) => [step.key, status]));
}

test("progress is zero with no completed steps", () => {
  const result = calculateJourneyProgress({ instance: instance(DIRECT_CHECKOUT_DEFINITION) });
  assert.equal(result.percentage, 0);
  assert.equal(result.complete, false);
});

test("weighted progress is deterministic between zero and one hundred", () => {
  const result = calculateJourneyProgress({ instance: instance(DIRECT_CHECKOUT_DEFINITION, { order_received: "completed", payment_confirmed: "completed" }) });
  assert.equal(result.percentage, 25);
  assert.equal(result.completedSteps.length, 2);
  assert.equal(result.remainingSteps.length, 6);
});

test("completed journey is exactly one hundred percent", () => {
  const result = calculateJourneyProgress({ instance: instance(DIRECT_CHECKOUT_DEFINITION, {}, { status: "completed" }) });
  assert.equal(result.percentage, 100);
  assert.equal(result.complete, true);
});

test("optional skipped steps do not block completion", () => {
  const values = states(FREE_PREVIEW_DEFINITION, "completed");
  FREE_PREVIEW_DEFINITION.steps.filter((step) => step.optional).forEach((step) => { values[step.key] = "skipped"; });
  const result = calculateJourneyProgress({ instance: instance(FREE_PREVIEW_DEFINITION, values) });
  assert.equal(result.percentage, 100);
  assert.equal(result.complete, true);
  assert.equal(result.remainingSteps.length, 0);
});

test("blocked step is exposed without inventing progress", () => {
  const result = calculateJourneyProgress({ instance: instance(DIRECT_CHECKOUT_DEFINITION, { order_received: "completed", payment_confirmed: "blocked" }) });
  assert.equal(result.percentage, 10);
  assert.equal(result.blocked, true);
  assert.equal(result.currentStep.key, "payment_confirmed");
});

test("unknown step status uses a safe pending fallback", () => {
  const result = calculateJourneyProgress({ instance: instance(DIRECT_CHECKOUT_DEFINITION, { order_received: "mystery" }) });
  assert.equal(result.percentage, 0);
  assert.equal(result.hasUnknownStepStatuses, true);
  assert.equal(result.currentStep.status, "pending");
});

test("weight calculation normalizes definitions that do not total one hundred", () => {
  const custom = {
    ...DIRECT_CHECKOUT_DEFINITION,
    steps: [
      { ...DIRECT_CHECKOUT_DEFINITION.steps[0], weight: 2, nextStepKey: "payment_confirmed" },
      { ...DIRECT_CHECKOUT_DEFINITION.steps[1], weight: 3, nextStepKey: null },
    ],
  };
  const result = calculateJourneyProgress({ instance: instance(custom, { order_received: "completed" }), definition: custom });
  assert.equal(result.percentage, 40);
  assert.equal(Number.isNaN(result.percentage), false);
});

test("both direct checkout and free preview definitions calculate independently", () => {
  const direct = calculateJourneyProgress({ instance: instance(DIRECT_CHECKOUT_DEFINITION, { order_received: "completed" }) });
  const preview = calculateJourneyProgress({ instance: instance(FREE_PREVIEW_DEFINITION, { lead_qualified: "completed" }) });
  assert.equal(direct.definitionKey, "website.direct_checkout");
  assert.equal(preview.definitionKey, "website.free_preview_sales");
  assert.equal(direct.percentage, 10);
  assert.equal(preview.percentage, 10);
});

test("central definitions have catalog products, unique steps and consistent order", () => {
  assert.equal(JOURNEY_DEFINITIONS.length, 4);
  for (const definition of JOURNEY_DEFINITIONS) {
    assert.equal(validateJourneyDefinitionModel(definition), definition);
    assert.equal(new Set(definition.steps.map((step) => step.key)).size, definition.steps.length);
    assert.equal(new Set(definition.steps.map((step) => step.order)).size, definition.steps.length);
    assert.equal(definition.steps.reduce((sum, step) => sum + step.weight, 0), 100);
    assert.ok(definition.productCodes.every((code) => /^WEB-/.test(code)));
  }
});

test("definition validation rejects duplicate keys, duplicate order, invalid weight and product", () => {
  const clone = () => JSON.parse(JSON.stringify(DIRECT_CHECKOUT_DEFINITION));
  const duplicateKey = clone(); duplicateKey.steps[1].key = duplicateKey.steps[0].key;
  assert.throws(() => validateJourneyDefinitionModel(duplicateKey), { code: "duplicate_or_invalid_step_key" });
  const duplicateOrder = clone(); duplicateOrder.steps[1].order = duplicateOrder.steps[0].order;
  assert.throws(() => validateJourneyDefinitionModel(duplicateOrder), { code: "duplicate_or_invalid_step_order" });
  const invalidWeight = clone(); invalidWeight.steps[0].weight = -1;
  assert.throws(() => validateJourneyDefinitionModel(invalidWeight), { code: "invalid_step_weight" });
  const invalidProduct = clone(); invalidProduct.productCodes = ["WEB-NOT-IN-CATALOG"];
  assert.throws(() => validateJourneyDefinitionModel(invalidProduct), { code: "invalid_product_code" });
});

test("step transitions allow the safe path and optional skip only", () => {
  const context = { isTest: true };
  assert.equal(validateStepTransition({ from: "pending", to: "ready" }, context).allowed, true);
  assert.equal(validateStepTransition({ from: "ready", to: "in_progress" }, context).allowed, true);
  assert.equal(validateStepTransition({ from: "in_progress", to: "completed" }, context).allowed, true);
  assert.equal(validateStepTransition({ from: "blocked", to: "in_progress" }, context).allowed, true);
  assert.equal(validateStepTransition({ from: "pending", to: "skipped", optional: true }, context).allowed, true);
  assert.equal(validateStepTransition({ from: "pending", to: "skipped", optional: false }, context).allowed, false);
  assert.equal(validateStepTransition({ from: "cancelled", to: "completed" }, context).allowed, false);
  assert.equal(validateStepTransition({ from: "completed", to: "pending" }, context).allowed, false);
  assert.equal(validateStepTransition({ from: "pending", to: "ready" }, {}).reason, "transition_context_required");
});

test("completed step reopening requires explicit admin service override and reason", () => {
  const context = { adminAuthorized: true, serviceContext: "journey_admin" };
  assert.equal(validateStepTransition({ from: "completed", to: "pending", adminOverride: true, reason: "Correctie na controle" }, context).allowed, true);
  assert.equal(validateStepTransition({ from: "completed", to: "pending", adminOverride: true }, context).allowed, false);
});

test("legacy project status is estimated without persisting a journey", () => {
  const input = { customer: { id: "customer-1", company: "Voorbeeld BV" }, project: { status: "development", updated_at: "2026-07-12T10:00:00Z" } };
  const before = JSON.parse(JSON.stringify(input));
  const result = resolveLegacyJourney(input);
  assert.equal(result.source, "legacy_estimate");
  assert.equal(result.percentage, 65);
  assert.equal(result.migrated, false);
  assert.deepEqual(input, before);
});

test("unknown or missing legacy data stays explicitly unavailable", () => {
  assert.equal(resolveLegacyJourney({ customer: { id: "customer-1" }, project: { status: "mystery" } }).source, "unavailable");
  assert.equal(resolveLegacyJourney({}).reason, "legacy_data_unavailable");
});

test("paid commercial checkout is recognized read-only", () => {
  const result = resolveLegacyJourney({
    customer: { id: "customer-1", company: "Checkout BV", package: "WEB-STARTER", metadata: { source: "commercial_order" } },
    invoice: { status: "paid", paid_at: "2026-07-12T10:00:00Z", notes: '{"source":"commercial_order"}' },
  });
  assert.equal(result.definitionKey, "website.direct_checkout");
  assert.ok(result.percentage >= 20);
});

test("free preview prospect receives an indicative preview phase", () => {
  const result = resolveLegacyJourney({
    lead: { id: "lead-1", company_name: "Preview BV", source: "active_sales_preview" },
    customer: { company: "Preview BV" },
    preview: { status: "ready_for_review" },
  });
  assert.equal(result.definitionKey, "website.free_preview_sales");
  assert.equal(result.customerActionRequired, true);
  assert.equal(result.source, "legacy_estimate");
});
