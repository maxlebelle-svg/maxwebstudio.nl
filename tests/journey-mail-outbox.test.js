const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createHandler } = require("../functions/admin-journey-mail-test");
const { sendTrackedEmail } = require("../functions/services/resendMailService");
const { validateMailCommand, MAX_COMMAND_BYTES } = require("../functions/journey/mail/command");
const { applyRecipientPolicy, evaluateJourneyEmailMode } = require("../functions/journey/mail/recipientPolicy");
const { renderJourneyMail } = require("../functions/journey/mail/templateRenderer");
const { createJourneyMailWorker, _private: workerPrivate } = require("../functions/journey/mail/worker");
const { createJourneyMailTestProducer } = require("../functions/journey/mail/testProducer");
const { backoffDelayMs, classifyMailError, nextOutboxFailure } = require("../functions/journey/mail/statusModel");

const ENV = {
  APP_ENV: "test",
  JOURNEY_EMAIL_AUTOMATION_ENABLED: "test_only",
  JOURNEY_EMAIL_TEST_RECIPIENTS: "tester@example.com, second@example.com",
  JOURNEY_EMAIL_TEST_REPLY_TO: "info@maxwebstudio.nl",
};
const CONTEXT = { environment: "test", isTest: true, scopeKey: "journey-mail-worker" };

function command(overrides = {}) {
  return {
    automationKey: "journey.synthetic_status_update",
    templateKey: "journey.test_status_update",
    templateVersion: 1,
    journeyEventKey: "journey.test:request-12345678",
    outboxIdempotencyKey: "journey.test.mail:request-12345678",
    customerReference: "synthetic-test",
    journeyInstanceReference: null,
    recipient: " tester@EXAMPLE.com ",
    fromProfile: { name: "Max Webstudio", email: "info@maxwebstudio.nl" },
    replyToProfile: { name: "Max Webstudio", email: "info@maxwebstudio.nl" },
    subjectData: { label: "Interne test" },
    templateData: { firstName: "Max", projectLabel: "Testproject", percentage: 50, currentStep: "Controle", nextStep: "Afronden", contactName: "Team Max Webstudio" },
    actionUrl: "https://www.maxwebstudio.nl/klantportaal.html",
    locale: "nl",
    metadata: { scenario: "synthetic_status_update" },
    ...overrides,
  };
}

function item(overrides = {}) {
  return { id: "outbox-1", event_type: "project.started", attempt_count: 1, lease_owner: "worker-1", payload: { mailCommand: command() }, ...overrides };
}

function fakeRepository(rows = []) {
  const calls = [];
  const repository = {
    calls,
    claimBatch: async () => ({ available: true, rows }),
    beginExecution: async (outbox) => { calls.push(["begin", outbox.id]); return { available: true, created: true, row: { id: `execution-${outbox.id}`, status: "processing" } }; },
    markExecutionSent: async (_execution, result) => { calls.push(["execution_sent", result.id]); },
    markExecutionFailed: async (_execution, failure) => { calls.push(["execution_failed", failure.errorCategory]); },
    markOutboxSent: async (outbox) => { calls.push(["outbox_sent", outbox.id]); },
    completeOutbox: async (outbox) => { calls.push(["complete", outbox.id]); },
    failOutbox: async (_outbox, failure) => { calls.push(["fail", failure.status, failure.errorCategory]); },
  };
  return repository;
}

test("mail feature is off by default and production remains blocked", () => {
  assert.equal(evaluateJourneyEmailMode(CONTEXT, {}).allowed, false);
  assert.equal(evaluateJourneyEmailMode({ ...CONTEXT, environment: "production" }, ENV).allowed, false);
  assert.equal(evaluateJourneyEmailMode({ ...CONTEXT }, { ...ENV, JOURNEY_EMAIL_AUTOMATION_ENABLED: "on" }).allowed, false);
});

test("recipient policy normalizes allowlisted addresses and blocks others, cc and bcc", () => {
  assert.equal(applyRecipientPolicy({ recipient: " TESTER@EXAMPLE.COM " }, CONTEXT, ENV).recipient, "tester@example.com");
  assert.throws(() => applyRecipientPolicy({ recipient: "customer@example.com" }, CONTEXT, ENV), { code: "recipient_not_allowed" });
  assert.throws(() => applyRecipientPolicy({ recipient: "tester@example.com", cc: "second@example.com" }, CONTEXT, ENV), { code: "cc_bcc_not_allowed" });
  assert.throws(() => applyRecipientPolicy({ recipient: "tester@example.com", bcc: "second@example.com" }, CONTEXT, ENV), { code: "cc_bcc_not_allowed" });
});

test("recipient redirect does not expose the original address and unsafe reply-to falls back", () => {
  const result = applyRecipientPolicy({ recipient: "customer@example.com", replyTo: "person@gmail.com" }, CONTEXT, { ...ENV, JOURNEY_EMAIL_TEST_REDIRECT_ENABLED: "true" });
  assert.equal(result.recipient, "tester@example.com");
  assert.equal(result.replyTo, "info@maxwebstudio.nl");
  assert.equal(result.redirected, true);
  assert.equal(JSON.stringify(result).includes("customer@example.com"), false);
  assert.match(result.originalRecipientFingerprint, /^[a-f0-9]{16}$/);
});

test("allowlist feature mode requires its explicit scope", () => {
  const env = { ...ENV, JOURNEY_EMAIL_AUTOMATION_ENABLED: "allowlist", JOURNEY_EMAIL_AUTOMATION_ENABLED_ALLOWLIST: "journey-mail-worker" };
  assert.equal(evaluateJourneyEmailMode(CONTEXT, env).allowed, true);
  assert.equal(evaluateJourneyEmailMode({ ...CONTEXT, scopeKey: "other" }, env).allowed, false);
});

test("mail command validates template, recipient, URL, unknown fields, payload size and HTML", () => {
  const valid = validateMailCommand(command(), CONTEXT, ENV);
  assert.equal(valid.templateVersion, 1);
  assert.equal(valid.fromProfile.email, "info@maxwebstudio.nl");
  assert.throws(() => validateMailCommand(command({ extra: true }), CONTEXT, ENV), { code: "unknown_mail_command_field" });
  assert.throws(() => validateMailCommand(command({ templateVersion: 2 }), CONTEXT, ENV), { code: "template_not_found" });
  assert.throws(() => validateMailCommand(command({ actionUrl: "javascript:alert(1)" }), CONTEXT, ENV), { code: "unsafe_action_url" });
  assert.throws(() => validateMailCommand(command({ actionUrl: "https://evil.example/path" }), CONTEXT, ENV), { code: "unsafe_action_url" });
  assert.throws(() => validateMailCommand(command({ templateData: { currentStep: "<img src=x>" } }), CONTEXT, ENV), { code: "unsafe_template_data" });
  assert.throws(() => validateMailCommand(command({ templateData: { currentStep: "x".repeat(MAX_COMMAND_BYTES) } }), CONTEXT, ENV), { code: "payload_too_large" });
});

test("template is stable, escaped, versioned and has HTML plus plain text at 0 and 100 percent", () => {
  const base = validateMailCommand(command({ templateData: { firstName: "", projectLabel: "A & B", percentage: 0, currentStep: "Controle", nextStep: "", contactName: "" } }), CONTEXT, ENV);
  const first = renderJourneyMail(base);
  const second = renderJourneyMail(base);
  assert.deepEqual(first, second);
  assert.equal(first.templateVersion, 1);
  assert.match(first.subject, /^\[TEST\]/);
  assert.match(first.html, /A &amp; B/);
  assert.match(first.html, /width:0%/);
  assert.match(first.text, /Hallo daar/);
  assert.match(first.text, /Team Max Webstudio/);
  const full = renderJourneyMail(validateMailCommand(command({ templateData: { ...command().templateData, percentage: 100 } }), CONTEXT, ENV));
  assert.match(full.html, /width:100%/);
});

test("retry policy is bounded and permanent errors dead-letter immediately", () => {
  assert.equal(backoffDelayMs(1, { baseMs: 1000, maxMs: 5000, jitterRatio: 0, random: () => 0.5 }), 1000);
  assert.equal(backoffDelayMs(9, { baseMs: 1000, maxMs: 5000, jitterRatio: 0, random: () => 0.5 }), 5000);
  assert.equal(nextOutboxFailure({ attempt: 1, maxAttempts: 4, retryable: true, nowMs: 0, baseMs: 1000, random: () => 0.5 }).status, "failed");
  assert.equal(nextOutboxFailure({ attempt: 4, maxAttempts: 4, retryable: true }).status, "dead_letter");
  assert.equal(nextOutboxFailure({ attempt: 1, retryable: false }).status, "dead_letter");
  assert.equal(classifyMailError({ statusCode: 429 }).retryable, true);
  assert.equal(classifyMailError({ code: "unsafe_action_url" }).retryable, false);
});

test("worker no-ops when disabled, handles empty batches and missing storage", async () => {
  let claims = 0;
  const disabled = createJourneyMailWorker({ env: {}, repository: { claimBatch: async () => { claims += 1; return { available: true, rows: [] }; } }, logger: { info() {}, error() {} } });
  assert.equal((await disabled.run({}, CONTEXT)).result, "disabled");
  assert.equal(claims, 0);
  const empty = createJourneyMailWorker({ env: ENV, repository: fakeRepository([]), logger: { info() {}, error() {} } });
  assert.equal((await empty.run({}, CONTEXT)).claimed, 0);
  const missing = createJourneyMailWorker({ env: ENV, repository: { claimBatch: async () => ({ available: false, reason: "storage_unavailable" }) }, logger: { info() {}, error() {} } });
  assert.equal((await missing.run({}, CONTEXT)).result, "storage_unavailable");
});

test("worker sends one validated testmail and records execution before completion", async () => {
  const repository = fakeRepository([item()]);
  const sends = [];
  const worker = createJourneyMailWorker({ env: ENV, repository, mailSender: async (mail) => { sends.push(mail); return { sent: true, id: "resend-1" }; }, logger: { info() {}, error() {} } });
  const result = await worker.run({}, CONTEXT);
  assert.equal(result.completed, 1);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].from, "Max Webstudio <info@maxwebstudio.nl>");
  assert.match(sends[0].subject, /^\[TEST\]/);
  assert.ok(sends[0].html && sends[0].text);
  assert.equal(sends[0].suppressTimelineEvent, true);
  assert.deepEqual(repository.calls.map((entry) => entry[0]), ["begin", "execution_sent", "outbox_sent", "complete"]);
});

test("temporary, permanent and final-attempt failures produce retry or dead-letter and partial batches continue", async () => {
  const repository = fakeRepository([item({ id: "temporary" }), item({ id: "permanent", payload: { mailCommand: command({ actionUrl: "https://evil.example" }) } }), item({ id: "success" })]);
  let sendCalls = 0;
  const worker = createJourneyMailWorker({ env: ENV, repository, mailSender: async () => { sendCalls += 1; return sendCalls === 1 ? { sent: false, errorCode: "provider_timeout", retryable: true, ambiguous: true } : { sent: true, id: "resend-success" }; }, logger: { info() {}, error() {} } });
  const result = await worker.run({}, CONTEXT);
  assert.equal(result.claimed, 3);
  assert.equal(result.completed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.deadLetter, 1);
  assert.ok(repository.calls.some((entry) => entry[0] === "fail"));
  const finalRepository = fakeRepository([item({ attempt_count: 4 })]);
  const final = createJourneyMailWorker({ env: ENV, repository: finalRepository, mailSender: async () => ({ sent: false, errorCode: "provider_timeout", retryable: true, ambiguous: true }), logger: { info() {}, error() {} } });
  assert.equal((await final.run({}, CONTEXT)).deadLetter, 1);
});

test("existing provider result recovers without a second send", async () => {
  const repository = fakeRepository([item()]);
  repository.beginExecution = async () => ({ available: true, created: false, row: { id: "execution-1", status: "sent", provider_message_id: "resend-existing" } });
  let sends = 0;
  const worker = createJourneyMailWorker({ env: ENV, repository, mailSender: async () => { sends += 1; return { sent: true, id: "new" }; }, logger: { info() {}, error() {} } });
  const result = await worker.run({}, CONTEXT);
  assert.equal(result.recovered, 1);
  assert.equal(sends, 0);
});

test("provider accepted plus failed execution update becomes ambiguous dead-letter without blind retry", async () => {
  const repository = fakeRepository([item()]);
  repository.markExecutionSent = async () => { throw Object.assign(new Error("db"), { code: "lease_lost" }); };
  const worker = createJourneyMailWorker({ env: ENV, repository, mailSender: async () => ({ sent: true, id: "accepted-1" }), logger: { info() {}, error() {} } });
  const result = await worker.run({}, CONTEXT);
  assert.equal(result.deadLetter, 1);
  assert.ok(repository.calls.some((entry) => entry[0] === "fail" && entry[2] === "ambiguous_send"));
});

test("provider idempotency key is stable and central Resend service forwards it", async () => {
  assert.equal(workerPrivate.providerIdempotencyKey("abc"), "journey/abc");
  const requests = [];
  const result = await sendTrackedEmail({ to: "tester@example.com", subject: "[TEST]", html: "<p>test</p>", text: "test", idempotencyKey: "journey/abc", suppressTimelineEvent: true }, {
    env: { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-key" },
    fetchImpl: async (_url, options) => { requests.push(options); return { ok: true, status: 200, json: async () => ({ id: "resend-1" }) }; },
  });
  assert.equal(result.id, "resend-1");
  assert.equal(requests[0].headers["Idempotency-Key"], "journey/abc");
});

test("synthetic producer deduplicates through the existing journey event repository", async () => {
  const calls = [];
  const repository = { recordJourneyEvent: async (event, options) => { calls.push({ event, options }); return { available: true, row: { outbox_id: "outbox-1", duplicate: calls.length > 1 } }; } };
  const producer = createJourneyMailTestProducer({ env: ENV, repository });
  const input = { recipient: "tester@example.com", requestKey: "request-12345678" };
  const first = await producer.enqueue(input, CONTEXT);
  const second = await producer.enqueue(input, CONTEXT);
  assert.equal(first.created, true);
  assert.equal(second.duplicate, true);
  assert.equal(calls[0].event.eventKey, calls[1].event.eventKey);
  assert.equal(calls[0].options.outbox.idempotencyKey, calls[1].options.outbox.idempotencyKey);
  assert.equal(calls[0].event.payload.synthetic, true);
});

test("test trigger requires active super-admin and reports missing storage", async () => {
  let authOptions;
  const denied = createHandler({ env: ENV, verifyAdmin: async (_event, _json, options) => { authOptions = options; return { success: false, response: { statusCode: 401, body: "{}" } }; } });
  assert.equal((await denied({ httpMethod: "POST", body: "{}" })).statusCode, 401);
  assert.deepEqual(authOptions.allowedRoles, ["super_admin"]);
  assert.equal(authOptions.disableLegacyToken, true);
  const handler = createHandler({ env: ENV, verifyAdmin: async () => ({ success: true }), producer: { enqueue: async () => ({ storageAvailable: false, reason: "storage_unavailable" }) }, worker: { run: async () => ({ storageAvailable: false, result: "storage_unavailable" }) } });
  assert.equal((await handler({ httpMethod: "POST", body: JSON.stringify({ action: "enqueue_test", recipient: "tester@example.com" }) })).statusCode, 503);
  assert.equal((await handler({ httpMethod: "GET" })).statusCode, 405);
});

test("draft migration contains atomic test-only claim, stale recovery, RLS and no destructive SQL", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../supabase/migration-drafts/025_customer_journey_automation_foundations.sql"), "utf8").toLowerCase();
  assert.match(sql, /claim_automation_outbox/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /lease_expires_at < now\(\)/);
  assert.match(sql, /effect_type in \('email\.journey_test', 'email\.preview_ready'\)/);
  assert.match(sql, /p_environment <> 'test'/);
  assert.match(sql, /revoke all on function public\.claim_automation_outbox/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /drop\s+(table|column)|truncate\s|delete\s+from/);
});

test("admin mail insight exposes operational metadata only", () => {
  const { _private } = require("../functions/journey/adminReadService");
  const result = _private.mailAutomation([{ id: "o1", effect_type: "email.journey_test", environment: "test", status: "failed", attempt_count: 2, next_attempt_at: "2026-07-13T12:00:00Z", last_error_code: "provider_timeout" }], [{ outbox_id: "o1", template_key: "journey.test_status_update", template_version: 1, provider: "resend", delivery_status: "failed", provider_message_id: "provider-secret" }], true);
  assert.equal(result.counts.failed, 1);
  assert.equal(result.items[0].hasProviderMessageId, true);
  assert.equal(JSON.stringify(result).includes("provider-secret"), false);
  assert.equal(JSON.stringify(result).includes("recipient"), false);
});
