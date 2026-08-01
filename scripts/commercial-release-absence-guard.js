"use strict";

const EXPECTED_PROJECT_REF = "yxxahurphdbblkuxoeje";
const BASE_RELEASE_COMMIT = "3e607711c7c232ab27722e08484ccbb05bfcd1a7";
const MIGRATION_VERSION = "20260731213000";
const MIGRATION_SHA256 = "bdc3b1a612dc34225e46d649a4fcdf09a5d13b31091cc553d39beb690692e4f6";

const POLICY_CATALOG_QUERY = `
select count(*)::integer as matching_policy_count
from pg_catalog.pg_policy p
join pg_catalog.pg_class c on c.oid = p.polrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = $1
  and c.relname = $2
  and p.polname = $3
`.trim();

async function runCommercialPolicyAbsenceGuard(input = {}) {
  const checkedAt = safeTimestamp(input.now);
  const metadata = {
    projectRef: clean(input.observedProjectRef),
    releaseCommit: clean(input.observedReleaseCommit),
    migrationVersion: MIGRATION_VERSION,
    migrationChecksum: clean(input.migrationChecksum),
    checkedAt,
  };

  try {
    assertIdentity(input);
    if (input.exclusiveSchemaWindow !== true) {
      throw guardError("SCHEMA_WINDOW_NOT_EXCLUSIVE", "An exclusive schema-change window is required.");
    }
    if (typeof input.queryCatalog !== "function") {
      throw guardError("CATALOG_QUERY_UNAVAILABLE", "The catalog query executor is unavailable.");
    }

    const result = await input.queryCatalog({
      text: POLICY_CATALOG_QUERY,
      values: ["public", "leads", "leads_demo_read"],
      readOnly: true,
    });
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    if (rows.length !== 1) {
      throw guardError("POLICY_CATALOG_RESULT_AMBIGUOUS", "The policy catalog result is ambiguous.");
    }
    const count = Number(rows[0]?.matching_policy_count);
    if (!Number.isInteger(count) || count < 0) {
      throw guardError("POLICY_CATALOG_RESULT_INVALID", "The policy catalog result is invalid.");
    }
    if (count !== 0) {
      throw guardError("LEADS_DEMO_READ_NOT_ABSENT", "The required absent policy contract is not satisfied.");
    }

    audit(input.audit, { ...metadata, result: "PASS", matchingPolicyCount: 0 });
    return Object.freeze({ ok: true, ...metadata, result: "PASS", matchingPolicyCount: 0 });
  } catch (error) {
    const code = clean(error?.code) || "POLICY_ABSENCE_GUARD_FAILED";
    audit(input.audit, { ...metadata, result: "STOP", code });
    const stopped = guardError(code, "Commercial policy absence guard stopped the release.");
    stopped.cause = error;
    throw stopped;
  }
}

function assertIdentity(input) {
  if (clean(input.expectedProjectRef) !== EXPECTED_PROJECT_REF
      || clean(input.observedProjectRef) !== EXPECTED_PROJECT_REF) {
    throw guardError("PROJECT_IDENTITY_MISMATCH", "The release target identity is not approved.");
  }
  const expectedReleaseCommit = clean(input.expectedReleaseCommit);
  const observedReleaseCommit = clean(input.observedReleaseCommit);
  if (!/^[a-f0-9]{40}$/.test(expectedReleaseCommit)
      || observedReleaseCommit !== expectedReleaseCommit) {
    throw guardError("RELEASE_COMMIT_MISMATCH", "The release commit is not approved.");
  }
  if (clean(input.migrationChecksum) !== MIGRATION_SHA256) {
    throw guardError("MIGRATION_CHECKSUM_MISMATCH", "Migration 7 is not byte-identical.");
  }
}

function audit(writer, entry) {
  if (typeof writer === "function") writer(Object.freeze({ ...entry }));
}

function safeTimestamp(now) {
  const value = typeof now === "function" ? now() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw guardError("INVALID_GUARD_TIME", "Guard time is invalid.");
  return date.toISOString();
}

function guardError(code, message) {
  return Object.assign(new Error(message), { code });
}

function clean(value) {
  return String(value ?? "").trim();
}

module.exports = Object.freeze({
  EXPECTED_PROJECT_REF,
  BASE_RELEASE_COMMIT,
  MIGRATION_VERSION,
  MIGRATION_SHA256,
  POLICY_CATALOG_QUERY,
  runCommercialPolicyAbsenceGuard,
});
