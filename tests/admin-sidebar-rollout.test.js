const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "public", file), "utf8");
const SHARED_PAGES = ["admin-sales.html"];
const LEGACY_PAGES = ["admin-seo-studio.html", "admin-social-media-studio.html", "admin-domain-center.html"];

test("approved rollout pages use one central sidebar and no legacy navigation", () => {
  for (const page of SHARED_PAGES) {
    const html = read(page);
    assert.match(html, /id="admin-sidebar-root"/);
    assert.match(html, /data-shared-admin-sidebar="true"/);
    assert.match(html, /admin\/config\/sidebar-navigation\.js/);
    assert.match(html, /admin\/components\/admin-sidebar\.js/);
    assert.match(html, /admin\/ui\/admin-sidebar-dashboard-pilot\.js/);
    assert.doesNotMatch(html, /<aside class="admin-sidebar"/);
    assert.equal((html.match(/id="admin-sidebar-root"/g) || []).length, 1);
  }
});

test("unmigrated pages retain their legacy sidebar", () => {
  for (const page of LEGACY_PAGES) {
    const html = read(page);
    assert.match(html, /<aside class="admin-sidebar"/);
    assert.doesNotMatch(html, /id="admin-sidebar-root"/);
  }
});

test("migrated pages retain their page business contracts", () => {
  const sales = read("admin-sales.html");
  for (const marker of ["id=\"leadfinder-focus-search\"", "id=\"lead-customer-modal\"", "id=\"sales-owner-view\"", "admin-route-guard.js", "global-command-palette.js"]) assert.match(sales, new RegExp(marker));
});

test("inline scripts on migrated pages pass syntax checks", () => {
  for (const page of SHARED_PAGES) {
    const html = read(page);
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].filter((match) => !/\bsrc\s*=/.test(match[1]));
    scripts.forEach((match, index) => {
      const args = ["--check"];
      if (/type=["']module["']/.test(match[1])) args.push("--input-type=module");
      const result = spawnSync(process.execPath, args, { input: match[2], encoding: "utf8" });
      assert.equal(result.status, 0, `${page} inline script ${index + 1}: ${result.stderr}`);
    });
  }
});
