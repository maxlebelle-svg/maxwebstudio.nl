const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler, _test } = require("../functions/cockpit-write");

const NOW = new Date("2026-08-06T09:00:00.000Z");
const TOKEN = "w".repeat(64);
const READ_TOKEN = "r".repeat(64);
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const env = { COCKPIT_WRITE_TOKEN: TOKEN, COCKPIT_READ_TOKEN: READ_TOKEN, SUPABASE_URL: "https://db.example", SUPABASE_COCKPIT_SECRET_KEY: "secret" };

function event(body, overrides = {}) {
  return { httpMethod: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body), ...overrides };
}

function response(status, data = null) {
  return { ok: status >= 200 && status < 300, status, text: async () => data === null ? "" : JSON.stringify(data) };
}

test("rejects browser, missing auth and every method except POST", async () => {
  const handler = createHandler({ env, fetchImpl: async () => response(500), now: () => NOW });
  assert.equal((await handler({ httpMethod: "GET" })).statusCode, 405);
  assert.equal((await handler(event({ action: "add_note" }, { headers: { origin: "https://evil.example", authorization: `Bearer ${TOKEN}` } }))).statusCode, 403);
  assert.equal((await handler({ ...event({}), headers: {} })).statusCode, 401);
});

test("fails closed when write token is weak or reused as read token", async () => {
  const weak = createHandler({ env: { ...env, COCKPIT_WRITE_TOKEN: "short" }, fetchImpl: async () => response(500), now: () => NOW });
  const reused = createHandler({ env: { ...env, COCKPIT_WRITE_TOKEN: READ_TOKEN }, fetchImpl: async () => response(500), now: () => NOW });
  assert.equal((await weak(event({}))).statusCode, 503);
  assert.equal((await reused({ ...event({}), headers: { authorization: `Bearer ${READ_TOKEN}` } })).statusCode, 503);
});

test("validates strict action allowlist, UUID, idempotency key and dates", () => {
  assert.equal(_test.validateInput({ action: "delete", leadId: LEAD_ID, idempotencyKey: "x".repeat(16) }, NOW).code, "ACTION_NOT_ALLOWED");
  assert.equal(_test.validateInput({ action: "add_note", leadId: "bad", idempotencyKey: "x".repeat(16), note: "Hoi" }, NOW).code, "INVALID_LEAD_ID");
  assert.equal(_test.validateInput({ action: "add_note", leadId: LEAD_ID, idempotencyKey: "short", note: "Hoi" }, NOW).code, "INVALID_IDEMPOTENCY_KEY");
  assert.equal(_test.validateInput({ action: "schedule_next_action", leadId: LEAD_ID, idempotencyKey: "x".repeat(16), nextActionType: "delete", nextActionAt: "2026-08-07" }, NOW).code, "INVALID_ACTION_TYPE");
  assert.equal(_test.validateInput({ action: "schedule_next_action", leadId: LEAD_ID, idempotencyKey: "x".repeat(16), nextActionType: "call", nextActionAt: "2025-01-01" }, NOW).code, "INVALID_ACTION_DATE");
});

test("adds a stamped note with optimistic locking and audit event", async () => {
  const calls = [];
  const lead = { id: LEAD_ID, company_name: "Voorbeeld BV", notes: "Bestaand", updated_at: "2026-08-06T08:00:00.000Z", metadata: {} };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "GET") return response(200, [lead]);
    if (url.includes("/leads?")) return response(200, [{ ...lead, ...JSON.parse(options.body) }]);
    return response(201, null);
  };
  const handler = createHandler({ env, fetchImpl, now: () => NOW });
  const result = await handler(event({ action: "add_note", leadId: LEAD_ID, idempotencyKey: "note:111111111111", note: "Morgen terugbellen" }));
  assert.equal(result.statusCode, 200);
  const patch = calls.find((call) => call.options.method === "PATCH");
  assert.match(patch.url, /updated_at=eq\.2026-08-06T08%3A00%3A00\.000Z/);
  const payload = JSON.parse(patch.options.body);
  assert.match(payload.notes, /Bestaand[\s\S]+Cockpit[\s\S]+Morgen terugbellen/);
  assert.equal(payload.metadata.cockpitWrite.lastIdempotencyKey, "note:111111111111");
  assert.equal(calls.filter((call) => call.url.endsWith("/activity_logs")).length, 1);
});

test("schedules only permitted next-action fields and preserves metadata", async () => {
  const calls = [];
  const lead = { id: LEAD_ID, company_name: "Voorbeeld BV", updated_at: "2026-08-06T08:00:00.000Z", metadata: { keep: true } };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "GET") return response(200, [lead]);
    if (url.includes("/leads?")) return response(200, [{ ...lead, ...JSON.parse(options.body) }]);
    return response(201, null);
  };
  const handler = createHandler({ env, fetchImpl, now: () => NOW });
  const result = await handler(event({ action: "schedule_next_action", leadId: LEAD_ID, idempotencyKey: "action:1111111111", nextActionType: "call", nextActionAt: "2026-08-07T10:00:00+02:00", note: "Bel Max" }));
  assert.equal(result.statusCode, 200);
  const payload = JSON.parse(calls.find((call) => call.options.method === "PATCH").options.body);
  assert.deepEqual(Object.keys(payload).sort(), ["last_activity_at", "metadata", "next_action_at", "next_action_completed_at", "next_action_completed_by", "next_action_created_automatically", "next_action_note", "next_action_type", "updated_at"]);
  assert.equal(payload.metadata.keep, true);
  assert.equal(payload.next_action_at, "2026-08-07T08:00:00.000Z");
});

test("idempotent retry does not patch or append twice", async () => {
  const calls = [];
  const key = "note:alreadywritten";
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response(200, [{ id: LEAD_ID, metadata: { cockpitWrite: { lastIdempotencyKey: key } } }]);
  };
  const handler = createHandler({ env, fetchImpl, now: () => NOW });
  const result = await handler(event({ action: "add_note", leadId: LEAD_ID, idempotencyKey: key, note: "Niet dubbel" }));
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).duplicate, true);
  assert.equal(calls.length, 1);
});

test("blocks demo writes and returns conflict on concurrent update", async () => {
  const demoHandler = createHandler({ env, now: () => NOW, fetchImpl: async () => response(200, [{ id: LEAD_ID, environment: "demo" }]) });
  const demo = await demoHandler(event({ action: "add_note", leadId: LEAD_ID, idempotencyKey: "note:demoblocked1", note: "Nooit" }));
  assert.equal(demo.statusCode, 403);

  let count = 0;
  const conflictHandler = createHandler({ env, now: () => NOW, fetchImpl: async (_url, options) => {
    count += 1;
    return options.method === "GET" ? response(200, [{ id: LEAD_ID, updated_at: "2026-08-06T08:00:00.000Z", metadata: {} }]) : response(200, []);
  } });
  const conflict = await conflictHandler(event({ action: "add_note", leadId: LEAD_ID, idempotencyKey: "note:conflict1111", note: "Later" }));
  assert.equal(conflict.statusCode, 409);
  assert.equal(count, 2);
});

test("fails safely when the data source returns invalid JSON", async () => {
  const handler = createHandler({
    env,
    now: () => NOW,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => "not-json" }),
  });
  const result = await handler(event({ action: "add_note", leadId: LEAD_ID, idempotencyKey: "note:invalidjson11", note: "Niet opslaan" }));
  assert.equal(result.statusCode, 502);
  assert.equal(JSON.parse(result.body).code, "INVALID_UPSTREAM_RESPONSE");
});
