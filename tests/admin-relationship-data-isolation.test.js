const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
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

test("Asset Manager requires canonical scope for list, action and download", () => {
  const handler = read("functions/admin-relationship-assets.js");
  const client = read("public/admin/ui/central-asset-library.js");
  assert.match(handler, /RELATIONSHIP_REQUIRED/);
  assert.match(handler, /relationshipFrom\(params\)/);
  assert.match(handler, /relationshipFrom\(input\)/);
  assert.match(handler, /lead_id.*customer_id|customer_id.*lead_id/s);
  assert.match(client, /relationshipType=.*relationshipId=/);
  assert.match(client, /currentRequest !== requestId/);
  assert.match(client, /assets = \[\]; render\(\)/);
  assert.doesNotMatch(client, /requestedCustomerId/);
});

test("local creative studios namespace drafts by canonical relationship and never read global legacy drafts", () => {
  const ai = read("public/src/ai-content-library.js");
  const seo = read("public/src/seo-studio.js");
  const social = read("public/src/social-media-studio.js");
  for (const source of [ai, seo, social]) {
    assert.match(source, /relationshipType/);
    assert.match(source, /relationshipId/);
    assert.match(source, /Selecteer eerst een actieve lead of klant/);
    assert.match(source, /subscribeToRelationshipChanges/);
  }
  assert.doesNotMatch(social, /readJson\(storageKeys\.legacy/);
});

test("Domain Center and customer onboarding issue only relationship-filtered production reads", () => {
  const domainHandler = read("functions/admin-domain-center.js");
  const domainPage = read("public/admin-domain-center.html");
  const dataHandler = read("functions/admin-supabase-data.js");
  const onboarding = read("public/admin-onboarding.html");
  assert.match(domainHandler, /RELATIONSHIP_REQUIRED/);
  assert.match(domainHandler, /isLead \? \[\] : fetchTableWithFallbacks/);
  assert.match(domainHandler, /isLead \? fetchTableWithFallbacks/);
  assert.match(domainPage, /currentRequest !== domainRequestId/);
  assert.match(domainPage, /relationshipType=.*relationshipId=/);
  assert.match(dataHandler, /relationshipFromQuery/);
  assert.match(dataHandler, /params\.set\(filter\.column, `eq\.\$\{filter\.value\}`\)/);
  assert.match(onboarding, /relationshipType", "customer"/);
  assert.match(onboarding, /state\.onboardings = \[\]/);
  assert.doesNotMatch(onboarding, /state\.onboardings = storedOnboardings\.length \? storedOnboardings : seedFromExistingData/);
  assert.match(onboarding, /Deze functie wordt beschikbaar nadat de lead klant is geworden/);
});
