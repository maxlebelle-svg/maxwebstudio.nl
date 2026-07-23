const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bridge = require("../functions/services/contentFactoryWebsiteFactoryAdapter");
const { buildWebsitePackage } = require("../functions/_website-factory-core");

const journey = {
  id: "journey-content-factory-v2-shadow",
  businessName: "Energie Vooruit",
  email: "info@example.test",
  phone: "030-1234567",
  packageType: "premium",
  factoryInput: {
    specialization: "thuisbatterijen",
    style: "premium",
    brandPersonality: "innovatief",
    theme: "dark",
    goal: "leadgeneratie",
    locale: "nl-NL",
    channels: ["website", "social"]
  }
};
const briefing = [
  "Branche: installateur",
  "Subspecialisatie: thuisbatterijen",
  "Regio: Utrecht",
  "Visuele stijl: premium",
  "Merkpersoonlijkheid: innovatief",
  "Thema: dark",
  "Contentdoel: leadgeneratie",
  "Diensten: Installatie, Onderhoud, Advies"
].join("\n");

test("versieflag kiest standaard v1 en accepteert uitsluitend v1 of v2", () => {
  assert.equal(bridge.resolveAdapterVersion({}), "v1");
  assert.equal(bridge.resolveAdapterVersion({ WEBSITE_FACTORY_CONTENT_ADAPTER: "v2" }), "v2");
  assert.equal(bridge.resolveAdapterVersion({ WEBSITE_FACTORY_CONTENT_ADAPTER: "experimenteel" }), "v1");
});

test("v2 shadow lost beide adapters op maar rendert exact één keer met v1", async () => {
  const prepared = await bridge.prepareWebsiteFactoryRenderRequest({
    journey, briefing, packageType: "premium", version: 4,
    environment: { WEBSITE_FACTORY_CONTENT_ADAPTER: "v2", WEBSITE_FACTORY_CONTENT_ADAPTER_MODE: "shadow" }
  });
  assert.equal(prepared.integration.status, "v2_shadow_ready");
  assert.equal(prepared.integration.selectedAdapterVersion, "v2");
  assert.equal(prepared.integration.rendererAdapterVersion, "v1");
  assert.equal(prepared.integration.usedByRenderer, false);
  assert.equal(prepared.request.factoryInput.contentFactory.contractVersion, "content-factory-adapter/v1");
  assert.equal(prepared.adapterOutput.metadata.contractVersion, "content-factory-adapter/v2");
  assert.equal(prepared.integration.dimensions.specialization.id, "thuisbatterijen");
  assert.ok(prepared.integration.comparison.heroChanged);
  const generated = buildWebsitePackage(prepared.request);
  bridge.attachIntegrationMetadata(generated, prepared.integration);
  assert.equal(generated.meta.contentFactoryAdapter.rendererAdapterVersion, "v1");
});

test("v2 active-test voert v2-input door dezelfde bestaande renderer", async () => {
  const prepared = await bridge.prepareWebsiteFactoryRenderRequest({
    journey, briefing, packageType: "premium", version: 4,
    environment: { WEBSITE_FACTORY_CONTENT_ADAPTER: "v2", WEBSITE_FACTORY_CONTENT_ADAPTER_MODE: "active" }
  });
  assert.equal(prepared.integration.status, "v2_active_ready");
  assert.equal(prepared.integration.rendererAdapterVersion, "v2");
  assert.equal(prepared.request.factoryInput.contentFactory.contractVersion, "content-factory-adapter/v2");
  const generated = buildWebsitePackage(prepared.request);
  bridge.attachIntegrationMetadata(generated, prepared.integration);
  const html = generated.files.find((file) => file.path === "index.html").content;
  assert.match(html, /thuisbatterijen/i);
  assert.equal(generated.meta.websiteFactoryInput.contentFactory.contractVersion, "content-factory-adapter/v2");
  assert.equal(generated.meta.contentFactoryAdapter.compositionSignature, prepared.adapterOutput.blueprint.composition_signature);
  assert.equal(generated.files.filter((file) => file.path === "index.html").length, 1);
});

test("v2 vertaalt vier stijlen voor dezelfde lead naar zichtbaar verschillende renderer-CSS", async () => {
  const styles = ["premium", "warm", "modern", "minimalistisch"];
  const cssVariants = [];

  for (const style of styles) {
    const prepared = await bridge.prepareWebsiteFactoryRenderRequest({
      journey: { ...journey, factoryInput: { ...journey.factoryInput, style } },
      briefing,
      packageType: "premium",
      version: 4,
      environment: { WEBSITE_FACTORY_CONTENT_ADAPTER: "v2", WEBSITE_FACTORY_CONTENT_ADAPTER_MODE: "active" }
    });
    const generated = buildWebsitePackage(prepared.request);
    const css = generated.files.find((file) => file.path === "styles.css").content;
    assert.match(css, /--cf-radius:/);
    assert.match(css, /prefers-reduced-motion:reduce/);
    cssVariants.push(css);
  }

  assert.equal(new Set(cssVariants).size, styles.length);
});

test("legacy en v1 zonder v2-designsysteem behouden de bestaande renderer-CSS", () => {
  const generated = buildWebsitePackage({ journey, briefing, packageType: "premium", version: 4 });
  const css = generated.files.find((file) => file.path === "styles.css").content;
  assert.doesNotMatch(css, /--cf-radius:/);
});

test("v2 resolverfout valt vóór rendering terug op de voorbereide v1-input", async () => {
  const prepared = await bridge.prepareWebsiteFactoryRenderRequest({
    journey, briefing, packageType: "premium", version: 4,
    environment: { WEBSITE_FACTORY_CONTENT_ADAPTER: "v2", WEBSITE_FACTORY_CONTENT_ADAPTER_MODE: "active" },
    resolverV2: async () => { throw new Error("simulated v2 failure"); }
  });
  assert.equal(prepared.integration.status, "v2_fallback_v1");
  assert.equal(prepared.integration.fallbackUsed, true);
  assert.equal(prepared.integration.fallbackFrom, "v2");
  assert.equal(prepared.integration.fallbackTo, "v1");
  assert.equal(prepared.integration.rendererAdapterVersion, "v1");
  assert.equal(prepared.request.factoryInput.contentFactory.contractVersion, "content-factory-adapter/v1");
  const generated = buildWebsitePackage(prepared.request);
  assert.equal(generated.files.filter((file) => file.path === "index.html").length, 1);
});

test("productie-entrypoint gebruikt uitsluitend de versioned bridge", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "functions", "website-factory.js"), "utf8");
  assert.match(source, /services\/contentFactoryWebsiteFactoryAdapter/);
  assert.doesNotMatch(source, /services\/contentFactoryWebsiteFactoryAdapterV1/);
});
