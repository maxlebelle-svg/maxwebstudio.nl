const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sources = require("../public/admin/ui/website-factory-preview-sources.js");
const factoryHtml = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const upload = fs.readFileSync(path.join(root, "functions/admin-manual-preview.js"), "utf8");
const factoryBackend = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");

function version(id, sourceType, overrides = {}) {
  return {
    id,
    sourceType,
    version: overrides.version || 1,
    previewUrl: `/preview/${id}`,
    renderable: true,
    isActive: false,
    createdAt: overrides.createdAt || "2026-07-17T10:00:00.000Z",
    status: "internal",
    editorAvailable: sourceType === "factory_build",
    ...overrides,
  };
}

test("1 only Factory preview selects Factory without requiring a selector", () => {
  const selected = sources.chooseViewedVersion({ versions: [version("factory-1", "factory_build")] });
  assert.equal(selected.sourceType, "factory_build");
  assert.equal(new Set(sources.usableVersions([selected]).map((item) => item.sourceType)).size, 1);
});

test("2 only ZIP preview selects ZIP and remains renderable", () => {
  const selected = sources.chooseViewedVersion({ versions: [version("zip-1", "manual_zip", { editorAvailable: false })] });
  assert.equal(selected.sourceType, "manual_zip");
  assert.equal(selected.previewUrl, "/preview/zip-1");
});

test("3 both sources are represented as first-class versions", () => {
  const grouped = sources.versionsBySource([version("f", "factory_build"), version("z", "manual_zip")]);
  assert.equal(grouped.factory_build.length, 1);
  assert.equal(grouped.manual_zip.length, 1);
  assert.match(factoryHtml, /id="factory-preview-view-selector"/);
});

test("4 switching Factory to ZIP resolves the latest ZIP", () => {
  assert.equal(sources.latestForSource([version("f", "factory_build"), version("z", "manual_zip")], "manual_zip").id, "z");
});

test("5 switching ZIP to Factory resolves the latest Factory", () => {
  assert.equal(sources.latestForSource([version("z", "manual_zip"), version("f", "factory_build")], "factory_build").id, "f");
});

test("6 exact preview URLs stay attached to their version ids", () => {
  const versions = sources.usableVersions([version("f", "factory_build"), version("z", "manual_zip")]);
  assert.equal(versions.find((item) => item.id === "f").previewUrl, "/preview/f");
  assert.equal(versions.find((item) => item.id === "z").previewUrl, "/preview/z");
  assert.match(factoryHtml, /setQueryParam\(sourcedUrl, "previewVersionId", version\.id\)/);
});

test("7 device mode is independent from preview version switching", () => {
  const switcher = factoryHtml.slice(factoryHtml.indexOf("function viewPreviewVersion"), factoryHtml.indexOf("function activeFactoryPreviewVersion"));
  assert.doesNotMatch(switcher, /preview-mode|guidedPreviewMode|previewShell/);
});

test("8 viewing a source performs no activation request or database mutation", () => {
  const handler = factoryHtml.slice(factoryHtml.indexOf('id="factory-preview-view-selector"') > -1 ? factoryHtml.indexOf('document.getElementById("factory-preview-view-selector")?.addEventListener("click"') : 0, factoryHtml.indexOf('document.getElementById("factory-preview-view-selector")?.addEventListener("keydown"'));
  assert.match(handler, /viewPreviewVersion/);
  assert.doesNotMatch(handler, /apiRequest|activateManualPreview|is_active|timeline/);
});

test("9 a new Factory build does not delete stored ZIP versions", () => {
  assert.doesNotMatch(factoryBackend, /website_preview_versions[^\n]+method:\s*"DELETE"/);
  assert.match(factoryBackend, /previewSource: "website_factory"/);
});

test("10 a new ZIP upload does not overwrite or deactivate Factory versions", () => {
  const uploadFlow = upload.slice(upload.indexOf("if (action === \"activate\")"), upload.indexOf("async function activateManualVersion"));
  assert.match(uploadFlow, /is_active: false/);
  assert.doesNotMatch(uploadFlow, /setActiveManualVersion|persistJourneySource/);
});

test("11 ZIP is read-only and explains how to change it", () => {
  assert.equal(sources.normalize(version("z", "manual_zip", { editorAvailable: true })).editable, false);
  assert.match(factoryHtml, /Deze ZIP-preview is alleen-lezen/);
  assert.match(factoryHtml, /editorToggle\.disabled = source === "manual"/);
});

test("12 Factory editing remains available with editor markers", () => {
  assert.equal(sources.normalize(version("f", "factory_build", { editorAvailable: true })).editable, true);
  assert.match(factoryHtml, /factory-preview-editor-toggle/);
});

test("13 defective ZIP previews are excluded or show an explicit load error", () => {
  assert.equal(sources.usableVersions([version("z", "manual_zip", { renderable: false })]).length, 0);
  assert.match(factoryHtml, /Deze preview kon niet worden geladen\./);
});

test("14 defective Factory previews are excluded or show an explicit load error", () => {
  assert.equal(sources.usableVersions([version("f", "factory_build", { previewUrl: "" })]).length, 0);
  assert.match(factoryHtml, /factory-preview-retry/);
});

test("15 version history offers Bekijken for every usable source version", () => {
  assert.match(factoryHtml, /factory-preview-version-history-list/);
  assert.match(factoryHtml, /data-view-preview-version/);
  assert.match(factoryHtml, />Bekijken</);
});

test("16 a valid browser-session choice wins over the active version", () => {
  const selected = sources.chooseViewedVersion({ versions: [version("active", "factory_build", { isActive: true }), version("session", "manual_zip")], sessionVersionId: "session", activeVersionId: "active" });
  assert.equal(selected.id, "session");
});

test("17 a stale browser-session choice falls back to the active version", () => {
  const selected = sources.chooseViewedVersion({ versions: [version("active", "factory_build", { isActive: true })], sessionVersionId: "gone", activeVersionId: "active" });
  assert.equal(selected.id, "active");
});

test("18 mobile controls wrap without horizontal overflow", () => {
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*factory-preview-view-selector[\s\S]*width: 100%/);
  assert.match(styles, /factory-preview-view-selector button \{ flex: 1 1 9rem; \}/);
});

test("19 source selector supports keyboard arrows and native button focus", () => {
  assert.match(factoryHtml, /\["ArrowLeft", "ArrowRight"\]\.includes\(event\.key\)/);
  assert.match(factoryHtml, /buttons\[next\]\.focus\(\)/);
  assert.match(factoryHtml, /role="group" aria-label="Previewbron"/);
});

test("20 only-ZIP mode does not depend on a Factory journey package", () => {
  const selected = sources.chooseViewedVersion({ versions: [version("zip-only", "manual_zip", { isActive: false })], activeVersionId: "" });
  assert.equal(selected.id, "zip-only");
  assert.equal(selected.renderable, true);
});

test("source metadata includes labels, identity, ownership and hashes", () => {
  const normalized = sources.normalize(version("z", "manual_zip", { metadata: { fileName: "site.zip", manualZipContentHash: "abc" } }));
  assert.equal(normalized.sourceLabel, "Geüploade ZIP");
  assert.equal(normalized.fileName, "site.zip");
  assert.equal(normalized.contentHash, "abc");
  for (const key of ["id", "sourceType", "sourceLabel", "createdAt", "status", "previewUrl", "editable", "active", "buildJobId", "uploadId", "contentHash"]) assert.ok(Object.hasOwn(normalized, key));
});

test("viewed and active preview terminology is explicit", () => {
  assert.match(factoryHtml, /Je bekijkt nu/);
  assert.match(factoryHtml, /Actieve klantpreview/);
  assert.doesNotMatch(factoryHtml, /\["Actieve bron", source\]/);
});

test("guided version metadata uses only the public runtime bridge", () => {
  const start = factoryHtml.indexOf("function renderGuidedVersionMeta()");
  const end = factoryHtml.indexOf("function syncPrimaryAction()", start);
  const guidedMeta = factoryHtml.slice(start, end);
  assert.match(guidedMeta, /window\.WebsiteFactoryRuntime/);
  assert.match(guidedMeta, /window\.WebsiteFactoryPreviewSources/);
  assert.match(guidedMeta, /runtime\.viewedPreviewVersionId/);
  assert.doesNotMatch(guidedMeta, /previewSourceApi\(|selectedViewedPreviewVersion\(|formatDate\(|(?<!runtime\.)journey\?/);
});
