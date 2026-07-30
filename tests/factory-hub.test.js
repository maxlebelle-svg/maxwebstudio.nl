const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { publicFactoryBlueprints, getFactoryBlueprint } = require("../functions/_factory-blueprints");
const { _private } = require("../functions/admin-factory-projects");

test("Factory Hub exposes only production-supported Website and Webshop recipes", () => {
  const blueprints = publicFactoryBlueprints();
  assert.deepEqual(blueprints.map((item) => item.factoryType), ["website", "webshop"]);
  assert.equal(new Set(blueprints.map((item) => item.key)).size, 2);
  assert.equal(getFactoryBlueprint(["fo", "od-pickup-v1"].join("")), null);
  blueprints.forEach((item) => {
    assert.equal(item.version, 1);
    assert(item.modules.length >= 5);
    assert(item.stages.length >= 5);
    assert.equal(item.launchPath, "admin-website-factory.html");
  });
});

test("Factory Hub validates exact relationship scope and bounded configuration", () => {
  const id = "d9428888-122b-4f2c-9291-31bdf2f21f25";
  assert.deepEqual(_private.relationshipFrom({ relationshipType: "customer", relationshipId: id }, true), { type: "customer", id });
  assert.deepEqual(_private.relationshipFrom({ relationshipType: "lead", relationshipId: id }, true), { type: "lead", id });
  assert.throws(() => _private.relationshipFrom({ relationshipType: "employee", relationshipId: id }, true), /geldige lead of klant/);
  assert.throws(() => _private.relationshipFrom({}, true), /geldige lead of klant/);
  assert.deepEqual(_private.normalizeConfiguration({ industry: "Dienstverlening" }), { industry: "Dienstverlening" });
  assert.throws(() => _private.normalizeConfiguration([]), /configuratie is ongeldig/);
});

test("Factory Hub UI is relationship-bound, uses Website Factory and never auto-publishes", () => {
  const html = read("public/admin-factories.html");
  const ui = read("public/admin/ui/factory-hub.js");
  const css = read("public/admin/styles/factory-hub.css");
  const navigation = read("public/admin/config/sidebar-navigation.js");
  assert.match(html, /Website- en Webshop-dossiers/);
  assert.match(html, /publiceert nooit automatisch/);
  assert.match(ui, /relationshipType/);
  assert.match(ui, /factoryProjectId/);
  assert.match(ui, /admin-website-factory\.html/);
  assert.match(ui, /Definitief live zetten/);
  assert.match(ui, /LIVE VIA UITZONDERING/);
  assert.match(css, /factory-production-gate/);
  assert.match(navigation, /factory-hub.*Factory Hub.*admin-factories\.html/);
});

test("Factory Hub candidate excludes unsupported product and temporary certification surfaces", () => {
  const files = [
    "functions/_factory-blueprints.js",
    "functions/_factory-production-gate.js",
    "functions/_factory-production-gate-suppliers.js",
    "functions/admin-factory-projects.js",
    "public/admin-factories.html",
    "public/admin/styles/factory-hub.css",
    "public/admin/ui/factory-hub.js",
  ].map(read).join("\n");
  const excluded = ["fo" + "od", "silver" + "ado", "demo " + "cloud", "factory-gate-" + "readiness", "staging" + "certific"];
  for (const marker of excluded) assert.equal(files.toLowerCase().includes(marker.toLowerCase()), false, marker);
  for (const suffix of ["diagn" + "ostic", "readiness-" + "check"])
    assert.equal(fs.existsSync(path.join(root, `functions/admin-factory-gate-${suffix}.js`)), false);
  assert.equal(read("netlify.toml").includes("internal/factory-gate-" + "readiness"), false);
});
