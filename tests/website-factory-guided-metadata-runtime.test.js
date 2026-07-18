const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const factory = fs.readFileSync(path.join(__dirname, "../public/admin-website-factory.html"), "utf8");
const viewStart = factory.indexOf("function viewPreviewVersion(");
const viewEnd = factory.indexOf("function activeFactoryPreviewVersion(", viewStart);
const viewSource = factory.slice(viewStart, viewEnd);
const mainScriptStart = factory.lastIndexOf("<script>", viewStart);
const mainScriptEnd = factory.indexOf("</script>", viewStart);
const guidedScriptStart = factory.indexOf("<script>", mainScriptEnd);
const guidedScriptEnd = factory.indexOf("</script>", guidedScriptStart);
const mainScript = factory.slice(mainScriptStart, mainScriptEnd);
const guidedScript = factory.slice(guidedScriptStart, guidedScriptEnd);

const versions = [
  { id: "factory-v4", version: 4, sourceType: "factory_build", sourceLabel: "Website Factory", createdAt: "2026-07-18T04:56:00.000Z", editable: true },
  { id: "factory-v3", version: 3, sourceType: "factory_build", sourceLabel: "Website Factory", createdAt: "2026-07-18T04:47:31.000Z", editable: true },
  { id: "zip-v2", version: 2, sourceType: "manual_zip", sourceLabel: "Geüploade ZIP", createdAt: "2026-07-17T19:04:41.000Z", editable: false },
];

function viewHarness(initialId = "factory-v4") {
  const events = [];
  const stored = new Map();
  const context = {
    events,
    stored,
    window: {
      sessionStorage: { setItem: (key, value) => stored.set(key, value) },
      WebsiteFactoryRuntime: { renderGuidedVersionMeta: () => events.push("guided-metadata") },
    },
  };
  vm.createContext(context);
  vm.runInContext(`
    let buildHistory = { previewVersions: ${JSON.stringify(versions)} };
    let viewedPreviewVersionId = ${JSON.stringify(initialId)};
    let previewLoadFailedId = "failed-version";
    let previewSource = "factory";
    let previewDevice = "tablet";
    let apiCalls = 0;
    let activationCalls = 0;
    function isManualPreviewVersion(version) { return version?.sourceType === "manual_zip"; }
    function previewSessionKey() { return "websiteFactory:viewedPreviewVersion:lead-1"; }
    function renderPreviewStage() { events.push("stage"); }
    function renderPreviewVersionHistory() { events.push("history"); }
    function renderSelectedPreviewActions() { events.push("actions"); }
    ${viewSource}
    this.api = {
      view: (id, options) => viewPreviewVersion(id, options),
      state: () => ({ viewedPreviewVersionId, previewSource, previewDevice, previewLoadFailedId, apiCalls, activationCalls }),
    };
  `, context);
  return context;
}

function renderMetadata({ viewedId, publishedId = "factory-v4" }) {
  const target = { dataset: {}, innerHTML: "" };
  const renderStart = guidedScript.indexOf("function renderGuidedVersionMeta()");
  const renderEnd = guidedScript.indexOf("function syncPrimaryAction()", renderStart);
  const renderBlock = guidedScript.slice(renderStart, renderEnd);
  const runtime = {
    buildHistory: { previewVersions: versions, activeVersion: versions[0] },
    viewedPreviewVersionId: viewedId,
    publicPreviewPublication: { previewVersionId: publishedId, previewSource: "factory_build" },
  };
  const context = {
    document: { getElementById: (id) => id === "factory-guided-version-meta" ? target : null },
    window: {
      WebsiteFactoryRuntime: { getState: () => runtime },
      WebsiteFactoryPreviewSources: {
        normalize: (version) => version?.id ? version : null,
        versionLabel: (version) => `${version.sourceLabel} · V${version.version}`,
        typeLabel: (version) => version.sourceType === "manual_zip" ? "Alleen-lezen ZIP-preview" : "Bewerkbare Factory-build",
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(`
    const safe = (input = "") => String(input || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
    ${renderBlock}
    window.WebsiteFactoryRuntime.renderGuidedVersionMeta();
  `, context);
  return target.innerHTML;
}

test("viewPreviewVersion gebruikt de publieke metadata-runtimebridge", () => {
  assert.match(viewSource, /window\.WebsiteFactoryRuntime\?\.renderGuidedVersionMeta\?\.\(\)/);
});

test("de hoofd-IIFE bevat geen directe cross-scope metadata-call", () => {
  assert.doesNotMatch(mainScript, /^\s*renderGuidedVersionMeta\(\);/m);
  assert.equal((mainScript.match(/WebsiteFactoryRuntime\?\.renderGuidedVersionMeta\?\.\(\)/g) || []).length, 2);
});

test("Factory naar ZIP wisselt zonder ReferenceError", () => {
  const harness = viewHarness();
  assert.doesNotThrow(() => harness.api.view("zip-v2"));
  assert.equal(harness.api.state().previewSource, "manual");
  assert.equal(harness.events.filter((event) => event === "guided-metadata").length, 1);
});

test("ZIP naar Factory wisselt zonder ReferenceError", () => {
  const harness = viewHarness("zip-v2");
  assert.doesNotThrow(() => harness.api.view("factory-v4"));
  assert.equal(harness.api.state().previewSource, "factory");
  assert.equal(harness.events.filter((event) => event === "guided-metadata").length, 1);
});

test("versiehistorie Bekijken gebruikt de exacte previewVersionId", () => {
  const harness = viewHarness();
  assert.equal(harness.api.view("factory-v3"), true);
  assert.equal(harness.api.state().viewedPreviewVersionId, "factory-v3");
  assert.equal(harness.stored.get("websiteFactory:viewedPreviewVersion:lead-1"), "factory-v3");
  assert.match(mainScript, /viewPreviewVersion\(button\.dataset\.viewPreviewVersion\)/);
});

test("metadata toont de geselecteerde ZIP-bron en versie", () => {
  const html = renderMetadata({ viewedId: "zip-v2" });
  assert.match(html, /Geüploade ZIP · V2/);
  assert.match(html, /Alleen-lezen ZIP-preview/);
  assert.match(html, /Website Factory · V4/);
});

test("metadata toont de geselecteerde Factory-bron en versie", () => {
  const html = renderMetadata({ viewedId: "factory-v3" });
  assert.match(html, /Website Factory · V3/);
  assert.match(html, /Bewerkbare Factory-build/);
});

test("bron- en versiewisselen behouden de device-state", () => {
  const harness = viewHarness();
  harness.api.view("zip-v2");
  harness.api.view("factory-v3");
  assert.equal(harness.api.state().previewDevice, "tablet");
});

test("bekijken doet geen API-call", () => {
  const harness = viewHarness();
  harness.api.view("zip-v2");
  assert.equal(harness.api.state().apiCalls, 0);
  assert.doesNotMatch(viewSource, /fetch\(|apiRequest\(/);
});

test("bekijken activeert of publiceert niets", () => {
  const harness = viewHarness();
  harness.api.view("factory-v3");
  assert.equal(harness.api.state().activationCalls, 0);
  assert.doesNotMatch(viewSource, /activate|publish|customerPreviewPublication\s*=/i);
});

test("native keyboardbediening van bron en device blijft aanwezig", () => {
  for (const mode of ["desktop", "tablet", "mobile"]) assert.match(factory, new RegExp(`<button[^>]*type="button"[^>]*data-guided-preview-mode="${mode}"`));
  assert.match(mainScript, /\["ArrowLeft", "ArrowRight"\]/);
  assert.match(mainScript, /buttons\[next\]\.click\(\)/);
});

test("private renderer wordt éénmaal en zonder recursie aan de runtime gekoppeld", () => {
  assert.match(guidedScript, /WebsiteFactoryRuntime\.renderGuidedVersionMeta = \(\) => renderGuidedVersionMeta\(\)/);
  const renderBody = guidedScript.slice(guidedScript.indexOf("function renderGuidedVersionMeta()"), guidedScript.indexOf("function syncPrimaryAction()"));
  assert.doesNotMatch(renderBody.slice(0, renderBody.indexOf("if (window.WebsiteFactoryRuntime)")), /viewPreviewVersion|renderPreviewStage/);
});

test("scope-audit vindt geen andere guided private identifier in de hoofd-IIFE", () => {
  const guidedNames = [...guidedScript.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]);
  const leaks = guidedNames.filter((name) => new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(mainScript));
  assert.deepEqual(leaks, []);
});

test("klantpublicatie ververst metadata via dezelfde runtimebridge", () => {
  const publishStart = mainScript.indexOf("async function publishCustomerPreview");
  const publishEnd = mainScript.indexOf("function manualZipUploadContext", publishStart);
  const publishBlock = mainScript.slice(publishStart, publishEnd);
  assert.match(publishBlock, /WebsiteFactoryRuntime\?\.renderGuidedVersionMeta\?\.\(\)/);
  assert.doesNotMatch(publishBlock, /^\s*renderGuidedVersionMeta\(\);/m);
});

