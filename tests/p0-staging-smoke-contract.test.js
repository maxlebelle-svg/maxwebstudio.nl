const assert = require("node:assert/strict");
const test = require("node:test");

const { createHandler } = require("../functions/send-lead")._private;
const {
  AUTH_HEADER,
  signSmokeAuthorization,
  _private: { STAGING_SITE_ID, STAGING_SUPABASE_PROJECT_ID },
} = require("../functions/services/p0StagingSmokeControl");

const NOW_SECONDS = 1784656800;
const SMOKE_SECRET = "p0-staging-smoke-secret-with-more-than-32-bytes";
const ABUSE_SECRET = "lead-abuse-secret-with-more-than-32-bytes";
const NONCE = "p0_smoke_nonce_0001";
const LEAD_ID = "10000000-0000-4000-8000-000000000001";

const validPayload = Object.freeze({
  id: "lead-p0-staging-smoke-1784656800000",
  createdAt: "2026-07-21T19:20:00.000Z",
  source: "homepage-contact-form",
  name: "P0 Staging Smoke",
  company: "P0 Staging Smoke Fixture",
  email: "p0-staging-smoke@example.test",
  phone: "+31 6 00000000",
  packageInterest: "Business Website",
  carePackage: "Care Plus",
  termsAccepted: true,
  message: "Geautoriseerde staging-smoke zonder outbound delivery.",
  _gotcha: "",
});

function stagingEnv(overrides = {}) {
  return {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    SUPABASE_PROJECT_ID: STAGING_SUPABASE_PROJECT_ID,
    SITE_ID: STAGING_SITE_ID,
    CONTEXT: "production",
    LEAD_ABUSE_HMAC_SECRET: ABUSE_SECRET,
    OUTBOUND_PROVIDER_MODE: "suppress",
    P0_STAGING_SMOKE_HMAC_SECRET: SMOKE_SECRET,
    ...overrides,
  };
}

function smokeEvent(payload = validPayload, overrides = {}) {
  const body = JSON.stringify(payload);
  const authorization = signSmokeAuthorization({ rawBody: body, secret: SMOKE_SECRET, timestamp: NOW_SECONDS, nonce: NONCE });
  return {
    httpMethod: "POST",
    headers: {
      "x-nf-client-connection-ip": "203.0.113.42",
      "user-agent": "P0 staging smoke test",
      [AUTH_HEADER]: authorization,
      ...(overrides.headers || {}),
    },
    body,
    ...overrides,
    headers: {
      "x-nf-client-connection-ip": "203.0.113.42",
      "user-agent": "P0 staging smoke test",
      [AUTH_HEADER]: authorization,
      ...(overrides.headers || {}),
    },
  };
}

function harness(options = {}) {
  const calls = { limiter: 0, create: 0, reconcile: 0, timeline: 0, provider: 0, createPayload: null, logs: [] };
  const env = options.env || stagingEnv();
  const handler = createHandler({
    env,
    fetchImpl: async (url, request) => {
      if (url.endsWith("mws_check_lead_intake_abuse_v1")) {
        calls.limiter += 1;
        return response({ version: 1, allowed: true, decision: "unique_allowed", replay: false, uniqueCounted: true, retryAfterSeconds: 0 });
      }
      if (url.endsWith("mws_create_lead_transactional_v1")) {
        calls.create += 1;
        calls.createPayload = JSON.parse(request.body);
        return response({ status: "resolved", lead: { id: LEAD_ID }, created: true, duplicate: false, idempotentReplay: false });
      }
      if (url.endsWith("mws_get_lead_intake_result_v1")) calls.reconcile += 1;
      throw new Error(`unexpected network request: ${url}`);
    },
    createTimelineEvent: async () => { calls.timeline += 1; return { id: "timeline-event" }; },
    sendEmail: async () => { calls.provider += 1; return { sent: true, id: `provider-${calls.provider}` }; },
    getCompanySettings: () => ({ primaryEmail: "info@example.test", whatsappNumber: "31600000000" }),
    getWhatsappLink: () => "https://wa.me/31600000000",
    createRequestReference: () => "000000000000000000000000",
    logger: { info: (...args) => calls.logs.push(args) },
  });
  return { calls, env, handler };
}

async function invoke(setup, event) {
  const originalNow = Date.now;
  Date.now = () => NOW_SECONDS * 1000;
  try {
    const result = await setup.handler(event);
    return { result, body: JSON.parse(result.body) };
  } finally {
    Date.now = originalNow;
  }
}

test("normal staging request without smoke authorization preserves both provider deliveries", async () => {
  const setup = harness();
  const event = smokeEvent();
  delete event.headers[AUTH_HEADER];
  const { result, body } = await invoke(setup, event);
  assert.equal(result.statusCode, 200);
  assert.equal(body.providerSuppressed, undefined);
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 1, create: 1, timeline: 1, provider: 2 });
  assert.equal(setup.calls.createPayload.p_lead.environment, "production");
  assert.equal(setup.calls.createPayload.p_lead.metadata.stagingSmoke, undefined);
});

test("valid authenticated staging smoke keeps database and timeline active while suppressing both Resend deliveries", async () => {
  const setup = harness();
  const { result, body } = await invoke(setup, smokeEvent());
  assert.equal(result.statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.providerSuppressed, true);
  assert.deepEqual(body.suppressedProviders, ["resend"]);
  assert.equal(body.suppressionReason, "staging_smoke");
  assert.equal(body.suppressedDeliveryCount, 2);
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 1, create: 1, reconcile: 0, timeline: 1, provider: 0 });
  assert.equal(setup.calls.createPayload.p_lead.environment, "test");
  assert.equal(setup.calls.createPayload.p_lead.metadata.stagingSmoke, true);
  assert.equal(setup.calls.createPayload.p_lead.metadata.suppressionReason, "staging_smoke");
});

test("suppressed delivery evidence proves no provider HTTP, delivery job or retry scheduling", async () => {
  const setup = harness();
  await invoke(setup, smokeEvent());
  const suppressed = setup.calls.logs.filter(([message]) => message === "outbound_provider_suppressed");
  assert.equal(suppressed.length, 2);
  for (const [, details] of suppressed) {
    assert.deepEqual({ provider: details.provider, reason: details.reason, deliveryJobCreated: details.deliveryJobCreated, retryScheduled: details.retryScheduled }, {
      provider: "resend", reason: "staging_smoke", deliveryJobCreated: false, retryScheduled: false,
    });
  }
  assert.equal(setup.calls.provider, 0);
});

test("invalid smoke authorization is rejected before limiter, database, timeline and providers", async () => {
  const setup = harness();
  const event = smokeEvent();
  event.headers[AUTH_HEADER] = `v1:${NOW_SECONDS}:${NONCE}:${"0".repeat(64)}`;
  const { result, body } = await invoke(setup, event);
  assert.equal(result.statusCode, 403);
  assert.equal(body.classification, "validationRejected");
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, timeline: 0, provider: 0 });
});

test("smoke signature is bound to the exact request body", async () => {
  const setup = harness();
  const event = smokeEvent();
  event.body = JSON.stringify({ ...validPayload, message: "Tampered after signing" });
  const { result } = await invoke(setup, event);
  assert.equal(result.statusCode, 403);
  assert.equal(setup.calls.provider, 0);
  assert.equal(setup.calls.create, 0);
});

test("expired smoke authorization is rejected without side effects", async () => {
  const setup = harness();
  const event = smokeEvent();
  event.headers[AUTH_HEADER] = signSmokeAuthorization({ rawBody: event.body, secret: SMOKE_SECRET, timestamp: NOW_SECONDS - 301, nonce: NONCE });
  const { result } = await invoke(setup, event);
  assert.equal(result.statusCode, 403);
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, timeline: 0, provider: 0 });
});

test("honeypot stops before smoke authentication and every downstream dependency", async () => {
  const setup = harness({ env: stagingEnv({ P0_STAGING_SMOKE_HMAC_SECRET: "" }) });
  const event = smokeEvent({ ...validPayload, _gotcha: "bot content" });
  event.headers[AUTH_HEADER] = "invalid";
  const { result, body } = await invoke(setup, event);
  assert.equal(result.statusCode, 200);
  assert.equal(body.accepted, false);
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, timeline: 0, provider: 0 });
});

test("suppress mode is fail-closed on a non-staging site or Supabase project", async () => {
  for (const env of [stagingEnv({ SITE_ID: "production-site-id" }), stagingEnv({ SUPABASE_PROJECT_ID: "production-project" })]) {
    for (const authorized of [false, true]) {
      const setup = harness({ env });
      const event = smokeEvent();
      if (!authorized) delete event.headers[AUTH_HEADER];
      const { result, body } = await invoke(setup, event);
      assert.equal(result.statusCode, 503);
      assert.equal(body.classification, "validationRejected");
      assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, timeline: 0, provider: 0 });
    }
  }
});

test("unknown suppress configuration and missing staging smoke secret fail closed", async () => {
  for (const env of [stagingEnv({ OUTBOUND_PROVIDER_MODE: "maybe" }), stagingEnv({ P0_STAGING_SMOKE_HMAC_SECRET: "short" })]) {
    const setup = harness({ env });
    const { result } = await invoke(setup, smokeEvent());
    assert.equal(result.statusCode, 503);
    assert.equal(setup.calls.create, 0);
    assert.equal(setup.calls.provider, 0);
  }
});

test("smoke authorization is refused when suppression mode is not enabled", async () => {
  const setup = harness({ env: stagingEnv({ OUTBOUND_PROVIDER_MODE: "" }) });
  const { result } = await invoke(setup, smokeEvent());
  assert.equal(result.statusCode, 403);
  assert.equal(setup.calls.create, 0);
  assert.equal(setup.calls.provider, 0);
});

test("ordinary production-like behavior remains unchanged when no smoke configuration or header exists", async () => {
  const setup = harness({ env: stagingEnv({ OUTBOUND_PROVIDER_MODE: "", P0_STAGING_SMOKE_HMAC_SECRET: "", SITE_ID: "production-site-id", SUPABASE_PROJECT_ID: "production-project" }) });
  const event = smokeEvent();
  delete event.headers[AUTH_HEADER];
  const { result, body } = await invoke(setup, event);
  assert.equal(result.statusCode, 200);
  assert.equal(body.providerSuppressed, undefined);
  assert.equal(setup.calls.provider, 2);
  assert.equal(setup.calls.createPayload.p_lead.environment, "production");
});

function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value };
}
