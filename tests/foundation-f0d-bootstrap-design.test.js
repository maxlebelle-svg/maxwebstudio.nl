const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs/foundation-f0');
const read = (name) => fs.readFileSync(path.join(docs, name), 'utf8');
const decision = JSON.parse(read('F0D_DECISION_MATRIX.json'));
const inventory = JSON.parse(read('F0C_MIGRATION_SET_INVENTORY.json'));
const reconciliation = JSON.parse(read('FOUNDATION_GOVERNANCE_MAIN_RECONCILIATION_V1.json'));
const stagingManifest = JSON.parse(fs.readFileSync(path.join(root, 'supabase-environments/staging/migration-manifest.json'), 'utf8'));
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const requiredDocs = [
  'F0D_BOOTSTRAP_ARCHITECTURE.md',
  'F0D_BOOTSTRAP_MODEL_COMPARISON.md',
  'F0D_CUTOVERPOINT_PROPOSAL.md',
  'F0D_MIGRATION_HISTORY_STRATEGY.md',
  'F0D_EXISTING_ENVIRONMENT_RECONCILIATION_PLAN.md',
  'F0D_LEADS_INDEX_DRIFT_REVIEW.md',
  'F0D_COLUMN_COMPARISON_RESOLUTION.md',
  'F0D_SUPABASE_LOCAL_COMPATIBILITY_PROFILE.md',
  'F0D_FUTURE_ASSET_MIGRATION_DECISION.md',
  'F0D_MISSING_LINEAGE_RECOVERY_PLAN.md',
  'F0D_FUTURE_MIGRATION_CONTRACT.md',
  'F0D_DECISION_MATRIX.json',
  'ADR-FOUNDATION-F0-BOOTSTRAP-LINE.md',
  'F0D_DESIGN_REVIEW_REPORT.md'
];

test('all required F0-d design artifacts exist', () => {
  for (const name of requiredDocs) assert.ok(fs.existsSync(path.join(docs, name)), name);
});

test('exactly one bootstrap model is recommended and rejected models have concrete reasons', () => {
  assert.equal(decision.recommendedBootstrapModel, 'C');
  assert.equal(decision.recommendedModelCount, 1);
  const comparison = read('F0D_BOOTSTRAP_MODEL_COMPARISON.md');
  const modelA = comparison.match(/## Model A[\s\S]*?(?=## Model B)/i)?.[0] || '';
  const modelB = comparison.match(/## Model B[\s\S]*?(?=## Model C)/i)?.[0] || '';
  assert.match(modelA, /AFGEWEZEN/i);
  assert.match(modelA, /valse lineage/i);
  assert.match(modelB, /AFGEWEZEN/i);
  assert.match(modelB, /historische SQL/i);
  assert.match(comparison, /Model C[\s\S]*ENIG AANBEVOLEN MODEL/i);
});

test('cutoverpoint is explicit and remains blocked on named gates', () => {
  assert.equal(decision.cutoverCandidate, '20260721000000');
  assert.equal(decision.cutoverStatus, 'blocked');
  const proposal = read('F0D_CUTOVERPOINT_PROPOSAL.md');
  for (const token of ['20260719190000','20260720160000','20260720200000','20260721000000','Status: **BLOCKED**','kolomcatalogus','Supabase CLI']) assert.ok(proposal.toLowerCase().includes(token.toLowerCase()), token);
});

test('recovered remote migrations have proven bytes and are not re-registered remotely', () => {
  const history = read('F0D_MIGRATION_HISTORY_STRATEGY.md');
  assert.match(history, /niet.*als applied geregistreerd/i);
  assert.match(history, /geen remote.*migration repair/i);
  const expected = new Map([
    ['20260720160000_lead_event_foundation.sql', 'd0252a9ed2062da2cdd499030afea01a3b3ac734402568176ed48d4fe434e6ba'],
    ['20260720200000_transactional_lead_intake_rpc.sql', '40397c9d45e2c7dfef7c702837999630343f7fb033fa408119509483c29c6370']
  ]);
  for (const [name, checksum] of expected) {
    assert.equal(digest(fs.readFileSync(path.join(root, 'supabase/migrations', name))), checksum);
    const staged = stagingManifest.applied.find((entry) => entry.filename === name);
    assert.ok(staged, name);
    assert.equal(staged.classification, 'applied');
    assert.equal(staged.remoteStatus, 'applied');
    assert.equal(staged.sha256, checksum);
    assert.match(staged.sourceCommit, /^[a-f0-9]{40}$/);
  }
  assert.equal(decision.migrationHistoryRepairPerformed, false);
});

test('F0-d created no reconciliation identity; every later migration remains separately attributable', async () => {
  assert.equal(decision.reconciliationSqlCreated, false);
  const actual = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort();
  const stagingHistoryAdditions = stagingManifest.applied
    .filter((entry) => entry.version >= '20260718120000' && entry.version <= '20260720200000')
    .map((entry) => entry.filename);
  const expected = [...reconciliation.preCutoverProductionLineage.map((x) => x.filename), ...stagingHistoryAdditions].sort();
  assert.deepEqual(actual.filter((name) => name < reconciliation.cutoverVersion), expected);
  for (const entry of reconciliation.preCutoverProductionLineage) {
    assert.equal(digest(fs.readFileSync(path.join(root, 'supabase/migrations', entry.filename))), entry.sha256, entry.filename);
  }
  assert.equal(actual.some((name) => /f0d|bootstrap/i.test(name) && !name.startsWith('000000')), false);
  const {validateDualRoot} = await import(path.join(root, 'supabase-bootstrap/scripts/dual-root-validator.mjs'));
  assert.doesNotThrow(() => validateDualRoot({
    canonicalDir: path.join(root, 'supabase-common/migrations'),
    bootstrapDir: path.join(root, 'supabase-bootstrap/supabase/migrations'),
    existingDir: path.join(root, 'supabase/migrations'),
    commonManifestPath: path.join(root, 'supabase-common/migrations/COMMON_MIGRATION_MANIFEST.json'),
    productCatalogPath: path.join(root, 'docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json'),
    repositoryRoot: root
  }));
});

test('normalized-domain unique index has an explicit authoritative decision', () => {
  const review = read('F0D_LEADS_INDEX_DRIFT_REVIEW.md');
  assert.match(review, /UNIQUE INDEX IS NOT TARGET STATE/);
  assert.match(review, /leads_unique_normalized_domain_idx/);
  assert.match(review, /leads_normalized_domain_idx.*authoritative/is);
  assert.match(review, /normalized_domain IS NOT NULL AND normalized_domain <> ''/);
  assert.match(review, /datapreflight/i);
});

test('column comparison has a definitive blocked status and exact missing evidence', () => {
  const resolution = read('F0D_COLUMN_COMPARISON_RESOLUTION.md');
  assert.match(resolution, /Status: \*\*BLOCKED_MISSING_EVIDENCE\*\*/);
  assert.match(resolution, /29 tabellen, 612 benoemde kolommen/);
  for (const field of ['Datatype','Default','Nullability','Identity/generation','Collation']) assert.match(resolution, new RegExp(field, 'i'));
  assert.match(resolution, /nieuwe remote evidencecollection.*niet toegestaan of uitgevoerd/is);
});

test('future asset migrations have an explicit quarantined position', () => {
  const assets = read('F0D_FUTURE_ASSET_MIGRATION_DECISION.md');
  assert.match(assets, /RELEASE_BLOCKED \/ NOT COMMON IN CURRENT IDENTITY/);
  assert.match(assets, /20260719120000/);
  assert.match(assets, /20260719150000/);
  assert.match(assets, /niet hernummerd of gewijzigd/);
  assert.match(assets, /nieuwe append-only common migrations/);
});

test('local Supabase profile describes every required role minimally', () => {
  const profile = read('F0D_SUPABASE_LOCAL_COMPATIBILITY_PROFILE.md');
  for (const role of ['postgres','authenticated','anon','service_role','authenticator','supabase_admin']) assert.match(profile, new RegExp(`\\| ${role} \\|`));
  assert.match(profile, /postgres[\s\S]*nee[\s\S]*eigenaar/i);
  assert.match(profile, /service_role[^\n]*BYPASSRLS/i);
  for (const object of ['auth.users','auth.uid','storage.buckets','storage.objects','extensions']) assert.match(profile, new RegExp(object.replace('.', '\\.'), 'i'));
});

test('future migration contract contains all mandatory safety and security rules', () => {
  const contract = read('F0D_FUTURE_MIGRATION_CONTRACT.md');
  for (const token of ['Append-only','immutable','beide lijnen','preconditions','Geen onvoorwaardelijke CREATE','Geen blinde','volledige verwachte definitie','Transactioneel','Grants en revokes','SECURITY DEFINER','search_path=pg_catalog','Geen PUBLIC EXECUTE','RLS','USING','WITH CHECK','rollback of compensatiestrategie','Statische tests','Lokale integratietests','fingerprints','Stagingvalidatie','Productie stopt']) assert.match(contract, new RegExp(token, 'i'));
});

test('baseline and all available migration checksums remain unchanged', () => {
  const baseline = fs.readFileSync(path.join(root, 'supabase/migrations/00000000000000_authoritative_baseline.sql'));
  assert.equal(digest(baseline), decision.baselineSha256);
  assert.equal(decision.baselineSha256, '1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315');
  const retired = new Set(reconciliation.retiredStagingOnlyInventoryEntries);
  for (const migration of inventory.migrations.filter((x) => x.localPresence === 'working_tree')) {
    const localPath = path.join(root, 'supabase/migrations', migration.filename);
    if (!fs.existsSync(localPath)) {
      assert.equal(retired.has(migration.filename), true, `unclassified absent migration: ${migration.filename}`);
      continue;
    }
    assert.equal(digest(fs.readFileSync(localPath)), migration.sha256, migration.filename);
  }
  const stillAbsentRetired = [...retired].filter((filename) => !fs.existsSync(path.join(root, 'supabase/migrations', filename))).sort();
  assert.deepEqual(stillAbsentRetired, inventory.migrations.filter((x) => x.localPresence === 'working_tree' && !fs.existsSync(path.join(root, 'supabase/migrations', x.filename))).map((x) => x.filename).sort());
});

test('ADR and design report preserve the no-write/no-deploy boundary', () => {
  const text = `${read('ADR-FOUNDATION-F0-BOOTSTRAP-LINE.md')}\n${read('F0D_DESIGN_REVIEW_REPORT.md')}`;
  assert.match(text, /geen SQL-/i);
  assert.match(text, /Geen remote query\/write/i);
  assert.match(text, /commit, push of deploy/i);
  assert.match(text, /implementation pending/i);
});
