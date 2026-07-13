const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createHandler } = require("../functions/admin-journeys");
const { createAdminJourneyReadRepository } = require("../functions/journey/adminReadRepository");
const { createAdminJourneyReadService } = require("../functions/journey/adminReadService");

const TEST_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  JOURNEY_ENGINE_ENABLED: "test_only",
  JOURNEY_ADMIN_ENABLED: "test_only",
  APP_ENV: "test",
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function emptyData() {
  return { journeyDefinitions: [], journeyInstances: [], journeyEvents: [], customers: [], projects: [], invoices: [], leads: [], demoJourneys: [], automationOutbox: [], automationExecutions: [] };
}

function snapshot(data = {}, overrides = {}) {
  return { available: true, skipped: false, journeyTablesAvailable: true, warnings: [], data: { ...emptyData(), ...data }, ...overrides };
}

test("admin endpoint rejects unauthenticated requests", async () => {
  const handler = createHandler({
    verifyAdmin: async () => ({ success: false, response: { statusCode: 401, headers: {}, body: JSON.stringify({ success: false }) } }),
    service: { getOverview: async () => { throw new Error("must not run"); } },
  });
  const result = await handler({ httpMethod: "GET", headers: {} });
  assert.equal(result.statusCode, 401);
});

test("customer role is not accepted by the admin endpoint", async () => {
  let roles = [];
  const handler = createHandler({
    verifyAdmin: async (_event, _json, options) => {
      roles = options.allowedRoles;
      return { success: false, response: { statusCode: 401, headers: {}, body: "{}" } };
    },
    service: { getOverview: async () => ({}) },
  });
  const result = await handler({ httpMethod: "GET", headers: { authorization: "Bearer customer-token" } });
  assert.equal(result.statusCode, 401);
  assert.deepEqual(roles, ["super_admin", "admin"]);
  assert.equal(roles.includes("customer"), false);
});

test("authorized admin receives read-only journey data", async () => {
  let receivedContext;
  const handler = createHandler({
    env: TEST_ENV,
    verifyAdmin: async () => ({ success: true, admin: { role: "admin", status: "active" } }),
    service: {
      getOverview: async (_filters, context) => {
        receivedContext = context;
        return { available: true, disabled: false, journeys: [], metrics: {}, pagination: {}, recentEvents: [] };
      },
    },
    logger: { info() {}, error() {} },
  });
  const result = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { limit: "999" } });
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.readOnly, true);
  assert.equal(receivedContext.adminAuthorized, true);
  assert.equal(receivedContext.environment, "test");
});

test("admin endpoint rejects all mutation methods", async () => {
  const handler = createHandler({ verifyAdmin: async () => ({ success: true }), service: { getOverview: async () => ({}) } });
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    assert.equal((await handler({ httpMethod: method })).statusCode, 405);
  }
});

test("feature flags off return a no-op without reading Supabase", async () => {
  let calls = 0;
  const repository = createAdminJourneyReadRepository({
    env: { SUPABASE_URL: TEST_ENV.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: TEST_ENV.SUPABASE_SERVICE_ROLE_KEY },
    fetchImpl: async () => { calls += 1; return response([]); },
    logger: { info() {} },
  });
  const result = await repository.readSnapshot({}, { adminAuthorized: true, environment: "test" });
  assert.equal(result.skipped, true);
  assert.equal(calls, 0);
});

test("test-only flags reject production and allow explicit test context", async () => {
  let calls = 0;
  const repository = createAdminJourneyReadRepository({
    env: TEST_ENV,
    fetchImpl: async () => { calls += 1; return response([]); },
    logger: { info() {} },
  });
  assert.equal((await repository.readSnapshot({}, { adminAuthorized: true, environment: "production" })).skipped, true);
  assert.equal(calls, 0);
  assert.equal((await repository.readSnapshot({}, { adminAuthorized: true, environment: "test" })).skipped, false);
  assert.equal(calls, 10);
});

test("allowlist mode needs an explicit matching scope", async () => {
  let calls = 0;
  const env = {
    ...TEST_ENV,
    JOURNEY_ENGINE_ENABLED: "allowlist",
    JOURNEY_ADMIN_ENABLED: "allowlist",
    JOURNEY_ENGINE_ENABLED_ALLOWLIST: "admin-journeys",
    JOURNEY_ADMIN_ENABLED_ALLOWLIST: "admin-journeys",
  };
  const repository = createAdminJourneyReadRepository({ env, fetchImpl: async () => { calls += 1; return response([]); }, logger: { info() {} } });
  assert.equal((await repository.readSnapshot({}, { adminAuthorized: true, scopeKey: "different" })).skipped, true);
  assert.equal((await repository.readSnapshot({}, { adminAuthorized: true, scopeKey: "admin-journeys" })).skipped, false);
  assert.equal(calls, 10);
});

test("missing journey tables produce a controlled legacy fallback snapshot", async () => {
  const repository = createAdminJourneyReadRepository({
    env: TEST_ENV,
    logger: { info() {} },
    fetchImpl: async (url) => {
      if (url.includes("/journey_")) return response({ code: "PGRST205", message: "Could not find the table" }, 404);
      if (url.includes("/customers")) return response([{ id: "customer-1", company: "Legacy BV", status: "active" }]);
      if (url.includes("/projects")) return response([{ id: "project-1", customer_id: "customer-1", status: "development" }]);
      return response([]);
    },
  });
  const result = await repository.readSnapshot({}, { adminAuthorized: true, environment: "test" });
  assert.equal(result.journeyTablesAvailable, false);
  assert.equal(result.data.customers.length, 1);
  assert.ok(result.warnings.some((warning) => warning.reason === "table_missing"));
});

test("admin service paginates and filters read-only journey rows", async () => {
  const instances = Array.from({ length: 4 }, (_, index) => ({
    id: `instance-${index}`,
    customer_id: `customer-${index}`,
    journey_type: "website.direct_checkout",
    definition_version: 1,
    status: "active",
    current_phase: index % 2 ? "production" : "onboarding",
    metadata: {
      definitionKey: "website.direct_checkout",
      stepStates: index % 2
        ? { order_received: "completed", payment_confirmed: "completed", onboarding_information: "completed", content_ready: "completed" }
        : { order_received: "completed", payment_confirmed: "completed" },
    },
    updated_at: `2026-07-${String(10 + index).padStart(2, "0")}T10:00:00Z`,
  }));
  const customers = instances.map((item, index) => ({ id: item.customer_id, company: `Klant ${index}`, package: "WEB-STARTER" }));
  const service = createAdminJourneyReadService({
    repository: { readSnapshot: async () => snapshot({ journeyInstances: instances, customers }) },
    logger: { info() {} },
    now: () => new Date("2026-07-13T12:00:00Z").getTime(),
  });
  const result = await service.getOverview({ phase: "production", page: 1, limit: 1 }, { adminAuthorized: true });
  assert.equal(result.pagination.total, 2);
  assert.equal(result.journeys.length, 1);
  assert.equal(result.journeys[0].currentPhase, "production");
  assert.equal(result.pagination.totalPages, 2);
});

test("admin service handles an empty database state", async () => {
  const service = createAdminJourneyReadService({ repository: { readSnapshot: async () => snapshot() }, logger: { info() {} } });
  const result = await service.getOverview({}, { adminAuthorized: true });
  assert.deepEqual(result.journeys, []);
  assert.equal(result.metrics.activeJourneys, 0);
  assert.equal(result.pagination.total, 0);
});

test("legacy customers are estimated without any repository write method", async () => {
  const repository = {
    readSnapshot: async () => snapshot({
      customers: [{ id: "customer-1", company: "Legacy BV", package: "WEB-STARTER", updated_at: "2026-07-13T10:00:00Z" }],
      projects: [{ id: "project-1", customer_id: "customer-1", status: "testing", updated_at: "2026-07-13T11:00:00Z" }],
    }, { journeyTablesAvailable: false }),
  };
  assert.deepEqual(Object.keys(repository), ["readSnapshot"]);
  const service = createAdminJourneyReadService({ repository, logger: { info() {} } });
  const result = await service.getOverview({}, { adminAuthorized: true });
  assert.equal(result.journeys[0].source, "legacy_estimate");
  assert.equal(result.journeys[0].percentage, 90);
  assert.equal(result.journeys[0].migrated, false);
});

test("admin UI is authenticated, read-only, responsive, and feature-disabled aware", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "public/admin-journeys.html"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "public/admin-dashboard.html"), "utf8");
  assert.match(html, /src="src\/admin-route-guard\.js/);
  assert.match(html, /getAdminAccessToken/);
  assert.match(html, /\/\.netlify\/functions\/admin-journeys/);
  assert.match(html, /Journey &amp; Mail Automation/);
  assert.match(html, /Mailautomation: nog niet geactiveerd/);
  assert.match(html, /Journey mail outbox/);
  assert.match(html, /Opslag nog niet actief|Automationopslag/);
  assert.match(html, /Veilige testmodus · read-only/);
  assert.match(html, /Legacy read-only fallback/);
  assert.match(html, /@media \(max-width: 720px\)/);
  assert.match(html, /admin-sidebar-nav \{ display: flex;[\s\S]*overflow-x: auto/);
  assert.doesNotMatch(html, /opnieuw verzenden|pauzeren|hervatten|stap handmatig|mail annuleren/i);
  assert.match(dashboard, /href="admin-journeys\.html">Journey &amp; Mail Automation/);
});

test("migration validation records static-only execution and recovery constraints", () => {
  const root = path.resolve(__dirname, "..");
  const report = fs.readFileSync(path.join(root, "docs/CUSTOMER_JOURNEY_MIGRATION_025_VALIDATION.md"), "utf8");
  const sql = fs.readFileSync(path.join(root, "supabase/migration-drafts/025_customer_journey_automation_foundations.sql"), "utf8").toLowerCase();
  assert.match(report, /uitsluitend statisch gevalideerd/);
  assert.match(report, /niet uitgevoerd tegen lokaal, test of productie-supabase/i);
  assert.match(report, /herstelprocedure/i);
  assert.match(sql, /\bbegin;/);
  assert.match(sql, /commit;\s*$/);
  assert.doesNotMatch(sql, /drop\s+(table|column)|truncate\s|delete\s+from/);
});
