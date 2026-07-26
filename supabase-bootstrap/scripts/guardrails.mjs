import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const BASELINE_VERSION = '00000000000000';
export const BASELINE_FILE = `${BASELINE_VERSION}_authoritative_baseline.sql`;
export const BASELINE_SHA256 = '1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315';
export const CUTOVER_VERSION = '20260721000000';
export const REMOTE_ENV_KEYS = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_ID', 'SUPABASE_PROJECT_REF', 'SUPABASE_DB_URL', 'DATABASE_URL'];

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function assertLocalSentinel(env = process.env) {
  if (env.F0E_LOCAL_ONLY !== '1') throw new Error('F0E_LOCAL_ONLY=1 is required');
  const present = REMOTE_ENV_KEYS.filter((key) => Boolean(env[key]));
  if (present.length) throw new Error(`remote environment variables are forbidden: ${present.join(', ')}`);
}

export function assertLocalDbUrl(raw) {
  if (!raw) throw new Error('an explicit local database URL is required');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('only PostgreSQL URLs are allowed');
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error(`non-local TCP host is forbidden: ${url.hostname}`);
  if (url.password) throw new Error('credentials are forbidden in the local PoC URL');
  return url;
}

export function assertDisposableWorkspace(raw) {
  const resolved = path.resolve(raw || '');
  if (!resolved.startsWith('/private/tmp/f0e-') && !resolved.startsWith('/tmp/f0e-')) {
    throw new Error('workspace must be an explicit /private/tmp/f0e-* path');
  }
  return resolved;
}

export function assertBaseline(source) {
  const bytes = fs.readFileSync(source);
  const actual = sha256(bytes);
  if (actual !== BASELINE_SHA256) throw new Error(`baseline checksum mismatch: ${actual}`);
  return bytes;
}

export function migrationVersion(filename) {
  return filename.match(/^(\d{14})_.*\.sql$/)?.[1] || null;
}

export function assertBootstrapFiles(files) {
  const sql = files.filter((name) => name.endsWith('.sql'));
  if (sql.length !== 1 || sql[0] !== BASELINE_FILE) throw new Error('bootstrap root must contain exactly the authoritative baseline');
}

export function assertCommonFiles(files) {
  for (const name of files.filter((entry) => entry.endsWith('.sql'))) {
    const version = migrationVersion(name);
    if (!version || version < CUTOVER_VERSION) throw new Error(`common migration before cutover is forbidden: ${name}`);
    if (version === BASELINE_VERSION) throw new Error('baseline is forbidden in the common root');
  }
}

export function assertHistory(rows, expectedVersions) {
  const versions = rows.map((row) => String(row.version));
  if (versions.length !== new Set(versions).size) throw new Error('multiple or duplicate history rows are forbidden');
  if (versions.some((version) => version !== BASELINE_VERSION && version < CUTOVER_VERSION)) throw new Error('synthetic historical markers are forbidden');
  if (JSON.stringify(versions) !== JSON.stringify(expectedVersions)) throw new Error(`unexpected history: ${versions.join(',')}`);
}

export function assertEmptyTarget(state) {
  if (state.publicTableCount > 0 && !state.historyVersions.includes(BASELINE_VERSION)) {
    throw new Error('partial baseline without the genuine baseline history row');
  }
  if (state.storageObjectCount > 0 || state.testBucketCount > 0) throw new Error('storage object data or testbucket is forbidden');
}
