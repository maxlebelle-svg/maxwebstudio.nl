import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const expectedProjectRef = 'xlxpuuycigeqhgxqtzni';

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sqlFiles = (directory) => fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
const read = (file) => fs.readFileSync(file, 'utf8');

function git(repositoryRoot, args) {
  return execFileSync('git', args, {cwd: repositoryRoot, encoding: 'utf8'}).trim();
}

export function validateGovernedStagingRoot(repositoryRoot) {
  const stagingRoot = path.join(repositoryRoot, 'supabase-environments/staging');
  const canonicalMigrations = path.join(stagingRoot, 'supabase/migrations');
  const generalMigrations = path.join(repositoryRoot, 'supabase/migrations');
  const manifest = JSON.parse(read(path.join(stagingRoot, 'migration-manifest.json')));

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.environment, 'staging');
  assert.equal(manifest.projectName, 'maxwebstudio-test');
  assert.equal(manifest.targetProjectRef, expectedProjectRef);
  assert.ok(!manifest.forbiddenProjectRefs.includes(manifest.targetProjectRef));
  assert.deepEqual(manifest.counts, {
    applied: 35,
    pending: 1,
    excluded: 38,
    providerBlockingOlderExcluded: 31,
    laterFeatureLineExcluded: 7
  });

  for (const config of [path.join(stagingRoot, 'supabase/config.toml')]) {
    assert.match(read(config), /^project_id = "xlxpuuycigeqhgxqtzni"$/m);
    assert.doesNotMatch(read(config), /project_id\s*=\s*"(?:yxxahurphdbblkuxoeje|obprooubcbnfgouytvrw)"/);
    assert.match(read(config), /\[db\.seed\][\s\S]*enabled = false/);
  }
  for (const lock of [path.join(stagingRoot, 'target-project-ref')]) {
    assert.equal(read(lock).trim(), expectedProjectRef);
  }

  const appliedVersions = manifest.applied.map((entry) => entry.version);
  const pendingVersions = manifest.pending.map((entry) => entry.version);
  const excludedVersions = manifest.excluded.map((entry) => entry.version);
  assert.equal(new Set(appliedVersions).size, manifest.applied.length);
  assert.equal(new Set(pendingVersions).size, manifest.pending.length);
  assert.equal(new Set(excludedVersions).size, manifest.excluded.length);
  assert.deepEqual(pendingVersions, ['20260729200000']);
  assert.equal(manifest.pending[0].sha256, '830e113abb432417d50262ef45f48a390e2cbd900a5a45c2fb1faeb6360132d5');
  assert.ok(appliedVersions.every((version) => Number(version) < Number(pendingVersions[0])));

  const overlaps = [
    appliedVersions.filter((version) => pendingVersions.includes(version)),
    appliedVersions.filter((version) => excludedVersions.includes(version)),
    pendingVersions.filter((version) => excludedVersions.includes(version))
  ].flat();
  assert.deepEqual(overlaps, []);

  const expectedCanonical = [...manifest.applied, ...manifest.pending].map((entry) => entry.filename).sort();
  assert.deepEqual(sqlFiles(canonicalMigrations), expectedCanonical);

  for (const entry of [...manifest.applied, ...manifest.pending]) {
    const canonical = path.join(canonicalMigrations, entry.filename);
    const source = path.join(repositoryRoot, entry.sourcePath);
    assert.equal(sha256(canonical), entry.sha256, entry.filename);
    assert.equal(sha256(source), entry.sha256, `source ${entry.filename}`);
    assert.equal(fs.readFileSync(canonical).equals(fs.readFileSync(source)), true, entry.filename);
    assert.equal(git(repositoryRoot, ['rev-parse', `${entry.sourceCommit}:${entry.sourcePath}`]), entry.blobId, entry.filename);
    assert.equal(git(repositoryRoot, ['cat-file', '-t', entry.blobId]), 'blob', entry.filename);
  }
  for (const entry of manifest.excluded) {
    assert.equal(entry.classification, 'excluded_from_staging_lineage');
    assert.ok(entry.reason.length > 5);
    assert.ok(entry.featureLine.length > 2);
    assert.equal(fs.existsSync(path.join(canonicalMigrations, entry.filename)), false, entry.filename);
  }

  const general = sqlFiles(generalMigrations);
  const classified = [...manifest.applied.filter((entry) => fs.existsSync(path.join(generalMigrations, entry.filename))), ...manifest.excluded].map((entry) => entry.filename).sort();
  assert.deepEqual(general, classified);
  const fingerprintInput = general.map((filename) => `${filename} ${sha256(path.join(generalMigrations, filename))}\n`).join('');
  assert.equal(crypto.createHash('sha256').update(fingerprintInput).digest('hex'), manifest.generalMigrationRootFingerprint);

  for (const root of [stagingRoot]) {
    assert.equal(fs.existsSync(path.join(root, 'supabase/seed.sql')), false);
    assert.equal(fs.existsSync(path.join(root, 'supabase/auth')), false);
    assert.equal(fs.existsSync(path.join(root, 'supabase/storage')), false);
  }

  const runner = read(path.join(stagingRoot, 'run.zsh'));
  assert.match(runner, /MWS_STAGING_PROJECT_REF/);
  assert.match(runner, /supabase\/.temp\/project-ref/);
  assert.match(runner, /migration list --linked/);
  assert.match(runner, /db push --linked --dry-run/);
  assert.match(runner, /migration up --linked/);
  assert.doesNotMatch(runner, /migration repair|--include-all\s|db reset/);

  return {
    status: 'PASS_GOVERNED_STAGING_ROOT_STATIC',
    projectRef: manifest.targetProjectRef,
    applied: manifest.applied.length,
    pending: pendingVersions,
    excluded: manifest.excluded.length,
    canonicalFiles: expectedCanonical.length
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flagIndex = process.argv.indexOf('--repository-root');
  const repositoryRoot = flagIndex >= 0 ? path.resolve(process.argv[flagIndex + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.stdout.write(`${JSON.stringify(validateGovernedStagingRoot(repositoryRoot), null, 2)}\n`);
}
