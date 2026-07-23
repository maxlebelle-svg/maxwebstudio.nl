const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bridge = require("../functions/services/contentFactoryWebsiteFactoryAdapterV1");
const { buildWebsitePackage } = require("../functions/_website-factory-core");

const journey = {
  id: "journey-content-factory-proof",
  businessName: "Jansen Installaties",
  contactName: "Jan Jansen",
  email: "info@example.test",
  phone: "030-1234567",
  websiteUrl: "https://example.test",
  packageType: "premium",
};
const briefing = [
  "Branche: loodgieter",
  "Regio: Utrecht",
  "Diensten: Lekkage, Sanitair, Leidingwerk",
  "Tone of voice: vakkundig en direct",
].join("\n");

test("featureflag staat standaard uit en laadt de adapter dan niet", async () => {
  let called = false;
  const prepared = await bridge.prepareWebsiteFactoryRenderRequest({
    journey,
    briefing,
    packageType: "premium",
    version: 3,
    environment: {},
    resolver: async () => {
      called = true;
      throw new Error("resolver hoort niet aangeroepen te worden");
    },
  });
  assert.equal(called, false);
  assert.equal(prepared.integration.mode, "off");
  assert.equal(prepared.integration.status, "off");
  assert.equal(prepared.integration.usedByRenderer, false);
  assert.equal(prepared.request.journey, journey);
  assert.equal(prepared.request.briefing, briefing);
});

test("shadow mode vergelijkt Content Factory-output zonder rendererinput te wijzigen", async () => {
  const prepared = await bridge.prepareWebsiteFactoryRenderRequest({
    journey,
    briefing,
    packageType: "premium",
    version: 3,
    environment: { CONTENT_FACTORY_ADAPTER_V1_MODE: "shadow" },
  });
  assert.equal(prepared.integration.status, "shadow_ready");
  assert.equal(prepared.integration.usedByRenderer, false);
  assert.equal(prepared.integration.fallbackUsed, false);
  assert.equal(prepared.request.journey, journey);
  assert.equal(prepared.request.briefing, briefing);
  assert.equal(prepared.integration.resolvedVertical, "loodgieter");
  assert.equal(prepared.integration.comparison.reviewPlaceholdersBlocked, true);
  assert.ok(prepared.integration.comparison.adapterServiceCount > 0);
});

test("active mode voert websiteFactoryInput door de bestaande renderer", async () => {
  const prepared = await bridge.prepareWebsiteFactoryRenderRequest({
    journey,
    briefing,
    packageType: "premium",
    version: 3,
    environment: { CONTENT_FACTORY_ADAPTER_V1_MODE: "active" },
  });
  assert.equal(prepared.integration.status, "active_ready");
  assert.equal(prepared.integration.usedByRenderer, true);
  assert.equal(prepared.request.factoryInput.contentFactory.contractVersion, "content-factory-adapter/v1");
  assert.match(prepared.request.briefing, /Content Factory contract: content-factory-adapter\/v1/);
  assert.match(prepared.request.briefing, /Oorspronkelijke briefing:/);

  const generated = buildWebsitePackage(prepared.request);
  bridge.attachIntegrationMetadata(generated, prepared.integration);
  const indexHtml = generated.files.find((file) => file.path === "index.html").content;
  const expectedHero = prepared.request.factoryInput.content.hero.title;
  assert.match(indexHtml, new RegExp(escapeRegExp(expectedHero)));
  assert.ok(prepared.request.factoryInput.services.some((service) => indexHtml.includes(service)));
  assert.equal(generated.meta.websiteFactoryInput.contentFactory.contractVersion, "content-factory-adapter/v1");
  assert.equal(generated.meta.contentFactoryAdapter.status, "active_ready");
  assert.deepEqual(generated.meta.websiteFactoryInput.texts.reviews, []);
});

test("adapterfout valt ook in active mode terug op ongewijzigde legacyinput", async () => {
  const prepared = await bridge.prepareWebsiteFactoryRenderRequest({
    journey,
    briefing,
    packageType: "premium",
    version: 3,
    environment: { CONTENT_FACTORY_ADAPTER_V1_MODE: "active" },
    resolver: async () => {
      throw new Error("simulated adapter failure");
    },
  });
  assert.equal(prepared.integration.status, "legacy_fallback");
  assert.equal(prepared.integration.fallbackUsed, true);
  assert.equal(prepared.integration.usedByRenderer, false);
  assert.equal(prepared.request.journey, journey);
  assert.equal(prepared.request.briefing, briefing);
});

test("legacy rendereroutput blijft gelijk wanneer geen factoryInput wordt geleverd", () => {
  const baseline = buildWebsitePackage({ journey, briefing, version: 3 });
  const repeated = buildWebsitePackage({ journey, briefing, version: 3 });
  assert.deepEqual(repeated.files, baseline.files);
  assert.deepEqual(repeated.meta, baseline.meta);
  assert.equal("websiteFactoryInput" in baseline.meta, false);
  assert.equal("contentFactoryAdapter" in baseline.meta, false);
});

test("productie-entrypoints lopen via de featureflagged bridge", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "functions", "website-factory.js"), "utf8");
  const calls = source.match(/await buildWebsitePackageWithContentFactory\(\{/g) || [];
  assert.equal(calls.length, 2);
  assert.match(source, /prepareWebsiteFactoryRenderRequest/);
  assert.match(source, /attachContentFactoryIntegrationMetadata/);
});

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
