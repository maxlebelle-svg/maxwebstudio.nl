const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const publication = require("../functions/admin-preview-publication");

const root = path.join(__dirname, "..");
const factoryUi = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const publicationBackend = fs.readFileSync(path.join(root, "functions/admin-preview-publication.js"), "utf8");
const clientVersions = fs.readFileSync(path.join(root, "functions/client-preview-versions.js"), "utf8");
const clientRender = fs.readFileSync(path.join(root, "functions/client-preview-render.js"), "utf8");
const portal = fs.readFileSync(path.join(root, "public/klantportaal.html"), "utf8");
const previewEmbed = fs.readFileSync(path.join(root, "public/preview-embed.html"), "utf8");

test("Website Factory keeps Demo Sites and customer publication as separate actions", () => {
  assert.match(factoryUi, /id="factory-primary-save-demo"[^>]*>Opslaan in Demo Sites/);
  assert.match(factoryUi, /id="factory-publish-customer-preview"[^>]*>Publiceren naar klantportaal/);
  assert.match(factoryUi, /action: "publish_customer_preview"/);
  assert.match(factoryUi, /withJourneyLock\("publish_customer_preview"/);
});

test("admin publishes server-resolved content instead of trusting a preview URL", () => {
  assert.match(publicationBackend, /resolveActiveDemoPreview\(journeyPackage, previewSource\)/);
  assert.match(publicationBackend, /directManualPackage/);
  assert.match(publicationBackend, /selectedPackage = directManualPackage/);
  assert.doesNotMatch(factoryUi, /previewUrl:\s*activePreviewUrl\(\)/);
});

test("publication is ownership checked and version bound", () => {
  for (const code of ["PREVIEW_CUSTOMER_REQUIRED", "PREVIEW_CUSTOMER_MISMATCH", "PREVIEW_SOURCE_UNAVAILABLE", "PREVIEW_NOT_FOUND"]) {
    assert.match(publicationBackend, new RegExp(code));
  }
  assert.match(publicationBackend, /previewVersionId: target\.id/);
  assert.match(publicationBackend, /status: "internal"/);
  assert.match(publicationBackend, /feedback_items: \[\]/);
  assert.match(publicationBackend, /publishedPreviewVersionId: version\.id/);
  assert.match(publicationBackend, /PREVIEW_POINTER_NOT_PERSISTED/);
  assert.match(publicationBackend, /PREVIEW_POINTER_MISMATCH/);
});

test("content fingerprint makes repeated publication idempotent", () => {
  const packageA = { files: [{ path: "index.html", content: "same" }] };
  const first = publication._private.previewFingerprint({ demoJourneyId: "journey", previewSource: "manual_zip", previewPackage: packageA });
  const second = publication._private.previewFingerprint({ demoJourneyId: "journey", previewSource: "manual_zip", previewPackage: packageA });
  const changed = publication._private.previewFingerprint({ demoJourneyId: "journey", previewSource: "manual_zip", previewPackage: { files: [{ path: "index.html", content: "changed" }] } });
  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.match(publicationBackend, /customerPreviewFingerprint/);
});

test("customer portal only lists explicitly published versions and shows their source", () => {
  assert.match(clientVersions, /published_to_portal=eq\.true/);
  assert.match(clientVersions, /previewSource: cleanText\(row\.metadata\?\.previewSource\)/);
  assert.match(clientRender, /published_to_portal=eq\.true/);
  assert.match(portal, /createWebsiteMetric\("Previewbron"/);
  assert.match(clientVersions, /customer\.metadata\?\.publishedPreviewVersionId/);
  assert.match(clientVersions, /isCurrent: cleanText\(row\.id\) === cleanText\(currentPreviewVersionId\)/);
  assert.match(portal, /Boolean\(a\.isCurrent\)/);
});

test("new customer review versions do not inherit an old approval", () => {
  assert.match(publicationBackend, /status: "internal"/);
  assert.match(publicationBackend, /allow_approval: true/);
  assert.doesNotMatch(publicationBackend, /approved_at:\s*selectedVersion\.approved_at/);
  assert.match(clientVersions, /approvedAt: cleanText\(row\.approved_at\)/);
});

test("publication status provides safe admin copy and responsive actions", () => {
  assert.match(factoryUi, /Preview gepubliceerd/);
  assert.match(factoryUi, /De geselecteerde websiteversie is nu zichtbaar in het klantportaal/);
  assert.match(factoryUi, /Reviewstatus/);
  assert.match(factoryUi, /Open klantportaal/);
  assert.match(factoryUi, /action=current&customerId=/);
  assert.match(factoryUi, /confirmation\.publishedPreviewVersionId !== activeVersion\.id/);
  assert.match(factoryUi, /dataset\.publishedPreviewVersionId/);
});

test("customer portal thumbnail and full preview are bound to one preview version", () => {
  assert.match(clientVersions, /thumbnailPath: `\/preview-embed\.html\?version=\$\{encodeURIComponent\(cleanText\(row\.id\)\)\}`/);
  assert.match(portal, /latest\.thumbnailPath \|\| latest\.safePreviewPath/);
  assert.match(portal, /previewVersion\.thumbnailPath \|\| previewVersion\.safePreviewPath/);
  assert.match(portal, /open\.href = previewVersion\.safePreviewPath/);
  assert.match(previewEmbed, /client-preview-render\?version=\$\{encodeURIComponent\(version\)\}/);
  assert.match(previewEmbed, /data\.preview\?\.html/);
});

test("thumbnail embed is authenticated, persistent and has a visible fallback", () => {
  assert.match(previewEmbed, /maxwebstudioSupabaseAuthSession/);
  assert.match(previewEmbed, /Authorization: `Bearer \$\{token\}`/);
  assert.match(previewEmbed, /Preview niet beschikbaar/);
  assert.doesNotMatch(previewEmbed, /blob:/);
  assert.doesNotMatch(previewEmbed, /data:image/);
  assert.match(clientRender, /customer_id=eq\.\$\{encodeURIComponent\(customer\.id\)\}/);
  assert.match(clientRender, /published_to_portal=eq\.true/);
});

test("republishing the selected version makes it the canonical latest publication", () => {
  assert.match(publicationBackend, /published_at: now/);
  assert.match(publicationBackend, /publishedPreviewVersionId: version\.id/);
  assert.match(clientVersions, /currentPreviewVersionId/);
  assert.match(clientVersions, /currentPreviewVersion:/);
  assert.match(clientVersions, /"Cache-Control": "no-store"/);
});
