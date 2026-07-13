const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { resolveApprovalNextStep } = require("../functions/journey/previewApproved/nextStepResolver");
const { resolveApprovalOwnership } = require("../functions/journey/previewApproved/ownershipResolver");
const { planApprovalProgress } = require("../functions/journey/previewApproved/progressTransition");
const { createPreviewApprovedService, _private: servicePrivate } = require("../functions/journey/previewApproved/service");
const { validateMailCommand } = require("../functions/journey/mail/command");
const { renderJourneyMail } = require("../functions/journey/mail/templateRenderer");
const { _private: adminPrivate } = require("../functions/journey/adminReadService");
const CUSTOMER = "11111111-1111-4111-8111-111111111111"; const OTHER = "22222222-2222-4222-8222-222222222222"; const INSTANCE = "33333333-3333-4333-8333-333333333333"; const PROJECT = "44444444-4444-4444-8444-444444444444"; const PREVIEW = "55555555-5555-4555-8555-555555555555";
const APPROVED_AT = "2026-07-13T20:00:00.000Z";
const ENV = { APP_ENV: "production", JOURNEY_ENGINE_ENABLED: "allowlist", JOURNEY_ENGINE_ENABLED_ALLOWLIST: CUSTOMER, JOURNEY_EMAIL_AUTOMATION_ENABLED: "allowlist", JOURNEY_EMAIL_AUTOMATION_ENABLED_ALLOWLIST: `${CUSTOMER},journey-mail-worker`, JOURNEY_PREVIEW_APPROVED_TEST_CUSTOMERS: CUSTOMER, JOURNEY_EMAIL_TEST_RECIPIENTS: "tester@example.com" };
const ORDER = { customerId: CUSTOMER, projectId: PROJECT, websiteId: OTHER, packageCode: "business_website", source: "website_factory", status: "selected" };
const INSTANCE_ROW = { id: INSTANCE, instance_key: `preview-ready-test:${CUSTOMER}`, customer_id: CUSTOMER, environment: "test", status: "active", current_step: "preview_approved", updated_at: "2026-07-13T19:00:00Z", metadata: { testOnly: true, previewApprovedEmailOwner: "journey", definitionKey: "website.free_preview_sales", definitionVersion: 1, stepStates: { lead_qualified: "completed", preview_intake: "completed", preview_build: "completed", preview_shared: "completed", preview_feedback: "completed", preview_approved: "ready" } } };
function project(order = ORDER, overrides = {}) { return { id: PROJECT, customer_id: CUSTOMER, status: "active", metadata: { websiteCommercialOrder: order }, ...overrides }; }
function invoice({ paymentChoice = "full", status = "paid", mollie = "paid", paidAt = APPROVED_AT, source = "commercial_order", checkout = "", remainingAmount = 0, testOrder = false, id = "inv-1", customerId = CUSTOMER, projectId = PROJECT } = {}) { const context = { source, customerId, projectId, paymentChoice, remainingAmount, testOrder }; return { id, status, paid_at: paidAt, mollie_payment_status: mollie, mollie_payment_id: mollie === "paid" ? `tr_${id}` : "", mollie_checkout_url: checkout, notes: `---\nFactuurregels: ${JSON.stringify(context)}` }; }
function previewInvoice(overrides = {}) { return { id: "preview-inv", status: "paid", paid_at: APPROVED_AT, mollie_payment_status: "paid", mollie_payment_id: "tr_preview", mollie_checkout_url: "", notes: `TEST;previewDeposit:${PREVIEW};customer:${CUSTOMER};project:${PROJECT};package:business`, ...overrides }; }
function input(resolution, overrides = {}) { return { customerId: CUSTOMER, previewVersionId: PREVIEW, approvalReference: `${APPROVED_AT}:${OTHER}`, approvedAt: APPROVED_AT, recipient: "tester@example.com", firstName: "Max", projectLabel: "Test BV", previewVersionLabel: "Preview V2", resolution, legacySend: async () => null, ...overrides }; }

test("resolver distinguishes direct full payment, deposit, open invoice and free-preview paths", () => {
  const full = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project(), invoices: [invoice()] });
  assert.equal(full.journeyType, "website.direct_checkout"); assert.equal(full.paymentState, "fully_paid"); assert.equal(full.nextStepType, "technical_completion"); assert.equal(full.customerActionRequired, false); assert.match(full.cta, /website-review/);
  const deposit = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project(), invoices: [invoice({ paymentChoice: "deposit", remainingAmount: 600 })] });
  assert.equal(deposit.paymentState, "deposit_paid"); assert.equal(deposit.amountState, "remainder_known"); assert.equal(deposit.nextStepType, "approval_processing"); assert.doesNotMatch(deposit.cta, /facturen/);
  const open = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project(), invoices: [invoice({ status: "sent", mollie: "open", paidAt: "", checkout: "https://www.mollie.com/checkout/test" })] });
  assert.equal(open.invoiceState, "open"); assert.equal(open.nextStepType, "existing_invoice"); assert.match(open.cta, /#facturen$/);
  const free = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project(), invoices: [] });
  assert.equal(free.journeyType, "website.free_preview_sales"); assert.equal(free.nextStepType, "commercial_confirmation"); assert.match(free.cta, /diensten\.html$/);
  const freeDeposit = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project(), invoices: [previewInvoice()] });
  assert.equal(freeDeposit.paymentState, "deposit_paid"); assert.equal(freeDeposit.nextStepType, "approval_processing");
});

test("resolver trusts provider then paid invoice, and safely reviews conflicts, ambiguity and missing context", () => {
  assert.equal(resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, invoices: [invoice()] }).confidence, "provider_confirmed");
  const paidInvoice = invoice({ mollie: "", status: "paid" }); paidInvoice.mollie_payment_id = "";
  assert.equal(resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, invoices: [paidInvoice] }).confidence, "invoice_confirmed");
  const statusOnly = invoice({ mollie: "", status: "paid", paidAt: "" }); statusOnly.mollie_payment_id = "tr_status_only";
  assert.equal(resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project(), invoices: [statusOnly] }).nextStepType, "financial_review");
  const conflict = invoice({ status: "cancelled", mollie: "paid" });
  assert.equal(resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, invoices: [conflict] }).nextStepType, "financial_review");
  const multiple = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, invoices: [invoice(), invoice({ id: "inv-2" })] });
  assert.equal(multiple.invoiceState, "multiple"); assert.equal(multiple.cta, "");
  const mixedMultiple = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project(), invoices: [invoice(), previewInvoice()] });
  assert.equal(mixedMultiple.invoiceState, "multiple"); assert.equal(mixedMultiple.nextStepType, "financial_review");
  const missing = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, invoices: [invoice({ customerId: OTHER, projectId: OTHER })] });
  assert.equal(missing.nextStepType, "commercial_review"); assert.equal(missing.paymentState, "unknown"); assert.equal(missing.cta, "");
  const otherProject = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project(), invoices: [invoice({ projectId: OTHER })] });
  assert.equal(otherProject.nextStepType, "commercial_confirmation"); assert.equal(otherProject.paymentState, "not_started");
  const cancelled = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project({ ...ORDER, status: "cancelled" }), invoices: [] });
  assert.equal(cancelled.nextStepType, "financial_review");
  const live = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project(ORDER, { status: "live" }), invoices: [] });
  assert.equal(live.nextStepType, "already_live"); assert.equal(live.customerActionRequired, false);
  const testOrder = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, invoices: [invoice({ testOrder: true })] });
  assert.equal(testOrder.paymentState, "fully_paid");
});

test("ownership requires separate approval allowlist and enabled existing test journey", () => {
  const resolution = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW }); const transition = planApprovalProgress(INSTANCE_ROW, "approval-ref", resolution);
  assert.equal(resolveApprovalOwnership({ ...input(resolution), journeyInstance: INSTANCE_ROW, transition }, {}).owner, "legacy");
  assert.equal(resolveApprovalOwnership({ ...input(resolution, { customerId: OTHER }), journeyInstance: INSTANCE_ROW, transition, runtimeEnvironment: "production" }, ENV).owner, "legacy");
  assert.equal(resolveApprovalOwnership({ ...input(resolution), journeyInstance: null, transition, runtimeEnvironment: "production" }, ENV).owner, "legacy");
  assert.equal(resolveApprovalOwnership({ ...input(resolution), journeyInstance: INSTANCE_ROW, transition, runtimeEnvironment: "production" }, ENV).owner, "journey");
  assert.equal(resolveApprovalOwnership({ ...input(resolution), journeyInstance: { ...INSTANCE_ROW, metadata: { testOnly: true } }, transition, runtimeEnvironment: "production" }, ENV).owner, "legacy");
});

test("progress completes approval but chooses different safe next steps without mutating business data", () => {
  const free = planApprovalProgress(INSTANCE_ROW, "approval-free", resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, project: project(), invoices: [] }));
  assert.equal(free.patch.metadata.stepStates.preview_approved, "completed"); assert.equal(free.patch.metadata.stepStates.commercial_agreement, "ready"); assert.equal(free.patch.metadata.stepStates.payment_confirmed, undefined);
  const paid = planApprovalProgress(INSTANCE_ROW, "approval-paid", resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, invoices: [invoice()] }));
  assert.equal(paid.patch.metadata.stepStates.payment_confirmed, "completed"); assert.equal(paid.patch.metadata.stepStates.project_handover, "ready"); assert.equal(paid.patch.metadata.stepStates.website_live, undefined);
  const duplicate = planApprovalProgress({ ...INSTANCE_ROW, metadata: { ...free.patch.metadata } }, "approval-free", resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW }));
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.patch, null);
  const blocked = planApprovalProgress({ ...INSTANCE_ROW, metadata: { ...INSTANCE_ROW.metadata, stepStates: { ...INSTANCE_ROW.metadata.stepStates, preview_approved: "blocked" } } }, "blocked", resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW }));
  assert.equal(blocked.valid, false); assert.equal(blocked.reason, "journey_blocked");
});

test("stable approval scope yields one canonical event and outbox with safe financial categories", async () => {
  const resolution = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW, invoices: [invoice()] }); const calls = [];
  const service = createPreviewApprovedService({ env: ENV, approvalRepository: { findTestJourney: async () => ({ available: true, row: INSTANCE_ROW }), applyProgress: async () => ({ available: true, skipped: false, reason: "progress_updated" }) }, journeyRepository: { recordJourneyEvent: async (event, settings) => { calls.push({ event, settings }); return { available: true, row: { outbox_id: "outbox-1", duplicate: calls.length > 1 } }; } }, logger: { info() {}, error() {} } });
  let legacy = 0; const first = await service.dispatch(input(resolution, { legacySend: async () => { legacy += 1; } })); const second = await service.dispatch(input(resolution, { legacySend: async () => { legacy += 1; } }));
  assert.equal(first.owner, "journey"); assert.equal(first.durable, true); assert.equal(second.duplicate, true); assert.equal(legacy, 0);
  assert.equal(calls[0].event.eventType, "preview.approved"); assert.equal(calls[0].settings.outbox.effectType, "email.preview_approved"); assert.equal(calls[0].event.eventKey, calls[1].event.eventKey); assert.equal(calls[0].settings.outbox.idempotencyKey, calls[1].settings.outbox.idempotencyKey);
  assert.equal(calls[0].event.payload.paymentState, "fully_paid"); assert.equal(JSON.stringify(calls).includes("mollie_payment_id"), false); assert.equal(JSON.stringify(calls).includes("amount"), false);
  const keys = servicePrivate.stableKeys({ customerId: CUSTOMER, previewVersionId: PREVIEW, approvalReference: `${APPROVED_AT}:${OTHER}`, templateVersion: 1 }); assert.match(keys.eventKey, /^preview\.approved:[a-f0-9]{40}$/); assert.match(keys.outboxKey, /^preview\.approved\.email:[a-f0-9]{40}:v1$/);
});

test("flags-off and pre-acceptance storage errors remain legacy; ambiguous acceptance never falls back", async () => {
  const resolution = resolveApprovalNextStep({ customerId: CUSTOMER, previewVersionId: PREVIEW }); let legacy = 0;
  const off = createPreviewApprovedService({ env: {}, approvalRepository: { findTestJourney: async () => { throw new Error("must not read"); } }, journeyRepository: {}, logger: { info() {}, error() {} } }); assert.equal((await off.dispatch(input(resolution, { legacySend: async () => { legacy += 1; } }))).owner, "legacy");
  const missing = createPreviewApprovedService({ env: ENV, approvalRepository: { findTestJourney: async () => ({ available: false, reason: "storage_unavailable" }) }, journeyRepository: {}, logger: { info() {}, error() {} } }); assert.equal((await missing.dispatch(input(resolution, { legacySend: async () => { legacy += 1; } }))).owner, "legacy");
  const ambiguous = createPreviewApprovedService({ env: ENV, approvalRepository: { findTestJourney: async () => ({ available: true, row: INSTANCE_ROW }) }, journeyRepository: { recordJourneyEvent: async () => { throw Object.assign(new Error("timeout"), { code: "request_failed" }); } }, logger: { info() {}, error() {} } }); const failed = await ambiguous.dispatch(input(resolution, { legacySend: async () => { legacy += 1; } })); assert.equal(failed.owner, "journey"); assert.equal(failed.fallbackAllowed, false); assert.equal(failed.failed, true); assert.equal(legacy, 2);
});

test("approval template renders all safe variants, optional CTA, exact subject and no invented amount", () => {
  function command(nextStepType, paymentState, actionUrl) { return validateMailCommand({ automationKey: "journey.preview_approved", templateKey: "journey.preview_approved", templateVersion: 1, journeyEventKey: `preview.approved:${nextStepType}`, outboxIdempotencyKey: `preview.approved.email:${nextStepType}:v1`, customerReference: CUSTOMER, journeyInstanceReference: INSTANCE, recipient: "tester@example.com", replyToProfile: { email: "info@maxwebstudio.nl" }, subjectData: { label: "Test" }, templateData: { firstName: "", projectLabel: "A & B", previewVersionLabel: "V2", percentage: 80, currentPhase: "Vervolgstap", nextStepType, paymentState, nextStep: nextStepType === "technical_completion" ? "Technische afronding" : "Team controleert de vervolgstap", contactName: "" }, actionUrl, metadata: { scenario: "preview_approved_test_customer", previewVersionReference: PREVIEW, approvalReference: "abc123" } }, { customerId: CUSTOMER, environment: "test" }, ENV); }
  for (const variant of [["technical_completion", "fully_paid", "https://maxwebstudio.nl/klantportaal.html#website-review"], ["approval_processing", "deposit_paid", "https://maxwebstudio.nl/klantportaal.html#website-review"], ["existing_invoice", "unpaid", "https://maxwebstudio.nl/klantportaal.html#facturen"], ["commercial_confirmation", "not_started", "https://maxwebstudio.nl/diensten.html"], ["financial_review", "conflict", ""]]) { const rendered = renderJourneyMail(command(...variant)); assert.equal(rendered.subject, "[TEST] Uw websiteontwerp is goedgekeurd"); assert.match(rendered.html, /A &amp; B/); assert.match(rendered.text, /Hallo daar/); assert.match(rendered.text, /Team Max Webstudio/); assert.doesNotMatch(rendered.text, /€|EUR|363|995/); if (!variant[2]) assert.doesNotMatch(rendered.html, /<a href=/); }
  assert.throws(() => command("existing_invoice", "unpaid", "https://evil.example/pay"), { code: "unsafe_action_url" });
});

test("integration preserves approval storage/side-effects and never couples automatic invoice or Mollie creation", () => {
  const root = path.resolve(__dirname, ".."); const source = fs.readFileSync(path.join(root, "functions/client-preview-versions.js"), "utf8");
  assert.equal((source.match(/previewApprovedService\.dispatch\(/g) || []).length, 1); assert.ok(source.indexOf("ensureApprovalSideEffects") < source.indexOf("dispatchApprovalConfirmation"));
  const dispatchBody = source.slice(source.indexOf("async function dispatchApprovalConfirmation"), source.indexOf("async function resolvePaymentReadiness")); assert.doesNotMatch(dispatchBody, /createDepositInvoice|api\.mollie\.com|insertRows/);
  assert.match(source, /approved_by_auth_user_id: authUser\.id/); assert.match(source, /dedupeKey: `preview_approved:\$\{version\.id\}`/); assert.match(source, /preview_approved_notification/);
  for (const file of ["demo-journey.js", "admin-manual-preview.js", "mollie-webhook.js", "commercial-order.js"]) assert.doesNotMatch(fs.readFileSync(path.join(root, "functions", file), "utf8"), /["']journey\.preview_approved["']|["']email\.preview_approved["']/);
});

test("admin insight exposes safe approval diagnostics without recipient or financial payload", () => {
  const insight = adminPrivate.mailAutomation([{ id: "outbox-1", event_type: "preview.approved", entity_type: "preview", entity_id: PREVIEW, effect_type: "email.preview_approved", environment: "test", status: "pending", attempt_count: 0, approval_reference: "fingerprint", ownership_reason: "explicit_approval_test_journey_eligible", journey_type: "website.direct_checkout", next_step_type: "technical_completion", payment_state: "fully_paid", invoice_state: "paid", customer_action_required: "false", internal_action_required: "true", progress_before: "70", progress_after: "85" }], [], true);
  assert.equal(insight.items.length, 1);
  assert.deepEqual({ eventType: insight.items[0].eventType, approvalReference: insight.items[0].approvalReference, nextStepType: insight.items[0].nextStepType, paymentState: insight.items[0].paymentState, invoiceState: insight.items[0].invoiceState, customerActionRequired: insight.items[0].customerActionRequired, internalActionRequired: insight.items[0].internalActionRequired }, { eventType: "preview.approved", approvalReference: "fingerprint", nextStepType: "technical_completion", paymentState: "fully_paid", invoiceState: "paid", customerActionRequired: false, internalActionRequired: true });
  assert.equal(JSON.stringify(insight).includes("recipient"), false);
  assert.equal(JSON.stringify(insight).includes("mollie"), false);
});

test("Phase 8 claim migration is rerunnable, test-only, bounded and least-privilege", () => { const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260713200000_enable_preview_approved_test_outbox.sql"), "utf8"); assert.match(sql, /create or replace function/); assert.match(sql, /email\.preview_approved/); assert.match(sql, /p_environment <> 'test'/); assert.match(sql, /for update skip locked/i); assert.match(sql, /security definer[\s\S]*search_path = public, pg_temp/i); assert.match(sql, /revoke all[\s\S]*anon, authenticated/i); assert.match(sql, /grant execute[\s\S]*service_role/i); assert.doesNotMatch(sql, /\b(drop|truncate|delete\s+from|alter\s+table)\b/i); });
