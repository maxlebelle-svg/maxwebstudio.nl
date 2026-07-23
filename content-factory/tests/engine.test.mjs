import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generateContentPackage, writeContentPackage } from "../src/engine.mjs";

const request = { branch: "loodgieter", businessName: "Jansen Installaties", place: "Utrecht", region: "Midden-Nederland", phone: "030-1234567", email: "info@example.test", seed: 3 };

test("engine genereert alle gevraagde kanalen", () => {
  const output = generateContentPackage(request);
  const channels = ["homepage", "services", "about", "contact", "faq", "blogs", "seo", "social_media", "newsletter", "google_business_profile"];
  for (const channel of channels) assert.ok(output[channel], `${channel} ontbreekt`);
  assert.equal(output.manifest.branch, "loodgieter");
  assert.equal(output.homepage.services.length, 6);
  assert.equal(output.faq.length, 12);
  assert.equal(output.social_media.length, 30);
  assert.match(output.homepage.seo.title, /Jansen Installaties/);
  assert.match(JSON.stringify(output.homepage), /Utrecht/);
  assert.doesNotMatch(JSON.stringify(output.homepage), /\[BEDRIJFSNAAM\]|\[PLAATS\]/);
});

test("dezelfde seed selecteert dezelfde inhoud", () => {
  const first = generateContentPackage(request);
  const second = generateContentPackage(request);
  delete first.manifest.generated_at;
  delete second.manifest.generated_at;
  assert.deepEqual(second, first);
});

test("engine schrijft één JSON-bestand per onderdeel", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "content-factory-"));
  writeContentPackage(request, temp);
  for (const file of ["manifest.json", "homepage.json", "services.json", "about.json", "contact.json", "faq.json", "blogs.json", "seo.json", "social_media.json", "newsletter.json", "google_business_profile.json", "assets.json"]) {
    assert.ok(fs.existsSync(path.join(temp, file)), `${file} ontbreekt`);
  }
});

test("onbekende branch wordt veilig geweigerd", () => {
  assert.throws(() => generateContentPackage({ ...request, branch: "bestaat-niet" }), /Onbekende branche/);
});
