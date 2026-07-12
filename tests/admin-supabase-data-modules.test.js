const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const router = fs.readFileSync("functions/admin-supabase-data.js", "utf8");
const factory = fs.readFileSync("public/admin-website-factory.html", "utf8");
const { handler } = require("../functions/admin-supabase-data");

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
