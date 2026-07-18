const test = require("node:test");
const assert = require("node:assert/strict");

const publication = require("../functions/admin-preview-publication");
const { buildPublicDemoShareMail } = require("../functions/services/leadDemoInvitationTemplate");

const IDS = {
  lead: "11111111-1111-4111-8111-111111111111",
  journey: "22222222-2222-4222-8222-222222222222",
  preview: "33333333-3333-4333-8333-333333333333",
  action: "44444444-4444-4444-8444-444444444444",
};

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

async function run(options = {}) {
  const calls = [];
  const mailCalls = [];
  const previousFetch = global.fetch;
  const previousEnv = { ...process.env };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  global.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method || "GET";
    calls.push({ path: parsed.pathname, method, query: parsed.searchParams, body: init.body ? JSON.parse(init.body) : null });
    if (parsed.pathname.endsWith("/public_preview_publications")) return response(200, [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", relationship_type: "lead", relationship_id: IDS.lead, public_slug: "advies-post", preview_version_id: options.publicationPreviewId || IDS.preview, enabled: true, revoked_at: null, updated_at: "2026-07-18" }]);
    if (parsed.pathname.endsWith("/leads")) return response(200, [{ id: IDS.lead, company_name: "Advies Post", contact_name: "Lisanne Post", email: options.email === undefined ? "lisanne@example.test" : options.email, status: "new", lead_status: "interest" }]);
    if (parsed.pathname.endsWith("/website_preview_versions")) return response(200, [{ id: IDS.preview, demo_journey_id: IDS.journey, version: 4, status: "internal", generated_package: { files: [{ path: "index.html", content: "<h1>Demo</h1>" }] }, metadata: { previewSource: "website_factory" } }]);
    if (parsed.pathname.endsWith("/demo_journeys")) return response(200, [{ id: IDS.journey, lead_id: IDS.lead }]);
    throw new Error(`Unexpected ${method} ${url}`);
  };
  try {
    const result = await publication._private.sharePublicPreviewEmail({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service",
      admin: { id: "admin", email: "admin@example.test", role: "admin" },
      sendMail: async (input) => { mailCalls.push(input); return options.mailFailure ? { sent: false, warning: "Provider niet beschikbaar" } : { sent: true, id: "mail-1", logId: "log-1" }; },
    }, {
      relationshipType: "lead",
      relationshipId: IDS.lead,
      previewVersionId: IDS.preview,
      actionKey: IDS.action,
    });
    return { calls, mailCalls, result, error: null };
  } catch (error) {
    return { calls, mailCalls, result: null, error };
  } finally {
    global.fetch = previousFetch;
    process.env = previousEnv;
  }
}

test("publieke demo-e-mail gebruikt de bestaande getrackte mailarchitectuur en korte link", async () => {
  const state = await run();
  assert.equal(state.error, null);
  assert.equal(state.result.statusCode, 200);
  assert.equal(state.mailCalls.length, 1);
  assert.equal(state.mailCalls[0].templateKey, "public_preview_share");
  assert.equal(state.mailCalls[0].leadId, IDS.lead);
  assert.equal(state.mailCalls[0].metadata.previewVersionId, IDS.preview);
  assert.match(state.mailCalls[0].html, /https:\/\/maxwebstudio\.nl\/preview\/advies-post/);
});

test("publieke demo-e-mail weigert een afwijkende publicatiepointer vóór verzending", async () => {
  const state = await run({ publicationPreviewId: "55555555-5555-4555-8555-555555555555" });
  assert.equal(state.error.code, "PREVIEW_POINTER_MISMATCH");
  assert.equal(state.mailCalls.length, 0);
});

test("publieke demo-e-mail vereist het echte relatie-e-mailadres", async () => {
  const state = await run({ email: "" });
  assert.equal(state.error.code, "PREVIEW_SHARE_EMAIL_INVALID");
  assert.equal(state.mailCalls.length, 0);
});

test("delen maakt geen customer, account, approval of payment write", async () => {
  const state = await run();
  assert.equal(state.error, null);
  assert.equal(state.calls.some((call) => call.path.endsWith("/customers")), false);
  assert.equal(state.calls.some((call) => call.path.includes("/auth/v1/")), false);
  assert.equal(state.calls.some((call) => ["POST", "PATCH", "DELETE"].includes(call.method)), false);
});

test("publieke demo-mail benoemt dat openbare weergave geen goedkeuring of betaling registreert", () => {
  const mail = buildPublicDemoShareMail({ contactName: "Lisanne", companyName: "Advies Post", previewUrl: "https://maxwebstudio.nl/preview/advies-post" });
  assert.match(mail.text, /Ik hoor graag wat u ervan vindt/);
  assert.match(mail.html, /registreert geen goedkeuring of betaling/);
  assert.doesNotMatch(mail.html, /account activeren|wachtwoord/i);
});
