const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("release candidate contains exactly three new migrations in order", () => {
  const expected = [
    "20260729120000_factory_hub_projects.sql",
    "20260729200000_factory_production_gate.sql",
    "20260730120000_harden_factory_gate_generation_and_audit.sql",
  ];
  for (const file of expected) assert.equal(fs.existsSync(path.join(root, "supabase/migrations", file)), true, file);
  assert.deepEqual(expected, [...expected].sort());
});

test("temporary certification surface is entirely absent", () => {
  for (const suffix of ["diagn" + "ostic", "readiness-" + "check"]) {
    const file = `functions/admin-factory-gate-${suffix}.js`;
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
  const releaseText = ["netlify.toml", "public/admin-factories.html", "public/admin/ui/factory-hub.js", "public/admin/styles/factory-hub.css"].map(read).join("\n");
  for (const marker of ["factory-gate-" + "readiness", "staging" + "certificering", "factory-" + "certification"])
    assert.equal(releaseText.toLowerCase().includes(marker.toLowerCase()), false, marker);
});

test("runtime and admin candidate have no excluded product dependency", () => {
  const files = [
    "functions/_factory-blueprints.js", "functions/_factory-production-gate.js", "functions/_factory-production-gate-suppliers.js", "functions/admin-factory-projects.js",
    "public/admin-factories.html", "public/admin/styles/factory-hub.css", "public/admin/ui/factory-hub.js",
  ];
  const excluded = ["fo" + "od", "silver" + "ado", "demo " + "cloud"];
  for (const file of files) for (const marker of excluded) assert.equal(read(file).toLowerCase().includes(marker), false, `${file}:${marker}`);
});
