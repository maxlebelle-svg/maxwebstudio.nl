const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const demoJourneySource = fs.readFileSync(path.join(root, "functions/demo-journey.js"), "utf8");
const publicationSource = fs.readFileSync(path.join(root, "functions/admin-preview-publication.js"), "utf8");
const actions = require("../public/admin/ui/website-factory-preview-actions.js");
const demoJourney = require("../functions/demo-journey.js");

const IDS = {
  factory: "11111111-1111-4111-8111-111111111111",
  manual: "22222222-2222-4222-8222-222222222222",
  journey: "33333333-3333-4333-8333-333333333333",
  customer: "44444444-4444-4444-8444-444444444444",
  website: "55555555-5555-4555-8555-555555555555",
  otherJourney: "66666666-6666-4666-8666-666666666666",
};

function context(overrides = {}) {
  return actions.actionContext({
    version: { id: IDS.factory, version: 2, sourceType: "factory_build", previewUrl: "/factory", renderable: true },
    previewUrl: "/factory",
    demoJourneyId: IDS.journey,
    customerId: IDS.customer,
    websiteId: IDS.website,
    ...overrides,
  });
}

test("1 Factory selected saves the selected Factory version", () => {
  const result = context();
  assert.equal(result.previewVersionId, IDS.factory);
  assert.equal(result.sourceType, actions.SOURCE_FACTORY);
  assert.equal(result.demoEnabled, true);
});

test("2 manual ZIP selected saves the selected ZIP version", () => {
  const result = context({ version: { id: IDS.manual, version: 1, sourceType: "manual_zip", previewUrl: "/zip", renderable: true }, previewUrl: "/zip", websiteId: "" });
  assert.equal(result.previewVersionId, IDS.manual);
  assert.equal(result.sourceType, actions.SOURCE_MANUAL);
  assert.equal(result.demoEnabled, true);
});

test("3 viewed ZIP id is the explicit action id", () => {
  assert.match(html, /function selectedPreviewActionContext\(\)[\s\S]*selectedViewedPreviewVersion\(\)[\s\S]*previewVersionId: context\.previewVersionId/);
});

test("4 selected actions never silently use active Factory version", () => {
  const publishBlock = html.slice(html.indexOf("async function publishCustomerPreview"), html.indexOf("function manualZipUploadContext"));
  assert.doesNotMatch(publishBlock, /buildHistory\.activeVersion/);
  assert.match(publishBlock, /selectedPreviewActionContext\(\)/);
});

test("5 processed ZIP can be sent to the customer portal", () => {
  assert.equal(context({ version: { id: IDS.manual, sourceType: "manual_zip", previewUrl: "/zip", renderable: true }, previewUrl: "/zip", websiteId: "" }).publishEnabled, true);
});

test("6 Factory can still be sent to the customer portal", () => {
  assert.equal(context().publishEnabled, true);
});

test("7 viewing a version has no activation side effect", () => {
  const viewBlock = html.slice(html.indexOf("function viewPreviewVersion"), html.indexOf("function activeFactoryPreviewVersion"));
  assert.doesNotMatch(viewBlock, /activateManualPreview|publishCustomerPreview|isActive\s*=/);
});

test("8 saving in Demo Sites does not activate or publish", () => {
  const saveBlock = html.slice(html.indexOf("async function saveDemoSite"), html.indexOf("function renderSelectedPreviewActions"));
  assert.doesNotMatch(saveBlock, /activateManualPreview|publishCustomerPreview/);
  assert.doesNotMatch(demoJourneySource.slice(demoJourneySource.indexOf('if (action === "save_demo_site")'), demoJourneySource.indexOf('if (action === "generate_preview")')), /is_active:\s*true|published_to_portal:\s*true/);
});

test("9 explicit publication sends and confirms the selected version", () => {
  assert.match(html, /previewVersionId: context\.previewVersionId/);
  assert.match(html, /confirmation\.publishedPreviewVersionId !== context\.previewVersionId/);
});

test("10 no customer disables the portal action", () => {
  const result = context({ customerId: "" });
  assert.equal(result.demoEnabled, true);
  assert.equal(result.publishEnabled, false);
  assert.match(result.explanation, /Selecteer eerst een lead of klant/);
});

test("11 local unprocessed ZIP disables both commercial actions", () => {
  const result = context({ version: { id: IDS.manual, sourceType: "manual_zip", previewUrl: "/zip", renderable: true }, previewUrl: "/zip", websiteId: "", localZipPending: true });
  assert.equal(result.demoEnabled, false);
  assert.equal(result.publishEnabled, false);
  assert.match(result.explanation, /Verwerk de ZIP eerst/);
});

test("12 processed server-side ZIP enables actions", () => {
  const result = context({ version: { id: IDS.manual, sourceType: "manual_zip", previewUrl: "/zip", renderable: true }, previewUrl: "/zip", websiteId: "" });
  assert.equal(result.serverStored, true);
  assert.equal(result.demoEnabled, true);
  assert.equal(result.publishEnabled, true);
});

test("13 duplicate Demo Sites save is idempotent", () => {
  const result = context({ savedPreviewVersionId: IDS.factory });
  assert.equal(result.saved, true);
  assert.equal(result.saveLabel, "Opgeslagen in Demo Sites");
  assert.match(demoJourneySource, /alreadySaved: true/);
});

test("14 duplicate customer publication is idempotent", () => {
  const result = context({ version: { id: IDS.manual, sourceType: "manual_zip", previewUrl: "/zip", renderable: true }, previewUrl: "/zip", websiteId: "", publishedPreviewVersionId: IDS.manual });
  assert.equal(result.published, true);
  assert.equal(result.publishLabel, "Actief in klantportaal");
  assert.equal(result.activateEnabled, false);
  assert.match(publicationSource, /alreadyPublished: true/);
});

test("15 cross-relation Demo Sites preview is rejected server-side", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify([{ id: IDS.manual, demo_journey_id: IDS.otherJourney, customer_id: IDS.customer, preview_url: "/zip", generated_package: { files: [{ path: "index.html" }], meta: { previewSource: "manual_zip" } }, metadata: { previewSource: "manual_zip" } }]) });
  try {
    await assert.rejects(() => demoJourney._private.resolveSelectedDemoPreview({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "test", journey: { id: IDS.journey, customer_id: IDS.customer }, previewVersionId: IDS.manual, previewSource: "manual_zip" }), (error) => error.code === "PREVIEW_RELATION_MISMATCH");
  } finally {
    global.fetch = previousFetch;
  }
});

test("16 invalid previewVersionId is rejected before storage lookup", async () => {
  await assert.rejects(() => demoJourney._private.resolveSelectedDemoPreview({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "test", journey: { id: IDS.journey }, previewVersionId: "invalid", previewSource: "manual_zip" }), (error) => error.code === "PREVIEW_VERSION_INVALID");
});

test("server resolves a valid selected ZIP only from its stored package and URL", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify([{ id: IDS.manual, demo_journey_id: IDS.journey, customer_id: IDS.customer, preview_url: `/.netlify/functions/manual-preview-render?version=${IDS.manual}`, generated_package: { files: [{ path: "index.html" }], meta: { previewSource: "manual_zip" } }, metadata: { previewSource: "manual_zip" } }]) });
  try {
    const result = await demoJourney._private.resolveSelectedDemoPreview({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "test", journey: { id: IDS.journey, customer_id: IDS.customer }, previewVersionId: IDS.manual, previewSource: "manual_zip" });
    assert.equal(result.version.id, IDS.manual);
    assert.equal(result.source, "manual_zip");
  } finally {
    global.fetch = previousFetch;
  }
});

test("17 ZIP remains explicitly read-only", () => {
  const result = context({ version: { id: IDS.manual, sourceType: "manual_zip", previewUrl: "/zip", renderable: true }, previewUrl: "/zip" });
  assert.equal(result.readOnly, true);
  assert.equal(result.editable, false);
  assert.match(html, /Deze ZIP-preview is alleen-lezen/);
});

test("18 publication metadata distinguishes viewed and active customer versions", () => {
  assert.match(html, /\["Je bekijkt nu", viewedLabel\]/);
  assert.match(html, /\["Actieve klantpreview", activeLabel\]/);
  assert.match(html, /Je bekijkt een andere versie dan de actieve klantpreview/);
});

test("19 Factory and ZIP source switcher remains available", () => {
  assert.match(html, /data-view-preview-source="factory_build"/);
  assert.match(html, /data-view-preview-source="manual_zip"/);
  assert.match(html, /viewPreviewVersion\(version\.id\)/);
});

test("20 mobile action layout has no horizontal action row overflow", () => {
  assert.match(css, /\.factory-selected-preview-actions\{[^}]*min-width:0/);
  assert.match(css, /@media\(max-width:620px\)[^{]*\{[\s\S]*\.factory-selected-preview-action-buttons\{display:grid;grid-template-columns:1fr\}/);
  assert.match(css, /\.factory-selected-preview-action-buttons \.button\{width:100%\}/);
});
