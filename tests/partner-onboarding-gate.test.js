const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const {
  REQUIRED_ONBOARDING_STEPS,
  SELF_COMPLETABLE_STEPS,
  evaluatePartnerGate,
} = require('../functions/services/partnerOnboardingAccessService');

function completedSteps() {
  return REQUIRED_ONBOARDING_STEPS.map((step_key, index) => ({ step_key, step_order: index + 1, status: 'completed' }));
}

test('partner gate stays closed until the canonical profile and onboarding are active', () => {
  const profile = { id: 'profile-1', role: 'sales_partner', status: 'pending' };
  assert.equal(evaluatePartnerGate({ profile }).allowed, false);
  const result = evaluatePartnerGate({
    profile: { ...profile, status: 'active' },
    partnerProfile: { status: 'onboarding' },
    onboarding: { status: 'in_progress' },
    steps: completedSteps(),
  });
  assert.equal(result.allowed, false);
  assert.equal(result.redirectTo, '/partner-onboarding.html');
});

test('partner gate reports missing required steps and opens only after every step', () => {
  const input = {
    profile: { role: 'sales_partner', status: 'active' },
    partnerProfile: { status: 'active' },
    onboarding: { status: 'active' },
    steps: completedSteps().slice(0, -1),
  };
  const blocked = evaluatePartnerGate(input);
  assert.deepEqual(blocked.incompleteSteps, ['document_acceptance']);
  assert.equal(evaluatePartnerGate({ ...input, steps: completedSteps() }).allowed, true);
});

test('active partner is re-blocked for expired certification or a newly published agreement', () => {
  const active = {
    profile: { role:'sales_partner', status:'active' },
    partnerProfile: { status:'active' },
    onboarding: { status:'active' },
    steps: completedSteps(),
  };
  assert.equal(evaluatePartnerGate({ ...active, certificateCurrent:false }).reason, 'certificate_not_valid');
  const changedAgreement = evaluatePartnerGate({ ...active, documentAcceptanceCurrent:false });
  assert.equal(changedAgreement.allowed, false);
  assert.deepEqual(changedAgreement.incompleteSteps, ['document_acceptance']);
});

test('only content-training steps can be self-completed', () => {
  assert.equal(SELF_COMPLETABLE_STEPS.length, 7);
  assert.equal(SELF_COMPLETABLE_STEPS.includes('commission_system'), false);
  assert.equal(SELF_COMPLETABLE_STEPS.includes('knowledge_assessment'), false);
  assert.equal(SELF_COMPLETABLE_STEPS.includes('document_acceptance'), false);
});

test('B2 migration uses service-role mutations, RLS reads, immutable events, and idempotency', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260726201000_partner_onboarding_gate_foundation.sql'), 'utf8');
  for (const table of ['partner_profiles', 'partner_onboardings', 'partner_onboarding_steps', 'partner_onboarding_events']) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /Partner onboarding events are immutable/);
  assert.match(sql, /unique \(onboarding_id, idempotency_key\)/);
  assert.match(sql, /mutation requires service_role/);
  assert.match(sql, /revoke all on public\.partner_profiles[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]*to authenticated/i);
});

test('central admin authentication enforces the partner gate by default', () => {
  const source = fs.readFileSync(path.join(root, 'functions/_admin-auth.js'), 'utf8');
  assert.match(source, /fetchPartnerGate/);
  assert.match(source, /options\.requirePartnerOnboarding !== false/);
  assert.match(source, /statusCode: 403/);
});

test('partner endpoint separates training from controlled workflow steps', () => {
  const source = fs.readFileSync(path.join(root, 'functions/partner-onboarding.js'), 'utf8');
  assert.match(source, /STEP_REQUIRES_SERVER_WORKFLOW/);
  assert.match(source, /SELF_COMPLETABLE_STEPS\.includes/);
  assert.match(source, /INVALID_IDEMPOTENCY_KEY/);
});

test('activation and login flows honor server-side operational access', () => {
  const activation = fs.readFileSync(path.join(root, 'public/account-activeren.html'), 'utf8');
  const login = fs.readFileSync(path.join(root, 'public/admin-login.html'), 'utf8');
  const guard = fs.readFileSync(path.join(root, 'public/src/admin-route-guard.js'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'public/src/services/adminAuthBridgeService.js'), 'utf8');
  assert.match(activation, /account_activated/);
  assert.match(activation, /partner-onboarding\.html/);
  assert.match(login, /access\?\.operational/);
  assert.match(guard, /await resolveAdminAuth\(\)/);
  assert.match(bridge, /account\?\.access\?\.operational !== false/);
  assert.match(bridge, /PARTNER_ONBOARDING_REQUIRED/);
});
