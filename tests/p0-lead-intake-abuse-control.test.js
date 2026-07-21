const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const migrationName = "20260721040000_lead_intake_abuse_control.sql";
const migrationPaths = [
  path.join(root, "supabase-common/migrations", migrationName),
  path.join(root, "supabase/migrations", migrationName),
  path.join(root, "supabase-bootstrap/supabase/migrations", migrationName),
];
const {
  ABUSE_SCOPE,
  checkLeadIntakeAbuse,
  prepareAbuseControlRequest,
  runLeadIntakeAbuseGate,
  _private,
} = require("../functions/services/leadIntakeAbuseControl");

const idempotencyKey = "lead-intake:v1:32000000-0000-4000-8000-000000000001";
const event = {
  headers: {
    "x-nf-client-connection-ip": "203.0.113.42",
    "user-agent": "Mozilla/5.0 Chrome/126.0 Mobile",
  },
};
const secrets = {
  LEAD_ABUSE_HMAC_SECRET: "current-secret-with-at-least-32-bytes-value",
  LEAD_ABUSE_HMAC_SECRET_PREVIOUS: "previous-secret-with-at-least-32-bytes-value",
};

test("three migration materializations are byte-identical", () => {
  const copies = migrationPaths.map((file) => fs.readFileSync(file));
  assert.ok(copies[0].equals(copies[1]));
  assert.ok(copies[0].equals(copies[2]));
  const checksum = crypto.createHash("sha256").update(copies[0]).digest("hex");
  assert.equal(copies[0].length, 12199);
  assert.equal(checksum, "9e6747d25c8e98b637c8bb6500e381dfeeacc605dd830b422a1a68ecea35415a");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "supabase-common/migrations/COMMON_MIGRATION_MANIFEST.json"), "utf8"));
  const entry = manifest.migrations.find((item) => item.version === "20260721040000");
  assert.equal(entry.bytes, copies[0].length);
  assert.equal(entry.sha256, checksum);
  assert.equal(entry.byteIdentical, true);
});

test("migration creates one private ledger and fixed-limit atomic decision RPC", () => {
  const sql = fs.readFileSync(migrationPaths[0], "utf8");
  assert.match(sql, /create table public\.lead_intake_abuse_requests/);
  assert.match(sql, /scope = 'public_lead_intake_v1'/);
  assert.match(sql, /v_short_count >= 5/);
  assert.match(sql, /v_daily_count >= 20/);
  assert.match(sql, /interval '48 hours'/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /security definer[\s\S]*set search_path to 'pg_catalog'/i);
  assert.match(sql, /revoke all on table[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.mws_check_lead_intake_abuse_v1[\s\S]*to service_role/i);
  assert.match(sql, /revoke all on function public\.mws_cleanup_lead_intake_abuse_v1[\s\S]*from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(sql, /alter default privileges/i);
});

test("fingerprint is deterministic, coarsened and contains no raw request signals", () => {
  const first = prepareAbuseControlRequest(event, idempotencyKey, secrets);
  const second = prepareAbuseControlRequest(event, idempotencyKey, secrets);
  assert.deepEqual(first, second);
  assert.equal(first.scope, ABUSE_SCOPE);
  for (const value of [first.fingerprintHmac, first.previousFingerprintHmac, first.idempotencyHmac, first.previousIdempotencyHmac]) {
    assert.match(value, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(value, /203\.0\.113|chrome|lead-intake/);
  }
  assert.match(first.requestReference, /^[0-9a-f]{24}$/);
  assert.equal(_private.coarsenTrustedClientIp("203.0.113.42"), "203.0.113.0/24");
  assert.equal(_private.coarsenTrustedClientIp("2001:db8:abcd:12ff::1"), "2001:0db8:abcd:1200::/56");
});

test("untrusted or malformed fingerprint inputs fail closed", () => {
  assert.throws(() => prepareAbuseControlRequest({ headers: { "x-forwarded-for": "203.0.113.42" } }, idempotencyKey, secrets), (error) => error.code === "ABUSE_FINGERPRINT_UNAVAILABLE" && error.statusCode === 503);
  assert.throws(() => prepareAbuseControlRequest(event, idempotencyKey, { LEAD_ABUSE_HMAC_SECRET: "short" }), (error) => error.code === "ABUSE_LIMITER_CONFIG_INVALID");
  assert.throws(() => prepareAbuseControlRequest(event, "not-an-idempotency-key", secrets), (error) => error.code === "ABUSE_IDEMPOTENCY_INVALID" && error.statusCode === 400);
});

test("limiter interface sends only HMAC references and accepts a versioned decision", async () => {
  const references = prepareAbuseControlRequest(event, idempotencyKey, secrets);
  let captured;
  const result = await checkLeadIntakeAbuse({
    supabaseUrl: "https://example.supabase.co/",
    serviceRoleKey: "service-role-test-key",
    references,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ version: 1, allowed: true, decision: "unique_allowed", replay: false, uniqueCounted: true, retryAfterSeconds: 0 }) };
    },
  });
  assert.equal(result.allowed, true);
  assert.match(captured.url, /mws_check_lead_intake_abuse_v1$/);
  const body = JSON.parse(captured.options.body);
  assert.deepEqual(Object.keys(body).sort(), ["p_fingerprint_hmac", "p_idempotency_hmac", "p_previous_fingerprint_hmac", "p_previous_idempotency_hmac", "p_scope"]);
  assert.doesNotMatch(captured.options.body, /203\.0\.113|Mozilla|ada@|lead-intake:v1/);
});

test("limiter transport and malformed decisions fail with safe public errors", async () => {
  const references = prepareAbuseControlRequest(event, idempotencyKey, secrets);
  await assert.rejects(
    checkLeadIntakeAbuse({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "key", references, fetchImpl: async () => { throw new Error("private provider detail"); } }),
    (error) => error.code === "ABUSE_LIMITER_UNAVAILABLE" && error.statusCode === 503 && !error.message.includes("provider")
  );
  await assert.rejects(
    checkLeadIntakeAbuse({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "key", references, fetchImpl: async () => ({ ok: true, json: async () => ({ allowed: true }) }) }),
    (error) => error.code === "ABUSE_LIMITER_INVALID_RESPONSE" && error.statusCode === 503
  );
});

test("local gate contract blocks create on limits/conflicts and permits unique/replay decisions", async () => {
  const references = prepareAbuseControlRequest(event, idempotencyKey, secrets);
  const decision = (value) => async () => ({ ok: true, json: async () => value });
  const base = { supabaseUrl: "https://example.supabase.co", serviceRoleKey: "key", references };
  let createCalls = 0;
  const onAllowed = async (value) => { createCalls += 1; return value.decision; };

  for (const blocked of [
    { version: 1, allowed: false, decision: "short_window_limited", replay: false, uniqueCounted: false, retryAfterSeconds: 900 },
    { version: 1, allowed: false, decision: "daily_window_limited", replay: false, uniqueCounted: false, retryAfterSeconds: 86400 },
    { version: 1, allowed: false, decision: "idempotency_fingerprint_conflict", replay: false, uniqueCounted: false, retryAfterSeconds: 0 },
  ]) {
    await assert.rejects(
      runLeadIntakeAbuseGate({ ...base, fetchImpl: decision(blocked), onAllowed }),
      (error) => ["ABUSE_RATE_LIMITED", "ABUSE_IDEMPOTENCY_CONFLICT"].includes(error.code)
        && !error.message.includes("fingerprint") && !error.message.includes("database")
    );
  }
  assert.equal(createCalls, 0);

  assert.equal(await runLeadIntakeAbuseGate({ ...base, fetchImpl: decision({ version: 1, allowed: true, decision: "unique_allowed", replay: false, uniqueCounted: true, retryAfterSeconds: 0 }), onAllowed }), "unique_allowed");
  assert.equal(await runLeadIntakeAbuseGate({ ...base, fetchImpl: decision({ version: 1, allowed: true, decision: "replay_allowed", replay: true, uniqueCounted: false, retryAfterSeconds: 0 }), onAllowed }), "replay_allowed");
  assert.equal(createCalls, 2);

  await assert.rejects(
    runLeadIntakeAbuseGate({ ...base, fetchImpl: decision({ version: 1, allowed: true, decision: "short_window_limited", replay: false, uniqueCounted: false, retryAfterSeconds: 0 }), onAllowed }),
    (error) => error.code === "ABUSE_LIMITER_INVALID_RESPONSE" && error.statusCode === 503
  );
  assert.equal(createCalls, 2);
});
