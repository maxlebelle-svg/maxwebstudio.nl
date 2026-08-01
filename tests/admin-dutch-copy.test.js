const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dashboard = fs.readFileSync(path.resolve(__dirname, "../public/admin-dashboard.html"), "utf8");
const commandPalette = fs.readFileSync(path.resolve(__dirname, "../public/admin/ui/global-command-palette.js"), "utf8");
const platformHealth = fs.readFileSync(path.resolve(__dirname, "../functions/platform-health.js"), "utf8");
const styles = fs.readFileSync(path.resolve(__dirname, "../public/styles.css"), "utf8");

test("CEO-dashboard gebruikt Nederlandse begroeting en consistente CEO-MODUS", () => {
  for (const text of ["CEO-MODUS", "Goedemorgen", "Goedemiddag", "Goedenavond", "Prioriteiten van vandaag", "Platformgezondheid"]) assert.match(dashboard, new RegExp(text));
  assert.doesNotMatch(dashboard, /CEO Mode|Good morning|Good afternoon|Good evening|Today's priorities/);
  assert.doesNotMatch(dashboard, /greeting\.textContent = `\$\{greeting\}, Max`/);
  assert.match(dashboard, /state\.adminSession\?\.name/);
  assert.match(dashboard, /name: profile\.name \|\| email/);
  assert.doesNotMatch(platformHealth, /CEO Mode/);
});

test("kerncopy van Max Command is Nederlands", () => {
  for (const text of ["CEO-overzicht tonen", "Meldingen openen", "Snelle acties", "Aanbevolen", "Klant aanmaken"]) assert.match(commandPalette, new RegExp(text));
  for (const text of ["Show CEO summary", "AI suggestions", "Quick Actions", "Create customer"]) assert.doesNotMatch(commandPalette, new RegExp(text));
});

test("CEO-dashboard bevat responsieve regels voor laptop- en kleinere breedtes", () => {
  assert.match(styles, /@media\s*\(max-width:\s*1480px\)\s*and\s*\(min-width:\s*1181px\)[\s\S]{0,500}\.ceo-hero/);
  assert.match(styles, /\.ceo-hero \.admin-hero-copy h1\s*\{[\s\S]{0,150}font-size:\s*clamp\(40px,\s*3\.1vw,\s*56px\)/);
  assert.match(styles, /@media\s*\(max-width:\s*1200px\)[\s\S]{0,500}\.ceo-scoreboard-grid/);
  assert.match(styles, /@media\s*\(max-width:\s*980px\)[\s\S]{0,500}\.ceo-command-grid/);
  assert.match(styles, /@media\s*\(max-width:\s*640px\)[\s\S]{0,700}\.ceo-hero-meta/);
});
