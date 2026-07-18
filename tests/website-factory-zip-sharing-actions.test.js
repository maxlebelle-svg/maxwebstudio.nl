const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const publicationSource = fs.readFileSync(path.join(root, "functions/admin-preview-publication.js"), "utf8");
const actions = require("../public/admin/ui/website-factory-preview-actions.js");
const publication = require("../functions/admin-preview-publication.js");

const IDS = {
  factory: "11111111-1111-4111-8111-111111111111",
  manual: "22222222-2222-4222-8222-222222222222",
  journey: "33333333-3333-4333-8333-333333333333",
  customer: "44444444-4444-4444-8444-444444444444",
  website: "55555555-5555-4555-8555-555555555555",
};

function manualUrl(id = IDS.manual, host = "maxwebstudio.nl") {
  return `https://${host}/.netlify/functions/manual-preview-render?version=${id}&token=private-token&source=manual_zip&previewVersionId=${id}`;
}

function factoryUrl(id = IDS.factory) {
  return `https://maxwebstudio.nl/.netlify/functions/demo-preview?id=${IDS.journey}&token=private-token&source=factory&previewVersionId=${id}`;
}

function manualContext(overrides = {}) {
  return actions.actionContext({
    version: { id: IDS.manual, version: 2, sourceType: "manual_zip", previewUrl: manualUrl(), renderable: true },
    previewUrl: manualUrl(),
    demoJourneyId: IDS.journey,
    customerId: IDS.customer,
    ...overrides,
  });
}

test("1 geldige ZIP toont alle vier deel- en publicatieacties", () => {
  const context = manualContext();
  assert.equal(context.shareEnabled, true);
  for (const id of ["factory-preview-open-selected", "factory-preview-copy-link", "factory-preview-share-whatsapp", "factory-preview-publish-customer"]) assert.match(html, new RegExp(`id="${id}"`));
});

test("2 alleen-lezen blijft zichtbaar voor de ZIP", () => {
  assert.equal(manualContext().readOnly, true);
  assert.match(html, /<strong>Alleen-lezen\.<\/strong>/);
});

test("3 alleen-lezen-uitleg bevestigt publiceren openen en delen", () => {
  assert.match(html, /kan hier niet rechtstreeks worden bewerkt\. U kunt hem wel publiceren, openen en delen\./);
});

test("4 kopiëren gebruikt de veilige URL van de bekeken ZIP-context", () => {
  const block = html.slice(html.indexOf("async function copySelectedPreviewLink"), html.indexOf("function shareSelectedPreviewViaWhatsApp"));
  assert.match(block, /selectedPreviewActionContext\(\)/);
  assert.match(block, /navigator\.clipboard\.writeText\(context\.shareUrl\)/);
});

test("5 kopiëren valt niet terug op een actieve Factory-versie", () => {
  const block = html.slice(html.indexOf("async function copySelectedPreviewLink"), html.indexOf("function shareSelectedPreviewViaWhatsApp"));
  assert.doesNotMatch(block, /buildHistory\.activeVersion|factoryPreviewUrl\(/);
});

test("6 WhatsApp gebruikt de bekeken ZIP-versie", () => {
  const block = html.slice(html.indexOf("function shareSelectedPreviewViaWhatsApp"), html.indexOf("async function refreshCustomerPreviewPublication"));
  assert.match(block, /selectedPreviewActionContext\(\)/);
  assert.match(block, /previewUrl: context\.shareUrl/);
});

test("7 WhatsApp-bericht en URL zijn correct geëncodeerd", () => {
  const url = actions.whatsappShareUrl({ contactName: "Henk & Carla", companyName: "Heel je zelf", previewUrl: manualUrl() });
  assert.match(url, /^https:\/\/wa\.me\/\?text=/);
  const message = decodeURIComponent(new URL(url).searchParams.get("text"));
  assert.match(message, /Hallo Henk & Carla/);
  assert.match(message, /demo voor Heel je zelf/);
  assert.match(message, new RegExp(IDS.manual));
  assert.doesNotMatch(message, /previewVersionId is|technische ID/i);
  assert.match(actions.whatsappShareUrl({ previewUrl: manualUrl(), mobile: false }), /^https:\/\/web\.whatsapp\.com\/send\?text=/);
});

test("8 Open preview opent de exacte bekeken ZIP veilig", () => {
  const block = html.slice(html.indexOf("function openSelectedPreview()"), html.indexOf("function copySelectedPreviewFallback"));
  assert.match(block, /openSelectedPreviewWindow\(context\.shareUrl\)/);
  assert.match(html, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
});

test("9 Doorzetten publiceert exact de bekeken ZIP", () => {
  const block = html.slice(html.indexOf("async function publishCustomerPreview"), html.indexOf("function manualZipUploadContext"));
  assert.match(block, /selectedPreviewActionContext\(\)/);
  assert.match(block, /previewVersionId: context\.previewVersionId/);
  assert.match(block, /previewSource: context\.sourceType/);
});

test("10 actieve ZIP toont status en Klantportaal openen", () => {
  const context = manualContext({ publishedPreviewVersionId: IDS.manual });
  assert.equal(context.published, true);
  assert.equal(context.publishLabel, "Actief in klantportaal");
  assert.match(html, /id="factory-preview-open-portal"[^>]*>Klantportaal openen<\/a>/);
  assert.match(html, /<span class="is-published">Actief in klantportaal<\/span>/);
});

test("11 publicatie van dezelfde ZIP blijft idempotent", () => {
  assert.match(publicationSource, /alreadyPublished: true/);
  assert.equal(manualContext({ publishedPreviewVersionId: IDS.manual }).publishEnabled, true);
});

test("12 zonder geldige klantrelatie is Doorzetten disabled", () => {
  const context = manualContext({ customerId: "" });
  assert.equal(context.publishEnabled, false);
  assert.match(context.explanation, /Selecteer eerst een lead of klant/);
});

test("13 onveilige externe URL wordt client- en server-side geweigerd", () => {
  const external = `https://example.com/.netlify/functions/manual-preview-render?version=${IDS.manual}&token=x&source=manual_zip&previewVersionId=${IDS.manual}`;
  assert.equal(actions.safeShareUrl({ previewUrl: external, previewVersionId: IDS.manual, sourceType: "manual_zip" }), "");
  assert.equal(publication._private.isAllowedManualPreviewUrl(external, IDS.manual), false);
  assert.equal(publication._private.isAllowedManualPreviewUrl(manualUrl(), IDS.manual, "other-token"), false);
  for (const scheme of ["javascript:alert(1)", "data:text/html,x", "blob:https://maxwebstudio.nl/x"]) assert.equal(actions.safeShareUrl({ previewUrl: scheme, previewVersionId: IDS.manual, sourceType: "manual_zip" }), "");
});

test("14 cross-relation publicatie wordt door ownershipvalidatie geweigerd", () => {
  assert.match(publicationSource, /assertNoRelationConflict\(version, ownership\)/);
  assert.match(publicationSource, /PREVIEW_CUSTOMER_MISMATCH|PREVIEW_OWNERSHIP_UNRESOLVED/);
});

test("15 localhost wordt nooit als deel-URL gebruikt", () => {
  assert.equal(actions.safeShareUrl({ previewUrl: manualUrl(IDS.manual, "localhost"), previewVersionId: IDS.manual, sourceType: "manual_zip" }), "");
  assert.equal(actions.safeShareUrl({ previewUrl: manualUrl(IDS.manual, "127.0.0.1"), previewVersionId: IDS.manual, sourceType: "manual_zip" }), "");
});

test("16 Factory-preview behoudt zijn eigen geselecteerde URL", () => {
  const context = actions.actionContext({ version: { id: IDS.factory, sourceType: "factory_build", previewUrl: factoryUrl(), renderable: true }, previewUrl: factoryUrl(), demoJourneyId: IDS.journey, customerId: IDS.customer, websiteId: IDS.website });
  assert.equal(context.sourceType, actions.SOURCE_FACTORY);
  assert.equal(context.shareUrl, factoryUrl());
  assert.doesNotMatch(context.shareUrl, /manual-preview-render/);
});

test("17 mobiele actiebalk heeft bij 390 px geen horizontale overflow", () => {
  assert.match(css, /@media\(max-width:620px\)[\s\S]*\.factory-selected-preview-action-buttons\{display:grid;grid-template-columns:1fr\}/);
  assert.match(css, /\.factory-selected-preview-action-buttons\{max-width:100%\}/);
  assert.match(css, /\.factory-selected-preview-actions\{overflow:hidden\}/);
});

test("18 alle deelacties zijn native toetsenbordbedienbare controls", () => {
  for (const id of ["factory-preview-open-selected", "factory-preview-copy-link", "factory-preview-share-whatsapp", "factory-preview-publish-customer"]) assert.match(html, new RegExp(`<button[^>]*id="${id}"[^>]*type="button"`));
  assert.doesNotMatch(html, /id="factory-preview-(?:open-selected|copy-link|share-whatsapp|publish-customer)"[^>]*tabindex="-1"/);
});

test("19 Clipboard API heeft execCommand- en handmatige fallback", () => {
  assert.match(html, /document\.execCommand\("copy"\)/);
  assert.match(html, /window\.prompt\("Kopieer deze previewlink:", context\.shareUrl\)/);
  assert.match(html, /Previewlink gekopieerd\./);
});

test("20 delen en publiceren wijzigen de goedkeuringsstatus niet", () => {
  const patchBlock = publicationSource.slice(publicationSource.indexOf("const patch = {", publicationSource.indexOf("async function publishPreviewVersion")), publicationSource.indexOf("const rows = await patchRows", publicationSource.indexOf("async function publishPreviewVersion")));
  assert.doesNotMatch(patchBlock, /approved_at\s*:/);
  assert.match(patchBlock, /status: version\.approved_at \? "approved" : "ready_for_review"/);
  assert.doesNotMatch(html.slice(html.indexOf("function shareSelectedPreviewViaWhatsApp"), html.indexOf("async function refreshCustomerPreviewPublication")), /approval|approved/);
});

test("21 begeleide previewacties gebruiken de expliciete runtimebridge", () => {
  const runtime = html.slice(html.indexOf("window.WebsiteFactoryRuntime = {"), html.indexOf("async function resetDemoForRegeneration"));
  for (const action of ["openSelectedPreview", "copySelectedPreviewLink", "shareSelectedPreviewViaWhatsApp", "publishCustomerPreview", "activateSelectedManualPreview"]) {
    assert.match(runtime, new RegExp(`${action}:`));
  }
  const guided = html.slice(html.indexOf("function initGuidedFactory()"), html.indexOf("if (document.readyState === \"loading\")", html.indexOf("function initGuidedFactory()")));
  assert.match(guided, /WebsiteFactoryRuntime\?\.openSelectedPreview/);
  assert.match(guided, /WebsiteFactoryRuntime\?\.copySelectedPreviewLink/);
  assert.match(guided, /WebsiteFactoryRuntime\?\.shareSelectedPreviewViaWhatsApp/);
  assert.match(guided, /WebsiteFactoryRuntime\?\.publishCustomerPreview/);
  assert.doesNotMatch(guided, /addEventListener\("click", openSelectedPreview\)/);
});
