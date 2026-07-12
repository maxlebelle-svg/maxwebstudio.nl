const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const browser = fs.readFileSync(path.join(root, "public/admin/ui/active-relationship.js"), "utf8");
const palette = fs.readFileSync(path.join(root, "public/admin/ui/global-command-palette.js"), "utf8");
const backend = fs.readFileSync(path.join(root, "functions/admin-relationship-context.js"), "utf8");
const { canAccess, isUnavailable } = require("../functions/admin-relationship-context")._test;

function candidateNormalizer() {
  const start = palette.indexOf("  function isUuid");
  const end = palette.indexOf("  function relationshipToast", start);
  const source = palette.slice(start, end);
  return Function(`const normalize = (value = "") => String(value || "").trim().toLowerCase(); ${source}; return normalizeRelationshipCandidate;`)();
}

const normalizeCandidate = candidateNormalizer();
const quantumId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";

test("central relationship service exposes one stable API", () => {
  for (const name of ["getActiveRelationship", "setActiveRelationship", "clearActiveRelationship", "validateActiveRelationship", "subscribeToRelationshipChanges", "buildRelationshipUrl"]) assert.match(browser, new RegExp(name));
  assert.match(browser, /maxwebstudio:relationship-change/);
  assert.match(browser, /maxwebstudioActiveRelationship/);
});

test("deep links reject mixed entity identifiers and always validate server-side", () => {
  assert.match(browser, /if \(leadId && customerId\)/);
  assert.match(browser, /\/api\/admin-relationship-context/);
  assert.match(backend, /leadId && customerId/);
  assert.match(backend, /verifyAdmin/);
});

test("role ownership is enforced for sales and stale records are rejected", () => {
  assert.match(backend, /sales_partner/);
  assert.match(backend, /ownerIds\.includes/);
  assert.match(backend, /archived/);
  assert.match(backend, /converted_customer_id/);
});

test("Max Command activates leads and customers before navigation", () => {
  assert.match(palette, /ActiveRelationship\.setActiveRelationship/);
  assert.match(palette, /entityType: "lead"/);
  assert.match(palette, /entityType: "customer"/);
});

test("logout clears relationship context", () => {
  assert.match(browser, /#auth-logout,#admin-session-logout/);
  assert.match(browser, /clearActiveRelationship\("logout"\)/);
});

test("real hybrid customer payload prefers supabaseCustomerId over its local id", () => {
  const candidate = normalizeCandidate({ id: "crm-local-quantumbouw", supabaseCustomerId: quantumId, company: "Quantumbouw.nl" }, "Customer", "maxwebstudioCrmCustomers");
  assert.deepEqual(candidate, { entityType: "customer", customerId: quantumId, leadId: null, displayName: "Quantumbouw.nl" });
});

test("customer_id and customerId payload variants normalize to the same contract", () => {
  assert.equal(normalizeCandidate({ customer_id: quantumId }, "customer").customerId, quantumId);
  assert.equal(normalizeCandidate({ customerId: quantumId }, "customers").customerId, quantumId);
});

test("local profile, website and project identifiers are never customer fallbacks", () => {
  assert.equal(normalizeCandidate({ id: "33333333-3333-4333-8333-333333333333", profileId: quantumId }, "Customer", "maxwebstudioCrmCustomers"), null);
  assert.equal(normalizeCandidate({ id: quantumId, customerId: quantumId }, "Website"), null);
  assert.equal(normalizeCandidate({ id: quantumId, customerId: quantumId }, "Project"), null);
});

test("real lead variants normalize without accepting names or email addresses", () => {
  assert.equal(normalizeCandidate({ leadId, companyName: "Fuellinq" }, "Lead").leadId, leadId);
  assert.equal(normalizeCandidate({ id: "Fuellinq", email: "lead@example.test" }, "Lead"), null);
});

test("role and status checks match production variants", () => {
  assert.equal(canAccess({ role: "super-admin" }, "customer", {}), true);
  assert.equal(canAccess({ role: "super_admin" }, "lead", {}), true);
  assert.equal(canAccess({ role: "sales", id: "actor" }, "lead", { assigned_user_id: "other" }), false);
  assert.equal(isUnavailable({ status: "active", portal_status: "onboarding" }), false);
  assert.equal(isUnavailable({ status: "onboarding" }), false);
  assert.equal(isUnavailable({ status: "active", metadata: { archivedAt: "2026-07-12" } }), true);
});

test("weak FuellGo fuzzy matches are filtered and native alerts are gone", () => {
  assert.match(palette, /_score >= 30/);
  assert.match(palette, /String\(row\.subtitle \|\| ""\)\.split\("·"\)/);
  assert.match(palette, /if \(title === query\) value \+= 220/);
  assert.doesNotMatch(palette, /window\.alert/);
  assert.match(palette, /relationshipToast/);
});

test("frontend and backend require relationship contract version 2", () => {
  assert.match(browser, /contractVersion: 2/);
  assert.match(backend, /contractVersion\) !== 2/);
  assert.match(backend, /STALE_DEPLOYMENT/);
  assert.match(backend, /NOT_FOUND/);
  assert.match(backend, /ARCHIVED/);
});
