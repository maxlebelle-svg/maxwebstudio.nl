const test = require("node:test");
const assert = require("node:assert/strict");

const originalEnv = {
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  ALLOW_LEGACY_ADMIN_TOKEN: process.env.ALLOW_LEGACY_ADMIN_TOKEN,
  APP_ENV: process.env.APP_ENV,
  APP_ENVIRONMENT: process.env.APP_ENVIRONMENT,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const originalFetch = global.fetch;
const originalConsoleError = console.error;

process.env.ADMIN_TOKEN = ["rc13", "legacy", "fixture"].join("-");
process.env.ALLOW_LEGACY_ADMIN_TOKEN = "true";
process.env.APP_ENV = "test";
process.env.APP_ENVIRONMENT = "test";
process.env.SUPABASE_URL = "https://staging.example.test";
process.env.SUPABASE_ANON_KEY = ["rc13", "anon", "fixture"].join("-");
process.env.SUPABASE_SERVICE_ROLE_KEY = ["rc13", "service", "fixture"].join("-");

const demoJourney = require("../functions/demo-journey");

test.after(() => {
  global.fetch = originalFetch;
  console.error = originalConsoleError;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("legacy and Supabase auth normalize to the same principal contract", () => {
  const legacy = demoJourney._test.normalizeAdminPrincipal({ success: true, source: "legacy_admin_token" });
  assert.deepEqual(
    { id: legacy.id, role: legacy.role, status: legacy.status, auth_source: legacy.auth_source },
    { id: "system:legacy-admin-token", role: "super_admin", status: "active", auth_source: "legacy_admin_token" },
  );
  assert.equal(JSON.stringify(legacy).includes(process.env.ADMIN_TOKEN), false);

  const normal = demoJourney._test.normalizeAdminPrincipal({
    success: true,
    source: "supabase_admin_session",
    admin: { id: "10000000-0000-4000-8000-000000000001", role: "admin", status: "active", email: "admin@example.test" },
  });
  assert.equal(normal.id, "10000000-0000-4000-8000-000000000001");
  assert.equal(normal.auth_source, "supabase_admin_session");
  assert.throws(
    () => demoJourney._test.normalizeAdminPrincipal({ success: true, source: "supabase_admin_session", admin: {} }),
    (error) => error.code === "INVALID_ADMIN_PRINCIPAL",
  );
});

test("missing and invalid authentication remain structured HTTP 401 responses", async () => {
  global.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return json({ message: "invalid token" }, 401);
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const missing = await demoJourney.handler(event("GET", null, ""));
  assert.equal(missing.statusCode, 401);
  assert.deepEqual(JSON.parse(missing.body), { success: false, error: "Niet geautoriseerd." });

  const invalid = await demoJourney.handler(event("GET", null, "invalid-bearer"));
  assert.equal(invalid.statusCode, 401);
  assert.deepEqual(JSON.parse(invalid.body), { success: false, error: "Niet geautoriseerd." });
  assert.equal(invalid.body.includes("invalid-bearer"), false);
});

test("legacy save, reopen and retry stay structured and idempotent without project_workspaces", async () => {
  const database = fakeDatabase();
  global.fetch = database.fetch;
  const payload = {
    leadId: "50000000-0000-4000-8000-000000000001",
    businessName: "Internal Lead BV",
    contactName: "Lead Test",
    email: "lead@example.test",
    demoStatus: "aanvraag_ontvangen",
    internalNotes: "RC1.3 local validation",
    emailFlowEnabled: false,
  };

  const first = await demoJourney.handler(event("POST", payload));
  assert.equal(first.statusCode, 200);
  const firstBody = JSON.parse(first.body);
  assert.equal(firstBody.success, true);
  assert.equal(firstBody.journey.id, database.journeyId);
  assert.equal(database.journeys.length, 1);
  assert.equal(database.journeys[0].created_by, "system:legacy-admin-token");
  assert.equal(database.journeys[0].updated_by, "system:legacy-admin-token");
  assert.equal(database.events.length, 1);
  assert.equal(database.events[0].event_type, "created");
  assert.equal(database.events[0].created_by, "system:legacy-admin-token");
  assert.equal(first.body.includes(process.env.ADMIN_TOKEN), false);
  assert.equal(firstBody.projectWorkspace, null);

  const stored = JSON.parse(JSON.stringify(database.journeys[0]));
  const reopen = await demoJourney.handler(event("GET", null, process.env.ADMIN_TOKEN, { leadId: payload.leadId }));
  assert.equal(reopen.statusCode, 200);
  const reopenBody = JSON.parse(reopen.body);
  assert.equal(reopenBody.journey.id, database.journeyId);
  assert.deepEqual(database.journeys[0], stored);

  const retry = await demoJourney.handler(event("POST", payload));
  assert.equal(retry.statusCode, 200);
  assert.equal(database.journeys.length, 1);
  assert.equal(database.journeys[0].id, database.journeyId);
  assert.equal(database.events.length, 1);
  assert.equal(JSON.parse(retry.body).journey.id, database.journeyId);
});

test("normal Supabase admin bearer auth remains accepted", async () => {
  const database = fakeDatabase();
  global.fetch = database.fetch;
  const response = await demoJourney.handler(event("GET", null, "supabase-admin-token"));
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).success, true);
  assert.equal(database.authUserReads, 1);
  assert.equal(database.profileReads, 1);
});

test("unexpected async storage errors return sanitized structured HTTP 500", async () => {
  const database = fakeDatabase({ failJourneyReads: true });
  global.fetch = database.fetch;
  const logs = [];
  console.error = (...args) => logs.push(args);
  const response = await demoJourney.handler(event("POST", {
    leadId: "50000000-0000-4000-8000-000000000001",
    businessName: "Failure test",
  }));
  console.error = originalConsoleError;

  assert.equal(response.statusCode, 500);
  const body = JSON.parse(response.body);
  assert.equal(body.success, false);
  assert.equal(body.reason, "demo_journey_api_failed");
  assert.equal(Object.hasOwn(body, "stack"), false);
  assert.equal(response.body.includes(process.env.ADMIN_TOKEN), false);
  assert.equal(response.body.includes(process.env.SUPABASE_SERVICE_ROLE_KEY), false);
  assert.equal(JSON.stringify(logs).includes(process.env.ADMIN_TOKEN), false);
  assert.equal(JSON.stringify(logs).includes(process.env.SUPABASE_SERVICE_ROLE_KEY), false);
});

test("real journey write errors remain blocking", async () => {
  const database = fakeDatabase({ failJourneyWrites: true });
  global.fetch = database.fetch;
  const response = await demoJourney.handler(event("POST", { businessName: "Write failure" }));
  assert.equal(response.statusCode, 500);
  assert.equal(JSON.parse(response.body).success, false);
  assert.equal(database.journeys.length, 0);
  assert.equal(database.events.length, 0);
});

function event(method, body = null, bearer = process.env.ADMIN_TOKEN, query = {}) {
  return {
    httpMethod: method,
    path: "/.netlify/functions/demo-journey",
    headers: bearer ? { authorization: `Bearer ${bearer}`, "content-type": "application/json" } : {},
    queryStringParameters: query,
    body: body ? JSON.stringify(body) : null,
  };
}

function fakeDatabase(options = {}) {
  const state = {
    journeyId: "f866b859-88f9-4fbd-aee2-11d337e5a88d",
    journeys: [],
    events: [],
    authUserReads: 0,
    profileReads: 0,
  };
  let clock = 0;
  state.fetch = async (input, request = {}) => {
    const url = new URL(String(input));
    const method = String(request.method || "GET").toUpperCase();
    const authorization = request.headers?.Authorization || request.headers?.authorization || "";

    if (url.pathname === "/auth/v1/user") {
      state.authUserReads += 1;
      if (authorization === "Bearer supabase-admin-token") {
        return json({ id: "10000000-0000-4000-8000-000000000001", email: "admin@example.test" });
      }
      return json({ message: "invalid token" }, 401);
    }
    if (url.pathname === "/rest/v1/profiles") {
      state.profileReads += 1;
      return json([{ id: "20000000-0000-4000-8000-000000000001", role: "admin", status: "active" }]);
    }
    if (url.pathname === "/rest/v1/project_workspaces" || url.pathname === "/rest/v1/website_build_jobs") {
      return json({ code: "PGRST205", message: `Could not find the table ${url.pathname.split("/").pop()} in the schema cache` }, 404);
    }
    if (url.pathname === "/rest/v1/demo_journeys") {
      if (method === "GET") {
        if (options.failJourneyReads) {
          return json({ message: `storage failed ${process.env.ADMIN_TOKEN} ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }, 500);
        }
        return json(filterRows(state.journeys, url.searchParams));
      }
      const record = JSON.parse(request.body || "{}");
      if (hasDraftColumns(record)) return json({ code: "PGRST204", message: "Unknown draft column" }, 400);
      if (options.failJourneyWrites) return json({ message: "journey write failed" }, 500);
      const timestamp = new Date(Date.UTC(2026, 6, 19, 8, 0, clock++)).toISOString();
      if (method === "POST") {
        const row = {
          id: state.journeyId,
          lead_id: null,
          customer_id: null,
          business_name: null,
          contact_name: null,
          email: "",
          phone: "",
          website_url: "",
          demo_status: "geen_demo",
          generated_briefing: "",
          preview_url: "",
          preview_token: null,
          preview_package: {},
          preview_generated_at: null,
          feedback: "",
          internal_notes: "",
          follow_up_at: null,
          assigned_to: null,
          email_flow_enabled: false,
          last_email_status: null,
          last_email_sent_at: null,
          next_email_type: null,
          created_by: null,
          updated_by: null,
          created_at: timestamp,
          updated_at: timestamp,
          ...record,
        };
        state.journeys.push(row);
        return json([row], 201);
      }
      if (method === "PATCH") {
        const id = cleanFilter(url.searchParams.get("id"));
        const row = state.journeys.find((item) => item.id === id);
        Object.assign(row, record, { updated_at: timestamp });
        return json([row]);
      }
    }
    if (url.pathname === "/rest/v1/demo_journey_events") {
      if (method === "GET") return json(filterRows(state.events, url.searchParams));
      const record = JSON.parse(request.body || "{}");
      state.events.push({ id: `30000000-0000-4000-8000-${String(state.events.length + 1).padStart(12, "0")}`, created_at: new Date().toISOString(), ...record });
      return json([], 201);
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  };
  return state;
}

function filterRows(rows, params) {
  let result = [...rows];
  for (const key of ["id", "lead_id", "customer_id", "demo_journey_id", "event_type"]) {
    const expected = cleanFilter(params.get(key));
    if (expected) result = result.filter((row) => String(row[key] || "") === expected);
  }
  const limit = Number(params.get("limit") || result.length);
  return result.slice(0, limit);
}

function cleanFilter(value) {
  return String(value || "").replace(/^eq\./, "");
}

function hasDraftColumns(record) {
  return ["intake_json", "intake_summary", "intake_completeness", "asset_metadata", "approval_status"].some((key) => Object.hasOwn(record, key));
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
