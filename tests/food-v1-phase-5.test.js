const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "scripts/food-v1-phase-5-readiness.zsh"), "utf8");
const guide = fs.readFileSync(path.join(root, "docs/FOOD_V1_PHASE_5_DEMO_READINESS.md"), "utf8");

test("readiness check refuses known remote database contexts", () => {
  for (const key of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_REF", "SUPABASE_DB_URL", "DATABASE_URL"]) assert.match(script, new RegExp(key));
  assert.match(script, /remote environment variable forbidden/);
});

test("readiness check covers every local Food phase and relevant access guards", () => {
  for (const file of ["food-v1-phase-1a.test.js", "food-v1-phase-1b.test.js", "food-v1-phase-2.test.js", "food-v1-phase-3.test.js", "food-v1-phase-4.test.js", "food-v1-phase-5.test.js", "admin-auth-guard.test.js", "admin-sidebar-rollout.test.js", "access-governance.test.js"]) assert.match(script, new RegExp(file.replaceAll(".", "\\.")));
  assert.match(script, /food-v1-phase-2-local-validation\.zsh/);
});

test("readiness check performs no deploy, push, provider or remote network action", () => {
  assert.doesNotMatch(script, /git\s+push|netlify\s+deploy|supabase\s+(?:db\s+push|migration\s+up|link)|curl|wget|mollie|api\.google|graph\.facebook/i);
  assert.match(script, /production_contact=false/);
  assert.match(script, /providers_contacted=false/);
});

test("rehearsal guide contains the exact critical Thursday flow", () => {
  for (const step of ["Open de storefront", "Voeg twee gerechten toe", "Plaats de afhaalbestelling", "Accepteer", "in bereiding", "gereed", "Wijzig de prijs", "Vernieuw de storefront", "historische orderprijs", "Integraties", "Demo herstellen"]) assert.match(guide, new RegExp(step, "i"));
});

test("rehearsal guide keeps unproven functionality outside the promise", () => {
  assert.match(guide, /Alleen afhalen/);
  assert.match(guide, /Geen echte betaling/);
  assert.match(guide, /0 van 6 verbonden/);
  assert.match(guide, /geen deployment/i);
});

test("readiness result has one stable local PASS marker", () => {
  assert.equal((script.match(/PASS_FOOD_V1_PHASE_5_DEMO_READY_LOCAL/g) || []).length, 1);
});
