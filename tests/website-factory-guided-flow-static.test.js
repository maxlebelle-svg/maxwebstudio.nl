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
  assert.match(factory, /factory-guided-shell[\s\S]*openManualZipPicker/);
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

test("status cards and process steps are derived from current Factory state", () => {
  assert.match(factory, /function guidedState\(\)/);
  assert.match(factory, /function renderGuidedStatus\(\)/);
  assert.match(factory, /function renderGuidedProcess\(\)/);
  for (const label of ["Briefing", "Research", "Website scan", "Build status", "Preview", "Feedback", "Live zetten"]) {
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
});
