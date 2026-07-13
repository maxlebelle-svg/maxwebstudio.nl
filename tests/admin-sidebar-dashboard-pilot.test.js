const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const navigation = require("../public/admin/config/sidebar-navigation.js");
const pilot = require("../public/admin/ui/admin-sidebar-dashboard-pilot.js");
const PROFILE = "22222222-2222-4222-8222-222222222222";

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  values() { return new Set(String(this.owner.className || "").split(/\s+/).filter(Boolean)); }
  add(...names) { const values = this.values(); names.forEach((name) => values.add(name)); this.owner.className = [...values].join(" "); }
  contains(name) { return this.values().has(name); }
}

class FakeElement {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {}; this.className = ""; this.textContent = ""; this.hidden = false; this.classList = new FakeClassList(this); this.listeners = {}; }
  append(...children) { children.forEach((child) => { if (child && typeof child === "object") child.parentNode = this; }); this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  replaceWith(node) { this.replacement = node; }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  focus() { global.document.activeElement = this; }
}

function withFakeDocument(callback) {
  const previous = global.document;
  global.document = { createElement: (tag) => new FakeElement(tag), createElementNS: (_ns, tag) => new FakeElement(tag) };
  try { return callback(); } finally { global.document = previous; }
}

function treeText(node) { return [node.textContent, ...node.children.flatMap((child) => treeText(child))].filter(Boolean).join(" "); }
function find(node, predicate) { if (predicate(node)) return node; for (const child of node.children) { const match = find(child, predicate); if (match) return match; } return null; }

test("approved pages mount one shared sidebar while pending pages keep the legacy sidebar", () => {
  for (const page of ["admin-dashboard.html", "admin-sales.html", "admin-website-factory.html", "admin-mail-center.html", "admin-brand-center.html"]) {
    const html = read(`public/${page}`);
    for (const asset of ["admin-sidebar-system.css", "admin/config/sidebar-navigation.js", "admin/components/admin-sidebar.js", "admin/ui/admin-sidebar-dashboard-pilot.js"]) assert.match(html, new RegExp(asset.replaceAll("/", "\\/")));
    assert.match(html, /id="admin-sidebar-root"/);
    assert.doesNotMatch(html, /<aside class="admin-sidebar"/);
  }
  for (const page of ["admin-assets.html", "admin-facturen.html"]) {
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

test("generic bootstrap resolves the active central route for every migrated page", () => {
  const sections = pilot.pilotNavigation(navigation.ADMIN_SIDEBAR_NAVIGATION);
  const expected = { "admin-dashboard.html": "dashboard", "admin-sales.html": "leads", "admin-website-factory.html": "website-factory", "admin-mail-center.html": "mail-center", "admin-brand-center.html": "brand-center", "admin-assets.html": "asset-manager", "admin-facturen.html": "invoices" };
  Object.entries(expected).forEach(([pathname, id]) => assert.equal(pilot.currentSidebarItemId(sections, { pathname: `/${pathname}`, hash: "" }), id));
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

test("workspace lifecycle colors use the central semantic status meaning", () => {
  assert.equal(pilot.semanticTone("Live"), "success");
  assert.equal(pilot.semanticTone("Preview klaar"), "info");
  assert.equal(pilot.semanticTone("In productie"), "purple");
  assert.equal(pilot.semanticTone("Wacht op klant"), "warning");
  assert.equal(pilot.semanticTone("Geblokkeerd"), "danger");
  assert.equal(pilot.semanticTone("Niet gestart"), "neutral");
  assert.equal(pilot.semanticTone("Inactief"), "neutral");
});

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
  assert.equal(avatar.textContent, "ML");
}));

test("profile menu keeps the real actor visible, shows perspective and supports keyboard close", () => withFakeDocument(() => {
  delete require.cache[require.resolve("../public/admin/components/admin-sidebar.js")];
  const components = require("../public/admin/components/admin-sidebar.js");
  const menu = components.UserProfileMenu({ user: { id: PROFILE, name: "Max Le Belle", roleLabel: "Super Admin" }, perspective: { name: "Lisanne Post" }, actions: [{ label: "Mijn profiel", disabled: true }, { label: "Instellingen", href: "admin-instellingen.html" }, { label: "Bekijk als medewerker" }, { label: "Uitloggen" }] });
  assert.match(treeText(menu), /Max Le Belle Super Admin Bekijkt als: Lisanne Post/);
  const trigger = find(menu, (node) => node.classList.contains("mws-user-profile-trigger"));
  const dropdown = find(menu, (node) => node.classList.contains("mws-user-profile-menu"));
  trigger.listeners.click(); assert.equal(dropdown.hidden, false);
  let prevented = false; dropdown.listeners.keydown({ key: "Escape", preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(dropdown.hidden, true); assert.equal(global.document.activeElement, trigger);
}));

test("view-as action is visible only for the server-confirmed super admin role", () => {
  assert(pilot.profileActionsFor({ role: "super_admin" }).some((action) => action.label === "Bekijk als medewerker"));
  assert.equal(pilot.profileActionsFor({ role: "admin" }).some((action) => action.label === "Bekijk als medewerker"), false);
  assert.equal(pilot.profileActionsFor({ role: "sales_partner" }).some((action) => action.label === "Bekijk als medewerker"), false);
});

test("avatar image errors fall back to deterministic ML initials", () => withFakeDocument(() => {
  delete require.cache[require.resolve("../public/admin/components/admin-sidebar.js")];
  const components = require("../public/admin/components/admin-sidebar.js");
  const avatar = components.Avatar({ name: "Max Le Belle", imageUrl: "https://cdn.example.test/missing.jpg", seed: PROFILE });
  avatar.listeners.error();
  assert.equal(avatar.replacement.textContent, "ML");
  assert.match(avatar.replacement.className, /is-tone-[0-5]/);
}));

test("malformed profile and workspace sources degrade without crashing", () => {
  assert.doesNotThrow(() => pilot.resolveUser(null, [null, "invalid"]));
  assert.equal(pilot.resolveUser(null, null).name, "Onbekende gebruiker");
  assert.equal(pilot.safeRelationship({ getActiveRelationship() { throw new Error("unavailable"); } }), null);
  assert.doesNotThrow(() => pilot.readJson({ getItem() { throw new Error("blocked"); } }, "key", []));
});

test("relationship search input is debounced and only runs the latest query", () => {
  const scheduled = new Map(); let nextId = 0; const calls = [];
  const timers = { setTimeout(callback) { nextId += 1; scheduled.set(nextId, callback); return nextId; }, clearTimeout(id) { scheduled.delete(id); } };
  const debounced = pilot.createDebouncer((value) => calls.push(value), 280, timers);
  debounced("a"); debounced("acme");
  assert.equal(scheduled.size, 1); assert.deepEqual(calls, []);
  [...scheduled.values()][0]();
  assert.deepEqual(calls, ["acme"]);
});

test("recent relationships use a bounded non-sensitive session cache", () => {
  const previous = global.sessionStorage; const values = new Map();
  global.sessionStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  try {
    pilot.rememberRelationship({ entityType: "lead", leadId: "11111111-1111-4111-8111-111111111111", companyName: "Acme", lifecycleStage: "qualified", email: "private@example.test", phone: "+31 6" });
    const stored = values.get("mwsAdminRelationshipRecents");
    assert.match(stored, /Acme/); assert.doesNotMatch(stored, /private@example|\+31/);
    assert.equal(JSON.parse(stored).length, 1);
  } finally { global.sessionStorage = previous; }
});

test("perspective storage is minimal and clearing removes it without touching the auth session", () => {
  const previous = { sessionStorage: global.sessionStorage, localStorage: global.localStorage, document: global.document };
  const values = new Map([["mwsAdminPerspectiveMode", "stored"]]);
  global.sessionStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  global.localStorage = { getItem: (key) => key === "mws_admin_supabase_session" ? JSON.stringify({ accessToken: "real-max-token" }) : null };
  global.document = { querySelector: () => null, getElementById: () => null };
  try {
    const minimal = pilot.minimalPerspective({ id: "55555555-5555-4555-8555-555555555555", authUserId: "66666666-6666-4666-8666-666666666666", name: "Lisanne", role: "sales_partner", status: "active", email: "private@example.test", phone: "0612345678", token: "secret" });
    assert.doesNotMatch(JSON.stringify(minimal), /private@example|0612345678|secret/);
    pilot.perspectiveState.current = minimal; pilot.clearPerspective({ silent: true });
    assert.equal(values.has("mwsAdminPerspectiveMode"), false);
    assert.equal(JSON.parse(global.localStorage.getItem("mws_admin_supabase_session")).accessToken, "real-max-token");
  } finally { Object.assign(global, previous); }
});

test("expired sessions clear perspective state", () => {
  const previous = { localStorage: global.localStorage, sessionStorage: global.sessionStorage, document: global.document };
  const values = new Map([["mwsAdminPerspectiveMode", JSON.stringify({ viewedProfileId: "55555555-5555-4555-8555-555555555555" })]]);
  global.localStorage = { getItem: (key) => key === "mws_admin_supabase_session" ? JSON.stringify({ accessToken: "token", expiresAt: Date.now() - 1000 }) : null };
  global.sessionStorage = { getItem: (key) => values.get(key) || null, removeItem: (key) => values.delete(key) };
  global.document = { querySelector: () => null, getElementById: () => null };
  try { pilot.perspectiveState.current = { viewedProfileId: "55555555-5555-4555-8555-555555555555" }; assert.equal(pilot.validateSessionState(), false); assert.equal(values.has("mwsAdminPerspectiveMode"), false); }
  finally { Object.assign(global, previous); }
});

test("perspective validation keeps the real bearer and ignores a delayed older selection", async () => {
  const previous = { localStorage: global.localStorage, fetch: global.fetch };
  const pending = []; const headers = [];
  global.localStorage = { getItem: (key) => key === "mws_admin_supabase_session" ? JSON.stringify({ accessToken: "real-max-token", expiresAt: Date.now() + 60000 }) : null };
  global.fetch = (url, options) => new Promise((resolve) => { headers.push(options.headers.Authorization); pending.push({ url: String(url), resolve }); });
  pilot.actorState.profile = { id: PROFILE, role: "super_admin", status: "active" };
  try {
    const first = pilot.validatePerspective("55555555-5555-4555-8555-555555555555");
    const second = pilot.validatePerspective("66666666-6666-4666-8666-666666666666");
    pending[1].resolve(jsonFetch({ success: true, employee: { id: "66666666-6666-4666-8666-666666666666", authUserId: "77777777-7777-4777-8777-777777777777", name: "Tweede", role: "developer", status: "active" } }));
    const latest = await second;
    pending[0].resolve(jsonFetch({ success: true, employee: { id: "55555555-5555-4555-8555-555555555555", authUserId: "88888888-8888-4888-8888-888888888888", name: "Eerste", role: "sales_partner", status: "active" } }));
    assert.equal((await first), null); assert.equal(latest.name, "Tweede"); assert.deepEqual(headers, ["Bearer real-max-token", "Bearer real-max-token"]);
  } finally { pilot.actorState.profile = null; Object.assign(global, previous); }
});

test("invalid restored perspective is removed after server validation", async () => {
  const previous = { localStorage: global.localStorage, sessionStorage: global.sessionStorage, fetch: global.fetch, document: global.document };
  const values = new Map([["mwsAdminPerspectiveMode", JSON.stringify({ viewedProfileId: "55555555-5555-4555-8555-555555555555" })]]);
  global.localStorage = { getItem: (key) => key === "mws_admin_supabase_session" ? JSON.stringify({ accessToken: "real-token", expiresAt: Date.now() + 60000 }) : null };
  global.sessionStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  global.fetch = async () => jsonFetch({ success: false, code: "EMPLOYEE_NOT_FOUND" }, 404);
  global.document = { querySelector: () => null, getElementById: () => null };
  pilot.actorState.profile = { id: PROFILE, role: "super_admin", status: "active" };
  try { assert.equal(await pilot.restorePerspective(), null); assert.equal(values.has("mwsAdminPerspectiveMode"), false); }
  finally { pilot.actorState.profile = null; Object.assign(global, previous); }
});

test("lead and customer selection, URL sync, clear and selector errors remain isolated", async () => {
  const previous = { document: global.document, location: global.location, history: global.history, localStorage: global.localStorage, ActiveRelationship: global.ActiveRelationship };
  const selected = []; let cleared = false; let replaced = "";
  global.document = { title: "Dashboard", activeElement: null, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };
  global.location = { href: "http://localhost/admin-dashboard.html", origin: "http://localhost" };
  global.history = { state: null, replaceState(_state, _title, value) { replaced = value; global.location.href = new URL(value, global.location.origin).href; } };
  global.localStorage = { getItem: () => null };
  global.ActiveRelationship = {
    async setActiveRelationship(input) { selected.push(input); return input.entityType === "lead" ? { entityType: "lead", leadId: input.leadId, companyName: "Lead" } : { entityType: "customer", customerId: input.customerId, companyName: "Klant" }; },
    clearActiveRelationship() { cleared = true; }, getActiveRelationship() { return null; },
  };
  try {
    await pilot.selectRelationship({ entityType: "lead", id: "11111111-1111-4111-8111-111111111111" });
    assert.match(replaced, /leadId=11111111/);
    await pilot.selectRelationship({ entityType: "customer", id: "22222222-2222-4222-8222-222222222222" });
    assert.match(replaced, /customerId=22222222/); assert.doesNotMatch(replaced, /leadId=/);
    pilot.clearWorkspace(); assert.equal(cleared, true); assert.doesNotMatch(replaced, /customerId=/);
    global.ActiveRelationship.setActiveRelationship = async () => { throw new Error("selector unavailable"); };
    await assert.doesNotReject(() => pilot.selectRelationship({ entityType: "lead", id: "11111111-1111-4111-8111-111111111111" }));
    assert.equal(selected.length, 2);
  } finally { Object.assign(global, previous); }
});

test("Escape closes the relationship selector without propagating", () => {
  const previous = global.document; let prevented = false;
  global.document = { querySelector: () => null };
  try { pilot.handleSelectorKeys({ key: "Escape", preventDefault() { prevented = true; } }); assert.equal(prevented, true); }
  finally { global.document = previous; }
});

test("live badge mapping uses semantic tones, real zeroes and explicit unavailable states", () => {
  const state = pilot.metricState;
  Object.assign(state, {
    general: { openLeads: 8 }, loadingGeneral: false, workspaceKey: "customer:44444444-4444-4444-8444-444444444444", loadingWorkspace: false,
    workspace: {
      metrics: { assets: 0, demoSites: 2, openTasks: 3, openQuotes: 1, openInvoices: 4, overdueInvoices: 1, subscriptions: 1, activeSubscriptions: 1, mailCount: 5, timelineEvents: null },
      statuses: { websiteFactory: { label: "Preview klaar", tone: "info" }, brandCenter: { label: "Logo klaar", tone: "purple" }, domainCenter: { label: "Actief", tone: "success" } },
      errors: [{ metric: "timelineEvents", code: "QUERY_FAILED" }],
    },
  });
  const badges = pilot.buildBadgeValues();
  assert.deepEqual(badges.openLeads.value, 8);
  assert.deepEqual(badges.assets.value, 0);
  assert.equal(badges.openInvoices.value, "1 achterstallig");
  assert.equal(badges.openInvoices.tone, "danger");
  assert.equal(badges.websiteFactory.tone, "info");
  assert.equal(badges.timelineEvents.value, "—");
});

test("workspace loading clears old badges and uses small non-blocking skeleton states", () => {
  const state = pilot.metricState;
  Object.assign(state, { general: { openLeads: 2 }, loadingGeneral: false, workspaceKey: "lead:33333333-3333-4333-8333-333333333333", workspace: null, loadingWorkspace: true });
  const badges = pilot.buildBadgeValues();
  assert.equal(badges.openLeads.value, 2);
  assert.equal(badges.assets.loading, true);
  assert.equal(badges.openInvoices.loading, true);
  assert.equal(badges.assets.value, undefined);
});

test("partial finance failures never imply no overdue invoice or inactive subscription", () => {
  Object.assign(pilot.metricState, {
    general: { openLeads: 2 }, loadingGeneral: false, workspaceKey: "customer:44444444-4444-4444-8444-444444444444", loadingWorkspace: false,
    workspace: { metrics: { openInvoices: 3, overdueInvoices: null, subscriptions: 1, activeSubscriptions: null }, statuses: {}, errors: [{ metric: "overdueInvoices" }, { metric: "activeSubscriptions" }] },
  });
  const badges = pilot.buildBadgeValues();
  assert.equal(badges.openInvoices.value, 3);
  assert.match(badges.openInvoices.label, /tijdelijk niet beschikbaar/);
  assert.equal(badges.subscriptionStatus.value, 1);
  assert.match(badges.subscriptionStatus.label, /tijdelijk niet beschikbaar/);
});

test("a delayed response from an old relationship cannot overwrite the new workspace", async () => {
  const previous = { document: global.document, localStorage: global.localStorage, fetch: global.fetch, ActiveRelationship: global.ActiveRelationship };
  const pending = [];
  global.document = { getElementById: () => null };
  global.localStorage = { getItem: (key) => key === "mws_admin_supabase_session" ? JSON.stringify({ accessToken: "token" }) : null };
  global.fetch = (url) => new Promise((resolve) => pending.push({ url: String(url), resolve }));
  try {
    const first = pilot.loadSidebarMetrics({ entityType: "lead", leadId: "33333333-3333-4333-8333-333333333333" }, { force: true });
    const second = pilot.loadSidebarMetrics({ entityType: "customer", customerId: "44444444-4444-4444-8444-444444444444" }, { force: true });
    pending[1].resolve(jsonFetch({ success: true, general: { openLeads: 4 }, workspace: { relationship: { entityType: "customer", customerId: "44444444-4444-4444-8444-444444444444" }, metrics: { assets: 9 }, statuses: {}, errors: [] } }));
    await second;
    pending[0].resolve(jsonFetch({ success: true, general: { openLeads: 99 }, workspace: { relationship: { entityType: "lead", leadId: "33333333-3333-4333-8333-333333333333" }, metrics: { assets: 99 }, statuses: {}, errors: [] } }));
    await first;
    assert.equal(pilot.metricState.workspaceKey, "customer:44444444-4444-4444-8444-444444444444");
    assert.equal(pilot.metricState.workspace.metrics.assets, 9);
    assert.equal(pilot.metricState.general.openLeads, 4);
  } finally { Object.assign(global, previous); }
});

test("clearing workspace removes relationship metrics while general metrics remain", () => {
  Object.assign(pilot.metricState, { general: { openLeads: 3 }, workspaceKey: "", workspace: null, loadingGeneral: false, loadingWorkspace: false });
  const badges = pilot.buildBadgeValues();
  assert.equal(badges.openLeads.value, 3);
  assert.equal(badges.assets, undefined);
  assert.equal(badges.openInvoices, undefined);
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

function jsonFetch(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
