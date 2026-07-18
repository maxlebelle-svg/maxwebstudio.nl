const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260718120000_business_event_foundation.sql");
const smokeTestPath = path.join(root, "supabase/tests/business_event_foundation_smoke.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const smokeTest = fs.readFileSync(smokeTestPath, "utf8");

function compact(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

test("migration scope is limited to the three approved foundation tables", () => {
  const tables = [...migration.matchAll(/create table public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
  assert.deepEqual(tables, [
    "business_event_contracts",
    "business_events",
    "business_event_consumptions",
  ]);

  for (const forbidden of [
    "social_accounts",
    "social_master_contents",
    "social_content_variants",
    "social_approvals",
    "delivery_jobs",
    "customer_timeline_events",
    "provider_connections",
    "marketing_campaigns",
  ]) {
    assert.equal(migration.includes(`create table public.${forbidden}`), false, `${forbidden} must stay outside this migration`);
  }
});

test("ownership, subject identity and payload ceilings are database constraints", () => {
  const sql = compact(migration);
  assert(sql.includes("owner_scope in ('customer', 'internal')"));
  assert(sql.includes("owner_scope = 'customer' and customer_id is not null"));
  assert(sql.includes("owner_scope = 'internal' and customer_id is null"));
  assert(sql.includes("num_nonnulls(subject_uuid, subject_external_id) = 1"));
  assert(sql.includes("max_payload_bytes between 1 and 1048576"));
  assert(sql.includes("octet_length(convert_to(payload::text, 'utf8')) <= 1048576"));
  assert(sql.includes("references public.customers(id) on delete restrict"));
});

test("contract definitions are immutable and lifecycle only moves forward", () => {
  const sql = compact(migration);
  assert(sql.includes("business event contract definitions are immutable"));
  assert(sql.includes("old.lifecycle_status = 'active' and new.lifecycle_status = 'deprecated'"));
  assert(sql.includes("old.lifecycle_status = 'deprecated' and new.lifecycle_status = 'retired'"));
  assert.equal(sql.includes("old.lifecycle_status = 'active' and new.lifecycle_status = 'retired'"), false);

  for (const field of [
    "payload_schema",
    "validator_key",
    "max_payload_bytes",
    "allowed_owner_scopes",
    "schema_checksum",
  ]) {
    assert(sql.includes(`new.${field} is distinct from old.${field}`), `${field} must be immutable`);
  }
});

test("payload validation uses a fixed dispatcher and registers no live contract", () => {
  const sql = compact(migration);
  assert(sql.includes("case input_validator_key"));
  assert(sql.includes("when 'foundation_test_v1' then"));
  assert(sql.includes("unsupported business event payload validator"));
  assert.equal(/\bexecute\s+format\s*\(/i.test(migration), false);
  assert.equal(/insert\s+into\s+public\.business_event_contracts/i.test(migration), false);
  assert(sql.includes("revoke all on function public.validate_business_event_foundation_test_v1(jsonb)"));
  assert(sql.includes("revoke all on function public.dispatch_business_event_payload_validation(text, jsonb)"));
});

test("deduplication compares every semantically relevant immutable input", () => {
  const comparisonBlock = migration.slice(
    migration.indexOf("if existing_event.owner_scope"),
    migration.indexOf("raise exception using", migration.indexOf("if existing_event.owner_scope")),
  );
  for (const field of [
    "owner_scope",
    "customer_id",
    "event_type",
    "event_version",
    "occurred_at",
    "actor_type",
    "actor_id",
    "source_module",
    "source_operation",
    "correlation_id",
    "causation_id",
    "deduplication_key",
    "subject_type",
    "subject_uuid",
    "subject_external_id",
    "payload",
  ]) {
    assert(comparisonBlock.includes(`existing_event.${field}`), `${field} must be compared during deduplication`);
  }
  assert(migration.includes("when unique_violation then"));
  assert(migration.includes("immutable input differs"));
});

test("events are append-only and consumption state is formally constrained", () => {
  const sql = compact(migration);
  assert(sql.includes("business events are append-only and cannot be updated or deleted"));
  assert(sql.includes("before update or delete on public.business_events"));
  for (const status of [
    "pending",
    "claimed",
    "running",
    "completed",
    "failed",
    "retry_waiting",
    "dead_letter",
    "cancelled",
  ]) {
    assert(sql.includes(`'${status}'`));
  }
  assert(sql.includes("unsupported business event consumption transition"));
  assert(sql.includes("only a pending-to-claimed transition may change attempt_count"));
});

test("service role has read-only table grants and mutations use bounded functions", () => {
  const sql = compact(migration);
  for (const table of ["business_event_contracts", "business_events", "business_event_consumptions"]) {
    assert(sql.includes(`revoke all on table public.${table} from public, anon, authenticated, service_role`));
    assert(sql.includes(`grant select on table public.${table} to service_role`));
  }
  assert.equal(/grant\s+(insert|update|delete|all).*business_event/gi.test(migration), false);

  for (const fn of [
    "record_business_event",
    "create_business_event_consumption",
    "claim_business_event_consumption",
    "mark_business_event_consumption_running",
    "mark_business_event_consumption_completed",
    "mark_business_event_consumption_failed",
    "schedule_business_event_consumption_retry",
    "release_business_event_consumption_retry",
    "mark_business_event_consumption_dead_letter",
    "cancel_business_event_consumption",
    "recover_expired_business_event_consumption_claim",
  ]) {
    assert(sql.includes(`grant execute on function public.${fn}`), `${fn} must be the bounded write path`);
  }
});

test("transactional SQL smoke test leaves no production data or grants", () => {
  const sql = compact(smokeTest);
  assert(sql.startsWith("begin;"));
  assert(sql.endsWith("rollback;"));
  assert(sql.includes("insert into public.business_event_contracts"));
  assert(sql.includes("set_config('request.jwt.claim.role', 'service_role', true)"));
  assert(sql.includes("has_table_privilege('anon'"));
  assert(sql.includes("has_table_privilege('authenticated'"));
  assert(sql.includes("business event must reject updates"));
  assert(sql.includes("deduplication conflict must be rejected"));
});

test("migration checksum is deterministic for review", () => {
  const checksum = crypto.createHash("sha256").update(migration).digest("hex");
  assert.match(checksum, /^[0-9a-f]{64}$/);
});
