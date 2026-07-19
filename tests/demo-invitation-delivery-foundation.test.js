const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildDemoInvitationTemplate,
  invitationIdentity,
  recordDemoPreviewOpen,
  sendDemoInvitation,
} = require("../functions/services/demoInvitationService");

const root = path.join(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260719190000_create_demo_invitation_delivery_foundation.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const ids = {
  journey: "11111111-1111-4111-8111-111111111111",
  preview: "22222222-2222-4222-8222-222222222222",
  lead: "33333333-3333-4333-8333-333333333333",
  owner: "44444444-4444-4444-8444-444444444444",
  log: "55555555-5555-4555-8555-555555555555",
};

test("official migration creates only durable mail and preview-access storage without provider behavior", () => {
  assert.match(migration, /begin;[\s\S]*create table public\.email_logs[\s\S]*create table public\.demo_preview_accesses[\s\S]*commit;/i);
  assert.doesNotMatch(migration, /api\.resend\.com|net\.http|http_post|mollie|stripe|yxxahurphdbblkuxoeje|xlxpuuycigeqhgxqtzni/i);
  assert.match(migration, /unique \(idempotency_key\)/i);
  assert.match(migration, /unique \(demo_journey_id, preview_version_id, tracking_key\)/i);
  for (const column of ["demo_journey_id", "preview_version_id", "preview_checksum", "preview_token_fingerprint", "public_reference", "template_version", "normalized_recipient_email", "attempt_count", "provider_metadata"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`, "i"));
  }
  for (const status of ["planned", "sending", "sent", "failed", "delivery_unknown", "cancelled"]) assert.match(migration, new RegExp(`'${status}'`));
});

test("migration uses bounded service-role RPCs, safe search paths, RLS and immutable snapshots", () => {
  for (const fn of ["plan_demo_invitation", "claim_demo_invitation", "complete_demo_invitation", "record_demo_preview_open"]) {
    assert.match(migration, new RegExp(`create function public\\.${fn}[\\s\\S]*?security definer set search_path = pg_catalog`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}`, "i"));
  }
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /no_direct_client_access/gi);
  assert.match(migration, /Demo invitation snapshots are immutable/i);
  assert.match(migration, /where (?:logs\.)?id=input_email_log_id and (?:logs\.)?message_type='demo_preview_invitation' and (?:logs\.)?status='planned'/i);
  assert.match(migration, /status <> 'sending' or log_record\.claim_token_hash/i);
  assert.match(migration, /delivery_unknown/i);
});

test("idempotency canonicalization normalizes email and changes for every logical dimension", () => {
  const base = { journeyId: ids.journey, previewVersionId: ids.preview, templateId: "demo_preview_invitation", templateVersion: 1, recipient: " Demo@Example.TEST " };
  const normalized = invitationIdentity(base);
  assert.equal(normalized.idempotencyKey, invitationIdentity({ ...base, recipient: "demo@example.test" }).idempotencyKey);
  assert.notEqual(normalized.idempotencyKey, invitationIdentity({ ...base, templateVersion: 2 }).idempotencyKey);
  assert.notEqual(normalized.idempotencyKey, invitationIdentity({ ...base, previewVersionId: ids.owner }).idempotencyKey);
  assert.notEqual(normalized.idempotencyKey, invitationIdentity({ ...base, recipient: "other@example.test" }).idempotencyKey);
  assert.match(normalized.idempotencyKey, /^[0-9a-f]{64}$/);
  assert.match(normalized.publicReference, /^[0-9a-f]{64}$/);
});

test("Dutch invitation has one primary CTA, fallback link and personal-link warning", () => {
  const template = buildDemoInvitationTemplate({ businessName: "Voorbeeld BV", contactName: "Sanne", previewUrl: "https://example.test/preview?token=x&invitation=y" });
  assert.match(template.subject, /persoonlijke demo/i);
  assert.match(template.text, /Beste Sanne/);
  assert.match(template.text, /link is persoonlijk/i);
  assert.equal((template.html.match(/class="mws-cta"/g) || []).length, 1);
  assert.equal((template.html.match(/https:\/\/example\.test\/preview\?token=x&amp;invitation=y/g) || []).length, 3);
  assert.doesNotMatch(template.html, /journey.?id|previewversion.?id|service.role/i);
});

test("first request sends once and identical retry returns already_sent", async () => {
  const fake = fakeDeliveryDatabase();
  let providerCalls = 0;
  const sendProvider = async () => ({ sent: true, id: `provider-${++providerCalls}` });
  const first = await sendDemoInvitation(request(), { fetch: fake.fetch, sendProvider });
  const retry = await sendDemoInvitation(request({ recipient: " LEAD@EXAMPLE.TEST " }), { fetch: fake.fetch, sendProvider });
  assert.equal(first.state, "sent");
  assert.equal(retry.state, "already_sent");
  assert.equal(providerCalls, 1);
  assert.equal(fake.logs.size, 1);
  assert.equal(fake.workflowUpdates, 1);
});

test("concurrent identical requests obtain at most one provider claim", async () => {
  const fake = fakeDeliveryDatabase();
  let providerCalls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sendProvider = async () => { providerCalls += 1; await gate; return { sent: true, id: "provider-concurrent" }; };
  const firstPromise = sendDemoInvitation(request(), { fetch: fake.fetch, sendProvider });
  await new Promise((resolve) => setImmediate(resolve));
  const second = await sendDemoInvitation(request(), { fetch: fake.fetch, sendProvider });
  assert.equal(second.state, "already_processing");
  release();
  const first = await firstPromise;
  assert.equal(first.state, "sent");
  assert.equal(providerCalls, 1);
});

test("definitive provider failure is terminal and does not mark sales workflow successful", async () => {
  const fake = fakeDeliveryDatabase();
  const result = await sendDemoInvitation(request(), { fetch: fake.fetch, sendProvider: async () => ({ sent: false, deliveryUnknown: false, errorCode: "invalid_recipient", warning: "Rejected" }) });
  const retry = await sendDemoInvitation(request(), { fetch: fake.fetch, sendProvider: async () => { throw new Error("must not run"); } });
  assert.equal(result.state, "failed");
  assert.equal(retry.state, "not_retryable");
  assert.equal(fake.workflowUpdates, 0);
});

test("ambiguous provider outcome blocks automatic retry", async () => {
  const fake = fakeDeliveryDatabase();
  let calls = 0;
  const first = await sendDemoInvitation(request(), { fetch: fake.fetch, sendProvider: async () => { calls += 1; return { sent: false, deliveryUnknown: true, errorCode: "timeout", warning: "Timeout" }; } });
  const retry = await sendDemoInvitation(request(), { fetch: fake.fetch, sendProvider: async () => { calls += 1; return { sent: true, id: "forbidden" }; } });
  assert.equal(first.state, "delivery_unknown");
  assert.equal(retry.state, "delivery_unknown");
  assert.equal(calls, 1);
});

test("failure to persist provider success returns unknown and cannot issue a second claim", async () => {
  const fake = fakeDeliveryDatabase({ failCompleteOnce: true });
  let calls = 0;
  const first = await sendDemoInvitation(request(), { fetch: fake.fetch, sendProvider: async () => ({ sent: true, id: `provider-${++calls}` }) });
  const retry = await sendDemoInvitation(request(), { fetch: fake.fetch, sendProvider: async () => ({ sent: true, id: `provider-${++calls}` }) });
  assert.equal(first.state, "delivery_unknown");
  assert.equal(first.errorCode, "PROVIDER_RESULT_PERSISTENCE_FAILED");
  assert.equal(retry.state, "already_processing");
  assert.equal(calls, 1);
});

test("validation rejects missing active preview, changed expected version and recipient mismatch before provider", async () => {
  await assert.rejects(() => sendDemoInvitation(request(), { fetch: fakeDeliveryDatabase({ noPreview: true }).fetch, sendProvider: forbiddenProvider }), /geen actieve previewversie/i);
  await assert.rejects(() => sendDemoInvitation(request({ previewVersionId: ids.owner }), { fetch: fakeDeliveryDatabase().fetch, sendProvider: forbiddenProvider }), /previewversie is gewijzigd/i);
  await assert.rejects(() => sendDemoInvitation(request({ recipient: "wrong@example.test" }), { fetch: fakeDeliveryDatabase().fetch, sendProvider: forbiddenProvider }), /Ontvanger hoort niet/i);
});

test("preview-open RPC failures never block the caller and no plaintext token is sent", async () => {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, body: options.body });
    return response(500, { message: "temporary" });
  };
  const result = await recordDemoPreviewOpen({ config: config(), journeyId: ids.journey, previewToken: "plaintext-secret-token", invitationReference: "opaque" }, { fetch });
  assert.equal(result.recorded, false);
  assert.doesNotMatch(calls[0].body, /plaintext-secret-token/);
  assert.match(calls[0].body, /[0-9a-f]{64}/);
});

test("service responses never expose database credentials", async () => {
  const fake = fakeDeliveryDatabase();
  const result = await sendDemoInvitation(request(), { fetch: fake.fetch, sendProvider: async () => ({ sent: true, id: "provider-safe" }) });
  assert.doesNotMatch(JSON.stringify(result), /service-secret|supabase\.co/i);
});

test("public preview records only valid active-token opens and rendering survives registration failure", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalAdmin = process.env.ADMIN_TOKEN;
  process.env.SUPABASE_URL = "https://staging.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
  process.env.ADMIN_TOKEN = "legacy-admin-secret";
  let rpcCalls = 0;
  global.fetch = async (url) => {
    if (url.includes("/rest/v1/demo_journeys?")) return response(200, [{
      id: ids.journey, business_name: "Voorbeeld BV", preview_token: "active-token",
      preview_package: { files: [{ path: "index.html", content: "<!doctype html><title>Veilige preview</title><h1>Preview</h1>" }] },
    }]);
    if (url.endsWith("/rpc/record_demo_preview_open")) { rpcCalls += 1; return response(500, { message: "temporary" }); }
    throw new Error(`Unexpected preview URL: ${url}`);
  };
  delete require.cache[require.resolve("../functions/demo-preview")];
  const { handler } = require("../functions/demo-preview");
  try {
    const valid = await handler(previewEvent("active-token"));
    const wrong = await handler(previewEvent("wrong-token"));
    const missing = await handler(previewEvent(""));
    const old = await handler(previewEvent("old-inactive-token"));
    assert.equal(valid.statusCode, 200);
    assert.match(valid.body, /Veilige preview/);
    assert.equal(wrong.statusCode, 403);
    assert.equal(missing.statusCode, 403);
    assert.equal(old.statusCode, 403);
    assert.equal(rpcCalls, 1);
  } finally {
    global.fetch = originalFetch;
    restoreEnv("SUPABASE_URL", originalUrl);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalKey);
    restoreEnv("ADMIN_TOKEN", originalAdmin);
  }
});

function request(overrides = {}) {
  return { config: config(), journeyId: ids.journey, previewVersionId: ids.preview, recipient: "lead@example.test", templateId: "demo_preview_invitation", templateVersion: 1, createdBy: "system:test-admin", requestingUserId: ids.owner, ...overrides };
}

function config() { return { supabaseUrl: "https://staging.example.test", serviceRoleKey: "service-secret" }; }
async function forbiddenProvider() { throw new Error("provider must not be called"); }

function fakeDeliveryDatabase(options = {}) {
  const logs = new Map();
  let workflowUpdates = 0;
  let failCompleteOnce = Boolean(options.failCompleteOnce);
  const journey = { id: ids.journey, lead_id: ids.lead, customer_id: null, business_name: "Internal Lead BV", contact_name: "Test Lead", email: "lead@example.test", preview_url: `/.netlify/functions/demo-preview?id=${ids.journey}&token=current-token`, preview_token: "current-token" };
  const preview = { id: ids.preview, demo_journey_id: ids.journey, version: 2, preview_url: journey.preview_url, preview_token: journey.preview_token, package_checksum: "a".repeat(64), is_active: true };

  const fetch = async (url, init = {}) => {
    if (url.includes("/demo_journeys?")) return response(200, [journey]);
    if (url.includes("/website_preview_versions?")) return response(200, options.noPreview ? [] : [preview]);
    const body = JSON.parse(init.body || "{}");
    if (url.endsWith("/rpc/plan_demo_invitation")) {
      let log = logs.get(body.input_idempotency_key);
      let created = false;
      if (!log) {
        created = true;
        log = { email_log_id: ids.log, status: "planned", owner_user_id: ids.owner, preview_url: `${preview.preview_url}&invitation=${body.input_public_reference}`, public_reference: body.input_public_reference, provider_message_id: null, claimToken: "" };
        logs.set(body.input_idempotency_key, log);
      }
      return response(200, [{ ...log, created }]);
    }
    if (url.endsWith("/rpc/claim_demo_invitation")) {
      const log = [...logs.values()].find((item) => item.email_log_id === body.input_email_log_id);
      if (log.status === "planned") { log.status = "sending"; log.claimToken = body.input_claim_token; return response(200, [{ ...log, claimed: true, attempt_count: 1 }]); }
      return response(200, [{ ...log, claimed: false, attempt_count: 1 }]);
    }
    if (url.endsWith("/rpc/complete_demo_invitation")) {
      if (failCompleteOnce) { failCompleteOnce = false; return response(500, { message: "write failed" }); }
      const log = [...logs.values()].find((item) => item.email_log_id === body.input_email_log_id);
      assert.equal(log.claimToken, body.input_claim_token);
      log.status = body.input_outcome;
      log.provider_message_id = body.input_provider_message_id;
      if (log.status === "sent") workflowUpdates += 1;
      return response(200, [{ ...log, sent_at: log.status === "sent" ? new Date().toISOString() : null }]);
    }
    throw new Error(`Unexpected fake URL: ${url}`);
  };
  return { fetch, logs, get workflowUpdates() { return workflowUpdates; } };
}

function response(status, data) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(data); } };
}

function previewEvent(token) {
  return { httpMethod: "GET", path: "/.netlify/functions/demo-preview", headers: {}, queryStringParameters: { id: ids.journey, ...(token ? { token } : {}) } };
}

function restoreEnv(key, value) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
