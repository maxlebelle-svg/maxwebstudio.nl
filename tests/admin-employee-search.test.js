const test = require("node:test");
const assert = require("node:assert/strict");
const { handler, _test } = require("../functions/admin-employee-search");

const ACTOR = "11111111-1111-4111-8111-111111111111";
const ACTOR_PROFILE = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE_AUTH = "44444444-4444-4444-8444-444444444444";

test("employee search requires a bearer and rejects non-super-admin with 403", async () => {
  assert.equal((await handler(event("", {}))).statusCode, 401);
  await withBackend("admin", async () => {
    const result = await handler(event());
    assert.equal(result.statusCode, 403);
    assert.equal(JSON.parse(result.body).code, "SUPER_ADMIN_REQUIRED");
  });
});

test("employee search returns at most minimal active internal employees", async () => withBackend("super_admin", async () => {
  const result = await handler(event());
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.results.length, 2);
  assert.deepEqual(body.results.map((row) => row.name), ["Lisanne Post", "Max Le Belle"]);
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /private@example|0612345678|secret|metadata|token/i);
  assert(body.results.every((row) => ["super_admin", "sales_partner"].includes(row.role) && row.status === "active"));
}));

test("employee search excludes customer, demo, inactive and service accounts", () => {
  const base = { id: EMPLOYEE, auth_user_id: EMPLOYEE_AUTH, name: "Lisanne", role: "sales_partner", status: "active", email: "lisanne@example.test" };
  assert(_test.mapEmployee(base));
  assert.equal(_test.mapEmployee({ ...base, role: "customer" }), null);
  assert.equal(_test.mapEmployee({ ...base, role: "demo_user" }), null);
  assert.equal(_test.mapEmployee({ ...base, status: "inactive" }), null);
  assert.equal(_test.mapEmployee({ ...base, serviceAccount: "true" }), null);
  assert.equal(_test.mapEmployee({ ...base, email: "service@example.test" }), null);
});

test("employee id lookup is revalidated and exposes actor/viewed distinction", async () => withBackend("super_admin", async () => {
  const result = await handler(event("token", { id: EMPLOYEE }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.employee.id, EMPLOYEE);
  assert.deepEqual(body.perspective, { actorProfileId: ACTOR_PROFILE, viewedProfileId: EMPLOYEE, perspectiveActive: true });
}));

test("employee search clamps result limit to twenty and rejects malformed ids", async () => withBackend("super_admin", async (state) => {
  const malformed = await handler(event("token", { id: "not-a-uuid" }));
  assert.equal(malformed.statusCode, 400);
  await handler(event("token", { q: "li", limit: "500" }));
  const searchUrl = state.urls.find((url) => url.includes("avatarUrl"));
  assert.equal(new URL(searchUrl).searchParams.get("limit"), "20");
}));

async function withBackend(role, callback) {
  const previousFetch = global.fetch;
  const previousEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  const state = { urls: [] };
  global.fetch = async (url) => {
    const value = String(url); state.urls.push(value);
    if (value.includes("/auth/v1/user")) return response(200, { id: ACTOR, email: "max@example.test" });
    if (value.includes("/rest/v1/profiles") && value.includes("auth_user_id=eq.")) return response(200, [{ id: ACTOR_PROFILE, role, status: "active" }]);
    if (value.includes("/rest/v1/profiles")) return response(200, [
      { id: EMPLOYEE, auth_user_id: EMPLOYEE_AUTH, name: "Lisanne Post", role: "sales_partner", status: "active", email: "lisanne@example.test", avatarUrl: "https://cdn.example.test/lisanne.jpg", team: "Sales" },
      { id: ACTOR_PROFILE, auth_user_id: ACTOR, name: "Max Le Belle", role: "super_admin", status: "active", email: "max@example.test" },
      { id: "55555555-5555-4555-8555-555555555555", auth_user_id: "66666666-6666-4666-8666-666666666666", name: "Klant", role: "customer", status: "active", email: "private@example.test", phone: "0612345678", metadata: { secret: "secret" } },
      { id: "77777777-7777-4777-8777-777777777777", auth_user_id: "88888888-8888-4888-8888-888888888888", name: "Bot", role: "developer", status: "active", email: "service@example.test", serviceAccount: "true" },
    ]);
    return response(404, {});
  };
  try { return await callback(state); }
  finally { global.fetch = previousFetch; Object.entries(previousEnv).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; }); }
}

function event(bearer = "token", queryStringParameters = {}) { return { httpMethod: "GET", headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, queryStringParameters }; }
function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
