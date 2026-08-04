"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { BROWSER_REVIEW_SCHEMA_VERSION, REQUIRED_CHECKS } = require("../functions/website-factory/browser-review");
const {
  MAX_BROWSER_REPAIR_ATTEMPTS,
  REPAIR_STYLE_MARKER,
  applyAutomaticBrowserRepairs,
  artifactHashForPackage,
  processBrowserReview,
} = require("../functions/website-factory/browser-repair-loop");

function generatedPackage() {
  return {
    entryFile: "index.html",
    files: [
      { path: "index.html", content: '<!doctype html><html><body><form><input name="email"></form></body></html>' },
      { path: "styles.css", content: "body{margin:0}" },
      { path: "script.js", content: "document.documentElement.dataset.ready='true';" },
    ],
    meta: { packageType: "starter" },
  };
}

function evidenceFor(pkg, failures = []) {
  const failed = new Set(failures);
  const viewport = (name, width, height, score = 90) => ({
    width,
    height,
    visualScore: score,
    screenshotRef: `artifact://${name}.png`,
    checks: Object.fromEntries(REQUIRED_CHECKS.map((check) => [check, {
      status: failed.has(`${name}_${check}`) ? "failed" : "passed",
      details: failed.has(`${name}_${check}`) ? "Herstel nodig." : "Gecontroleerd.",
    }])),
  });
  return {
    schemaVersion: BROWSER_REVIEW_SCHEMA_VERSION,
    artifactHash: artifactHashForPackage(pkg),
    reviewedAt: "2026-08-02T22:00:00.000Z",
    provider: "max-webstudio-browser-reviewer-v1",
    viewports: {
      mobile: viewport("mobile", 390, 844),
      tablet: viewport("tablet", 768, 1024),
      desktop: viewport("desktop", 1440, 1000),
    },
  };
}

test("a trusted green browser review unlocks the customer preview", () => {
  const pkg = generatedPackage();
  const result = processBrowserReview({ staticReport: { passed: true, score: 96 }, evidence: evidenceFor(pkg), generatedPackage: pkg });

  assert.equal(result.report.passed, true);
  assert.equal(result.qualityReport.readiness.customerPreview, true);
  assert.equal(result.browserRepair.status, "passed");
  assert.equal(result.browserRepair.attempts, 0);
});

test("browser evidence for another artifact fails closed", () => {
  const pkg = generatedPackage();
  const evidence = evidenceFor(pkg);
  evidence.artifactHash = "b".repeat(64);
  const result = processBrowserReview({ staticReport: { passed: true }, evidence, generatedPackage: pkg });

  assert.equal(result.report.passed, false);
  assert.equal(result.qualityReport.readiness.customerPreview, false);
  assert.ok(result.report.blockers.some((item) => item.id === "artifact_hash_mismatch"));
});

test("browser evidence can be checked against a trusted stored checksum without loading the package", () => {
  const pkg = generatedPackage();
  const expectedArtifactHash = artifactHashForPackage(pkg);
  const result = processBrowserReview({
    staticReport: { passed: true, score: 96 },
    evidence: evidenceFor(pkg),
    expectedArtifactHash,
  });

  assert.equal(result.report.passed, true);
  assert.equal(result.browserRepair.artifactHash, expectedArtifactHash);
});

test("layout, overflow and form failures produce a deterministic repaired package", () => {
  const pkg = generatedPackage();
  const result = processBrowserReview({
    staticReport: { passed: true, score: 96 },
    evidence: evidenceFor(pkg, ["mobile_layout", "tablet_overflow", "desktop_forms"]),
    generatedPackage: pkg,
  });
  const repaired = applyAutomaticBrowserRepairs({ generatedPackage: pkg, browserRepair: result.browserRepair });

  assert.equal(result.browserRepair.status, "repair_required");
  assert.equal(repaired.changed, true);
  assert.deepEqual(repaired.applied.sort(), ["form_accessibility", "responsive_safety"]);
  assert.match(repaired.generatedPackage.files.find((file) => file.path === "styles.css").content, new RegExp(REPAIR_STYLE_MARKER.replace(/[/*]/g, "\\$&")));
  assert.match(repaired.generatedPackage.files.find((file) => file.path === "index.html").content, /aria-label="Email"/);
  assert.notEqual(artifactHashForPackage(repaired.generatedPackage), artifactHashForPackage(pkg));
});

test("runtime failures stay fail-closed instead of receiving a speculative repair", () => {
  const pkg = generatedPackage();
  const result = processBrowserReview({
    staticReport: { passed: true },
    evidence: evidenceFor(pkg, ["desktop_console"]),
    generatedPackage: pkg,
  });
  const repaired = applyAutomaticBrowserRepairs({ generatedPackage: pkg, browserRepair: result.browserRepair });

  assert.equal(repaired.changed, false);
  assert.ok(result.browserRepair.repairPlan.some((item) => item.id === "runtime_repair" && item.automatic === false));
});

test("missing image assets require manual repair instead of a speculative CSS rewrite", () => {
  const pkg = generatedPackage();
  const evidence = evidenceFor(pkg, ["mobile_layout", "mobile_typography"]);
  evidence.viewports.mobile.checks.layout.details = "0 afgekapte elementen; 0 overlaprisico's; 25 ontbrekende afbeeldingen.";
  const result = processBrowserReview({
    staticReport: { passed: true },
    evidence,
    generatedPackage: pkg,
  });
  const repaired = applyAutomaticBrowserRepairs({ generatedPackage: pkg, browserRepair: result.browserRepair });

  assert.deepEqual(result.browserRepair.repairPlan, [{
    id: "asset_repair",
    automatic: false,
    message: "Ontbrekende afbeeldingen vereisen herstel van de website-assets.",
  }]);
  assert.equal(repaired.changed, false);
});

test("the repair loop stops after the configured number of automatic attempts", () => {
  const pkg = generatedPackage();
  const previousQualityReport = { browserRepair: { attempts: MAX_BROWSER_REPAIR_ATTEMPTS } };
  const result = processBrowserReview({
    staticReport: { passed: true },
    evidence: evidenceFor(pkg, ["mobile_overflow"]),
    generatedPackage: pkg,
    previousQualityReport,
  });

  assert.equal(result.browserRepair.attempts, MAX_BROWSER_REPAIR_ATTEMPTS + 1);
  assert.equal(result.browserRepair.retryAvailable, false);
  assert.equal(result.browserRepair.status, "manual_review_required");
});

test("the Factory endpoint and employee view expose the browser repair loop", () => {
  const root = path.join(__dirname, "..");
  const endpoint = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");
  const factoryView = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");

  assert.match(endpoint, /action === "submit_browser_review"/);
  assert.match(endpoint, /BROWSER_ARTIFACT_MISMATCH/);
  assert.match(endpoint, /readBuildJobReviewById\(context, jobId\)/);
  assert.match(endpoint, /automaticRepairPlanned/);
  assert.match(endpoint, /current_step: retryAvailable \? "browser_review_required" : "browser_review_failed"/);
  assert.match(endpoint, /customerPreviewReady: true/);
  assert.match(factoryView, /\["Browsercontrole", browserStatus\]/);
  assert.match(factoryView, /\["Reparatiepogingen"/);
  assert.match(factoryView, /\["Klantpreview", customerPreviewReady/);
});
