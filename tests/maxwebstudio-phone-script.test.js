const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sales = fs.readFileSync(path.resolve(__dirname, "../public/admin-sales.html"), "utf8");
const leadGenerator = fs.readFileSync(path.resolve(__dirname, "../public/admin-lead-generator.html"), "utf8");

test("Sales Cockpit toont het nieuwe telefoonscript en de drie kwalificatievragen", () => {
  for (const text of [
    "Telefoonscript Max Webstudio",
    "stoor ik?",
    "heel veel kansen laat liggen",
    "Wij draaien dat volledig om",
    "Geen afspraak nodig",
    "Wat zijn de belangrijkste diensten van het bedrijf?",
    "In welke regio wil je vooral gevonden worden?",
    "Op welk e-mailadres mag ik de persoonlijke demo straks sturen?",
    "Geen aanbetaling. Geen risico.",
    "Je ontvangt de demo binnen enkele dagen in je mailbox",
  ]) assert.match(sales, new RegExp(text.replace(/[?]/g, "\\?"), "i"));
});

test("opgeslagen belnotitie gebruikt dezelfde nieuwe tekst en vult leadcontext in", () => {
  assert.match(sales, /function maxWebstudioPhoneScript/);
  assert.match(sales, /Spreek ik toevallig met de eigenaar van \$\{bedrijf\}/);
  assert.match(sales, /Antwoord: \$\{lead\.region/);
  assert.match(sales, /Antwoord: \$\{values\.email \|\| lead\.email/);
  assert.match(sales, /maxWebstudioPhoneScript\(lead, values\)/);
});

test("Lead Generator gebruikt eveneens het actuele script", () => {
  assert.match(leadGenerator, /function leadIntakeChecklist[\s\S]*TELEFOONSCRIPT MAX WEBSTUDIO/);
  assert.match(leadGenerator, /Je ontvangt de demo binnen enkele dagen in je mailbox/);
});

test("gekopieerde afsluiting volgt de nieuwe afsluiting", () => {
  assert.match(sales, /copyCallScriptClosing[\s\S]*Hartelijk bedankt[\s\S]*Fijne dag nog!/);
});
