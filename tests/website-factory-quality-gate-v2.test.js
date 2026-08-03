"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildWebsitePackage, runQualityCheck } = require("../functions/_website-factory-core");
const { MINIMUM_CATEGORY_SCORE, MINIMUM_TOTAL_SCORE, QUALITY_GATE_VERSION } = require("../functions/website-factory/quality-rubric");

function generatedPackage() {
  return buildWebsitePackage({
    journey: { businessName: "De Groene Lijn", packageType: "starter" },
    briefing: "Branche: Hovenier\nRegio: Almere\nDiensten: Tuinontwerp, Tuinaanleg, Tuinonderhoud\nCTA: Vraag een tuinplan aan",
    version: 1,
  });
}

test("Quality Gate v2 reports category scores and requires a later browser review", () => {
  const report = runQualityCheck({ generatedPackage: generatedPackage(), journey: { businessName: "De Groene Lijn" } });

  assert.equal(report.version, QUALITY_GATE_VERSION);
  assert.equal(report.rubric, "max-webstudio-website-quality-v2");
  assert.equal(report.stage, "static_preflight");
  assert.equal(report.thresholds.total, MINIMUM_TOTAL_SCORE);
  assert.equal(report.thresholds.category, MINIMUM_CATEGORY_SCORE);
  assert.equal(report.passed, true);
  assert.equal(report.blockingChecks.length, 0);
  assert.deepEqual(Object.keys(report.categories), ["technical", "content", "conversion", "visualFoundation"]);
  assert.ok(Object.values(report.categories).every((category) => category.passed));
  assert.deepEqual(report.browserReview.viewports, ["mobile", "tablet", "desktop"]);
  assert.equal(report.browserReview.required, true);
  assert.equal(report.browserReview.status, "not_run");
  assert.deepEqual(report.readiness, {
    internalPreview: true,
    customerPreview: false,
    reason: "browser_review_required",
  });
});

test("a critical failure blocks preview even when the weighted score remains high", () => {
  const generated = generatedPackage();
  const entry = generated.files.find((file) => file.path === "index.html");
  entry.content = entry.content.replace(/<!doctype html>/i, "");
  const report = runQualityCheck({ generatedPackage: generated, journey: { businessName: "De Groene Lijn" } });

  assert.ok(report.score >= MINIMUM_TOTAL_SCORE);
  assert.equal(report.passed, false);
  assert.equal(report.status, "quality_failed");
  assert.ok(report.blockingChecks.some((item) => item.id === "html_document_valid"));
  assert.match(report.summary, /kritieke kwaliteitsfout/i);
});

test("an incomplete ZIP is a hard render blocker independent of average score", () => {
  const generated = generatedPackage();
  generated.files = generated.files.filter((file) => file.path !== "assets/logo.svg");
  const report = runQualityCheck({ generatedPackage: generated, journey: { businessName: "De Groene Lijn" } });
  const renderBlock = report.blockingChecks.find((item) => item.id === "render_package_complete");

  assert.equal(report.renderValidation.passed, false);
  assert.equal(report.passed, false);
  assert.ok(renderBlock);
  assert.ok(renderBlock.missing.includes("assets/logo.svg"));
});

test("quality checks expose stable identifiers, categories and criticality", () => {
  const report = runQualityCheck({ generatedPackage: generatedPackage(), journey: { businessName: "De Groene Lijn" } });
  const ids = new Set(report.checks.map((item) => item.id));

  assert.equal(ids.size, report.checks.length);
  assert.ok(report.checks.every((item) => item.id && item.category && typeof item.critical === "boolean"));
  assert.equal(report.checks.find((item) => item.id === "primary_cta_present").critical, true);
  assert.equal(report.checks.find((item) => item.id === "hero_visual_present").category, "visualFoundation");
});

test("tree-care output is specific, packaged locally and never falls back to generic sales copy", () => {
  const generated = buildWebsitePackage({
    journey: { businessName: "Boomverzorging Drenthe", websiteUrl: "https://boomverzorgingdrenthe.nl", packageType: "starter" },
    version: 2,
  });
  const html = generated.files.find((file) => file.path === "index.html").content;
  const report = runQualityCheck({ generatedPackage: generated, journey: { businessName: "Boomverzorging Drenthe" } });
  const imagePaths = generated.files.filter((file) => /^assets\/.+\.(?:jpe?g|png|webp)$/i.test(file.path)).map((file) => file.path);
  const serviceImages = [...html.matchAll(/class="[^"]*service-card[^"]*"[\s\S]{0,800}?<img src="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(generated.meta.industryId, "boomverzorging");
  assert.equal(generated.meta.industryProfile, "boomverzorging");
  assert.ok(generated.meta.contentQuality.classificationConfidence >= 0.8);
  assert.deepEqual(generated.meta.services.slice(0, 3), ["Bomen snoeien", "Boominspectie", "Bomen verwijderen"]);
  assert.match(html, /Bomen snoeien/);
  assert.match(html, /Boominspectie/);
  assert.match(html, /Vraag een boominspectie aan/);
  assert.match(html, /Vakkundig boomwerk voor iedere situatie/);
  assert.match(html, /Boominspectie aanvragen/);
  assert.doesNotMatch(html, /Een lokale specialist die online direct professioneel overkomt|Bekijk producten|Maakt praktisch duidelijk wat er gebeurt|huidadvies|huidvraag|behandeling plannen|persoonlijke verzorging/i);
  assert.match(html, /data-mws-field="secondary-cta" href="#diensten"/);
  assert.ok(imagePaths.length >= 5);
  assert.ok(imagePaths.every((path) => path.startsWith("assets/boomverzorging-")));
  assert.equal(serviceImages.length, 5);
  assert.equal(new Set(serviceImages).size, serviceImages.length);
  assert.equal(report.passed, true);
  assert.equal(report.checks.find((item) => item.id === "distinct_service_images").passed, true);
  assert.equal(report.checks.find((item) => item.id === "industry_context_specific").passed, true);
  assert.equal(report.checks.find((item) => item.id === "no_cross_industry_copy").passed, true);
});

test("duplicate service images are a hard quality blocker", () => {
  const generated = generatedPackage();
  const entry = generated.files.find((file) => file.path === "index.html");
  const serviceImages = [...entry.content.matchAll(/class="[^"]*service-card[^"]*"[\s\S]{0,800}?<img src="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(serviceImages.length >= 3);
  entry.content = entry.content.replaceAll(serviceImages[1], serviceImages[0]);

  const report = runQualityCheck({ generatedPackage: generated, journey: { businessName: "De Groene Lijn" } });
  assert.equal(report.passed, false);
  assert.ok(report.blockingChecks.some((item) => item.id === "distinct_service_images"));
});

test("service click galleries use static packaged images instead of broken runtime paths", () => {
  const generated = buildWebsitePackage({
    journey: { businessName: "Boomverzorging Drenthe", websiteUrl: "https://boomverzorgingdrenthe.nl", packageType: "starter" },
    briefing: "Branche: Boomverzorging\nDiensten: Boominspectie, Boomadvies en beheer, Bomen snoeien, Bomen verwijderen, Stormschade",
    version: 7,
  });
  const html = generated.files.find((file) => file.path === "index.html").content;
  const script = generated.files.find((file) => file.path === "script.js").content;
  const gallerySets = [...html.matchAll(/data-portfolio-service="([^"]+)"[^>]*>[\s\S]*?<\/div>/g)];
  const referencedImages = [...html.matchAll(/class="portfolio-item"><img src="([^"]+)"/g)].map((match) => match[1]);
  const packagedPaths = new Set(generated.files.map((file) => file.path));
  const report = runQualityCheck({ generatedPackage: generated, journey: { businessName: "Boomverzorging Drenthe" } });

  assert.equal(gallerySets.length, 5);
  assert.equal(referencedImages.length, 15);
  assert.ok(referencedImages.every((imagePath) => packagedPaths.has(imagePath)));
  assert.doesNotMatch(script, /portfolioGallery\.innerHTML|data\.images/);
  assert.match(script, /portfolioGalleries\.forEach/);
  assert.equal(report.checks.find((item) => item.id === "static_portfolio_images").passed, true);
});

test("website research keeps source categories and real social profiles in the generated site", () => {
  const generated = buildWebsitePackage({
    journey: {
      businessName: "Boomverzorging Drenthe",
      websiteUrl: "https://boomverzorgingdrenthe.nl",
      packageType: "starter",
      websiteAnalysis: {
        currentWebsite: {
          title: "Boomverzorging Drenthe",
          services: ["Boomverzorging", "Rooien", "Snoeien", "Aanplanten", "Stobbenfrezen", "Eikenprocessierups"],
          socialUrls: [
            "https://www.facebook.com/boomverzorgingdrenthe",
            "https://www.instagram.com/boomverzorgingdrenthe/",
          ],
        },
        aiBriefing: {
          industry: "Boomverzorging",
          services: ["Boomverzorging", "Rooien", "Snoeien", "Aanplanten", "Stobbenfrezen", "Eikenprocessierups"],
        },
      },
    },
    briefing: "Branche: Boomverzorging in Drenthe\nCTA: Vraag vrijblijvend een offerte aan",
    version: 8,
  });
  const html = generated.files.find((file) => file.path === "index.html").content;
  const report = runQualityCheck({ generatedPackage: generated, journey: { businessName: "Boomverzorging Drenthe" } });

  assert.deepEqual(generated.meta.services.slice(0, 6), ["Boomverzorging", "Rooien", "Snoeien", "Aanplanten", "Stobbenfrezen", "Eikenprocessierups"]);
  assert.match(html, />Rooien</);
  assert.match(html, />Stobbenfrezen</);
  assert.match(html, /https:\/\/www\.facebook\.com\/boomverzorgingdrenthe/);
  assert.match(html, /https:\/\/www\.instagram\.com\/boomverzorgingdrenthe\//);
  assert.match(html, /sameAs/);
  assert.doesNotMatch(html, /\"Duidelijk, professioneel|\"De belangrijkste informatie/);
  assert.equal(report.checks.find((item) => item.id === "source_social_links_preserved").passed, true);
  assert.equal(report.passed, true);
});

test("unknown companies are blocked instead of receiving a polished-looking generic preview", () => {
  const generated = buildWebsitePackage({ journey: { businessName: "Voorbeeldbedrijf" }, version: 1 });
  const report = runQualityCheck({ generatedPackage: generated, journey: { businessName: "Voorbeeldbedrijf" } });

  assert.equal(report.passed, false);
  assert.equal(report.readiness.customerPreview, false);
  assert.ok(report.blockingChecks.some((item) => item.id === "industry_context_specific"));
  assert.ok(report.blockingChecks.some((item) => item.id === "no_generic_fallback_copy"));
});

test("publication backend rejects an unapproved Factory version but keeps manual ZIP compatibility", () => {
  assert.throws(
    () => require("../functions/admin-preview-publication")._private.assertCustomerPreviewQualityReady({ generated_package: { meta: { previewSource: "factory_build" } }, quality_report: { readiness: { customerPreview: false }, browserReview: { status: "not_run" } } }),
    (error) => error.code === "PREVIEW_QUALITY_NOT_APPROVED" && error.status === 409,
  );
  assert.equal(require("../functions/admin-preview-publication")._private.assertCustomerPreviewQualityReady({ generated_package: { meta: { previewSource: "manual_zip" } } }), true);
});

test("beauty output uses treatment language and includes the mobile overflow safeguards", () => {
  const generated = buildWebsitePackage({
    journey: { businessName: "Studio Morgen", packageType: "starter" },
    briefing: "Branche: Schoonheidssalon\nDiensten: Huidanalyse, Gezichtsbehandeling, Huidadvies\nCTA: Plan een huidanalyse",
    version: 1,
  });
  const html = generated.files.find((file) => file.path === "index.html").content;
  const css = generated.files.find((file) => file.path === "styles.css").content;

  assert.match(html, /Ontdek welke behandeling bij u past/);
  assert.match(html, /Waar kunnen we u mee helpen/);
  assert.doesNotMatch(html, /Kies uw project|wat u wilt laten maken|waar het project is/i);
  assert.match(css, /body\{overflow-x:hidden\}/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /overflow-wrap:anywhere/);
});
