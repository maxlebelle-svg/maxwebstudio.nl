const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs/foundation-f0');
const baselinePath = path.join(root, 'supabase/migrations/00000000000000_authoritative_baseline.sql');
const bootstrapPath = path.join(root, 'supabase-bootstrap/supabase/migrations/00000000000000_authoritative_baseline.sql');
const oldSha = JSON.parse(fs.readFileSync(path.join(docs, 'F0H_BASELINE_CHECKSUM_MANIFEST.json'), 'utf8')).authoritative.oldSha256;
const newSha = '1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315';
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (name) => fs.readFileSync(path.join(docs, name), 'utf8');
const json = (name) => JSON.parse(read(name));
const required = [
  'F0H_BASELINE_DEFECT_INVENTORY.md','F0H_CHANGE_BOUNDARY.json','F0H_BASELINE_CHANGE_REPORT.md',
  'F0H_BASELINE_CHECKSUM_MANIFEST.json','F0H_COLUMN_RECOMPARISON.json','F0H_COLUMN_RECOMPARISON_REPORT.md',
  'F0H_LOCAL_DATABASE_VALIDATION.md','F0H_RECOVERED_MIGRATION_COMPATIBILITY.md','F0H_DUAL_ROOT_REVALIDATION.md',
  'F0H_SECURITY_REVALIDATION.md','F0H_EXISTING_ENVIRONMENT_IMPACT.md','F0H_CUTOVER_REASSESSMENT.md',
  'F0H_BASELINE_CORRECTION_REPORT.md'
];

test('all required F0-h deliverables exist and machine-readable files parse', () => {
  for (const name of required) assert.ok(fs.existsSync(path.join(docs, name)), name);
  for (const name of required.filter((name) => name.endsWith('.json'))) assert.doesNotThrow(() => json(name), name);
});

test('exactly the four pre-proven baseline defects changed', () => {
  const corrected = fs.readFileSync(baselinePath, 'utf8');
  const replacements = [
    ["  merged_fields text[] not null default array[]::text[],", "  merged_fields jsonb not null default '{}'::jsonb,"],
    ["  created_at timestamptz not null default now(),", "  created_at timestamptz not null default pg_catalog.clock_timestamp(),"],
    ["  updated_at timestamptz not null default now(),", "  updated_at timestamptz not null default pg_catalog.clock_timestamp(),"],
    ["  expires_at timestamptz not null default (now() + interval '30 days'),", "  expires_at timestamptz not null default (pg_catalog.clock_timestamp() + interval '30 days'),"]
  ];
  const blockStart = corrected.indexOf('create table public.lead_intake_idempotency (');
  const blockEnd = corrected.indexOf('\n);', blockStart) + 3;
  assert.ok(blockStart >= 0 && blockEnd > blockStart);
  let targetBlock = corrected.slice(blockStart, blockEnd);
  for (const [current, previous] of replacements) {
    assert.equal(targetBlock.split(current).length - 1, 1, current);
    targetBlock = targetBlock.replace(current, previous);
  }
  const reconstructed = `${corrected.slice(0, blockStart)}${targetBlock}${corrected.slice(blockEnd)}`;
  assert.equal(digest(Buffer.from(reconstructed)), oldSha);
  assert.equal(digest(Buffer.from(corrected)), newSha);
  const boundary = json('F0H_CHANGE_BOUNDARY.json');
  assert.deepEqual(boundary.allowedSqlObjects.map((item) => item.column), ['merged_fields','created_at','updated_at','expires_at']);
  assert.deepEqual(new Set(boundary.allowedSqlObjects.map((item) => `${item.schema}.${item.table}`)), new Set(['public.lead_intake_idempotency']));
});

test('authoritative and bootstrap baselines are byte-identical with consistent active checksums', async () => {
  const source = fs.readFileSync(baselinePath);
  const output = fs.readFileSync(bootstrapPath);
  assert.ok(source.equals(output));
  assert.equal(digest(source), newSha);
  const checksum = json('F0H_BASELINE_CHECKSUM_MANIFEST.json');
  assert.equal(checksum.authoritative.newSha256, newSha);
  assert.equal(checksum.authoritative.byteDelta, -64);
  assert.equal(checksum.authoritative.statementCountDelta, 0);
  assert.equal(checksum.bootstrapMaterialization.sha256, newSha);
  assert.equal(json('F0B_BASELINE_OBJECT_MANIFEST.json').baselineSha256, newSha);
  assert.equal(json('F0C_MIGRATION_SET_INVENTORY.json').migrations.find((item) => item.version === '00000000000000').sha256, newSha);
  assert.equal(json('F0D_DECISION_MATRIX.json').baselineSha256, newSha);
  const guardrails = await import(path.join(root, 'supabase-bootstrap/scripts/guardrails.mjs'));
  assert.equal(guardrails.BASELINE_SHA256, newSha);
});

test('old checksum remains audit provenance and is absent from active guards and tests', () => {
  for (const file of [
    'supabase-bootstrap/scripts/guardrails.mjs',
    'supabase-bootstrap/supabase/migrations/BASELINE_MATERIALIZATION.json',
    'supabase-bootstrap/README.md',
    'tests/foundation-f0d-bootstrap-design.test.js',
    'tests/foundation-f0e-bootstrap-poc.test.js',
    'tests/foundation-f0f-dual-root-poc.test.js'
  ]) assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), new RegExp(oldSha), file);
  assert.match(read('F0H_BASELINE_CHANGE_REPORT.md'), new RegExp(oldSha));
});

test('all 33 runtime tables and 657 columns are re-covered with zero defects or unclassified differences', () => {
  const comparison = json('F0H_COLUMN_RECOMPARISON.json');
  assert.equal(comparison.runtimeTableCount, 33);
  assert.equal(comparison.runtimeActiveColumns, 657);
  assert.equal(comparison.baselineActiveColumns, 612);
  assert.equal(comparison.unionColumnCount, 678);
  assert.equal(comparison.resolvedF0gBaselineDefectCount, 4);
  assert.equal(comparison.unresolvedBaselineDefectCount, 0);
  assert.equal(comparison.unclassifiedDifferenceCount, 0);
  assert.deepEqual(comparison.classificationCounts, {
    equivalent_after_normalization: 591,
    intentional_baseline_exclusion: 66,
    intentional_security_or_design_difference: 21
  });
  for (const column of ['merged_fields','created_at','updated_at','expires_at']) {
    const item = comparison.comparisons.find((entry) => entry.table === 'lead_intake_idempotency' && entry.column === column);
    assert.equal(item.classification, 'equivalent_after_normalization');
    assert.equal(item.resolution, 'resolved_by_F0h_baseline_correction');
  }
});

test('future and runtime-only tables remain deliberately excluded', () => {
  const baseline = fs.readFileSync(baselinePath, 'utf8');
  for (const table of ['media_assets','asset_ingest_operations','asset_ingest_operation_events','ai_assistant_drafts','ai_drafts','client_portal_notifications','demo_preview_accesses']) {
    assert.doesNotMatch(baseline, new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, 'i'), table);
  }
});

test('recovered migration evidence and all historical migration checksums remain unchanged', () => {
  const recovered = json('F0G_RECOVERED_BYTE_MANIFEST.json').recovered;
  assert.deepEqual(recovered.map((item) => digest(fs.readFileSync(path.join(root, item.evidencePath)))), recovered.map((item) => item.sha256));
  const matrix = json('BASELINE_INCLUSION_MATRIX.json');
  for (const [filename, expected] of Object.entries(matrix.migrationChecksums.files)) {
    const local = path.join(root, filename);
    const bytes = fs.existsSync(local)
      ? fs.readFileSync(local)
      : execFileSync('git', ['show', `codex/rc1-clean-migration-lineage:${filename}`], {cwd: root});
    assert.equal(digest(bytes), expected, filename);
  }
});

test('lead intake RPC definitions are compatible with the corrected final-state columns', () => {
  const recovered = fs.readFileSync(path.join(docs, 'evidence/recovered-migrations/20260720200000_transactional_lead_intake_rpc.sql'), 'utf8');
  for (const pattern of [
    /merged_fields text\[\] not null default array\[\]::text\[\]/,
    /v_merged_fields text\[\] := array\[\]::text\[\]/,
    /cardinality\(v_intake\.merged_fields\)/,
    /to_jsonb\(v_intake\.merged_fields\)/,
    /created_at timestamptz not null default now\(\)/,
    /expires_at timestamptz not null default \(now\(\) \+ interval '30 days'\)/
  ]) assert.match(recovered, pattern);
  const comparison = json('F0H_COLUMN_RECOMPARISON.json');
  assert.equal(comparison.comparisons.filter((item) => item.table === 'lead_intake_idempotency' && item.propertyDifferences.length).length, 0);
});

test('local database, dual-root and security evidence are green', () => {
  assert.match(read('F0H_LOCAL_DATABASE_VALIDATION.md'), /Status: \*\*PASS\*\*/);
  assert.match(read('F0H_LOCAL_DATABASE_VALIDATION.md'), /residual fixture rows: 0/);
  assert.match(read('F0H_DUAL_ROOT_REVALIDATION.md'), /Status: \*\*PASS\*\*/);
  assert.match(read('F0H_DUAL_ROOT_REVALIDATION.md'), /612 statements/);
  assert.match(read('F0H_DUAL_ROOT_REVALIDATION.md'), /baseline history rows remained 0/);
  assert.match(read('F0H_SECURITY_REVALIDATION.md'), /PASS \/ NO REGRESSION/);
  for (const invariant of ['PUBLIC EXECUTE grants','anon direct public-table grants','PUBLIC policy roles','public tables without RLS','forced-RLS tables','policies on `storage.objects`','test buckets']) {
    assert.match(read('F0H_SECURITY_REVALIDATION.md'), new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), invariant);
  }
});

test('F0-h created no reconciliation SQL; later R2-A common work remains non-remote', () => {
  const boundary = json('F0H_CHANGE_BOUNDARY.json');
  assert.ok(boundary.forbiddenFileClasses.includes('reconciliation migrations'));
  assert.ok(boundary.forbiddenFileClasses.includes('product/common migration materializations'));
  assert.equal(boundary.allowedNewFilePatterns.some((pattern) => /migration|\.sql/i.test(pattern)), false);
  const commonManifest = JSON.parse(fs.readFileSync(path.join(root, 'supabase-common/migrations/COMMON_MIGRATION_MANIFEST.json'), 'utf8'));
  assert.deepEqual(
    fs.readdirSync(path.join(root, 'supabase-common/migrations')).filter((name) => name.endsWith('.sql')).sort(),
    commonManifest.migrations.map((entry) => entry.filename).sort()
  );
  const report = read('F0H_BASELINE_CORRECTION_REPORT.md');
  assert.match(report, /No remote database was read or written in F0-h/);
  assert.match(report, /Nothing was committed, pushed or deployed/);
  assert.match(read('F0H_CUTOVER_REASSESSMENT.md'), /schema_evidence_complete_candidate_ready/);
  assert.match(read('F0H_CUTOVER_REASSESSMENT.md'), /not remote-application approval/i);
});
