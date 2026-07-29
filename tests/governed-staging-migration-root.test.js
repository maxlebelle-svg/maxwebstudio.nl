const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const staging = path.join(root, 'supabase-environments/staging');
const canonical = path.join(staging, 'supabase/migrations');
const factory = path.join(staging, 'release-steps/factory-hub/supabase/migrations');
const general = path.join(root, 'supabase/migrations');
const manifest = JSON.parse(fs.readFileSync(path.join(staging, 'migration-manifest.json'), 'utf8'));
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sql = (directory) => fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
const runDenied = (args, environment = {}) => spawnSync('zsh', [path.join(staging, 'run.zsh'), ...args], {
  cwd: root,
  encoding: 'utf8',
  env: {...process.env, ...environment}
});

test('1 validator certifies the complete static staging root', async () => {
  const {validateGovernedStagingRoot} = await import(path.join(root, 'scripts/validate-governed-staging-root.mjs'));
  assert.equal(validateGovernedStagingRoot(root).status, 'PASS_GOVERNED_STAGING_ROOT_STATIC');
});

test('2 manifest targets exactly maxwebstudio-test', () => {
  assert.equal(manifest.projectName, 'maxwebstudio-test');
  assert.equal(manifest.targetProjectRef, 'xlxpuuycigeqhgxqtzni');
});

test('3 both CLI configs declare the staging project and PostgreSQL 17', () => {
  for (const file of [path.join(staging, 'supabase/config.toml'), path.join(staging, 'release-steps/factory-hub/supabase/config.toml')]) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /^project_id = "xlxpuuycigeqhgxqtzni"$/m);
    assert.match(source, /major_version = 17/);
  }
});

test('4 both permanent target-lock files contain only the staging ref', () => {
  assert.equal(fs.readFileSync(path.join(staging, 'target-project-ref'), 'utf8').trim(), 'xlxpuuycigeqhgxqtzni');
  assert.equal(fs.readFileSync(path.join(staging, 'release-steps/factory-hub/target-project-ref'), 'utf8').trim(), 'xlxpuuycigeqhgxqtzni');
});

test('5 manifest contains exactly 32 remote-applied versions', () => assert.equal(manifest.applied.length, 32));

test('6 every applied entry is classified applied and remotely applied', () => {
  for (const entry of manifest.applied) {
    assert.equal(entry.classification, 'applied');
    assert.equal(entry.remoteStatus, 'applied');
  }
});

test('7 canonical root contains 32 applied and two pending files', () => assert.equal(sql(canonical).length, 34));

test('8 every canonical file matches its manifest SHA-256', () => {
  for (const entry of [...manifest.applied, ...manifest.pending]) assert.equal(sha(path.join(canonical, entry.filename)), entry.sha256, entry.filename);
});

test('9 every applied and pending entry resolves to its historical Git blob', () => {
  for (const entry of [...manifest.applied, ...manifest.pending]) {
    const blob = execFileSync('git', ['rev-parse', `${entry.sourceCommit}:${entry.sourcePath}`], {cwd: root, encoding: 'utf8'}).trim();
    assert.equal(blob, entry.blobId, entry.filename);
  }
});

test('10 exactly Factory Hub and Food Demo Bundle are pending', () => {
  assert.deepEqual(manifest.pending.map((entry) => entry.version), ['20260729120000', '20260729170000']);
});

test('11 Factory Hub is ordered before Food Demo Bundle', () => {
  assert.ok(manifest.pending[0].version < manifest.pending[1].version);
  assert.match(manifest.pending[0].filename, /factory_hub/);
  assert.match(manifest.pending[1].filename, /food_demo_bundles/);
});

test('12 both pending checksums equal the frozen release checksums', () => {
  assert.equal(manifest.pending[0].sha256, '070243fb04f11a2828950e64074684332ac4549666ae37a0324ea000bdc11638');
  assert.equal(manifest.pending[1].sha256, '010c01ffc9c2ac2cd01d85196a93c27d2a8cf5dde5ac5d629350ef7a620b56e2');
});

test('13 permanent Factory step contains Factory Hub but not Food Demo Bundle', () => {
  assert.ok(sql(factory).includes(manifest.pending[0].filename));
  assert.ok(!sql(factory).includes(manifest.pending[1].filename));
});

test('14 Factory step contains all 32 applied files byte-identically', () => {
  assert.equal(sql(factory).length, 33);
  for (const entry of manifest.applied) assert.equal(fs.readFileSync(path.join(factory, entry.filename)).equals(fs.readFileSync(path.join(canonical, entry.filename))), true, entry.filename);
});

test('15 manifest explicitly excludes every non-staging non-candidate migration', () => assert.equal(manifest.excluded.length, 38));

test('16 excluded set distinguishes 31 older blockers from seven later feature migrations', () => {
  assert.equal(manifest.excluded.filter((entry) => entry.providerBlockingOlderMigration).length, 31);
  assert.equal(manifest.excluded.filter((entry) => !entry.providerBlockingOlderMigration).length, 7);
});

test('17 no excluded migration exists in either execution root', () => {
  for (const entry of manifest.excluded) {
    assert.equal(fs.existsSync(path.join(canonical, entry.filename)), false, entry.filename);
    assert.equal(fs.existsSync(path.join(factory, entry.filename)), false, entry.filename);
  }
});

test('18 every general-root migration has exactly one staging classification', () => {
  const classified = [...manifest.applied, ...manifest.pending, ...manifest.excluded].map((entry) => entry.filename).sort();
  assert.deepEqual(sql(general), classified);
  assert.equal(new Set(classified).size, classified.length);
});

test('19 general migration root retains its frozen filename and checksum fingerprint', () => {
  const fingerprint = sql(general).map((filename) => `${filename} ${sha(path.join(general, filename))}\n`).join('');
  assert.equal(crypto.createHash('sha256').update(fingerprint).digest('hex'), manifest.generalMigrationRootFingerprint);
});

test('20 governed-root work has not modified the general migration root', () => {
  assert.equal(execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'supabase/migrations'], {cwd: root, encoding: 'utf8'}).trim(), '');
});

test('21 neither workdir contains seeds, Auth files or Storage files', () => {
  for (const workdir of [staging, path.join(staging, 'release-steps/factory-hub')]) {
    assert.equal(fs.existsSync(path.join(workdir, 'supabase/seed.sql')), false);
    assert.equal(fs.existsSync(path.join(workdir, 'supabase/auth')), false);
    assert.equal(fs.existsSync(path.join(workdir, 'supabase/storage')), false);
  }
});

test('22 runner fails before provider access when explicit target lock is absent', () => {
  const result = runDenied(['list'], {MWS_STAGING_PROJECT_REF: ''});
  assert.equal(result.status, 64);
  assert.match(result.stderr, /MWS_STAGING_PROJECT_REF/);
});

test('23 runner rejects every non-staging project lock', () => {
  const result = runDenied(['list'], {MWS_STAGING_PROJECT_REF: 'yxxahurphdbblkuxoeje'});
  assert.equal(result.status, 64);
  assert.match(result.stderr, /must equal xlxpuuycigeqhgxqtzni/);
});

test('24 runner refuses include-all, repair, reset and write-capable db-push requests', () => {
  for (const argument of ['--include-all', 'repair', 'reset', 'db-push']) {
    const result = runDenied(['list', argument], {MWS_STAGING_PROJECT_REF: 'xlxpuuycigeqhgxqtzni'});
    assert.equal(result.status, 64, argument);
    assert.match(result.stderr, /forbidden migration operation/, argument);
  }
});

test('25 runner exposes only fixed list, dry-run and sequential migration-up routes', () => {
  const source = fs.readFileSync(path.join(staging, 'run.zsh'), 'utf8');
  assert.match(source, /migration list --linked/);
  assert.match(source, /db push --linked --dry-run/);
  assert.match(source, /migration up --linked/);
  assert.doesNotMatch(source, /migration repair|db reset/);
});

test('26 production and Silverado refs are forbidden, never configured execution targets', () => {
  assert.deepEqual(manifest.forbiddenProjectRefs, ['yxxahurphdbblkuxoeje', 'obprooubcbnfgouytvrw']);
  for (const file of [path.join(staging, 'supabase/config.toml'), path.join(staging, 'release-steps/factory-hub/supabase/config.toml')]) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /project_id = "(?:yxxahurphdbblkuxoeje|obprooubcbnfgouytvrw)"/);
  }
});
