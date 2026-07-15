const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildWebsitePackage } = require("../functions/_website-factory-core");
const { FACTORY_EDITOR_MANIFEST, validateEditorManifest } = require("../functions/_preview-editor-manifest");
const { MAX_MESSAGE_BYTES, PROTOCOL, injectEditorRuntime, parseEditorContext, requestOrigin, stripUntrustedEditorContent } = require("../functions/_preview-editor-runtime");
const parentBridge = require("../public/admin/ui/website-factory-preview-editor.js");
const manualRenderer = require("../functions/manual-preview-render");
const demoRenderer = require("../functions/demo-preview");

const VERSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_VERSION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NONCE = "0123456789abcdef0123456789abcdef";
const ORIGIN = "https://maxwebstudio.nl";

function packageForFactory() {
  return buildWebsitePackage({
    journey: { businessName: "Editor Testbedrijf", websiteUrl: "https://editor-test.example", email: "info@editor-test.example", phone: "0612345678" },
    briefing: "Branche: zakelijke dienstverlening\nDiensten: Advies, Strategie, Uitvoering\nDoel: offerteaanvragen",
    version: 3,
  });
}

function marker(html, section) {
  const pattern = new RegExp(`<(?:section|footer)[^>]*data-mws-section-id=["']${section.id}["'][^>]*data-mws-section-type=["']${section.type}["']`, "i");
  return pattern.test(html);
}

test("new Factory builds contain a valid stable manifest matching DOM markers and fields", () => {
  const generated = packageForFactory();
  const manifest = validateEditorManifest(generated.meta.editorManifest);
  const html = generated.files.find((file) => file.path === "index.html").content;
  assert.deepEqual(manifest, JSON.parse(JSON.stringify(FACTORY_EDITOR_MANIFEST)));
  const sections = manifest.pages.find((page) => page.path === "index.html").sections;
  assert.deepEqual(sections.map((section) => section.type), ["hero", "text", "services", "cta", "footer"]);
  for (const section of sections) {
    assert.equal(marker(html, section), true, `missing DOM marker for ${section.id}`);
    for (const field of section.fields) assert.match(html, new RegExp(`data-mws-field=["']${field}["']`));
  }
});

test("editor context requires explicit mode, nonce, matching preview version and manifest", () => {
  const options = { filePath: "index.html", previewVersionId: VERSION_ID, source: "factory", manifest: FACTORY_EDITOR_MANIFEST };
  assert.equal(parseEditorContext({}, options), null);
  assert.equal(parseEditorContext({ editorMode: "sections", editorSession: "short", previewVersionId: VERSION_ID }, options), null);
  assert.equal(parseEditorContext({ editorMode: "sections", editorSession: NONCE, previewVersionId: OTHER_VERSION_ID }, options), null);
  const context = parseEditorContext({ editorMode: "sections", editorSession: NONCE, previewVersionId: VERSION_ID }, options);
  assert.equal(context.previewVersionId, VERSION_ID);
  assert.equal(context.manifest.pages[0].sections.length, 5);
});

test("runtime is injected only for a valid editor context and leaves source package immutable", () => {
  const generated = packageForFactory();
  const original = generated.files.find((file) => file.path === "index.html").content;
  const context = parseEditorContext({ editorMode: "sections", editorSession: NONCE, previewVersionId: VERSION_ID }, {
    filePath: "index.html", previewVersionId: VERSION_ID, source: "factory", manifest: generated.meta.editorManifest,
  });
  const editedResponse = injectEditorRuntime(original, context, ORIGIN);
  assert.match(editedResponse, /data-mws-editor-runtime/);
  assert.match(editedResponse, /mws:factory-editor:v1/);
  assert.equal(injectEditorRuntime(original, null, ORIGIN), original);
  assert.equal(generated.files.find((file) => file.path === "index.html").content, original);
});

test("parent bridge rejects wrong source, origin, nonce, version, schema and oversized messages", () => {
  const frameWindow = {};
  const state = { frameWindow, origin: ORIGIN, nonce: NONCE, previewVersionId: VERSION_ID };
  const section = { id: "home.hero", type: "hero", label: "Hero", page: "index.html", source: "factory", editable: true, fields: ["title"], capabilities: ["read:title"] };
  const data = { protocol: PROTOCOL, type: "SECTION_SELECTED", nonce: NONCE, previewVersionId: VERSION_ID, payload: { section } };
  assert.equal(parentBridge.validateBridgeEvent({ source: frameWindow, origin: ORIGIN, data }, state), true);
  assert.equal(parentBridge.validateBridgeEvent({ source: {}, origin: ORIGIN, data }, state), false);
  assert.equal(parentBridge.validateBridgeEvent({ source: frameWindow, origin: "https://attacker.example", data }, state), false);
  assert.equal(parentBridge.validateBridgeEvent({ source: frameWindow, origin: ORIGIN, data: { ...data, nonce: "wrong" } }, state), false);
  assert.equal(parentBridge.validateBridgeEvent({ source: frameWindow, origin: ORIGIN, data: { ...data, previewVersionId: OTHER_VERSION_ID } }, state), false);
  assert.equal(parentBridge.validateBridgeEvent({ source: frameWindow, origin: ORIGIN, data: { ...data, payload: { section: { ...section, id: "<bad>" } } } }, state), false);
  const oversized = { ...data, payload: { section: { ...section, label: "x".repeat(MAX_MESSAGE_BYTES) } } };
  assert.ok(parentBridge.byteLength(oversized) > MAX_MESSAGE_BYTES);
  assert.equal(parentBridge.validateBridgeEvent({ source: frameWindow, origin: ORIGIN, data: oversized }, state), false);
});

test("editor URL stays same-origin and never uses a wildcard target", () => {
  const state = { origin: ORIGIN, nonce: NONCE, previewVersionId: VERSION_ID };
  const url = new URL(parentBridge.editorUrl("/.netlify/functions/demo-preview?id=journey", state));
  assert.equal(url.origin, ORIGIN);
  assert.equal(url.searchParams.get("editorMode"), "sections");
  assert.equal(url.searchParams.get("editorSession"), NONCE);
  assert.equal(parentBridge.editorUrl("https://attacker.example/preview", state), "");
  const parentSource = fs.readFileSync(path.join(__dirname, "../public/admin/ui/website-factory-preview-editor.js"), "utf8");
  const runtimeSource = fs.readFileSync(path.join(__dirname, "../functions/_preview-editor-runtime.js"), "utf8");
  assert.doesNotMatch(parentSource, /postMessage\([^\n]+["']\*["']/);
  assert.doesNotMatch(runtimeSource, /postMessage\([^\n]+["']\*["']/);
});

test("ZIP preview without explicit markers remains a non-mutating read-only editor surface", async () => {
  const token = "0123456789abcdef0123456789abcdef";
  const version = { id: VERSION_ID, preview_token: token, generated_package: { entryFile: "index.html", files: [{ path: "index.html", encoding: "utf8", content: "<!doctype html><html><body><main><h1>ZIP zonder markers</h1></main></body></html>" }] } };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => [version] });
  try {
    const result = await manualRenderer.handler({ httpMethod: "GET", headers: { host: "maxwebstudio.nl", "x-forwarded-proto": "https" }, queryStringParameters: { version: VERSION_ID, token, editorMode: "sections", editorSession: NONCE, previewVersionId: VERSION_ID } });
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /data-mws-editor-runtime/);
    assert.doesNotMatch(version.generated_package.files[0].content, /data-mws-editor-runtime/);
    assert.match(result.body, /missing_explicit_editor_markers/);
  } finally {
    global.fetch = previousFetch;
  }
});

test("ZIP editor copy strips untrusted scripts, handlers, frames and javascript URLs only in editor mode", () => {
  const source = '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=https://attacker.example"></head><body onload="steal()"><a href="javascript:steal()">Link</a><iframe src="https://attacker.example"></iframe><script>window.parent.postMessage("forged","*")</script></body></html>';
  const safe = stripUntrustedEditorContent(source);
  assert.doesNotMatch(safe, /<script|onload=|<iframe|http-equiv="refresh"|javascript:/i);
  const context = parseEditorContext({ editorMode: "sections", editorSession: NONCE, previewVersionId: VERSION_ID }, { filePath: "index.html", previewVersionId: VERSION_ID, source: "manual_zip" });
  const rendered = injectEditorRuntime(source, context, ORIGIN);
  assert.match(rendered, /data-mws-editor-runtime/);
  assert.doesNotMatch(rendered, /steal\(\)|attacker\.example/);
  assert.match(source, /window\.parent\.postMessage/);
});

test("normal manual preview, client portal and Demo Sites do not receive editor runtime", async () => {
  const token = "0123456789abcdef0123456789abcdef";
  const version = { id: VERSION_ID, preview_token: token, generated_package: { entryFile: "index.html", files: [{ path: "index.html", encoding: "utf8", content: "<!doctype html><html><body>Normaal</body></html>" }] } };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => [version] });
  try {
    const result = await manualRenderer.handler({ httpMethod: "GET", headers: {}, queryStringParameters: { version: VERSION_ID, token } });
    assert.equal(result.statusCode, 200);
    assert.doesNotMatch(result.body, /data-mws-editor-runtime/);
  } finally {
    global.fetch = previousFetch;
  }
  const clientRenderer = fs.readFileSync(path.join(__dirname, "../functions/client-preview-render.js"), "utf8");
  const demoSites = fs.readFileSync(path.join(__dirname, "../public/admin-demo-sites.html"), "utf8");
  assert.doesNotMatch(clientRenderer, /_preview-editor-runtime|data-mws-editor-runtime/);
  assert.doesNotMatch(demoSites, /website-factory-preview-editor|editorMode=sections/);
});

test("Factory preview validates the requested version before injecting the runtime and sends hardened headers", async () => {
  const generated = packageForFactory();
  const journeyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const token = "fedcba9876543210fedcba9876543210";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("website_preview_versions")) return { ok: true, status: 200, text: async () => JSON.stringify([{ id: VERSION_ID, demo_journey_id: journeyId, preview_token: token, generated_package: generated }]) };
    return { ok: true, status: 200, text: async () => JSON.stringify([{ id: journeyId, preview_token: token, preview_package: generated }]) };
  };
  try {
    const result = await demoRenderer.handler({ httpMethod: "GET", headers: { host: "maxwebstudio.nl", "x-forwarded-proto": "https" }, queryStringParameters: { id: journeyId, token, source: "factory", editorMode: "sections", editorSession: NONCE, previewVersionId: VERSION_ID } });
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /data-mws-editor-runtime/);
    assert.equal(result.headers["X-Frame-Options"], "SAMEORIGIN");
    assert.equal(result.headers["Referrer-Policy"], "no-referrer");
    assert.match(result.headers["Content-Security-Policy"], /frame-ancestors 'self'/);
  } finally {
    global.fetch = previousFetch;
  }
});

test("runtime declares hover, click selection and Escape deselection without mutating content", () => {
  const runtimeSource = fs.readFileSync(path.join(__dirname, "../functions/_preview-editor-runtime.js"), "utf8");
  assert.match(runtimeSource, /addEventListener\("mouseover"[\s\S]*SECTION_HOVERED/);
  assert.match(runtimeSource, /addEventListener\("click"[\s\S]*SECTION_SELECTED/);
  assert.match(runtimeSource, /event\.key === "Escape"[\s\S]*deselect\(\)/);
  assert.match(runtimeSource, /event\.preventDefault\(\); event\.stopPropagation\(\)/);
  assert.doesNotMatch(runtimeSource, /innerHTML\s*=|outerHTML\s*=|document\.write/);
});

test("legacy Factory versions without a manifest cannot activate editor mode", () => {
  const factoryHtml = fs.readFileSync(path.join(__dirname, "../public/admin-website-factory.html"), "utf8");
  assert.match(factoryHtml, /const hasEditorManifest = \(version\) => version\?\.generatedPackage\?\.meta\?\.editorManifest\?\.version === 1/);
  assert.match(factoryHtml, /const supportsEditor = \(version\) => source === "manual" \? isManual\(version\) : !isManual\(version\) && hasEditorManifest\(version\)/);
});

test("request origin is exact and rejects malformed forwarded hosts", () => {
  assert.equal(requestOrigin({ headers: { host: "maxwebstudio.nl", "x-forwarded-proto": "https" } }), ORIGIN);
  assert.equal(requestOrigin({ headers: { host: "maxwebstudio.nl.evil.test/path", "x-forwarded-proto": "https" } }), "");
});
