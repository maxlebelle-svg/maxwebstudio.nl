const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const factory = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const demoSites = fs.readFileSync(path.join(root, "public/admin-demo-sites.html"), "utf8");
const backend = fs.readFileSync(path.join(root, "functions/demo-journey.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");

test("guided Factory exposes one primary action and a technical overflow menu", () => {
  assert.match(factory, /id="factory-primary-save-demo"[^>]*>Opslaan in Demo Sites/);
  assert.match(factory, /id="factory-more-menu"/);
  assert.equal((factory.match(/<button[^>]*data-manual-zip-upload/g) || []).length, 2);
  assert.match(factory, /factory-guided-shell[\s\S]*proxyClick\("demo-journey-upload-manual-zip"\)/);
  assert.match(factory, /data-factory-proxy="demo-journey-regenerate-preview"/);
});

test("guided preview reuses the existing preview engine and controls", () => {
  assert.match(factory, /id="factory-guided-preview-slot"/);
  assert.match(factory, /slot\.appendChild\(preview\)/);
  assert.match(factory, /data-guided-preview-mode="desktop"/);
  assert.match(factory, /data-guided-preview-mode="tablet"/);
  assert.match(factory, /data-guided-preview-mode="mobile"/);
  assert.match(factory, /id="demo-journey-preview-frame"/);
});

test("Factory 2.0 keeps the active website preview above the editing workspaces", () => {
  const previewWorkspace = factory.indexOf('class="factory-guided-preview-workspace"');
  const imageWorkspace = factory.indexOf('id="factory-images-workspace"');
  const legacyControls = factory.indexOf('class="factory-control-center"');
  assert.ok(previewWorkspace > -1);
  assert.ok(previewWorkspace < imageWorkspace);
  assert.ok(previewWorkspace < legacyControls);
  assert.match(factory, /id="factory-guided-preview-url"/);
  assert.match(factory, /data-factory-proxy="demo-journey-open-preview"/);
});

test("workspace navigation and image counts are real-state driven", () => {
  for (const tab of ["overview", "research", "branding", "content", "images", "structure", "seo", "build", "preview"]) {
    assert.match(factory, new RegExp(`data-factory-tab="${tab}"`));
  }
  assert.match(factory, /function imageState\(\)/);
  assert.match(factory, /#demo-intake-assets \.demo-intake-asset/);
  assert.match(factory, /#factory-media-review > div\.is-ready/);
  assert.match(factory, /function renderImageWorkspace\(\)/);
  assert.doesNotMatch(factory, /AI-gegenereerd<\/span><strong>[1-9]/);
});

test("Quick Build accepts a business name or valid website without requiring the full intake", () => {
  assert.match(factory, /id="factory-quick-business"/);
  assert.match(factory, /id="factory-quick-website"/);
  assert.match(factory, /if \(!business && !validUrl\)/);
  assert.match(factory, /buildReady: Boolean\(String\(elements\.business/);
  assert.match(factory, /if \(intake\.buildReady\) return true/);
  assert.match(factory, /const guidedIntakeKeys = new Set\(\["branch", "goal", "style", "cta", "services", "photoStatus"\]\)/);
});

test("image generation never fakes a provider result in production", () => {
  assert.match(factory, /function requestImageGeneration\(\)/);
  assert.match(factory, /AI-afbeeldingen zijn nog niet geconfigureerd/);
  assert.doesNotMatch(factory, /imageMock|Mockbeelden zijn veilig gegenereerd/);
});

test("status cards and process steps are derived from current Factory state", () => {
  assert.match(factory, /function guidedState\(\)/);
  assert.match(factory, /function renderGuidedStatus\(\)/);
  assert.match(factory, /function renderGuidedProcess\(\)/);
  for (const label of ["Briefing", "Research", "Afbeeldingen", "Content", "Structuur", "SEO", "Buildstatus", "Live zetten"]) {
    assert.match(factory, new RegExp(label));
  }
});

test("Demo Sites save persists all available relation keys on the same journey", () => {
  for (const key of ["leadId", "customerId", "projectId", "websiteId", "demoJourneyId", "previewVersionId"]) {
    assert.match(backend, new RegExp(`${key}:`));
  }
  assert.match(backend, /patchJourneySafe\(\{ supabaseUrl, serviceRoleKey, id: current\.id, record \}\)/);
  assert.match(backend, /protected_demo_version/);
});

test("Demo Sites routes back to the strongest available Factory context", () => {
  assert.match(demoSites, /\?customerId=/);
  assert.match(demoSites, /\?leadId=/);
  assert.match(demoSites, /\?demoJourneyId=/);
  assert.match(demoSites, /savedDemo\.previewVersion/);
});

test("guided layout has desktop, tablet and mobile responsive rules", () => {
  assert.match(styles, /\.factory-status-overview\{display:grid/);
  assert.match(styles, /@media\(max-width:1180px\)/);
  assert.match(styles, /@media\(max-width:820px\)/);
  assert.match(styles, /@media\(max-width:540px\)/);
  assert.match(styles, /\.factory-images-workspace\{display:grid/);
  assert.match(styles, /@media\(max-width:1280px\)/);
  assert.match(styles, /@media\(max-width:1024px\)/);
  assert.match(styles, /@media\(max-width:768px\)/);
});
