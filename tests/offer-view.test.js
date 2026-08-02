const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("public/offerte.html", "utf8");
const css = fs.readFileSync("public/offer-view.css", "utf8");
const browser = fs.readFileSync("public/src/offer-view.js", "utf8");
const endpoint = fs.readFileSync("functions/client-quote.js", "utf8");

test("customer offer page uses the dedicated secure document layout", () => {
  assert.match(html, /class="offer-view-page"/);
  assert.match(html, /href="offer-view\.css"/);
  assert.match(html, /src="\.\/src\/offer-view\.js"/);
  assert.match(html, /Zakelijke offerte · beveiligde weergave/);
  assert.match(html, /server-side vastgelegde offerteversie/);
  assert.match(css, /\.offer-document/);
  assert.match(css, /overflow-x:hidden/);
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /@media print/);
});

test("offer page clearly presents scope, VAT, documents and immutable evidence", () => {
  for (const phrase of [
    "Prijs excl. btw",
    "Bedrag excl. btw",
    "Totaal incl. btw",
    "Duidelijkheid vóór akkoord",
    "Algemene voorwaarden",
    "Privacyverklaring",
    "Hosting- en onderhoudsvoorwaarden",
    "Controleerbare documentreferentie",
    "Offerteweergave 2026-08 B2B",
  ]) assert.match(browser, new RegExp(phrase));
  assert.match(browser, /quote\.checksum/);
  assert.match(browser, /quote\.version/);
  assert.match(browser, /quote\.acceptanceStatement/);
});

test("acceptance is explicit, server-verified and cannot silently start payment", () => {
  assert.match(browser, /button\.disabled = true/);
  assert.match(browser, /consent\.addEventListener\("change"/);
  assert.match(browser, /expectedVersion: quote\.version/);
  assert.match(browser, /expectedChecksum: quote\.checksum/);
  assert.match(browser, /Er wordt geen betaling gestart/);
  assert.match(endpoint, /acceptanceStatement: ACCEPTANCE_STATEMENT/);
  assert.match(endpoint, /sideEffects: \{ paymentStarted: false, emailSent: false \}/);
  assert.doesNotMatch(browser, /localStorage\.setItem|maxwebstudioQuotes/);
});
