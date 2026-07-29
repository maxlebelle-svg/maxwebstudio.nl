const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const api = fs.readFileSync(path.join(root, "functions/_food-api.js"), "utf8");
const storefront = fs.readFileSync(path.join(root, "public/food/storefront.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "public/admin/food/dashboard.js"), "utf8");
const guide = fs.readFileSync(path.join(root, "docs/FOOD_V1_SILVERADO_LIVE_DEMO.md"), "utf8");
const qr = fs.readFileSync(path.join(root, "public/assets/food/silverado/silverado-demo-qr.svg"), "utf8");

test("demo ordering override stays food_demo-only and Silverado-allowlisted", () => {
  assert.match(api, /APP_ENVIRONMENT !== "food_demo"/);
  assert.match(api, /FOOD_DEMO_ORDERING_OVERRIDE_ENABLED !== "true"/);
  assert.match(api, /demoResetAllowlist\(\)/);
  assert.match(api, /opening\.status === "closed" && !demoOrderingOverrideAllowed/);
});

test("storefront and dashboard label the flow as demo without changing real hours", () => {
  assert.match(storefront, /Demo bestellen actief/);
  assert.match(dashboard, /Demo\/test/);
  assert.match(dashboard, /demo_mode/);
});

test("QR and runbook expose only the public storefront route", () => {
  assert.match(qr, /<svg\b/);
  assert.doesNotMatch(qr, /password|secret|token|d4000000|obprooubcbnfgouytvrw/i);
  assert.match(guide, /max-webstudio-food-demo\.netlify\.app\/food\/silverado-roti-shop-emmeloord/);
  assert.match(guide, /HERSTEL silverado-roti-shop-emmeloord/);
  assert.match(guide, /Geen echte betaling of providercall/);
  assert.doesNotMatch(guide, /SUPABASE_SERVICE_ROLE_KEY|FOOD_RATE_LIMIT_SECRET/);
});
