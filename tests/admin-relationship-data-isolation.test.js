const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const scope = require("../public/admin/data/relationship-scope.js");

const quantum = { relationshipType: "customer", relationshipId: "customer-quantum" };
const fuellinq = { relationshipType: "customer", relationshipId: "customer-fuellinq" };
const state = {
  projects: [
    { id: "project-quantum", customerId: "customer-quantum" },
    { id: "project-fuellinq", customerId: "customer-fuellinq" },
  ],
  logoAssets: [
    { id: "logo-quantum", projectId: "project-quantum", assetName: "logo-quantum.png" },
    { id: "logo-fuellinq", projectId: "project-fuellinq", assetName: "logo-fuellinq.png" },
  ],
};

test("Brand Center scopes assets by canonical relationship IDs", () => {
  assert.deepEqual(scope.scopeBrandingState(state, quantum).logoAssets.map((row) => row.id), ["logo-quantum"]);
  assert.deepEqual(scope.scopeBrandingState(state, fuellinq).logoAssets.map((row) => row.id), ["logo-fuellinq"]);
  assert.deepEqual(scope.scopeBrandingState(state, null).logoAssets, []);
});

test("scope never associates records by display name and new records receive canonical IDs", () => {
  const misleading = { companyName: "QuantumBouw.nl", customerId: "customer-fuellinq" };
  assert.equal(scope.recordMatches(misleading, quantum), false);
  assert.deepEqual(scope.attachRelationship({ id: "asset" }, quantum), {
    id: "asset", relationshipType: "customer", relationshipId: "customer-quantum", leadId: "", customerId: "customer-quantum",
  });
});

test("Demo Sites waits for relationship context, clears stale rows and sends server filters", () => {
  const html = fs.readFileSync(path.join(root, "public/admin-demo-sites.html"), "utf8");
  assert.match(html, /ActiveRelationship\.whenReady/);
  assert.match(html, /records = \[\];[\s\S]*relationshipQuery/);
  assert.match(html, /requestGeneration/);
  assert.match(html, /activeController\?\.abort/);
  assert.match(html, /signal: activeController\.signal/);
  assert.match(html, /data-preview-error/);
  assert.match(html, /fetch\(url, \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(html, /fetch\(url, \{ headers: token/);
});

test("Demo journey server enforces matching canonical relationship filters", () => {
  const source = fs.readFileSync(path.join(root, "functions/demo-journey.js"), "utf8");
  assert.match(source, /relationshipType === "lead" && leadId !== relationshipId/);
  assert.match(source, /relationshipType === "customer" && customerId !== relationshipId/);
  assert.match(source, /query\.set\("lead_id"/);
  assert.match(source, /query\.set\("customer_id"/);
  assert.match(source, /canonicalAdminPreviewUrl\(row\.preview_url, row\.id, row\.preview_token\)/);
  assert.match(source, /previewUrlForJourney\(id, token\)/);
});
