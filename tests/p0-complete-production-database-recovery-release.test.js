const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const evidence = path.join(root, "docs/release-readiness/p0-complete-production-database-recovery");
const manifest = JSON.parse(fs.readFileSync(path.join(evidence, "MANIFEST.json"), "utf8"));
const fileset = JSON.parse(fs.readFileSync(path.join(evidence, "FILESET.json"), "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

test("manifest self-hash and every release file checksum are valid", () => {
  const canonical = { ...manifest, selfHash: null };
  assert.equal(sha256(JSON.stringify(canonical)), manifest.selfHash);
  assert.equal(sha256(fs.readFileSync(path.join(evidence, "FILESET.json"))), manifest.filesetSha256);
  for (const entry of fileset.files) {
    const bytes = fs.readFileSync(path.join(root, entry.path));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha256(bytes), entry.sha256, entry.path);
  }
});

test("execution order uses six unique append-only recovery versions", () => {
  assert.deepEqual(manifest.migrationVersions, [
    "20260722130000", "20260722131000", "20260722132000", "20260722133000", "20260722134000", "20260722135000",
  ]);
  assert.equal(new Set(manifest.migrationVersions).size, 6);
  assert.deepEqual(fileset.executionOrder, manifest.executionOrder);
  const sql = fs.readFileSync(path.join(root, manifest.executionOrder[1]), "utf8");
  for (const column of ["company", "name", "website_url", "source", "normalized_domain", "branch", "region", "converted_customer_id", "converted_at"]) {
    assert.match(sql, new RegExp(`add column ${column.replaceAll("_", "[_]")}\\b`, "i"), column);
  }
  assert.match(sql, /create function public\.mws_sync_lead_legacy_aliases_v1\(\)/i);
  assert.match(sql, /create trigger sync_lead_legacy_aliases_v1/i);
  assert.match(sql, /lead compatibility conflict: company/i);
  assert.match(sql, /company = company_name[\s\S]*name = contact_name[\s\S]*website_url = website/i);
  const aliasTriggerBody = sql.slice(sql.indexOf("create function public.mws_sync_lead_legacy_aliases_v1"), sql.indexOf("alter function public.mws_sync_lead_legacy_aliases_v1"));
  assert.doesNotMatch(aliasTriggerBody, /new\.source|new\.external_source|leads_source_compatibility_conflict/i);
  assert.ok(sql.indexOf("create trigger sync_lead_legacy_aliases_v1") < sql.indexOf("create table public.lead_intake_idempotency"));
  assert.doesNotMatch(sql, /rename\s+column/i);
  assert.doesNotMatch(sql, /drop\s+(?:column|index|constraint)/i);
  assert.doesNotMatch(sql, /alter\s+column\s+notes/i);
  const policySql = fs.readFileSync(path.join(root, manifest.executionOrder[5]), "utf8");
  assert.match(policySql, /drop policy leads_sales_manager_read_update/i);
  assert.match(policySql, /create policy leads_sales_manager_select[\s\S]*for select/i);
  assert.match(policySql, /create policy leads_sales_manager_update[\s\S]*for update/i);
  assert.doesNotMatch(policySql, /create policy leads_sales_manager_[\s\S]*for (?:all|insert|delete)/i);
  assert.match(policySql, /4ccfec448672edc3d019454a8c9983e0/);
});

test("every migration is transaction-bounded and excludes staging smoke creation", () => {
  for (const relative of fileset.executionOrder) {
    const sql = fs.readFileSync(path.join(root, relative), "utf8");
    assert.match(sql, /\bbegin;/i, relative);
    assert.match(sql, /\bcommit;/i, relative);
    assert.doesNotMatch(sql, /create\s+(?:table|function)\s+public\.p0_staging_smoke/i, relative);
  }
  assert(manifest.supersededMigrations.includes("20260722125000"));
  const runbook = fs.readFileSync(path.join(evidence, "EXECUTION_RUNBOOK.md"), "utf8");
  assert.match(runbook, /Never run a database push from the repository migration root/i);
  assert.match(runbook, /only the six files listed in `MANIFEST\.json`/i);
  assert.match(runbook, /one file at a time/i);
});

test("staging cleanup is conditional, exact and never creates smoke objects", () => {
  const sql = fs.readFileSync(path.join(root, manifest.executionOrder[4]), "utf8");
  assert.match(sql, /if nonce_table is null and nonce_rpc is null then\s+return;/i);
  assert.match(sql, /md5\(nonce_proc\.prosrc\) <> 'd8c167d8460e2aaf4db2541d8870f652'/i);
  assert.match(sql, /table is not empty/i);
  assert.match(sql, /drop function if exists[\s\S]*drop table if exists/i);
});

test("security reconciliation preserves proven role-helper bodies", () => {
  const sql = fs.readFileSync(path.join(root, manifest.executionOrder[2]), "utf8");
  assert.match(sql, /btrim\(proc\.prosrc\) is distinct from btrim\(target\.body\)/i);
  assert.match(sql, /alter function public\.current_app_role\(\) set search_path/i);
  assert.doesNotMatch(sql, /create or replace function public\.current_app_role/i);
  assert.match(sql, /coalesce\(p\.status, 'active'\) in \('active', 'invited'\)/i);
  assert.match(sql, /'sales_manager'[\s\S]*'sales_partner'[\s\S]*'designer'/i);
  assert.doesNotMatch(sql, /'sales'/i);
  assert.match(sql, /target_customer_id is not null/i);
  assert.match(sql, /coalesce\(c\.status, 'active'\) <> 'archived'/i);
  assert.match(sql, /coalesce\(p\.environment, ''\) = 'demo'/i);
});

test("runtime configuration keeps staging-only controls out of production", () => {
  const config = JSON.parse(fs.readFileSync(path.join(evidence, "RUNTIME_CONFIGURATION.json"), "utf8"));
  assert.deepEqual(config.requiredBeforeRuntimeTraffic, ["LEAD_ABUSE_HMAC_SECRET"]);
  assert(config.forbiddenInProduction.includes("P0_STAGING_SMOKE_HMAC_SECRET"));
  assert(config.forbiddenInProduction.includes("P0_STAGING_SMOKE_ROTATION_ID"));
  assert(config.forbiddenInProduction.includes("OUTBOUND_PROVIDER_MODE=suppress"));
});

test("contract fingerprint excludes environment identity and includes P0 invariants", () => {
  const sql = fs.readFileSync(path.join(evidence, "CATALOG_FINGERPRINT.sql"), "utf8");
  const body = sql.slice(0, sql.indexOf("select value ||"));
  assert.doesNotMatch(body, /current_database|system_identifier|server_version/i);
  assert.match(body, /supportedAliasConflicts/);
  assert.match(body, /independentSourceDifferences/);
  assert.match(body, /stagingNonceTablePresent/);
  assert.match(body, /leadPolicySummary/);
});

test("local validation is isolated and green", () => {
  const validation = JSON.parse(fs.readFileSync(path.join(evidence, "LOCAL_VALIDATION.json"), "utf8"));
  assert.equal(validation.status, "PASS");
  assert.equal(validation.productionContact, false);
  assert.equal(validation.networkListeners, 0);
  assert.equal(validation.functionalContracts.stagingSmokeObjectCount, 0);
  assert.equal(validation.helperSemantics.targetLockedProductionReadOnlyAudit, "PASS");
  assert.equal(validation.helperSemantics.canonicalSource, "current production semantics");
  assert.deepEqual(validation.helperSemantics.currentAppRoleStatuses, ["active", "invited"]);
  assert.deepEqual(validation.helperSemantics.currentProfileIdStatuses, ["active", "invited"]);
  assert.deepEqual(validation.helperSemantics.staffRoles, ["super_admin", "admin", "sales_manager", "sales_partner", "designer", "developer", "support"]);
  assert.equal(validation.helperSemantics.demoContextRequiresActiveProfile, true);
  assert.equal(validation.helperSemantics.ownsCustomerRejectsNullAndArchived, true);
  assert.equal(validation.helperSemantics.bodyPreservation, "PASS");
  assert.equal(validation.compatibilityContracts.legacyRowsPreserved, 27);
  assert.equal(validation.compatibilityContracts.legacyDigestMatch, true);
  assert.equal(validation.compatibilityContracts.conflictingDualInput, "PASS_FAIL_CLOSED");
  assert.equal(validation.compatibilityContracts.sourceAndExternalSourceIndependent, true);
  assert.equal(validation.salesManagerPolicyHardening.selectAllowed, true);
  assert.equal(validation.salesManagerPolicyHardening.updateAllowed, true);
  assert.equal(validation.salesManagerPolicyHardening.insertBlocked, true);
  assert.equal(validation.salesManagerPolicyHardening.deleteBlocked, true);
  assert.equal(validation.salesManagerPolicyHardening.adminPartnerPolicyDefinitionsPreserved, true);
  assert.equal(validation.runtimeContractTests.failed, 0);
  assert.equal(validation.packagingTests.failed, 0);
  assert.equal(validation.temporaryClusterRemoved, true);
});
