import assert from "node:assert/strict";
import test from "node:test";
import { CONTENT_FACTORY_ADAPTER_V2_CONTRACT, resolveWebsiteContentV2 } from "../index.mjs";

const input = {
  vertical: "installateur",
  specialization: "thuisbatterijen",
  style: "premium",
  brandPersonality: "innovatief",
  theme: "dark",
  goal: "leadgeneratie",
  region: "Utrecht",
  locale: "nl-NL",
  channels: ["website", "social"],
  companyName: "Energie Vooruit",
  package: "premium",
  seed: 11,
  phone: "030-1234567",
  email: "info@example.test"
};

test("Adapter v2 levert een gespecialiseerde Website Factory-input uit het v2-blueprint", () => {
  const output = resolveWebsiteContentV2(input);
  assert.equal(output.metadata.contractVersion, CONTENT_FACTORY_ADAPTER_V2_CONTRACT);
  assert.equal(output.metadata.compatibilitySource, "content-factory-adapter/v1");
  assert.equal(output.blueprint.contract_version, "2.0.0");
  assert.equal(output.blueprint.dimensions.specialization.id, "thuisbatterijen");
  assert.equal(output.blueprint.dimensions.goal.id, "leadgeneratie");
  assert.equal(output.services[0].name, "Thuisbatterijen");
  assert.match(output.hero.title, /thuisbatterijen/i);
  assert.match(output.hero.subtitle, /Utrecht/);
  assert.ok(output.seo.keywords.some((keyword) => /thuisbatterij/i.test(keyword)));
  assert.equal(output.websiteFactoryInput.content.designSystem.colors.surface, "#101317");
  assert.equal(output.websiteFactoryInput.contentFactory.contractVersion, CONTENT_FACTORY_ADAPTER_V2_CONTRACT);
});

test("Adapter v2 maakt fotografieprompts voor de concrete combinatie", () => {
  const output = resolveWebsiteContentV2(input);
  assert.equal(output.assets.hero.compositionSignature, output.blueprint.composition_signature);
  assert.match(output.assets.hero.imagePrompt.personalityDirection, /moderne hulpmiddelen/i);
  assert.match(output.assets.hero.imagePrompt.themeDirection, /donkere/i);
  assert.equal(output.assets.hero.production.status, "planned");
});

test("Adapter v2 rapporteert structurele kwaliteit zonder publicatieclaim", () => {
  const output = resolveWebsiteContentV2(input);
  assert.ok(output.quality.blueprint.overall >= 90);
  assert.ok(output.quality.website.overall >= 70);
  assert.equal(output.quality.website.ai_confidence.score, null);
  assert.equal(output.quality.website.publication_ready, false);
  assert.equal(output.quality.website.requires_human_review, true);
});

test("dezelfde v2-input blijft deterministisch", () => {
  assert.deepEqual(resolveWebsiteContentV2(input), resolveWebsiteContentV2(input));
});

test("ongeldige specialisatie wordt fail-closed geweigerd", () => {
  assert.throws(() => resolveWebsiteContentV2({ ...input, specialization: "sushi" }), /Onbekende subspecialisatie/);
});
