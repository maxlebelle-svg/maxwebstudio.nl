const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const factory = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");

test("mailconcept toont een herkenbare e-mailclient en Max Webstudio-branding", () => {
  for (const marker of [
    "admin-email-preview-client",
    "admin-email-preview-envelope",
    "admin-email-brand",
    "admin-email-brand-mark",
    "admin-email-primary-action",
    "admin-email-security-note",
  ]) {
    assert.match(factory, new RegExp(marker));
  }

  assert.match(factory, /Max Webstudio/);
  assert.match(factory, /BUILD BETTER ONLINE/);
  assert.match(factory, /Concept · niet verzonden/);
});

test("preview gebruikt actuele klantvelden en ontsnapt klantinvoer", () => {
  for (const field of ["new-name", "new-email", "new-company", "new-website", "new-package"]) {
    assert.match(factory, new RegExp(`getElementById\\("${field}"\\)`));
  }

  assert.match(factory, /escapeHtml\(name\)/);
  assert.match(factory, /escapeHtml\(company\)/);
  assert.match(factory, /escapeHtml\(website\)/);
  assert.match(factory, /escapeHtml\(packageName\)/);
});

test("preview blijft niet-interactief, niet-verzendend en mobiel leesbaar", () => {
  assert.match(factory, /aria-disabled="true">Account activeren/);
  assert.match(factory, /Er is nog geen echte e-mail verzonden/);

  const previewBlock = factory.slice(
    factory.indexOf("async function sendInviteFromNewCustomer"),
    factory.indexOf("function populateWebsiteProfileOptions"),
  );
  assert.doesNotMatch(previewBlock, /fetch\(|sendEmail\(/);
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*\.admin-email-project-card \{ grid-template-columns: 1fr/,
  );
});
