const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const factory = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const upload = fs.readFileSync(path.join(root, "functions/admin-manual-preview.js"), "utf8");
const publication = fs.readFileSync(path.join(root, "functions/admin-preview-publication.js"), "utf8");
const zipDownload = fs.readFileSync(path.join(root, "functions/admin-preview-zip-download.js"), "utf8");
const demoPreview = fs.readFileSync(path.join(root, "functions/demo-preview.js"), "utf8");

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
  assert.match(factory, /id="demo-journey-manual-zip-input" type="file" accept="\.zip,application\/zip"/);
  assert.doesNotMatch(factory, /id="demo-journey-manual-zip-input"[^>]*hidden/);
  assert.match(factory, /id="demo-journey-manual-zip-name"/);
  assert.match(factory, /id="demo-journey-process-manual-zip"/);
  assert.match(factory, /id="factory-process-manual-zip"/);
  assert.match(factory, /function syncGuidedZipProcess\(\)/);
  assert.match(factory, /proxyClick\("demo-journey-process-manual-zip"\)/);
  assert.match(factory, /elements\.uploadManualZip\?\.addEventListener\("click"[\s\S]*openManualZipPicker\(\)/);
  assert.match(factory, /elements\.processManualZip\?\.addEventListener\("click"[\s\S]*uploadManualZipFile\(pendingManualZipFile\)/);
  assert.match(factory, /manualZipUploading/);
  assert.match(factory, /Uploaden…/);
  assert.match(factory, /ZIP succesvol verwerkt/);
  assert.match(factory, /ZIP kon niet worden verwerkt/);
});

test("customerId mode does not wait for unrelated lead and Demo Journey loading", () => {
  const init = factory.slice(factory.indexOf("async function init()"), factory.indexOf("function initGuidedFactory"));
  assert.match(init, /(?:const|let) requestedCustomerId[\s\S]*if \(requestedCustomerId\)/);
  assert.match(init, /if \(requestedCustomerId\)[\s\S]*renderMetrics\(\);[\s\S]*return;[\s\S]*await loadLeads\(\)/);
  assert.doesNotMatch(init.slice(0, init.indexOf("if (requestedCustomerId)")), /await loadLeads\(\)/);
});

test("backend and frontend expose concrete failure codes and request ids", () => {
  assert.match(upload, /requestId/);
  assert.match(upload, /phaseForCode/);
  assert.match(upload, /databaseCode/);
  assert.match(factory, /response\.headers\.get\("x-nf-request-id"\)/);
  assert.match(factory, /Request-id:/);
});

test("manual preview activation is persisted server-side and survives refresh", () => {
  assert.match(factory, /action: "activate"/);
  assert.match(upload, /async function activateManualVersion/);
  assert.match(upload, /is_active: false/);
  assert.match(upload, /is_active: true/);
  assert.match(upload, /activePreviewSource: "manual_zip"/);
  assert.match(upload, /persistJourneySource/);
  assert.match(factory, /loadedManualVersion\.isActive/);
  assert.match(upload, /ensureManualPreviewUrl/);
  assert.match(upload, /manual-preview-render\?version=/);
  assert.match(factory, /manualPreviewUrlForVersion/);
  assert.match(factory, /Handmatige preview klaar/);
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
  assert.match(factory, /\{ "X-Relationship-Contract": "2" \}/);
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

test("ZIP download uses the active visible version and a separate prepare status", () => {
  assert.match(factory, /function previewDownloadContext\(\)/);
  assert.match(factory, /activePreviewSource\(\)/);
  assert.match(factory, /previewVersionId: version\.id/);
  assert.match(factory, /source: source === "manual" \? "manual_zip" : "factory"/);
  assert.match(factory, /admin-preview-zip-download/);
  assert.match(factory, /ZIP wordt voorbereid…/);
  assert.match(factory, /state: "not_prepared"/);
  assert.match(factory, /state: "preparing"/);
  assert.match(factory, /state: "ready"/);
  assert.match(factory, /state: "failed"/);
  assert.doesNotMatch(factory, /function previewZipUrl\(/);
  assert.doesNotMatch(factory, /format=zip/);
});

test("ZIP route is admin scoped, storage backed and returns no archive body", () => {
  assert.match(zipDownload, /allowedRoles: ROLES/);
  assert.match(zipDownload, /"super_admin", "admin", "sales_manager"/);
  assert.doesNotMatch(zipDownload, /sales_partner/);
  assert.match(zipDownload, /assertRequestedScope/);
  assert.match(zipDownload, /assertStoredRelations/);
  assert.match(zipDownload, /SIGNED_URL_SECONDS = 300/);
  assert.match(zipDownload, /storage\/v1\/object\/sign/);
  assert.doesNotMatch(zipDownload, /isBase64Encoded/);
  assert.match(demoPreview, /ZIP_DOWNLOAD_ROUTE_REQUIRED/);
  assert.doesNotMatch(demoPreview, /createZip|zip\.toString\("base64"\)/);
});

test("manual preview URLs keep one exact version and read-only capability", () => {
  assert.match(factory, /manual-preview-render\?version=.*source=manual_zip.*previewVersionId=/);
  assert.match(factory, /Preview klaar — alleen-lezen/);
  assert.match(factory, /setQueryParam\(sourcedUrl, "previewVersionId", version\.id\)/);
});
