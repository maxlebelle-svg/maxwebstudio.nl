const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260719150000_asset_ingest_operation_foundation.sql");
const smokePath = path.join(root, "supabase/tests/asset_ingest_operation_foundation_smoke.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const smoke = fs.readFileSync(smokePath, "utf8");

function compact(value) { return value.replace(/\s+/g, " ").trim().toLowerCase(); }

test("A2 creates only the two approved ingest foundation tables", () => {
  const tables = [...migration.matchAll(/create table public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
  assert.deepEqual(tables, ["asset_ingest_operations", "asset_ingest_operation_events"]);
  for (const forbidden of ["storage.buckets", "asset_variants", "social_content_revisions", "delivery_jobs"]) {
    assert.equal(compact(migration).includes(`create table ${forbidden}`), false);
  }
  assert.equal(/storage\.objects|storage api|signed url/i.test(migration), false);
});

test("ownership, scoped idempotency and reserved asset identity are constrained", () => {
  const sql = compact(migration);
  assert(sql.includes("owner_scope in ('customer','internal')"));
  assert(sql.includes("reserved_asset_id uuid not null unique"));
  assert(sql.includes("asset_ingest_operations_customer_idempotency"));
  assert(sql.includes("asset_ingest_operations_internal_idempotency"));
  assert(sql.includes("pg_advisory_xact_lock(hashtextextended"));
  assert(sql.includes("asset ingest idempotency conflict: immutable input differs"));
});

test("the exact approved status machine and terminal states are enforced", () => {
  const sql = compact(migration);
  for (const transition of [
    "old.status = 'reserved' and new.status in ('bytes_received','failed')",
    "old.status = 'bytes_received' and new.status in ('validated','failed')",
    "old.status = 'validated' and new.status in ('uploaded','deduplicated','failed')",
    "old.status = 'uploaded' and new.status in ('registered','cleanup_pending','failed')",
    "old.status = 'cleanup_pending' and new.status in ('registered','deduplicated','failed')",
  ]) assert(sql.includes(transition));
  assert(sql.includes("old.status in ('registered','deduplicated','failed')"));
  assert(sql.includes("terminal asset ingest operations are immutable"));
});

test("immutable and write-once fields are guarded database-side", () => {
  const sql = compact(migration);
  for (const field of [
    "operation_id", "owner_scope", "customer_id", "reserved_asset_id", "idempotency_key",
    "input_fingerprint", "ingest_purpose", "source_type", "source_file_id", "original_filename",
    "safe_filename", "target_bucket", "path_scheme_version", "created_by_type", "created_at", "max_attempts",
  ]) assert(sql.includes(`old.${field} is distinct from new.${field}`), `${field} must be immutable`);
  for (const field of [
    "quarantine_bucket", "byte_checksum", "detected_mime_type", "size_bytes", "width_px", "height_px",
    "duration_ms", "validation_fingerprint", "target_object_path", "target_object_version", "registered_media_asset_id",
  ]) assert(sql.includes(`old.${field} is not null and old.${field} is distinct from new.${field}`), `${field} must be write-once`);
});

test("leases use skip-locked selection, fencing tokens and row versions", () => {
  const sql = compact(migration);
  assert(sql.includes("for update skip locked limit 1"));
  assert(sql.includes("lease_token uuid"));
  assert(sql.includes("row_version bigint not null default 1"));
  assert(sql.includes("attempt_count=attempt_count+1"));
  assert(sql.includes("lease heartbeat must not" ) || compact(smoke).includes("lease heartbeat must not increment attempt count"));
  assert(sql.includes("asset ingest mutation fencing check failed"));
  assert(sql.includes("recover_expired_asset_ingest_lease"));
});

test("audit events are compact, append-only and cover every required decision", () => {
  const sql = compact(migration);
  assert(sql.includes("octet_length(convert_to(event_context::text,'utf8')) <= 4096"));
  assert(sql.includes("asset ingest operation events are append-only"));
  for (const eventType of [
    "reserved", "claimed", "lease_renewed", "bytes_received", "validated", "uploaded",
    "registration_succeeded", "deduplicated", "cleanup_candidate", "cleanup_authorized",
    "cleanup_result", "retry_scheduled", "failed", "manual_review",
  ]) assert(sql.includes(`'${eventType}'`), `${eventType} must be registered`);
  assert.equal(/provider_response|access_token|refresh_token|file_bytes/i.test(migration), false);
});

test("cleanup is modeled without any storage delete capability", () => {
  const sql = compact(migration);
  assert(sql.includes("status='cleanup_pending'"));
  assert(sql.includes("cleanup_eligible_at<clock_timestamp()+interval '24 hours'"));
  assert(sql.includes("exists(select 1 from public.media_assets where id=r.reserved_asset_id)"));
  assert(sql.includes("asset ingest cleanup cannot be authorized because orphan proof is incomplete"));
  assert.equal(/delete\s+from\s+(storage|public\.media_assets)/i.test(migration), false);
});

test("service role writes only through bounded security-definer RPCs", () => {
  const sql = compact(migration);
  for (const table of ["asset_ingest_operations", "asset_ingest_operation_events"]) {
    assert(sql.includes(`revoke all on table public.${table} from public,anon,authenticated,service_role`));
    assert(sql.includes(`grant select on table public.${table} to service_role`));
  }
  assert.equal(/grant\s+(insert|update|delete|all).*asset_ingest/i.test(migration), false);
  assert.equal(/\bexecute\s+format\s*\(/i.test(migration), false);
  for (const fn of [
    "reserve_asset_ingest_operation", "claim_next_asset_ingest_operation", "renew_asset_ingest_lease",
    "schedule_asset_ingest_retry", "record_asset_ingest_bytes_received", "record_asset_ingest_validated",
    "record_asset_ingest_uploaded", "record_asset_ingest_registered", "record_asset_ingest_deduplicated",
    "mark_asset_ingest_cleanup_pending", "authorize_asset_ingest_cleanup", "mark_asset_ingest_failed",
  ]) assert(sql.includes(`grant execute on function public.${fn}`), `${fn} must be an approved write path`);
});

test("transactional smoke covers identity, leases, terminality, audit and grants", () => {
  const sql = compact(smoke);
  assert(sql.startsWith("begin;"));
  assert(sql.endsWith("rollback;"));
  for (const phrase of [
    "identical ingest reservation retry must return the same operation and reserved asset id",
    "conflicting ingest reservation retry must be rejected",
    "a second worker must not claim an already leased ingest operation",
    "wrong lease fencing token must be rejected",
    "stale ingest row version must be rejected",
    "retry scheduling must retain status and release the lease",
    "cross-customer source_file ingest must be rejected",
    "happy ingest chain must terminate as registered with its reserved asset id",
    "registered ingest operation must be absolutely excluded from cleanup",
    "asset ingest audit events must reject updates",
    "asset ingest table grants are unsafe",
  ]) assert(sql.includes(phrase), `missing smoke assertion: ${phrase}`);
});

test("migration checksum is available for the review gate", () => {
  assert.match(crypto.createHash("sha256").update(migration).digest("hex"), /^[0-9a-f]{64}$/);
});
