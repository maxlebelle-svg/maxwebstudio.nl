const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260724130000_repair_preview_quality_report_schema_drift.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

test('repair is ordered after the existing bridge and CP-A migrations', () => {
  const version = path.basename(migrationPath).slice(0, 14);
  assert.ok(version > '20260724110000');
  assert.ok(version > '20260724120000');
});

test('repair adds only the proven nullable jsonb quality_report column', () => {
  assert.match(migration, /alter table public\.website_preview_versions\s+add column if not exists quality_report jsonb null;/i);
  assert.match(migration, /actual_type is distinct from 'jsonb'/);
  assert.match(migration, /actual_not_null/);
  assert.match(migration, /actual_default is not null/);
  assert.match(migration, /using errcode = '42804'/);
});

test('repair does not recreate legacy billing or modify security policy', () => {
  assert.doesNotMatch(migration, /customer_invoices/i);
  assert.doesNotMatch(migration, /customer_subscriptions/i);
  assert.doesNotMatch(migration, /create policy|drop policy|enable row level security/i);
  assert.doesNotMatch(migration, /\bgrant\b|\brevoke\b/i);
  assert.doesNotMatch(migration, /\bdrop\s+(table|column|schema)\b/i);
});

test('repair is transactional, fail-closed, and safely repeatable', () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /lock_timeout = '5s'/);
  assert.match(migration, /statement_timeout = '60s'/);
  assert.match(migration, /to_regclass\('public\.website_preview_versions'\) is null/);
  assert.match(migration, /add column if not exists quality_report/);
  assert.match(migration, /into strict actual_type, actual_not_null, actual_default/);
});
