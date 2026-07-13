const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const navigation = require("../public/admin/config/sidebar-navigation.js");

test("central sidebar configuration describes every required section and production route", () => {
  const sections = navigation.ADMIN_SIDEBAR_NAVIGATION;
  assert.deepEqual(sections.map((section) => section.id), ["sales", "active-workspace", "production", "commerce", "relationship-communication", "management"]);
  const items = sections.flatMap((section) => section.items);
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["leads", "website-factory", "demo-sites", "ai-content-library", "asset-manager", "seo-studio", "social-media-studio", "brand-center", "domain-center", "customer-onboarding", "roadmap"]) assert(ids.includes(id), `missing ${id}`);
  items.forEach((item) => {
    assert.match(item.route, /^admin-[a-z0-9-]+\.html(?:#.*)?$/);
    assert.equal(typeof item.workspaceRequired, "boolean");
    assert.equal(typeof item.icon, "string");
    assert.equal(typeof item.permission.resource, "string");
    assert.equal(typeof item.permission.action, "string");
    assert(Array.isArray(item.permission.roles));
  });
});

test("sidebar module exports the full phase one component contract without auto mounting", () => {
  const source = read("public/admin/components/admin-sidebar.js");
  for (const name of ["AdminSidebar", "SidebarSection", "SidebarItem", "WorkspaceCard", "WorkspaceSelector", "MetricBadge", "StatusBadge", "Avatar", "UserProfileMenu", "EmptyWorkspaceState", "LoadingSkeleton"]) assert.match(source, new RegExp(`\\b${name}\\b`));
  assert.doesNotMatch(source, /DOMContentLoaded|querySelector\(|appendChild\(AdminSidebar|\.replaceChildren\(AdminSidebar/);
  assert.match(source, /image\.addEventListener\("error"/);
  assert.match(source, /aria-current/);
  assert.match(source, /aria-disabled/);
});

test("new sidebar styles stay isolated and only the dashboard loads the pilot assets", () => {
  const css = read("public/admin/styles/admin-sidebar-system.css");
  assert.match(css, /\.mws-admin-sidebar-v2/);
  for (const tone of ["success", "info", "purple", "warning", "danger"]) assert.match(css, new RegExp(`is-${tone}`));
  assert.match(css, /prefers-reduced-motion/);
  const adminPages = fs.readdirSync(path.join(root, "public")).filter((file) => /^admin-.*\.html$/.test(file));
  adminPages.forEach((file) => {
    const html = read(`public/${file}`);
    if (file === "admin-dashboard.html") {
      assert.match(html, /admin-sidebar-system\.css/);
      assert.match(html, /admin\/components\/admin-sidebar\.js/);
      assert.match(html, /admin\/config\/sidebar-navigation\.js/);
      return;
    }
    assert.doesNotMatch(html, /admin-sidebar-system\.css|admin\/components\/admin-sidebar\.js|admin\/config\/sidebar-navigation\.js/, `${file} should keep the legacy sidebar`);
  });
});
