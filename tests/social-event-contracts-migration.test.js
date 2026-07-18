const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(root, "supabase/migrations/20260718222000_social_event_contracts.sql");
const smokePath = path.join(root, "supabase/tests/social_event_contracts_smoke.sql");
const foundationPath = path.join(root, "supabase/migrations/20260718120000_business_event_foundation.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const smoke = fs.readFileSync(smokePath, "utf8");
const foundation = fs.readFileSync(foundationPath, "utf8");

function compact(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

test("migration registers exactly the six approved v1 social contracts", () => {
  const expected = [
    "social.content_created",
    "social.content_revision_created",
    "social.content_approved",
    "social.publication_requested",
    "social.publication_succeeded",
    "social.publication_failed",
  ];
  const registered = [...migration.matchAll(/\(\s*'(social\.[a-z_]+)'\s*,\s*1\s*,\s*'active'/g)]
    .map((match) => match[1]);
  assert.deepEqual(registered, expected);
  assert.equal(migration.includes(".v1'"), false, "event_type must not contain .v1");
  assert.equal(/create\s+table/i.test(migration), false);
});

test("the live foundation remains byte-for-byte unchanged", () => {
  const checksum = crypto.createHash("sha256").update(foundation).digest("hex");
  assert.equal(checksum, "04ebd6bbf9ef5637ec590861d85c47f6a3d8cd08f5ac54e3bdf6935f54ffc6d8");
});

test("payload validation has six explicit fixed dispatcher entries", () => {
  const sql = compact(migration);
  for (const validator of [
    "social_content_created_v1",
    "social_content_revision_created_v1",
    "social_content_approved_v1",
    "social_publication_requested_v1",
    "social_publication_succeeded_v1",
    "social_publication_failed_v1",
  ]) {
    assert(sql.includes(`create or replace function public.validate_${validator}`));
    assert(sql.includes(`when '${validator}' then perform public.validate_${validator}`));
  }
  assert.equal(/\bexecute\s+format\s*\(/i.test(migration), false);
  assert(sql.includes("unsupported business event payload validator"));
  assert(sql.includes("unsupported social event context validator"));
});

test("succeeded and failed share one delivery-job terminal deduplication key", () => {
  const matches = migration.match(/social\.publication_terminal:v1:/g) || [];
  assert(matches.length >= 1);
  assert(compact(smoke).includes("one delivery job must not accept two terminal outcomes"));
  for (const validator of ["validate_social_publication_succeeded_v1", "validate_social_publication_failed_v1"]) {
    const start = migration.indexOf(`function public.${validator}`);
    const end = migration.indexOf("$$;", start);
    const block = migration.slice(start, end);
    assert(block.includes("revisionNumber"));
    assert(block.includes("contentHash"));
    assert(block.includes("deliveryJobId"));
    assert(block.includes("deliveryAttemptId"));
  }
});

test("canonical SHA-256 content hashing has one documented byte representation", () => {
  const sql = compact(migration);
  assert(sql.includes("create or replace function public.canonical_social_content_v1"));
  assert(sql.includes("create or replace function public.social_content_hash_v1"));
  assert(sql.includes("extensions.digest"));
  assert(sql.includes("convert_to(public.canonical_social_content_v1(input_content), 'utf8')"));
  assert(sql.includes("normalize("));
  assert(sql.includes("replace(replace(input_content ->> 'caption'"));
  assert(sql.includes("order by ordinal_position"));
  assert(compact(smoke).includes("canonical social content bytes differ from the documented v1 format"));
  assert(compact(smoke).includes("equivalent unicode/newline/media uuid input must hash identically"));
  assert(compact(smoke).includes("media order must be part of the canonical content hash"));
});

test("context validation binds ownership, causation, subject, platform and timestamps", () => {
  const sql = compact(migration);
  for (const requirement of [
    "website_signal content requires causation_id",
    "causation business event belongs to another ownership scope",
    "client_portal approval is customer-only",
    "approval does not match its caused revision",
    "publication request does not match its approval",
    "publication result does not match its request",
    "social event subject does not match its payload",
    "social event deduplication key is invalid",
    "yyyy-mm-ddthh:mm:ss.mmmz",
    "publication result timestamp precedes or differs from its event time",
  ]) {
    assert(sql.includes(requirement), `missing context rule: ${requirement}`);
  }
  assert(sql.includes("cause_record.owner_scope is distinct from new.owner_scope"));
  assert(sql.includes("cause_record.customer_id is distinct from new.customer_id"));
});

test("contract registration grants no new application behavior", () => {
  const sql = compact(migration);
  assert.equal(/grant\s+execute/i.test(migration), false);
  assert.equal(/insert\s+into\s+public\.business_events/i.test(migration), false);
  assert.equal(/insert\s+into\s+public\.business_event_consumptions/i.test(migration), false);
  for (const forbidden of [
    "provider_connections",
    "social_accounts",
    "social_master_contents",
    "social_approvals",
    "delivery_jobs",
    "delivery_attempts",
    "customer_timeline_events",
  ]) {
    assert.equal(sql.includes(`create table public.${forbidden}`), false);
  }
  assert(sql.includes("revoke all on function public.social_content_hash_v1(jsonb)"));
  assert(sql.includes("revoke all on function public.dispatch_business_event_context_validation"));
});

test("transactional SQL smoke covers positive and negative contract behavior", () => {
  const sql = compact(smoke);
  assert(sql.startsWith("begin;"));
  assert(sql.endsWith("rollback;"));
  for (const expectation of [
    "happy-path publication result was not recorded",
    "mismatched subject_uuid must be rejected",
    "website_signal without causation must be rejected",
    "client_portal approval must be customer-only",
    "approval platform mismatch must be rejected",
    "non-canonical utc timestamp must be rejected",
    "result before publication request must be rejected",
    "cross-customer causation must be rejected",
    "client_portal approval must be accepted within one customer scope",
    "extra payload keys must be rejected",
    "invalid contenthash must be rejected",
  ]) {
    assert(sql.includes(expectation));
  }
});

test("migration checksum is available for the review gate", () => {
  const checksum = crypto.createHash("sha256").update(migration).digest("hex");
  assert.match(checksum, /^[0-9a-f]{64}$/);
});
