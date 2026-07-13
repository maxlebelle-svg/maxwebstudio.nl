const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { resolveJourneyFeatureFlag } = require("../functions/journey/featureFlags");
const { sanitizeLogContext } = require("../functions/journey/logger");
const { createJourneyRepository } = require("../functions/journey/repository");
const { createJourneyService } = require("../functions/journey/service");
const {
  FEATURE_FLAGS,
  PROCESSING_STATUSES,
} = require("../functions/journey/types");
const {
  JourneyValidationError,
  validateBusinessEvent,
  validatePayload,
} = require("../functions/journey/validation");

const SUPABASE_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const OUTBOX_ID = "22222222-2222-4222-8222-222222222222";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? "" : JSON.stringify(body),
  };
}

function validEvent(overrides = {}) {
  return {
    eventKey: "preview.ready:order-123:v1",
    eventType: "preview.ready",
    entityType: "preview",
    entityId: "order-123",
    customerId: "33333333-3333-4333-8333-333333333333",
    occurredAt: "2026-07-13T12:00:00.000Z",
    environment: "test",
    payload: { source: "foundation-test" },
    ...overrides,
  };
}

test("all journey feature flags default safely to off", () => {
  for (const flagName of Object.values(FEATURE_FLAGS)) {
    assert.deepEqual(resolveJourneyFeatureFlag(flagName, {}, {}), {
      flagName,
      mode: "off",
      enabled: false,
      reason: "feature_disabled",
    });
  }
});

test("test_only feature mode cannot enable production context", () => {
  const env = { JOURNEY_ENGINE_ENABLED: "test_only", APP_ENV: "production" };
  assert.equal(resolveJourneyFeatureFlag("JOURNEY_ENGINE_ENABLED", { environment: "production" }, env).enabled, false);
  assert.equal(resolveJourneyFeatureFlag("JOURNEY_ENGINE_ENABLED", { environment: "test" }, env).enabled, true);
});

test("allowlist mode only enables an explicitly selected scope", () => {
  const env = {
    JOURNEY_ENGINE_ENABLED: "allowlist",
    JOURNEY_ENGINE_ENABLED_ALLOWLIST: "journey-demo,customer-safe",
  };
  assert.equal(resolveJourneyFeatureFlag("JOURNEY_ENGINE_ENABLED", { journeyKey: "journey-demo" }, env).enabled, true);
  assert.equal(resolveJourneyFeatureFlag("JOURNEY_ENGINE_ENABLED", { journeyKey: "journey-other" }, env).enabled, false);
});

test("invalid event types, entity types, and payloads fail before repository access", () => {
  assert.throws(() => validateBusinessEvent(validEvent({ eventType: "mail.send_now" })), JourneyValidationError);
  assert.throws(() => validateBusinessEvent(validEvent({ entityType: "secret_record" })), JourneyValidationError);
  assert.throws(() => validatePayload(["not", "an", "object"]), JourneyValidationError);
  assert.throws(() => validatePayload(JSON.parse('{"__proto__":{"polluted":true}}')), /onveilige sleutel/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => validatePayload(cyclic), /circulaire verwijzing/);
});

test("structured logging drops payloads, secrets, and personal identifiers", () => {
  const safe = sanitizeLogContext({
    action: "record_event",
    eventType: "preview.ready",
    customerId: "private-customer",
    email: "client@example.test",
    payload: { name: "Customer" },
    apiKey: "secret",
  });
  assert.deepEqual(safe, { action: "record_event", eventType: "preview.ready" });
});

test("repository is a no-op without flags and performs no network call", async () => {
  let calls = 0;
  const repository = createJourneyRepository({ env: SUPABASE_ENV, fetchImpl: async () => { calls += 1; return response([]); }, logger: { info() {} } });
  const result = await repository.recordJourneyEvent(validEvent(), {
    outbox: { idempotencyKey: "preview-ready:order-123:v1", effectType: "email.preview_ready" },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "feature_disabled");
  assert.equal(calls, 0);
});

test("progress service needs both progress UI and engine flags", async () => {
  let reads = 0;
  const repository = {
    getJourneyInstanceByKey: async () => {
      reads += 1;
      return { available: true, skipped: false, row: { journey_type: "website.delivery", progress_percent: 40, status: "active" } };
    },
  };
  const progressOff = createJourneyService({
    env: { JOURNEY_ENGINE_ENABLED: "test_only", JOURNEY_PROGRESS_UI_ENABLED: "off" },
    repository,
  });
  assert.equal((await progressOff.getJourneyProgress("journey:123", { environment: "test" })).skipped, true);
  const engineOff = createJourneyService({
    env: { JOURNEY_ENGINE_ENABLED: "off", JOURNEY_PROGRESS_UI_ENABLED: "test_only" },
    repository,
  });
  assert.equal((await engineOff.getJourneyProgress("journey:123", { environment: "test" })).reason, "journey_engine_disabled");
  assert.equal(reads, 0);
});

test("progress service returns a bounded non-personal view when enabled", async () => {
  const service = createJourneyService({
    env: { JOURNEY_ENGINE_ENABLED: "test_only", JOURNEY_PROGRESS_UI_ENABLED: "test_only" },
    repository: {
      getJourneyInstanceByKey: async () => ({
        available: true,
        skipped: false,
        row: {
          journey_type: "website.delivery",
          current_phase: "build",
          current_step: "content",
          progress_percent: 140,
          status: "active",
          customer_id: "must-not-be-returned",
          metadata: { email: "must-not-be-returned@example.test" },
        },
      }),
    },
  });
  const result = await service.getJourneyProgress("journey:123", { environment: "test" });
  assert.deepEqual(result.progress, {
    journeyType: "website.delivery",
    currentPhase: "build",
    currentStep: "content",
    progressPercent: 100,
    status: "active",
    nextStepAt: null,
    startedAt: null,
    completedAt: null,
  });
});

test("test-only repository access is blocked in production and enabled in tests", async () => {
  let calls = 0;
  const env = { ...SUPABASE_ENV, JOURNEY_ENGINE_ENABLED: "test_only" };
  const repository = createJourneyRepository({ env, fetchImpl: async () => { calls += 1; return response([]); }, logger: { info() {} } });
  const blocked = await repository.listJourneyDefinitions({}, { environment: "production" });
  assert.equal(blocked.skipped, true);
  assert.equal(calls, 0);
  const enabled = await repository.listJourneyDefinitions({}, { environment: "test" });
  assert.equal(enabled.skipped, false);
  assert.equal(calls, 1);
});

test("repository reads and idempotent definition writes use only journey tables", async () => {
  const requests = [];
  const env = { ...SUPABASE_ENV, JOURNEY_ENGINE_ENABLED: "test_only" };
  const repository = createJourneyRepository({
    env,
    logger: { info() {} },
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.includes("journey_definitions") && options.method === "POST") return response([{ id: EVENT_ID, definition_key: "web.start" }]);
      if (url.includes("journey_definitions")) return response([{ id: EVENT_ID, definition_key: "web.start" }]);
      return response([], 404);
    },
  });
  const saved = await repository.saveJourneyDefinition({
    definitionKey: "web.start",
    version: 1,
    productCode: "WEB_START",
    journeyType: "website.delivery",
    config: { phases: [] },
  }, { environment: "test" });
  const listed = await repository.listJourneyDefinitions({}, { environment: "test" });
  assert.equal(saved.row.definition_key, "web.start");
  assert.equal(listed.rows.length, 1);
  assert.match(requests[0].url, /on_conflict=definition_key%2Cversion/);
  assert.match(requests[0].options.headers.Prefer, /ignore-duplicates/);
});

test("duplicate business events cannot create duplicate outbox items", async () => {
  const events = new Map();
  const outbox = new Map();
  const env = {
    ...SUPABASE_ENV,
    JOURNEY_ENGINE_ENABLED: "test_only",
    JOURNEY_EMAIL_AUTOMATION_ENABLED: "test_only",
  };
  const repository = createJourneyRepository({
    env,
    logger: { info() {} },
    fetchImpl: async (url, options = {}) => {
      assert.match(url, /record_journey_event_and_enqueue$/);
      const input = JSON.parse(options.body);
      const duplicate = events.has(input.p_event_key);
      if (!duplicate) events.set(input.p_event_key, EVENT_ID);
      const effectScope = `${events.get(input.p_event_key)}:${input.p_effect_type}`;
      if (input.p_outbox_idempotency_key && !outbox.has(effectScope)) {
        outbox.set(effectScope, OUTBOX_ID);
      }
      return response([{
        event_id: events.get(input.p_event_key),
        outbox_id: outbox.get(effectScope) || null,
        duplicate,
      }]);
    },
  });
  const settings = {
    context: { environment: "test" },
    outbox: {
      idempotencyKey: "preview-ready:order-123:v1",
      effectType: "email.preview_ready",
      payload: { templateKey: "preview_ready" },
    },
  };
  const first = await repository.recordJourneyEvent(validEvent(), settings);
  const second = await repository.recordJourneyEvent(validEvent(), {
    ...settings,
    outbox: { ...settings.outbox, idempotencyKey: "preview-ready:order-123:retried-with-different-key" },
  });
  assert.equal(first.row.duplicate, false);
  assert.equal(second.row.duplicate, true);
  assert.equal(events.size, 1);
  assert.equal(outbox.size, 1);
  assert.equal(first.row.outbox_id, second.row.outbox_id);
});

test("email flag off records the event without requesting an outbox effect", async () => {
  let rpcBody;
  const env = { ...SUPABASE_ENV, JOURNEY_ENGINE_ENABLED: "test_only", JOURNEY_EMAIL_AUTOMATION_ENABLED: "off" };
  const repository = createJourneyRepository({
    env,
    logger: { info() {} },
    fetchImpl: async (_url, options) => { rpcBody = JSON.parse(options.body); return response([{ event_id: EVENT_ID, outbox_id: null, duplicate: false }]); },
  });
  const result = await repository.recordJourneyEvent(validEvent(), {
    context: { environment: "test" },
    outbox: { idempotencyKey: "preview-ready:order-123:v1", effectType: "email.preview_ready" },
  });
  assert.equal(result.outboxSkipped, true);
  assert.equal(rpcBody.p_outbox_idempotency_key, null);
  assert.equal(rpcBody.p_effect_type, null);
});

test("provider webhook storage is disabled by default and test-only when enabled", async () => {
  let calls = 0;
  const input = {
    provider: "resend",
    providerEventId: "resend-event-123",
    eventType: "email.delivered",
    providerMessageId: "message-123",
    environment: "test",
    payload: { type: "email.delivered" },
  };
  const disabled = createJourneyRepository({
    env: SUPABASE_ENV,
    fetchImpl: async () => { calls += 1; return response([]); },
    logger: { info() {} },
  });
  assert.equal((await disabled.recordProviderEvent(input, { environment: "test" })).skipped, true);
  assert.equal(calls, 0);

  const enabled = createJourneyRepository({
    env: { ...SUPABASE_ENV, RESEND_EVENT_WEBHOOKS_ENABLED: "test_only" },
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.match(url, /on_conflict=provider%2Cprovider_event_id/);
      assert.match(options.headers.Prefer, /ignore-duplicates/);
      return response(calls === 1 ? [{ id: EVENT_ID }] : []);
    },
    logger: { info() {} },
  });
  assert.equal((await enabled.recordProviderEvent(input, { environment: "test" })).duplicate, false);
  assert.equal((await enabled.recordProviderEvent(input, { environment: "test" })).duplicate, true);
  assert.equal(calls, 2);
});

test("admin outbox reads require both feature flag and explicit authorization", async () => {
  let calls = 0;
  const env = { ...SUPABASE_ENV, JOURNEY_ADMIN_ENABLED: "test_only" };
  const repository = createJourneyRepository({ env, fetchImpl: async () => { calls += 1; return response([]); }, logger: { info() {} } });
  const blocked = await repository.listAutomationOutbox({}, { environment: "test", adminAuthorized: false });
  assert.equal(blocked.reason, "admin_authorization_required");
  assert.equal(calls, 0);
  const allowed = await repository.listAutomationOutbox({ status: "dead_letter" }, { environment: "test", adminAuthorized: true });
  assert.equal(allowed.skipped, false);
  assert.equal(calls, 1);
});

test("migration is additive, rerunnable, constrained, and service-role only", () => {
  const migrationPath = path.join(__dirname, "../supabase/migration-drafts/025_customer_journey_automation_foundations.sql");
  const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();
  const tables = [
    "journey_definitions",
    "journey_instances",
    "journey_events",
    "automation_outbox",
    "automation_executions",
    "provider_webhook_events",
  ];
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
  }
  assert.doesNotMatch(sql, /drop\s+(table|column)|truncate\s|delete\s+from/);
  assert.doesNotMatch(sql, /create\s+index\s+(?!if\s+not\s+exists)/);
  assert.match(sql, /unique \(event_key\)/);
  assert.match(sql, /unique \(idempotency_key\)/);
  assert.match(sql, /unique \(journey_event_id, effect_type\)/);
  assert.match(sql, /unique \(outbox_id, automation_key\)/);
  assert.match(sql, /unique \(provider, provider_event_id\)/);
  assert.match(sql, /on conflict \(event_key\) do nothing/);
  assert.match(sql, /insert into public\.automation_outbox[\s\S]+?on conflict do nothing/);
  assert.match(sql, /create or replace function public\.record_journey_event_and_enqueue/);
  assert.match(sql, /to service_role/);
  for (const status of PROCESSING_STATUSES) assert.match(sql, new RegExp(`'${status}'`));
});
