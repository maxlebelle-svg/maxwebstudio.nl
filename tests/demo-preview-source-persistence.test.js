const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  PREVIEW_SOURCES,
  normalizePreviewSource,
  resolveActiveDemoPreview,
} = require("../functions/_demo-preview-source");

const root = path.join(__dirname, "..");
const backend = fs.readFileSync(path.join(root, "functions/demo-journey.js"), "utf8");
const factoryBackend = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");
const demoSites = fs.readFileSync(path.join(root, "public/admin-demo-sites.html"), "utf8");
const factoryUi = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");

const factoryFiles = [{ path: "index.html", content: "factory" }];
const manualPreview = { fileName: "manual.zip", files: [{ path: "index.html", content: "manual" }] };

test("normalizes legacy and canonical preview source values", () => {
  assert.equal(normalizePreviewSource("manual"), PREVIEW_SOURCES.MANUAL);
  assert.equal(normalizePreviewSource("manual_zip"), PREVIEW_SOURCES.MANUAL);
  assert.equal(normalizePreviewSource("factory"), PREVIEW_SOURCES.FACTORY);
  assert.equal(normalizePreviewSource("website_factory"), PREVIEW_SOURCES.FACTORY);
});

test("manual-only legacy demo resolves deterministically to manual ZIP", () => {
  const result = resolveActiveDemoPreview({ manualPreview });
  assert.equal(result.source, PREVIEW_SOURCES.MANUAL);
  assert.equal(result.available, true);
  assert.equal(result.isLegacyFallback, true);
  assert.equal(result.previewPackage.files[0].content, "manual");
});

test("factory-only demo resolves to Website Factory", () => {
  const result = resolveActiveDemoPreview({ files: factoryFiles });
  assert.equal(result.source, PREVIEW_SOURCES.FACTORY);
  assert.equal(result.available, true);
});

test("persisted manual selection wins when both sources exist", () => {
  const result = resolveActiveDemoPreview({ files: factoryFiles, manualPreview, savedDemoSite: { previewSource: "manual_zip" } });
  assert.equal(result.source, PREVIEW_SOURCES.MANUAL);
  assert.equal(result.previewPackage.files[0].content, "manual");
});

test("persisted Factory selection wins when both sources exist", () => {
  const result = resolveActiveDemoPreview({ files: factoryFiles, manualPreview, savedDemoSite: { previewSource: "website_factory" } });
  assert.equal(result.source, PREVIEW_SOURCES.FACTORY);
  assert.equal(result.previewPackage.files[0].content, "factory");
});

test("unavailable persisted selection is reported without silent fallback", () => {
  const result = resolveActiveDemoPreview({ files: factoryFiles, savedDemoSite: { previewSource: "manual_zip" } });
  assert.equal(result.source, PREVIEW_SOURCES.MANUAL);
  assert.equal(result.available, false);
  assert.equal(result.factoryAvailable, true);
});

test("manual upload and Factory generation preserve an existing selection", () => {
  assert.match(backend, /persistedSource = resolveActiveDemoPreview\(previewPackage\)\.persistedSource/);
  assert.doesNotMatch(backend, /manualPreview,[\s\S]{0,80}activePreviewSource: "manual"/);
  assert.match(factoryBackend, /persistedSource = storedPreviewSource\(existingPackage\)/);
  assert.match(factoryBackend, /existingPackage\.manualPreview/);
  assert.match(factoryBackend, /existingPackage\.savedDemoSite/);
});

test("Demo Sites persists selector changes idempotently on the journey", () => {
  assert.match(demoSites, /data-demo-preview-source=/);
  assert.match(demoSites, /action: "update_demo_preview_source"/);
  assert.match(backend, /id: current\.id, record/);
  assert.match(backend, /code: "protected_demo_version"/);
});

test("Factory upload copy confirms that the active source is unchanged", () => {
  assert.match(factoryUi, /De actieve previewbron is niet gewijzigd/);
  assert.match(factoryUi, /savedDemo\.previewSource/);
});
