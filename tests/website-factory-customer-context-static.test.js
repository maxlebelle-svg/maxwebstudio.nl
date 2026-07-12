const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("klantenoverzicht opens the existing Website Factory with customer context", () => {
  const html = read("public/admin-klanten.html");
  assert.match(html, /Websiteproductie/);
  assert.match(html, /admin-website-factory\.html\?customerId=/);
  assert.match(html, /detail-open-website/);
  assert.match(html, /new URLSearchParams\(window\.location\.search\)\.get\("customerId"\)/);
  assert.match(html, /crm-customer-row[\s\S]*is-selected/);
});

test("Factory resolves customers server-side without creating a lead", () => {
  const backend = read("functions/website-factory.js");
  const factory = read("public/admin-website-factory.html");
  assert.match(backend, /action === "resolve_context"/);
  assert.match(backend, /verifyAdmin/);
  assert.match(backend, /readCustomerById\(context, customerId\)/);
  assert.match(backend, /readLeadsForCustomer/);
  assert.doesNotMatch(backend.slice(backend.indexOf("async function resolveWebsiteFactoryContextResponse"), backend.indexOf("async function createBuildJobResponse")), /POST[\s\S]*leads/);
  assert.match(factory, /action=resolve_context&customerId=/);
  assert.match(factory, /Terug naar klant/);
});

test("customer context keeps build ownership on the existing customer", () => {
  const factory = read("public/admin-website-factory.html");
  const backend = read("functions/website-factory.js");
  assert.match(factory, /customerId: customer\.id/);
  assert.match(factory, /journey = factoryCustomerContext\.demoJourney/);
  assert.match(backend, /buildJobs: history\.jobs/);
});

test("Fuellinq production customer UUID is accepted by every Factory context layer", () => {
  const fuellinqId = "38410e0a-6fd6-4a29-b6fc-98b3dc66328d";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.equal(uuidPattern.test(fuellinqId), true);
  for (const file of ["functions/website-factory.js", "functions/demo-journey.js", "functions/_project-workspace.js", "public/admin-website-factory.html"]) {
    assert.match(read(file), /\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}/, `${file} must preserve all five UUID segments`);
  }
});

test("resolver exposes safe, distinct failure codes", () => {
  const backend = read("functions/website-factory.js");
  for (const code of ["missing_customer_id", "invalid_customer_id", "customer_not_found", "customer_query_failed", "context_resolution_failed"]) {
    assert.match(backend, new RegExp(`code: "${code}"`));
  }
  assert.doesNotMatch(backend, /error: "[^"]*(Supabase|SQL|service role|stacktrace)/i);
});

test("optional customer context failures do not reject a valid customer", () => {
  const backend = read("functions/website-factory.js");
  assert.match(backend, /readOptionalCustomerRows/);
  assert.match(backend, /readOptionalCustomerLeads/);
  assert.match(backend, /return \[\];/);
  assert.match(backend, /websiteContextFromCustomer/);
  assert.match(backend, /getBuildHistory[\s\S]*\.catch/);
});

test("universal selector keeps customerId and leadId routes separate", () => {
  const backend = read("functions/website-factory.js");
  const factory = read("public/admin-website-factory.html");
  assert.match(backend, /action === "search_entities"/);
  assert.match(backend, /entityType: "customer"/);
  assert.match(backend, /entityType: "lead"/);
  assert.match(factory, /Lead of klant naar website/);
  assert.match(factory, /entity\.entityType === "customer"[\s\S]*\?customerId=/);
  assert.match(factory, /\?leadId=/);
  assert.match(factory, /Klantwerkruimte kon niet worden geladen/);
  assert.match(factory, /factory-lead-commandbar"\)\?\.setAttribute\("hidden"/);
});

test("universal search is read-only and bounded", () => {
  const backend = read("functions/website-factory.js");
  const searchBlock = backend.slice(backend.indexOf("async function searchWebsiteFactoryEntitiesResponse"), backend.indexOf("async function readCustomersByIds"));
  assert.doesNotMatch(searchBlock, /method: "POST"|method: "PATCH"|method: "DELETE"/);
  assert.match(searchBlock, /\.slice\(0, 20\)/);
  assert.match(searchBlock, /linkedCustomerIds/);
});
