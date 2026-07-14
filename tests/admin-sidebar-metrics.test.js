const test = require("node:test");
const assert = require("node:assert/strict");
const { handler, _test } = require("../functions/admin-sidebar-metrics");

const ACTOR = "11111111-1111-4111-8111-111111111111";
const PROFILE = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";
const CUSTOMER = "44444444-4444-4444-8444-444444444444";
const JOURNEY = "55555555-5555-4555-8555-555555555555";
const VIEWED_PROFILE = "66666666-6666-4666-8666-666666666666";
const VIEWED_AUTH = "77777777-7777-4777-8777-777777777777";

test("sidebar metrics requires a verified bearer and active allowed profile", async () => {
  const result = await handler(event({}, ""));
  assert.equal(result.statusCode, 401);
});

test("no workspace returns only a scoped, exact general lead metric", async () => withBackend("super_admin", async (state) => {
  const result = await handler(event());
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.general.openLeads, 9);
  assert.equal(body.workspace, null);
  assert.equal(state.urls.some((url) => url.includes("/rest/v1/files")), false);
  assert.match(body.general.definition, /toegestane scope/);
}));

test("general lead metric falls back to legacy status when lead_status is absent", async () => withBackend("super_admin", async (state) => {
  const result = await handler(event());
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.general.openLeads, 6);
  assert(state.urls.some((url) => url.includes("/rest/v1/leads") && !url.includes("lead_status") && url.includes("status=in")));
}, { missingLeadLifecycle: true }));

test("lead workspace remains readable on the baseline production schema", async () => withBackend("admin", async () => {
  const result = await handler(event({ entityType: "lead", id: LEAD }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.workspace.relationship.leadId, LEAD);
  assert.equal(body.workspace.relationship.lifecycleStage, "nieuw");
}, { missingLeadLifecycle: true }));

test("admin customer context returns minimal real metrics and separates open from overdue invoices", async () => withBackend("admin", async () => {
  const result = await handler(event({ entityType: "customer", id: CUSTOMER }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.workspace.relationship.companyName, "QuantumBouw");
  assert.equal(body.workspace.metrics.assets, 4);
  assert.equal(body.workspace.metrics.openInvoices, 3);
  assert.equal(body.workspace.metrics.overdueInvoices, 1);
  assert.deepEqual(body.workspace.statuses.websiteFactory, { label: "Preview klaar", tone: "info" });
  assert.deepEqual(body.workspace.statuses.brandCenter, { label: "Logo klaar", tone: "purple" });
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /quantum@example|0612345678|to_email|phone/i);
}));

test("lead context omits customer-only commerce rather than inventing zeroes", async () => withBackend("admin", async () => {
  const result = await handler(event({ entityType: "lead", id: LEAD }));
  const workspace = JSON.parse(result.body).workspace;
  assert.equal(result.statusCode, 200);
  assert.equal(workspace.relationship.entityType, "lead");
  assert.equal(workspace.metrics.openInvoices, null);
  assert.equal(workspace.metrics.subscriptions, null);
  assert.equal(workspace.metrics.assets, 4);
}));

test("sales_partner general and workspace queries are server-scoped and foreign workspace is denied", async () => withBackend("sales_partner", async (state) => {
  const own = await handler(event({ entityType: "lead", id: LEAD }));
  assert.equal(own.statusCode, 200);
  const leadCountUrl = state.urls.find((url) => url.includes("/rest/v1/leads") && url.includes("lead_status=in"));
  assert(leadCountUrl);
  assert.match(decodeURIComponent(new URL(leadCountUrl).searchParams.get("or") || ""), new RegExp(ACTOR));
  state.foreign = true;
  const denied = await handler(event({ entityType: "lead", id: LEAD }));
  assert.equal(denied.statusCode, 403);
}));

test("super admin perspective filters only general metrics and keeps actor/viewed identities explicit", async () => withBackend("super_admin", async (state) => {
  const result = await handler(event({ entityType: "customer", id: CUSTOMER, viewedProfileId: VIEWED_PROFILE }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(body.perspective, { actorProfileId: PROFILE, viewedProfileId: VIEWED_PROFILE, perspectiveActive: true });
  const leadCount = state.urls.find((url) => url.includes("/rest/v1/leads") && url.includes("lead_status=in"));
  assert.match(decodeURIComponent(new URL(leadCount).searchParams.get("or") || ""), new RegExp(VIEWED_AUTH));
  const workspaceUrl = state.urls.find((url) => url.includes("/rest/v1/files") && url.includes(CUSTOMER));
  assert(workspaceUrl);
  assert.doesNotMatch(workspaceUrl, new RegExp(VIEWED_PROFILE));
}));

test("non-super-admin cannot inject a viewed profile into metric requests", async () => withBackend("admin", async () => {
  const result = await handler(event({ viewedProfileId: VIEWED_PROFILE }));
  assert.equal(result.statusCode, 403);
  assert.equal(JSON.parse(result.body).code, "SUPER_ADMIN_REQUIRED");
}));

test("one failed metric is isolated and never converted to a fake zero", async () => withBackend("admin", async () => {
  const result = await handler(event({ entityType: "customer", id: CUSTOMER }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.workspace.metrics.assets, 4);
  assert.equal(body.workspace.metrics.timelineEvents, null);
  assert(body.workspace.errors.some((error) => error.metric === "timelineEvents"));
}, { failTable: "customer_timeline_events" }));

test("missing service configuration is a controlled full endpoint failure", async () => withBackend("admin", async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = await handler(event());
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.body).code, "SERVICE_UNAVAILABLE");
}));

test("semantic status mapping is deterministic and evidence based", () => {
  assert.deepEqual(_test.deriveWebsiteFactoryStatus({ website: { status: "live" } }), { label: "Live", tone: "success" });
  assert.deepEqual(_test.deriveWebsiteFactoryStatus({ buildJob: { status: "failed" } }), { label: "Geblokkeerd", tone: "danger" });
  assert.deepEqual(_test.deriveWebsiteFactoryStatus({ buildJob: { status: "failed" }, previewVersions: 2 }), { label: "Geblokkeerd", tone: "danger" });
  assert.deepEqual(_test.deriveWebsiteFactoryStatus({ journey: { demo_status: "geen_demo" } }), { label: "Niet gestart", tone: "neutral" });
  assert.equal(_test.deriveWebsiteFactoryStatus({}), null);
  assert.deepEqual(_test.deriveBrandStatus([{ category: "logo", status: "approved" }]), { label: "Logo klaar", tone: "purple" });
  assert.deepEqual(_test.deriveBrandStatus([{ category: "photo", status: "active" }]), { label: "Onvolledig", tone: "warning" });
  assert.equal(_test.deriveBrandStatus([]), null);
  assert.deepEqual(_test.deriveDomainStatus({ domain: "example.test", status: "online", ssl_status: "valid" }), { label: "Actief", tone: "success" });
  assert.deepEqual(_test.deriveCommerceStatus({ overdueInvoices: 1, openInvoices: 1 }), { label: "Achterstallig", tone: "danger" });
  assert.deepEqual(_test.deriveCommerceStatus({ overdueInvoices: 0, openInvoices: 2 }), { label: "Actie nodig", tone: "warning" });
});

test("ownership helper never expands beyond the active relationship boundary", () => {
  assert.equal(_test.canAccess({ role: "super_admin" }, {}), true);
  assert.equal(_test.canAccess({ role: "sales_partner", id: ACTOR, profileId: PROFILE }, { assigned_user_id: ACTOR }), true);
  assert.equal(_test.canAccess({ role: "sales_partner", id: ACTOR, profileId: PROFILE }, { metadata: { owner_profile_id: PROFILE } }), true);
  assert.equal(_test.canAccess({ role: "sales_partner", id: ACTOR, profileId: PROFILE }, { assigned_user_id: "other" }), false);
});

async function withBackend(role, callback, options = {}) {
  const previousFetch = global.fetch;
  const previousEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  const state = { urls: [], foreign: false };
  global.fetch = async (url) => {
    const stringUrl = String(url); state.urls.push(stringUrl);
    if (stringUrl.includes("/auth/v1/user")) return response(200, { id: ACTOR, email: "partner@example.test" });
    if (stringUrl.includes("/rest/v1/profiles") && stringUrl.includes("auth_user_id=eq.")) return response(200, [{ id: PROFILE, role, status: "active" }]);
    if (stringUrl.includes("/rest/v1/profiles")) return response(200, [{ id: VIEWED_PROFILE, auth_user_id: VIEWED_AUTH, name: "Lisanne", email: "lisanne@example.test", role: "sales_partner", status: "active" }]);
    const parsed = new URL(stringUrl); const table = parsed.pathname.split("/").at(-1);
    if (options.failTable === table) return response(503, { code: "UPSTREAM" });
    if (options.missingLeadLifecycle && table === "leads" && stringUrl.includes("lead_status")) return response(400, { code: "42703", message: "column leads.lead_status does not exist" });
    if (isCountRequest(parsed)) return countResponse(countFor(table, parsed));
    if (table === "customers") return response(200, [{ id: CUSTOMER, company: "QuantumBouw", name: "Private Name", status: "active", portal_status: "production", metadata: role === "sales_partner" ? { owner_auth_user_id: ACTOR } : {} }]);
    if (table === "leads") return response(200, options.missingLeadLifecycle
      ? [{ id: LEAD, company_name: "Leadbedrijf", status: "nieuw", assigned_to: state.foreign ? "other" : ACTOR, owner_id: ACTOR, metadata: {} }]
      : [{ id: LEAD, company_name: "Leadbedrijf", lead_status: "interesting", assigned_user_id: state.foreign ? "other" : ACTOR, assigned_user_name: "Max" }]);
    if (table === "websites") return response(200, [{ id: "website", status: "building", hosting_status: "active", ssl_status: "valid", domain: "quantum.example" }]);
    if (table === "projects") return response(200, [{ id: "project", status: "active", phase: "production", progress: 60 }]);
    if (table === "demo_journeys") return response(200, [{ id: JOURNEY, demo_status: "preview_verstuurd" }]);
    if (table === "website_build_jobs") return response(200, [{ id: "job", status: "completed", progress: 100 }]);
    if (table === "files") return response(200, [{ id: "logo", status: "approved", category: "logo", is_primary: true, metadata: {} }]);
    return response(200, []);
  };
  try { return await callback(state); }
  finally { global.fetch = previousFetch; Object.entries(previousEnv).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; }); }
}

function isCountRequest(url) { return url.searchParams.get("select") === "id"; }
function countFor(table, url) {
  if (table === "leads" && !url.searchParams.has("lead_status")) return 6;
  if (table === "leads" && url.searchParams.get("lead_status") === "is.null") return 2;
  if (table === "leads" && url.searchParams.has("lead_status")) return 7;
  return { files: 4, demo_journeys: 2, crm_tasks: 3, customer_timeline_events: 9, email_logs: 5, quotes: 2, invoices: url.searchParams.get("status")?.includes("expired") && !url.searchParams.get("status")?.includes("draft") ? 1 : 3, subscriptions: url.searchParams.get("status") ? 1 : 1, website_preview_versions: 2 }[table] ?? 0;
}
function event(queryStringParameters = {}, bearer = "token") { return { httpMethod: "GET", headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, queryStringParameters }; }
function response(status, body) { return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body }; }
function countResponse(total) { return { ok: true, status: 206, headers: { get: (name) => name.toLowerCase() === "content-range" ? `0-0/${total}` : null }, json: async () => total ? [{ id: "count" }] : [] }; }
