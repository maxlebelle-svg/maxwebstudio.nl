const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler } = require("../functions/cockpit-offers");

const WRITE_TOKEN = "cockpit-write-token-that-is-deliberately-longer-than-forty-eight-characters";
const READ_TOKEN = "cockpit-read-token-that-is-deliberately-different-and-long-enough";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const PROFILE_ID = "44444444-4444-4444-8444-444444444444";
const AUTH_ID = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-08-06T09:00:00.000Z");

test("offer bridge is POST-only, server-to-server only and independently authenticated", async () => {
  const handler = createHandler(deps());
  assert.equal((await handler(request({}, { method: "GET", token: WRITE_TOKEN }))).statusCode, 405);
  assert.equal((await handler(request({}, { token: WRITE_TOKEN, origin: "https://max-studio-pilot.base44.app" }))).statusCode, 403);
  assert.equal((await handler(request(baseInput("preview"), { token: READ_TOKEN }))).statusCode, 401);
});

test("preview returns only safe presentation data and a short-lived bound token", async () => {
  const state = fixtures();
  const handler = createHandler(deps(state));
  const result = await handler(request(baseInput("preview"), { token: WRITE_TOKEN }));
  const body = JSON.parse(result.body);

  assert.equal(result.statusCode, 200);
  assert.equal(body.stage, "preview");
  assert.equal(body.recipient.email, "klant@quantumbouw.nl");
  assert.equal(body.preview.subject, "Uw voorstel van Max Webstudio");
  assert.ok(body.previewToken.length > 80);
  assert.equal(state.calls.preview.length, 1);
  assert.equal(state.calls.dispatch.length, 0);
  assert.doesNotMatch(JSON.stringify(body), /cockpit-write-token|sb_secret|interne-notitie/);
});

test("test mail requires a valid preview token and can only go to the verified admin", async () => {
  const state = fixtures();
  const handler = createHandler(deps(state));
  const blocked = await handler(request({ ...baseInput("test"), stageToken: "x".repeat(90) }, { token: WRITE_TOKEN }));
  assert.equal(blocked.statusCode, 409);
  assert.equal(state.calls.dispatch.length, 0);

  const preview = JSON.parse((await handler(request(baseInput("preview"), { token: WRITE_TOKEN }))).body);
  const result = await handler(request({ ...baseInput("test"), stageToken: preview.previewToken }, { token: WRITE_TOKEN }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.sentTo, "max@example.nl");
  assert.ok(body.testToken.length > 80);
  assert.deepEqual(state.calls.dispatch.map((call) => call.kind), ["test"]);
});

test("definitive send requires the test stage and exact typed confirmation", async () => {
  const state = fixtures();
  const handler = createHandler(deps(state));
  const preview = JSON.parse((await handler(request(baseInput("preview"), { token: WRITE_TOKEN }))).body);
  const tested = JSON.parse((await handler(request({ ...baseInput("test"), stageToken: preview.previewToken }, { token: WRITE_TOKEN }))).body);

  const blocked = await handler(request({ ...baseInput("send"), stageToken: tested.testToken, confirmation: "verstuur" }, { token: WRITE_TOKEN }));
  assert.equal(blocked.statusCode, 409);
  assert.deepEqual(state.calls.dispatch.map((call) => call.kind), ["test"]);

  const sent = await handler(request({ ...baseInput("send"), stageToken: tested.testToken, confirmation: "VERSTUUR" }, { token: WRITE_TOKEN }));
  assert.equal(sent.statusCode, 200);
  assert.equal(JSON.parse(sent.body).recipient, "customer");
  assert.deepEqual(state.calls.dispatch.map((call) => call.kind), ["test", "definitive"]);
  assert.equal(state.calls.dispatch[1].input.recipientEmail, undefined);
});

test("demo leads are blocked before any proposal operation runs", async () => {
  const state = fixtures();
  state.lead.environment = "demo";
  const handler = createHandler(deps(state));
  const result = await handler(request(baseInput("preview"), { token: WRITE_TOKEN }));
  assert.equal(result.statusCode, 403);
  assert.equal(JSON.parse(result.body).code, "DEMO_SEND_BLOCKED");
  assert.equal(state.calls.preview.length, 0);
  assert.equal(state.calls.dispatch.length, 0);
});

function deps(state = fixtures(), envPatch = {}) {
  return {
    now: () => NOW,
    env: {
      COCKPIT_WRITE_TOKEN: WRITE_TOKEN,
      COCKPIT_READ_TOKEN: READ_TOKEN,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_COCKPIT_SECRET_KEY: "sb_secret_cockpit_test_key",
      ADMIN_EMAIL: "max@example.nl",
      ...envPatch,
    },
    fetchImpl: async (url) => {
      const table = new URL(url).pathname.split("/").pop();
      if (table === "leads") return response([state.lead]);
      if (table === "commercial_offers") return response([state.offer]);
      if (table === "profiles") return response([state.actor]);
      return response([], 404);
    },
    operations: {
      config: () => ({ ready: true, url: "https://example.supabase.co", key: "hidden" }),
      preview: async (input, actor) => {
        state.calls.preview.push({ input, actor });
        return netlify({ success: true, preview: { subject: "Uw voorstel van Max Webstudio", text: "Controleer uw voorstel.", desktopUrl: "https://maxwebstudio.nl/voorstel/veilig", validUntil: "2026-08-20" } });
      },
      dispatch: async (kind, input, actor) => {
        state.calls.dispatch.push({ kind, input, actor });
        return netlify({ success: true, duplicate: false });
      },
    },
  };
}

function fixtures() {
  return {
    lead: { id: LEAD_ID, company_name: "QuantumBouw", contact_name: "Q. Bouwer", email: "klant@quantumbouw.nl", internal_notes: "interne-notitie" },
    offer: { id: OFFER_ID, title: "Business Website", status: "ready_for_review", relationship_type: "lead", relationship_id: LEAD_ID, current_version_id: VERSION_ID },
    actor: { id: PROFILE_ID, auth_user_id: AUTH_ID, email: "max@example.nl", role: "admin", status: "active" },
    calls: { preview: [], dispatch: [] },
  };
}

function baseInput(action) {
  return { action, offerId: OFFER_ID, offerVersionId: VERSION_ID, leadId: LEAD_ID, actionKey: `cockpit:${action}:1234567890` };
}

function request(body, { method = "POST", token = "", origin = "" } = {}) {
  return { httpMethod: method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}) }, body: JSON.stringify(body) };
}

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
function netlify(body, statusCode = 200) { return { statusCode, body: JSON.stringify(body) }; }
