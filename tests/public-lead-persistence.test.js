const test = require("node:test");
const assert = require("node:assert/strict");

const { persistPublicLead, _private } = require("../functions/services/publicLeadService");
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
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
});

test("current production schema falls back to baseline columns without losing lifecycle metadata", async () => {
  const posts = [];
  const fetchImpl = async (_url, options = {}) => {
    if ((options.method || "GET") !== "POST") return response(200, []);
    const record = JSON.parse(options.body);
    posts.push(record);
    if (posts.length === 1) return response(400, { code: "42703", message: "column leads.lead_status does not exist" });
    return response(201, [{ id: UUID, ...record }]);
  };
  const result = await persistPublicLead(input, { env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" }, fetchImpl });
  assert.equal(result.created, true);
  assert.equal(posts.length, 2);
  assert.equal(posts[1].lead_status, undefined);
  assert.equal(posts[1].external_source, undefined);
  assert.equal(posts[1].status, "nieuw");
  assert.equal(posts[1].metadata.leadStatus, "new");
  assert.equal(posts[1].metadata.externalSourceId, input.id);
});

test("fallback accepts only undefined lifecycle columns", () => {
  const accepts = [
    { code: "42703", message: "column leads.lead_status does not exist" },
    { code: "42703", message: "column external_source does not exist" },
    { code: "42703", message: "column normalized_phone does not exist" },
    { code: "undefined_column", message: "PostgreSQL undefined column: last_activity_at" },
  ];
  const rejects = [
    { code: "22023", message: "invalid value for column lead_status" },
    { code: "23505", message: "duplicate value for external_source_id" },
    { code: "42501", message: "RLS denied access to lead_status" },
    { code: "PGRST204", message: "Could not find lead_status in the schema cache" },
    { code: "42703", message: "schema cache does not contain lead_status" },
    { code: "42703", message: "RLS permission denied for lead_status" },
    { code: "42703", message: "column unrelated_field does not exist" },
    { code: "42703", message: "column lead_status_backup does not exist" },
  ];
  accepts.forEach((error) => assert.equal(_private.isMissingLifecycleColumnError(error), true, JSON.stringify(error)));
  rejects.forEach((error) => assert.equal(_private.isMissingLifecycleColumnError(error), false, JSON.stringify(error)));
});

test("approved undefined lifecycle columns perform exactly one legacy retry", async () => {
  for (const column of ["lead_status", "external_source", "normalized_phone"]) {
    let posts = 0;
    const fetchImpl = async (_url, options = {}) => {
      if ((options.method || "GET") !== "POST") return response(200, []);
      posts += 1;
      if (posts === 1) return response(400, { code: "42703", message: `column leads.${column} does not exist` });
      return response(201, [{ id: UUID }]);
    };
    const result = await persistPublicLead(input, { env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" }, fetchImpl });
    assert.equal(result.created, true, column);
    assert.equal(posts, 2, column);
  }
});

test("non-lifecycle database errors never retry with the legacy record", async () => {
  for (const databaseError of [
    { code: "22023", message: "invalid value for column lead_status" },
    { code: "23505", message: "duplicate key violates unique constraint on external_source_id" },
    { code: "23503", message: "foreign key constraint failed for lead_status" },
    { code: "23502", message: "null value violates constraint on lead_status" },
    { code: "42501", message: "permission denied by RLS for lead_status" },
    { code: "PGRST204", message: "Could not find lead_status in the schema cache" },
  ]) {
    let posts = 0;
    const fetchImpl = async (_url, options = {}) => {
      if ((options.method || "GET") !== "POST") return response(200, []);
      posts += 1;
      return response(400, databaseError);
    };
    await assert.rejects(
      persistPublicLead(input, { env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" }, fetchImpl }),
      { status: 503, message: databaseError.message },
    );
    assert.equal(posts, 1, databaseError.code);
  }
});

test("network and timeout errors propagate without a fallback retry", async () => {
  for (const transportError of [
    Object.assign(new Error("network unavailable"), { code: "ENETUNREACH" }),
    Object.assign(new Error("request timed out"), { name: "AbortError" }),
  ]) {
    let posts = 0;
    const fetchImpl = async (_url, options = {}) => {
      if ((options.method || "GET") !== "POST") return response(200, []);
      posts += 1;
      throw transportError;
    };
    await assert.rejects(
      persistPublicLead(input, { env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" }, fetchImpl }),
      (error) => error === transportError,
    );
    assert.equal(posts, 1);
  }
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
