const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs/foundation-f0');
const bootstrap = path.join(root, 'supabase-bootstrap');
const read = (name) => fs.readFileSync(path.join(docs, name), 'utf8');
const requiredDocs = [
  'F0E_BOOTSTRAP_POC_PLAN.md','F0E_BOOTSTRAP_ROOT_DESIGN.md','F0E_LOCAL_SUPABASE_PROFILE_IMPLEMENTATION.md',
  'F0E_HISTORY_PROOF_REPORT.md','F0E_DUMMY_COMMON_MIGRATION_REPORT.md','F0E_NEGATIVE_TEST_REPORT.md',
  'F0E_PROJECT_ROOT_ISOLATION_REPORT.md','F0E_MISSING_LINEAGE_LOCAL_SEARCH.md','F0E_RUNTIME_COLUMN_EVIDENCE_PLAN.md',
  'F0E_LEADS_INDEX_CORRECTION_PLAN.md','F0E_BOOTSTRAP_POC_REPORT.md'
];

test('all F0-e artifacts and the separate bootstrap root exist', () => {
  for (const name of requiredDocs) assert.ok(fs.existsSync(path.join(docs, name)), name);
  for (const name of ['README.md','supabase/config.toml','config/local-profile.sql','scripts/init.mjs','scripts/verify.mjs','scripts/cleanup.mjs','scripts/run-local-poc.zsh']) assert.ok(fs.existsSync(path.join(bootstrap, name)), name);
});

test('authoritative baseline checksum is immutable and later common bytes remain separately controlled', () => {
  const bytes = fs.readFileSync(path.join(root, 'supabase/migrations/00000000000000_authoritative_baseline.sql'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'supabase-common/migrations/COMMON_MIGRATION_MANIFEST.json'), 'utf8'));
  const approved = manifest.migrations.map((entry) => entry.filename).sort();
  const sql = fs.readdirSync(path.join(bootstrap, 'supabase/migrations')).filter((x) => x.endsWith('.sql')).sort();
  assert.deepEqual(sql, ['00000000000000_authoritative_baseline.sql', ...approved]);
  for (const entry of manifest.migrations) {
    for (const relative of [entry.canonicalSource, entry.bootstrapOutput, entry.existingOutput]) {
      const materialization = fs.readFileSync(path.join(root, relative));
      assert.equal(materialization.length, entry.bytes, relative);
      assert.equal(crypto.createHash('sha256').update(materialization).digest('hex'), entry.sha256, relative);
    }
  }
  const copy = fs.readFileSync(path.join(bootstrap, 'supabase/migrations', '00000000000000_authoritative_baseline.sql'));
  assert.ok(copy.equals(bytes));
});

test('real CLI history proof contains exactly one baseline and exposes actual fields', () => {
  const report = read('F0E_HISTORY_PROOF_REPORT.md');
  assert.match(report, /supabase_migrations\.schema_migrations/);
  for (const field of ['version','statements','name']) assert.ok(report.includes(`| \`${field}\` |`), field);
  assert.match(report, /00000000000000.*authoritative_baseline.*612/);
  assert.match(report, /exact één row/i);
  assert.doesNotMatch(report, /repair uitgevoerd/i);
});

test('common cutover failure is explicit and no dummy migration remains', () => {
  const report = `${read('F0E_DUMMY_COMMON_MIGRATION_REPORT.md')}\n${read('F0E_BOOTSTRAP_POC_REPORT.md')}`;
  assert.match(report, /Resultaat: \*\*FAIL\*\*/);
  assert.match(report, /dummy werd niet toegepast/i);
  assert.match(report, /history.*niet op twee rows/i);
  assert.equal(fs.readdirSync(path.join(root, 'supabase/migrations')).some((x) => x.includes('bootstrap_poc_marker')), false);
});

test('local profile contains only required compatibility primitives', () => {
  const sql = fs.readFileSync(path.join(bootstrap, 'config/local-profile.sql'), 'utf8');
  for (const role of ['bootstrapadmin','postgres','authenticated','anon','service_role']) assert.match(sql, new RegExp(`create role ${role}\\b`));
  for (const object of ['auth.users','storage.buckets','storage.objects']) assert.match(sql, new RegExp(`create table ${object.replace('.', '\\.')}`));
  assert.doesNotMatch(sql, /insert into\s+(auth|storage)\./i);
  assert.doesNotMatch(sql, /testbucket|maxwebstudio-test-evidence/i);
});

test('guardrails reject unsafe environment, URLs, files, history and data', async () => {
  const g = await import(path.join(bootstrap, 'scripts/guardrails.mjs'));
  assert.throws(() => g.assertLocalSentinel({}), /required/);
  assert.throws(() => g.assertLocalSentinel({F0E_LOCAL_ONLY:'1', SUPABASE_PROJECT_REF:'x'}), /forbidden/);
  assert.throws(() => g.assertLocalDbUrl('postgresql://x@example.com/db'), /non-local/);
  assert.throws(() => g.assertLocalDbUrl('postgresql://x:secret@127.0.0.1/db'), /credentials/);
  assert.throws(() => g.assertDisposableWorkspace('/private/tmp/not-f0e'), /workspace/);
  assert.throws(() => g.assertBootstrapFiles([g.BASELINE_FILE, '20260701000000_old.sql']), /exactly/);
  assert.throws(() => g.assertCommonFiles(['20260720000000_old.sql']), /before cutover/);
  assert.throws(() => g.assertHistory([{version:g.BASELINE_VERSION},{version:g.BASELINE_VERSION}], [g.BASELINE_VERSION]), /duplicate/);
  assert.throws(() => g.assertHistory([{version:g.BASELINE_VERSION},{version:'20260720000000'}], [g.BASELINE_VERSION]), /synthetic/);
  assert.throws(() => g.assertEmptyTarget({publicTableCount:1,historyVersions:[],storageObjectCount:0,testBucketCount:0}), /partial/);
  assert.throws(() => g.assertEmptyTarget({publicTableCount:0,historyVersions:[],storageObjectCount:1,testBucketCount:0}), /storage/);
});

test('checksum mismatch hard-fails', async () => {
  const g = await import(path.join(bootstrap, 'scripts/guardrails.mjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f0e-checksum-'));
  const file = path.join(dir, 'baseline.sql');
  fs.writeFileSync(file, 'not the baseline');
  assert.throws(() => g.assertBaseline(file), /checksum mismatch/);
  fs.rmSync(dir, {recursive:true,force:true});
});

test('lineage search is local-only and concluded NOT FOUND without reconstruction', () => {
  const report = read('F0E_MISSING_LINEAGE_LOCAL_SEARCH.md');
  assert.match(report, /Status: \*\*NOT FOUND\*\*/);
  for (const version of ['20260720160000','20260720200000']) assert.match(report, new RegExp(version));
  assert.match(report, /niets gereconstrueerd/i);
});

test('runtime column plan is exact but remains unexecuted', () => {
  const plan = read('F0E_RUNTIME_COLUMN_EVIDENCE_PLAN.md');
  for (const token of ['column_default','is_nullable','is_identity','identity_generation','is_generated','generation_expression','collation_name']) assert.match(plan, new RegExp(token));
  assert.match(plan, /NO QUERY EXECUTED/);
  assert.match(plan, /BLOCKED_MISSING_EVIDENCE/);
});

test('leads correction remains plan-only and preserves nonunique target', () => {
  const plan = read('F0E_LEADS_INDEX_CORRECTION_PLAN.md');
  assert.match(plan, /leads_normalized_domain_idx/);
  assert.match(plan, /leads_unique_normalized_domain_idx.*niet de authoritative target state/is);
  assert.match(plan, /NO SQL/);
  assert.match(plan, /geen correctie-SQL geschreven/i);
});
