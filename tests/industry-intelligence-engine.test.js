"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { adaptIndustryProfileToFactoryInput, buildIndustryProfile, selectPhotoAssetGroup } = require("../functions/industry-intelligence");
const { demoImageGroups, resolveDemoImageGroup } = require("../functions/_demo-image-assets");
const { buildWebsitePackage } = require("../functions/_website-factory-core");

const CASES = [
  ["holistische praktijk", { businessDescription: "Holistische praktijk voor healing meditatie balans en persoonlijke ontwikkeling" }, "holistische-praktijk"],
  ["energetische praktijk", { businessDescription: "Energetische praktijk voor energiebehandeling reiki chakra en balans" }, "energetische-praktijk"],
  ["coach", { businessDescription: "Coachpraktijk voor coaching mindset doelen en persoonlijke ontwikkeling" }, "coach"],
  ["wellness", { businessDescription: "Wellness spa met massage ontspanning en behandelingen" }, "wellness-praktijk"],
  ["timmerbedrijf", { businessDescription: "Timmerbedrijf voor timmerwerk houtwerk dakkapel en kozijnen" }, "timmerbedrijf"],
  ["installatiebedrijf", { businessDescription: "Installatiebedrijf voor elektra warmtepomp zonnepanelen en laadpalen" }, "installatiebedrijf"],
  ["restaurant", { businessDescription: "Restaurant voor lunch diner menu en reserveren" }, "restaurant"],
  ["advocaat", { businessDescription: "Advocatenkantoor voor juridisch advies en verschillende rechtsgebieden" }, "advocaat"],
  ["tandarts", { businessDescription: "Tandartspraktijk voor mondzorg controle preventie en mondhygiene" }, "tandarts"],
  ["schoonheidssalon", { businessDescription: "Schoonheidssalon met gezichtsbehandeling huidadvies en huidverbetering" }, "schoonheidssalon"],
  ["fysiotherapeut", { businessDescription: "Fysiotherapie voor revalidatie bewegen herstel en pijnklachten" }, "fysiotherapie"],
  ["webshop", { businessDescription: "Webshop online winkel met producten winkelmand checkout en bezorgen" }, "webshop"],
  ["zakelijke dienstverlening", { businessDescription: "Zakelijke dienstverlening consultancy adviesbureau strategie en b2b" }, "advies"],
];

test("classification matrix is deterministic and branch appropriate", async (t) => {
  for (const [label, input, expected] of CASES) {
    await t.test(label, () => {
      const first = buildIndustryProfile(input);
      const second = buildIndustryProfile(input);
      assert.equal(first.schemaVersion, "mws.industry-profile.v1");
      assert.equal(first.subcategory, expected);
      assert.ok(first.confidence >= 0.65);
      assert.deepEqual(first, second);
      assert.equal(Object.isFrozen(first), true);
      assert.equal(Object.isFrozen(first.visualProfile), true);
    });
  }
});

test("explicit intake industry wins from contradictory weaker scan evidence", () => {
  const profile = buildIndustryProfile({
    explicitIndustry: "Holistische praktijk in Almere",
    websiteScan: { title: "Timmerbedrijf", h1: "Kozijnen en timmerwerk", paragraphs: ["Renovatie met professioneel gereedschap"] },
  });
  assert.equal(profile.subcategory, "holistische-praktijk");
  assert.equal(profile.classificationStatus, "confirmed");
  assert.ok(profile.confidence >= 0.85);
  assert.equal(profile.scoring.explicitInputMatched, true);
});

test("unknown company is neutral and never authorizes niche image selection", () => {
  const profile = buildIndustryProfile({ businessName: "Aster Nova BV", websiteUrl: "https://asternova.example" });
  assert.equal(profile.subcategory, "neutrale-lokale-dienstverlener");
  assert.equal(profile.classificationStatus, "neutral");
  assert.equal(profile.assetSelection.allowed, false);
  assert.deepEqual(profile.fallback, { used: true, reason: "insufficient_industry_evidence", mode: "no-auto-image-selection" });
  const selection = selectPhotoAssetGroup(profile, demoImageGroups);
  assert.equal(selection.status, "unresolved");
  assert.equal(selection.groupSlug, null);
});

test("legacy demo resolver uses neutral professional instead of installation at zero score", () => {
  assert.equal(resolveDemoImageGroup({ businessName: "Aster Nova" }).slug, "neutral-professional");
});

test("forbidden tags hard exclude otherwise attractive asset groups", () => {
  const profile = buildIndustryProfile({ explicitIndustry: "Holistische praktijk" });
  const selection = selectPhotoAssetGroup(profile, [
    { slug: "unsafe", tags: ["holistic", "wellness", "construction", "tools"] },
    { slug: "safe", tags: ["holistic", "calm", "nature"] },
  ]);
  assert.equal(selection.groupSlug, "safe");
  assert.equal(selection.status, "selected");
});

test("holistic selects holistic assets and never construction assets", () => {
  const profile = buildIndustryProfile({ explicitIndustry: "Holistische praktijk" });
  const selection = selectPhotoAssetGroup(profile, demoImageGroups);
  assert.equal(selection.groupSlug, "holistisch");
  assert.doesNotMatch(selection.groupSlug, /bouw|timmer|installatie/);
  assert.ok(selection.excludedTags.includes("construction"));
  assert.ok(profile.visualProfile.forbiddenPhotoTags.includes("construction"));
  assert.ok(profile.visualProfile.preferredPhotoTags.includes("meditation"));
});

test("carpentry selects construction assets and excludes wellness assets", () => {
  const profile = buildIndustryProfile({ explicitIndustry: "Timmerbedrijf" });
  const selection = selectPhotoAssetGroup(profile, demoImageGroups);
  assert.equal(selection.groupSlug, "timmerwerk");
  assert.ok(profile.visualProfile.forbiddenPhotoTags.includes("wellness"));
});

test("adapter preserves explicit services, safely supplements and caps services", () => {
  const profile = buildIndustryProfile({ explicitIndustry: "Holistische praktijk" });
  const output = adaptIndustryProfileToFactoryInput(profile, { services: ["Reiki", "Persoonlijke sessie"] }, { maxServices: 5 });
  assert.deepEqual(output.services.slice(0, 2), ["Reiki", "Persoonlijke sessie"]);
  assert.ok(output.services.includes("Holistische coaching"));
  assert.equal(output.services.length, 5);
  assert.equal(output.services.some((item) => /bouw|kozijn|timmer/i.test(item)), false);
});

test("adapter preserves explicit CTA and otherwise supplies branch CTA and tone", () => {
  const profile = buildIndustryProfile({ explicitIndustry: "Holistische praktijk" });
  const explicit = adaptIndustryProfileToFactoryInput(profile, { primaryCta: "Stel uw vraag" });
  const inferred = adaptIndustryProfileToFactoryInput(profile, {});
  assert.equal(explicit.primaryCta, "Stel uw vraag");
  assert.equal(inferred.primaryCta, "Plan een kennismaking");
  assert.match(inferred.tone, /warm/);
  assert.doesNotMatch(inferred.primaryCta, /offerte|profiteer|bestel/i);
});

test("section advice respects commercial package boundaries", () => {
  const profile = buildIndustryProfile({ explicitIndustry: "Holistische praktijk" });
  const packageSections = ["hero", "diensten", "werkwijze", "projecten", "reviews", "contact", "footer"];
  const output = adaptIndustryProfileToFactoryInput(profile, { sections: packageSections }, { packageSections });
  assert.equal(output.sectionAdvice.packageBoundariesApplied, true);
  assert.ok(output.sectionAdvice.preferred.includes("hero"));
  assert.ok(output.sectionAdvice.preferred.includes("diensten"));
  assert.equal(output.sectionAdvice.preferred.includes("projecten"), false);
  assert.deepEqual(output.sections, packageSections);
});

test("SEO profile is structured, local-safe and keeps explicit keywords", () => {
  const profile = buildIndustryProfile({ explicitIndustry: "Advocaat", seoKeywords: ["arbeidsrecht"], serviceArea: "Almere" });
  assert.ok(profile.seoProfile.keywords.includes("arbeidsrecht"));
  assert.ok(profile.seoProfile.primaryTopics.includes("juridisch advies"));
  assert.ok(profile.seoProfile.localKeywordPatterns.includes("{dienst} in Almere"));
  assert.equal(profile.seoProfile.localKeywordPatterns.some((item) => /Amsterdam/.test(item)), false);
});

test("adapter does not mutate input or immutable profile", () => {
  const input = { services: ["Eigen dienst"], seoContext: { keywords: ["eigen zoekwoord"] } };
  const snapshot = structuredClone(input);
  const profile = buildIndustryProfile({ explicitIndustry: "Coach" });
  const profileSnapshot = JSON.stringify(profile);
  adaptIndustryProfileToFactoryInput(profile, input);
  assert.deepEqual(input, snapshot);
  assert.equal(JSON.stringify(profile), profileSnapshot);
});

test("invalid or absent profile preserves legacy adapter input", () => {
  const input = { industry: "Bestaand", services: ["Bestaande dienst"], cta: "Bestaande CTA" };
  const output = adaptIndustryProfileToFactoryInput(null, input);
  assert.deepEqual(output, { ...input, industryProfile: null, industryIntelligenceApplied: false });
});

test("new holistic build stores traceable profile and packages no build imagery", () => {
  const generated = buildWebsitePackage({
    journey: { businessName: "Praktijk Julia", packageType: "starter" },
    briefing: "Branche: Holistische praktijk\nDiensten: Energetische begeleiding, Mindfulness\nCTA: Plan een kennismaking",
    version: 1,
  });
  assert.equal(generated.meta.industryIntelligence.subcategory, "holistische-praktijk");
  assert.equal(generated.meta.industryIntelligence.classificationStatus, "confirmed");
  assert.equal(generated.meta.industryImageSelection.groupSlug, "holistisch");
  const originals = Object.values(generated.meta.demoImageAssets).map((item) => item.originalSrc || "").join(" ");
  assert.match(originals, /\/holistisch\//);
  assert.doesNotMatch(originals, /bouwbedrijf|installatiebedrijf|timmerwerk/);
});

test("new unknown build packages the neutral professional fallback", () => {
  const generated = buildWebsitePackage({ journey: { businessName: "Aster Nova", packageType: "starter" }, briefing: "Doel: contact", version: 1 });
  assert.equal(generated.meta.industryIntelligence.classificationStatus, "neutral");
  assert.equal(generated.meta.industryImageSelection.groupSlug, "neutral-professional");
  assert.equal(generated.meta.industryImageSelection.fallbackGroupUsed, true);
  assert.doesNotMatch(generated.meta.heroImage.originalSrc, /installatiebedrijf/);
});

test("new carpentry build remains construction oriented", () => {
  const generated = buildWebsitePackage({ journey: { businessName: "De Houtlijn", packageType: "business" }, briefing: "Branche: Timmerbedrijf\nDiensten: Timmerwerk, Kozijnen", version: 1 });
  assert.equal(generated.meta.industryIntelligence.subcategory, "timmerbedrijf");
  assert.equal(generated.meta.industryImageSelection.groupSlug, "timmerwerk");
  assert.doesNotMatch(generated.meta.heroImage.originalSrc, /holistisch|schoonheidssalon/);
});

test("profile evidence is bounded and contains signals rather than copied website content", () => {
  const privateText = `Welkom ${"zeer prive tekst ".repeat(100)}`;
  const profile = buildIndustryProfile({ websiteScan: { title: "Holistische coaching", paragraphs: [privateText, "Meditatie en balans"] } });
  assert.ok(profile.evidence.length <= 40);
  assert.equal(JSON.stringify(profile).includes(privateText), false);
  assert.ok(profile.evidence.every((item) => Object.keys(item).sort().join(",") === "polarity,score,signal,source"));
});
