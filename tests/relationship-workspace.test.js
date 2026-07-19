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

test("workspace accepts the uniform legacy admin principal", async () => {
  const previous = {
    adminToken: process.env.ADMIN_TOKEN,
    allowLegacy: process.env.ALLOW_LEGACY_ADMIN_TOKEN,
    appEnv: process.env.APP_ENV,
    appEnvironment: process.env.APP_ENVIRONMENT,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const originalFetch = global.fetch;
  process.env.ADMIN_TOKEN = "legacy-fixture";
  process.env.ALLOW_LEGACY_ADMIN_TOKEN = "true";
  process.env.APP_ENV = "test";
  process.env.APP_ENVIRONMENT = "test";
  process.env.SUPABASE_URL = "https://staging.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-fixture";
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/leads") {
      return response(200, [{ id: "50000000-0000-4000-8000-000000000001", company_name: "Synthetic BV", status: "active" }]);
    }
    if (url.pathname.startsWith("/rest/v1/")) return response(200, []);
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await require("../functions/admin-relationship-workspace").handler({
      httpMethod: "GET",
      headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
      queryStringParameters: { entityType: "lead", id: "50000000-0000-4000-8000-000000000001" },
    });
    const body = JSON.parse(result.body);
    assert.equal(result.statusCode, 200);
    assert.equal(body.success, true);
    assert.equal(body.permissions.role, "super_admin");
  } finally {
    global.fetch = originalFetch;
    restore("ADMIN_TOKEN", previous.adminToken);
    restore("ALLOW_LEGACY_ADMIN_TOKEN", previous.allowLegacy);
    restore("APP_ENV", previous.appEnv);
    restore("APP_ENVIRONMENT", previous.appEnvironment);
    restore("SUPABASE_URL", previous.supabaseUrl);
    restore("SUPABASE_SERVICE_ROLE_KEY", previous.serviceRoleKey);
  }
});

test("workspace never exposes private storage paths", () => {
  const safe = sanitizeFile({ id: "f", storage_path: "private/customer/file.png", location: "bucket", metadata: { source: "customer_portal" } });
  assert.equal(safe.storage_path, undefined);
  assert.equal(safe.location, undefined);
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

function restore(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}
