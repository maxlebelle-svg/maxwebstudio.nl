const assert = require("node:assert/strict");
const test = require("node:test");

const diagnostic = require("../functions/admin-factory-gate-diagnostic");

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;
const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const SECRET = "test-only-service-role-secret";

function stagingEnv(overrides = {}) {
  return {
    SUPABASE_URL: "https://xlxpuuycigeqhgxqtzni.supabase.co",
    SUPABASE_ANON_KEY: "test-only-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: SECRET,
    SITE_ID: "67b2b8af-83fc-4c61-9cd8-2f78842b7615",
    BRANCH: "codex/factory-hub-staging-certification",
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
    const next = gateResponses.shift();
    if (next instanceof Error) throw next;
    return next || response(200);
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

test("anon, admin and developer are refused while active super_admin is admitted", async () => {
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; return response(500); };
  const anonResult = await diagnostic.handler(event({ headers: { host: "maxwebstudio-staging.netlify.app" } }));
  assert.equal(anonResult.statusCode, 401);
  assert.equal(fetchCalls, 0);

  for (const role of ["admin", "developer"]) {
    authenticatedFetch(role);
    const denied = await diagnostic.handler(event());
    assert.equal(denied.statusCode, 401);
    assert.deepEqual(JSON.parse(denied.body), { success: false, error: "Niet geautoriseerd." });
  }

  const calls = authenticatedFetch("super_admin", [response(200), response(200)]);
  const admitted = await diagnostic.handler(event());
  assert.equal(admitted.statusCode, 200);
  assert.equal(calls.length, 4);
});

test("production host, wrong site, branch or Supabase target fail before authentication", async () => {
  for (const setup of [
    { request: event({ headers: { host: "maxwebstudio.nl" } }), env: stagingEnv() },
    { request: event(), env: stagingEnv({ SITE_ID: "production-site" }) },
    { request: event(), env: stagingEnv({ BRANCH: "main" }) },
    { request: event(), env: stagingEnv({ SUPABASE_URL: "https://production.supabase.co" }) },
  ]) {
    process.env = { ...ORIGINAL_ENV, ...setup.env };
    let called = false;
    global.fetch = async () => { called = true; return response(500); };
    const result = await diagnostic.handler(setup.request);
    assert.equal(result.statusCode, 404);
    assert.equal(called, false);
  }
});

test("only the two allowlisted resources receive separate read-only limit=0 requests", async () => {
  const calls = authenticatedFetch("super_admin", [response(200), response(403, { code: "42501" })]);
  const result = await diagnostic.handler(event());
  const body = JSON.parse(result.body);
  const gateCalls = calls.slice(2);

  assert.equal(result.statusCode, 200);
  assert.deepEqual(body.results.map((item) => item.resource), ["factory_gate_checks", "factory_gate_overrides"]);
  assert.deepEqual(body.results.map((item) => item.category), ["reachable", "permission_denied"]);
  assert.equal(gateCalls.length, 2);
  assert.match(gateCalls[0].url, /\/factory_gate_checks\?select=id&limit=0$/);
  assert.match(gateCalls[1].url, /\/factory_gate_overrides\?select=id&limit=0$/);
  assert(gateCalls.every((call) => call.options.method === "GET"));
  assert(gateCalls.every((call) => call.options.body === undefined));
});

test("the second Gate request does not start before the first one has completed", async () => {
  let releaseFirst;
  let gateCallCount = 0;
  const firstGateResponse = new Promise((resolve) => { releaseFirst = () => resolve(response(200)); });
  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) return response(200, { id: AUTH_USER_ID, email: "admin@example.test" });
    if (String(url).includes("/rest/v1/profiles")) return response(200, [{ id: PROFILE_ID, auth_user_id: AUTH_USER_ID, role: "super_admin", status: "active" }]);
    gateCallCount += 1;
    return gateCallCount === 1 ? firstGateResponse : response(200);
  };

  const pending = diagnostic.handler(event());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gateCallCount, 1);
  releaseFirst();
  const result = await pending;
  assert.equal(result.statusCode, 200);
  assert.equal(gateCallCount, 2);
});

test("response is fixed-shape, no-store and excludes database data, errors and secrets", async () => {
  const unsafeText = `database-row-${SECRET}`;
  authenticatedFetch("super_admin", [
    response(404, { code: "PGRST205", message: unsafeText, details: unsafeText, hint: unsafeText }),
    new Error(unsafeText),
  ]);
  const originalConsole = { error: console.error, log: console.log, warn: console.warn };
  const logged = [];
  console.error = console.log = console.warn = (...values) => logged.push(values.join(" "));
  let result;
  try {
    result = await diagnostic.handler(event());
  } finally {
    console.error = originalConsole.error;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
  }
  const serialized = result.body;
  const body = JSON.parse(serialized);
  const allowedKeys = ["category", "httpStatus", "postgrestCode", "resource", "serviceRoleConfigured", "stagingTargetConfirmed"];

  assert.equal(result.headers["Cache-Control"], "no-store, max-age=0, must-revalidate");
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes("database-row"), false);
  assert.equal(logged.join(" ").includes(SECRET), false);
  assert.equal(logged.join(" ").includes("database-row"), false);
  assert.deepEqual(Object.keys(body.results[0]).sort(), allowedKeys);
  assert.deepEqual(Object.keys(body.results[1]).sort(), allowedKeys);
  assert.deepEqual(body.results[0], {
    httpStatus: 404,
    postgrestCode: "PGRST205",
    resource: "factory_gate_checks",
    category: "resource_missing",
    serviceRoleConfigured: true,
    stagingTargetConfirmed: true,
  });
  assert.equal(body.results[1].httpStatus, null);
  assert.equal(body.results[1].postgrestCode, null);
  assert.equal(body.results[1].category, "network_failure");
});

test("unsafe upstream codes are suppressed and methods other than GET cannot probe", async () => {
  authenticatedFetch("super_admin", [response(500, { code: `UNSAFE-${SECRET}` }), response(200)]);
  const result = await diagnostic.handler(event());
  assert.equal(JSON.parse(result.body).results[0].postgrestCode, null);
  assert.equal(JSON.parse(result.body).results[0].category, "unknown_safe_error");

  let called = false;
  global.fetch = async () => { called = true; return response(500); };
  const rejected = await diagnostic.handler(event({ httpMethod: "POST", body: "{}" }));
  assert.equal(rejected.statusCode, 405);
  assert.equal(called, false);
});
