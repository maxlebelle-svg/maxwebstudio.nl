const assert = require("node:assert/strict");
const test = require("node:test");

const { createHandler } = require("../functions/send-lead")._private;
const {
  AUTH_HEADER,
  BODY_PROOF_HEADER,
  ROTATION_HEADER,
  SECRET_PROOF_HEADER,
  buildSmokeAuthorization,
  _private: { STAGING_SITE_ID, STAGING_SUPABASE_PROJECT_ID },
} = require("../functions/services/p0StagingSmokeControl");

const NOW_SECONDS = 1784656800;
const SMOKE_SECRET = "p0-staging-smoke-secret-with-more-than-32-bytes";
const OTHER_SMOKE_SECRET = "different-p0-staging-smoke-secret-more-than-32-bytes";
const ROTATION_ID = "rot_0123456789abcdef0123456789abcdef";
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
    APP_ENVIRONMENT: "production",
    APP_ENV: "production",
    CONTEXT: "production",
    LEAD_ABUSE_HMAC_SECRET: ABUSE_SECRET,
    OUTBOUND_PROVIDER_MODE: "suppress",
    P0_STAGING_SMOKE_HMAC_SECRET: SMOKE_SECRET,
    P0_STAGING_SMOKE_ROTATION_ID: ROTATION_ID,
    ...overrides,
  };
}

function smokeEvent(payload = validPayload, overrides = {}) {
  const body = overrides.body === undefined ? JSON.stringify(payload) : overrides.body;
  const signed = buildSmokeAuthorization({
    rawBody: body,
    secret: overrides.secret || SMOKE_SECRET,
    rotationId: overrides.rotationId || ROTATION_ID,
    timestamp: overrides.timestamp ?? NOW_SECONDS,
    nonce: overrides.nonce || NONCE,
  });
  return {
    httpMethod: "POST",
    headers: {
      "x-nf-client-connection-ip": "203.0.113.42",
      "user-agent": "P0 staging smoke test",
      ...signed.headers,
      ...(overrides.headers || {}),
    },
    body,
    isBase64Encoded: Boolean(overrides.isBase64Encoded),
  };
}

function harness(options = {}) {
  const calls = { nonce: 0, limiter: 0, create: 0, reconcile: 0, timeline: 0, provider: 0, createPayload: null, noncePayloads: [], logs: [] };
  const env = options.env || stagingEnv();
  const nonceStore = options.nonceStore || new Map();
  const handler = createHandler({
    env,
    fetchImpl: async (url, request) => {
      if (url.endsWith("mws_consume_p0_staging_smoke_nonce_v1")) {
        calls.nonce += 1;
        const input = JSON.parse(request.body);
        calls.noncePayloads.push(input);
        if (options.nonceError) throw options.nonceError;
        if (options.nonceResponse) return options.nonceResponse;
        const existing = nonceStore.get(input.p_nonce_fingerprint);
        if (!existing) {
          nonceStore.set(input.p_nonce_fingerprint, input.p_request_binding);
          return response({ version: 1, consumed: true, decision: "consumed" });
        }
        return response({
          version: 1,
          consumed: false,
          decision: existing === input.p_request_binding ? "replay" : "binding_conflict",
        });
      }
      if (url.endsWith("mws_check_lead_intake_abuse_v1")) {
        calls.limiter += 1;
        return response({ version: 1, allowed: true, decision: "unique_allowed", replay: false, uniqueCounted: true, retryAfterSeconds: 0 });
      }
      if (url.endsWith("mws_create_lead_transactional_v1")) {
        calls.create += 1;
        calls.createPayload = JSON.parse(request.body);
        return response({ status: "resolved", lead: { id: LEAD_ID }, businessEventId: "20000000-0000-4000-8000-000000000001", created: true, duplicate: false, idempotentReplay: false });
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

test("suppress-mode request without smoke authorization fails closed before every downstream operation", async () => {
  const setup = harness();
  const event = smokeEvent();
  delete event.headers[AUTH_HEADER];
  const { result, body } = await invoke(setup, event);
  assert.equal(result.statusCode, 403);
  assert.equal(body.classification, "validationRejected");
  assert.equal(outcomeReason(setup), "SMOKE_AUTH_HEADER_MISSING");
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, timeline: 0, provider: 0 });
  assert.equal(setup.calls.nonce, 0);
});

test("valid authenticated staging smoke keeps canonical storage active without a legacy timeline write while suppressing both Resend deliveries", async () => {
  const setup = harness();
  const { result, body } = await invoke(setup, smokeEvent());
  assert.equal(result.statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.providerSuppressed, true);
  assert.deepEqual(body.suppressedProviders, ["resend"]);
  assert.equal(body.suppressionReason, "staging_smoke");
  assert.equal(body.suppressedDeliveryCount, 2);
  assert.deepEqual({ nonce: setup.calls.nonce, limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { nonce: 1, limiter: 1, create: 1, reconcile: 0, timeline: 0, provider: 0 });
  assert.equal(setup.calls.createPayload.p_lead.environment, "test");
  assert.equal(setup.calls.createPayload.p_lead.metadata.stagingSmoke, true);
  assert.equal(setup.calls.createPayload.p_lead.metadata.suppressionReason, "staging_smoke");
  assert.match(setup.calls.noncePayloads[0].p_nonce_fingerprint, /^[0-9a-f]{64}$/);
  assert.match(setup.calls.noncePayloads[0].p_request_binding, /^[0-9a-f]{64}$/);
  assert.match(setup.calls.noncePayloads[0].p_target_binding, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(setup.calls.noncePayloads), /p0_smoke_nonce|p0-staging-smoke@example|Geautoriseerde staging-smoke/i);
  assert.doesNotMatch(JSON.stringify(setup.calls.logs), new RegExp(`${NONCE}|${SMOKE_SECRET}`));
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
  assert.equal(outcomeReason(setup), "SMOKE_AUTH_SIGNATURE_INVALID");
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, timeline: 0, provider: 0 });
  assert.equal(setup.calls.nonce, 0);
});

test("smoke signature is bound to the exact request body", async () => {
  const setup = harness();
  const event = smokeEvent();
  event.body = JSON.stringify({ ...validPayload, message: "Tampered after signing" });
  const { result } = await invoke(setup, event);
  assert.equal(result.statusCode, 403);
  assert.equal(outcomeReason(setup), "SMOKE_AUTH_BODY_MISMATCH");
  assert.equal(setup.calls.provider, 0);
  assert.equal(setup.calls.create, 0);
  assert.equal(setup.calls.nonce, 0);
});

test("expired smoke authorization is rejected without side effects", async () => {
  const setup = harness();
  const event = smokeEvent(validPayload, { timestamp: NOW_SECONDS - 301 });
  const { result } = await invoke(setup, event);
  assert.equal(result.statusCode, 403);
  assert.equal(outcomeReason(setup), "SMOKE_AUTH_EXPIRED");
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, timeline: 0, provider: 0 });
  assert.equal(setup.calls.nonce, 0);
  assert.equal(setup.calls.nonce, 0);
});

test("identical sequential replay is rejected before every downstream operation", async () => {
  const setup = harness();
  const signed = smokeEvent();
  const first = await invoke(setup, signed);
  const second = await invoke(setup, signed);
  assert.equal(first.result.statusCode, 200);
  assert.equal(second.result.statusCode, 403);
  assert.equal(second.body.classification, "validationRejected");
  assert.equal(outcomeReason(setup), "SMOKE_AUTH_REPLAY");
  assert.doesNotMatch(second.result.body, /nonce|replay|binding/i);
  assert.deepEqual({ nonce: setup.calls.nonce, limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { nonce: 2, limiter: 1, create: 1, reconcile: 0, timeline: 0, provider: 0 });
});

for (const contenderCount of [2, 10]) {
  test(`${contenderCount} concurrent identical requests accept exactly one nonce consumer`, async () => {
    const setup = harness();
    const signed = smokeEvent();
    const outcomes = await Promise.all(Array.from({ length: contenderCount }, () => invoke(setup, signed)));
    assert.equal(outcomes.filter(({ result }) => result.statusCode === 200).length, 1);
    assert.equal(outcomes.filter(({ result }) => result.statusCode === 403).length, contenderCount - 1);
    assert.deepEqual({ nonce: setup.calls.nonce, limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { nonce: contenderCount, limiter: 1, create: 1, reconcile: 0, timeline: 0, provider: 0 });
  });
}

test("same nonce with a newly signed body or timestamp fails as a binding conflict", async () => {
  for (const conflictingEvent of [
    smokeEvent({ ...validPayload, message: "Different but validly signed body" }),
    smokeEvent(validPayload, { timestamp: NOW_SECONDS + 1 }),
  ]) {
    const setup = harness();
    const first = await invoke(setup, smokeEvent());
    const conflict = await invoke(setup, conflictingEvent);
    assert.equal(first.result.statusCode, 200);
    assert.equal(conflict.result.statusCode, 403);
    assert.equal(outcomeReason(setup), "SMOKE_AUTH_BINDING_CONFLICT");
    assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 1, create: 1, reconcile: 0, timeline: 0, provider: 0 });
  }
});

test("nonce RPC timeout, transport failure and malformed response fail closed before downstream calls", async () => {
  for (const options of [
    { nonceError: Object.assign(new Error("private timeout"), { name: "TimeoutError" }) },
    { nonceError: new Error("private transport failure") },
    { nonceResponse: response({ version: 1, consumed: true, decision: "replay" }) },
  ]) {
    const setup = harness(options);
    const { result, body } = await invoke(setup, smokeEvent());
    assert.equal(result.statusCode, 503);
    assert.equal(body.classification, "validationRejected");
    assert.equal(outcomeReason(setup), "SMOKE_AUTH_INTERNAL_FAILURE");
    assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, reconcile: 0, timeline: 0, provider: 0 });
    assert.doesNotMatch(result.body, /timeout|transport|nonce|Supabase/i);
  }
});

test("honeypot stops before smoke authentication and every downstream dependency", async () => {
  const setup = harness({ env: stagingEnv({ P0_STAGING_SMOKE_HMAC_SECRET: "" }) });
  const event = smokeEvent({ ...validPayload, _gotcha: "bot content" });
  event.headers[AUTH_HEADER] = "invalid";
  const { result, body } = await invoke(setup, event);
  assert.equal(result.statusCode, 200);
  assert.equal(body.accepted, false);
  assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, timeline: 0, provider: 0 });
  assert.equal(setup.calls.nonce, 0);
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
      assert.equal(outcomeReason(setup), "SMOKE_TARGET_REFUSED");
      assert.deepEqual({ limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { limiter: 0, create: 0, timeline: 0, provider: 0 });
      assert.equal(setup.calls.nonce, 0);
    }
  }
});

test("unknown suppress configuration and missing staging smoke secret/version fail closed", async () => {
  for (const env of [
    stagingEnv({ OUTBOUND_PROVIDER_MODE: "maybe" }),
    stagingEnv({ P0_STAGING_SMOKE_HMAC_SECRET: "short" }),
    stagingEnv({ P0_STAGING_SMOKE_ROTATION_ID: "" }),
  ]) {
    const setup = harness({ env });
    const { result } = await invoke(setup, smokeEvent());
    assert.equal(result.statusCode, 503);
    assert.equal(setup.calls.create, 0);
    assert.equal(setup.calls.provider, 0);
    assert.equal(setup.calls.nonce, 0);
  }
});

test("smoke authorization is refused when suppression mode is not enabled", async () => {
  const setup = harness({ env: stagingEnv({ OUTBOUND_PROVIDER_MODE: "" }) });
  const { result } = await invoke(setup, smokeEvent());
  assert.equal(result.statusCode, 403);
  assert.equal(setup.calls.create, 0);
  assert.equal(setup.calls.provider, 0);
  assert.equal(setup.calls.nonce, 0);
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
  assert.equal(setup.calls.nonce, 0);
});

test("missing Supabase nonce-consumption configuration fails before network and downstream operations", async () => {
  for (const env of [stagingEnv({ SUPABASE_URL: "" }), stagingEnv({ SUPABASE_SERVICE_ROLE_KEY: "" })]) {
    const setup = harness({ env });
    const { result, body } = await invoke(setup, smokeEvent());
    assert.equal(result.statusCode, 503);
    assert.equal(body.classification, "validationRejected");
    assert.deepEqual({ nonce: setup.calls.nonce, limiter: setup.calls.limiter, create: setup.calls.create, timeline: setup.calls.timeline, provider: setup.calls.provider }, { nonce: 0, limiter: 0, create: 0, timeline: 0, provider: 0 });
  }
});

test("malformed header is classified separately from protocol, timestamp, nonce and signature failures", async () => {
  const cases = [
    { authorization: "malformed", expected: "SMOKE_AUTH_FORMAT_INVALID" },
    { authorization: `v2:${NOW_SECONDS}:${NONCE}:${"0".repeat(64)}`, expected: "SMOKE_AUTH_VERSION_INVALID" },
    { authorization: `v1:not-a-time:${NONCE}:${"0".repeat(64)}`, expected: "SMOKE_AUTH_TIMESTAMP_INVALID" },
    { authorization: `v1:${NOW_SECONDS}:short:${"0".repeat(64)}`, expected: "SMOKE_AUTH_NONCE_INVALID" },
    { authorization: `v1:${NOW_SECONDS}:${NONCE}:not-hex`, expected: "SMOKE_AUTH_FORMAT_INVALID" },
  ];
  for (const { authorization, expected } of cases) {
    const setup = harness();
    const event = smokeEvent();
    event.headers[AUTH_HEADER] = authorization;
    const { result, body } = await invoke(setup, event);
    assert.equal(result.statusCode, 403);
    assert.equal(body.classification, "validationRejected");
    assert.equal(outcomeReason(setup), expected);
    assert.deepEqual({ nonce: setup.calls.nonce, limiter: setup.calls.limiter, create: setup.calls.create, provider: setup.calls.provider }, { nonce: 0, limiter: 0, create: 0, provider: 0 });
  }
});

test("wrong client secret is diagnosed as a secret-version mismatch before body and signature comparison", async () => {
  const setup = harness();
  const event = smokeEvent(validPayload, { secret: OTHER_SMOKE_SECRET });
  const { result, body } = await invoke(setup, event);
  assert.equal(result.statusCode, 403);
  assert.equal(body.classification, "validationRejected");
  assert.equal(outcomeReason(setup), "SMOKE_AUTH_SECRET_VERSION_MISMATCH");
  const details = outcomeDetails(setup);
  assert.equal(details.validationStage, "secretVersion");
  assert.equal(details.secretVersionStatus, "mismatch");
  assert.notEqual(details.secretVersionProof, event.headers[SECRET_PROOF_HEADER]);
  assert.equal(setup.calls.nonce, 0);
});

test("wrong rotation identity is diagnosed before HMAC authorization", async () => {
  const setup = harness();
  const event = smokeEvent(validPayload, { rotationId: "rot_fedcba9876543210fedcba9876543210" });
  const { result } = await invoke(setup, event);
  assert.equal(result.statusCode, 403);
  assert.equal(outcomeReason(setup), "SMOKE_AUTH_SECRET_VERSION_MISMATCH");
  assert.equal(outcomeDetails(setup).rotationId, ROTATION_ID);
  assert.equal(setup.calls.nonce, 0);
});

test("client and server body proofs isolate an exact raw-body mismatch", async () => {
  const setup = harness();
  const event = smokeEvent();
  const clientBodyProof = event.headers[BODY_PROOF_HEADER];
  event.body = `${event.body}\n`;
  const { result } = await invoke(setup, event);
  assert.equal(result.statusCode, 403);
  assert.equal(outcomeReason(setup), "SMOKE_AUTH_BODY_MISMATCH");
  const details = outcomeDetails(setup);
  assert.equal(details.validationStage, "bodyDigest");
  assert.equal(details.bodyStatus, "mismatch");
  assert.notEqual(details.bodyProof, clientBodyProof);
  assert.equal(details.secretVersionProof, event.headers[SECRET_PROOF_HEADER]);
});

test("equal secret and body proofs isolate a final signature mismatch", async () => {
  const setup = harness();
  const event = smokeEvent();
  const parts = event.headers[AUTH_HEADER].split(":");
  parts[3] = `${parts[3][0] === "0" ? "1" : "0"}${parts[3].slice(1)}`;
  event.headers[AUTH_HEADER] = parts.join(":");
  const { result } = await invoke(setup, event);
  assert.equal(result.statusCode, 403);
  assert.equal(outcomeReason(setup), "SMOKE_AUTH_SIGNATURE_INVALID");
  const details = outcomeDetails(setup);
  assert.equal(details.bodyProof, event.headers[BODY_PROOF_HEADER]);
  assert.equal(details.secretVersionProof, event.headers[SECRET_PROOF_HEADER]);
  assert.equal(details.signatureStatus, "mismatch");
});

test("valid request emits matching non-authorizing diagnostics and preserves the functional order", async () => {
  const setup = harness();
  const event = smokeEvent();
  const { result } = await invoke(setup, event);
  assert.equal(result.statusCode, 200);
  const validation = setup.calls.logs.find(([message]) => message === "p0_smoke_auth_validation")?.[1];
  assert.ok(validation);
  assert.equal(validation.rotationId, event.headers[ROTATION_HEADER]);
  assert.equal(validation.secretVersionProof, event.headers[SECRET_PROOF_HEADER]);
  assert.equal(validation.bodyProof, event.headers[BODY_PROOF_HEADER]);
  assert.match(validation.nonceProof, /^[0-9a-f]{32}$/);
  assert.equal(validation.protocolVersion, "v1");
  assert.equal(validation.signedTimestamp, NOW_SECONDS);
  assert.equal(validation.nonceDecision, "consumed");
  assert.deepEqual({ nonce: setup.calls.nonce, limiter: setup.calls.limiter, create: setup.calls.create, reconcile: setup.calls.reconcile, timeline: setup.calls.timeline, provider: setup.calls.provider }, { nonce: 1, limiter: 1, create: 1, reconcile: 0, timeline: 0, provider: 0 });
});

test("case-insensitive headers and Netlify base64 transport preserve the exact decoded raw-body contract", async () => {
  const rawBody = JSON.stringify(validPayload);
  const signed = buildSmokeAuthorization({ rawBody, secret: SMOKE_SECRET, rotationId: ROTATION_ID, timestamp: NOW_SECONDS, nonce: NONCE });
  const uppercaseHeaders = Object.fromEntries(Object.entries(signed.headers).map(([key, value]) => [key.toUpperCase(), value]));
  const setup = harness();
  const { result } = await invoke(setup, {
    httpMethod: "POST",
    headers: { "X-NF-CLIENT-CONNECTION-IP": "203.0.113.42", "USER-AGENT": "P0 staging smoke test", ...uppercaseHeaders },
    body: Buffer.from(rawBody, "utf8").toString("base64"),
    isBase64Encoded: true,
  });
  assert.equal(result.statusCode, 200);
  const validation = setup.calls.logs.find(([message]) => message === "p0_smoke_auth_validation")?.[1];
  assert.equal(validation.bodyProof, signed.evidence.bodyProof);
  assert.equal(validation.secretVersionProof, signed.evidence.secretVersionProof);
});

test("signing base64 transport text instead of decoded raw JSON is identified as a body mismatch", async () => {
  const rawBody = JSON.stringify(validPayload);
  const transportBody = Buffer.from(rawBody, "utf8").toString("base64");
  const incorrectlySigned = buildSmokeAuthorization({ rawBody: transportBody, secret: SMOKE_SECRET, rotationId: ROTATION_ID, timestamp: NOW_SECONDS, nonce: NONCE });
  const setup = harness();
  const { result } = await invoke(setup, {
    httpMethod: "POST",
    headers: { "x-nf-client-connection-ip": "203.0.113.42", "user-agent": "P0 staging smoke test", ...incorrectlySigned.headers },
    body: transportBody,
    isBase64Encoded: true,
  });
  assert.equal(result.statusCode, 403);
  assert.equal(outcomeReason(setup), "SMOKE_AUTH_BODY_MISMATCH");
});

test("public failures stay generic while internal categories remain exact", async () => {
  for (const mutate of [
    (event) => { event.headers[AUTH_HEADER] = "malformed"; },
    (event) => { event.body = `${event.body} `; },
    (event) => { event.headers[SECRET_PROOF_HEADER] = "0".repeat(32); },
  ]) {
    const setup = harness();
    const event = smokeEvent();
    mutate(event);
    const { result, body } = await invoke(setup, event);
    assert.equal(result.statusCode, 403);
    assert.equal(body.error, "Staging-smokeverificatie geweigerd.");
    assert.equal(body.classification, "validationRejected");
    assert.doesNotMatch(result.body, /SMOKE_|signature|nonce|secret|digest|rotation/i);
    assert.match(outcomeReason(setup), /^SMOKE_[A-Z0-9_]+$/);
  }
});

test("safe diagnostics contain no secret, authorization, plaintext nonce, raw body, PII or network identity", async () => {
  for (const event of [smokeEvent(), smokeEvent(validPayload, { secret: OTHER_SMOKE_SECRET })]) {
    const setup = harness();
    await invoke(setup, event);
    const logs = JSON.stringify(setup.calls.logs);
    for (const forbidden of [
      SMOKE_SECRET,
      OTHER_SMOKE_SECRET,
      event.headers[AUTH_HEADER],
      NONCE,
      event.body,
      validPayload.name,
      validPayload.email,
      validPayload.phone,
      validPayload.company,
      validPayload.message,
      "203.0.113.42",
    ]) assert.doesNotMatch(logs, new RegExp(escapeRegExp(forbidden), "i"));
    assert.doesNotMatch(logs, /[0-9a-f]{64}/i);
  }
});

function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value };
}

function outcomeReason(setup) {
  return setup.calls.logs.filter(([message]) => message === "lead_intake_outcome").at(-1)?.[1]?.reason;
}

function outcomeDetails(setup) {
  return setup.calls.logs.filter(([message]) => message === "lead_intake_outcome").at(-1)?.[1] || {};
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
