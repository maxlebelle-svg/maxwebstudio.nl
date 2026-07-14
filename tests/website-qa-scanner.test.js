const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/admin-website-qa-scanner.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/admin/styles/website-qa-scanner.css"), "utf8");
const source = fs.readFileSync(path.join(root, "public/admin/ui/website-qa-scanner.js"), "utf8");
const scanner = require("../public/admin/ui/website-qa-scanner.js");

test("QA Scanner keeps the shared admin security and workspace contracts", () => {
  assert.match(html, /data-shared-admin-sidebar="true"/);
  assert.match(html, /id="admin-sidebar-root"/);
  assert.match(html, /admin-route-guard\.js/);
  assert.match(html, /active-relationship\.js/);
  assert.match(html, /admin-sidebar-dashboard-pilot\.js/);
  assert.doesNotMatch(html, /onclick=/i);
});

test("QA Scanner dashboard exposes the approved sections and honest empty states", () => {
  [
    "Controleer of een klantwebsite verkoopklaar is.",
    "QA overzicht",
    "Recente scans",
    "Scancategorieën",
    "Hoe het werkt",
    "Nog geen QA-rapport",
    "Start een scan",
    "Mockscan actief",
    "Geen live flows gekoppeld",
  ].forEach((copy) => assert.match(html, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")));
  assert.match(html, /interne mockchecks/i);
  assert.match(html, /Lighthouse en PageSpeed Insights zijn voorbereid, maar nog niet live gekoppeld/i);
  assert.doesNotMatch(html, /Bekijk alle scans/);
  assert.doesNotMatch(html, /Meer over QA Scanning"\s+href=/);
});

test("QA Scanner uses the central seven-category mapping", () => {
  assert.deepEqual(scanner.CATEGORY_CONFIG.map((category) => category.label), [
    "Performance",
    "SEO",
    "Mobiel",
    "Toegankelijkheid",
    "Best Practices",
    "Content & Structuur",
    "Beveiliging",
  ]);
  assert.match(source, /aggregateCategories/);
  assert.match(source, /sourceIds/);
});

test("URL validation accepts http(s), normalizes domains and blocks unsafe protocols", () => {
  assert.deepEqual(scanner.validateWebsiteUrl(""), { isValid: false, message: "Vul eerst een website-URL in." });
  assert.equal(scanner.validateWebsiteUrl("https://voorbeeld.nl").url, "https://voorbeeld.nl/");
  assert.equal(scanner.validateWebsiteUrl("http://voorbeeld.nl/pad").url, "http://voorbeeld.nl/pad");
  assert.equal(scanner.validateWebsiteUrl("voorbeeld.nl").url, "https://voorbeeld.nl/");
  assert.equal(scanner.validateWebsiteUrl("dit is geen url").isValid, false);
  assert.equal(scanner.validateWebsiteUrl("javascript:alert(1)").isValid, false);
  assert.equal(scanner.validateWebsiteUrl("ftp://voorbeeld.nl").isValid, false);
  assert.equal(scanner.validateWebsiteUrl("https://user:secret@voorbeeld.nl").isValid, false);
});

test("mock results stay explicit and all dashboard values derive from result checks", () => {
  const result = scanner.createMockQAResult("https://voorbeeld.nl/", "2026-07-14T12:00:00.000Z");
  assert.equal(result.source, "mock");
  assert.equal(result.sourceLabel, "Mockscan");
  assert.equal(result.scannedUrl, "https://voorbeeld.nl/");
  assert.equal(result.scannedAt, "2026-07-14T12:00:00.000Z");
  assert.ok(result.qualityScore >= 0 && result.qualityScore <= 100);

  const summary = scanner.summarizeChecks(result);
  assert.ok(summary.good > 0);
  assert.ok(summary.warning > 0);
  assert.ok(summary.critical > 0);

  const categories = scanner.aggregateCategories(result);
  assert.equal(categories.length, 7);
  assert.equal(categories.find((category) => category.label === "Beveiliging").status, "untested");
  assert.equal(categories.find((category) => category.label === "Beveiliging").total, 0);
});

test("loading, success and error states are implemented without a live external scan", () => {
  assert.match(source, /setLoading\(true\)/);
  assert.match(source, /try\s*\{/);
  assert.match(source, /catch\s*\(error\)/);
  assert.match(source, /Mockscan afgerond/);
  assert.match(source, /kon niet worden afgerond/);
  assert.match(source, /runPreparedMockScan/);
  assert.doesNotMatch(source, /fetch\s*\(/);
});

test("QA Scanner has responsive and accessible interaction contracts", () => {
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /for="qa-url-input"/);
  assert.match(html, /aria-controls="qa-settings-panel"/);
  assert.match(css, /@media \(max-width: 1280px\)/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /focus-visible/);
});
