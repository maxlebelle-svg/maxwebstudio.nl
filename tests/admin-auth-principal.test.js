const test = require("node:test");
const assert = require("node:assert/strict");

const auth = require("../functions/_admin-auth");

const originalEnv = {
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  ALLOW_LEGACY_ADMIN_TOKEN: process.env.ALLOW_LEGACY_ADMIN_TOKEN,
  APP_ENV: process.env.APP_ENV,
  APP_ENVIRONMENT: process.env.APP_ENVIRONMENT,
  CONTEXT: process.env.CONTEXT,
  NETLIFY_ENV: process.env.NETLIFY_ENV,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const originalFetch = global.fetch;
const originalWarn = console.warn;

test.afterEach(() => {
  global.fetch = originalFetch;
  console.warn = originalWarn;
  restoreEnvironment();
});

test("legacy auth returns the uniform admin principal", async () => {
  configureLegacyAuth();

  const result = await auth.verifyAdmin(event("legacy-admin-fixture"), jsonResponse);

  assert.deepEqual(result, {
    success: true,
    source: "legacy_admin_token",
    admin: {
      id: "system:legacy-admin-token",
      role: "super_admin",
      status: "active",
    },
  });
  assert.equal(JSON.stringify(result).includes(process.env.ADMIN_TOKEN), false);
});

test("Supabase auth returns the same principal structure", async () => {
  configureSupabaseAuth();
  global.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return response(200, { id: "10000000-0000-4000-8000-000000000001", email: "admin@example.test" });
    }
    if (String(url).includes("/rest/v1/profiles?")) {
      return response(200, [{ id: "20000000-0000-4000-8000-000000000001", role: "admin", status: "active" }]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await auth.verifyAdmin(event("supabase-session-fixture"), jsonResponse);

  assert.equal(result.success, true);
  assert.equal(result.source, "supabase_admin_session");
  assert.deepEqual(
    { id: result.admin.id, role: result.admin.role, status: result.admin.status },
    { id: "10000000-0000-4000-8000-000000000001", role: "admin", status: "active" },
  );
});

test("wrong legacy token remains HTTP 401 and is never exposed", async () => {
  configureLegacyAuth();
  global.fetch = async () => response(401, { message: "invalid token" });
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  const result = await auth.verifyAdmin(event("wrong-legacy-token"), jsonResponse);

  assert.equal(result.success, false);
  assert.equal(result.response.statusCode, 401);
  assert.equal(result.response.body.includes("wrong-legacy-token"), false);
  assert.equal(result.response.body.includes(process.env.ADMIN_TOKEN), false);
  assert.equal(JSON.stringify(warnings).includes(process.env.ADMIN_TOKEN), false);
});

test("legacy token stays blocked when production policy requires it", async () => {
  configureLegacyAuth();
  process.env.ALLOW_LEGACY_ADMIN_TOKEN = "false";
  process.env.CONTEXT = "production";
  global.fetch = async () => response(401, { message: "not a Supabase session" });

  const result = await auth.verifyAdmin(event(process.env.ADMIN_TOKEN), jsonResponse);

  assert.equal(auth.legacyAdminTokenAllowed(), false);
  assert.equal(result.success, false);
  assert.equal(result.response.statusCode, 401);
});

test("missing Supabase principal never grants silent access", async () => {
  configureSupabaseAuth();
  global.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return response(200, { id: "10000000-0000-4000-8000-000000000001", email: "admin@example.test" });
    }
    if (String(url).includes("/rest/v1/profiles?")) return response(200, []);
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await auth.verifyAdmin(event("supabase-session-fixture"), jsonResponse);

  assert.equal(result.success, false);
  assert.equal(result.response.statusCode, 401);
});

function configureLegacyAuth() {
  process.env.ADMIN_TOKEN = "legacy-admin-fixture";
  process.env.ALLOW_LEGACY_ADMIN_TOKEN = "true";
  process.env.APP_ENV = "test";
  process.env.APP_ENVIRONMENT = "test";
  delete process.env.CONTEXT;
  delete process.env.NETLIFY_ENV;
  process.env.SUPABASE_URL = "https://staging.example.test";
  process.env.SUPABASE_ANON_KEY = "anon-fixture";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-fixture";
}

function configureSupabaseAuth() {
  configureLegacyAuth();
  process.env.ADMIN_TOKEN = "different-legacy-token";
}

function restoreEnvironment() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function event(bearer = "") {
  return {
    httpMethod: "GET",
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  };
}

function jsonResponse(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
