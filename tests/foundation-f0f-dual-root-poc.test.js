const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs/foundation-f0');
const bootstrap = path.join(root, 'supabase-bootstrap');
const baselineName = '00000000000000_authoritative_baseline.sql';
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (name) => fs.readFileSync(path.join(docs, name), 'utf8');
const required = ['F0F_DUAL_ROOT_ARCHITECTURE.md','F0F_COMMON_MIGRATION_SOURCE_OF_TRUTH.md','F0F_BOOTSTRAP_ROOT_HISTORY_PROOF.md','F0F_EXISTING_ROOT_HISTORY_PROOF.md','F0F_COMMON_BYTE_IDENTITY_REPORT.md','F0F_ROOT_SELECTION_SAFETY.md','F0F_SUPABASE_CLI_HISTORY_BEHAVIOR.md','F0F_CUTOVER_STATUS.md','F0F_COMMON_MIGRATION_OPERATING_CONTRACT.md','F0F_DUAL_ROOT_POC_REPORT.md'];

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'f0f-validator-'));
  const dirs = Object.fromEntries(['canonical','bootstrap','existing'].map((name) => [name, path.join(base, name)]));
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir);
  fs.copyFileSync(path.join(root, 'supabase/migrations', baselineName), path.join(dirs.bootstrap, baselineName));
  fs.copyFileSync(path.join(root, 'supabase/migrations/20260710160200_central_lead_lifecycle_deduplication.sql'), path.join(dirs.existing, '20260710160200_central_lead_lifecycle_deduplication.sql'));
  const name = '20260721000100_dual_root_poc_marker.sql';
  const bytes = Buffer.from('create schema f0f_poc;\n');
  for (const dir of Object.values(dirs)) fs.writeFileSync(path.join(dir, name), bytes);
  return {base, dirs, name};
}

test('all F0-f artifacts exist', () => {
  for (const name of required) assert.ok(fs.existsSync(path.join(docs, name)), name);
});

test('baseline remains exact and bootstrap contains the baseline plus approved common migrations', () => {
  const source = fs.readFileSync(path.join(root, 'supabase/migrations', baselineName));
  const output = fs.readFileSync(path.join(bootstrap, 'supabase/migrations', baselineName));
  assert.equal(digest(source), '1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315');
  assert.ok(source.equals(output));
  const sql = fs.readdirSync(path.join(bootstrap, 'supabase/migrations')).filter((x) => x.endsWith('.sql')).sort();
  assert.equal(sql[0], baselineName);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'supabase-common/migrations/COMMON_MIGRATION_MANIFEST.json'), 'utf8'));
  assert.deepEqual(sql.slice(1), manifest.migrations.map((entry) => entry.filename).sort());
  for (const entry of manifest.migrations) {
    assert.equal(digest(fs.readFileSync(path.join(root, entry.canonicalSource))), entry.sha256, entry.filename);
    assert.equal(digest(fs.readFileSync(path.join(root, entry.bootstrapOutput))), entry.sha256, entry.filename);
    assert.equal(digest(fs.readFileSync(path.join(root, entry.existingOutput))), entry.sha256, entry.filename);
  }
});

test('dual-root validator accepts exact common bytes and genuine historical extras', async () => {
  const {validateDualRoot} = await import(path.join(bootstrap, 'scripts/dual-root-validator.mjs'));
  const f = fixture();
  const manifest = validateDualRoot({canonicalDir:f.dirs.canonical,bootstrapDir:f.dirs.bootstrap,existingDir:f.dirs.existing});
  assert.equal(manifest.length, 1);
  assert.equal(manifest[0].version, '20260721000100');
  fs.rmSync(f.base,{recursive:true,force:true});
});

test('byte drift and missing copy hard-fail', async () => {
  const {validateDualRoot} = await import(path.join(bootstrap, 'scripts/dual-root-validator.mjs'));
  const f = fixture();
  fs.appendFileSync(path.join(f.dirs.bootstrap,f.name),' ');
  assert.throws(() => validateDualRoot({canonicalDir:f.dirs.canonical,bootstrapDir:f.dirs.bootstrap,existingDir:f.dirs.existing}),/byte drift/);
  fs.copyFileSync(path.join(f.dirs.canonical,f.name),path.join(f.dirs.bootstrap,f.name));
  fs.rmSync(path.join(f.dirs.existing,f.name));
  assert.throws(() => validateDualRoot({canonicalDir:f.dirs.canonical,bootstrapDir:f.dirs.bootstrap,existingDir:f.dirs.existing}),/missing common copy/);
  fs.rmSync(f.base,{recursive:true,force:true});
});

test('pre-cutover, duplicate version, hidden file and symlink hard-fail', async () => {
  const {validateDualRoot} = await import(path.join(bootstrap, 'scripts/dual-root-validator.mjs'));
  for (const kind of ['pre','duplicate','hidden','symlink']) {
    const f = fixture();
    if (kind === 'pre') fs.writeFileSync(path.join(f.dirs.canonical,'20260720000000_old.sql'),'select 1;');
    if (kind === 'duplicate') fs.writeFileSync(path.join(f.dirs.canonical,'20260721000100_other.sql'),'select 1;');
    if (kind === 'hidden') fs.writeFileSync(path.join(f.dirs.canonical,'.fixture.tmp'),'x');
    if (kind === 'symlink') fs.symlinkSync(path.join(f.dirs.canonical,f.name),path.join(f.dirs.canonical,'linked.sql'));
    assert.throws(() => validateDualRoot({canonicalDir:f.dirs.canonical,bootstrapDir:f.dirs.bootstrap,existingDir:f.dirs.existing}),/before cutover|duplicate|hidden|symlink/);
    fs.rmSync(f.base,{recursive:true,force:true});
  }
});

test('root selection requires an explicit mode and rejects remote context in both modes', async () => {
  const {selectRoot} = await import(path.join(bootstrap, 'scripts/select-root.mjs'));
  assert.throws(() => selectRoot({env:{F0F_LOCAL_ONLY:'1'},repoRoot:root}),/explicit/);
  for (const mode of ['bootstrap','existing']) {
    assert.throws(() => selectRoot({mode,env:{F0F_LOCAL_ONLY:'1',SUPABASE_PROJECT_REF:'remote'},repoRoot:root}),/remote environment/);
    assert.match(selectRoot({mode,env:{F0F_LOCAL_ONLY:'1'},repoRoot:root}),new RegExp(mode === 'bootstrap' ? 'supabase-bootstrap$' : 'supabase$'));
  }
});

test('history reports prove both idempotent paths and no existing baseline row', () => {
  assert.match(read('F0F_BOOTSTRAP_ROOT_HISTORY_PROOF.md'),/exact twee rows/i);
  assert.match(read('F0F_BOOTSTRAP_ROOT_HISTORY_PROOF.md'),/up to date/i);
  const existing = read('F0F_EXISTING_ROOT_HISTORY_PROOF.md');
  assert.match(existing,/20260710160200/);
  assert.match(existing,/baselinehistoryrows: 0/i);
  assert.match(existing,/tweede run was clean/i);
});

test('CLI drift limitation and external validator requirement are explicit', () => {
  const report = read('F0F_COMMON_BYTE_IDENTITY_REPORT.md');
  assert.match(report,/411baf7efc80678960336ab1d73eadbe921ad08dd901cd937560fddb5cf9f9b5/);
  assert.match(report,/exitstatus 1/);
  assert.match(report,/CLI zelf.*up to date/is);
});

test('no product common fixture remains and no repair or pull command exists in runner', () => {
  for (const dir of [path.join(root,'supabase/migrations'),path.join(bootstrap,'supabase/migrations'),path.join(root,'supabase-common/migrations')]) {
    assert.equal(fs.readdirSync(dir).some((x) => /dual_root_poc_marker\.sql$/.test(x)),false);
  }
  const runner = fs.readFileSync(path.join(bootstrap,'scripts/run-dual-root-poc.zsh'),'utf8');
  assert.doesNotMatch(runner,/migration\s+repair|db\s+pull/);
});

test('recovered lineage is checksum-proven, staging-applied and never re-executed', () => {
  const status = read('F0F_CUTOVER_STATUS.md');
  assert.match(status,/technically_proven_but_evidence_blocked/);
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'supabase-environments/staging/migration-manifest.json'),'utf8'));
  const expected = new Map([
    ['20260720160000','d0252a9ed2062da2cdd499030afea01a3b3ac734402568176ed48d4fe434e6ba'],
    ['20260720200000','40397c9d45e2c7dfef7c702837999630343f7fb033fa408119509483c29c6370']
  ]);
  for (const [version, checksum] of expected) {
    assert.match(status,new RegExp(version));
    const entry = manifest.applied.find((candidate) => candidate.version === version);
    assert.ok(entry, version);
    assert.equal(entry.sha256, checksum);
    assert.equal(entry.remoteStatus, 'applied');
    assert.equal(entry.classification, 'applied');
    assert.equal(fs.readFileSync(path.join(root,'supabase-environments/staging/supabase/migrations',entry.filename)).equals(fs.readFileSync(path.join(root,'supabase/migrations',entry.filename))),true);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root,'supabase-environments/staging/run.zsh'),'utf8'),/migration repair|--include-all\s/);
});
