"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { _test } = require("../functions/admin-commercial-postgrest-preflight");

const secret = "server-only-secret-value";
const now = () => new Date("2026-08-01T12:00:00.000Z");
const event = { httpMethod: "GET", headers: { authorization: "Bearer browser-session" }, queryStringParameters: { resource: "leads", limit: "100" } };

function response(status, onBodyRead = () => {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { onBodyRead(); throw new Error("response body must not be read"); },
    text: async () => { onBodyRead(); throw new Error("response body must not be read"); },
  };
}

function setup(overrides = {}) {
  const calls = [];
  const logs = [];
  const handler = _test.createHandler({
    verifyAdmin: async (_event, _json, options) => {
      assert.deepEqual(options.allowedRoles, ["super_admin"]);
      assert.equal(options.disableLegacyToken, true);
      return { success: true, admin: { profileId: "profile-safe-id", role: "super_admin", status: "active" } };
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return response(200);
    },
    env: { SUPABASE_URL: "https://project-ref.supabase.co", SUPABASE_ANON_KEY: "anon-publishable-key" },
    now,
    consumeRateLimit: () => true,
    logger: { info: (...args) => logs.push(args) },
    ...overrides,
  });
  return { handler, calls, logs };
}

test("route performs exactly the two fixed GET limit=0 probes and returns metadata only", async () => {
  const { handler, calls, logs } = setup();
  const result = await handler(event);
  assert.equal(result.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.url), [
    "https://project-ref.supabase.co/rest/v1/profiles?select=id&limit=0",
    "https://project-ref.supabase.co/rest/v1/customers?select=id&limit=0",
  ]);
  for (const call of calls) assert.equal(call.options.method, "GET");
  for (const call of calls) {
    assert.equal(call.options.headers.apikey, "anon-publishable-key");
    assert.equal(call.options.headers.Authorization, "Bearer browser-session");
  }
  assert.deepEqual(JSON.parse(result.body), {
    probes: [
      { resource: "profiles", httpStatus: 200, errorCode: "", resultCategory: "healthy" },
      { resource: "customers", httpStatus: 200, errorCode: "", resultCategory: "healthy" },
    ],
  });
  assert.equal(logs.length, 1);
  const serialized = JSON.stringify({ body: result.body, logs });
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("browser-session"), false);
  assert.equal(serialized.includes("responsebody"), false);
});

test("query input cannot alter the fixed resource set or limit", async () => {
  const { handler, calls } = setup();
  await handler({ ...event, queryStringParameters: { resource: "auth.users", limit: "1000", rpc: "danger" } });
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), ["/rest/v1/profiles", "/rest/v1/customers"]);
  assert.deepEqual(calls.map((call) => new URL(call.url).search), ["?select=id&limit=0", "?select=id&limit=0"]);
});

test("a non-super-admin authorization result stops before all probes", async () => {
  let fetched = 0;
  const { handler } = setup({
    verifyAdmin: async (_event, _json, options) => {
      assert.deepEqual(options.allowedRoles, ["super_admin"]);
      return { success: false, response: { statusCode: 403, body: "denied" } };
    },
    fetch: async () => { fetched += 1; return response(200); },
  });
  const result = await handler(event);
  assert.equal(result.statusCode, 403);
  assert.equal(fetched, 0);
});

test("unsupported method and rate limit fail closed without probes", async () => {
  const first = setup();
  assert.equal((await first.handler({ ...event, httpMethod: "POST" })).statusCode, 405);
  assert.equal(first.calls.length, 0);

  const limited = setup({ consumeRateLimit: () => false });
  const result = await limited.handler(event);
  assert.equal(result.statusCode, 429);
  assert.equal(result.headers["Retry-After"], "60");
  assert.equal(limited.calls.length, 0);
});

test("errors expose only status-derived safe codes without reading response bodies", async () => {
  const seen = [];
  let bodyReads = 0;
  const { handler } = setup({
    fetch: async (url) => {
      seen.push(url);
      return url.includes("profiles") ? response(404, () => { bodyReads += 1; }) : response(403, () => { bodyReads += 1; });
    },
  });
  const result = await handler(event);
  assert.equal(result.statusCode, 502);
  assert.equal(seen.length, 2);
  assert.deepEqual(JSON.parse(result.body), {
    probes: [
      { resource: "profiles", httpStatus: 404, errorCode: "POSTGREST_RESOURCE_UNAVAILABLE", resultCategory: "schema_unavailable" },
      { resource: "customers", httpStatus: 403, errorCode: "POSTGREST_AUTHORIZATION_FAILED", resultCategory: "authorization_failed" },
    ],
  });
  assert.equal(bodyReads, 0);
});

test("missing configuration and transport failures are fail-closed and secret-free", async () => {
  const missing = setup({ env: {} });
  assert.equal((await missing.handler(event)).statusCode, 500);
  assert.equal(missing.calls.length, 0);

  const failed = setup({ fetch: async () => { throw new Error(secret); } });
  const result = await failed.handler(event);
  assert.equal(result.statusCode, 502);
  assert.equal(result.body.includes(secret), false);
  assert.deepEqual(JSON.parse(result.body).probes.map((probe) => probe.errorCode), ["POSTGREST_REQUEST_FAILED", "POSTGREST_REQUEST_FAILED"]);
});

test("the preflight implementation has no service-role dependency", () => {
  const source = require("node:fs").readFileSync(require.resolve("../functions/admin-commercial-postgrest-preflight"), "utf8");
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/);
});
