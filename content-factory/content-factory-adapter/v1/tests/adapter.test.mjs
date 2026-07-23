import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { contentFactorySourceV1 } from "../../../public/v1/index.mjs";
import {
  CONTENT_FACTORY_ADAPTER_CONTRACT,
  createWebsiteContentAdapterV1,
  resolveWebsiteContent,
  validateAdapterInputV1,
  validateAdapterOutputV1
} from "../index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const baseInput = {
  companyName: "Jansen Installaties",
  region: "Utrecht",
  package: "premium",
  template: "premium-growth-site-v1",
  tone: "vakkundig, direct en toegankelijk",
  seed: 42,
  phone: "030-1234567",
  email: "info@example.test"
};

for (const vertical of ["loodgieter", "schilder", "holistisch", "restaurant", "autobedrijf"]) {
  test(`${vertical} levert een complete, geldige Website Factory-input`, () => {
    const output = resolveWebsiteContent({ ...baseInput, vertical });
    assert.equal(output.metadata.contractVersion, CONTENT_FACTORY_ADAPTER_CONTRACT);
    assert.equal(output.metadata.resolvedVertical, vertical);
    assert.equal(output.metadata.verticalFallbackUsed, false);
    assert.equal(output.websiteFactoryInput.businessName, baseInput.companyName);
    assert.equal(output.websiteFactoryInput.packageType, "premium");
    assert.equal(output.services.length, 6);
    assert.equal(output.assets.services.length, 6);
    assert.equal(output.assets.gallery.length, 10);
    assert.ok(output.hero.imagePrompt?.negativePrompt);
    assert.ok(output.assets.hero.storagePath?.includes(`/content-library/${vertical}/`) || output.assets.hero.storagePath?.includes(`content-library/${vertical}/`));
    assert.deepEqual(validateAdapterOutputV1(output), { valid: true, errors: [] });
  });
}

test("onbekende branche valt traceerbaar terug op lokale-specialist", () => {
  const output = resolveWebsiteContent({ ...baseInput, vertical: "intergalactische adviseur" });
  assert.equal(output.metadata.resolvedVertical, "lokale-specialist");
  assert.equal(output.metadata.verticalFallbackUsed, true);
  assert.ok(output.metadata.fallbacks.some((item) => item.field === "vertical" && item.reason === "unknown_vertical"));
  assert.equal(output.services.length, 6);
});

test("dezelfde input en seed produceren bytegelijk dezelfde output", () => {
  const first = resolveWebsiteContent({ ...baseInput, vertical: "loodgieter", seed: "demo-a" });
  const second = resolveWebsiteContent({ ...baseInput, vertical: "loodgieter", seed: "demo-a" });
  assert.deepEqual(second, first);
  assert.equal(second.metadata.generatedAt, first.metadata.generatedAt);
});

test("verschillende seeds selecteren aantoonbaar andere varianten", () => {
  const first = resolveWebsiteContent({ ...baseInput, vertical: "schilder", seed: 1 });
  const second = resolveWebsiteContent({ ...baseInput, vertical: "schilder", seed: 2 });
  assert.notEqual(second.hero.title, first.hero.title);
});

test("voorbeeldreviews zijn technisch geblokkeerd voor publicatie", () => {
  const output = resolveWebsiteContent({ ...baseInput, vertical: "restaurant" });
  assert.equal(output.reviews.publicationPolicy, "placeholder_only_requires_verified_replacement");
  assert.ok(output.reviews.items.length > 0);
  for (const review of output.reviews.items) {
    assert.equal(review.placeholder, true);
    assert.equal(review.publishable, false);
    assert.equal(review.requiresVerifiedReplacement, true);
    assert.equal(review.publicationStatus, "blocked_until_verified_review");
    assert.match(review.disclosure, /Voorbeeldreview/);
  }
  assert.deepEqual(output.websiteFactoryInput.texts.reviews, []);
  assert.equal(output.websiteFactoryInput.texts.reviewPolicy, "verified_reviews_only");
});

test("ontbrekende assets krijgen een veilig, zichtbaar fallbackslot", () => {
  const incompleteSource = {
    ...contentFactorySourceV1,
    getBranchDefinition(slug) {
      const definition = contentFactorySourceV1.getBranchDefinition(slug);
      if (!definition) return null;
      definition.assets.slots = definition.assets.slots.filter((asset) => !["hero", "services"].includes(asset.type));
      return definition;
    }
  };
  const resolver = createWebsiteContentAdapterV1({ contentSource: incompleteSource });
  const output = resolver({ ...baseInput, vertical: "loodgieter" });
  assert.equal(output.assets.hero.fallback, true);
  assert.equal(output.assets.hero.storagePath, null);
  assert.equal(output.assets.services[0].fallback, true);
  assert.ok(output.metadata.placeholderFlags.assets);
  assert.ok(output.metadata.placeholderFlags.missingAssetTypes.includes("hero"));
  assert.ok(output.metadata.placeholderFlags.missingAssetTypes.includes("services"));
  assert.ok(output.metadata.fallbacks.some((item) => item.field === "asset:hero" && item.reason === "missing_asset"));
  assert.ok(output.metadata.fallbacks.every((item) => item.field !== "vertical"));
});

test("local SEO gebruikt regio in titel, zoekterm en landingspagina's", () => {
  const output = resolveWebsiteContent({ ...baseInput, vertical: "autobedrijf", region: "Amersfoort" });
  assert.match(output.seo.title, /Amersfoort/);
  assert.match(output.seo.local.primaryKeyword, /Amersfoort/);
  assert.ok(output.seo.local.landingPages.every((page) => page.title.includes("Amersfoort") && page.slug.endsWith("-amersfoort")));
  assert.equal(output.seo.local.regionFallbackUsed, false);
});

test("incomplete bedrijfsgegevens blijven veilig en expliciet gemarkeerd", () => {
  const output = resolveWebsiteContent({ vertical: "holistisch", package: "business", seed: 7 });
  assert.equal(output.websiteFactoryInput.businessName, "Uw bedrijf");
  assert.equal(output.seo.local.region, "Nederland");
  assert.equal(output.metadata.placeholderFlags.companyName, true);
  assert.equal(output.metadata.placeholderFlags.region, true);
  assert.equal(output.metadata.placeholderFlags.phone, true);
  assert.equal(output.metadata.placeholderFlags.email, true);
  assert.equal(output.metadata.placeholderFlags.requiresHumanReview, true);
});

test("input- en outputvalidatie rapporteren contractproblemen", () => {
  assert.equal(validateAdapterInputV1(baseInput).valid, false, "vertical ontbreekt in baseInput");
  assert.match(validateAdapterInputV1({ vertical: "loodgieter", extra: true }).errors[0], /onbekend veld/);
  const output = resolveWebsiteContent({ ...baseInput, vertical: "loodgieter" });
  output.reviews.items[0].publishable = true;
  assert.equal(validateAdapterOutputV1(output).valid, false);
});

test("adapter importeert alleen de publieke Content Factory v1-export", () => {
  const source = fs.readFileSync(path.join(ROOT, "content-factory-adapter", "v1", "index.mjs"), "utf8");
  assert.match(source, /public\/v1\/index\.mjs/);
  assert.doesNotMatch(source, /src\/(compiler|engine|verticals|validator)\.mjs/);
});
