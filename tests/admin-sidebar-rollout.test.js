const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, "public", file), "utf8");
const { ACTIVE_ROUTE_IDS, NORMAL_ADMIN_PAGES, PUBLIC_ADMIN_PAGES, STANDALONE_ADMIN_PAGES } = require("./helpers/admin-page-inventory.js");
const SHARED_PAGES = Object.keys(NORMAL_ADMIN_PAGES);

test("every normal admin page uses one central sidebar and no legacy navigation", () => {
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

test("every admin page has exactly one intentional classification", () => {
  const actual = fs.readdirSync(path.join(root, "public")).filter((file) => /^admin-.*\.html$/.test(file)).sort();
  const classified = [...SHARED_PAGES, ...STANDALONE_ADMIN_PAGES, ...PUBLIC_ADMIN_PAGES].sort();
  assert.deepEqual(classified, actual);
  assert.equal(new Set(classified).size, classified.length);
  for (const page of STANDALONE_ADMIN_PAGES) {
    const html = read(page);
    assert.match(html, /data-admin-sidebar-exception="standalone"/);
    assert.doesNotMatch(html, /id="admin-sidebar-root"/);
    assert.doesNotMatch(html, /<aside class="admin-sidebar"/);
  }
});

test("migrated pages retain their page-specific business contracts", () => {
  for (const [page, markers] of Object.entries(NORMAL_ADMIN_PAGES)) {
    const html = read(page);
    markers.forEach((marker) => assert.match(html, new RegExp(`id=["']${marker}["']`), `${page} lost #${marker}`));
    assert.match(html, /admin-route-guard\.js/, `${page} lost its route guard`);
  }
});

test("every normal page has an active route in the central configuration", () => {
  assert.deepEqual(Object.keys(ACTIVE_ROUTE_IDS).sort(), SHARED_PAGES.slice().sort());
  const routes = require("../public/admin/config/sidebar-navigation.js").ADMIN_SIDEBAR_NAVIGATION.flatMap((section) => section.items);
  for (const [page, activeId] of Object.entries(ACTIVE_ROUTE_IDS)) {
    assert(routes.some((item) => item.id === activeId && item.route.split("#")[0] === page), `${page} lacks central route ${activeId}`);
  }
});

test("relationship banner cannot render alongside the shared or standalone layouts", () => {
  SHARED_PAGES.forEach((page) => assert.match(read(page), /data-shared-admin-sidebar="true"/));
  STANDALONE_ADMIN_PAGES.forEach((page) => assert.match(read(page), /data-admin-sidebar-exception="standalone"/));
  const relationshipSource = fs.readFileSync(path.join(root, "public/admin/ui/active-relationship.js"), "utf8");
  assert.match(relationshipSource, /dataset\.sharedAdminSidebar === "true"/);
  assert.match(relationshipSource, /dataset\.adminSidebarException === "standalone"/);
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
