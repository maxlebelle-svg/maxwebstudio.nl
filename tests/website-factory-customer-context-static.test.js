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
