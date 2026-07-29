const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase/demo/food-v1-silverado-demo-content.sql"), "utf8");
const presentation = JSON.parse(fs.readFileSync(path.join(root, "public/food/tenant-presentations/silverado-roti-shop-emmeloord.json"), "utf8"));
const evidenceRoot = path.join(root, "docs/release-readiness/food-v1-silverado-demo-content");
const manifest = JSON.parse(fs.readFileSync(path.join(evidenceRoot, "MANIFEST.json"), "utf8"));
const fileset = JSON.parse(fs.readFileSync(path.join(evidenceRoot, "FILESET.json"), "utf8"));

const expectedProducts = [
  ["Roti kip filet met groenten en ei", 1000],
  ["Roti drumsticks", 900],
  ["Roti rol", 800],
  ["Nasi kippenbout", 900],
  ["Nasi moksi (mix)", 1000],
  ["Bami kippen bout", 900],
  ["Bami moksi (mix)", 1000],
  ["Loempia's 5 stuks", 750],
];

test("Silverado demo content matches the eight products and prices published on the current website", () => {
  for (const [name, price] of expectedProducts) {
    assert.match(sql, new RegExp(name.replace(/[()']/g, (value) => value === "'" ? "''" : `\\${value}`)));
    assert.match(sql, new RegExp(`${price}, \\d+, '/assets/food/silverado/`));
  }
  assert.match(sql, /active_count <> 8/);
});

test("content update is tenant-bounded, transactional and refuses non-empty order data", () => {
  assert.match(sql, /^--[\s\S]*begin;/);
  assert.match(sql, /commit;\s*$/);
  assert.match(sql, /account\.metadata @> '\{"synthetic_demo":true\}'::jsonb/);
  assert.match(sql, /if exists \([\s\S]*from public\.food_orders/);
  assert.match(sql, /d4000000-0000-4000-8000-000000000001/g);
  assert.doesNotMatch(sql, /auth\.users|netlify|yxxahurphdbblkuxoeje|xlxpuuycigeqhgxqtzni/i);
});

test("content update keeps the reset baseline aligned and retires only two synthetic products", () => {
  assert.match(sql, /food_demo_menu_item_baselines/);
  assert.match(sql, /da000000-0000-4000-8000-000000000004/);
  assert.match(sql, /da000000-0000-4000-8000-000000000010/);
  assert.match(sql, /set active = false, available = false/);
});

test("every active product resolves to one of the six supplied presentation photos", () => {
  for (const [name] of expectedProducts) {
    const image = presentation.menu_images[name.toLowerCase()];
    assert.match(image, /^\/assets\/food\/silverado\/[a-z0-9-]+\.jpg$/);
    assert.equal(fs.existsSync(path.join(root, "public", image)), true);
  }
  assert.equal(new Set(presentation.gallery.map((item) => item.src)).size, 6);
});

test("published execution evidence checksums one non-authorizing content file for the demo project only", () => {
  assert.equal(manifest.targetProjectRef, "obprooubcbnfgouytvrw");
  assert.equal(manifest.productionAllowed, false);
  assert.equal(manifest.stagingAllowed, false);
  assert.equal(manifest.schemaChangesAllowed, false);
  assert.equal(manifest.remoteExecutionAuthorizedByThisManifest, false);
  assert.deepEqual(manifest.executionOrder, fileset.files.map((entry) => entry.path));
  for (const entry of fileset.files) {
    const file = path.join(root, entry.path);
    assert.equal(fs.statSync(file).size, entry.bytes);
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), entry.sha256);
  }
});
