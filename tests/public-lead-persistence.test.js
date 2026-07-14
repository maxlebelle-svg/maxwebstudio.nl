const test = require("node:test");
const assert = require("node:assert/strict");

const { persistPublicLead } = require("../functions/services/publicLeadService");
const { createHandler } = require("../functions/send-lead");

const UUID = "11111111-1111-4111-8111-111111111111";
const input = { id: "lead-1720872000000", name: "Lisanne Post", company: "", email: "lisanne@example.test", phone: "", message: "Business Website", packageInterest: "Business Website", carePackage: "", createdAt: "2026-07-13T12:00:00.000Z", termsAccepted: true };
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

test("public lead persistence is idempotent and returns an existing durable lead", async () => {
  let posts = 0;
  const fetchImpl = async (url, options = {}) => {
    if ((options.method || "GET") === "POST") { posts += 1; return response(201, [{ id: UUID }]); }
    if (url.includes("external_source_id")) return response(200, [{ id: UUID, email: input.email }]);
    return response(200, []);
  };
  const result = await persistPublicLead(input, { env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" }, fetchImpl });
  assert.equal(result.created, false);
  assert.equal(result.lead.id, UUID);
  assert.equal(posts, 0);
});

test("new public lead is inserted as production lead with stable request ID", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if ((options.method || "GET") === "POST") return response(201, [{ id: UUID }]);
    return response(200, []);
  };
  const result = await persistPublicLead(input, { env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" }, fetchImpl });
  const record = JSON.parse(calls.find((call) => call.options.method === "POST").options.body);
  assert.equal(result.created, true);
  assert.equal(record.external_source_id, input.id);
  assert.equal(record.is_demo, false);
  assert.equal(record.environment, "production");
  assert.equal(record.lead_status, "new");
});

test("handler never creates timeline or email before durable lead exists", async () => {
  const effects = [];
  const handler = createHandler({
    persistPublicLead: async () => { effects.push("persist"); throw Object.assign(new Error("database unavailable"), { status: 503 }); },
    createTimelineEvent: async () => effects.push("timeline"),
    sendEmail: async () => { effects.push("email"); return { sent: true }; },
  });
  const result = await handler({ httpMethod: "POST", body: JSON.stringify(input) });
  assert.equal(result.statusCode, 503);
  assert.deepEqual(effects, ["persist"]);
});

test("handler links timeline and both email records to the persisted lead", async () => {
  const effects = [];
  const handler = createHandler({
    persistPublicLead: async () => ({ lead: { id: UUID }, requestId: input.id, created: true }),
    createTimelineEvent: async (event) => effects.push(["timeline", event]),
    sendEmail: async (mail) => { effects.push(["email", mail]); return { sent: true }; },
  });
  const result = await handler({ httpMethod: "POST", body: JSON.stringify(input) });
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(body.leadId, UUID);
  assert.equal(effects[0][1].leadId, UUID);
  assert.equal(effects.filter(([type]) => type === "email").length, 2);
  effects.filter(([type]) => type === "email").forEach(([, mail]) => assert.equal(mail.leadId, UUID));
  assert.equal(new Set(effects.filter(([type]) => type === "email").map(([, mail]) => mail.idempotencyKey)).size, 2);
});
