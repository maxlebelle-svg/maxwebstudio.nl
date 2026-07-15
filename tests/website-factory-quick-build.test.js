const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { normalizeWebsiteInput } = require("../functions/_website-input");
const { buildWebsitePackage, runQualityCheck } = require("../functions/_website-factory-core");
const { createBuildJob } = require("../functions/website-factory");

const root = path.join(__dirname, "..");
const factoryHtml = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const factoryBackend = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");
const demoBackend = fs.readFileSync(path.join(root, "functions/demo-journey.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");

function buildQuick(journey = {}, briefing = "") {
  const generatedPackage = buildWebsitePackage({
    journey: { businessName: "FatTrek", packageType: "starter", ...journey },
    briefing: briefing || "Branche: outdoor en reizen\nPlaats: Almere\nDoel: relevante aanvragen",
    version: 1,
  });
  return { generatedPackage, quality: runQualityCheck({ generatedPackage, journey }) };
}

test("new lead can build with only a business name", () => {
  const { generatedPackage, quality } = buildQuick({}, "Doel: relevante aanvragen");
  assert.equal(generatedPackage.businessName, "FatTrek");
  assert.equal(quality.passed, true);
});

test("new lead can build with business name and industry", () => {
  const { generatedPackage } = buildQuick({}, "Branche: outdoor en reizen\nDoel: kennismaking plannen");
  assert.ok(generatedPackage.meta.services.length >= 3);
});

test("explicit no-website context skips website use", () => {
  assert.deepEqual(normalizeWebsiteInput("fattrek.nl", { intent: "none", explicitNoWebsite: true }), {
    url: "", kind: "none", shouldScan: false, warning: "", fallbackAllowed: true,
  });
});

test("empty website input is a supported no-website state", () => {
  assert.equal(normalizeWebsiteInput("").kind, "none");
  const { generatedPackage } = buildQuick({ websiteUrl: "" });
  assert.equal(generatedPackage.meta.websiteUrl, "");
  assert.match(generatedPackage.meta.siteUrl, /^https:\/\/preview\.maxwebstudio\.nl\/fattrek$/);
});

test("bare domain is normalized only with explicit existing-website intent", () => {
  assert.equal(normalizeWebsiteInput("fattrek.nl").kind, "invalid");
  assert.equal(normalizeWebsiteInput("fattrek.nl", { intent: "existing" }).url, "https://fattrek.nl");
});

test("invalid website input falls back with a safe warning", () => {
  const result = normalizeWebsiteInput("dit is geen website", { intent: "existing" });
  assert.equal(result.url, "");
  assert.equal(result.shouldScan, false);
  assert.match(result.warning, /zonder websitescan/);
});

test("valid website with failed scan still builds from briefing data", () => {
  const { generatedPackage, quality } = buildQuick({
    websiteUrl: "https://fattrek.nl",
    websiteAnalysis: { ok: false, error: "scan_failed" },
  }, "Branche: outdoor en reizen\nPlaats: Almere");
  assert.equal(generatedPackage.meta.websiteUrl, "https://fattrek.nl");
  assert.equal(generatedPackage.meta.currentWebsite.sourceUrl, "");
  assert.equal(quality.passed, true);
});

test("scan failure uses branch defaults rather than blocking package generation", () => {
  const { generatedPackage } = buildQuick({ websiteAnalysis: { ok: false } }, "Branche: outdoor en reizen");
  assert.ok(generatedPackage.files.some((file) => file.path === "index.html"));
  assert.ok(generatedPackage.meta.services.length >= 3);
});

test("retry reuses an active build job without creating a duplicate", async () => {
  const journeyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const activeJob = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    demo_journey_id: journeyId,
    status: "quality_check",
    current_step: "run_quality_check",
    progress: 70,
    preview_version: 1,
    build_logs: [],
  };
  const methods = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    methods.push(options.method || "GET");
    const body = String(url).includes("demo_journeys")
      ? [{ id: journeyId, business_name: "FatTrek", created_by: "admin-id" }]
      : String(url).includes("website_build_jobs")
        ? [activeJob]
        : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  try {
    const result = await createBuildJob({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      admin: { id: "admin-id", role: "super_admin" },
    }, { demoJourneyId: journeyId });
    assert.equal(result.reusedExisting, true);
    assert.equal(result.job.id, activeJob.id);
    assert.equal(methods.includes("POST"), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test("frontend keeps concrete backend code, phase and request id visible", () => {
  assert.match(factoryHtml, /code === "UPSTREAM_TIMEOUT"/);
  assert.match(factoryHtml, /Fase: \$\{phase\}/);
  assert.match(factoryHtml, /Request-id: \$\{requestId\}/);
  assert.match(demoBackend, /warnings: \[websiteInput\.warning\]\.filter\(Boolean\)/);
});

test("Phase 2A selection mode remains wired and isolated", () => {
  assert.match(factoryHtml, /website-factory-preview-editor\.js/);
  assert.match(factoryHtml, /id="factory-preview-editor-toggle"/);
  assert.doesNotMatch(demoBackend, /editorMode\s*=\s*["']write/);
});

test("small-desktop header wraps actions without word-by-word title breaks", () => {
  assert.match(styles, /\.factory-guided-header h2\{[^}]*word-break:normal;overflow-wrap:normal/);
  assert.match(styles, /@media\(max-width:1180px\)\{\.factory-guided-header\{[^}]*flex-wrap:wrap/);
  assert.match(styles, /\.factory-guided-primary-actions\{[^}]*flex-wrap:wrap/);
  assert.match(factoryBackend, /BUILD_JOB_SUMMARY_FIELDS/);
  assert.match(factoryBackend, /Prefer: "return=minimal"/);
});
