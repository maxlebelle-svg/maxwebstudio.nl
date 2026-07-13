const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const publication = require("../functions/admin-preview-publication");
const commercialPackage = require("../functions/_website-commercial-order");

const root = path.join(__dirname, "..");
const factoryUi = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const factoryBackend = fs.readFileSync(path.join(root, "functions/website-factory.js"), "utf8");
const publicationBackend = fs.readFileSync(path.join(root, "functions/admin-preview-publication.js"), "utf8");
const clientVersions = fs.readFileSync(path.join(root, "functions/client-preview-versions.js"), "utf8");
const clientRender = fs.readFileSync(path.join(root, "functions/client-preview-render.js"), "utf8");
const portal = fs.readFileSync(path.join(root, "public/klantportaal.html"), "utf8");
const previewEmbed = fs.readFileSync(path.join(root, "public/preview-embed.html"), "utf8");
const securePreview = fs.readFileSync(path.join(root, "public/preview.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const netlifyConfig = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
const mollieProducts = fs.readFileSync(path.join(root, "functions/mollie-products.js"), "utf8");

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
  assert.match(previewEmbed, /width: 1440px/);
  assert.match(previewEmbed, /pointer-events: none/);
  assert.match(previewEmbed, /Content-Security-Policy/);
  assert.match(previewEmbed, /connect-src 'none'/);
  assert.match(previewEmbed, /form-action 'none'/);
  assert.doesNotMatch(previewEmbed, /allow-forms|allow-popups|allow-top-navigation/);
  assert.match(netlifyConfig, /for = "\/preview-embed\.html"[\s\S]*X-Frame-Options = "SAMEORIGIN"/);
  assert.match(netlifyConfig, /for = "\/preview-embed\.html"[\s\S]*frame-ancestors 'self'/);
  assert.match(netlifyConfig, /for = "\/preview-embed\.html"[\s\S]*Cache-Control = "no-store/);
  assert.doesNotMatch(netlifyConfig, /for = "\/\*"[\s\S]*?X-Frame-Options = "DENY"/);
  assert.match(netlifyConfig, /for = "\/\*"[\s\S]*?frame-ancestors 'none'/);
});

test("secure preview approves and pays the exact published version", () => {
  assert.match(securePreview, /class="button primary is-disabled" id="payment-link"[^>]*>Betaal aanbetaling<\/a>/);
  assert.match(securePreview, /action: "approve", previewVersionId: versionId/);
  assert.match(securePreview, /approvedPreviewVersionId !== versionId/);
  assert.match(securePreview, /action: "create_payment", previewVersionId:/);
  assert.doesNotMatch(securePreview, /action: "approve_preview"/);
  assert.match(clientVersions, /currentVersionId !== versionId/);
  assert.match(clientVersions, /readWebsiteCommercialOrder/);
  assert.doesNotMatch(clientVersions, /hosting_package|care_package|customer\.package/);
  assert.match(clientVersions, /packageValues\.length === 1/);
  assert.match(clientVersions, /source: "customer_payment_backfill"/);
  assert.match(clientVersions, /website_package_backfilled/);
  assert.match(clientVersions, /packageFromFactoryBriefing/);
  assert.match(clientVersions, /\^Websitepakket:/);
  assert.doesNotMatch(clientVersions, /\.5\b|50\s*%/);
});

test("website commercial order normalizes Factory labels to fixed catalog amounts", () => {
  assert.deepEqual(commercialPackage.normalizeWebsitePackage("Starter Site (€495)"), { packageCode: "starter_site", packageName: "Starter Site", totalAmountCents: 49500, depositAmountCents: 15000, currency: "EUR" });
  assert.equal(commercialPackage.normalizeWebsitePackage("business").depositAmountCents, 30000);
  assert.equal(commercialPackage.normalizeWebsitePackage("Premium Growth").depositAmountCents, 50000);
  assert.match(factoryUi, /action: "sync_commercial_package"/);
  assert.match(factoryUi, /websiteCommercialOrder/);
  assert.match(mollieProducts, /MOLLIE_TEST_API_KEY \|\| process\.env\.MOLLIE_API_KEY/);
});

test("maintenance selection never changes the fixed website deposit", () => {
  const websiteCases = [["starter", 15000], ["business", 30000], ["premium", 50000]];
  const maintenanceCases = [["none", 0], ["care_basic", 1995], ["care_plus", 4900], ["care_growth", 9900]];
  for (const [website, deposit] of websiteCases) {
    const base = commercialPackage.buildWebsiteCommercialOrder({ customerId: "customer", projectId: "project", packageValue: website });
    for (const [maintenance, monthly] of maintenanceCases) {
      const selected = commercialPackage.selectMaintenance(base, { maintenanceCode: maintenance, authUserId: "user", confirmedNone: maintenance === "none" });
      assert.equal(selected.depositAmountCents, deposit);
      assert.equal(selected.maintenanceAmountCents, monthly);
      assert.equal(selected.startTrigger, maintenance === "none" ? "none" : "project_delivered");
    }
  }
  assert.equal(commercialPackage.selectMaintenance(commercialPackage.buildWebsiteCommercialOrder({ customerId: "c", projectId: "p", packageValue: "starter" }), { maintenanceCode: "none", authUserId: "u" }), null);
  assert.equal(commercialPackage.normalizeMaintenance("unknown"), null);
  assert.match(clientVersions, /const amountInclVatCents = Math\.round\(amountCents \* 1\.21\)/);
  assert.match(clientVersions, /maintenance_selection_required/);
  assert.match(factoryBackend, /activateSelectedMaintenance/);
  assert.match(factoryBackend, /customer_subscriptions/);
  assert.match(factoryBackend, /status: "planned"/);
  for (const text of ["Projectoverzicht", "Aanbevolen", "Doorgaan zonder onderhoud?", "Onderhoud start pas na livegang", "Totaal vandaag te betalen"]) assert.match(securePreview, new RegExp(text.replace("?", "\\?")));
  for (const code of ["none", "care_basic", "care_plus", "care_growth"]) assert.ok(commercialPackage.maintenanceCatalog[code]);
  assert.match(securePreview, /maintenanceOptions/);
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*\.preview-checkout\s*\{[\s\S]*grid-template-columns: 1fr/);
});

test("premium preview checkout keeps commercial values dynamic and accessible", () => {
  assert.match(securePreview, /class="preview-checkout"/);
  assert.match(securePreview, /class="preview-project-summary"/);
  assert.doesNotMatch(securePreview, /background:\s*(?:linear-gradient\([^)]*#fff|#fff(?:fff)?)/i);
  assert.match(securePreview, /readiness\.packageName \|\| readiness\.packageKey/);
  assert.match(securePreview, /euro\(readiness\.totalAmountCents\)/);
  assert.match(securePreview, /euro\(readiness\.amountInclVatCents\)/);
  assert.match(securePreview, /euro\(readiness\.remainingAmountCents\)/);
  assert.match(securePreview, /selectedMaintenance\.amountCents/);
  assert.doesNotMatch(securePreview, /€\s*(?:19[,.]95|49|99|150|181[,.]50|495)/);
  assert.match(securePreview, /role="radio" aria-checked=/);
  assert.match(securePreview, /aria-live="polite"/);
  assert.match(styles, /position: sticky/);
  assert.match(styles, /overflow: hidden/);
});

test("maintenance option cards reserve independent title, price and description zones", () => {
  assert.match(securePreview, /class="maintenance-option-header"/);
  assert.match(securePreview, /class="maintenance-option-title"/);
  assert.match(securePreview, /class="maintenance-option-price"/);
  assert.match(securePreview, /class="maintenance-option-description"/);
  assert.match(styles, /\.preview-checkout \.maintenance-option-header\s*\{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.preview-checkout \.maintenance-option-price\s*\{[\s\S]*white-space: nowrap/);
  assert.match(styles, /\.preview-checkout \.maintenance-option-description\s*\{[\s\S]*overflow-wrap: anywhere/);
  assert.match(styles, /\.preview-checkout \.maintenance-chooser\s*\{[\s\S]*container-type: inline-size/);
  assert.match(styles, /@container \(min-width: 960px\)[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@container \(max-width: 479px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(styles, /\.preview-checkout \.maintenance-option-price\s*\{[^}]*position:\s*absolute/s);
});

test("maintenance confirmation modal prioritizes Basis without swapping handlers", () => {
  assert.match(securePreview, /class="button primary" type="button" id="choose-basic-maintenance" autofocus>Kies Basis onderhoud<\/button>/);
  assert.match(securePreview, /class="button secondary" type="button" id="confirm-no-maintenance">Doorgaan zonder onderhoud<\/button>/);
  assert.match(securePreview, /id="maintenance-none-dialog" aria-labelledby="maintenance-dialog-title"/);
  assert.match(securePreview, /choose-basic-maintenance"\)\.addEventListener\("click", \(\) => \{ maintenanceDialog\.close\(\); saveMaintenance\("care_basic"\)/);
  assert.match(securePreview, /confirm-no-maintenance"\)\.addEventListener\("click", \(\) => \{ maintenanceDialog\.close\(\); saveMaintenance\("none", true\)/);
  assert.ok(securePreview.indexOf('id="confirm-no-maintenance"') < securePreview.indexOf('id="choose-basic-maintenance"'));
  assert.match(securePreview, /De meeste klanten kiezen Basis onderhoud, zodat updates, back-ups, SSL-controle en technische ondersteuning vanaf dag één geregeld zijn\./);
  assert.match(styles, /\.maintenance-confirm \.button\s*\{[\s\S]*min-height: 44px/);
});

test("portal thumbnail and full link expose the same version id", () => {
  assert.match(portal, /iframe\.dataset\.previewVersionId = previewVersion\.id/);
  assert.match(portal, /open\.dataset\.previewVersionId = previewVersion\.id/);
});

test("republishing the selected version makes it the canonical latest publication", () => {
  assert.match(publicationBackend, /published_at: now/);
  assert.match(publicationBackend, /publishedPreviewVersionId: version\.id/);
  assert.match(clientVersions, /currentPreviewVersionId/);
  assert.match(clientVersions, /currentPreviewVersion:/);
  assert.match(clientVersions, /"Cache-Control": "no-store"/);
});
