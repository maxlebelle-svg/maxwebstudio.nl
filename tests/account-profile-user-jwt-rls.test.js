"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { handler } = require("../functions/account-profile");

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";

function event(overrides = {}) {
  return {
    httpMethod: "GET",
    headers: { authorization: "Bearer user-session-jwt" },
    queryStringParameters: { auth_user_id: OTHER_USER_ID, role: "super_admin" },
    body: JSON.stringify({ auth_user_id: OTHER_USER_ID, role: "super_admin" }),
    ...overrides,
  };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

async function withBackend({ authStatus = 200, authBody, profileRows, serviceRoleKey, role = "super_admin", status = "active" } = {}, callback) {
  const previousFetch = global.fetch;
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = "https://project-ref.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-publishable-key";
  if (serviceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/auth/v1/user")) {
      return response(authStatus, authBody || { id: AUTH_USER_ID, email: "safe@example.test" });
    }
    return response(200, profileRows === undefined ? [{
      id: PROFILE_ID,
      auth_user_id: AUTH_USER_ID,
      name: "Safe Admin",
      email: "safe@example.test",
      role,
      status,
      metadata: {},
    }] : profileRows);
  };

  try { return await callback({ calls }); }
  finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("super_admin profile succeeds without a service-role key and uses user-JWT RLS", async () => {
  await withBackend({}, async ({ calls }) => {
    const result = await handler(event());
    assert.equal(result.statusCode, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.headers.apikey, "anon-publishable-key");
    assert.equal(calls[0].options.headers.Authorization, "Bearer user-session-jwt");
    assert.equal(calls[1].options.headers.apikey, "anon-publishable-key");
    assert.equal(calls[1].options.headers.Authorization, "Bearer user-session-jwt");
    assert.match(calls[1].url, new RegExp(`auth_user_id=eq\\.${AUTH_USER_ID}`));
    assert.doesNotMatch(calls[1].url, new RegExp(OTHER_USER_ID));
  });
});

test("client-controlled profile selectors are ignored and another profile cannot be selected", async () => {
  await withBackend({ profileRows: [] }, async ({ calls }) => {
    const result = await handler(event());
    assert.equal(result.statusCode, 404);
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, new RegExp(AUTH_USER_ID));
    assert.doesNotMatch(calls[1].url, new RegExp(OTHER_USER_ID));
  });
});

test("missing and invalid user JWTs fail closed before profile access", async () => {
  await withBackend({}, async ({ calls }) => {
    const missing = await handler(event({ headers: {} }));
    assert.equal(missing.statusCode, 401);
    assert.equal(calls.length, 0);
  });
  await withBackend({ authStatus: 401, authBody: { message: "expired" } }, async ({ calls }) => {
    const invalid = await handler(event());
    assert.equal(invalid.statusCode, 401);
    assert.equal(calls.length, 1);
  });
});

test("sales_partner without a service-role key remains fail-closed at the partner gate", async () => {
  await withBackend({ role: "sales_partner" }, async () => {
    const result = await handler(event());
    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(body.access.operational, false);
    assert.equal(body.access.onboardingRequired, true);
    assert.equal(body.access.reason, "gate_configuration_missing");
  });
});
