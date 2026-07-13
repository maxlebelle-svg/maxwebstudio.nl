const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createHandler } = require("../functions/admin-journey-mail-test");
const { _private: servicePrivate, createPreviewReadyService } = require("../functions/journey/previewReady/service");
const { resolvePreviewReadyOwnership } = require("../functions/journey/previewReady/ownershipResolver");
const { createPreviewReadyRepository } = require("../functions/journey/previewReady/repository");
const { evaluateJourneyEmailMode } = require("../functions/journey/mail/recipientPolicy");
const { validateMailCommand } = require("../functions/journey/mail/command");
const { renderJourneyMail } = require("../functions/journey/mail/templateRenderer");

const CUSTOMER = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";
const INSTANCE = "55555555-5555-4555-8555-555555555555";
const PREVIEW = "66666666-6666-4666-8666-666666666666";
const ENV = {
  APP_ENV: "production",
  JOURNEY_ENGINE_ENABLED: "allowlist",
  JOURNEY_ENGINE_ENABLED_ALLOWLIST: CUSTOMER,
  JOURNEY_EMAIL_AUTOMATION_ENABLED: "allowlist",
  JOURNEY_EMAIL_AUTOMATION_ENABLED_ALLOWLIST: `${CUSTOMER},journey-mail-worker`,
  JOURNEY_PREVIEW_READY_TEST_CUSTOMERS: CUSTOMER,
  JOURNEY_EMAIL_TEST_RECIPIENTS: "tester@example.com",
};
const INSTANCE_ROW = { id: INSTANCE, instance_key: `preview-ready-test:${CUSTOMER}`, customer_id: CUSTOMER, environment: "test", status: "active", metadata: { testOnly: true, previewReadyEmailOwner: "journey" } };

function input(overrides = {}) {
  return { customerId: CUSTOMER, projectId: PROJECT, previewVersionId: PREVIEW, previewVersionLabel: "V2", recipient: "tester@example.com", firstName: "Max", businessLabel: "Veilige Test BV", legacySend: async () => null, ...overrides };
}

test("ownership remains legacy unless flags, explicit customer and durable test journey all match", () => {
  assert.equal(resolvePreviewReadyOwnership({ ...input(), journeyInstance: INSTANCE_ROW }, {}).owner, "legacy");
  assert.equal(resolvePreviewReadyOwnership({ ...input({ customerId: PROJECT }), journeyInstance: INSTANCE_ROW, runtimeEnvironment: "production" }, ENV).owner, "legacy");
  assert.equal(resolvePreviewReadyOwnership({ ...input(), journeyInstance: null, runtimeEnvironment: "production" }, ENV).owner, "legacy");
  const eligible = resolvePreviewReadyOwnership({ ...input(), journeyInstance: INSTANCE_ROW, runtimeEnvironment: "production" }, ENV);
  assert.equal(eligible.owner, "journey");
  assert.equal(eligible.eligibility, "eligible");
  assert.equal(eligible.durable, false);
  assert.equal(eligible.fallbackAllowed, true);
  assert.equal(resolvePreviewReadyOwnership({ ...input({ recipient: "" }), journeyInstance: INSTANCE_ROW }, ENV).owner, "none");
});

test("production permits only explicit allowlist mode, never test_only or on", () => {
  const context = { environment: "production", customerId: CUSTOMER };
  assert.equal(evaluateJourneyEmailMode(context, ENV).allowed, true);
  assert.equal(evaluateJourneyEmailMode(context, { ...ENV, JOURNEY_EMAIL_AUTOMATION_ENABLED: "test_only" }).allowed, false);
  assert.equal(evaluateJourneyEmailMode(context, { ...ENV, JOURNEY_EMAIL_AUTOMATION_ENABLED: "on" }).allowed, false);
  assert.equal(evaluateJourneyEmailMode({ ...context, customerId: PROJECT }, ENV).allowed, false);
});

test("stable preview identity yields stable event and outbox keys", () => {
  const first = servicePrivate.stableKeys({ customerId: CUSTOMER, previewVersionId: PREVIEW, templateVersion: 1 });
  const second = servicePrivate.stableKeys({ customerId: CUSTOMER, previewVersionId: PREVIEW, templateVersion: 1 });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, servicePrivate.stableKeys({ customerId: CUSTOMER, previewVersionId: PROJECT, templateVersion: 1 }));
  assert.match(first.eventKey, /^preview\.ready:[a-f0-9]{40}$/);
  assert.match(first.outboxKey, /^preview\.ready\.email:[a-f0-9]{40}:v1$/);
});

test("flags off, missing preview identity and unavailable storage fall back exactly once to legacy", async () => {
  for (const setup of [
    { env: {}, previewRepository: { findTestJourney: async () => ({ available: true, row: INSTANCE_ROW }) } },
    { env: ENV, previewRepository: { findTestJourney: async () => ({ available: false, row: null, reason: "storage_unavailable" }) } },
  ]) {
    let legacy = 0;
    const service = createPreviewReadyService({ ...setup, journeyRepository: { recordJourneyEvent: async () => { throw new Error("must not write"); } }, logger: { info() {}, error() {} } });
    const result = await service.dispatch(input({ legacySend: async () => { legacy += 1; } }));
    assert.equal(result.owner, "legacy");
    assert.equal(legacy, 1);
  }
  let legacy = 0;
  const service = createPreviewReadyService({ env: ENV, previewRepository: { findTestJourney: async () => { throw new Error("must not read"); } }, logger: { info() {}, error() {} } });
  assert.equal((await service.dispatch(input({ previewVersionId: "", legacySend: async () => { legacy += 1; } }))).owner, "legacy");
  assert.equal(legacy, 1);
});

test("selected test journey writes one deterministic preview event/outbox and suppresses duplicates", async () => {
  const calls = [];
  const repository = { recordJourneyEvent: async (event, settings) => { calls.push({ event, settings }); return { available: true, row: { event_id: "event-1", outbox_id: "outbox-1", duplicate: calls.length > 1 } }; } };
  const service = createPreviewReadyService({ env: ENV, previewRepository: { findTestJourney: async () => ({ available: true, row: INSTANCE_ROW }) }, journeyRepository: repository, logger: { info() {}, error() {} } });
  let legacy = 0;
  const first = await service.dispatch(input({ legacySend: async () => { legacy += 1; } }));
  const second = await service.dispatch(input({ legacySend: async () => { legacy += 1; } }));
  assert.equal(first.owner, "journey");
  assert.equal(first.durable, true);
  assert.equal(second.duplicate, true);
  assert.equal(legacy, 0);
  assert.equal(calls[0].event.eventType, "preview.ready");
  assert.equal(calls[0].event.entityId, PREVIEW);
  assert.equal(calls[0].settings.outbox.effectType, "email.preview_ready");
  assert.equal(calls[0].event.eventKey, calls[1].event.eventKey);
  assert.equal(calls[0].settings.outbox.idempotencyKey, calls[1].settings.outbox.idempotencyKey);
  assert.equal(calls[0].settings.outbox.payload.mailCommand.actionUrl, `https://maxwebstudio.nl/preview.html?version=${PREVIEW}`);
});

test("after durable journey ownership an ambiguous enqueue failure never invokes legacy", async () => {
  let legacy = 0;
  const service = createPreviewReadyService({ env: ENV, previewRepository: { findTestJourney: async () => ({ available: true, row: INSTANCE_ROW }) }, journeyRepository: { recordJourneyEvent: async () => { throw Object.assign(new Error("timeout"), { code: "request_failed" }); } }, logger: { info() {}, error() {} } });
  const result = await service.dispatch(input({ legacySend: async () => { legacy += 1; } }));
  assert.equal(result.owner, "journey");
  assert.equal(result.failed, true);
  assert.equal(result.fallbackAllowed, false);
  assert.equal(legacy, 0);
});

test("preview-ready v1 template is versioned, escaped, test-marked and uses only the public secure preview URL", () => {
  const command = validateMailCommand({ automationKey: "journey.preview_ready", templateKey: "journey.preview_ready", templateVersion: 1, journeyEventKey: "preview.ready:abcdef123", outboxIdempotencyKey: "preview.ready.email:abcdef123:v1", customerReference: CUSTOMER, journeyInstanceReference: INSTANCE, recipient: "tester@example.com", replyToProfile: { email: "info@maxwebstudio.nl" }, subjectData: { label: "A & B" }, templateData: { firstName: "Max", projectLabel: "A & B", previewVersionLabel: "V2" }, actionUrl: `https://maxwebstudio.nl/preview.html?version=${PREVIEW}`, metadata: { scenario: "preview_ready_test_customer", previewVersionReference: PREVIEW } }, { environment: "production", customerId: CUSTOMER }, ENV);
  const rendered = renderJourneyMail(command);
  assert.equal(rendered.templateKey, "journey.preview_ready");
  assert.equal(rendered.templateVersion, 1);
  assert.equal(rendered.subject, "[TEST] Uw nieuwe websitepreview staat klaar");
  assert.match(rendered.html, /A &amp; B/);
  assert.match(rendered.html, /width:0%/);
  assert.match(rendered.text, /preview\.html\?version=/);
  assert.doesNotMatch(rendered.html, /\.netlify\/functions|manual-preview-render/);
  const full = renderJourneyMail({ ...command, templateData: { ...command.templateData, percentage: 100 } });
  assert.match(full.html, /width:100%/);
});

test("super-admin test action creates only an explicitly selected test journey", async () => {
  let authOptions;
  let ensured = null;
  const handler = createHandler({ env: ENV, verifyAdmin: async (_event, _json, options) => { authOptions = options; return { success: true, admin: { role: "super_admin", status: "active" } }; }, producer: {}, worker: {}, previewRepository: { ensureTestJourney: async (value) => { ensured = value; return { available: true, row: { id: INSTANCE, instance_key: INSTANCE_ROW.instance_key } }; } } });
  const response = await handler({ httpMethod: "POST", body: JSON.stringify({ action: "create_preview_test_journey", customerId: CUSTOMER, projectId: PROJECT, productCode: "WEB-STARTER" }) });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(authOptions.allowedRoles, ["super_admin"]);
  assert.equal(authOptions.disableLegacyToken, true);
  assert.equal(ensured.customerId, CUSTOMER);
  const blocked = createHandler({ env: ENV, verifyAdmin: async () => ({ success: true }), producer: {}, worker: {}, previewRepository: { ensureTestJourney: async () => { throw new Error("must not create"); } } });
  assert.equal((await blocked({ httpMethod: "POST", body: JSON.stringify({ action: "create_preview_test_journey", customerId: PROJECT }) })).statusCode, 409);
});

test("test journey repository upserts one fixed definition and instance without touching business tables", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    const body = url.includes("journey_definitions")
      ? [{ id: "77777777-7777-4777-8777-777777777777", definition_key: "website.preview_ready_test" }]
      : [{ id: INSTANCE, instance_key: INSTANCE_ROW.instance_key, environment: "test", metadata: INSTANCE_ROW.metadata }];
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const repository = createPreviewReadyRepository({ env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" }, fetchImpl });
  const first = await repository.ensureTestJourney({ customerId: CUSTOMER, projectId: PROJECT, productCode: "WEB-STARTER" });
  const second = await repository.ensureTestJourney({ customerId: CUSTOMER, projectId: PROJECT, productCode: "WEB-STARTER" });
  assert.equal(first.row.id, INSTANCE);
  assert.equal(second.row.id, INSTANCE);
  assert.equal(JSON.parse(requests[1].options.body).instance_key, INSTANCE_ROW.instance_key);
  assert.match(requests[0].options.headers.Prefer, /merge-duplicates/);
  assert.match(requests[1].options.headers.Prefer, /merge-duplicates/);
  assert.equal(requests.some((item) => /customers|projects|profiles|invoices|payments/.test(item.url)), false);
});

test("integration changes only Website Factory preview_ready and leaves manual ZIP plus other mails legacy", () => {
  const root = path.resolve(__dirname, "..");
  const factory = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");
  const manual = fs.readFileSync(path.join(root, "functions/admin-manual-preview.js"), "utf8");
  assert.equal((factory.match(/previewReadyService\.dispatch\(/g) || []).length, 1);
  assert.match(factory, /ownership: "legacy", previewVersionReference: buildResult\.previewVersion\?\.id/);
  for (const type of ["preview_updated", "launch_started", "website_live"]) assert.match(factory, new RegExp(`${type}: \\{`));
  assert.match(factory, /else if \(mailType\)[\s\S]*sendPreviewLaunchMail\(records, review, mailType\)/);
  assert.doesNotMatch(manual, /previewReadyService|email\.preview_ready|journey\.preview_ready/);
});

test("admin visibility combines legacy and journey ownership without exposing recipients", () => {
  const { _private } = require("../functions/journey/adminReadService");
  const result = _private.mailAutomation([], [], true, { enabled: true, mode: "allowlist" }, [{ id: "legacy-1", template_key: "preview_ready", status: "sent", to_email: "must-not-leak@example.com", metadata: { ownership: "legacy", previewVersionReference: PREVIEW }, created_at: "2026-07-13T12:00:00Z", updated_at: "2026-07-13T12:00:01Z" }]);
  assert.equal(result.items[0].owner, "legacy");
  assert.equal(result.items[0].previewVersionReference, PREVIEW);
  assert.equal(result.counts.sent, 1);
  assert.equal(JSON.stringify(result).includes("must-not-leak@example.com"), false);
});
