const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { _test } = require("../functions/lead-preview-portal");

const IDS = { user: "11111111-1111-4111-8111-111111111111", invite: "22222222-2222-4222-8222-222222222222", lead: "33333333-3333-4333-8333-333333333333", journey: "44444444-4444-4444-8444-444444444444", profile: "55555555-5555-4555-8555-555555555555" };

function reply(status, body) { return { ok: status >= 200 && status < 300, status, text: async () => body == null ? "" : JSON.stringify(body) }; }

function setup(options = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url); const query = parsed.searchParams; const method = init.method || "GET"; const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: parsed.pathname, query, method, body });
    if (parsed.pathname.endsWith("/auth/v1/user")) return reply(200, { id: IDS.user, email: "lisanne@example.test" });
    if (parsed.pathname.endsWith("/rest/v1/lead_demo_invitations") && method === "GET") return reply(200, options.noInvitation ? [] : [{ id: IDS.invite, lead_id: IDS.lead, demo_journey_id: IDS.journey, auth_user_id: IDS.user, profile_id: IDS.profile, status: "activated", opened_at: options.opened ? "2026-07-14" : null }]);
    if (parsed.pathname.endsWith("/rest/v1/profiles") && method === "GET") return reply(200, [{ id: IDS.profile, auth_user_id: IDS.user, role: options.role || "demo_user", status: "active", metadata: { leadPortal: { leadId: IDS.lead } } }]);
    if (parsed.pathname.endsWith("/rest/v1/leads") && method === "GET") return reply(200, [{ id: IDS.lead, company_name: "Advies Post", contact_name: "Lisanne Post", email: "lisanne@example.test" }]);
    if (parsed.pathname.endsWith("/rest/v1/demo_journeys") && method === "GET") {
      if (options.wrongJourney) return reply(200, []);
      return reply(200, [{ id: IDS.journey, lead_id: IDS.lead, demo_status: "preview_verstuurd", approval_status: "pending", preview_token: "private-token", preview_package: { previewReview: { versions: [{ version: "V1", status: "ready" }] } }, updated_at: "2026-07-14" }]);
    }
    if (parsed.pathname.endsWith("/rest/v1/demo_journey_events") && method === "GET") return reply(200, [{ id: "event-1", event_type: "preview_ready", title: "Demo klaar", description: "Uw demo staat klaar.", created_at: "2026-07-14" }]);
    if (method === "PATCH" || method === "POST") return reply(200, [{}]);
    throw new Error(`Unexpected ${method} ${url}`);
  };
  return { calls, handler: _test.createHandler({ fetchImpl, createTimelineEvent: async () => ({}), now: () => new Date("2026-07-14T12:00:00.000Z") }) };
}

async function run(options = {}, method = "GET", body = null) {
  const state = setup(options); const previous = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service", SUPABASE_ANON_KEY: "anon", SITE_URL: "https://maxwebstudio.nl" });
  try { return { state, response: await state.handler({ httpMethod: method, headers: { authorization: "Bearer session" }, body: body ? JSON.stringify(body) : "" }) }; }
  finally { process.env = previous; }
}

test("leadportal toont uitsluitend canoniek gekoppelde eigen lead en demo", async () => {
  const { response } = await run({ opened: true }); const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200); assert.equal(body.relationshipType, "lead"); assert.equal(body.lead.id, IDS.lead); assert.equal(body.demo.id, IDS.journey);
  assert.equal(body.demo.previewUrl, `https://maxwebstudio.nl/.netlify/functions/demo-preview?id=${IDS.journey}&token=private-token`);
  assert.deepEqual(body.customerModules, { invoices: false, onboarding: false, subscriptions: false, projects: false, assets: false });
  assert.equal("customerId" in body, false);
});

test("account zonder leaduitnodiging en customercontext krijgen geen willekeurige lead", async () => {
  const { response } = await run({ noInvitation: true, role: "customer" });
  assert.equal(response.statusCode, 403); assert.equal(JSON.parse(response.body).code, "LEAD_PORTAL_DENIED");
});

test("onjuiste of verwisselde journey-leadkoppeling wordt server-side geweigerd", async () => {
  const { response } = await run({ wrongJourney: true });
  assert.equal(response.statusCode, 403);
});

test("feedback schrijft alleen naar journey én lead uit de auth-scope", async () => {
  const { state, response } = await run({ opened: true }, "POST", { action: "feedback", feedback: "Graag een andere foto." });
  assert.equal(response.statusCode, 200);
  const write = state.calls.find((call) => call.path.endsWith("/rest/v1/demo_journeys") && call.method === "PATCH");
  assert.equal(write.query.get("id"), `eq.${IDS.journey}`); assert.equal(write.query.get("lead_id"), `eq.${IDS.lead}`); assert.equal(write.body.demo_status, "feedback_ontvangen");
});

test("goedkeuring blijft leadfeedback en maakt geen customer of klantrechten", async () => {
  const { state, response } = await run({ opened: true }, "POST", { action: "approve" });
  assert.equal(response.statusCode, 200); assert.equal(JSON.parse(response.body).status, "approved");
  assert.equal(state.calls.some((call) => call.path.endsWith("/rest/v1/customers")), false);
});

test("activatie zet alleen bestaand profiel en invitation actief", async () => {
  const { state, response } = await run({ opened: true }, "POST", { action: "activate" });
  assert.equal(response.statusCode, 200);
  const writes = state.calls.filter((call) => call.method === "PATCH");
  assert.equal(writes.length, 2); assert.ok(writes.some((call) => call.path.endsWith("/profiles") && call.body.status === "active")); assert.ok(writes.some((call) => call.path.endsWith("/lead_demo_invitations") && call.body.status === "activated"));
});

test("leadportalpagina bevat auth-fetch, expliciete feedback en geblokkeerde customeronderdelen", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/lead-preview.html"), "utf8");
  assert.match(html, /Authorization:`Bearer \$\{accessToken\}`/); assert.match(html, /action\("feedback"/); assert.match(html, /Demo goedkeuren/); assert.match(html, /Facturen, abonnementen, onboarding/);
  assert.doesNotMatch(html, /localStorage\.getItem\([^)]*lead/i);
});

test("activatiepagina activeert leadscope vóór profielcontrole en routeert naar leadportal", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/account-activeren.html"), "utf8");
  const activate = html.indexOf('body: JSON.stringify({ action: "activate" })'); const profile = html.indexOf("fetchAccountProfile(session.access_token)");
  assert.ok(activate > 0 && profile > activate); assert.match(html, /mode === "lead_demo"\) return "\/lead-preview\.html"/);
});
