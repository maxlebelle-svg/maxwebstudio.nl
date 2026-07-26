const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = process.cwd();
const html = fs.readFileSync(path.join(root, "public/klantportaal.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/cx2-dashboard.css"), "utf8");
const source = fs.readFileSync(path.join(root, "public/src/cx2-dashboard-viewmodel.mjs"), "utf8");

async function viewModelModule() {
  return import(`${pathToFileURL(path.join(root, "public/src/cx2-dashboard-viewmodel.mjs")).href}?test=${Date.now()}`);
}

test("dashboard-viewmodel gebruikt alleen expliciete projectvoortgang", async () => {
  const { buildCustomerDashboardViewModel } = await viewModelModule();
  const missing = buildCustomerDashboardViewModel({
    customer: { name: "Ziva Test", company: "DCA ZIP Studio" },
    projects: [{ status: "development" }],
  });
  assert.equal(missing.greeting, "Welkom terug, Ziva 👋");
  assert.equal(missing.project.progress.available, false);
  assert.equal(missing.project.progress.label, "Nog niet beschikbaar");

  const explicit = buildCustomerDashboardViewModel({ projects: [{ progress: 45, phase: "Ontwikkeling" }] });
  assert.equal(explicit.greeting, "Welkom terug 👋");
  assert.equal(explicit.project.progress.available, true);
  assert.equal(explicit.project.progress.value, 45);
  assert.equal(explicit.project.phase, "Ontwikkeling");
});

test("dashboard presenteert exact de zeven goedgekeurde modules", async () => {
  const { buildCustomerDashboardViewModel, CX2_DASHBOARD_MODULE_ORDER } = await viewModelModule();
  const model = buildCustomerDashboardViewModel({
    customer: { name: "Ziva", company: "DCA ZIP Studio" },
    projects: [{ name: "Nieuwe website", progress: 45, phase: "Ontwikkeling" }],
    websites: [{ domain: "https://www.example.test/pad", status: "online" }],
    previewVersions: [{ version: 2, status: "ready_for_review", safePreviewPath: "/.netlify/functions/client-preview-render?id=safe", feedbackCount: 3 }],
    messages: [{ status: "unread" }],
    files: [{ id: "file" }],
    invoices: [{ status: "verzonden" }],
  });

  assert.deepEqual(model.modules.map((module) => module.key), CX2_DASHBOARD_MODULE_ORDER);
  assert.equal(model.modules.find((module) => module.key === "domain").value, "example.test");
  assert.equal(model.modules.find((module) => module.key === "messages").value, "1 nieuw");
  assert.equal(model.modules.find((module) => module.key === "business_email").available, false);
  assert(!model.modules.some((module) => ["ai_telefoniste", "social_studio"].includes(module.key)));
});

test("dashboard heeft loading, lege, beschikbare en latere toestanden", async () => {
  const { buildCustomerDashboardViewModel } = await viewModelModule();
  const empty = buildCustomerDashboardViewModel({ customer: { name: "Ziva" } });
  assert.equal(empty.modules.find((module) => module.key === "website").status, "Wordt voorbereid");
  assert.equal(empty.modules.find((module) => module.key === "files").value, "Nog geen bestanden");
  assert.equal(empty.modules.find((module) => module.key === "invoices").value, "Nog geen facturen");
  assert.equal(empty.modules.find((module) => module.key === "business_email").status, "Volgt later");
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Klantdata veilig laden/);
});

test("CX2-dashboard is semantisch, responsief en reduced-motion veilig", () => {
  assert.match(html, /aria-labelledby="command-center-title"/);
  assert.match(html, /aria-labelledby="cx2-dashboard-modules-title"/);
  assert.match(html, /aria-label="Projectfasen"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-template-columns: 1fr/);
  const touchTargetRule = css.match(/\.portal-body :where\([\s\S]*?\) \{\s*min-width: 44px;\s*min-height: 44px;\s*\}/)?.[0] || "";
  assert.match(touchTargetRule, /\.button/);
  assert.match(touchTargetRule, /button/);
  assert.match(touchTargetRule, /\.cx2-dashboard a/);
  assert.match(touchTargetRule, /\.portal-nav a/);
  assert.match(touchTargetRule, /\[role="tab"\]/);
  assert.match(css, /\.cx2-module-card \.cx2-module-action \{[\s\S]*?min-height: 44px;/);
});

test("assetmodule start pas na bewezen customercontext en behoudt veilige laadvolgorde", () => {
  const assetSource = fs.readFileSync(path.join(root, "public/admin/ui/client-asset-upload.js"), "utf8");
  assert.match(html, /window\.__MWS_RELATIONSHIP_ASSET_CONTEXT_READY__ = true;\s*window\.dispatchEvent\(new CustomEvent\("relationship-assets:refresh-requested"\)\)/);
  assert.match(assetSource, /if \(window\.__MWS_RELATIONSHIP_ASSET_CONTEXT_READY__ === true\) \{\s*loadAssets\(\{ source: "verified-context" \}\);/);
  assert.doesNotMatch(assetSource, /loadAssets\(\{ source: "initial" \}\)/);
});

test("Sprint 4 raakt geen auth-, ownership- of backendcontract aan", () => {
  assert.match(html, /requireCustomerAccess/);
  assert.match(html, /getClientCustomerProfileContext/);
  assert.match(html, /getClientWebsiteProjectContext/);
  assert.match(html, /loadClientJourneyProgress/);
  assert.match(html, /buildCustomerDashboardViewModel/);
  assert.doesNotMatch(source, /service[_-]?role|access_token|refresh_token|leads\.customer_id/i);
  assert.doesNotMatch(source, /fetch\(|supabase|insert\(|update\(|delete\(/i);
});

test("dashboard gebruikt geen helper uit de private journey-modulescope", () => {
  const renderer = html.match(/function renderProjectCommandCenter\([\s\S]*?\n        }\n        function quoteUrl/)?.[0] || "";
  assert(renderer);
  assert.doesNotMatch(renderer, /\bmessage\s*\(/);
  assert.match(renderer, /document\.createElement\("p"\)/);
});
