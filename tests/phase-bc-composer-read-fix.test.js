const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const foundationPath = path.join(root, "supabase/migrations/20260730150000_commercial_offer_foundation.sql");
const repair = read("supabase/migrations/20260730170000_composer_service_role_read_fix.sql");
const endpoint = read("functions/admin-commercial-offers.js");

test("applied commercial foundation remains byte-identical", () => {
  const checksum = crypto.createHash("sha256").update(fs.readFileSync(foundationPath)).digest("hex");
  assert.equal(checksum, "a6f043620b7bc1e56dc974f0d29631b4fe139aeef2a445342745e5d016a3513e");
});

test("forward-only repair grants service-role SELECT on exactly the five Composer evidence tables", () => {
  const expected = [
    "commercial_offers",
    "commercial_offer_versions",
    "commercial_offer_lines",
    "commercial_offer_document_bindings",
    "commercial_offer_events",
  ];
  for (const table of expected) assert.match(repair, new RegExp(`public\\.${table}\\b`));
  assert.match(repair, /grant select on table[\s\S]*to service_role/);
  assert.doesNotMatch(repair, /grant\s+(?:insert|update|delete|truncate|references|trigger|all)/i);
  assert.doesNotMatch(repair, /commercial_catalog_versions[\s\S]*grant select|grant select[\s\S]*commercial_catalog_versions/i);
  assert.doesNotMatch(repair, /drop\s|truncate\s|delete\s+from|alter\s+table|create\s+(?:policy|function)/i);
});

test("GET awaits the Composer read so rejected reads reach the endpoint catch", () => {
  assert.match(endpoint, /return await readComposerContext\(event\.queryStringParameters \|\| \{\}, actor, config\)/);
});

test("rejected database reads return a safe structured 503 without internals", async () => {
  const authPath = require.resolve("../functions/_admin-auth");
  const endpointPath = require.resolve("../functions/admin-commercial-offers");
  const originalAuth = require.cache[authPath];
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = global.fetch;
  const originalError = console.error;

  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: { verifyAdmin: async () => ({ success: true, admin: { id: "11111111-1111-4111-8111-111111111111", profileId: "22222222-2222-4222-8222-222222222222", role: "super_admin" } }) },
  };
  delete require.cache[endpointPath];
  process.env.SUPABASE_URL = "https://safe-project.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret-must-not-leak";
  global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ code: "42501", message: "raw database detail", hint: "private schema detail" }) });
  console.error = () => {};

  try {
    const response = await require(endpointPath).handler({
      httpMethod: "GET",
      queryStringParameters: { relationshipType: "lead", relationshipId: "33333333-3333-4333-8333-333333333333" },
    });
    assert.equal(response.statusCode, 503);
    const body = JSON.parse(response.body);
    assert.deepEqual(body, { success: false, code: "OFFER_READ_UNAVAILABLE", error: "De offeractie kon niet veilig worden verwerkt." });
    assert.doesNotMatch(response.body, /42501|raw database|private schema|service-role-secret|stack/i);
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    delete require.cache[endpointPath];
    if (originalAuth) require.cache[authPath] = originalAuth; else delete require.cache[authPath];
  }
});
