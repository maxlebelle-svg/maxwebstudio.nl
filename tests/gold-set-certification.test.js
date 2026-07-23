const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const goldRoot = path.join(root, "content-factory", "gold-set", "2026.1");
const evidenceRoot = path.join(root, "docs", "evidence", "gold-set", "2026.1");
const manifestPath = path.join(goldRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(goldRoot, "manifest.lock.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(evidenceRoot, "AUTOMATED_REPORT.json"), "utf8"));

test("Gold Set 2026.1 is immutable, uniquely numbered and within certification size", () => {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(manifestPath)).digest("hex");
  assert.equal(manifest.status, "frozen");
  assert.equal(hash, lock.manifest_sha256);
  assert.equal(manifest.cases.length, 24);
  assert.equal(lock.case_count, 24);
  assert.equal(new Set(manifest.cases.map((item) => item.id)).size, 24);
  assert.equal(manifest.minimum_blind_reviewers, 2);
  for (const item of manifest.cases) {
    assert.ok(item.company_name);
    assert.ok(item.vertical);
    assert.ok(item.style);
    assert.ok(item.brand_personality);
    assert.ok(item.theme);
    assert.ok(item.goal);
    assert.ok(item.region);
    assert.ok(Number.isSafeInteger(item.seed));
    assert.deepEqual(Object.keys(item.expected).sort(), ["brand_personality", "goal", "specialization", "style", "theme", "vertical"]);
  }
});

test("blind review package exposes A/B and no adapter mapping", () => {
  const reviewRoot = path.join(evidenceRoot, "review");
  const index = fs.readFileSync(path.join(reviewRoot, "index.html"), "utf8");
  assert.match(index, /Website A/);
  assert.match(index, /Website B/);
  assert.doesNotMatch(index, /content-factory-adapter|compositionSignature|rendererAdapterVersion|mapping_commitment/i);
  for (let caseNumber = 1; caseNumber <= 24; caseNumber += 1) {
    const folder = `case-${String(caseNumber).padStart(2, "0")}`;
    for (const side of ["A", "B"]) {
      const html = fs.readFileSync(path.join(reviewRoot, folder, `${side}.html`), "utf8");
      assert.match(html, /<!doctype html>/i);
      assert.doesNotMatch(html, /content-factory-adapter\/v[12]|composition_signature|rendererAdapterVersion/i);
    }
  }
  assert.equal(fs.existsSync(path.join(evidenceRoot, "REVEALED_MAPPING.json")), false);
});

test("certification stops honestly while Truth and human gates are incomplete", () => {
  assert.equal(report.status, "STOPPED_GOLD_SET_CERTIFICATION");
  assert.equal(report.certified, false);
  assert.equal(report.gates.frozen_manifest, true);
  assert.equal(report.gates.no_hallucination, false);
  assert.equal(report.gates.blind_human_assessment, false);
  assert.equal(report.gates.customer_success, false);
  assert.equal(report.cases.length, 24);
  assert.equal(report.cases.filter((item) => !item.no_regression.passed).length, 0);
  assert.equal(report.cases.filter((item) => item.objective_checks.v2.truth_evidence.blockers.includes("unverified_generated_projects")).length, 24);
  assert.equal(report.cases.filter((item) => item.objective_checks.v2.truth_evidence.blockers.includes("unverified_rendered_testimonials")).length, 23);
});

test("assessment contract requires every case, paired scores and paired decisions", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(goldRoot, "assessment.schema.json"), "utf8"));
  assert.equal(schema.properties.cases.minItems, 24);
  assert.equal(schema.properties.cases.maxItems, 24);
  assert.deepEqual(schema.$defs.pairScore.required, ["A", "B"]);
  assert.deepEqual(schema.$defs.pairDecision.required, ["A", "B"]);
});
