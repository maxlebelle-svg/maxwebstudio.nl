const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const factory = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const deviceFunctions = factory.slice(
  factory.indexOf("function previewDeviceSessionKey()"),
  factory.indexOf("function selectedViewedPreviewVersion()"),
);

function control(kind, mode) {
  const classes = new Set();
  const attributes = {};
  return {
    dataset: kind === "guided" ? { guidedPreviewMode: mode } : { previewMode: mode },
    classList: { toggle: (name, active) => active ? classes.add(name) : classes.delete(name), contains: (name) => classes.has(name) },
    setAttribute: (name, value) => { attributes[name] = String(value); },
    attribute: (name) => attributes[name],
  };
}

function deviceHarness({ storage = new Map(), source = "factory", versionId = "factory-v4", previewUrl = "https://preview.example/factory-v4" } = {}) {
  const legacy = ["desktop", "tablet", "mobile"].map((mode) => control("legacy", mode));
  const guided = ["desktop", "tablet", "mobile"].map((mode) => control("guided", mode));
  const shellAttributes = { src: previewUrl };
  const context = {
    elements: {
      previewControls: { querySelectorAll: () => legacy },
      previewShell: { setAttribute: (name, value) => { shellAttributes[name] = String(value); } },
    },
    document: { querySelectorAll: (selector) => selector === "[data-guided-preview-mode]" ? guided : [] },
    window: {
      sessionStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, String(value)),
      },
    },
    storage,
    legacy,
    guided,
    shellAttributes,
  };
  vm.createContext(context);
  vm.runInContext(`
    let previewDevice = "desktop";
    let previewDeviceScopeKey = "";
    let previewSource = ${JSON.stringify(source)};
    let viewedPreviewVersionId = ${JSON.stringify(versionId)};
    let previewApiCalls = 0;
    function previewSessionKey() { return "websiteFactory:viewedPreviewVersion:lead-1"; }
    ${deviceFunctions}
    this.deviceApi = {
      set: (mode, options) => setPreviewDevice(mode, options),
      restore: () => ensurePreviewDeviceSelection(),
      setSource: (value) => { previewSource = value; },
      state: () => ({ previewDevice, previewSource, viewedPreviewVersionId, previewApiCalls }),
      keys: () => ({ preview: previewSessionKey(), device: previewDeviceSessionKey() }),
    };
  `, context);
  return context;
}

for (const [name, source, from, to] of [
  ["Factory Desktop naar Tablet", "factory", "desktop", "tablet"],
  ["Factory Tablet naar Mobiel", "factory", "tablet", "mobile"],
  ["ZIP Desktop naar Tablet", "manual", "desktop", "tablet"],
  ["ZIP Tablet naar Mobiel", "manual", "tablet", "mobile"],
  ["ZIP Mobiel naar Desktop", "manual", "mobile", "desktop"],
]) {
  test(`${name} wijzigt uitsluitend het previewapparaat`, () => {
    const harness = deviceHarness({ source });
    harness.deviceApi.set(from);
    const before = harness.deviceApi.state();
    harness.deviceApi.set(to);
    const after = harness.deviceApi.state();
    assert.equal(after.previewDevice, to);
    assert.equal(after.previewSource, source);
    assert.equal(after.viewedPreviewVersionId, before.viewedPreviewVersionId);
    assert.equal(after.previewApiCalls, 0);
  });
}

test("bron wisselen terwijl Tablet actief is behoudt Tablet", () => {
  const harness = deviceHarness({ source: "factory" });
  harness.deviceApi.set("tablet");
  harness.deviceApi.setSource("manual");
  harness.deviceApi.restore();
  const state = harness.deviceApi.state();
  assert.equal(state.previewDevice, "tablet");
  assert.equal(state.previewSource, "manual");
  assert.equal(state.viewedPreviewVersionId, "factory-v4");
  assert.equal(state.previewApiCalls, 0);
});

test("refresh herstelt apparaat en bron uit twee afzonderlijke sessiewaarden", () => {
  const storage = new Map([["websiteFactory:viewedPreviewVersion:lead-1", "manual-v2"]]);
  const first = deviceHarness({ storage, source: "manual", versionId: "manual-v2" });
  first.deviceApi.set("tablet");
  const refreshed = deviceHarness({ storage, source: "manual", versionId: storage.get(first.deviceApi.keys().preview) });
  refreshed.deviceApi.restore();
  assert.equal(refreshed.deviceApi.state().previewDevice, "tablet");
  assert.equal(refreshed.deviceApi.state().previewSource, "manual");
  assert.equal(refreshed.deviceApi.state().viewedPreviewVersionId, "manual-v2");
});

test("device-opslag gebruikt nooit de previewversiesleutel", () => {
  const harness = deviceHarness();
  const keys = harness.deviceApi.keys();
  harness.deviceApi.set("mobile");
  assert.notEqual(keys.device, keys.preview);
  assert.equal(harness.storage.get(keys.device), "mobile");
  assert.equal(harness.storage.has(keys.preview), false);
});

test("ongeldige devicewaarde valt veilig terug op Desktop", () => {
  const harness = deviceHarness();
  assert.equal(harness.deviceApi.set("factory-tablet"), "desktop");
  assert.equal(harness.deviceApi.state().previewDevice, "desktop");
});

test("devicekeuze synchroniseert guided en legacy controls exact eenmaal", () => {
  const harness = deviceHarness();
  harness.deviceApi.set("tablet");
  assert.deepEqual(harness.guided.map((item) => item.classList.contains("is-active")), [false, true, false]);
  assert.deepEqual(harness.legacy.map((item) => item.classList.contains("is-active")), [false, true, false]);
  assert.deepEqual(harness.guided.map((item) => item.attribute("aria-pressed")), ["false", "true", "false"]);
  assert.equal(harness.shellAttributes["data-preview-mode"], "tablet");
});

test("devicekeuze verandert iframe-URL niet", () => {
  const harness = deviceHarness({ previewUrl: "https://preview.example/manual-v2" });
  harness.deviceApi.set("mobile");
  assert.equal(harness.shellAttributes.src, "https://preview.example/manual-v2");
});

test("devicekeuze verandert previewVersionId niet", () => {
  const harness = deviceHarness({ versionId: "28919104-f6f4-4f43-9216-a95c112f8606" });
  harness.deviceApi.set("tablet");
  assert.equal(harness.deviceApi.state().viewedPreviewVersionId, "28919104-f6f4-4f43-9216-a95c112f8606");
});

test("devicekeuze veroorzaakt geen API-call", () => {
  const harness = deviceHarness();
  harness.deviceApi.set("tablet");
  harness.deviceApi.set("mobile");
  assert.equal(harness.deviceApi.state().previewApiCalls, 0);
});

test("guided handler gebruikt de specifieke runtimebridge zonder legacy proxyklik", () => {
  const guidedStart = factory.lastIndexOf('document.querySelectorAll("[data-guided-preview-mode]")');
  const guidedHandler = factory.slice(guidedStart, factory.indexOf('document.querySelectorAll("[data-factory-action=\'versions\']")', guidedStart));
  assert.match(guidedHandler, /WebsiteFactoryRuntime\?\.setPreviewDevice\?\./);
  assert.doesNotMatch(guidedHandler, /data-preview-mode|\.click\(\)|viewPreviewVersion|data-view-preview-source/);
  assert.equal((guidedHandler.match(/addEventListener\("click"/g) || []).length, 1);
});

test("guided deviceknoppen zijn native keyboardknoppen voor Enter en Space", () => {
  for (const mode of ["desktop", "tablet", "mobile"]) {
    assert.match(factory, new RegExp(`<button[^>]*type="button"[^>]*data-guided-preview-mode="${mode}"`));
  }
  const guidedStart = factory.lastIndexOf('document.querySelectorAll("[data-guided-preview-mode]")');
  const guidedHandler = factory.slice(guidedStart, factory.indexOf('document.querySelectorAll("[data-factory-action=\'versions\']")', guidedStart));
  assert.doesNotMatch(guidedHandler, /keydown|keyup|stopPropagation/);
});

test("runtimebridge exposeert twee onafhankelijke statevelden", () => {
  const runtime = factory.slice(factory.indexOf("window.WebsiteFactoryRuntime = {"), factory.indexOf("async function resetDemoForRegeneration"));
  assert.match(runtime, /setPreviewDevice: \(mode\) => setPreviewDevice\(mode\)/);
  assert.match(runtime, /previewSource,/);
  assert.match(runtime, /previewDevice,/);
  assert.doesNotMatch(runtime, /factory-tablet/);
});

test("previewrender herstelt device zonder de bronselectie te vervangen", () => {
  const renderStart = factory.slice(factory.indexOf("function renderPreviewStage()"), factory.indexOf("const source = activePreviewSource()", factory.indexOf("function renderPreviewStage()")));
  assert.match(renderStart, /ensureViewedPreviewSelection\(\);\s*ensurePreviewDeviceSelection\(\);/);
  assert.doesNotMatch(deviceFunctions, /previewSource\s*=|viewedPreviewVersionId\s*=|viewPreviewVersion|activePreviewUrl|fetch\(/);
});

test("desktoplayout plaatst bronselector op een eigen gridrij zonder overlap", () => {
  assert.match(styles, /\.factory-guided-preview-toolbar\{[^}]*grid-template-columns:minmax\(170px,1fr\) auto;/);
  assert.match(styles, /\.factory-guided-preview-toolbar>\.factory-preview-view-selector\{grid-column:1\/-1;width:100%\}/);
  assert.match(styles, /\.factory-guided-device-controls\{[^}]*width:max-content;max-width:100%;min-width:0/);
});

test("390px-layout houdt devicecontrols binnen de toolbar", () => {
  assert.match(styles, /@media\(max-width:480px\)[\s\S]{0,300}\.factory-guided-preview-toolbar\{grid-template-columns:1fr\}\.factory-guided-device-controls\{overflow-x:auto\}/);
  assert.match(styles, /\.factory-guided-preview-toolbar>\*\{min-width:0\}/);
  assert.match(styles, /\.factory-guided-preview-workspace\{[^}]*overflow:hidden/);
});
