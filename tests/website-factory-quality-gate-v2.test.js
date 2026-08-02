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
