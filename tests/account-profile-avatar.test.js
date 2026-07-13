const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../functions/account-profile");

test("account profile returns real safe avatar data without exposing metadata", async () => withBackend("https://cdn.example.test/max.jpg", async () => {
  const result = await handler(event());
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.profile.name, "Max Le Belle");
  assert.equal(body.profile.role, "super_admin");
  assert.equal(body.profile.avatarUrl, "https://cdn.example.test/max.jpg");
  assert.doesNotMatch(JSON.stringify(body), /privateNote|metadata/);
}));

test("account profile rejects unsafe avatar protocols", async () => withBackend("javascript:alert(1)", async () => {
  const body = JSON.parse((await handler(event())).body);
  assert.equal(body.profile.avatarUrl, null);
}));

async function withBackend(avatarUrl, callback) {
  const previousFetch = global.fetch;
  const previousEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_ANON_KEY = "anon"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  global.fetch = async (url) => String(url).includes("/auth/v1/user")
    ? response(200, { id: "11111111-1111-4111-8111-111111111111", email: "max@example.test" })
    : response(200, [{ id: "22222222-2222-4222-8222-222222222222", auth_user_id: "11111111-1111-4111-8111-111111111111", name: "Max Le Belle", email: "max@example.test", role: "super_admin", status: "active", metadata: { avatarUrl, privateNote: "never expose" } }]);
  try { return await callback(); }
  finally { global.fetch = previousFetch; Object.entries(previousEnv).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; }); }
}
function event() { return { httpMethod: "GET", headers: { authorization: "Bearer real-token" } }; }
function response(status, body) { return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }; }
