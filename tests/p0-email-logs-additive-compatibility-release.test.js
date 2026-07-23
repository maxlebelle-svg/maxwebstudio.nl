const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const evidence = path.join(root, "docs/release-readiness/p0-email-logs-additive-compatibility");
const migrationPath = path.join(root, "supabase/migrations/20260722136000_p0_email_logs_additive_compatibility.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

test("release contains exactly one append-only migration", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, "MANIFEST.json"), "utf8"));
  assert.deepEqual(manifest.migrationVersions, ["20260722136000"]);
  assert.deepEqual(manifest.executionOrder, ["supabase/migrations/20260722136000_p0_email_logs_additive_compatibility.sql"]);
  assert.match(migration, /^-- P0 email log additive compatibility correction/m);
  assert.match(migration, /\bbegin;[\s\S]*\bcommit;/i);
  assert.doesNotMatch(migration, /drop\s+(?:table|column|policy|function)|truncate\s|delete\s+from/i);
});

test("migration adds only the four runtime compatibility columns", () => {
  for (const column of ["created_by", "idempotency_key", "message_type", "normalized_recipient_email"]) {
    assert.match(migration, new RegExp(`add column ${column}\\b`, "i"), column);
  }
  assert.equal((migration.match(/add column /gi) || []).length, 4);
  assert.doesNotMatch(migration, /alter\s+table\s+(?!public\.email_logs)/i);
});

test("legacy backfill is deterministic and accepts the existing updated_at trigger contract", () => {
  assert.match(migration, /legacy-email-log:' \|\| id::text/i);
  assert.match(migration, /extensions\.digest[\s\S]*'sha256'/i);
  assert.match(migration, /normalized_recipient_email = lower\(pg_catalog\.btrim\(to_email\)\)/i);
  assert.match(migration, /coalesce\(nullif\(pg_catalog\.btrim\(triggered_by\), ''\), 'legacy_mail_service'\)/i);
  assert.doesNotMatch(migration, /set[\s\S]{0,100}(?:created_at|updated_at)\s*=/i);
  const fixture = fs.readFileSync(path.join(root, "tests/fixtures/p0-email-logs-additive-compatibility-baseline.sql"), "utf8");
  assert.match(fixture, /create trigger set_email_logs_updated_at[\s\S]*execute function public\.set_updated_at\(\)/i);
  const postconditions = fs.readFileSync(path.join(evidence, "POSTCONDITIONS.sql"), "utf8");
  assert.match(postconditions, /ACCEPTABLE_UPDATED_AT_MIGRATION_EFFECT/);
  assert.match(postconditions, /distinct_updated_at_count <> 1/);
  assert.match(postconditions, /updated_at < created_at/);
});

test("constraints reject invalid recipients, duplicate keys and missing required values", () => {
  assert.match(migration, /email_logs_idempotency_key_unique unique \(idempotency_key\)/i);
  assert.match(migration, /email_logs_normalized_recipient_email_check/i);
  assert.match(migration, /alter column created_by set not null/i);
  assert.match(migration, /alter column idempotency_key set not null/i);
  assert.match(migration, /alter column message_type set not null/i);
  assert.match(migration, /alter column normalized_recipient_email set not null/i);
});

test("migration preserves RLS, policies and ACLs without new grants", () => {
  assert.doesNotMatch(migration, /\bgrant\b|\brevoke\b|enable row level security|disable row level security|create policy|drop policy/i);
  assert.match(migration, /a5706ca697ace8a5f132a909777e5f0d/);
  assert.match(migration, /f4729e986679877c0a53bd65c8e1b76f/);
});

test("release unit contains no application runtime files", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, "MANIFEST.json"), "utf8"));
  assert.equal(manifest.releaseFiles.some((file) => file.startsWith("functions/") || file.startsWith("public/")), false);
  assert.equal(manifest.applicationChangesPerformed, false);
  assert.equal(manifest.productionReadOnlyCompatibilityVerified, true);
  assert.equal(manifest.gateDPreparationEligible, true);
  assert.equal(manifest.gateDRetryAuthorized, false);
});

test("local validation proves migration, runtime insert and all negative cases", () => {
  const result = JSON.parse(fs.readFileSync(path.join(evidence, "LOCAL_VALIDATION.json"), "utf8"));
  assert.equal(result.status, "PASS");
  assert.equal(result.baselineRows, 56);
  assert.equal(result.legacyRowsPreserved, 56);
  assert.equal(result.idsAndCreatedAtPreserved, true);
  assert.equal(result.legacyNonTimestampContentPreserved, true);
  assert.equal(result.updatedAt.classification, "ACCEPTABLE_UPDATED_AT_MIGRATION_EFFECT");
  assert.equal(result.updatedAt.transactionallyUniform, true);
  assert.equal(result.updatedAt.notBeforeCreatedAt, true);
  assert.equal(result.updatedAt.triggerVerified, true);
  assert.equal(result.runtimeEquivalentInsert, "PASS");
  assert.equal(result.runtimeEquivalentInsertRolledBack, true);
  assert.equal(result.secondExecution, "FAIL_CLOSED");
  for (const value of Object.values(result.negativeTests)) assert.equal(value, "PASS_FAIL_CLOSED");
  assert.equal(result.security.rlsPreserved, true);
  assert.equal(result.security.policyDigestPreserved, true);
  assert.equal(result.security.aclDigestPreserved, true);
  assert.equal(result.productionContact, false);
});

test("manifest self-hash, fileset checksum and individual hashes are valid", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(evidence, "MANIFEST.json"), "utf8"));
  const fileset = JSON.parse(fs.readFileSync(path.join(evidence, "FILESET.json"), "utf8"));
  assert.equal(sha256(JSON.stringify({ ...manifest, selfHash: null })), manifest.selfHash);
  assert.equal(sha256(fs.readFileSync(path.join(evidence, "FILESET.json"))), manifest.filesetSha256);
  for (const entry of fileset.files) {
    const bytes = fs.readFileSync(path.join(root, entry.path));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha256(bytes), entry.sha256, entry.path);
  }
});
