const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const backend = fs.readFileSync(path.join(root, "functions/admin-relationship-workspace.js"), "utf8");
const shell = fs.readFileSync(path.join(root, "public/admin-relatie-workspace.html"), "utf8");
const client = fs.readFileSync(path.join(root, "public/admin/ui/relationship-workspace.js"), "utf8");
const palette = fs.readFileSync(path.join(root, "public/admin/ui/global-command-palette.js"), "utf8");
const active = fs.readFileSync(path.join(root, "public/admin/ui/active-relationship.js"), "utf8");
const { mapRelationship, moduleStates, assertIntegrity, canAccess, isArchived, sanitizeFile } = require("../functions/admin-relationship-workspace")._test;

test("workspace resolver returns one relationship contract with safe empty modules", () => {
  const relationship = mapRelationship({ relationship: { id: "c", company: "QuantumBouw", status: "active" }, customer: { id: "c" }, lead: null });
  assert.equal(relationship.entityType, "customer");
  assert.equal(relationship.relationshipId, "c");
  const modules = moduleStates({ assets: [], emailLogs: [], demoJourney: null, website: null, brandProfile: null }, { assets: 0, quotes: 0, invoices: 0, subscriptions: 0, tasks: 0, timelineEvents: 0 });
  assert.equal(modules.websiteFactory.available, true);
  assert.equal(modules.websiteFactory.emptyReason, "MODULE_NOT_INITIALIZED");
});

test("workspace enforces roles, archive state and mixed customer integrity", () => {
  assert.equal(canAccess({ role: "super_admin" }, {}), true);
  assert.equal(canAccess({ role: "sales", id: "a" }, { assigned_user_id: "b" }), false);
  assert.equal(isArchived({ status: "active" }), false);
  assert.equal(isArchived({ archived_at: "2026-07-12" }), true);
  assert.throws(() => assertIntegrity({ customer: { id: "a" } }, { websites: [{ customer_id: "b" }], projects: [], quotes: [], subscriptions: [] }), /dezelfde relatie/);
});

test("workspace never exposes private storage paths", () => {
  const safe = sanitizeFile({ id: "f", storage_path: "private/customer/file.png", location: "bucket", metadata: { source: "customer_portal", description: "Logo", brandingRole: "logo", secret: "nooit" } });
  assert.equal(safe.storage_path, undefined);
  assert.equal(safe.location, undefined);
  assert.equal(safe.metadata.description, "Logo");
  assert.equal(safe.metadata.brandingRole, "logo");
  assert.equal(safe.metadata.secret, undefined);
});

test("workspace exposes recent customer assets with review actions", () => {
  assert.match(client, /Bestanden & merkassets/);
  assert.match(client, /Nieuwe klantuploads/);
  assert.match(client, /data-asset-open/);
  assert.match(client, /data-asset-action="branding"/);
  assert.match(client, /Alle bestanden bekijken/);
});

test("workspace shell exposes all required module entry points and responsive navigation", () => {
  for (const label of ["Website Factory","Demo Sites","AI Content Library","Asset Manager","SEO Studio","Social Media Studio","Brand Center","Domain Center","085 Telefonie","Klant Onboarding","Roadmap & Takenbord","Automations","Offertes","Facturen","Abonnementen","Communicatie","Tijdlijn","Relatiegegevens"]) assert.match(client, new RegExp(label));
  assert.match(shell, /@media\(max-width:600px\)/);
  assert.match(client, /openRelationshipWorkspace/);
  assert.match(backend, /resolvedFromConvertedLead/);
  assert.match(backend, /relationshipRows/);
  assert.match(backend, /lead_assets/);
  assert.match(palette, /admin-relatie-workspace\.html\?entityType=/);
  assert.match(active, /admin-relatie-workspace\.html\?entityType=/);
});
