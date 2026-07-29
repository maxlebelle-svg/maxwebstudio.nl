const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/admin-food.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/admin/food/dashboard.css"), "utf8");
const source = fs.readFileSync(path.join(root, "public/admin/food/dashboard.js"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "public/admin/food/dashboard-bootstrap.js"), "utf8");
const demoServer = fs.readFileSync(path.join(root, "scripts/food-v1-phase-3-demo-server.mjs"), "utf8");

test("integrations route is part of the generic Food dashboard", () => {
  assert.match(html, /href="\/admin\/food\/integrations" data-route="integrations"/);
  assert.match(source, /\/admin\/food\/integrations/);
  assert.match(source, /integrations: \["Food \/ Integraties", "Integraties"\]/);
  assert.match(demoServer, /\\\/integrations/);
  assert.doesNotMatch(`${html}\n${source}\n${css}`, /Silverado/i);
});

test("all six approved integration cards are present", () => {
  for (const provider of ["mollie", "google-business", "google-ads", "meta", "whatsapp", "thuisbezorgd"]) {
    assert.match(html, new RegExp(`data-integration="${provider}"`));
  }
  assert.equal((html.match(/class="food-integration-card"/g) || []).length, 6);
});

test("integration statuses are explicitly unconnected, planned, research or onboarding", () => {
  const states = [...html.matchAll(/data-integration-state="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(states.length, 6);
  assert(states.every((state) => ["disconnected", "planned", "research", "onboarding"].includes(state)));
  assert.doesNotMatch(html, /data-integration-state="connected"/);
  assert.match(html, /0 van 6 verbonden/);
});

test("Mollie remains outside the critical order flow", () => {
  assert.match(html, /Testbetaling en betaalstatus worden pas geactiveerd nadat een afzonderlijke sandboxcontrole is geslaagd/);
  assert.doesNotMatch(`${source}\n${bootstrap}`, /mollie|payment|checkout\.mollie/i);
});

test("provider cards contain no secrets, OAuth actions or fabricated metrics", () => {
  assert.doesNotMatch(`${html}\n${source}`, /client_secret|access_token|api[_-]?key|oauth|refresh_token/i);
  assert.doesNotMatch(html, /conversies|campagneomzet|bereik:\s*\d|clicks:\s*\d/i);
});

test("integrations layout has tablet and mobile fallbacks", () => {
  assert.match(css, /food-integration-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /max-width:1180px[\s\S]*food-integration-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /max-width:540px[\s\S]*food-integration-grid\{grid-template-columns:1fr\}/);
});
