const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const validatorPath = path.join(root, 'supabase-bootstrap/scripts/dual-root-validator.mjs');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function governedFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-governance-validator-'));
  const dirs = {
    canonical: path.join(base, 'supabase-common/migrations'),
    bootstrap: path.join(base, 'supabase-bootstrap/supabase/migrations'),
    existing: path.join(base, 'supabase/migrations')
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, {recursive: true});
  fs.copyFileSync(path.join(root, 'supabase/migrations/00000000000000_authoritative_baseline.sql'), path.join(dirs.bootstrap, '00000000000000_authoritative_baseline.sql'));
  fs.copyFileSync(path.join(root, 'supabase/migrations/20260710160200_central_lead_lifecycle_deduplication.sql'), path.join(dirs.existing, '20260710160200_central_lead_lifecycle_deduplication.sql'));

  const commonName = '20260721000100_governed_common.sql';
  const commonBytes = Buffer.from('select 1;\n');
  for (const dir of Object.values(dirs)) fs.writeFileSync(path.join(dir, commonName), commonBytes);
  const commonManifestPath = path.join(dirs.canonical, 'COMMON_MIGRATION_MANIFEST.json');
  writeJson(commonManifestPath, {
    schemaVersion: 1,
    status: 'active',
    cutoverVersion: '20260721000000',
    migrations: [{
      version: '20260721000100', filename: commonName,
      canonicalSource: `supabase-common/migrations/${commonName}`,
      existingOutput: `supabase/migrations/${commonName}`,
      bootstrapOutput: `supabase-bootstrap/supabase/migrations/${commonName}`,
      bytes: commonBytes.length, sha256: digest(commonBytes), byteIdentical: true, validatorStatus: 'PASS'
    }]
  });

  const productName = '20260722000000_governed_product.sql';
  const productBytes = Buffer.from('select 2;\n');
  fs.writeFileSync(path.join(dirs.existing, productName), productBytes);
  const releaseManifest = 'docs/release/MANIFEST.json';
  const releaseFileset = 'docs/release/FILESET.json';
  writeJson(path.join(base, releaseManifest), {schemaVersion: 1, executionOrder: [`supabase/migrations/${productName}`]});
  writeJson(path.join(base, releaseFileset), {schemaVersion: 1, files: [{path: `supabase/migrations/${productName}`, bytes: productBytes.length, sha256: digest(productBytes)}]});
  const productCatalogPath = path.join(base, 'docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json');
  writeJson(productCatalogPath, {schemaVersion: 1, status: 'approved', category: 'existing-only/product', releases: [{manifest: releaseManifest, fileset: releaseFileset}]});
  return {base, dirs, commonManifestPath, productName, productCatalogPath};
}

function validateGoverned(validateDualRoot, fixtureValue) {
  return validateDualRoot({
    canonicalDir: fixtureValue.dirs.canonical,
    bootstrapDir: fixtureValue.dirs.bootstrap,
    existingDir: fixtureValue.dirs.existing,
    commonManifestPath: fixtureValue.commonManifestPath,
    productCatalogPath: fixtureValue.productCatalogPath,
    repositoryRoot: fixtureValue.base
  });
}

test('exact common and existing-only product manifests pass', async () => {
  const {validateDualRoot} = await import(validatorPath);
  const f = governedFixture();
  assert.equal(validateGoverned(validateDualRoot, f).length, 1);
  fs.rmSync(f.base, {recursive: true, force: true});
});

test('unknown common migration and common checksum mismatch hard-fail', async () => {
  const {validateDualRoot} = await import(validatorPath);
  for (const kind of ['unknown', 'checksum']) {
    const f = governedFixture();
    if (kind === 'unknown') {
      const extra = '20260721000200_unknown_common.sql';
      const bytes = Buffer.from('select 3;\n');
      for (const dir of Object.values(f.dirs)) fs.writeFileSync(path.join(dir, extra), bytes);
      assert.throws(() => validateGoverned(validateDualRoot, f), /uncatalogued common migration/);
    } else {
      const manifest = JSON.parse(fs.readFileSync(f.commonManifestPath, 'utf8'));
      manifest.migrations[0].sha256 = '0'.repeat(64);
      writeJson(f.commonManifestPath, manifest);
      assert.throws(() => validateGoverned(validateDualRoot, f), /common manifest checksum mismatch/);
    }
    fs.rmSync(f.base, {recursive: true, force: true});
  }
});

test('unknown product, missing manifest reference and invalid fileset hard-fail', async () => {
  const {validateDualRoot} = await import(validatorPath);
  for (const kind of ['unknown', 'missing-manifest', 'invalid-fileset']) {
    const f = governedFixture();
    if (kind === 'unknown') {
      fs.writeFileSync(path.join(f.dirs.existing, '20260722000100_unknown_product.sql'), 'select 4;\n');
      assert.throws(() => validateGoverned(validateDualRoot, f), /unknown existing-only migration/);
    } else if (kind === 'missing-manifest') {
      const catalog = JSON.parse(fs.readFileSync(f.productCatalogPath, 'utf8'));
      catalog.releases[0].manifest = 'docs/release/MISSING.json';
      writeJson(f.productCatalogPath, catalog);
      assert.throws(() => validateGoverned(validateDualRoot, f), /missing manifest reference/);
    } else {
      const fileset = path.join(f.base, 'docs/release/FILESET.json');
      const value = JSON.parse(fs.readFileSync(fileset, 'utf8'));
      value.files[0].sha256 = 'not-a-checksum';
      writeJson(fileset, value);
      assert.throws(() => validateGoverned(validateDualRoot, f), /invalid product migration entry/);
    }
    fs.rmSync(f.base, {recursive: true, force: true});
  }
});

test('existing-only product migration in bootstrap is rejected as wrong category', async () => {
  const {validateDualRoot} = await import(validatorPath);
  const f = governedFixture();
  fs.copyFileSync(path.join(f.dirs.existing, f.productName), path.join(f.dirs.bootstrap, f.productName));
  assert.throws(() => validateGoverned(validateDualRoot, f), /uncatalogued common migration in bootstrap|wrong migration category/);
  fs.rmSync(f.base, {recursive: true, force: true});
});

test('historical Foundation baseline byte mutation hard-fails', async () => {
  const {assertBaseline} = await import(path.join(root, 'supabase-bootstrap/scripts/guardrails.mjs'));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-governance-baseline-byte-'));
  const candidate = path.join(base, '00000000000000_authoritative_baseline.sql');
  const bytes = fs.readFileSync(path.join(root, 'supabase/migrations/00000000000000_authoritative_baseline.sql'));
  fs.writeFileSync(candidate, Buffer.concat([bytes, Buffer.from('\n-- forbidden mutation\n')]));
  assert.throws(() => assertBaseline(candidate), /baseline checksum mismatch/);
  fs.rmSync(base, {recursive: true, force: true});
});
