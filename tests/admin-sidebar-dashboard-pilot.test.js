const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const navigation = require("../public/admin/config/sidebar-navigation.js");
const pilot = require("../public/admin/ui/admin-sidebar-dashboard-pilot.js");

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  values() { return new Set(String(this.owner.className || "").split(/\s+/).filter(Boolean)); }
  add(...names) { const values = this.values(); names.forEach((name) => values.add(name)); this.owner.className = [...values].join(" "); }
  contains(name) { return this.values().has(name); }
}

class FakeElement {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {}; this.className = ""; this.textContent = ""; this.hidden = false; this.classList = new FakeClassList(this); this.listeners = {}; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  replaceWith(node) { this.replacement = node; }
}

function withFakeDocument(callback) {
  const previous = global.document;
  global.document = { createElement: (tag) => new FakeElement(tag), createElementNS: (_ns, tag) => new FakeElement(tag) };
  try { return callback(); } finally { global.document = previous; }
}

function treeText(node) { return [node.textContent, ...node.children.flatMap((child) => treeText(child))].filter(Boolean).join(" "); }
function find(node, predicate) { if (predicate(node)) return node; for (const child of node.children) { const match = find(child, predicate); if (match) return match; } return null; }

test("dashboard is the only page that mounts the shared pilot and has no legacy duplicate", () => {
  const dashboard = read("public/admin-dashboard.html");
  for (const asset of ["admin-sidebar-system.css", "admin/config/sidebar-navigation.js", "admin/components/admin-sidebar.js", "admin/ui/admin-sidebar-dashboard-pilot.js"]) assert.match(dashboard, new RegExp(asset.replaceAll("/", "\\/")));
  assert.match(dashboard, /id="admin-sidebar-root"/);
  assert.doesNotMatch(dashboard, /<aside class="admin-sidebar"/);
  assert.doesNotMatch(dashboard, /adminSidebarNavItems|renderAdminSidebarNavigation/);
  for (const page of ["admin-sales.html", "admin-mail-center.html"]) {
    const html = read(`public/${page}`);
    assert.match(html, /<aside class="admin-sidebar"/);
    assert.doesNotMatch(html, /admin-sidebar-dashboard-pilot|admin-sidebar-system\.css/);
  }
});

test("every central navigation route resolves to an existing admin page", () => {
  const items = navigation.ADMIN_SIDEBAR_NAVIGATION.flatMap((section) => section.items);
  items.forEach((item) => {
    const file = item.route.split("#")[0];
    assert.equal(fs.existsSync(path.join(root, "public", file)), true, `${item.id} points to missing ${file}`);
  });
});

test("pilot hierarchy removes secondary links without duplicating navigation data", () => {
  const sections = pilot.pilotNavigation(navigation.ADMIN_SIDEBAR_NAVIGATION);
  assert.deepEqual(sections[0].items.map((item) => item.label), ["Leads"]);
  assert.deepEqual(sections[2].items.map((item) => item.label), ["Website Factory", "Demo Sites", "AI Content Library", "Asset Manager", "SEO Studio", "Social Media Studio", "Brand Center", "Domein Center", "Klant Onboarding", "Roadmap / Takenbord"]);
});

test("workspace card supports empty and filled read-only relationship states", () => withFakeDocument(() => {
  delete require.cache[require.resolve("../public/admin/components/admin-sidebar.js")];
  const components = require("../public/admin/components/admin-sidebar.js");
  const empty = components.WorkspaceCard();
  assert.match(treeText(empty), /Geen relatie geselecteerd/);
  assert.match(treeText(empty), /Selecteer lead of klant/);
  const filled = components.WorkspaceCard({ relationship: { companyName: "Acme B.V.", entityType: "lead", lifecycleStage: "Gekwalificeerd", assignedUserName: "Sam", statusTone: "info" } });
  assert.match(treeText(filled), /Acme B\.V\./);
  assert.match(treeText(filled), /Lead/);
  assert.match(treeText(filled), /Gekwalificeerd/);
}));

test("dashboard is active, workspace links remain clickable, and avatar initials fall back", () => withFakeDocument(() => {
  delete require.cache[require.resolve("../public/admin/components/admin-sidebar.js")];
  const components = require("../public/admin/components/admin-sidebar.js");
  const sidebar = components.AdminSidebar({ navigation: pilot.pilotNavigation(navigation.ADMIN_SIDEBAR_NAVIGATION), activeId: "dashboard", user: { name: "Max Le Belle", roleLabel: "Admin" } });
  const dashboard = find(sidebar, (node) => node.dataset.sidebarItem === "dashboard");
  const factory = find(sidebar, (node) => node.dataset.sidebarItem === "website-factory");
  const avatar = find(sidebar, (node) => node.classList.contains("mws-sidebar-avatar"));
  assert.equal(dashboard.getAttribute("aria-current"), "page");
  assert.equal(factory.getAttribute("aria-disabled"), undefined);
  assert.equal(factory.classList.contains("is-workspace-muted"), true);
  assert.equal(avatar.textContent, "MB");
}));

test("malformed profile and workspace sources degrade without crashing", () => {
  assert.doesNotThrow(() => pilot.resolveUser(null, [null, "invalid"]));
  assert.equal(pilot.resolveUser(null, null).name, "Onbekende gebruiker");
  assert.equal(pilot.safeRelationship({ getActiveRelationship() { throw new Error("unavailable"); } }), null);
  assert.doesNotThrow(() => pilot.readJson({ getItem() { throw new Error("blocked"); } }, "key", []));
});

test("dashboard inline scripts and pilot JavaScript pass syntax checks", () => {
  const html = read("public/admin-dashboard.html");
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].filter((match) => !/\bsrc\s*=/.test(match[1]));
  scripts.forEach((match, index) => {
    const args = ["--check"];
    if (/type=["']module["']/.test(match[1])) args.push("--input-type=module");
    const result = spawnSync(process.execPath, args, { input: match[2], encoding: "utf8" });
    assert.equal(result.status, 0, `inline script ${index + 1}: ${result.stderr}`);
  });
  for (const file of ["public/admin/config/sidebar-navigation.js", "public/admin/components/admin-sidebar.js", "public/admin/ui/admin-sidebar-dashboard-pilot.js"]) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});
