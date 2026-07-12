const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const factory = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const upload = fs.readFileSync(path.join(root, "functions/admin-manual-preview.js"), "utf8");
const publication = fs.readFileSync(path.join(root, "functions/admin-preview-publication.js"), "utf8");

test("both visible ZIP entries use one direct picker binding", () => {
  assert.equal((factory.match(/<button[^>]*data-manual-zip-upload/g) || []).length, 2);
  assert.equal((factory.match(/factory-guided-shell"\)\?\.addEventListener\("click"/g) || []).length, 1);
  assert.match(factory, /function openManualZipPicker\(\)/);
  assert.match(factory, /manualZipInput\.value = ""/);
  assert.match(factory, /manualZipInput\.click\(\)/);
  assert.doesNotMatch(factory, /data-factory-proxy="demo-journey-upload-manual-zip"/);
  assert.equal((factory.match(/proxyClick\("demo-journey-upload-manual-zip"\)/g) || []).length, 2);
  assert.doesNotMatch(factory.slice(factory.indexOf("function initGuidedFactory")), /manualPreviewMeta\(\)|openManualZipPicker\(\)|activateManualPreview\(\)/);
});

test("manual upload has one change handler, duplicate guard and explicit states", () => {
  assert.equal((factory.match(/manualZipInput\?\.addEventListener\("change"/g) || []).length, 1);
  assert.match(factory, /manualZipUploading/);
  assert.match(factory, /Uploaden…/);
  assert.match(factory, /ZIP succesvol verwerkt/);
  assert.match(factory, /ZIP kon niet worden verwerkt/);
});

test("manual preview activation is persisted server-side and survives refresh", () => {
  assert.match(factory, /action: "activate"/);
  assert.match(upload, /async function activateManualVersion/);
  assert.match(upload, /is_active: false/);
  assert.match(upload, /is_active: true/);
  assert.match(upload, /activePreviewSource: "manual_zip"/);
  assert.match(upload, /persistJourneySource/);
  assert.match(factory, /loadedManualVersion\.isActive/);
});

test("manual publication uses the exact active version without requiring a Factory build or website", () => {
  assert.match(factory, /manualReady/);
  assert.match(factory, /website\?\.id \|\| ""/);
  assert.match(publication, /previewSource !== PREVIEW_SOURCES\.MANUAL/);
  assert.match(publication, /resolveStandaloneManualOwnership/);
  assert.match(publication, /target = previewSource === PREVIEW_SOURCES\.MANUAL \? selectedVersion/);
  assert.doesNotMatch(publication, /build_job_id[^\n]*required/i);
});

test("validated customer relationship keeps manual ZIP available when extended Factory context fails", () => {
  assert.match(factory, /function loadValidatedCustomerFallback\(customerId\)/);
  assert.match(factory, /\/api\/admin-relationship-context/);
  assert.match(factory, /data\.contractVersion !== 2/);
  assert.match(factory, /relationship\?\.entityType !== "customer"/);
  assert.match(factory, /relationship\?\.customerId !== customerId/);
  assert.match(factory, /fallbackLoaded = await loadValidatedCustomerFallback\(requestedCustomerId\)/);
});

test("Factory remains an alternative and source selection does not auto-switch after generation", () => {
  assert.match(factory, /previewSource = "factory"/);
  assert.match(factory, /data-preview-source="factory"/);
  assert.match(factory, /data-preview-source="manual"/);
  assert.match(factory, /if \(loadedManualVersion\.isActive\) previewSource = "manual"/);
});
