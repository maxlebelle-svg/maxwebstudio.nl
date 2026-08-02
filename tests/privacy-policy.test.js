const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/privacyverklaring.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/legal-document.css"), "utf8");

test("privacy policy uses the current legal document layout and version", () => {
  assert.match(html, /class="legal-document-page"/);
  assert.match(html, /legal-document\.css/);
  assert.match(html, /Versie 2026-08/);
  assert.match(html, /Ingangsdatum 2 augustus 2026/);
  assert.match(css, /\.legal-hero-copy,\.legal-hero-note\{min-width:0\}/);
  assert.match(css, /font-size:clamp\(2\.25rem,11vw,3\.2rem\)/);
});

test("privacy policy describes the actual services, suppliers and safeguards", () => {
  for (const phrase of [
    "Overeenkomst of voorbereiding daarvan",
    "Wettelijke verplichting",
    "Gerechtvaardigd belang",
    "Toestemming",
    "Zakelijke prospects en commerciële benadering",
    "Netlify en Supabase",
    "Resend",
    "Mollie",
    "Google Fonts",
    "Verwerking buiten de EER",
    "AI en geautomatiseerde verwerking",
    "We verkopen geen persoonsgegevens",
  ]) assert.match(html, new RegExp(phrase));
});

test("privacy policy contains retention criteria, data-subject rights and complaint route", () => {
  assert.match(html, /maximaal 24 maanden/);
  assert.match(html, /doorgaans 7 jaar/);
  assert.match(html, /maximaal 90 dagen/);
  assert.match(html, /recht op inzage, correctie, verwijdering, beperking, dataportabiliteit en bezwaar/);
  assert.match(html, /binnen één maand/);
  assert.match(html, /autoriteitpersoonsgegevens\.nl\/een-tip-of-klacht-indienen-bij-de-ap/);
});
