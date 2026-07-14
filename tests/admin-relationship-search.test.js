const test = require("node:test");
const assert = require("node:assert/strict");
const { handler, _test } = require("../functions/admin-relationship-search");

const ACTOR = "11111111-1111-4111-8111-111111111111";
const PROFILE = "22222222-2222-4222-8222-222222222222";

test("relationship search requires a real admin bearer", async () => {
  const result = await handler(event({ q: "acme" }, ""));
  assert.equal(result.statusCode, 401);
});

test("super_admin receives bounded minimal lead and customer results", async () => withBackend("super_admin", async ({ urls }) => {
  const result = await handler(event({ q: "acme", type: "all", limit: "20" }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(body.results.map((row) => row.entityType).sort(), ["customer", "lead", "lead"]);
  assert(body.results.every((row) => row.relationshipType === row.entityType && row.relationshipId === row.id));
  assert(body.results.every((row) => row.entityType === "lead" ? row.leadId === row.relationshipId && row.customerId === null : row.customerId === row.relationshipId && row.leadId === null));
  assert(body.results.every((row) => !Object.hasOwn(row, "phone") && !Object.hasOwn(row, "metadata")));
  assert(body.results.length <= 20);
  assert(urls.filter((url) => url.includes("/rest/v1/leads") || url.includes("/rest/v1/customers")).every((url) => new URL(url).searchParams.get("limit") === "20"));
}));

test("sales_partner search is server-scoped and post-filters foreign relationships", async () => withBackend("sales_partner", async ({ urls }) => {
  const result = await handler(event({ q: "acme", type: "lead" }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(body.results.map((row) => row.id), ["33333333-3333-4333-8333-333333333333"]);
  const databaseUrls = urls.filter((url) => url.includes("/rest/v1/leads"));
  assert(databaseUrls.length > 0);
  assert(databaseUrls.every((url) => { const search = decodeURIComponent(new URL(url).search); return search.includes(ACTOR) || search.includes(PROFILE); }));
  assert(databaseUrls.every((url) => new URL(url).searchParams.get("select") === "*"));
}));

test("sales_partner search tolerates missing optional ownership columns while remaining server-scoped", async () => withBackend("sales_partner", async ({ urls }) => {
  const result = await handler(event({ q: "acme", type: "lead" }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(body.results.map((row) => row.relationshipId), ["33333333-3333-4333-8333-333333333333"]);
  assert(urls.some((url) => decodeURIComponent(url).includes("metadata->>assignedUserId")));
}, { schemaVariantScope: true }));

test("empty search returns no relationship dataset", async () => withBackend("admin", async ({ urls }) => {
  const result = await handler(event({ q: "" }));
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body).results, []);
  assert.equal(urls.some((url) => url.includes("/rest/v1/leads") || url.includes("/rest/v1/customers")), false);
}));

test("mail recipient mode returns globally labelled leads and customers", async () => withBackend("admin", async () => {
  const result = await handler(event({ q: "acme", type: "all", purpose: "mail-recipient", limit: "20", page: "0" }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert(body.results.some((row) => row.relationshipType === "lead"));
  assert(body.results.some((row) => row.relationshipType === "customer"));
  assert(body.results.every((row) => row.email));
}));

test("Lisanne Post with lifecycle status new remains searchable", async () => withBackend("admin", async () => {
  const result = await handler(event({ q: "lisanne", type: "all", purpose: "mail-recipient" }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  const lisanne = body.results.find((row) => row.companyName === "Lisanne Post");
  assert.deepEqual([lisanne.status, lisanne.relationshipType], ["new", "lead"]);
}));

test("mail recipient requests are paginated and bounded server-side", async () => withBackend("admin", async ({ urls }) => {
  const result = await handler(event({ q: "acme", purpose: "mail-recipient", limit: "10", page: "2" }));
  assert.equal(result.statusCode, 200);
  const databaseUrls = urls.filter((url) => url.includes("/rest/v1/leads") || url.includes("/rest/v1/customers"));
  assert(databaseUrls.every((url) => Number(new URL(url).searchParams.get("limit")) <= 11));
  assert(databaseUrls.every((url) => new URL(url).searchParams.get("offset") === "20"));
}));

test("search failures return a controlled error response", async () => withBackend("admin", async (_state) => {
  const result = await handler(event({ q: "acme", type: "customer" }));
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.body).code, "QUERY_FAILED");
}, { failSearch: true }));

test("ownership helper matches the canonical relationship context boundary", () => {
  assert.equal(_test.canAccess({ role: "super_admin" }, "lead", {}), true);
  assert.equal(_test.canAccess({ role: "sales_partner", id: ACTOR, profileId: PROFILE }, "lead", { assigned_user_id: ACTOR }), true);
  assert.equal(_test.canAccess({ role: "sales_partner", id: ACTOR, profileId: PROFILE }, "customer", { metadata: { ownerProfileId: PROFILE } }), true);
  assert.equal(_test.canAccess({ role: "sales_partner", id: ACTOR, profileId: PROFILE }, "lead", { assigned_user_id: "other" }), false);
});

async function withBackend(role, callback, options = {}) {
  const previousFetch = global.fetch;
  const previousEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_ANON_KEY = "anon"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  const state = { urls: [] };
  global.fetch = async (url) => {
    state.urls.push(String(url));
    if (String(url).includes("/auth/v1/user")) return response(200, { id: ACTOR, email: "partner@example.test" });
    if (String(url).includes("/rest/v1/profiles")) return response(200, [{ id: PROFILE, role, status: "active" }]);
    if (options.failSearch) return response(503, { code: "UPSTREAM" });
    if (String(url).includes("/rest/v1/customers")) return response(200, [{ id: "44444444-4444-4444-8444-444444444444", company: "Acme Customer", name: "Ada", email: "ada@example.test", status: "active", metadata: role === "sales_partner" ? { ownerProfileId: PROFILE } : {} }]);
    if (String(url).includes("/rest/v1/leads")) {
      if (options.schemaVariantScope && !decodeURIComponent(String(url)).includes("metadata->>")) return response(400, { code: "42703" });
      if (decodeURIComponent(String(url)).includes("lisanne")) {
        return response(200, [{ id: "66666666-6666-4666-8666-666666666666", company_name: "Lisanne Post", contact_name: "Lisanne", email: "lisanne@example.test", lead_status: "new" }]);
      }
      return response(200, [
      { id: "33333333-3333-4333-8333-333333333333", company_name: "Acme Lead", contact_name: "Lena", email: "lena@example.test", lead_status: "qualified", assigned_user_id: options.schemaVariantScope ? undefined : ACTOR, metadata: options.schemaVariantScope ? { assignedUserId: ACTOR } : {} },
      { id: "55555555-5555-4555-8555-555555555555", company_name: "Foreign Lead", assigned_user_id: "other" },
      ]);
    }
    return response(404, {});
  };
  try { return await callback(state); }
  finally { global.fetch = previousFetch; Object.entries(previousEnv).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; }); }
}

function event(queryStringParameters = {}, bearer = "token") { return { httpMethod: "GET", headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, queryStringParameters }; }
function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
