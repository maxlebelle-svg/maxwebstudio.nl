"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EXPECTED_PROJECT_REF,
  BASE_RELEASE_COMMIT,
  MIGRATION_SHA256,
  POLICY_CATALOG_QUERY,
  runCommercialPolicyAbsenceGuard,
} = require("../scripts/commercial-release-absence-guard");

const fixedNow = () => new Date("2026-08-01T12:00:00.000Z");

function valid(overrides = {}) {
  return {
    expectedProjectRef: EXPECTED_PROJECT_REF,
    observedProjectRef: EXPECTED_PROJECT_REF,
    expectedReleaseCommit: BASE_RELEASE_COMMIT,
    observedReleaseCommit: BASE_RELEASE_COMMIT,
    migrationChecksum: MIGRATION_SHA256,
    exclusiveSchemaWindow: true,
    now: fixedNow,
    queryCatalog: async () => ({ rows: [{ matching_policy_count: 0 }] }),
    ...overrides,
  };
}

test("guard is catalog-only, read-only and records safe release metadata", async () => {
  const queries = [];
  const audits = [];
  const result = await runCommercialPolicyAbsenceGuard(valid({
    queryCatalog: async (query) => {
      queries.push(query);
      return { rows: [{ matching_policy_count: 0 }] };
    },
    audit: (entry) => audits.push(entry),
  }));

  assert.equal(result.ok, true);
  assert.equal(result.matchingPolicyCount, 0);
  assert.deepEqual(queries, [{
    text: POLICY_CATALOG_QUERY,
    values: ["public", "leads", "leads_demo_read"],
    readOnly: true,
  }]);
  assert.match(POLICY_CATALOG_QUERY, /^select /i);
  assert.match(POLICY_CATALOG_QUERY, /pg_catalog\.pg_policy/);
  assert.doesNotMatch(POLICY_CATALOG_QUERY, /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|call)\b/i);
  assert.deepEqual(audits, [{
    projectRef: EXPECTED_PROJECT_REF,
    releaseCommit: BASE_RELEASE_COMMIT,
    migrationVersion: "20260731213000",
    migrationChecksum: MIGRATION_SHA256,
    checkedAt: "2026-08-01T12:00:00.000Z",
    result: "PASS",
    matchingPolicyCount: 0,
  }]);
});

test("guard stops on an existing policy without issuing a mutation", async () => {
  let calls = 0;
  await assert.rejects(runCommercialPolicyAbsenceGuard(valid({
    queryCatalog: async () => {
      calls += 1;
      return { rows: [{ matching_policy_count: 1 }] };
    },
  })), { code: "LEADS_DEMO_READ_NOT_ABSENT" });
  assert.equal(calls, 1);
});

test("guard fails closed on wrong identity, checksum, schema window, query error and ambiguity", async () => {
  const cases = [
    [valid({ observedProjectRef: "xlxpuuycigeqhgxqtzni" }), "PROJECT_IDENTITY_MISMATCH"],
    [valid({ observedReleaseCommit: "0000000000000000000000000000000000000000" }), "RELEASE_COMMIT_MISMATCH"],
    [valid({ migrationChecksum: "wrong" }), "MIGRATION_CHECKSUM_MISMATCH"],
    [valid({ exclusiveSchemaWindow: false }), "SCHEMA_WINDOW_NOT_EXCLUSIVE"],
    [valid({ queryCatalog: async () => { throw Object.assign(new Error("offline"), { code: "CATALOG_OFFLINE" }); } }), "CATALOG_OFFLINE"],
    [valid({ queryCatalog: async () => ({ rows: [] }) }), "POLICY_CATALOG_RESULT_AMBIGUOUS"],
    [valid({ queryCatalog: async () => ({ rows: [{ matching_policy_count: 0 }, { matching_policy_count: 0 }] }) }), "POLICY_CATALOG_RESULT_AMBIGUOUS"],
  ];
  for (const [input, code] of cases) await assert.rejects(runCommercialPolicyAbsenceGuard(input), { code });
});

test("guard audit never contains credentials or personal data", async () => {
  const audits = [];
  await runCommercialPolicyAbsenceGuard(valid({ audit: (entry) => audits.push(entry) }));
  const serialized = JSON.stringify(audits);
  for (const forbidden of ["password", "authorization", "bearer", "service_role", "email", "cookie", "jwt"]) {
    assert.equal(serialized.toLowerCase().includes(forbidden), false, forbidden);
  }
});
