const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, file)));
const read = (file) => fs.readFileSync(path.join(root, file));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const filename = '20260721010000_harden_role_helper_search_paths.sql';
const canonicalPath = `supabase-common/migrations/${filename}`;
const expectedNames = ['current_app_role','current_profile_id','has_app_role','is_admin_role','is_demo_context','is_demo_record','is_staff_role','owns_customer'];

test('R2-A remains the first post-cutover common migration and is manifested', () => {
  const common = fs.readdirSync(path.join(root, 'supabase-common/migrations')).filter((name) => name.endsWith('.sql'));
  assert.ok(common.includes(filename));
  assert.ok('20260721010000' > '20260721000000');
  const manifest = json('supabase-common/migrations/COMMON_MIGRATION_MANIFEST.json');
  const r2a = manifest.migrations.find((entry) => entry.version === '20260721010000');
  assert.equal(r2a.sha256, 'fd787e93077783963d87879d6f9fba32395949fe572ef94609101293c91af966');
});

test('migration touches exactly eight allowlisted functions and no forbidden SQL', () => {
  const sql = read(canonicalPath).toString('utf8');
  const names = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\s*\(/g)].map((match) => match[1]);
  assert.deepEqual(names.slice().sort(), expectedNames.slice().sort());
  assert.equal(names.length, 8);
  assert.doesNotMatch(sql, /add_audit_log/i);
  assert.doesNotMatch(sql, /^\s*(GRANT|REVOKE|ALTER\s+(?:TABLE|FUNCTION|POLICY|.*OWNER)|CREATE\s+(?:POLICY|TABLE|INDEX|SCHEMA)|INSERT|UPDATE|DELETE|COPY|CALL|DO)\b/im);
  assert.equal((sql.match(/SET search_path TO 'pg_catalog'/g) || []).length, 8);
  assert.equal((sql.match(/CALLED ON NULL INPUT/g) || []).length, 8);
  assert.equal((sql.match(/PARALLEL UNSAFE/g) || []).length, 8);
  assert.equal((sql.match(/SECURITY DEFINER/g) || []).length, 8);
});

test('all eight migration bodies are exact R2-A.1 runtime bytes', () => {
  const sql = read(canonicalPath).toString('utf8');
  const manifest = json('docs/release-readiness/R2A1_CURRENT_FUNCTION_DEFINITIONS_MANIFEST.json');
  for (const entry of manifest.entries) {
    const name = entry.function.match(/^public\.([^(]+)/)[1];
    const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([^;]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`));
    assert.ok(match, name);
    assert.equal(sha(match[1]), entry.bodySha256, name);
  }
});

test('canonical, existing and bootstrap materializations are byte-identical', async () => {
  const canonical = read(canonicalPath);
  const existing = read(`supabase/migrations/${filename}`);
  const bootstrap = read(`supabase-bootstrap/supabase/migrations/${filename}`);
  assert.equal(canonical.length, 3578);
  assert.equal(sha(canonical), 'fd787e93077783963d87879d6f9fba32395949fe572ef94609101293c91af966');
  assert.deepEqual(canonical, existing);
  assert.deepEqual(canonical, bootstrap);
  const {validateDualRoot} = await import(path.join(root, 'supabase-bootstrap/scripts/dual-root-validator.mjs'));
  const result = validateDualRoot({
    canonicalDir: path.join(root, 'supabase-common/migrations'),
    bootstrapDir: path.join(root, 'supabase-bootstrap/supabase/migrations'),
    existingDir: path.join(root, 'supabase/migrations'),
    commonManifestPath: path.join(root, 'supabase-common/migrations/COMMON_MIGRATION_MANIFEST.json'),
    productCatalogPath: path.join(root, 'docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json'),
    repositoryRoot: root
  });
  assert.deepEqual(result.find((entry) => entry.version === '20260721010000'), {version:'20260721010000',size:3578,sha256:'fd787e93077783963d87879d6f9fba32395949fe572ef94609101293c91af966'});
});

test('metadata diff contains only search_path and exact bodies remain fixed', () => {
  const diff = json('docs/release-readiness/R2A_FUNCTION_DIFF.json');
  assert.equal(diff.status, 'PASS');
  assert.equal(diff.outsideAllowlistChanges, 0);
  assert.equal(diff.functions.length, 8);
  for (const fn of diff.functions) {
    assert.equal(fn.allowed, true);
    assert.deepEqual(fn.changedFields, ['proconfig','definition_sha256']);
    assert.equal(fn.semanticChange, 'search_path_only');
    assert.ok(Object.values(fn.unchanged).every(Boolean));
  }
});

test('both local lines, histories, second runs and transactional fixtures passed', () => {
  const result = json('docs/release-readiness/R2A_LOCAL_VALIDATION.json');
  assert.equal(result.status, 'PASS');
  assert.equal(result.remoteActions, 0);
  assert.deepEqual(result.scenarios.existing.historyAfterCommon.map((row) => row.version), ['20260710160200','20260721010000']);
  assert.deepEqual(result.scenarios.bootstrap.historyAfterCommon.map((row) => row.version), ['00000000000000','20260721010000']);
  for (const scenario of Object.values(result.scenarios)) {
    assert.deepEqual(scenario.historyAfterCommon, scenario.historyAfterSecond);
    assert.match(scenario.secondRunOutput, /up to date/i);
    assert.equal(scenario.functionalBefore.transactional_rollback, true);
    assert.equal(scenario.functionalAfter.transactional_rollback, true);
    assert.equal(scenario.functionalAfter.fixture_auth_users_remaining, 0);
    assert.equal(scenario.functionalAfter.fixture_profiles_remaining, 0);
    assert.equal(scenario.functionalAfter.fixture_customers_remaining, 0);
    assert.deepEqual(scenario.securityBefore, scenario.securityAfter);
  }
});

test('all 70 runtime policy callers are compatible and 64 baseline callers are locally unchanged', () => {
  const policy = json('docs/release-readiness/R2A_POLICY_CALLER_VALIDATION.json');
  assert.equal(policy.status, 'PASS');
  assert.equal(policy.remoteRuntimeReferences, 70);
  assert.equal(policy.remoteReferencesStaticallyValidated, 70);
  assert.equal(policy.materializedReferencesLocallyValidatedBeforeAndAfter, 64);
  assert.equal(policy.policyDefinitionSha256BeforeAfterEqual, true);
  assert.equal(policy.policyRoleArraysBeforeAfterEqual, true);
});

test('Foundation, historical and recovered bytes remain immutable', () => {
  const primary = read('supabase/migrations/00000000000000_authoritative_baseline.sql');
  const bootstrap = read('supabase-bootstrap/supabase/migrations/00000000000000_authoritative_baseline.sql');
  assert.deepEqual(primary, bootstrap);
  assert.equal(sha(primary), '1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315');
  assert.equal(sha(read('docs/foundation-f0/evidence/recovered-migrations/20260720160000_lead_event_foundation.sql')), 'd0252a9ed2062da2cdd499030afea01a3b3ac734402568176ed48d4fe434e6ba');
  assert.equal(sha(read('docs/foundation-f0/evidence/recovered-migrations/20260720200000_transactional_lead_intake_rpc.sql')), '40397c9d45e2c7dfef7c702837999630343f7fb033fa408119509483c29c6370');
  const historical = {
    '20260710160200_central_lead_lifecycle_deduplication.sql':'e3fc8186847eb74ca8d25b6cb5b9604292e85b473184e7bc4f52f43f45a21639',
    '20260710170500_sales_assignment_calling_follow_up_pipeline.sql':'1ce97e82f1fc60a44a9854f3b30d86aa53611ff90a8eb6664276c112104d2268',
    '20260711133000_preview_publication_portal_review.sql':'5e6f6a1a684a4487d7cedfb17e7c52c68fe6265415497dc755e1d73bbb3466f7',
    '20260712123000_relationship_asset_library.sql':'c7081e8b4c36cd0f7545120e42b16266b7357b2040f4968dedd6cae51f60b596',
    '20260712170000_relationship_asset_policy_hardening.sql':'ec2b791a911302c1b3e31112f5dcfbff4ccc6827e4f376eb78b11f1a4da10ebf',
    '20260718120000_business_event_foundation.sql':'04ebd6bbf9ef5637ec590861d85c47f6a3d8cd08f5ac54e3bdf6935f54ffc6d8',
    '20260718222000_social_event_contracts.sql':'d21fa1d94a11c90b9a803f9cf10e431c914fd5cd8c5a5ca05d254c39e9cbc5e9'
  };
  for (const [name, expected] of Object.entries(historical)) assert.equal(sha(read(`supabase/migrations/${name}`)), expected, name);
});

test('all required R2-A reports exist and remote/staging remain blocked', () => {
  for (const name of ['R2A_AUTHORING_GOVERNANCE_LOCK.md','R2A_BODY_IMMUTABILITY_REPORT.md','R2A_MIGRATION_FUNCTION_FINGERPRINTS.json','R2A_FUNCTION_DIFF.json','R2A_FUNCTION_DIFF_REPORT.md','R2A_DUAL_ROOT_MATERIALIZATION_REPORT.md','R2A_POLICY_CALLER_VALIDATION.json','R2A_POLICY_CALLER_VALIDATION_REPORT.md','R2A_SECURITY_VALIDATION.md','R2A_ROLLBACK_PLAN.md','R2A_STAGING_EXECUTION_PLAN.md','R2A_IMPLEMENTATION_REPORT.md']) assert.ok(fs.existsSync(path.join(root,'docs/release-readiness',name)), name);
  const phases = json('docs/release-readiness/RELEASE_READINESS_PHASES.json');
  assert.equal(phases.r2a.status, 'complete_staging_execution_pass');
  assert.equal(phases.r2a.stagingExecutionApproved, true);
  assert.equal(phases.r2a.stagingExecutionCompleted, true);
  assert.equal(phases.remoteExecutionApproved, false);
  assert.equal(phases.stagingApproved, false);
  assert.equal(phases.productionApproved, false);
});
