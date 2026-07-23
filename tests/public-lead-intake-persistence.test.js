const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const backendSource = fs.readFileSync(path.join(root, "functions/send-lead.js"), "utf8");
const frontendSource = fs.readFileSync(path.join(root, "public/script.js"), "utf8");
const frontendHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const browserValidation = require("../public/src/lead-intake-validation");
const { createHandler, leadIdempotencyKey, leadRpcPayload, persistLead } = require("../functions/send-lead")._private;

const lead = {
  name: "Ada Lovelace",
  requestId: "lead-1720000000000",
  company: "Analytical Engines",
  email: "ada@example.com",
  phone: "0612345678",
  packageInterest: "Business Website",
  carePackage: "Care Plus",
  termsAccepted: true,
  message: "Ik wil een nieuwe website.",
  source: "homepage-contact-form",
  submittedAt: "2026-07-21T12:00:00.000Z",
};

test("public lead intake uses a deterministic UUID-shaped idempotency key", () => {
  const first = leadIdempotencyKey(lead);
  const second = leadIdempotencyKey({ ...lead });

  assert.equal(first, second);
  assert.match(first, /^lead-intake:v1:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("public lead is mapped to the canonical transactional intake contract", () => {
  const previousAppEnvironment = process.env.APP_ENVIRONMENT;
  process.env.APP_ENVIRONMENT = "production";
  try {
    const payload = leadRpcPayload(lead);
    assert.equal(payload.company, lead.company);
    assert.equal(payload.environment, "production");
    assert.equal(payload.is_demo, false);
    assert.equal(payload.external_source_id, lead.requestId);
    assert.equal(payload.notes, lead.message);
    assert.equal(payload.metadata.packageInterest, "Business Website");
    assert.equal(payload.metadata.termsAccepted, true);
  } finally {
    if (previousAppEnvironment === undefined) delete process.env.APP_ENVIRONMENT;
    else process.env.APP_ENVIRONMENT = previousAppEnvironment;
  }
});

test("public lead persistence calls the service-only RPC without exposing credentials", async () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousAppEnvironment = process.env.APP_ENVIRONMENT;
  let request;

  process.env.SUPABASE_URL = "https://example.supabase.co/";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.APP_ENVIRONMENT = "production";
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ status: "resolved", leadId: "lead-db-id", businessEventId: "business-event-db-id", created: true, duplicate: false, idempotentReplay: false }) };
  };

  try {
    const result = await persistLead(lead);
    assert.equal(result.leadId, "lead-db-id");
    assert.equal(result.businessEventId, "business-event-db-id");
    assert.equal(request.url, "https://example.supabase.co/rest/v1/rpc/mws_create_lead_transactional_v1");
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.headers.Authorization, "Bearer service-role-test-key");
    const body = JSON.parse(request.options.body);
    assert.equal(body.p_actor_type, "service");
    assert.equal(body.p_lead.email, lead.email);
    assert.equal(body.p_idempotency_key, leadIdempotencyKey(lead));
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    if (previousAppEnvironment === undefined) delete process.env.APP_ENVIRONMENT;
    else process.env.APP_ENVIRONMENT = previousAppEnvironment;
  }
});

test("canonical persistence precedes notifications and the UI reports storage failures accurately", () => {
  assert.ok(backendSource.indexOf("persistLeadWithReconciliation") < backendSource.indexOf("dependencies.sendEmail"));
  assert.ok(backendSource.indexOf("runLeadIntakeAbuseGate") < backendSource.indexOf("persistLeadWithReconciliation"));
  assert.match(backendSource, /notificationDegraded \? 202 : 200/);
  assert.match(backendSource, /success: true,[\s\S]*emailSent: Boolean/);
  assert.match(frontendSource, /Je aanvraag kon niet veilig worden opgeslagen/);
  assert.doesNotMatch(frontendSource, /Je aanvraag is lokaal opgeslagen, maar e-mail verzenden lukte niet/);
});

test("send-lead has one transactional intake writer and no separate timeline or business-event writer", () => {
  assert.doesNotMatch(backendSource, /createTimelineEvent|customer_timeline_events/);
  assert.doesNotMatch(backendSource, /record_business_event|\/rest\/v1\/business_events/);
  assert.equal((backendSource.match(/mws_create_lead_transactional_v1/g) || []).length, 1);
});

test("public form mirrors RPC limits, includes honeypot and stores only after server acceptance", () => {
  for (const [name, max] of [["name", 240], ["company", 240], ["email", 320], ["phone", 80], ["message", 4000]]) {
    assert.doesNotMatch(frontendHtml, new RegExp(`name="${name}"[^>]*maxlength=`));
    assert.equal(browserValidation.LIMITS[name], max);
  }
  assert.match(frontendHtml, /src="src\/lead-intake-validation\.js\?v=1\.0\.1"/);
  assert.match(frontendHtml, /<div hidden aria-hidden="true">\s*<label>Laat dit veld leeg/);
  assert.match(frontendHtml, /name="_gotcha"[^>]*tabindex="-1"[^>]*autocomplete="off"/);
  assert.match(frontendSource, /buildLeadRequestWithHoneypot\(formData,/);
  assert.ok(frontendSource.indexOf("await sendLeadRequest(leadRequest)") < frontendSource.indexOf("storeLeadRequest(leadRequest)"));
  assert.match(frontendSource, /pendingLeadRequest \|\|/);
  assert.match(frontendSource, /new TextEncoder\(\)\.encode\(body\)\.length > 131072/);
});

test("native browser FormData transports honeypot JSON to the real handler before every dependency", async () => {
  const formData = new FormData();
  const rawHoneypot = "browser-honeypot-content-must-not-be-logged";
  formData.set("_gotcha", rawHoneypot);
  const browserPayload = browserValidation.buildLeadRequestWithHoneypot(formData, {
    id: lead.requestId,
    createdAt: lead.submittedAt,
    source: lead.source,
    status: "nieuw",
    name: lead.name,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    packageInterest: lead.packageInterest,
    carePackage: lead.carePackage,
    termsAccepted: true,
    message: lead.message,
  });
  const serializedBrowserPayload = JSON.stringify(browserPayload);
  const calls = { limiter: 0, create: 0, reconcile: 0, timeline: 0, provider: 0, logs: [] };
  const handler = createHandler({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
      LEAD_ABUSE_HMAC_SECRET: "current-secret-with-at-least-32-bytes-value",
    },
    fetchImpl: async (url) => {
      if (url.endsWith("mws_check_lead_intake_abuse_v1")) calls.limiter += 1;
      if (url.endsWith("mws_create_lead_transactional_v1")) calls.create += 1;
      if (url.endsWith("mws_get_lead_intake_result_v1")) calls.reconcile += 1;
      throw new Error("must not run");
    },
    createTimelineEvent: async () => { calls.timeline += 1; throw new Error("must not run"); },
    sendEmail: async () => { calls.provider += 1; throw new Error("must not run"); },
    createRequestReference: () => "000000000000000000000000",
    logger: { info: (...args) => calls.logs.push(args) },
  });

  assert.equal(browserPayload._gotcha, rawHoneypot);
  assert.equal(JSON.parse(serializedBrowserPayload)._gotcha, rawHoneypot);
  const result = await handler({ httpMethod: "POST", headers: {}, body: serializedBrowserPayload });
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.deepEqual({ success: body.success, accepted: body.accepted }, { success: true, accepted: false });
  assert.deepEqual({ limiter: calls.limiter, create: calls.create, reconcile: calls.reconcile, timeline: calls.timeline, provider: calls.provider }, { limiter: 0, create: 0, reconcile: 0, timeline: 0, provider: 0 });
  assert.doesNotMatch(result.body, /honeypot|browser-honeypot/i);
  const logs = JSON.stringify(calls.logs);
  assert.match(logs, /abuseRejected/);
  assert.match(logs, /honeypot/);
  assert.doesNotMatch(logs, new RegExp(rawHoneypot));
  for (const pii of [lead.name, lead.company, lead.email, lead.phone, lead.message]) assert.doesNotMatch(logs, new RegExp(pii.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("native browser FormData sends an empty honeypot through the normal handler flow", async () => {
  const formData = new FormData();
  formData.set("_gotcha", "");
  const browserPayload = browserValidation.buildLeadRequestWithHoneypot(formData, lead);
  assert.equal(browserPayload._gotcha, "");
  assert.deepEqual({ ...browserPayload, _gotcha: undefined }, { ...lead, _gotcha: undefined });
  const serializedBrowserPayload = JSON.stringify(browserPayload);
  assert.equal(JSON.parse(serializedBrowserPayload)._gotcha, "");

  const calls = { limiter: 0, create: 0, reconcile: 0, timeline: 0, businessEvent: 0, provider: 0 };
  const handler = createHandler({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
      LEAD_ABUSE_HMAC_SECRET: "current-secret-with-at-least-32-bytes-value",
      APP_ENVIRONMENT: "test",
    },
    fetchImpl: async (url) => {
      if (url.endsWith("mws_check_lead_intake_abuse_v1")) {
        calls.limiter += 1;
        return { ok: true, json: async () => ({ version: 1, allowed: true, decision: "unique_allowed", replay: false, uniqueCounted: true, retryAfterSeconds: 0 }) };
      }
      if (url.endsWith("mws_create_lead_transactional_v1")) {
        calls.create += 1;
        return { ok: true, json: async () => ({ status: "resolved", lead: { id: "10000000-0000-4000-8000-000000000001" }, businessEventId: "20000000-0000-4000-8000-000000000001", created: true, duplicate: false, idempotentReplay: false }) };
      }
      if (url.endsWith("mws_get_lead_intake_result_v1")) calls.reconcile += 1;
      if (url.includes("record_business_event") || url.includes("/business_events")) calls.businessEvent += 1;
      throw new Error("unexpected fetch");
    },
    createTimelineEvent: async () => { calls.timeline += 1; return {}; },
    sendEmail: async () => { calls.provider += 1; return { sent: true }; },
    getCompanySettings: () => ({ primaryEmail: "info@example.com", whatsappNumber: "31600000000" }),
    getWhatsappLink: () => "https://wa.me/31600000000",
    createRequestReference: () => "000000000000000000000000",
    logger: { info: () => {} },
  });
  const result = await handler({ httpMethod: "POST", headers: { "x-nf-client-connection-ip": "203.0.113.42", "user-agent": "Mozilla/5.0" }, body: serializedBrowserPayload });
  assert.equal(result.statusCode, 200);
  assert.deepEqual({ limiter: calls.limiter, create: calls.create, reconcile: calls.reconcile, timeline: calls.timeline, businessEvent: calls.businessEvent, provider: calls.provider }, { limiter: 1, create: 1, reconcile: 0, timeline: 0, businessEvent: 0, provider: 2 });
});

test("browser and server use identical Unicode codepoint decisions for every bounded field", () => {
  const base = { ...lead, termsAccepted: true };
  const serverCode = {
    name: "nameTooLong", company: "companyTooLong", email: "emailTooLong", phone: "phoneTooLong",
    message: "messageTooLong", source: "sourceTooLong", requestId: "requestIdTooLong",
    packageInterest: "selectionTooLong", carePackage: "selectionTooLong",
  };
  const codepointsOfLength = (pattern, length) => {
    const codepoints = Array.from(pattern);
    return Array.from({ length }, (_, index) => codepoints[index % codepoints.length]).join("");
  };
  for (const [field, limit] of Object.entries(browserValidation.LIMITS)) {
    for (const unit of ["a", "é", "😀", "e\u0301", "a😀é"] ) {
      for (const [delta, valid] of [[-1, true], [0, true], [1, false]]) {
        const value = field === "email"
          ? `${codepointsOfLength(unit, limit - 12 + delta)}@example.com`
          : codepointsOfLength(unit, limit + delta);
        const draft = { ...base, [field]: value };
        const browserResult = browserValidation.validateLeadDraft(draft);
        const backendLead = require("../functions/send-lead")._private.sanitizeLead({ ...draft, id: draft.requestId });
        const backendResult = require("../functions/send-lead")._private.validateLead(backendLead);
        assert.equal(Boolean(browserResult.errors[field]), !valid, `${field} browser ${valid ? "accept" : "reject"}`);
        assert.equal(Boolean(backendResult && backendResult.code === serverCode[field]), !valid, `${field} server ${valid ? "accept" : "reject"}`);
      }
    }
  }
});

test("combining sequences are counted as codepoints rather than grapheme clusters", () => {
  assert.equal(browserValidation.codePointLength("e\u0301"), 2);
  assert.equal(browserValidation.codePointLength("😀"), 1);
});
