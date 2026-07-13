const test = require("node:test");
const assert = require("node:assert/strict");
const { handler, _test } = require("../functions/admin-relationship-context");

const ACTOR = "11111111-1111-4111-8111-111111111111";
const PROFILE = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";
const CUSTOMER = "44444444-4444-4444-8444-444444444444";

test("canonical selection contract keeps type and primary key consistent", () => {
  assert.deepEqual(_test.normalizeSelection(contract("lead", LEAD)), { success: true, relationshipType: "lead", relationshipId: LEAD, leadId: LEAD, customerId: null });
  assert.deepEqual(_test.normalizeSelection(contract("customer", CUSTOMER)), { success: true, relationshipType: "customer", relationshipId: CUSTOMER, leadId: null, customerId: CUSTOMER });
  assert.equal(_test.normalizeSelection({ ...contract("lead", LEAD), relationshipType: "customer" }).code, "CONTEXT_MISMATCH");
  assert.equal(_test.normalizeSelection({ ...contract("lead", LEAD), relationshipId: CUSTOMER }).code, "CONTEXT_MISMATCH");
  assert.equal(_test.normalizeSelection({ ...contract("lead", LEAD), leadId: "invalid" }).code, "CONTEXT_MISMATCH");
  assert.equal(_test.normalizeSelection({ contractVersion: 2, relationshipType: "prospect", relationshipId: LEAD }).code, "INVALID_ENTITY_TYPE");
  assert.equal(_test.normalizeSelection({ contractVersion: 2, relationshipType: "lead", relationshipId: "invalid" }).code, "INVALID_ID");
});

test("super admin validates schema-variant lead and customer rows using only guaranteed id lookup", async () => withBackend("super_admin", async ({ urls }) => {
  const lead = await handler(event(contract("lead", LEAD)));
  const customer = await handler(event(contract("customer", CUSTOMER)));
  assert.equal(lead.statusCode, 200);
  assert.equal(customer.statusCode, 200);
  assert.deepEqual(pick(JSON.parse(lead.body).relationship), { relationshipType: "lead", relationshipId: LEAD, leadId: LEAD, customerId: null, companyName: "DC Timmerwerken" });
  assert.deepEqual(pick(JSON.parse(customer.body).relationship), { relationshipType: "customer", relationshipId: CUSTOMER, leadId: null, customerId: CUSTOMER, companyName: "QuantumBouw" });
  const relationUrls = urls.filter((url) => url.includes("/rest/v1/leads") || url.includes("/rest/v1/customers"));
  assert(relationUrls.every((url) => new URL(url).searchParams.get("select") === "*"));
  assert(relationUrls.every((url) => new URL(url).searchParams.has("id")));
}));

test("sales partner can validate an assigned lead and is denied for a foreign lead", async () => withBackend("sales_partner", async (state) => {
  let result = await handler(event(contract("lead", LEAD)));
  assert.equal(result.statusCode, 200);
  state.foreign = true;
  result = await handler(event(contract("lead", LEAD)));
  assert.equal(result.statusCode, 403);
  assert.equal(JSON.parse(result.body).code, "FORBIDDEN");
}));

test("invalid, mismatched, archived and missing relationships return precise safe codes", async () => withBackend("super_admin", async (state) => {
  let result = await handler(event({ ...contract("lead", LEAD), customerId: CUSTOMER }));
  assert.equal(JSON.parse(result.body).code, "CONTEXT_MISMATCH");
  result = await handler(event({ contractVersion: 2, entityType: "prospect", relationshipType: "prospect", relationshipId: LEAD }));
  assert.equal(JSON.parse(result.body).code, "INVALID_ENTITY_TYPE");
  state.archived = true;
  result = await handler(event(contract("lead", LEAD)));
  assert.equal(JSON.parse(result.body).code, "ARCHIVED");
  state.archived = false; state.missing = true;
  result = await handler(event(contract("lead", LEAD)));
  assert.equal(JSON.parse(result.body).code, "NOT_FOUND");
}));

test("source failures expose a machine-readable code instead of the generic validation message", async () => withBackend("super_admin", async (state) => {
  state.failSource = true;
  const result = await handler(event(contract("lead", LEAD)));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 400);
  assert.equal(body.code, "RELATIONSHIP_SOURCE_QUERY_FAILED");
  assert.equal(body.error, "De relatiebron kon niet veilig worden gecontroleerd. Probeer het later opnieuw.");
}));

async function withBackend(role, callback) {
  const previousFetch = global.fetch;
  const previousEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_ANON_KEY = "anon"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  const state = { urls: [], foreign: false, archived: false, missing: false, failSource: false };
  global.fetch = async (url) => {
    state.urls.push(String(url));
    if (String(url).includes("/auth/v1/user")) return response(200, { id: ACTOR, email: "max@example.test" });
    if (String(url).includes("/rest/v1/profiles")) return response(200, [{ id: PROFILE, role, status: "active" }]);
    if (state.failSource) return response(400, { code: "42703", message: "column does not exist" });
    if (state.missing) return response(200, []);
    if (String(url).includes("/rest/v1/leads")) return response(200, [{ id: LEAD, company: "DC Timmerwerken", name: "Daan", status: state.archived ? "archived" : "qualified", owner_auth_user_id: state.foreign ? CUSTOMER : ACTOR, metadata: {} }]);
    if (String(url).includes("/rest/v1/customers")) return response(200, [{ id: CUSTOMER, company: "QuantumBouw", name: "Ada", status: "active", owner_auth_user_id: ACTOR, metadata: {} }]);
    return response(404, {});
  };
  try { return await callback(state); }
  finally { global.fetch = previousFetch; Object.entries(previousEnv).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; }); }
}

function contract(type, id) { return { contractVersion: 2, entityType: type, relationshipType: type, relationshipId: id, leadId: type === "lead" ? id : null, customerId: type === "customer" ? id : null }; }
function event(body) { return { httpMethod: "POST", headers: { authorization: "Bearer token", "x-relationship-contract": "2" }, body: JSON.stringify(body) }; }
function response(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
function pick(row) { return { relationshipType: row.relationshipType, relationshipId: row.relationshipId, leadId: row.leadId, customerId: row.customerId, companyName: row.companyName }; }
