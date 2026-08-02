"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BROWSER_REVIEW_SCHEMA_VERSION,
  REQUIRED_CHECKS,
  evaluateBrowserReview,
} = require("../functions/website-factory/browser-review");

const ARTIFACT_HASH = "a".repeat(64);

function passingEvidence() {
  return {
    schemaVersion: BROWSER_REVIEW_SCHEMA_VERSION,
    artifactHash: ARTIFACT_HASH,
    reviewedAt: "2026-08-02T20:00:00.000Z",
    provider: "max-webstudio-browser-reviewer-v1",
    viewports: {
      mobile: viewport(390, 844, 91),
      tablet: viewport(768, 1024, 92),
      desktop: viewport(1440, 1000, 94),
    },
  };
}

function viewport(width, height, visualScore) {
  return {
    width,
    height,
    visualScore,
    screenshotRef: `artifact://${width}x${height}.png`,
    checks: Object.fromEntries(REQUIRED_CHECKS.map((key) => [key, { status: "passed", details: "Gecontroleerd." }])),
  };
}

test("complete browser evidence unlocks customer preview after the static gate", () => {
  const report = evaluateBrowserReview({ staticReport: { passed: true }, evidence: passingEvidence() });

  assert.equal(report.passed, true);
  assert.equal(report.status, "passed");
  assert.equal(report.score, 92);
  assert.equal(report.blockers.length, 0);
  assert.equal(report.readiness.internalPreview, true);
  assert.equal(report.readiness.customerPreview, true);
  assert.ok(Object.values(report.viewports).every((item) => item.passed));
});

test("all three viewport reviews and screenshots are mandatory", () => {
  const evidence = passingEvidence();
  delete evidence.viewports.tablet;
  const report = evaluateBrowserReview({ staticReport: { passed: true }, evidence });

  assert.equal(report.passed, false);
  assert.equal(report.readiness.customerPreview, false);
  assert.ok(report.blockers.some((item) => item.id === "tablet_dimensions"));
  assert.ok(report.blockers.some((item) => item.id === "tablet_screenshot"));
});

test("a console failure is a hard publication blocker", () => {
  const evidence = passingEvidence();
  evidence.viewports.mobile.checks.console = { status: "failed", details: "ReferenceError in script.js" };
  const report = evaluateBrowserReview({ staticReport: { passed: true }, evidence });

  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((item) => item.id === "mobile_console" && item.reason === "critical_browser_check_failed"));
});

test("a weak visual score blocks an otherwise technically green review", () => {
  const evidence = passingEvidence();
  evidence.viewports.mobile.visualScore = 65;
  evidence.viewports.tablet.visualScore = 70;
  evidence.viewports.desktop.visualScore = 75;
  const report = evaluateBrowserReview({ staticReport: { passed: true }, evidence });

  assert.equal(report.score, 70);
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((item) => item.id === "visual_score"));
});

test("browser evidence can never override a failed static gate", () => {
  const report = evaluateBrowserReview({ staticReport: { passed: false }, evidence: passingEvidence() });

  assert.equal(report.passed, false);
  assert.equal(report.readiness.internalPreview, false);
  assert.ok(report.blockers.some((item) => item.id === "static_quality_gate"));
});

test("unidentified or stale-shaped evidence fails closed", () => {
  const evidence = passingEvidence();
  evidence.schemaVersion = "legacy";
  evidence.artifactHash = "not-a-hash";
  evidence.reviewedAt = "invalid";
  evidence.provider = "";
  const report = evaluateBrowserReview({ staticReport: { passed: true }, evidence });

  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((item) => item.id === "browser_review_schema"));
  assert.ok(report.blockers.some((item) => item.id === "artifact_identity"));
  assert.ok(report.blockers.some((item) => item.id === "review_timestamp"));
  assert.ok(report.blockers.some((item) => item.id === "review_provider"));
});
