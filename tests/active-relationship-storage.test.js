const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/admin/ui/active-relationship.js"), "utf8");
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";

test("legacy relationship storage migrates to the minimal privacy-safe shape", () => {
  const harness = createHarness({ relationship: { entityType: "lead", leadId: LEAD_ID, companyName: "Acme", lifecycleStage: "qualified", email: "private@example.test", phone: "+31 6 123", contactName: "Private Person", websiteUrl: "https://example.test", assignedUserName: "Sam" } });
  const candidate = harness.api.readStored();
  const stored = JSON.parse(harness.storage.getItem("maxwebstudioActiveRelationship"));
  assert.equal(candidate.email, "private@example.test");
  assert.deepEqual(Object.keys(stored).sort(), ["companyName", "customerId", "leadId", "lifecycleStage", "relationshipId", "relationshipType", "selectedAt"].sort());
  assert.equal(JSON.stringify(stored).includes("private@example.test"), false);
  assert.equal(JSON.stringify(stored).includes("+31"), false);
});

test("refresh restores only after server validation and emits the central event", async () => {
  const harness = createHarness({ relationship: { relationshipType: "lead", relationshipId: LEAD_ID, leadId: LEAD_ID, customerId: null, companyName: "Fallback", selectedAt: "2026-07-13T10:00:00.000Z" } });
  const changes = [];
  harness.window.addEventListener("maxwebstudio:relationship-change", (event) => changes.push(event.detail));
  assert.equal(harness.api.getActiveRelationship(), null);
  harness.document.dispatchEvent(new harness.CustomEvent("DOMContentLoaded"));
  await settle();
  assert.equal(harness.api.getActiveRelationship().companyName, "Validated Lead");
  assert.equal(changes.at(-1).relationship.leadId, LEAD_ID);
  assert.equal(harness.requests.length, 1);
  assert.deepEqual(JSON.parse(harness.requests[0].body), { contractVersion: 2, entityType: "lead", relationshipType: "lead", relationshipId: LEAD_ID, leadId: LEAD_ID, customerId: null });
});

test("lead selection, customer switch and clear keep storage, URL and events synchronized", async () => {
  const harness = createHarness();
  const changes = [];
  harness.window.addEventListener("maxwebstudio:relationship-change", (event) => changes.push(event.detail.relationship?.entityType || null));
  await harness.api.setActiveRelationship({ entityType: "lead", leadId: LEAD_ID }, { source: "test" });
  let stored = JSON.parse(harness.storage.getItem("maxwebstudioActiveRelationship"));
  assert.equal(stored.relationshipType, "lead");
  assert.equal(JSON.stringify(stored).includes("@"), false);
  await harness.api.setActiveRelationship({ entityType: "customer", customerId: CUSTOMER_ID }, { source: "test" });
  stored = JSON.parse(harness.storage.getItem("maxwebstudioActiveRelationship"));
  assert.equal(stored.relationshipType, "customer");
  harness.window.location.href = `http://localhost/admin-dashboard.html?customerId=${CUSTOMER_ID}`;
  harness.api.clearActiveRelationship("test-clear");
  assert.equal(harness.storage.getItem("maxwebstudioActiveRelationship"), null);
  assert.equal(harness.window.location.href.includes("customerId="), false);
  assert.deepEqual(changes, ["lead", "customer", null]);
});

test("invalid or inaccessible restored relationships are removed without an endless state", async () => {
  const harness = createHarness({ relationship: { relationshipType: "lead", relationshipId: LEAD_ID, leadId: LEAD_ID, companyName: "Stale" }, failValidation: true, href: `http://localhost/admin-dashboard.html?leadId=${LEAD_ID}` });
  harness.document.dispatchEvent(new harness.CustomEvent("DOMContentLoaded"));
  await settle();
  assert.equal(harness.api.getActiveRelationship(), null);
  assert.equal(harness.storage.getItem("maxwebstudioActiveRelationship"), null);
  assert.equal(harness.window.location.href.includes("leadId="), false);
});

test("central logout event clears in-memory and stored relationship context", async () => {
  const harness = createHarness();
  await harness.api.setActiveRelationship({ entityType: "lead", leadId: LEAD_ID });
  harness.window.dispatchEvent(new harness.CustomEvent("maxwebstudio:admin-logout"));
  assert.equal(harness.api.getActiveRelationship(), null);
  assert.equal(harness.storage.getItem("maxwebstudioActiveRelationship"), null);
  for (const file of ["public/src/services/supabaseAuthProvider.js", "public/src/services/adminAuthBridgeService.js", "public/src/services/demoAuthProvider.js", "public/admin-dashboard.html"]) {
    const content = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.match(content, /removeItem\("maxwebstudioActiveRelationship"\)/, `${file} must clear workspace context`);
  }
});

function createHarness(options = {}) {
  class Emitter {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, callback) { const rows = this.listeners.get(type) || []; rows.push(callback); this.listeners.set(type, rows); }
    removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter((row) => row !== callback)); }
    dispatchEvent(event) { event.target ||= this; for (const callback of this.listeners.get(event.type) || []) callback(event); return true; }
  }
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; this.target = null; } }
  const values = new Map();
  const storage = { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  storage.setItem("mws_admin_supabase_session", JSON.stringify({ accessToken: "token", userId: "actor" }));
  if (options.relationship) storage.setItem("maxwebstudioActiveRelationship", JSON.stringify(options.relationship));
  const window = new Emitter();
  window.location = { href: options.href || "http://localhost/admin-dashboard.html", origin: "http://localhost" };
  window.history = { state: null, replaceState(_state, _title, next) { window.location.href = new URL(next, window.location.origin).href; } };
  const document = new Emitter(); document.readyState = "loading"; document.body = null; document.title = "Dashboard";
  const requests = [];
  const fetch = async (_url, request) => {
    requests.push(request);
    if (options.failValidation) return { ok: false, status: 403, json: async () => ({ success: false, code: "FORBIDDEN", error: "Forbidden" }) };
    const input = JSON.parse(request.body);
    const lead = input.entityType === "lead";
    return { ok: true, status: 200, json: async () => ({ success: true, contractVersion: 2, relationship: lead ? { entityType: "lead", leadId: LEAD_ID, customerId: null, companyName: "Validated Lead", lifecycleStage: "qualified", email: "not-stored@example.test", phone: "+31 6" } : { entityType: "customer", leadId: null, customerId: CUSTOMER_ID, companyName: "Validated Customer", lifecycleStage: "active", email: "not-stored@example.test", phone: "+31 6" } }) };
  };
  vm.runInNewContext(source, { window, document, localStorage: storage, fetch, URL, URLSearchParams, CustomEvent, console: { error() {}, warn() {} }, setTimeout, clearTimeout });
  return { api: window.ActiveRelationship, CustomEvent, document, requests, storage, window };
}

function settle() { return new Promise((resolve) => setTimeout(resolve, 10)); }
