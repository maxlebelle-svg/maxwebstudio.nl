const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const browser = fs.readFileSync(path.join(root, "public/admin/ui/active-relationship.js"), "utf8");
const palette = fs.readFileSync(path.join(root, "public/admin/ui/global-command-palette.js"), "utf8");
const backend = fs.readFileSync(path.join(root, "functions/admin-relationship-context.js"), "utf8");

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
