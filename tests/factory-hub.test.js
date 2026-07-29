const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { publicFactoryBlueprints, getFactoryBlueprint } = require("../functions/_factory-blueprints");
const { _private } = require("../functions/admin-factory-projects");

test("Factory Hub exposes versioned Website, Webshop and Food recipes", () => {
  const blueprints = publicFactoryBlueprints();
  assert.deepEqual(blueprints.map((item) => item.factoryType), ["website", "webshop", "food"]);
  assert.equal(new Set(blueprints.map((item) => item.key)).size, 3);
  blueprints.forEach((item) => {
    assert.equal(item.version, 1);
    assert(item.modules.length >= 5);
    assert(item.stages.length >= 5);
  });
  assert.match(getFactoryBlueprint("food-pickup-v1").reference, /Silverado Roti Shop/);
});

test("Factory Hub validates relationship scope and bounded configuration", () => {
  const id = "d9428888-122b-4f2c-9291-31bdf2f21f25";
  assert.deepEqual(_private.relationshipFrom({ relationshipType: "customer", relationshipId: id }, true), { type: "customer", id });
  assert.throws(() => _private.relationshipFrom({ relationshipType: "employee", relationshipId: id }, true), /geldige lead of klant/);
  assert.throws(() => _private.relationshipFrom({}, true), /geldige lead of klant/);
  assert.deepEqual(_private.normalizeConfiguration({ industry: "Restaurant" }), { industry: "Restaurant" });
  assert.throws(() => _private.normalizeConfiguration([]), /configuratie is ongeldig/);
});

test("Factory Hub UI is relationship-bound and never promises automatic publication", () => {
  const html = read("public/admin-factories.html");
  const ui = read("public/admin/ui/factory-hub.js");
  const migration = read("supabase/migrations/20260729120000_factory_hub_projects.sql");
  assert.match(html, /Website-, Webshop- en Food-dossiers/);
  assert.match(html, /publiceert nooit automatisch/);
  assert.match(ui, /relationshipType/);
  assert.match(ui, /factoryProjectId/);
  assert.match(ui, /openFoodDemo/);
  assert.match(ui, /QR-code naar de mobiele Food-demo/);
  assert.equal(getFactoryBlueprint("food-pickup-v1").launchPath, "admin-demo-sites.html");
  assert.match(migration, /factory_type in \('website','webshop','food'\)/);
  assert.match(migration, /revoke all on table public\.factory_projects from anon, authenticated/);
  assert.match(migration, /grant all on table public\.factory_projects to service_role/);
});
