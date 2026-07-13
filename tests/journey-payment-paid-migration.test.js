const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { resolvePaymentPaidContext } = require("../functions/journey/paymentPaid/contextResolver");
const { resolvePaymentPaidOwnership } = require("../functions/journey/paymentPaid/ownershipResolver");
const { planPaymentPaidProgress } = require("../functions/journey/paymentPaid/progressTransition");
const { createPaymentPaidRepository, _private: repositoryPrivate } = require("../functions/journey/paymentPaid/repository");
const { createPaymentPaidService, _private: servicePrivate } = require("../functions/journey/paymentPaid/service");
const { validateMailCommand } = require("../functions/journey/mail/command");
const { renderJourneyMail } = require("../functions/journey/mail/templateRenderer");
const { _private: adminPrivate } = require("../functions/journey/adminReadService");
const CUSTOMER = "11111111-1111-4111-8111-111111111111"; const OTHER = "22222222-2222-4222-8222-222222222222"; const INSTANCE = "33333333-3333-4333-8333-333333333333"; const INVOICE = "44444444-4444-4444-8444-444444444444";
const ENV = { APP_ENV: "production", JOURNEY_ENGINE_ENABLED: "allowlist", JOURNEY_ENGINE_ENABLED_ALLOWLIST: CUSTOMER, JOURNEY_EMAIL_AUTOMATION_ENABLED: "allowlist", JOURNEY_EMAIL_AUTOMATION_ENABLED_ALLOWLIST: `${CUSTOMER},journey-mail-worker`, JOURNEY_PAYMENT_PAID_TEST_CUSTOMERS: CUSTOMER, JOURNEY_EMAIL_TEST_RECIPIENTS: "tester@example.com" };
const INSTANCE_ROW = { id: INSTANCE, instance_key: `payment-test:${CUSTOMER}`, customer_id: CUSTOMER, environment: "test", status: "active", current_step: "payment_confirmed", updated_at: "2026-07-13T20:00:00Z", metadata: { testOnly: true, paymentPaidEmailOwner: "journey", definitionKey: "website.free_preview_sales", definitionVersion: 1, stepStates: { lead_qualified: "completed", preview_intake: "completed", preview_build: "completed", preview_shared: "completed", preview_feedback: "completed", preview_approved: "completed", commercial_agreement: "completed", payment_confirmed: "ready" } } };
function payment(overrides = {}) { return { id: "tr_test_paid", status: "paid", mode: "test", paidAt: "2026-07-13T20:00:00Z", amount: { currency: "EUR", value: "121.00" }, ...overrides }; }
function invoice(overrides = {}) { return { id: INVOICE, invoice_number: "INV-TEST", title: "Testfactuur", amount: 121, status: "paid", paid_at: "2026-07-13T20:00:00Z", mollie_payment_id: "tr_test_paid", notes: "", ...overrides }; }
function context(overrides = {}) { const input = { provider: "mollie", providerVerified: true, customerId: CUSTOMER, payment: payment(), invoice: invoice(), invoiceContext: { source: "commercial_order", environment: "test", orderId: "order-safe", paymentChoice: "full", remainingAmount: 0 }, ...overrides }; return resolvePaymentPaidContext(input); }
function dispatchInput(paymentContext, overrides = {}) { return { customerId: CUSTOMER, invoiceId: INVOICE, paidAt: "2026-07-13T20:00:00Z", recipient: "tester@example.com", firstName: "Max", invoiceLabel: "INV-TEST", paymentContext, legacySend: async () => null, ...overrides }; }

test("resolver classifies full, deposit, remainder, preview deposit and linked invoice payments", () => {
  assert.equal(context().paymentType, "full");
  assert.equal(context({ invoiceContext: { source: "commercial_order", environment: "test", orderId: "order-safe", paymentChoice: "deposit", remainingAmount: 500 } }).paymentType, "deposit");
  assert.equal(context({ invoiceContext: { source: "commercial_order", environment: "test", orderId: "order-safe", paymentType: "remaining" } }).paymentType, "remainder");
  const preview = context({ invoice: invoice({ notes: `TEST;previewDeposit:${OTHER};customer:${CUSTOMER}` }), invoiceContext: {} }); assert.equal(preview.paymentType, "deposit"); assert.equal(preview.journeyType, "website.free_preview_sales");
  const standalone = context({ invoiceContext: {} }); assert.equal(standalone.paymentType, "invoice"); assert.equal(standalone.journeyRelevant, false);
});

test("resolver rejects unverified, mismatched, wrong-currency, wrong-environment and cancelled evidence", () => {
  assert.equal(context({ providerVerified: false }).safe, false);
  assert.equal(context({ invoice: invoice({ mollie_payment_id: "tr_other" }) }).reasonCode, "payment_invoice_link_invalid");
  assert.equal(context({ invoiceContext: { source: "commercial_order", environment: "test", customerId: OTHER, orderId: "x", paymentChoice: "full" } }).reasonCode, "payment_customer_link_mismatch");
  assert.equal(context({ payment: payment({ metadata: { invoiceId: OTHER } }) }).reasonCode, "provider_invoice_link_mismatch");
  assert.equal(context({ payment: payment({ amount: { currency: "USD", value: "121.00" } }) }).reasonCode, "payment_currency_invalid");
  assert.equal(context({ payment: payment({ amount: { currency: "EUR", value: "120.99" } }) }).reasonCode, "payment_invoice_amount_mismatch");
  assert.equal(context({ payment: payment({ mode: "live" }) }).reasonCode, "payment_environment_mismatch");
  assert.equal(context({ invoiceContext: { source: "commercial_order", status: "cancelled", environment: "test", orderId: "x", paymentChoice: "full" } }).reasonCode, "commercial_order_cancelled");
  assert.equal(context({ customerId: "" }).reasonCode, "customer_link_missing");
});

test("ownership is isolated to the payment allowlist and one enabled existing test journey", () => {
  const paymentContext = context(); const transition = planPaymentPaidProgress(INSTANCE_ROW, "payment-ref", paymentContext);
  assert.equal(resolvePaymentPaidOwnership({ ...dispatchInput(paymentContext), paymentReference: paymentContext.paymentReference, journeyInstance: INSTANCE_ROW, transition, runtimeEnvironment: "production" }, {}).owner, "legacy");
  assert.equal(resolvePaymentPaidOwnership({ ...dispatchInput(paymentContext), customerId: OTHER, paymentReference: paymentContext.paymentReference, journeyInstance: INSTANCE_ROW, transition, runtimeEnvironment: "production" }, ENV).owner, "legacy");
  assert.equal(resolvePaymentPaidOwnership({ ...dispatchInput(paymentContext), paymentReference: paymentContext.paymentReference, journeyInstance: INSTANCE_ROW, transition, runtimeEnvironment: "production" }, ENV).owner, "journey");
});

test("progress differentiates journey-relevant payment, standalone invoice, duplicate and blocked journey", () => {
  const paid = planPaymentPaidProgress(INSTANCE_ROW, "one", context()); assert.equal(paid.patch.metadata.stepStates.payment_confirmed, "completed"); assert.equal(paid.patch.metadata.stepStates.project_handover, "ready"); assert.equal(paid.patch.metadata.stepStates.website_live, undefined);
  const invoiceOnly = planPaymentPaidProgress(INSTANCE_ROW, "invoice", context({ invoiceContext: {} })); assert.equal(invoiceOnly.valid, true); assert.equal(invoiceOnly.patch, null);
  const duplicate = planPaymentPaidProgress({ ...INSTANCE_ROW, metadata: { ...paid.patch.metadata } }, "one", context()); assert.equal(duplicate.duplicate, true);
  const blocked = planPaymentPaidProgress({ ...INSTANCE_ROW, metadata: { ...INSTANCE_ROW.metadata, stepStates: { ...INSTANCE_ROW.metadata.stepStates, commercial_agreement: "blocked" } } }, "blocked", context()); assert.equal(blocked.valid, false);
});

test("stable payment scope stores one event/outbox and never falls back after ambiguous acceptance", async () => {
  const calls = []; const paymentRepository = { findTestJourney: async () => ({ available: true, row: INSTANCE_ROW }), applyProgress: async () => ({ available: true, skipped: false, reason: "progress_updated" }), cancelPendingReminders: async () => ({ available: true, cancelledCount: 2, reason: "payment_reminders_cancelled" }) }; const service = createPaymentPaidService({ env: ENV, paymentRepository, journeyRepository: { recordJourneyEvent: async (event, settings) => { calls.push({ event, settings }); return { available: true, row: { outbox_id: "outbox-1", duplicate: calls.length > 1 } }; } }, logger: { info() {}, error() {} } });
  let legacy = 0; const first = await service.dispatch(dispatchInput(context(), { legacySend: async () => { legacy += 1; } })); const second = await service.dispatch(dispatchInput(context(), { legacySend: async () => { legacy += 1; } })); assert.equal(first.owner, "journey"); assert.equal(first.reminders.cancelledCount, 2); assert.equal(second.duplicate, true); assert.equal(legacy, 0); assert.equal(calls[0].event.eventType, "payment.paid"); assert.equal(calls[0].settings.outbox.effectType, "email.payment_paid"); assert.equal(calls[0].event.eventKey, calls[1].event.eventKey); assert.equal(JSON.stringify(calls[0].event.payload).includes("121"), false);
  const ambiguous = createPaymentPaidService({ env: ENV, paymentRepository, journeyRepository: { recordJourneyEvent: async () => { throw new Error("timeout"); } }, logger: { info() {}, error() {} } }); const failed = await ambiguous.dispatch(dispatchInput(context(), { legacySend: async () => { legacy += 1; } })); assert.equal(failed.owner, "journey"); assert.equal(failed.fallbackAllowed, false); assert.equal(legacy, 0);
  const keys = servicePrivate.stableKeys({ provider: "mollie", paymentReference: "tr_test_paid", customerId: CUSTOMER, orderReference: "order-safe", invoiceId: INVOICE, templateVersion: 1 }); assert.match(keys.eventKey, /^payment\.paid:[a-f0-9]{40}$/);
});

test("flags off and unavailable storage retain exactly one legacy owner", async () => {
  let legacy = 0; const off = createPaymentPaidService({ env: {}, paymentRepository: { findTestJourney: async () => { throw new Error("no read"); } }, journeyRepository: {}, logger: { info() {}, error() {} } }); assert.equal((await off.dispatch(dispatchInput(context(), { legacySend: async () => { legacy += 1; } }))).owner, "legacy");
  const unavailable = createPaymentPaidService({ env: ENV, paymentRepository: { findTestJourney: async () => ({ available: false, reason: "storage_unavailable" }) }, journeyRepository: {}, logger: { info() {}, error() {} } }); assert.equal((await unavailable.dispatch(dispatchInput(context(), { legacySend: async () => { legacy += 1; } }))).owner, "legacy"); assert.equal(legacy, 2);
});

test("reminder matching is exact and cancellation never touches sent or another scope", async () => {
  assert.equal(repositoryPrivate.matchesScope({ invoiceReference: INVOICE }, { invoiceReference: INVOICE }), true); assert.equal(repositoryPrivate.matchesScope({ orderId: "other" }, { orderReference: "order-safe" }), false);
  const requests = []; const fetchImpl = async (url, options = {}) => { requests.push({ url, options }); if (!options.method) return response([{ id: "r1", status: "pending", payload: { invoiceReference: INVOICE } }, { id: "r2", status: "pending", payload: { invoiceReference: OTHER } }]); return response([{ id: "r1", status: "cancelled" }]); }; const repo = createPaymentPaidRepository({ env: { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" }, fetchImpl }); const result = await repo.cancelPendingReminders({ safe: true, customerId: CUSTOMER, invoiceReference: INVOICE }); assert.equal(result.cancelledCount, 1); assert.equal(requests.filter((item) => item.options.method === "PATCH").length, 1); assert.match(requests[0].url, /status=in.%28pending%2Cfailed%29/); assert.match(requests[1].url, /status=in.%28pending%2Cfailed%29/);
});

test("payment template is escaped, test-marked, type-aware and only shows a reliable amount", () => {
  function command(type, minor) { return validateMailCommand({ automationKey: "journey.payment_paid", templateKey: "journey.payment_paid", templateVersion: 1, journeyEventKey: `payment.paid:${type}`, outboxIdempotencyKey: `payment.paid.email:${type}:v1`, customerReference: CUSTOMER, journeyInstanceReference: INSTANCE, recipient: "tester@example.com", replyToProfile: { email: "info@maxwebstudio.nl" }, subjectData: { label: "Test" }, templateData: { firstName: "<Max>", paymentReference: "abcdef", invoiceLabel: "INV & 1", paymentType: type, paidAmountMinor: minor, currency: minor ? "EUR" : "", percentage: 80, currentPhase: "Projectstart", nextStep: "Volgende stap", contactName: "Team Max Webstudio" }, actionUrl: "https://maxwebstudio.nl/klantportaal.html#facturen", metadata: { scenario: "payment_paid_test_customer", paymentReference: "abcdef" } }, { customerId: CUSTOMER, environment: "test" }, ENV); }
  assert.throws(() => command("full", 12100), { code: "unsafe_template_data" }); const safe = validateMailCommand({ ...commandInput("full", 12100) }, { customerId: CUSTOMER, environment: "test" }, ENV); const rendered = renderJourneyMail(safe); assert.equal(rendered.subject, "[TEST] Uw betaling is ontvangen"); assert.match(rendered.text, /Volledige betaling/); assert.match(rendered.text, /€\s?121,00/); assert.match(rendered.text, /Team Max Webstudio/); const without = renderJourneyMail(validateMailCommand(commandInput("deposit", null), { customerId: CUSTOMER, environment: "test" }, ENV)); assert.doesNotMatch(without.text, /Ontvangen: €/);
});
function commandInput(type, minor) { return { automationKey: "journey.payment_paid", templateKey: "journey.payment_paid", templateVersion: 1, journeyEventKey: `payment.paid:${type}`, outboxIdempotencyKey: `payment.paid.email:${type}:v1`, customerReference: CUSTOMER, journeyInstanceReference: INSTANCE, recipient: "tester@example.com", replyToProfile: { email: "info@maxwebstudio.nl" }, subjectData: { label: "Test" }, templateData: { firstName: "Max", paymentReference: "abcdef", invoiceLabel: "INV & 1", paymentType: type, paidAmountMinor: minor, currency: minor ? "EUR" : "", percentage: 80, currentPhase: "Projectstart", nextStep: "Volgende stap", contactName: "Team Max Webstudio" }, actionUrl: "https://maxwebstudio.nl/klantportaal.html#facturen", metadata: { scenario: "payment_paid_test_customer", paymentReference: "abcdef" } }; }

test("webhook integration stays after durable finance updates and preserves all non-payment flows", () => { const root = path.resolve(__dirname, ".."); const source = fs.readFileSync(path.join(root, "functions/mollie-webhook.js"), "utf8"); assert.ok(source.indexOf("await patchInvoice") < source.indexOf("dispatchPaidConfirmation")); assert.ok(source.indexOf("finalizeCommercialOrderIfNeeded") < source.indexOf("dispatchPaidConfirmation(supabaseUrl")); assert.match(source, /fetchMolliePaymentWithFallback/); assert.match(source, /limit=2/); assert.doesNotMatch(source.slice(source.indexOf("async function dispatchPaidConfirmation"), source.indexOf("async function updateSubscriptionPaymentIfPresent")), /createMolliePayment|createOrderInvoice|upsertCommercialRecord/); });

test("admin diagnostics and migration stay safe, bounded and test-only", () => { const insight = adminPrivate.mailAutomation([{ id: "o", event_type: "payment.paid", entity_type: "invoice", entity_id: INVOICE, effect_type: "email.payment_paid", environment: "test", status: "pending", payment_reference: "abcdef", order_reference: "order-safe", invoice_reference: INVOICE, provider_category: "mollie", payment_environment: "test", payment_type: "full", commercial_completion_state: "complete", paid_component: "full_order", remaining_component: "none", reminder_cancelled_count: "1", next_step_type: "project_onboarding", payment_state: "paid", invoice_state: "paid" }], [], true); assert.equal(insight.items[0].paymentType, "full"); assert.equal(insight.items[0].reminderCancelledCount, 1); assert.equal(JSON.stringify(insight).includes("recipient"), false); const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260713210000_enable_payment_paid_test_outbox.sql"), "utf8"); assert.match(sql, /email\.payment_paid/); assert.match(sql, /p_environment <> 'test'/); assert.match(sql, /security definer[\s\S]*search_path = public, pg_temp/i); assert.doesNotMatch(sql, /\b(drop|truncate|delete\s+from|alter\s+table)\b/i); });
function response(value, ok = true) { return { ok, status: ok ? 200 : 500, text: async () => JSON.stringify(value) }; }
