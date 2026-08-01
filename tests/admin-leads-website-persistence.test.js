const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const leads = require("../functions/admin-leads");
const source = fs.readFileSync(path.join(__dirname, "..", "functions", "admin-leads.js"), "utf8");
const admin = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "lisanne@example.test",
  role: "sales_partner",
};

test("handmatig ingevoerde website blijft beschikbaar via kolom en metadata", () => {
  const record = leads._test.leadPayload(
    { companyName: "Voorbeeldbedrijf", websiteUrl: "https://voorbeeld.nl" },
    admin,
    { create: true },
  );

  assert.equal(record.website, "https://voorbeeld.nl");
  assert.equal(record.metadata.websiteUrl, "https://voorbeeld.nl");
  assert.equal(leads._test.mapLead({ metadata: record.metadata }).websiteUrl, "https://voorbeeld.nl");
});

test("een ongerelateerde leadupdate wist de website niet", () => {
  const existingLead = {
    website: "https://voorbeeld.nl",
    metadata: { websiteUrl: "https://voorbeeld.nl" },
  };
  const update = leads._test.leadPayload(
    { notes: "Nieuwe notitie" },
    admin,
    { update: true, existingLead },
  );

  assert.equal(Object.hasOwn(update, "website"), false);
  assert.equal(Object.hasOwn(update.metadata, "websiteUrl"), false);
});

test("duplicate-opslag probeert beide websitekolommen voor de metadata-terugval", () => {
  assert.match(source, /website_url: websiteUrl/);
  assert.match(source, /website: websiteUrl/);
  assert.ok(source.indexOf("website_url: websiteUrl") < source.indexOf("record: { metadata: patch.metadata"));
});
