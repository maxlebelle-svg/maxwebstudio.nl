const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHandler,
  leadRpcPayload,
  resolveRuntimeEnvironment,
} = require("../functions/send-lead")._private;

const lead = Object.freeze({
  name: "P0 Runtime Environment",
  requestId: "lead-p0-runtime-environment-1",
  company: "P0 Runtime Environment",
  email: "p0-runtime-environment@example.test",
  phone: "+31600000000",
  packageInterest: "Business Website",
  carePackage: "Nog geen keuze",
  termsAccepted: true,
  message: "Gerichte runtime-environmenttest.",
  source: "homepage-contact-form",
  submittedAt: "2026-07-22T12:00:00.000Z",
});

for (const [name, env, expected] of [
  ["production via APP_ENVIRONMENT", { APP_ENVIRONMENT: "production" }, "production"],
  ["production via APP_ENV fallback", { APP_ENV: "production" }, "production"],
  ["matching production values", { APP_ENVIRONMENT: "production", APP_ENV: "production" }, "production"],
  ["matching test values", { APP_ENVIRONMENT: "test", APP_ENV: "test" }, "test"],
  ["demo", { APP_ENVIRONMENT: "demo" }, "demo"],
]) {
  test(name, () => assert.equal(resolveRuntimeEnvironment(env), expected));
}

for (const [name, env, code] of [
  ["conflicting values fail closed", { APP_ENVIRONMENT: "production", APP_ENV: "test" }, "RUNTIME_ENVIRONMENT_CONFLICT"],
  ["empty values fail closed", { APP_ENVIRONMENT: "", APP_ENV: "" }, "RUNTIME_ENVIRONMENT_MISSING"],
  ["unknown value fails closed", { APP_ENVIRONMENT: "preview" }, "RUNTIME_ENVIRONMENT_INVALID"],
  ["CONTEXT alone is not authoritative", { CONTEXT: "production" }, "RUNTIME_ENVIRONMENT_MISSING"],
]) {
  test(name, () => assert.throws(() => resolveRuntimeEnvironment(env), (error) => error.code === code));
}

test("suppress mode always resolves to test regardless of normal runtime values", () => {
  assert.equal(resolveRuntimeEnvironment({}, { suppressProviders: true }), "test");
  assert.equal(resolveRuntimeEnvironment({ APP_ENVIRONMENT: "production", APP_ENV: "test" }, { suppressProviders: true }), "test");
});

test("normal production intake payload carries production", () => {
  const payload = leadRpcPayload(lead, { APP_ENVIRONMENT: "production", APP_ENV: "production" });
  assert.equal(payload.environment, "production");
});

test("invalid runtime configuration stops before limiter, storage and providers", async () => {
  let networkCalls = 0;
  let providerCalls = 0;
  const logs = [];
  const handler = createHandler({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
      LEAD_ABUSE_HMAC_SECRET: "lead-abuse-secret-with-more-than-32-bytes",
      APP_ENVIRONMENT: "production",
      APP_ENV: "test",
    },
    fetchImpl: async () => { networkCalls += 1; throw new Error("must not run"); },
    sendEmail: async () => { providerCalls += 1; throw new Error("must not run"); },
    createRequestReference: () => "000000000000000000000000",
    logger: { info: (...args) => logs.push(args) },
  });

  const result = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({
    id: lead.requestId,
    createdAt: lead.submittedAt,
    source: lead.source,
    name: lead.name,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    packageInterest: lead.packageInterest,
    carePackage: lead.carePackage,
    termsAccepted: lead.termsAccepted,
    message: lead.message,
    _gotcha: "",
  }) });

  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.body).classification, "validationRejected");
  assert.equal(networkCalls, 0);
  assert.equal(providerCalls, 0);
  assert.equal(logs.at(-1)[1].reason, "RUNTIME_ENVIRONMENT_CONFLICT");
  assert.doesNotMatch(JSON.stringify(logs), /production|test/);
});
