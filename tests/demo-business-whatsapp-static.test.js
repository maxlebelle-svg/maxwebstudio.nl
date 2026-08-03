const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const demoSites = fs.readFileSync(path.join(root, "public/admin-demo-sites.html"), "utf8");

test("demo previews use the dedicated business WhatsApp Web route", () => {
  assert.match(demoSites, /id="demo-journey-send-business-whatsapp"/);
  assert.match(demoSites, /https:\/\/web\.whatsapp\.com\/send\?phone=/);
  assert.match(demoSites, /businessWhatsappPreviewUrl\(journey\?\.previewUrl/);
  assert.match(demoSites, /085 130 5282 actief is/);
});

test("business WhatsApp preview message includes the active preview URL", () => {
  assert.match(demoSites, /const url = absolutePreviewUrl\(previewUrl\)/);
  assert.match(demoSites, /Max le Belle van Maxwebstudio\.nl hier/);
  assert.match(demoSites, /Je kunt hem hier rustig bekijken/);
  assert.match(demoSites, /Laat vooral eerlijk weten wat je aanspreekt/);
});
