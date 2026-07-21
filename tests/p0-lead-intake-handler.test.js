const assert = require("node:assert/strict");
const test = require("node:test");

const { createHandler, LIMITS, REQUEST_MAX_BYTES, sanitizeLead, validateLead } = require("../functions/send-lead")._private;

const validPayload = Object.freeze({
  id: "lead-1720000000000",
  createdAt: "2026-07-21T12:00:00.000Z",
  source: "homepage-contact-form",
  name: "Ada Lovelace",
  company: "Analytical Engines",
  email: "ada@example.com",
  phone: "0612345678",
  packageInterest: "Business Website",
  carePackage: "Care Plus",
  termsAccepted: true,
  message: "Ik wil een nieuwe website.",
});

const limiterUnique = { version: 1, allowed: true, decision: "unique_allowed", replay: false, uniqueCounted: true, retryAfterSeconds: 0 };
const limiterReplay = { version: 1, allowed: true, decision: "replay_allowed", replay: true, uniqueCounted: false, retryAfterSeconds: 0 };
const limiterBlocked = { version: 1, allowed: false, decision: "short_window_limited", replay: false, uniqueCounted: false, retryAfterSeconds: 900 };
const created = { status: "resolved", lead: { id: "10000000-0000-4000-8000-000000000001" }, created: true, duplicate: false, idempotentReplay: false };
const duplicate = { status: "resolved", lead: { id: "10000000-0000-4000-8000-000000000002" }, created: false, duplicate: true, idempotentReplay: false };
const replay = { status: "resolved", lead: { id: "10000000-0000-4000-8000-000000000003" }, created: false, duplicate: false, idempotentReplay: true };

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function timeoutError() {
  const error = new Error("private timeout detail");
  error.name = "TimeoutError";
  return error;
}

function harness(queue = [response(limiterUnique), response(created)], overrides = {}) {
  const calls = { limiter: 0, create: 0, reconcile: 0, timeline: 0, provider: 0, settings: 0, logs: [], bodies: [] };
  const fetchImpl = overrides.fetchImpl || (async (url, options) => {
    if (url.endsWith("mws_check_lead_intake_abuse_v1")) calls.limiter += 1;
    else if (url.endsWith("mws_create_lead_transactional_v1")) calls.create += 1;
    else if (url.endsWith("mws_get_lead_intake_result_v1")) calls.reconcile += 1;
    calls.bodies.push({ url, body: JSON.parse(options.body) });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("unexpected fetch");
    return next;
  });
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    LEAD_ABUSE_HMAC_SECRET: "current-secret-with-at-least-32-bytes-value",
    CONTEXT: "test",
    ...overrides.env,
  };
  const handler = createHandler({
    env,
    fetchImpl,
    createTimelineEvent: overrides.createTimelineEvent || (async () => { calls.timeline += 1; return {}; }),
    sendEmail: overrides.sendEmail || (async () => { calls.provider += 1; return { sent: true }; }),
    getCompanySettings: overrides.getCompanySettings || (() => { calls.settings += 1; return { primaryEmail: "info@example.com", whatsappNumber: "31600000000" }; }),
    getWhatsappLink: () => "https://wa.me/31600000000",
    createRequestReference: () => "000000000000000000000000",
    logger: { info: (...args) => calls.logs.push(args) },
  });
  return { handler, calls, env };
}

function event(payload = validPayload, extra = {}) {
  return {
    httpMethod: "POST",
    headers: { "x-nf-client-connection-ip": "203.0.113.42", "user-agent": "Mozilla/5.0 Chrome/126.0" },
    body: JSON.stringify(payload),
    ...extra,
  };
}

async function invoke(setup, request = event()) {
  const result = await setup.handler(request);
  return { result, body: JSON.parse(result.body) };
}

test("new lead follows limiter, create, timeline and both provider calls", async () => {
  const setup = harness();
  const { result, body } = await invoke(setup);
  assert.equal(result.statusCode, 200);
  assert.equal(body.storageClassification, "created");
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 1, create: 1, reconcile: 0, timeline: 1, provider: 2 });
});

for (const [name, intake, expected] of [
  ["duplicate", duplicate, "duplicate"],
  ["idempotent replay", replay, "idempotentReplay"],
]) {
  test(`${name} receives the exact operational classification`, async () => {
    const setup = harness([response(limiterUnique), response(intake)]);
    const { body } = await invoke(setup);
    assert.equal(body.storageClassification, expected);
    assert.equal(setup.calls.create, 1);
    assert.equal(setup.calls.reconcile, 0);
    if (expected === "idempotentReplay") {
      assert.equal(setup.calls.timeline, 0);
      assert.equal(setup.calls.provider, 0);
    }
  });
}

test("rate limit returns generic 429 and stops before create or notifications", async () => {
  const setup = harness([response(limiterBlocked)]);
  const { result, body } = await invoke(setup);
  assert.equal(result.statusCode, 429);
  assert.equal(body.classification, "abuseRejected");
  assert.deepEqual({ create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { create: 0, reconcile: 0, timeline: 0, provider: 0 });
  assert.doesNotMatch(result.body, /fingerprint|database|Supabase/i);
});

test("honeypot is checked before HMAC, limiter, create and notifications", async () => {
  const setup = harness([],{ env: { LEAD_ABUSE_HMAC_SECRET: "" } });
  const rawHoneypot = "raw-honeypot-content-must-not-be-logged";
  const { result, body } = await invoke(setup, event({ ...validPayload, _gotcha: rawHoneypot }));
  assert.equal(result.statusCode, 200);
  assert.equal(body.accepted, false);
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, reconcile: 0, timeline: 0, provider: 0 });
  assert.doesNotMatch(result.body, /honeypot|raw-honeypot/i);
  assert.doesNotMatch(JSON.stringify(setup.calls.logs), new RegExp(rawHoneypot));
});

for (const [name, value] of [["empty", ""], ["whitespace-only", " \t\n"]]) {
  test(`${name} honeypot value preserves the normal lead flow`, async () => {
    const setup = harness();
    const { result, body } = await invoke(setup, event({ ...validPayload, _gotcha: value }));
    assert.equal(result.statusCode, 200);
    assert.equal(body.accepted, undefined);
    assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 1, create: 1, reconcile: 0, timeline: 1, provider: 2 });
  });
}

for (const [name, value] of [["null", null], ["number", 0], ["boolean", false], ["object", {}], ["array", []]]) {
  test(`explicit non-string honeypot value (${name}) fails closed before dependencies`, async () => {
    const setup = harness([], { env: { LEAD_ABUSE_HMAC_SECRET: "" } });
    const { result, body } = await invoke(setup, event({ ...validPayload, _gotcha: value }));
    assert.equal(result.statusCode, 200);
    assert.equal(body.accepted, false);
    assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, reconcile: 0, timeline: 0, provider: 0 });
  });
}

test("legitimate limiter replay reaches create exactly once", async () => {
  const setup = harness([response(limiterReplay), response(replay)]);
  const { body } = await invoke(setup);
  assert.equal(body.storageClassification, "idempotentReplay");
  assert.equal(setup.calls.limiter, 1);
  assert.equal(setup.calls.create, 1);
});

test("definitive create error is not reconciled and triggers no notifications", async () => {
  const setup = harness([response(limiterUnique), response({ code: "42501", message: "private" }, 403)]);
  const { result, body } = await invoke(setup);
  assert.equal(result.statusCode, 400);
  assert.equal(body.classification, "storageFailed");
  assert.deepEqual({ create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { create: 1, reconcile: 0, timeline: 0, provider: 0 });
  assert.doesNotMatch(result.body, /42501|private/);
});

for (const [name, reconciled, expected] of [
  ["created", { ...created, created: false, idempotentReplay: true }, "reconciledCreated"],
  ["duplicate", { ...duplicate, idempotentReplay: true }, "reconciledDuplicate"],
  ["replay", { ...replay }, "reconciledCreated"],
]) {
  test(`create timeout plus ${name} reconciliation succeeds without create retry`, async () => {
    const setup = harness([response(limiterUnique), timeoutError(), response(reconciled)]);
    const { result, body } = await invoke(setup);
    assert.equal(result.statusCode, 200);
    assert.equal(body.storageClassification, expected);
    assert.equal(body.reconciled, true);
    assert.equal(body.idempotentReplay, true);
    assert.deepEqual({ create: setup.calls.create, reconcile: setup.calls.reconcile }, { create: 1, reconcile: 1 });
  });
}

test("timeout reconciliation finding nothing fails safely without notifications", async () => {
  const setup = harness([response(limiterUnique), timeoutError(), response(null)]);
  const { result, body } = await invoke(setup);
  assert.equal(result.statusCode, 503);
  assert.equal(body.classification, "storageFailed");
  assert.deepEqual({ create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { create: 1, reconcile: 1, timeline: 0, provider: 0 });
});

test("reconciliation transport failure remains safe and never retries create", async () => {
  const setup = harness([response(limiterUnique), timeoutError(), new Error("private reconciliation detail")]);
  const { result } = await invoke(setup);
  assert.equal(result.statusCode, 503);
  assert.deepEqual({ create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { create: 1, reconcile: 1, timeline: 0, provider: 0 });
  assert.doesNotMatch(result.body, /private reconciliation/);
});

test("expired or deleted reconciliation state does not prove deliverable storage", async () => {
  for (const status of ["expired", "lead_deleted"]) {
    const setup = harness([response(limiterUnique), timeoutError(), response({ ...replay, status })]);
    const { result, body } = await invoke(setup);
    assert.equal(result.statusCode, 503);
    assert.equal(body.classification, "storageFailed");
    assert.deepEqual({ create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { create: 1, reconcile: 1, timeline: 0, provider: 0 });
  }
});

for (const [name, envKey] of [["Supabase URL", "SUPABASE_URL"], ["service-role key", "SUPABASE_SERVICE_ROLE_KEY"], ["HMAC secret", "LEAD_ABUSE_HMAC_SECRET"]]) {
  test(`missing ${name} fails before create`, async () => {
    const setup = harness([], { env: { [envKey]: "" } });
    const { result, body } = await invoke(setup);
    assert.equal(result.statusCode, 503);
    assert.equal(body.classification, "storageFailed");
    assert.equal(setup.calls.create, 0);
    assert.equal(setup.calls.timeline, 0);
    assert.equal(setup.calls.provider, 0);
  });
}

test("limiter internal error fails closed without fallback or downstream calls", async () => {
  const setup = harness([new Error("private limiter failure")]);
  const { result } = await invoke(setup);
  assert.equal(result.statusCode, 503);
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 1, create: 0, timeline: 0, provider: 0 });
  assert.doesNotMatch(result.body, /private limiter/);
});

test("provider sent:false after storage returns successful degraded response", async () => {
  const setup = harness(undefined, { sendEmail: async () => { setup.calls.provider += 1; return { sent: false, warning: "private provider warning" }; } });
  const { result, body } = await invoke(setup);
  assert.equal(result.statusCode, 202);
  assert.equal(body.success, true);
  assert.equal(body.classification, "notificationDegraded");
  assert.equal(body.storageClassification, "created");
  assert.doesNotMatch(result.body, /private provider/);
});

test("provider exception after storage returns successful degraded response", async () => {
  const setup = harness(undefined, { sendEmail: async () => { setup.calls.provider += 1; throw new Error("private provider exception"); } });
  const { result, body } = await invoke(setup);
  assert.equal(result.statusCode, 202);
  assert.equal(body.success, true);
  assert.equal(body.classification, "notificationDegraded");
  assert.doesNotMatch(result.body, /private provider/);
});

test("company settings exception after storage returns successful degraded response", async () => {
  const setup = harness(undefined, { getCompanySettings: () => { setup.calls.settings += 1; throw new Error("private settings exception"); } });
  const { result, body } = await invoke(setup);
  assert.equal(result.statusCode, 202);
  assert.equal(body.success, true);
  assert.equal(body.classification, "notificationDegraded");
  assert.equal(body.storageClassification, "created");
  assert.deepEqual({ create: setup.calls.create, reconcile: setup.calls.reconcile, settings: setup.calls.settings, provider: setup.calls.provider }, { create: 1, reconcile: 0, settings: 1, provider: 0 });
  assert.doesNotMatch(result.body, /private settings|storageFailed/);
});

test("timeline exception after storage does not change the proven storage result", async () => {
  const setup = harness(undefined, { createTimelineEvent: async () => { setup.calls.timeline += 1; throw new Error("private timeline exception"); } });
  const { result, body } = await invoke(setup);
  assert.equal(result.statusCode, 202);
  assert.equal(body.success, true);
  assert.equal(body.classification, "notificationDegraded");
  assert.equal(body.storageClassification, "created");
  assert.deepEqual({ create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline }, { create: 1, reconcile: 0, timeline: 1 });
});

test("idempotent replay skips the complete post-storage notification phase", async () => {
  const setup = harness([response(limiterReplay), response(replay)], { getCompanySettings: () => { setup.calls.settings += 1; throw new Error("must not run"); } });
  const { result, body } = await invoke(setup);
  assert.equal(result.statusCode, 200);
  assert.equal(body.classification, "idempotentReplay");
  assert.deepEqual({ create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, settings: setup.calls.settings, provider: setup.calls.provider }, { create: 1, reconcile: 0, timeline: 0, settings: 0, provider: 0 });
});

test("missing optional company settings do not turn proven storage into a storage failure", async () => {
  const setup = harness(undefined, { getCompanySettings: () => { setup.calls.settings += 1; return null; } });
  const { result, body } = await invoke(setup);
  assert.equal(result.statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.storageClassification, "created");
  assert.equal(setup.calls.create, 1);
  assert.equal(setup.calls.reconcile, 0);
});

for (const [name, field, value, reason] of [
  ["name", "name", "x".repeat(241), "nameTooLong"],
  ["company", "company", "x".repeat(241), "companyTooLong"],
  ["phone", "phone", "1".repeat(81), "phoneTooLong"],
  ["email", "email", `${"a".repeat(309)}@example.com`, "emailTooLong"],
]) {
  test(`too long ${name} is rejected before limiter`, async () => {
    const setup = harness([]);
    const { result } = await invoke(setup, event({ ...validPayload, [field]: value }));
    assert.equal(result.statusCode, 400);
    assert.equal(setup.calls.limiter, 0);
    assert.match(JSON.stringify(setup.calls.logs), new RegExp(reason));
  });
}

test("invalid email is rejected before limiter", async () => {
  const setup = harness([]);
  const { result } = await invoke(setup, event({ ...validPayload, email: "geen-geldig-adres" }));
  assert.equal(result.statusCode, 400);
  assert.equal(setup.calls.limiter, 0);
});

test("PostgreSQL character boundaries match for ASCII and multibyte values without truncation", () => {
  for (const [field, max, validValue] of [
    ["name", LIMITS.name, "😀".repeat(LIMITS.name)],
    ["company", LIMITS.company, "é".repeat(LIMITS.company)],
    ["phone", LIMITS.phone, "1".repeat(LIMITS.phone)],
  ]) {
    const atBoundary = sanitizeLead({ ...validPayload, [field]: validValue });
    assert.equal(validateLead(atBoundary), null);
    assert.equal(Array.from(atBoundary[field]).length, max);
    assert.equal(validateLead(sanitizeLead({ ...validPayload, [field]: `${validValue}x` })).code, `${field}TooLong`);
  }
  const email320 = `${"a".repeat(308)}@example.com`;
  assert.equal(Array.from(email320).length, 320);
  assert.equal(validateLead(sanitizeLead({ ...validPayload, email: email320 })), null);
  assert.equal(validateLead(sanitizeLead({ ...validPayload, email: `${email320}x` })).code, "emailTooLong");
});

test("malformed JSON is rejected before limiter", async () => {
  const setup = harness([]);
  const { result } = await invoke(setup, event(validPayload, { body: "{" }));
  assert.equal(result.statusCode, 400);
  assert.equal(setup.calls.limiter, 0);
});

test("oversized UTF-8 request body is rejected before JSON parsing", async () => {
  const setup = harness([]);
  const { result } = await invoke(setup, event(validPayload, { body: "x".repeat(REQUEST_MAX_BYTES + 1) }));
  assert.equal(result.statusCode, 413);
  assert.equal(setup.calls.limiter, 0);
});

test("unsupported method is rejected before reading dependencies", async () => {
  const setup = harness([]);
  const { result } = await invoke(setup, { httpMethod: "GET", body: "" });
  assert.equal(result.statusCode, 405);
  assert.equal(setup.calls.limiter, 0);
});

test("storage failure produces no timeline or provider calls", async () => {
  const setup = harness([response(limiterUnique), response({}, 500)]);
  await invoke(setup);
  assert.deepEqual({ timeline: setup.calls.timeline, provider: setup.calls.provider }, { timeline: 0, provider: 0 });
});

test("operational logs and request reference are PII-free", async () => {
  const setup = harness();
  const { body } = await invoke(setup);
  const logs = JSON.stringify(setup.calls.logs);
  assert.match(body.requestReference, /^[0-9a-f]{24}$/);
  for (const pii of [validPayload.name, validPayload.company, validPayload.email, validPayload.phone, validPayload.message]) assert.doesNotMatch(logs, new RegExp(pii.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("KPI classifications cover every required local outcome", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../functions/send-lead.js"), "utf8");
  for (const value of ["created", "duplicate", "idempotentReplay", "reconciledCreated", "reconciledDuplicate", "validationRejected", "abuseRejected", "storageFailed", "notificationDegraded"]) assert.match(source, new RegExp(`\\b${value}\\b`));
});
