const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { _test } = require("../functions/admin-lead-demo-invitation");

const IDS = {
  lead: "11111111-1111-4111-8111-111111111111",
  journey: "22222222-2222-4222-8222-222222222222",
  user: "33333333-3333-4333-8333-333333333333",
  profile: "44444444-4444-4444-8444-444444444444",
  action: "55555555-5555-4555-8555-555555555555",
  invitation: "66666666-6666-4666-8666-666666666666",
  outbox: "77777777-7777-4777-8777-777777777777",
  preview: "99999999-9999-4999-8999-999999999999",
};

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body === null ? "" : JSON.stringify(body) };
}

function fixture(options = {}) {
  const calls = [];
  const mailCalls = [];
  const existingUser = options.existingUser !== false;
  const lead = options.lead === null ? null : {
    id: IDS.lead,
    email: "lisanne@example.test",
    contact_name: "Lisanne Post",
    company_name: "Advies Post",
    ...(options.lead || {}),
  };
  const journey = options.journey === null ? null : {
    id: IDS.journey,
    lead_id: IDS.lead,
    preview_url: "https://maxwebstudio.nl/demo-preview.html?id=abc",
    preview_approved_at: "2026-07-14T10:00:00.000Z",
    ...(options.journey || {}),
  };
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, path: parsed.pathname, method: init.method || "GET", body });
    if (parsed.pathname.endsWith("/rest/v1/leads")) return reply(200, lead ? [lead] : []);
    if (parsed.pathname.endsWith("/rest/v1/demo_journeys")) return reply(200, journey ? [journey] : []);
    if (parsed.pathname.endsWith("/rest/v1/public_preview_publications")) return reply(200, options.publication === null ? [] : [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", relationship_type: "lead", relationship_id: IDS.lead, public_slug: "advies-post", preview_version_id: options.publishedPreviewVersionId || IDS.preview, enabled: true, revoked_at: null }]);
    if (parsed.pathname.endsWith("/rest/v1/website_preview_versions")) return reply(200, options.previewVersion === null ? [] : [{ id: IDS.preview, demo_journey_id: IDS.journey, build_job_id: options.legacyFactory ? IDS.preview : null, version: options.previewVersionNumber || 4, preview_url: "https://maxwebstudio.nl/.netlify/functions/demo-preview?id=abc", metadata: options.legacyFactory ? { editorManifestAvailable: true } : { previewSource: options.previewSource || "website_factory" }, status: "internal", generated_package: { files: [{ path: "index.html" }], meta: options.legacyFactory ? { editorManifest: { version: 1 } } : {} } }]);
    if (parsed.pathname.endsWith("/rest/v1/lead_demo_invitations") && (init.method || "GET") === "GET") {
      if (parsed.searchParams.has("id")) return reply(200, [{ id: IDS.invitation, lead_id: IDS.lead, demo_journey_id: IDS.journey, status: options.invitationStatus || "planned", metadata: options.invitationMetadata || {} }]);
      return reply(200, options.invitationStatus ? [{ id: IDS.invitation, lead_id: IDS.lead, demo_journey_id: IDS.journey, status: options.invitationStatus, metadata: options.invitationMetadata || {} }] : []);
    }
    if (parsed.pathname.endsWith("/auth/v1/admin/users")) return reply(200, { users: existingUser ? [{ id: IDS.user, email: "lisanne@example.test", email_confirmed_at: options.active ? "2026-07-01" : null }] : [] });
    if (parsed.pathname.endsWith("/auth/v1/admin/generate_link")) return reply(200, { action_link: "https://example.supabase.co/auth/v1/verify?token=secret", user: { id: IDS.user, email: "lisanne@example.test" } });
    if (parsed.pathname.endsWith("/rest/v1/profiles") && (init.method || "GET") === "GET") return reply(200, options.profile ? [options.profile] : []);
    if (parsed.pathname.endsWith("/rest/v1/profiles") && init.method === "POST") return reply(201, [{ id: IDS.profile, auth_user_id: IDS.user, role: "demo_user", status: "invited" }]);
    if (parsed.pathname.endsWith("/rest/v1/rpc/plan_lead_demo_invitation")) {
      if (options.rpcFailure) return reply(500, { code: "P0001", message: "outbox unavailable" });
      return reply(200, [{ invitation_id: IDS.invitation, outbox_id: IDS.outbox, duplicate: Boolean(options.duplicate) }]);
    }
    if (init.method === "DELETE") return reply(204, null);
    if (parsed.pathname.endsWith("/rest/v1/lead_demo_invitations") && init.method === "PATCH") {
      if (options.persistFailure && body.metadata) return reply(500, { code: "P0001", message: "metadata unavailable" });
      return reply(200, [{ id: IDS.invitation, lead_id: IDS.lead, demo_journey_id: IDS.journey, status: body.status || options.invitationStatus || "planned", metadata: body.metadata || options.invitationMetadata || {} }]);
    }
    if (init.method === "PATCH") return reply(200, [{}]);
    throw new Error(`Unexpected request: ${init.method || "GET"} ${url}`);
  };
  const handler = _test.createHandler({ fetchImpl, verifyAdmin: async () => ({ success: true, admin: { id: IDS.user, email: "admin@example.test" } }), sendMail: async (input) => { mailCalls.push(input); return options.mailFailure ? { sent: false, errorCode: "provider_timeout" } : { sent: true, id: "resend-message-1" }; }, now: () => new Date("2026-07-14T12:00:00.000Z") });
  return { calls, mailCalls, handler };
}

function event(payload = {}) {
  return { httpMethod: "POST", headers: { authorization: "Bearer test" }, body: JSON.stringify({ leadId: IDS.lead, demoJourneyId: IDS.journey, previewVersionId: IDS.preview, actionKey: IDS.action, action: "invite", ...payload }) };
}

async function run(options, payload) {
  const state = fixture(options);
  const previous = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role", SITE_URL: "https://maxwebstudio.nl", FROM_EMAIL: "Max Webstudio <info@maxwebstudio.nl>" });
  try { return { state, response: await state.handler(event(payload)) }; }
  finally { process.env = previous; }
}

test("lead met goedgekeurde demo wordt duurzaam gepland zonder direct mail te versturen", async () => {
  const { state, response } = await run({});
  assert.equal(response.statusCode, 202);
  const body = JSON.parse(response.body);
  assert.equal(body.status, "planned");
  assert.equal(body.emailSent, false);
  assert.equal(state.calls.filter((call) => call.path.includes("resend.com")).length, 0);
  assert.equal(state.calls.filter((call) => call.path.endsWith("plan_lead_demo_invitation")).length, 1);
});

test("lead zonder demo, preview of goedkeuring kan niet worden uitgenodigd", async () => {
  assert.equal((await run({ journey: null })).response.statusCode, 422);
  assert.equal(JSON.parse((await run({ journey: { preview_url: "" } })).response.body).code, "DEMO_PREVIEW_MISSING");
  assert.equal(JSON.parse((await run({ journey: { preview_approved_at: "" } })).response.body).code, "DEMO_NOT_READY");
});

test("lead zonder geldig e-mailadres kan niet worden uitgenodigd", async () => {
  const { response } = await run({ lead: { email: "ongeldig" } });
  assert.equal(response.statusCode, 422);
  assert.equal(JSON.parse(response.body).code, "LEAD_EMAIL_INVALID");
});

test("bestaande auth-user en profile worden hergebruikt en niet gedupliceerd", async () => {
  const profile = { id: IDS.profile, auth_user_id: IDS.user, role: "demo_user", status: "active", metadata: {} };
  const { state, response } = await run({ existingUser: true, profile });
  assert.equal(response.statusCode, 202);
  assert.equal(JSON.parse(response.body).createdAuthUser, false);
  assert.equal(JSON.parse(response.body).createdProfile, false);
  assert.equal(state.calls.filter((call) => call.path.endsWith("/auth/v1/admin/generate_link"))[0].body.type, "recovery");
});

test("nieuwe leadidentiteit gebruikt invite, demo_user en invited zonder customerrecord", async () => {
  const { state, response } = await run({ existingUser: false });
  assert.equal(response.statusCode, 202);
  const profileWrite = state.calls.find((call) => call.path.endsWith("/rest/v1/profiles") && call.method === "POST");
  assert.equal(profileWrite.body.role, "demo_user");
  assert.equal(profileWrite.body.status, "invited");
  assert.equal(state.calls.some((call) => call.path.endsWith("/rest/v1/customers")), false);
});

test("resend gebruikt dezelfde identiteit, recovery-link en nieuwe expliciete action key", async () => {
  const profile = { id: IDS.profile, auth_user_id: IDS.user, role: "demo_user", status: "active", metadata: {} };
  const nextAction = "88888888-8888-4888-8888-888888888888";
  const { state, response } = await run({ existingUser: true, profile }, { action: "resend", actionKey: nextAction });
  assert.equal(response.statusCode, 202);
  const rpc = state.calls.find((call) => call.path.endsWith("plan_lead_demo_invitation"));
  assert.equal(rpc.body.p_action_key, nextAction);
  assert.equal(rpc.body.p_action_type, "resend");
  assert.equal(state.calls.find((call) => call.path.endsWith("generate_link")).body.type, "recovery");
});

test("uitnodiging koppelt exact de geselecteerde ZIP-preview duurzaam aan het bestaande invitationrecord", async () => {
  const { state, response } = await run({ previewSource: "manual_zip", previewVersionNumber: 7 });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 202);
  assert.equal(body.previewVersionId, IDS.preview);
  assert.equal(body.previewSource, "manual_zip");
  const invitationPatch = state.calls.find((call) => call.path.endsWith("/rest/v1/lead_demo_invitations") && call.method === "PATCH" && call.body.metadata);
  assert.equal(invitationPatch.body.metadata.portalPreview.previewVersionId, IDS.preview);
  assert.equal(invitationPatch.body.metadata.portalPreview.previewSource, "manual_zip");
  assert.equal(invitationPatch.body.metadata.portalPreview.version, 7);
});

test("uitnodiging koppelt exact de geselecteerde Factory-preview zonder duplicate preview", async () => {
  const { state, response } = await run({ previewSource: "website_factory" });
  assert.equal(response.statusCode, 202);
  assert.equal(JSON.parse(response.body).previewVersionId, IDS.preview);
  assert.equal(state.calls.filter((call) => call.path.endsWith("/rest/v1/website_preview_versions") && call.method === "POST").length, 0);
  assert.equal(state.calls.filter((call) => call.path.endsWith("/rest/v1/website_preview_versions") && call.method === "GET").length, 1);
});

test("uitnodiging koppelt een legacy Factory V4 via dezelfde bronresolver", async () => {
  const { state, response } = await run({ legacyFactory: true });
  assert.equal(response.statusCode, 202);
  const body = JSON.parse(response.body);
  assert.equal(body.previewVersionId, IDS.preview);
  assert.equal(body.previewSource, "website_factory");
  assert.equal(state.calls.some((call) => call.path.endsWith("/rest/v1/customers")), false);
});

test("publieke pointer moet exact overeenkomen met de geselecteerde preview", async () => {
  const { response } = await run({ publishedPreviewVersionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).code, "PREVIEW_POINTER_MISMATCH");
});

test("zonder actieve publieke demo stopt uitnodigen vóór identity- of customeraanmaak", async () => {
  const { state, response } = await run({ publication: null });
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).code, "PUBLIC_PREVIEW_REQUIRED");
  assert.equal(state.calls.some((call) => call.path.startsWith("/auth/v1/admin")), false);
  assert.equal(state.calls.some((call) => call.path.endsWith("/rest/v1/customers")), false);
});

test("planning logt de journey-timeline en bewaart exact previewVersionId in de effectpayload", async () => {
  const { state, response } = await run({});
  assert.equal(response.statusCode, 202);
  const rpc = state.calls.find((call) => call.path.endsWith("/rest/v1/rpc/plan_lead_demo_invitation"));
  assert.match(rpc.body.p_event_key, /^lead\.demo_invitation_planned:/);
  assert.equal(rpc.body.p_effect_payload.previewVersionId, IDS.preview);
  assert.equal(rpc.body.p_effect_payload.demoJourneyId, IDS.journey);
});

test("herhaalde action key wordt als duplicate beantwoord en blijft één outboxplanning", async () => {
  const { response } = await run({ duplicate: true });
  assert.equal(response.statusCode, 202);
  assert.equal(JSON.parse(response.body).duplicate, true);
});

test("interne profielrol kan niet via een leaduitnodiging worden overgenomen", async () => {
  const profile = { id: IDS.profile, auth_user_id: IDS.user, role: "admin", status: "active", metadata: {} };
  const { response } = await run({ existingUser: true, profile });
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).code, "IDENTITY_ROLE_CONFLICT");
});

test("falende duurzame planning compenseert uitsluitend nieuw aangemaakte identityrecords", async () => {
  const { state, response } = await run({ existingUser: false, rpcFailure: true });
  assert.equal(response.statusCode, 503);
  const deletes = state.calls.filter((call) => call.method === "DELETE");
  assert.equal(deletes.length, 2);
  assert.ok(deletes.some((call) => call.path.endsWith(`/auth/v1/admin/users/${IDS.user}`)));
  assert.ok(deletes.some((call) => call.path.endsWith("/rest/v1/profiles")));
});

test("fout na duurzame outboxplanning verwijdert geen reeds gekoppelde identiteit", async () => {
  const { state, response } = await run({ existingUser: false, persistFailure: true });
  assert.equal(response.statusCode, 503);
  assert.equal(state.calls.some((call) => call.path.endsWith("plan_lead_demo_invitation")), true);
  assert.equal(state.calls.filter((call) => call.method === "DELETE").length, 0);
});

test("leaduitnodiging bevat aparte multipart template zonder wachtwoord", () => {
  const mail = _test.buildLeadDemoInvitationMail({ contactName: "Lisanne", companyName: "Advies Post", activationUrl: "https://example.supabase.co/verify?token=secret", previewUrl: "https://maxwebstudio.nl/preview.html", supportEmail: "info@maxwebstudio.nl" });
  assert.match(mail.subject, /website-demo/i);
  assert.match(mail.html, /Bekijk je website-demo/);
  assert.match(mail.text, /vrijblijvend/i);
  assert.doesNotMatch(`${mail.html}${mail.text}`, /jouw wachtwoord is|password:/i);
});

test("migratie is additief, service-role-only en plant event plus outbox atomisch", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260714173000_lead_demo_account_invitations.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.lead_demo_invitations/);
  assert.match(sql, /unique \(normalized_email\)/);
  assert.match(sql, /record_journey_event_and_enqueue/);
  assert.match(sql, /email\.lead_demo_invitation/);
  assert.match(sql, /revoke all[\s\S]*anon, authenticated/);
  assert.doesNotMatch(sql, /\b(drop|truncate|delete\s+from)\b/i);
});

test("productieverzending gebeurt pas na outboxplanning en maximaal één keer per action key", async () => {
  const previous = { ...process.env }; const state = fixture({});
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role", SITE_URL: "https://maxwebstudio.nl", FROM_EMAIL: "Max Webstudio <info@maxwebstudio.nl>", APP_ENV: "production", LEAD_DEMO_INVITATION_EMAIL_ENABLED: "on", RESEND_DOMAIN_VERIFIED: "true" });
  try {
    const response = await state.handler(event()); const body = JSON.parse(response.body);
    assert.equal(body.status, "sent"); assert.equal(state.mailCalls.length, 1);
    const rpcIndex = state.calls.findIndex((call) => call.path.endsWith("plan_lead_demo_invitation"));
    const firstPatchIndex = state.calls.findIndex((call) => call.method === "PATCH");
    assert.ok(rpcIndex >= 0 && firstPatchIndex > rpcIndex);
  } finally { process.env = previous; }
});

test("duplicate planning verstuurt niet opnieuw en testomgeving verstuurt nooit live", async () => {
  const duplicate = await run({ duplicate: true }); assert.equal(duplicate.state.mailCalls.length, 0);
  const normal = await run({}); assert.equal(normal.state.mailCalls.length, 0);
});

test("productieflag alleen verstuurt niets zolang afzenderverificatie niet expliciet gereed is", async () => {
  const previous = { ...process.env }; const state = fixture({});
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role", SITE_URL: "https://maxwebstudio.nl", FROM_EMAIL: "Max Webstudio <info@maxwebstudio.nl>", APP_ENV: "production", LEAD_DEMO_INVITATION_EMAIL_ENABLED: "on", RESEND_DOMAIN_VERIFIED: "false" });
  try { const response = await state.handler(event()); assert.equal(JSON.parse(response.body).status, "planned"); assert.equal(state.mailCalls.length, 0); }
  finally { process.env = previous; }
});

test("statusroute toont not_invited of actuele begrensde status en afzenderwaarschuwing", async () => {
  const previous = { ...process.env }; const state = fixture({ invitationStatus: "sent" });
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role", FROM_EMAIL: "Max Webstudio <info@maxwebstudio.nl>", RESEND_DOMAIN_VERIFIED: "false" });
  try {
    const response = await state.handler({ httpMethod: "GET", headers: { authorization: "Bearer test" }, queryStringParameters: { leadId: IDS.lead } }); const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200); assert.equal(body.status, "sent"); assert.equal(body.sender.ready, false); assert.match(body.sender.warning, /niet als geverifieerd/i);
  } finally { process.env = previous; }
});
