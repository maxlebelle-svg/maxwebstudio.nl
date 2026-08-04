const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const customerExtensions = new Set([".html", ".js", ".mjs", ".json", ".jsx", ".ts", ".tsx"]);

function walk(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(relative) : [relative];
  });
}

function protectedCustomerFiles() {
  return [...walk("public"), ...walk("functions")].filter((file) => {
    if (!customerExtensions.has(path.extname(file))) return false;
    if (/^public\/admin(?:\/|-|\.)/.test(file)) return false;
    if (/^functions\/admin-/.test(file)) return false;
    return true;
  });
}

function contrastRatio(first, second) {
  const luminance = (hex) => {
    const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("central tone-of-voice guide defines the customer communication contract", () => {
  const guide = read("docs/TONE_OF_VOICE_GUIDE.md");
  assert.match(guide, /Gebruik altijd `je`, `jij` en `jouw`/);
  assert.match(guide, /E-mails/);
  assert.match(guide, /Foutmeldingen/);
  assert.match(guide, /Succesmeldingen/);
  assert.match(guide, /Onboarding/);
  assert.match(guide, /Dashboard en lege statussen/);
  assert.match(guide, /Ja, laten we starten/);
});

test("customer-facing platform copy consistently uses the je-form", () => {
  const violations = protectedCustomerFiles().flatMap((file) => {
    const matches = read(file).match(/\b(?:u|uw|uwe)\b/gi) || [];
    return matches.length ? [`${file}: ${matches.join(", ")}`] : [];
  });
  assert.deepEqual(violations, []);
});

test("signing page presents the collaboration promise and legal consent before its only submit action", () => {
  const page = read("public/voorstel-ondertekenen.html");
  assert.match(page, /Nog één stap en we kunnen beginnen/);
  assert.match(page, /Dit mag je van ons verwachten/);
  assert.match(page, /We realiseren je website volgens de gemaakte afspraken/);
  assert.match(page, /persoonlijke klantportaal/);
  assert.match(page, /Door hieronder digitaal te ondertekenen ga je akkoord met de opdracht, de bijbehorende offerte en de algemene voorwaarden/);
  assert.match(page, /<button class="button" id="start" type="submit"[^>]*>Ja, laten we starten<\/button>/);
  assert.equal((page.match(/type="submit"/g) || []).length, 1, "there must be exactly one binding submission route");
  assert.match(page, /action: "start"/);
  assert.match(page, /location\.assign\(data\.signing\.redirectUrl\)/);
});

test("signing page keeps offer documents visible and labels every supported document type", () => {
  const page = read("public/voorstel-ondertekenen.html");
  for (const label of ["Offerte", "Overeenkomst", "Algemene voorwaarden", "Hosting- en onderhoudsvoorwaarden", "Privacyverklaring"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /target="_blank" rel="noopener noreferrer"/);
  assert.match(page, /document\.sourceUrl/);
  assert.match(page, /wordt in de beveiligde ondertekening getoond/);
});

test("signing page is keyboard, screen-reader and responsive ready", () => {
  const page = read("public/voorstel-ondertekenen.html");
  assert.match(page, /name="viewport" content="width=device-width,initial-scale=1"/);
  assert.match(page, /@media\(max-width:620px\)/);
  assert.match(page, /width:min\(860px,100%\)/);
  assert.match(page, /min-width:0/);
  assert.match(page, /overflow-wrap:anywhere/);
  assert.match(page, /:focus-visible/);
  assert.match(page, /role="status" aria-live="polite"/);
  assert.match(page, /aria-labelledby="page-title"/);
  assert.match(page, /aria-describedby="agreement-copy"/);
  assert.match(page, /<h1[^>]*>/);
  assert.match(page, /<h2[^>]*>/);
  assert.match(page, /<h3>/);
  assert.ok(contrastRatio("18a979", "041a13") >= 4.5, "primary CTA must meet WCAG AA text contrast");
  assert.ok(contrastRatio("071d2e", "d7e4ed") >= 4.5, "expectations copy must meet WCAG AA text contrast");
});

test("double submission is blocked in the browser and remains idempotent on the server", () => {
  const page = read("public/voorstel-ondertekenen.html");
  const endpoint = read("functions/commercial-offer-signing.js");
  assert.match(page, /let submissionPending = false/);
  assert.match(page, /if \(submissionPending\) return/);
  assert.match(page, /submissionPending = true/);
  assert.match(page, /button\.disabled = true/);
  assert.match(page, /form\.setAttribute\("aria-busy", "true"\)/);
  assert.match(endpoint, /if \(details\.transaction\) return json\(200,\{success:true,duplicate:true/);
  assert.match(endpoint, /idempotency_key:`commercial-signing:\$\{details\.version\.id\}`/);
});

test("required signer data, provider failure and legal evidence remain fail-closed", () => {
  const endpoint = read("functions/commercial-offer-signing.js");
  const migration = read("supabase/migrations/20260802213000_commercial_offer_signhost.sql");
  assert.match(endpoint, /SIGNER_NAME_INVALID/);
  assert.match(endpoint, /SIGNER_ROLE_INVALID/);
  assert.match(endpoint, /SIGNER_AUTHORITY_REQUIRED/);
  assert.match(endpoint, /createCommercialOfferTransaction/);
  assert.match(endpoint, /uploadFileMetadata/);
  assert.match(endpoint, /uploadPdf/);
  assert.match(endpoint, /startTransaction/);
  assert.match(endpoint, /status:"failed"/);
  assert.match(endpoint, /failure_code/);
  assert.match(migration, /commercial_offer_signing_transactions/);
  assert.match(migration, /commercial_finalize_offer_signature_v1/);
  assert.match(migration, /idempotency_key/);
  assert.match(migration, /signed_at/);
});
