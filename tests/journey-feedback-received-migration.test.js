const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createHandler } = require("../functions/admin-journey-mail-test");
const { classifyFeedback } = require("../functions/journey/feedbackReceived/category");
const { resolveFeedbackOwnership } = require("../functions/journey/feedbackReceived/ownershipResolver");
const { planFeedbackProgress } = require("../functions/journey/feedbackReceived/progressTransition");
const { createFeedbackReceivedRepository } = require("../functions/journey/feedbackReceived/repository");
const { createFeedbackReceivedService, _private: servicePrivate } = require("../functions/journey/feedbackReceived/service");
const { validateMailCommand } = require("../functions/journey/mail/command");
const { renderJourneyMail } = require("../functions/journey/mail/templateRenderer");

const CUSTOMER = "33333333-3333-4333-8333-333333333333";
const OTHER_CUSTOMER = "44444444-4444-4444-8444-444444444444";
const INSTANCE = "55555555-5555-4555-8555-555555555555";
const PREVIEW = "66666666-6666-4666-8666-666666666666";
const FEEDBACK = "77777777-7777-4777-8777-777777777777";
const ENV = {
  APP_ENV: "production",
  JOURNEY_ENGINE_ENABLED: "allowlist",
  JOURNEY_ENGINE_ENABLED_ALLOWLIST: CUSTOMER,
  JOURNEY_EMAIL_AUTOMATION_ENABLED: "allowlist",
  JOURNEY_EMAIL_AUTOMATION_ENABLED_ALLOWLIST: `${CUSTOMER},journey-mail-worker`,
  JOURNEY_FEEDBACK_RECEIVED_TEST_CUSTOMERS: CUSTOMER,
  JOURNEY_EMAIL_TEST_RECIPIENTS: "tester@example.com",
};
const INSTANCE_ROW = {
  id: INSTANCE,
  instance_key: `preview-ready-test:${CUSTOMER}`,
  customer_id: CUSTOMER,
  current_phase: "preview",
  current_step: "preview_shared",
  progress_percent: 60,
  environment: "test",
  status: "active",
  updated_at: "2026-07-13T12:00:00.000Z",
  metadata: {
    testOnly: true,
    previewReadyEmailOwner: "journey",
    feedbackReceivedEmailOwner: "journey",
    definitionKey: "website.free_preview_sales",
    definitionVersion: 1,
    stepStates: {
      lead_qualified: "completed",
      preview_intake: "completed",
      preview_build: "completed",
      preview_shared: "completed",
      preview_feedback: "ready",
    },
  },
};

function input(overrides = {}) {
  return {
    customerId: CUSTOMER,
    previewVersionId: PREVIEW,
    feedbackId: FEEDBACK,
    recipient: "tester@example.com",
    firstName: "Max",
    projectLabel: "Veilige Test BV",
    previewVersionLabel: "Preview V2",
    category: "tekst",
    page: "Home",
    section: "Intro",
    feedbackPointCount: 1,
    submittedAt: "2026-07-13T12:30:00.000Z",
    sideEffects: { changeRequestReady: true, timelineReady: true, notificationReady: true },
    legacySend: async () => null,
    ...overrides,
  };
}

test("feedback classification is bounded and never needs the free-text comment", () => {
  assert.deepEqual(classifyFeedback({ category: "tekst", feedbackPointCount: 1, comment: "secret" }), { key: "text", label: "Tekstwijziging", count: 1 });
  assert.deepEqual(classifyFeedback({ page: "technische bug", feedbackPointCount: 999 }), { key: "multiple", label: "Meerdere wijzigingen", count: 100 });
  assert.equal(JSON.stringify(classifyFeedback({ comment: "do not copy me" })).includes("do not copy me"), false);
});

test("ownership is legacy unless both central flags, the dedicated allowlist and an enabled test journey match", () => {
  const transition = planFeedbackProgress(INSTANCE_ROW, FEEDBACK);
  assert.equal(resolveFeedbackOwnership({ ...input(), journeyInstance: INSTANCE_ROW, transition, runtimeEnvironment: "production" }, {}).owner, "legacy");
  assert.equal(resolveFeedbackOwnership({ ...input({ customerId: OTHER_CUSTOMER }), journeyInstance: INSTANCE_ROW, transition, runtimeEnvironment: "production" }, ENV).owner, "legacy");
  assert.equal(resolveFeedbackOwnership({ ...input(), journeyInstance: { ...INSTANCE_ROW, metadata: { testOnly: true } }, transition, runtimeEnvironment: "production" }, ENV).owner, "legacy");
  const eligible = resolveFeedbackOwnership({ ...input(), journeyInstance: INSTANCE_ROW, transition, runtimeEnvironment: "production" }, ENV);
  assert.equal(eligible.owner, "journey");
  assert.equal(eligible.reason, "explicit_feedback_test_journey_eligible");
  assert.equal(resolveFeedbackOwnership({ ...input({ recipient: "" }), journeyInstance: INSTANCE_ROW, transition }, ENV).owner, "none");
});

test("feedback transition updates only the test journey and never completes approval, payment or live steps", () => {
  const transition = planFeedbackProgress(INSTANCE_ROW, FEEDBACK);
  assert.equal(transition.valid, true);
  assert.equal(transition.after.percentage, 70);
  assert.equal(transition.patch.current_step, "preview_approved");
  assert.equal(transition.patch.metadata.stepStates.preview_feedback, "completed");
  assert.equal(transition.patch.metadata.stepStates.preview_approved, "ready");
  assert.equal(transition.patch.metadata.stepStates.payment_confirmed, undefined);
  assert.equal(transition.patch.metadata.stepStates.project_handover, undefined);
  const duplicate = planFeedbackProgress({ ...INSTANCE_ROW, metadata: { ...transition.patch.metadata } }, FEEDBACK);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.patch, null);
  const approved = planFeedbackProgress({ ...INSTANCE_ROW, metadata: { ...INSTANCE_ROW.metadata, stepStates: { ...INSTANCE_ROW.metadata.stepStates, preview_approved: "completed" } } }, FEEDBACK);
  assert.equal(approved.valid, false);
  assert.equal(approved.reason, "approval_already_resolved");
  const blocked = planFeedbackProgress({ ...INSTANCE_ROW, metadata: { ...INSTANCE_ROW.metadata, stepStates: { ...INSTANCE_ROW.metadata.stepStates, preview_feedback: "blocked" } } }, FEEDBACK);
  assert.equal(blocked.valid, false);
  assert.equal(blocked.reason, "journey_blocked");
  assert.equal(planFeedbackProgress({ ...INSTANCE_ROW, environment: "production" }, FEEDBACK).valid, false);
});

test("stable customer, preview, feedback, effect and template scope produces stable unique keys", () => {
  const first = servicePrivate.stableKeys({ customerId: CUSTOMER, previewVersionId: PREVIEW, feedbackId: FEEDBACK, templateVersion: 1 });
  assert.deepEqual(first, servicePrivate.stableKeys({ customerId: CUSTOMER, previewVersionId: PREVIEW, feedbackId: FEEDBACK, templateVersion: 1 }));
  assert.notDeepEqual(first, servicePrivate.stableKeys({ customerId: CUSTOMER, previewVersionId: PREVIEW, feedbackId: OTHER_CUSTOMER, templateVersion: 1 }));
  assert.notDeepEqual(first, servicePrivate.stableKeys({ customerId: CUSTOMER, previewVersionId: OTHER_CUSTOMER, feedbackId: FEEDBACK, templateVersion: 1 }));
  assert.match(first.eventKey, /^preview\.feedback_received:[a-f0-9]{40}$/);
  assert.match(first.outboxKey, /^preview\.feedback_received\.email:[a-f0-9]{40}:v1$/);
});

test("flags off, invalid identity and unavailable storage retain current legacy no-mail behavior", async () => {
  for (const setup of [
    { env: {}, feedbackRepository: { findTestJourney: async () => { throw new Error("flags off must not read"); } } },
    { env: ENV, feedbackRepository: { findTestJourney: async () => ({ available: false, row: null, reason: "storage_unavailable" }) } },
  ]) {
    let legacy = 0;
    const service = createFeedbackReceivedService({ ...setup, journeyRepository: { recordJourneyEvent: async () => { throw new Error("must not write"); } }, logger: { info() {}, error() {} } });
    const response = await service.dispatch(input({ legacySend: async () => { legacy += 1; } }));
    assert.equal(response.owner, "legacy");
    assert.equal(legacy, 1);
  }
  const service = createFeedbackReceivedService({ env: ENV, feedbackRepository: { findTestJourney: async () => { throw new Error("must not read"); } }, logger: { info() {}, error() {} } });
  assert.equal((await service.dispatch(input({ feedbackId: "not-a-uuid" }))).owner, "legacy");
});

test("selected feedback creates deterministic canonical event/outbox, suppresses duplicates and excludes comment content", async () => {
  const calls = [];
  let progressWrites = 0;
  const service = createFeedbackReceivedService({
    env: ENV,
    feedbackRepository: {
      findTestJourney: async () => ({ available: true, row: INSTANCE_ROW }),
      applyProgress: async () => { progressWrites += 1; return { available: true, skipped: false, reason: "progress_updated" }; },
    },
    journeyRepository: { recordJourneyEvent: async (event, settings) => { calls.push({ event, settings }); return { available: true, row: { event_id: "event-1", outbox_id: "outbox-1", duplicate: calls.length > 1 } }; } },
    logger: { info() {}, error() {} },
  });
  let legacy = 0;
  const first = await service.dispatch(input({ comment: "PRIVATE FULL FEEDBACK", legacySend: async () => { legacy += 1; } }));
  const second = await service.dispatch(input({ comment: "PRIVATE FULL FEEDBACK", legacySend: async () => { legacy += 1; } }));
  assert.equal(first.owner, "journey");
  assert.equal(first.durable, true);
  assert.equal(second.duplicate, true);
  assert.equal(legacy, 0);
  assert.equal(progressWrites, 2);
  assert.equal(calls[0].event.eventType, "preview.feedback_received");
  assert.equal(calls[0].settings.outbox.effectType, "email.feedback_received");
  assert.equal(calls[0].event.eventKey, calls[1].event.eventKey);
  assert.equal(calls[0].settings.outbox.idempotencyKey, calls[1].settings.outbox.idempotencyKey);
  assert.equal(calls[0].settings.outbox.payload.mailCommand.actionUrl, "https://maxwebstudio.nl/klantportaal.html#website-review");
  assert.equal(JSON.stringify(calls).includes("PRIVATE FULL FEEDBACK"), false);
  assert.deepEqual(calls[0].event.payload.sideEffects, { changeRequestReady: true, timelineReady: true, notificationReady: true });
});

test("after journey acceptance an ambiguous enqueue failure never invokes legacy and progress failure never loses the mail", async () => {
  let legacy = 0;
  const base = { env: ENV, feedbackRepository: { findTestJourney: async () => ({ available: true, row: INSTANCE_ROW }), applyProgress: async () => { throw new Error("conflict"); } }, logger: { info() {}, error() {} } };
  const accepted = createFeedbackReceivedService({ ...base, journeyRepository: { recordJourneyEvent: async () => ({ available: true, row: { outbox_id: "outbox-1", duplicate: false } }) } });
  const acceptedResult = await accepted.dispatch(input({ legacySend: async () => { legacy += 1; } }));
  assert.equal(acceptedResult.owner, "journey");
  assert.equal(acceptedResult.durable, true);
  assert.equal(acceptedResult.progress.reason, "progress_write_failed");
  const ambiguous = createFeedbackReceivedService({ ...base, journeyRepository: { recordJourneyEvent: async () => { throw Object.assign(new Error("timeout"), { code: "request_failed" }); } } });
  const failedResult = await ambiguous.dispatch(input({ legacySend: async () => { legacy += 1; } }));
  assert.equal(failedResult.owner, "journey");
  assert.equal(failedResult.fallbackAllowed, false);
  assert.equal(failedResult.failed, true);
  assert.equal(legacy, 0);
});

test("feedback v1 template is test-marked, escaped, bounded at 0/70/100 and has exact subject plus safe CTA", () => {
  const base = {
    automationKey: "journey.feedback_received", templateKey: "journey.feedback_received", templateVersion: 1,
    journeyEventKey: "preview.feedback_received:abcdef123", outboxIdempotencyKey: "preview.feedback_received.email:abcdef123:v1",
    customerReference: CUSTOMER, journeyInstanceReference: INSTANCE, recipient: "tester@example.com",
    replyToProfile: { email: "info@maxwebstudio.nl" }, subjectData: { label: "Test" },
    templateData: { firstName: "Max", projectLabel: "Veilige Test BV", previewVersionLabel: "V2", feedbackCategory: "Tekstwijziging", feedbackPointCount: 1, submittedAt: "2026-07-13T12:30:00Z", percentage: 70, currentPhase: "Feedback verwerken", nextStep: "Wij verwerken uw wijzigingen" },
    actionUrl: "https://maxwebstudio.nl/klantportaal.html#website-review", metadata: { scenario: "feedback_received_test_customer", previewVersionReference: PREVIEW, feedbackReference: "abcdef1234567890" },
  };
  const command = validateMailCommand(base, { environment: "production", customerId: CUSTOMER }, ENV);
  const rendered = renderJourneyMail(command);
  assert.equal(rendered.subject, "[TEST] We hebben uw feedback ontvangen");
  assert.match(rendered.html, /width:70%/);
  assert.match(rendered.text, /Bekijk status: https:\/\/maxwebstudio\.nl\/klantportaal\.html#website-review/);
  assert.match(renderJourneyMail({ ...command, templateData: { ...command.templateData, projectLabel: "A < B", percentage: -5 } }).html, /A &lt; B/);
  assert.match(renderJourneyMail({ ...command, templateData: { ...command.templateData, percentage: 101 } }).html, /width:100%/);
  assert.throws(() => validateMailCommand({ ...base, actionUrl: "https://evil.example/steal" }, { environment: "production", customerId: CUSTOMER }, ENV), /ongeldig/i);
});

test("super-admin action only enables an existing explicitly selected test journey", async () => {
  let enabled = null;
  let authOptions;
  const handler = createHandler({
    env: ENV,
    verifyAdmin: async (_event, _json, options) => { authOptions = options; return { success: true, admin: { role: "super_admin", status: "active" } }; },
    producer: {}, worker: {}, previewRepository: {},
    feedbackRepository: { enableTestJourney: async (customerId) => { enabled = customerId; return { available: true, row: INSTANCE_ROW }; } },
  });
  const response = await handler({ httpMethod: "POST", body: JSON.stringify({ action: "enable_feedback_received_test", customerId: CUSTOMER }) });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(authOptions.allowedRoles, ["super_admin"]);
  assert.equal(authOptions.disableLegacyToken, true);
  assert.equal(enabled, CUSTOMER);
  const blocked = await handler({ httpMethod: "POST", body: JSON.stringify({ action: "enable_feedback_received_test", customerId: OTHER_CUSTOMER }) });
  assert.equal(blocked.statusCode, 409);
});

test("feedback repository reads and patches only existing active test journey rows", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    const body = options.method === "PATCH" ? [{ ...INSTANCE_ROW, metadata: { ...INSTANCE_ROW.metadata, feedbackReceivedEmailOwner: "journey" } }] : [INSTANCE_ROW];
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const repository = createFeedbackReceivedRepository({ env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, fetchImpl });
  assert.equal((await repository.findTestJourney(CUSTOMER)).row.id, INSTANCE);
  assert.equal((await repository.enableTestJourney(CUSTOMER)).row.id, INSTANCE);
  assert.equal(requests.some((request) => request.options.method === "POST"), false);
  assert.equal(requests.every((request) => request.url.includes("journey_instances")), true);
  assert.equal(requests.some((request) => /customers|payments|invoices/.test(request.url)), false);
});

test("migration remains idempotent, test-only, bounded, least-privilege and non-destructive", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260713190000_enable_feedback_received_test_outbox.sql"), "utf8");
  assert.match(sql, /create or replace function public\.claim_automation_outbox/i);
  assert.match(sql, /effect_type in \('email\.journey_test', 'email\.preview_ready', 'email\.feedback_received'\)/);
  assert.match(sql, /p_environment <> 'test'/);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /least\(coalesce\(p_batch_size, 5\), 20\)/i);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /\b(drop|truncate|delete\s+from|alter\s+table)\b/i);
});

test("integration touches only canonical feedback action after durable side-effects and leaves approval/payment routes unchanged", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "functions/client-preview-versions.js"), "utf8");
  assert.equal((source.match(/feedbackReceivedService\.dispatch\(/g) || []).length, 1);
  const sideEffects = source.indexOf("const sideEffects = await ensureFeedbackSideEffects", source.indexOf("async function savePreviewFeedback"));
  const dispatch = source.indexOf("await dispatchFeedbackConfirmation", sideEffects);
  assert.ok(sideEffects > 0 && dispatch > sideEffects);
  assert.match(source, /if \(action === "approve"\) return approvePreviewVersion/);
  assert.match(source, /if \(action === "create_payment"\) return createPreviewDepositPayment/);
  assert.doesNotMatch(source.slice(source.indexOf("async function approvePreviewVersion")), /feedbackReceivedService/);
  for (const file of ["submit-change-request.js", "demo-journey.js", "mollie-webhook.js"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, "functions", file), "utf8"), /email\.feedback_received|journey\.feedback_received/);
  }
});

test("admin read model exposes safe ownership diagnostics without recipient or full payload", () => {
  const { _private } = require("../functions/journey/adminReadService");
  const result = _private.mailAutomation([{ id: "outbox-1", environment: "test", effect_type: "email.feedback_received", event_type: "preview.feedback_received", entity_type: "preview", entity_id: PREVIEW, feedback_reference: "abcdef1234567890", ownership_reason: "explicit_feedback_test_journey_eligible", progress_before: "60", progress_after: "70", status: "pending", attempt_count: 0, next_attempt_at: "2026-07-13T12:31:00Z", payload: { recipient: "must-not-leak@example.com", comment: "private" } }], [], true, { enabled: true, mode: "allowlist" }, []);
  assert.equal(result.items[0].owner, "journey");
  assert.equal(result.items[0].feedbackReference, "abcdef1234567890");
  assert.equal(result.items[0].ownershipReason, "explicit_feedback_test_journey_eligible");
  assert.equal(result.items[0].progressAfter, 70);
  assert.equal(JSON.stringify(result).includes("must-not-leak@example.com"), false);
  assert.equal(JSON.stringify(result).includes("private"), false);
});
