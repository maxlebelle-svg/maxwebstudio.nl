const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const router = fs.readFileSync("functions/admin-supabase-data.js", "utf8");
const factory = fs.readFileSync("public/admin-website-factory.html", "utf8");
const quotesPage = fs.readFileSync("public/admin-offertes.html", "utf8");
const { handler } = require("../functions/admin-supabase-data");

function jsonFetch(body, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  };
}

test("Website Factory files module is registered by the admin data router", () => {
  assert.match(factory, /readAdminDataLayerModule\("files", "supabase-read"\)/);
  assert.match(router, /files:\s*\{\s*table: "files"/);
  assert.match(router, /legacySelect:/);
  assert.match(router, /map: mapFile/);
  const filesDefinition = router.slice(router.indexOf("files: {"), router.indexOf("profiles: {"));
  assert.doesNotMatch(filesDefinition, /salesReadable: true/);
});

test("unknown admin data modules remain a controlled error", () => {
  assert.match(router, /if \(!definition\)/);
  assert.match(router, /jsonResponse\(400, \{ success: false, error: "Onbekende admin data module\." \}\)/);
});

test("files routes into authorization while an unknown module is rejected before authorization", async () => {
  const filesResponse = await handler({ httpMethod: "GET", queryStringParameters: { module: "files" }, headers: {} });
  const unknownResponse = await handler({ httpMethod: "GET", queryStringParameters: { module: "website_factory_files" }, headers: {} });
  assert.equal(filesResponse.statusCode, 401);
  assert.equal(unknownResponse.statusCode, 400);
  assert.equal(JSON.parse(unknownResponse.body).error, "Onbekende admin data module.");
});

test("validated customer fallback renders customer mode without inventing a lead", () => {
  assert.match(factory, /factoryContextState = "customer_relationship_only"/);
  assert.match(factory, /id: `customer-context-\$\{relationship\.customerId\}`/);
  assert.match(factory, /source: "Bestaande klant"/);
  assert.match(factory, /Een losse leadrij is niet vereist voor deze bestaande klant/);
  assert.match(factory, /journey\?\.customerId \|\| factoryCustomerContext\?\.customer\?\.id/);
  assert.match(factory, /factoryCustomerContext\?\.customer\?\.id \? "Relatie" : "Lead"/);
});

test("central admin quote mode returns both canonical quotes before frontend filtering", async () => {
  assert.match(quotesPage, /<option value="supabase-read">Centraal<\/option>/);
  assert.match(quotesPage, /fetch\(`\$\{adminSupabaseDataEndpoint\}\?module=\$\{encodeURIComponent\(moduleName\)\}`/);

  const previousFetch = global.fetch;
  const previousEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    APP_ENV: process.env.APP_ENV,
  };
  const requested = [];
  process.env.SUPABASE_URL = "https://staging.supabase.test";
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.APP_ENV = "test";
  global.fetch = async (url) => {
    const requestUrl = String(url);
    requested.push(requestUrl);
    if (requestUrl.endsWith("/auth/v1/user")) {
      return jsonFetch({ id: "4ef73e54-eaf2-4bcb-aa71-44268bde5634", email: "cpa-admin@staging.maxwebstudio.invalid" });
    }
    if (requestUrl.includes("/rest/v1/profiles?")) {
      return jsonFetch([{ id: "4ef73e54-eaf2-4bcb-aa71-44268bde5635", role: "admin", status: "active" }]);
    }
    if (requestUrl.includes("/rest/v1/quotes?")) {
      const selected = new URL(requestUrl).searchParams.get("select") || "";
      if (/(^|,)(description|amount|currency)(,|$)/.test(selected)) {
        return jsonFetch({ code: "PGRST204", message: "Could not find a requested quotes column in the schema cache" }, 400);
      }
      return jsonFetch([
        {
          id: "ca000000-0000-4000-8000-000000000701",
          customer_id: "ca000000-0000-4000-8000-000000000101",
          website_id: "ca000000-0000-4000-8000-000000000201",
          project_id: "ca000000-0000-4000-8000-000000000301",
          quote_number: "CP-A-STAGING-A-001",
          type: "Website",
          title: "CP-A TEST QUOTE A",
          status: "accepted",
          subtotal: 2000,
          vat: 420,
          total: 2420,
          proposal: "Testvoorstel A",
          notes: "",
          environment: "test",
          metadata: {},
          quote_version: 1,
          created_at: "2026-07-24T20:00:00.000Z",
          updated_at: "2026-07-24T20:00:00.000Z",
        },
        {
          id: "cb000000-0000-4000-8000-000000000701",
          customer_id: "cb000000-0000-4000-8000-000000000101",
          website_id: "cb000000-0000-4000-8000-000000000201",
          project_id: "cb000000-0000-4000-8000-000000000301",
          quote_number: "CP-A-STAGING-B-001",
          type: "Website",
          title: "CP-A TEST QUOTE B",
          status: "sent",
          subtotal: 2000,
          vat: 420,
          total: 2420,
          proposal: "Testvoorstel B",
          notes: "",
          environment: "test",
          metadata: {},
          quote_version: 1,
          created_at: "2026-07-24T20:00:00.000Z",
          updated_at: "2026-07-24T20:00:00.000Z",
        },
      ]);
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };

  try {
    const response = await handler({
      httpMethod: "GET",
      queryStringParameters: { module: "quotes" },
      headers: { Authorization: "Bearer staging-admin-session" },
    });
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(body.success, true);
    assert.equal(body.mode, "supabase-read");
    assert.equal(body.records.length, 2);
    assert.deepEqual(body.records.map((quote) => quote.quoteNumber), ["CP-A-STAGING-A-001", "CP-A-STAGING-B-001"]);
    assert.deepEqual(body.records.map((quote) => quote.total), [2420, 2420]);
    assert.equal(body.counts.supabase, 2);
    const quoteRequest = requested.find((url) => url.includes("/rest/v1/quotes?"));
    assert.ok(quoteRequest);
    assert.doesNotMatch(new URL(quoteRequest).searchParams.get("select") || "", /(^|,)(description|amount|currency)(,|$)/);
  } finally {
    global.fetch = previousFetch;
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});
