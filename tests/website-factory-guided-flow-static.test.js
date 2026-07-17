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
  assert.match(factory, /factory-guided-shell[\s\S]*openZipPicker\(\)/);
  assert.doesNotMatch(factory, /proxyClick\("demo-journey-upload-manual-zip"\)/);
  assert.match(factory, /data-factory-proxy="demo-journey-regenerate-preview"/);
});

test("guided preview reuses the existing preview engine and controls", () => {
  assert.match(factory, /id="factory-guided-preview-slot"/);
  assert.match(factory, /move\("\.factory-control-preview", "factory-guided-preview-slot"\)/);
  assert.match(factory, /data-guided-preview-mode="desktop"/);
  assert.match(factory, /data-guided-preview-mode="tablet"/);
  assert.match(factory, /data-guided-preview-mode="mobile"/);
  assert.match(factory, /id="demo-journey-preview-frame"/);
});

test("Factory 2.0 exposes distinct Builder and Preview Workspace modes", () => {
  assert.match(factory, /id="factory-builder-mode"[^>]*data-factory-mode="builder"/);
  assert.match(factory, /id="factory-workspace-mode"[^>]*data-factory-mode="workspace"/);
  assert.match(factory, /function syncFactoryMode\(/);
  assert.match(factory, /builder\.hidden = ready/);
  assert.match(factory, /workspace\.hidden = !ready/);
  const previewWorkspace = factory.indexOf('class="factory-guided-preview-workspace"');
  const imageWorkspace = factory.indexOf('id="factory-images-workspace"');
  const legacyControls = factory.indexOf('class="factory-control-center"');
  assert.ok(previewWorkspace > -1);
  assert.ok(previewWorkspace < imageWorkspace);
  assert.ok(previewWorkspace < legacyControls);
  assert.match(factory, /id="factory-guided-preview-url"/);
  assert.match(factory, /data-factory-proxy="demo-journey-open-preview"/);
});

test("workspace navigation uses real tab panels and image counts are state driven", () => {
  for (const tab of ["preview", "research", "content", "images", "seo", "mail", "project", "timeline"]) {
    assert.match(factory, new RegExp(`data-factory-tab="${tab}"`));
    assert.match(factory, new RegExp(`data-factory-panel="${tab}"`));
  }
  assert.match(factory, /role="tablist"/);
  assert.match(factory, /role="tabpanel"/);
  assert.match(factory, /panel\.hidden = !active/);
  assert.doesNotMatch(factory, /function activateFactoryTab[\s\S]{0,1200}scrollIntoView/);
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
  assert.match(factory, /await window\.WebsiteFactoryRuntime\.quickBuild/);
  assert.match(factory, /const savedJourney = journey\?\.id \? journey : await saveJourney\(\)/);
  assert.match(factory, /const result = await generatePreview\(currentPackageType\(\), \{ surface: "quick" \}\)/);
  assert.doesNotMatch(factory, /const waitForJourney = window\.setInterval/);
  assert.match(backend, /buildQuickFactoryBriefing\(sourceJourney\)/);
  assert.match(backend, /code: "FACTORY_IDENTITY_REQUIRED"/);
});

test("image generation never fakes a provider result in production", () => {
  assert.match(factory, /function requestImageGeneration\(\)/);
  assert.match(factory, /AI-afbeeldingen zijn nog niet geconfigureerd/);
  assert.doesNotMatch(factory, /imageMock|Mockbeelden zijn veilig gegenereerd/);
});

test("status cards and process steps are derived from current Factory state", () => {
  assert.match(factory, /function guidedState\(\)/);
  assert.match(factory, /pipeline: normalizeFactoryServerState\(\)/);
  const guidedStateSource = factory.slice(factory.indexOf("function guidedState()"), factory.indexOf("function renderGuidedStatus()"));
  assert.doesNotMatch(guidedStateSource, /text\("#demo-journey-(build|preview)/);
  assert.doesNotMatch(guidedStateSource, /document\.querySelectorAll\("#demo-intake-fields/);
  assert.match(factory, /function renderGuidedStatus\(\)/);
  assert.match(factory, /function renderGuidedProcess\(\)/);
  for (const label of ["Briefing", "Research", "Afbeeldingen", "Content", "SEO", "Mail", "Project", "Preview", "Timeline", "Live zetten"]) {
    assert.match(factory, new RegExp(label));
  }
});

test("journey recovery protects active server context and a real reset clears derived UI", () => {
  assert.match(factory, /protectedServerContext = serverState\.buildRunning \|\| serverState\.buildRetryable \|\| serverState\.previewStored/);
  assert.match(factory, /!journeyMatchesLead\(loadedJourney, lead\) && !protectedServerContext/);
  assert.match(factory, /function resetFactoryDerivedUi\(\)/);
  assert.match(factory, /"factory-process-next": "Volgende stap: Briefing"/);
  assert.match(factory, /delete element\.dataset\.signature/);
});

test("non-JSON platform 504 remains retryable with one safe diagnostic chain", () => {
  assert.match(factory, /data = \{ rawBody: responseBody \}/);
  assert.match(factory, /response\.status === 504 \? "UPSTREAM_TIMEOUT"/);
  assert.match(factory, /retryable: typeof data\.retryable === "boolean"/);
  assert.match(factory, /De buildstatus is opnieuw gecontroleerd/);
  assert.match(factory, /replace\(\/\\s\*Request-id:/);
  assert.match(factory, /if \(retryButton\) retryButton\.hidden = false/);
});

test("demo journey awaits async routes inside its backend error boundary", () => {
  assert.match(backend, /if \(event\.httpMethod === "GET"\) return await readAdminJourney/);
  assert.match(backend, /if \(event\.httpMethod === "POST"\) return await upsertJourney/);
  assert.match(backend, /if \(event\.httpMethod === "PATCH"\) return await upsertJourney/);
});

test("legacy components are moved before the duplicate Control Center layout is retired", () => {
  for (const mapping of [
    ['.factory-sources-panel', 'factory-research-panel-slot'],
    ['.factory-output-panel', 'factory-content-panel-slot'],
    ['.demo-status-card .factory-card', 'factory-build-panel-slot'],
    ['.project-workspace-card', 'factory-project-panel-slot'],
    ['.customer-timeline', 'factory-timeline-panel-slot'],
  ]) assert.ok(factory.includes(`move("${mapping[0]}", "${mapping[1]}")`), `missing component move for ${mapping[0]}`);
  assert.match(factory, /factory-control-center"\)\?\.classList\.add\("factory-legacy-layout-retired"\)/);
  assert.match(styles, /\.factory-legacy-layout-retired\{display:none!important\}/);
});

test("Demo Journey requests have a bounded upstream timeout with a concrete code", () => {
  assert.match(backend, /setTimeout\(\(\) => controller\.abort\(\), 8000\)/);
  assert.match(backend, /timeout\.status = 504/);
  assert.match(backend, /timeout\.code = "UPSTREAM_TIMEOUT"/);
  assert.match(backend, /timeout\.phase = "persist_demo_journey"/);
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
