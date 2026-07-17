const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const navigation = require("../public/admin/config/sidebar-navigation.js");
const { NORMAL_ADMIN_PAGES, PUBLIC_ADMIN_PAGES, STANDALONE_ADMIN_PAGES } = require("./helpers/admin-page-inventory.js");

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
    assert(Array.isArray(item.relationshipTypes));
    item.relationshipTypes.forEach((type) => assert(["lead", "customer"].includes(type)));
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
  assert.match(source, /brandLogo\.src = "\/max-webstudio-logo-mark\.svg"/);
  assert.match(source, /brandLogo\.alt = ""/);
  assert.match(source, /"mws-sidebar-brand-copy"/);
  assert.match(source, /"Max Webstudio"/);
  assert.match(source, /brand\.classList\.add\("is-fallback"\)/);
  assert.match(source, /aria-current/);
  assert.match(source, /aria-disabled/);
  assert.match(source, /ActiveRelationship\?\.buildRelationshipUrl/);
  assert.match(source, /Deze functie wordt beschikbaar nadat de lead klant is geworden/);
});

test("customer-only production routes are explicit and relationship routes never invent employee context", () => {
  const items = navigation.ADMIN_SIDEBAR_NAVIGATION.flatMap((section) => section.items);
  assert.deepEqual(items.find((item) => item.id === "customer-onboarding").relationshipTypes, ["customer"]);
  for (const id of ["website-factory", "demo-sites", "ai-content-library", "asset-manager", "seo-studio", "social-media-studio", "brand-center", "domain-center"]) assert.deepEqual(items.find((item) => item.id === id).relationshipTypes, ["lead", "customer"]);
  for (const id of ["website-qa", "roadmap", "websites", "projects"]) assert.deepEqual(items.find((item) => item.id === id).relationshipTypes, []);
  assert.equal(items.some((item) => item.relationshipTypes.includes("employee")), false);
});

test("shared sidebar styles cover every normal admin page and exclude explicit exceptions", () => {
  const css = read("public/admin/styles/admin-sidebar-system.css");
  assert.match(css, /\.mws-admin-sidebar-v2/);
  assert.match(css, /\.mws-sidebar-brand-copy strong \{ color: #fff; font-size: 18px;/);
  for (const tone of ["success", "info", "purple", "warning", "danger"]) assert.match(css, new RegExp(`is-${tone}`));
  assert.match(css, /\.admin-body \.admin-crm-shell \{ grid-template-columns: 288px minmax\(0, 1fr\); \}/);
  assert.match(css, /data-shared-admin-sidebar="true"\] \.admin-page-search \{ flex: 0 0 auto; \}/);
  assert.match(css, /@media \(max-width: 820px\) \{ \.admin-body \.admin-crm-shell \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /prefers-reduced-motion/);
  Object.keys(NORMAL_ADMIN_PAGES).forEach((file) => {
    const html = read(`public/${file}`);
    assert.match(html, /admin-sidebar-system\.css/);
    assert.match(html, /admin\/components\/admin-sidebar\.js/);
    assert.match(html, /admin\/config\/sidebar-navigation\.js/);
  });
  [...STANDALONE_ADMIN_PAGES, ...PUBLIC_ADMIN_PAGES].forEach((file) => {
    const html = read(`public/${file}`);
    assert.doesNotMatch(html, /admin-sidebar-system\.css|admin\/components\/admin-sidebar\.js|admin\/config\/sidebar-navigation\.js/, `${file} is an explicit sidebar exception`);
  });
});
