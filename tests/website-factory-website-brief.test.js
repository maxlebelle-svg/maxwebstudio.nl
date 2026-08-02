"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildWebsitePackage } = require("../functions/_website-factory-core");
const {
  WEBSITE_BRIEF_SCHEMA_VERSION,
  buildWebsiteBrief,
  websiteBriefToFactoryBriefing,
} = require("../functions/website-factory/website-brief");

const root = path.join(__dirname, "..");

test("legacy factory input is normalized into an immutable canonical website brief", () => {
  const journey = {
    businessName: "De Groene Lijn",
    websiteUrl: "https://degroenelijn.example",
    websiteAnalysis: { currentWebsite: { title: "Oude titel" } },
  };
  const brief = buildWebsiteBrief({
    journey,
    briefing: "Branche: Hovenier\nRegio: Almere\nCTA: Vraag een tuinplan aan",
  });

  assert.equal(brief.schemaVersion, WEBSITE_BRIEF_SCHEMA_VERSION);
  assert.equal(brief.source.kind, "legacy_briefing");
  assert.equal(brief.identity.businessName, "De Groene Lijn");
  assert.equal(brief.business.industry, "Hovenier");
  assert.equal(brief.business.region, "Almere");
  assert.equal(brief.site.primaryCta, "Vraag een tuinplan aan");
  assert.equal(Object.isFrozen(brief), true);
  assert.equal(Object.isFrozen(brief.business), true);
  assert.equal(Object.isFrozen(journey.websiteAnalysis), false);
});

test("structured website brief has precedence and converts to the legacy intelligence format", () => {
  const brief = buildWebsiteBrief({
    journey: {
      businessName: "Verkeerde legacy naam",
      websiteBrief: {
        schemaVersion: WEBSITE_BRIEF_SCHEMA_VERSION,
        source: { kind: "ai_website_wizard_intake" },
        identity: { businessName: "Studio Morgen" },
        business: {
          industry: "Schoonheidssalon",
          audience: "Klanten die huidverbetering zoeken",
          region: "Utrecht",
          services: ["Huidanalyse", "Gezichtsbehandeling"],
          uniqueValue: "Persoonlijke behandelplannen",
          goals: ["Meer afspraken"],
          toneOfVoice: "Warm en deskundig",
        },
        brand: { desiredStyle: "Licht en verfijnd", blockedColors: ["felrood"] },
        site: { primaryCta: "Plan een huidanalyse", desiredPages: ["Home", "Behandelingen"] },
        seo: { keywords: ["huidanalyse Utrecht"] },
      },
    },
    briefing: "Branche: Timmerbedrijf\nCTA: Vraag een offerte aan",
  });
  const factoryBriefing = websiteBriefToFactoryBriefing(brief);

  assert.equal(brief.identity.businessName, "Studio Morgen");
  assert.equal(brief.business.industry, "Schoonheidssalon");
  assert.deepEqual(brief.business.services, ["Huidanalyse", "Gezichtsbehandeling"]);
  assert.match(factoryBriefing, /Branche: Schoonheidssalon/);
  assert.match(factoryBriefing, /Diensten: Huidanalyse, Gezichtsbehandeling/);
  assert.match(factoryBriefing, /CTA: Plan een huidanalyse/);
});

test("website factory consumes the canonical brief and preserves it in the ZIP manifest", () => {
  const generated = buildWebsitePackage({
    journey: {
      packageType: "starter",
      websiteBrief: {
        schemaVersion: WEBSITE_BRIEF_SCHEMA_VERSION,
        source: { kind: "ai_website_wizard_intake" },
        identity: { businessName: "Studio Morgen", contactName: "Mila" },
        business: {
          industry: "Schoonheidssalon",
          audience: "Klanten die huidverbetering zoeken",
          region: "Utrecht",
          services: ["Huidanalyse", "Gezichtsbehandeling", "Huidadvies"],
          uniqueValue: "Persoonlijke behandelplannen",
          goals: ["Meer afspraken"],
          toneOfVoice: "Warm en deskundig",
        },
        brand: {
          desiredStyle: "Licht en verfijnd",
          colors: { ink: "#241b22", brand: "#765667", accent: "#d3a98f", soft: "#fbf6f5", dark: "#30232b" },
        },
        site: { primaryCta: "Plan een huidanalyse", packageType: "starter" },
        seo: { keywords: ["huidanalyse Utrecht"], serviceArea: "Utrecht" },
        contact: { email: "info@studiomorgen.example", phone: "030-1234567" },
      },
    },
    briefing: "Branche: Timmerbedrijf",
    version: 1,
  });
  const briefingFile = JSON.parse(generated.files.find((file) => file.path === "briefing.json").content);
  const html = generated.files.find((file) => file.path === "index.html").content;

  assert.equal(generated.businessName, "Studio Morgen");
  assert.equal(generated.meta.websiteBrief.schemaVersion, WEBSITE_BRIEF_SCHEMA_VERSION);
  assert.equal(generated.meta.industryIntelligence.subcategory, "schoonheidssalon");
  assert.deepEqual(generated.meta.services.slice(0, 3), ["Huidanalyse", "Gezichtsbehandeling", "Huidadvies"]);
  assert.equal(generated.meta.ctaPreference, "Plan een huidanalyse");
  assert.equal(generated.meta.colors.brand, "#765667");
  assert.equal(briefingFile.websiteBrief.business.region, "Utrecht");
  assert.match(html, /Plan een huidanalyse/);
  assert.equal(generated.meta.factoryConfig.industry.id, "schoonheidssalon");
  assert.doesNotMatch(JSON.stringify(generated.meta.services), /timmer|kozijn/i);
});

test("AI Website Wizard emits the same canonical website brief version", () => {
  const source = fs.readFileSync(path.join(root, "public/src/services/aiWebsiteWizardService.js"), "utf8");
  assert.match(source, /WEBSITE_BRIEF_SCHEMA_VERSION = "mws\.website-brief\.v1"/);
  assert.match(source, /function buildWebsiteBriefFromIntake/);
  assert.match(source, /websiteBrief: buildWebsiteBriefFromIntake/);
});
