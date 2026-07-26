#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { BASELINE_FILE, BASELINE_SHA256, CUTOVER_VERSION, migrationVersion, sha256 } from './guardrails.mjs';

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true });
}

function readJson(file, label) {
  if (!file) throw new Error(`${label} path is required`);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`invalid ${label}: ${error.message}`);
  }
  return value;
}

function assertNoUnsafeEntries(dir) {
  for (const entry of files(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink() || fs.lstatSync(full).isSymbolicLink()) throw new Error(`symlink forbidden: ${full}`);
    if (entry.name.startsWith('.') || /(?:~|\.tmp|\.swp|\.bak)$/i.test(entry.name)) throw new Error(`hidden or temporary file forbidden: ${full}`);
  }
}

function migrationMap(dir, mode) {
  assertNoUnsafeEntries(dir);
  const result = new Map();
  const versions = new Set();
  for (const entry of files(dir)) {
    if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
    const version = migrationVersion(entry.name);
    if (!version) throw new Error(`invalid migration filename: ${entry.name}`);
    if (versions.has(version)) throw new Error(`duplicate migration version: ${version}`);
    versions.add(version);
    if (version === '00000000000000') {
      if (entry.name !== BASELINE_FILE) throw new Error(`baseline forbidden: ${entry.name}`);
      const baselineBytes = fs.readFileSync(path.join(dir, entry.name));
      if (sha256(baselineBytes) !== BASELINE_SHA256) throw new Error(`baseline checksum mismatch: ${entry.name}`);
      if (mode === 'existing') continue;
      if (mode !== 'bootstrap') throw new Error(`baseline forbidden: ${entry.name}`);
    } else if (version < CUTOVER_VERSION && mode !== 'existing') {
      throw new Error(`common migration before cutover: ${entry.name}`);
    }
    const bytes = fs.readFileSync(path.join(dir, entry.name));
    if (version === '00000000000000' || version >= CUTOVER_VERSION) {
      result.set(entry.name, { version, bytes, size: bytes.length, sha256: sha256(bytes) });
    }
  }
  return result;
}

function validateCommonManifest(commonManifestPath, canonical, repositoryRoot) {
  const manifest = readJson(commonManifestPath, 'common migration manifest');
  if (manifest.schemaVersion !== 1 || manifest.status !== 'active' || manifest.cutoverVersion !== CUTOVER_VERSION) {
    throw new Error('invalid common migration manifest contract');
  }
  if (!Array.isArray(manifest.migrations)) throw new Error('invalid common migration fileset');
  const approved = new Map();
  const versions = new Set();
  for (const entry of manifest.migrations) {
    const version = migrationVersion(entry.filename || '');
    if (!version || version !== String(entry.version) || version < CUTOVER_VERSION) throw new Error(`invalid common migration entry: ${entry.filename || '<missing>'}`);
    if (approved.has(entry.filename) || versions.has(version)) throw new Error(`duplicate common migration entry: ${entry.filename}`);
    if (entry.canonicalSource !== `supabase-common/migrations/${entry.filename}` ||
        entry.bootstrapOutput !== `supabase-bootstrap/supabase/migrations/${entry.filename}` ||
        entry.existingOutput !== `supabase/migrations/${entry.filename}` ||
        entry.byteIdentical !== true || entry.validatorStatus !== 'PASS' ||
        !Number.isInteger(entry.bytes) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
      throw new Error(`invalid common migration fileset: ${entry.filename}`);
    }
    for (const relative of [entry.canonicalSource, entry.bootstrapOutput, entry.existingOutput]) {
      const full = path.join(repositoryRoot, relative);
      if (!fs.existsSync(full)) throw new Error(`missing common manifest reference: ${relative}`);
    }
    approved.set(entry.filename, entry);
    versions.add(version);
  }
  for (const name of canonical.keys()) if (!approved.has(name)) throw new Error(`uncatalogued common migration: ${name}`);
  for (const name of approved.keys()) if (!canonical.has(name)) throw new Error(`missing common migration: ${name}`);
  for (const [name, source] of canonical) {
    const entry = approved.get(name);
    if (source.size !== entry.bytes || source.sha256 !== entry.sha256) throw new Error(`common manifest checksum mismatch: ${name}`);
  }
  return approved;
}

function validateProductCatalog(productCatalogPath, repositoryRoot) {
  if (!productCatalogPath) return new Map();
  const catalog = readJson(productCatalogPath, 'product migration catalog');
  if (catalog.schemaVersion !== 1 || catalog.status !== 'approved' || catalog.category !== 'existing-only/product' || !Array.isArray(catalog.releases)) {
    throw new Error('invalid product migration catalog');
  }
  const approved = new Map();
  for (const release of catalog.releases) {
    if (!release.manifest || !release.fileset) throw new Error('product migration missing manifest reference');
    const manifestPath = path.join(repositoryRoot, release.manifest);
    const filesetPath = path.join(repositoryRoot, release.fileset);
    if (!fs.existsSync(manifestPath) || !fs.existsSync(filesetPath)) throw new Error('product migration missing manifest reference');
    const manifest = readJson(manifestPath, 'product release manifest');
    const fileset = readJson(filesetPath, 'product release fileset');
    if (!Array.isArray(manifest.executionOrder) || !Array.isArray(fileset.files)) throw new Error(`invalid product fileset: ${release.fileset}`);
    const declared = manifest.executionOrder.slice().sort();
    const checksummed = fileset.files.filter((entry) => /^supabase\/migrations\/.*\.sql$/.test(entry.path || '')).slice().sort((a, b) => a.path.localeCompare(b.path));
    if (JSON.stringify(declared) !== JSON.stringify(checksummed.map((entry) => entry.path))) throw new Error(`invalid product fileset: ${release.fileset}`);
    for (const entry of checksummed) {
      const filename = path.basename(entry.path);
      const version = migrationVersion(filename);
      if (!version || version < CUTOVER_VERSION || entry.path !== `supabase/migrations/${filename}` || !Number.isInteger(entry.bytes) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
        throw new Error(`invalid product migration entry: ${entry.path || '<missing>'}`);
      }
      if (approved.has(filename)) throw new Error(`duplicate product migration entry: ${filename}`);
      approved.set(filename, { ...entry, filename, version, releaseManifest: release.manifest, releaseFileset: release.fileset });
    }
  }
  return approved;
}

export function validateDualRoot({ canonicalDir, bootstrapDir, existingDir, commonManifestPath, productCatalogPath, repositoryRoot }) {
  const canonical = migrationMap(canonicalDir, 'canonical');
  const bootstrap = migrationMap(bootstrapDir, 'bootstrap');
  const existing = migrationMap(existingDir, 'existing');
  const root = path.resolve(repositoryRoot || path.join(existingDir, '..', '..'));
  const common = commonManifestPath
    ? validateCommonManifest(commonManifestPath, canonical, root)
    : new Map([...canonical.keys()].map((name) => [name, null]));
  const product = validateProductCatalog(productCatalogPath, root);
  const baseline = bootstrap.get(BASELINE_FILE);
  if (!baseline || baseline.sha256 !== BASELINE_SHA256) throw new Error('bootstrap baseline missing or checksum mismatch');

  for (const [name, source] of canonical) {
    for (const [label, output] of [['bootstrap', bootstrap], ['existing', existing]]) {
      const target = output.get(name);
      if (!target) throw new Error(`missing common copy in ${label}: ${name}`);
      if (target.size !== source.size || target.sha256 !== source.sha256 || !target.bytes.equals(source.bytes)) {
        throw new Error(`common byte drift in ${label}: ${name}`);
      }
    }
  }
  for (const [name, item] of bootstrap) {
    if (item.version === '00000000000000') continue;
    if (!common.has(name)) throw new Error(`uncatalogued common migration in bootstrap: ${name}`);
    if (product.has(name)) throw new Error(`wrong migration category in bootstrap: ${name}`);
  }
  for (const [name, item] of existing) {
    if (item.version === '00000000000000' || common.has(name)) continue;
    const entry = product.get(name);
    if (!entry) throw new Error(`unknown existing-only migration: ${name}`);
    if (item.size !== entry.bytes || item.sha256 !== entry.sha256) throw new Error(`product migration checksum mismatch: ${name}`);
  }
  for (const [name, entry] of product) {
    if (common.has(name)) throw new Error(`wrong migration category: ${name}`);
    if (bootstrap.has(name)) throw new Error(`wrong migration category in bootstrap: ${name}`);
    const item = existing.get(name);
    if (!item) throw new Error(`missing existing-only migration: ${name}`);
    const full = path.join(root, entry.path);
    if (!fs.existsSync(full)) throw new Error(`missing product migration: ${entry.path}`);
    const bytes = fs.readFileSync(full);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`product migration checksum mismatch: ${name}`);
  }
  return [...canonical.values()].map(({ version, size, sha256 }) => ({ version, size, sha256 }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, required = true) => {
    const index = process.argv.indexOf(name);
    if (index < 0 || !process.argv[index + 1]) {
      if (!required) return undefined;
      throw new Error(`${name} is required`);
    }
    return path.resolve(process.argv[index + 1]);
  };
  const existingDir = arg('--existing');
  const manifest = validateDualRoot({
    canonicalDir: arg('--canonical'),
    bootstrapDir: arg('--bootstrap'),
    existingDir,
    commonManifestPath: arg('--common-manifest', false),
    productCatalogPath: arg('--product-catalog', false),
    repositoryRoot: arg('--repository-root', false) || path.resolve(existingDir, '..', '..')
  });
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}
