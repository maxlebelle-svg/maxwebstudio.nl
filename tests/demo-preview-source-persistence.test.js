const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
const demoJourney = require("../functions/demo-journey.js");
const demoCommercialActions = require("../public/admin/ui/demo-sites-commercial-actions");

const demoSelectionContext = { window: { DemoSitesCommercialActions: demoCommercialActions } };
const demoSelectionBlock = demoSites.slice(
  demoSites.indexOf("function savedDemoSiteMeta(record"),
  demoSites.indexOf("function isSavedDemoSite")
);
vm.runInNewContext(`${demoSelectionBlock}\nthis.demoSelection = { demoPreviewVersionSource, validDemoPreviewVersions, resolveActiveDemoPreview };`, demoSelectionContext);
const demoSelection = demoSelectionContext.demoSelection;

function storedVersion(id, sourceType, version = 1) {
  return { id, sourceType, version, previewUrl: `/preview/${id}`, fileCount: 1, renderable: true };
}

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

test("manual ZIP upload activates the concrete server-created preview version", () => {
  assert.match(factoryUi, /ZIP succesvol verwerkt/);
  assert.match(factoryUi, /activeVersion: normalizedVersion/);
  assert.match(factoryUi, /previewSource = "manual"/);
});

test("Demo Sites receives version history and the generic public pointer in its existing request", () => {
  assert.match(backend, /public_preview_publications/);
  assert.match(backend, /publicPreviewPublication/);
  assert.match(demoSites, /previewVersions: Array\.isArray\(data\.buildHistory\?\.previewVersions\)/);
  assert.match(demoSites, /publicPreviewPublication: data\.publicPreviewPublication/);
  assert.doesNotMatch(demoSites, /admin-preview-publication\?action=current/);
});

test("Demo Sites resolves concrete stored versions instead of removed journey package contents", () => {
  assert.match(demoSites, /savedDemo\.previewVersionId/);
  assert.match(demoSites, /publication\.previewVersionId/);
  assert.match(demoSites, /version\?\.renderable === true/);
  assert.match(demoSites, /previewResolution\.previewUrl/);
  assert.match(demoSites, /previewVersionId: selectedVersion\.id/);
  assert.match(backend, /selectedPreview = requestedPreviewVersionId \? await resolveSelectedDemoPreview/);
});

test("Demo Sites accepts compact renderable preview summaries without package files", () => {
  const compact = { ...storedVersion("compact-factory", "website_factory", 4), fileCount: 0 };
  const result = demoSelection.resolveActiveDemoPreview({ previewVersions: [compact] });
  assert.equal(result.available, true);
  assert.equal(result.selectedVersion.id, compact.id);
  assert.equal(result.previewUrl, compact.previewUrl);
});

test("Demo Sites is null-safe when selectedPreview and version entries are null", () => {
  assert.equal(demoSelection.demoPreviewVersionSource(null), "");
  assert.doesNotThrow(() => demoSelection.resolveActiveDemoPreview({ previewVersions: [null] }));
  const result = demoSelection.resolveActiveDemoPreview({ previewVersions: [null] });
  assert.equal(result.selectedVersion, null);
  assert.equal(result.previewUrl, "");
});

test("Demo Sites automatically selects the only valid concrete preview", () => {
  const only = storedVersion("factory-only", "website_factory", 4);
  const result = demoSelection.resolveActiveDemoPreview({ previewVersions: [null, { id: "broken" }, only] });
  assert.equal(result.selectedVersion.id, only.id);
  assert.equal(result.previewUrl, only.previewUrl);
  assert.equal(result.validVersions.length, 1);
});

test("Demo Sites requires a visible version selector when multiple valid previews exist", () => {
  const result = demoSelection.resolveActiveDemoPreview({
    previewVersions: [storedVersion("factory", "website_factory", 4), storedVersion("zip", "manual_zip", 2)],
  });
  assert.equal(result.selectedVersion, null);
  assert.equal(result.validVersions.length, 2);
  assert.match(demoSites, /previewResolution\.validVersions\.length > 1/);
  assert.match(demoSites, /data-demo-preview-version=/);
});

test("Demo Sites version changes send the exact selected previewVersionId", () => {
  const updateVersion = demoSites.slice(demoSites.indexOf("async function updatePreviewVersion"), demoSites.indexOf("function render()"));
  assert.match(updateVersion, /String\(version\.id\) === String\(previewVersionId\)/);
  assert.match(updateVersion, /previewVersionId: selectedVersion\.id/);
  assert.doesNotMatch(updateVersion, /versionsBySource/);
});

test("public preview publication metadata is compact and contains the safe fallback URL", () => {
  const publication = demoJourney._private.sanitizePublicPreviewPublication({
    id: "11111111-1111-4111-8111-111111111111",
    relationship_type: "lead",
    relationship_id: "22222222-2222-4222-8222-222222222222",
    preview_version_id: "33333333-3333-4333-8333-333333333333",
    public_slug: "heel-je-zelf",
    enabled: true,
    published_at: "2026-07-18T10:00:00.000Z",
    updated_at: "2026-07-18T10:00:00.000Z",
  });
  assert.equal(publication.publicPreviewUrl, "https://maxwebstudio.nl/preview/heel-je-zelf");
  assert.equal(publication.previewVersionId, "33333333-3333-4333-8333-333333333333");
  assert.equal(publication.publicPreviewEnabled, true);
  assert.equal("id" in publication, false);
});
