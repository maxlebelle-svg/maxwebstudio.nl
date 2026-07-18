const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  SOURCE_FACTORY,
  SOURCE_MANUAL,
  normalizePreviewSource,
  previewSourceForVersion,
} = require("../functions/_preview-zip");
const demoJourney = require("../functions/demo-journey");
const demoActions = require("../public/admin/ui/demo-sites-commercial-actions");

const root = path.join(__dirname, "..");
const demoSites = fs.readFileSync(path.join(root, "public/admin-demo-sites.html"), "utf8");
const publicationBackend = fs.readFileSync(path.join(root, "functions/admin-preview-publication.js"), "utf8");
const invitationBackend = fs.readFileSync(path.join(root, "functions/admin-lead-demo-invitation.js"), "utf8");

const IDS = {
  lead: "e968d24a-d371-46b8-9eee-fe781aa01974",
  journey: "fb5200b2-7f64-4a8c-8747-ca41bcbbc57d",
  factoryV4: "28919104-f6f4-4f43-9216-a95c112f8606",
  zipV2: "d54acd6e-f47e-43b0-a4f2-a134944da4b3",
};

function legacyFactoryV4(overrides = {}) {
  return {
    id: IDS.factoryV4,
    version: 4,
    demoJourneyId: IDS.journey,
    buildJobId: IDS.factoryV4,
    previewUrl: "/.netlify/functions/demo-preview?id=opaque",
    metadata: { entryFile: "index.html", renderable: true, editorManifestAvailable: true },
    packageMeta: { editorManifest: { version: 1 }, editorEnrichment: { version: 1 }, industryIntelligence: { schemaVersion: "mws.industry-profile.v1" } },
    renderable: true,
    ...overrides,
  };
}

function manualZipV2(overrides = {}) {
  return {
    id: IDS.zipV2,
    version: 2,
    demoJourneyId: IDS.journey,
    previewUrl: `/.netlify/functions/manual-preview-render?version=${IDS.zipV2}`,
    metadata: { fileName: "heeljezelf.today-website-factory-upload.zip", manualZipContentHash: "a".repeat(64) },
    packageMeta: { fileName: "heeljezelf.today-website-factory-upload.zip" },
    renderable: true,
    ...overrides,
  };
}

test("legacy V4 resolves to canonical factory from unambiguous build structure", () => {
  assert.equal(previewSourceForVersion(legacyFactoryV4()), SOURCE_FACTORY);
  assert.equal(demoActions.previewVersionSource(legacyFactoryV4()), SOURCE_FACTORY);
});

test("legacy V2 resolves to canonical manual_zip from ZIP hash and route", () => {
  assert.equal(previewSourceForVersion(manualZipV2()), SOURCE_MANUAL);
  assert.equal(demoActions.previewVersionSource(manualZipV2()), SOURCE_MANUAL);
});

test("current explicit Factory metadata remains compatible across aliases", () => {
  for (const value of ["factory", "factory_build", "factory-build", "website_factory", "website-factory"]) {
    assert.equal(normalizePreviewSource(value), SOURCE_FACTORY);
    assert.equal(previewSourceForVersion({ sourceType: value }), SOURCE_FACTORY);
    assert.equal(demoActions.previewVersionSource({ sourceType: value }), SOURCE_FACTORY);
  }
});

test("current explicit ZIP metadata remains compatible across aliases", () => {
  for (const value of ["manual", "manual_zip", "manual-zip", "zip"]) {
    assert.equal(normalizePreviewSource(value), SOURCE_MANUAL);
    assert.equal(previewSourceForVersion({ metadata: { previewSource: value } }), SOURCE_MANUAL);
    assert.equal(demoActions.previewVersionSource({ metadata: { previewSource: value } }), SOURCE_MANUAL);
  }
});

test("unknown source metadata stays blocked instead of becoming Factory", () => {
  const unknown = { id: "unknown", generated_package: { files: [{ path: "index.html" }] }, metadata: { previewSource: "legacy_unknown" } };
  assert.equal(previewSourceForVersion(unknown), "");
  assert.equal(demoActions.previewVersionSource(unknown), "");
  assert.equal(demoActions.source("legacy_unknown"), "");
});

test("conflicting manual and Factory evidence remains ambiguous", () => {
  const conflicting = legacyFactoryV4({ metadata: { manualZipContentHash: "b".repeat(64) }, previewUrl: "" });
  assert.equal(previewSourceForVersion(conflicting), "");
  assert.equal(demoActions.previewVersionSource(conflicting), "");
});

test("a generic package content hash alone is not treated as manual ZIP", () => {
  const version = { packageMeta: { contentHash: "c".repeat(64) }, generatedPackage: { files: [{ path: "index.html" }] } };
  assert.equal(previewSourceForVersion(version), "");
  assert.equal(demoActions.previewVersionSource(version), "");
});

test("Demo Journey summaries expose exact canonical sourceType values", () => {
  const history = demoJourney._private.normalizeFactoryHistorySources({
    previewVersions: [legacyFactoryV4(), manualZipV2()],
    activeVersion: legacyFactoryV4(),
  });
  assert.deepEqual(history.previewVersions.map((version) => version.sourceType), [SOURCE_FACTORY, SOURCE_MANUAL]);
  assert.equal(history.activeVersion.sourceType, SOURCE_FACTORY);
});

test("Demo Journey summaries preserve null for genuinely unknown sources", () => {
  const version = demoJourney._private.normalizeFactoryHistoryVersionSource({ id: "unknown", renderable: true, previewUrl: "/other" });
  assert.equal(version.sourceType, null);
});

test("V4 selection retains its exact ID and sends canonical factory", () => {
  const source = demoActions.previewVersionSource(legacyFactoryV4());
  assert.equal(source, SOURCE_FACTORY);
  const updateBlock = demoSites.slice(demoSites.indexOf("async function updatePreviewVersion"), demoSites.indexOf("function render()"));
  assert.match(updateBlock, /previewVersionSource\(selectedVersion\)/);
  assert.match(updateBlock, /previewVersionId: selectedVersion\.id/);
  assert.match(updateBlock, /previewSource,/);
  assert.doesNotMatch(updateBlock, /versionsBySource/);
});

test("published V4 pointer remains exact after source resolution", () => {
  const context = demoActions.shareContext({
    relationshipType: "lead",
    relationshipId: IDS.lead,
    email: "henk@example.test",
    selectedVersion: legacyFactoryV4(),
    publication: { publicPreviewEnabled: true, previewVersionId: IDS.factoryV4, publicPreviewUrl: "https://maxwebstudio.nl/preview/heeljezelf" },
  });
  assert.equal(context.published, true);
  assert.equal(context.previewVersionId, IDS.factoryV4);
  assert.equal(context.previewSource, "website_factory");
});

test("unknown V4-like selection reports ID and metadata cause before POST", () => {
  const updateBlock = demoSites.slice(demoSites.indexOf("async function updatePreviewVersion"), demoSites.indexOf("function render()"));
  const guard = updateBlock.indexOf("expliciete en structurele bronmetadata");
  const post = updateBlock.indexOf("postJson");
  assert.ok(guard > 0 && guard < post);
  assert.match(updateBlock, /previewversie \$\{selectedVersion\.id\}/);
  assert.match(demoSites, /Bron onbekend/);
});

test("source normalization does not create customers, accounts or mutate lead status", () => {
  const updateBlock = demoSites.slice(demoSites.indexOf("async function updatePreviewVersion"), demoSites.indexOf("function render()"));
  assert.doesNotMatch(updateBlock, /customers|auth\/v1|leadStatus|approvalStatus|customer/);
  assert.match(publicationBackend, /previewSourceForVersion\(row\)/);
  assert.match(invitationBackend, /previewSourceForVersion\(version\)/);
});

test("ZIP and Factory resolvers agree at browser and server boundaries", () => {
  for (const version of [legacyFactoryV4(), manualZipV2()]) {
    assert.equal(demoActions.previewVersionSource(version), previewSourceForVersion(version));
  }
});
