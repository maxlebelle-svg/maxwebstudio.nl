const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const closurePath = path.join(root, 'docs/foundation-f0/FOUNDATION_F0_CLOSURE.md');
const signoffPath = path.join(root, 'docs/foundation-f0/FOUNDATION_F0_SIGNOFF.md');
const roadmapPath = path.join(root, 'docs/release-readiness/RELEASE_READINESS_ROADMAP.md');
const phasesPath = path.join(root, 'docs/release-readiness/RELEASE_READINESS_PHASES.json');
const r2bCompletionPath = path.join(root, 'docs/release-readiness/R2B_COMPLETION_REPORT.md');
const closure = fs.readFileSync(closurePath, 'utf8');
const signoff = fs.readFileSync(signoffPath, 'utf8');
const roadmap = fs.readFileSync(roadmapPath, 'utf8');
const r2bCompletion = fs.readFileSync(r2bCompletionPath, 'utf8');
const phases = JSON.parse(fs.readFileSync(phasesPath, 'utf8'));

test('Foundation F0 has one explicit terminal closure status', () => {
  assert.match(closure, /Status: \*\*FOUNDATION COMPLETE\*\*/);
  assert.match(closure, /schema_evidence_complete_candidate_ready/);
  for (const phase of ['F0-a','F0-b','F0-c','F0-d','F0-e','F0-f','F0-g','F0-h']) assert.match(closure, new RegExp(phase));
});

test('final sign-off freezes the exact baseline and terminal Foundation phase', () => {
  assert.match(signoff, /Status: \*\*COMPLETE AND FROZEN\*\*/);
  assert.match(signoff, /Final Foundation phase: `F0-h`/);
  assert.match(signoff, /1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315/);
  assert.match(signoff, /alleen heropend wanneer een concreet, reproduceerbaar Foundation-defect wordt aangetoond/i);
  assert.equal(phases.foundationSignoff, 'docs/foundation-f0/FOUNDATION_F0_SIGNOFF.md');
});

test('Foundation scope ends at F0-h', () => {
  assert.deepEqual(phases.forbiddenFoundationSuccessors, ['F0-i','F0-j','F0-k']);
  assert.match(closure, /geen Foundation-fasen F0-i, F0-j of F0-k/i);
  for (const suffix of ['i','j','k']) {
    assert.equal(fs.readdirSync(path.join(root, 'docs/foundation-f0')).some((name) => new RegExp(`^F0${suffix}`, 'i').test(name)), false);
  }
});

test('Release Readiness contains exactly ordered R1 through R6', () => {
  assert.deepEqual(phases.phases.map((item) => item.id), ['R1','R2','R3','R4','R5','R6']);
  assert.deepEqual(phases.phases.map((item) => item.name), [
    'Existing Environment Reconciliation Inventory',
    'Approved Reconciliations and Lead Index Correction',
    'Asset Release',
    'Common Migration Materialization',
    'Staging Validation',
    'Production Approval'
  ]);
  for (let index = 1; index < phases.phases.length; index += 1) {
    assert.deepEqual(phases.phases[index].dependsOn, [phases.phases[index - 1].id]);
  }
});

test('R1 is complete and the closed R2-B scope leaves every next category approval-gated', () => {
  assert.equal(phases.currentPhase, 'R2');
  assert.equal(phases.phases[0].status, 'complete');
  assert.equal(phases.phases[1].status, 'r2b_complete_next_category_scope_required');
  assert.match(r2bCompletion, /Status: \*\*COMPLETE — R2-B1 AND R2-B2 CLOSED\*\*/);
  assert.match(phases.nextAuthorizedCategory, /any next privilege category.*requires a new explicit scope and gates/i);
  assert.equal(phases.reconciliationSqlAuthorized, false);
  assert.equal(phases.remoteWritesAuthorized, false);
  assert.equal(phases.remoteExecutionApproved, false);
});

test('staging and production remain separately blocked', () => {
  assert.equal(phases.stagingApproved, false);
  assert.equal(phases.productionApproved, false);
  assert.match(roadmap, /Productie blijft NO-GO totdat R6 expliciet is goedgekeurd/);
  assert.match(roadmap, /geen remote actie zonder fase-specifieke toestemming/);
});

test('closure creates no migration or reconciliation SQL', () => {
  const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations'));
  assert.equal(migrationFiles.some((name) => /(?:foundation.*closure|release.*readiness)/i.test(name)), false);
  assert.equal(phases.historicalMigrationMutationAllowed, false);
  assert.match(roadmap, /geen wijziging van historische of recovered migrationbytes/);
});
