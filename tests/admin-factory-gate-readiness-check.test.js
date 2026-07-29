const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const diagnostic = require("../functions/admin-factory-gate-diagnostic");
const readinessCheck = require("../functions/admin-factory-gate-readiness-check");

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;
const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";

function stagingEnv(overrides = {}) {
  return {
    SUPABASE_URL: "https://xlxpuuycigeqhgxqtzni.supabase.co",
    SUPABASE_ANON_KEY: "test-only-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-only-service-role-key",
    SITE_ID: "67b2b8af-83fc-4c61-9cd8-2f78842b7615",
    SITE_NAME: "maxwebstudio-staging",
    URL: "https://maxwebstudio-staging.netlify.app",
    CONTEXT: "production",
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    httpMethod: "GET",
    headers: {
      host: "maxwebstudio-staging.netlify.app",
      authorization: "Bearer test-only-admin-session",
    },
    ...overrides,
  };
}

function response(status, payload = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function authenticatedFetch(role, gateResponses = []) {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/auth/v1/user")) return response(200, { id: AUTH_USER_ID, email: "admin@example.test" });
    if (String(url).includes("/rest/v1/profiles")) return response(200, [{ id: PROFILE_ID, auth_user_id: AUTH_USER_ID, role, status: "active" }]);
    return gateResponses.shift() || response(200);
  };
  return calls;
}

test.beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ...stagingEnv() };
  global.fetch = ORIGINAL_FETCH;
});

test.after(() => {
  process.env = ORIGINAL_ENV;
  global.fetch = ORIGINAL_FETCH;
});

test("neutral readiness entrypoint delegates to the exact diagnostic handler without added behavior", () => {
  assert.equal(readinessCheck.handler, diagnostic.handler);

  const source = fs.readFileSync(path.join(__dirname, "../functions/admin-factory-gate-readiness-check.js"), "utf8");
  assert.doesNotMatch(source, /\b(?:fetch|POST|PUT|PATCH|DELETE|INSERT|UPDATE|UPSERT)\b/i);
  assert.match(source, /exports\.handler = diagnostic\.handler/);
});

test("anonymous access remains denied before auth or Gate probes", async () => {
  let called = false;
  global.fetch = async () => { called = true; return response(500); };

  const result = await readinessCheck.handler(event({ headers: { host: "maxwebstudio-staging.netlify.app" } }));

  assert.equal(result.statusCode, 401);
  assert.equal(called, false);
});

test("non-superadmin roles remain denied", async () => {
  for (const role of ["admin", "developer"]) {
    authenticatedFetch(role);
    const result = await readinessCheck.handler(event());
    assert.equal(result.statusCode, 401);
    assert.deepEqual(JSON.parse(result.body), { success: false, error: "Niet geautoriseerd." });
  }
});

test("production identity remains denied before authentication", async () => {
  process.env = { ...ORIGINAL_ENV, ...stagingEnv({
    SITE_ID: "production-site-id",
    SITE_NAME: "maxwebstudio",
    URL: "https://maxwebstudio.nl",
    SUPABASE_URL: "https://production.supabase.co",
  }) };
  let called = false;
  global.fetch = async () => { called = true; return response(500); };

  const result = await readinessCheck.handler(event({ headers: { host: "maxwebstudio.nl" } }));

  assert.equal(result.statusCode, 404);
  assert.equal(called, false);
});

test("wrong site, host or Supabase project remains denied before authentication", async () => {
  for (const setup of [
    { request: event(), env: stagingEnv({ SITE_ID: "wrong-site" }) },
    { request: event(), env: stagingEnv({ SITE_NAME: "wrong-name" }) },
    { request: event({ headers: { host: "maxwebstudio-staging.netlify.app.evil.example" } }), env: stagingEnv() },
    { request: event(), env: stagingEnv({ URL: "https://maxwebstudio.nl" }) },
    { request: event(), env: stagingEnv({ SUPABASE_URL: "https://wrong-project.supabase.co" }) },
  ]) {
    process.env = { ...ORIGINAL_ENV, ...setup.env };
    let called = false;
    global.fetch = async () => { called = true; return response(500); };
    const result = await readinessCheck.handler(setup.request);
    assert.equal(result.statusCode, 404);
    assert.equal(called, false);
  }
});

test("unsupported methods remain denied without side effects", async () => {
  let called = false;
  global.fetch = async () => { called = true; return response(500); };

  const result = await readinessCheck.handler(event({ httpMethod: "POST", body: "{}" }));

  assert.equal(result.statusCode, 405);
  assert.equal(called, false);
});

test("authorized alias probes only the two allowlisted resources with read-only GET requests", async () => {
  const calls = authenticatedFetch("super_admin", [response(200), response(403, { code: "42501" })]);

  const result = await readinessCheck.handler(event());
  const body = JSON.parse(result.body);
  const gateCalls = calls.slice(2);

  assert.equal(result.statusCode, 200);
  assert.deepEqual(body.results.map((item) => item.resource), ["factory_gate_checks", "factory_gate_overrides"]);
  assert.deepEqual(body.results.map((item) => item.category), ["reachable", "permission_denied"]);
  assert.equal(gateCalls.length, 2);
  assert(gateCalls.every((call) => call.options.method === "GET"));
  assert(gateCalls.every((call) => call.options.body === undefined));
  assert(gateCalls.every((call) => /\?select=id&limit=0$/.test(call.url)));
});
