const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260726140000_partner_assessment_certification.sql'), 'utf8');

test('assessment is versioned, server-scored, capped, and idempotent', () => {
  assert.match(sql, /'partner_knowledge_nl_v1'.*'partner_training_nl_v1'/s);
  assert.match(sql, /'published', 80, 3/);
  assert.match(sql, /partner_submit_assessment/);
  assert.match(sql, /question ->> 'correct'/);
  assert.match(sql, /Maximum assessment attempts reached/);
  assert.match(sql, /unique \(onboarding_id, idempotency_key\)/);
  assert.match(sql, /Published assessment versions are immutable/);
});

test('failed assessment cannot certify and certification requires every required step', () => {
  assert.match(sql, /status = case when did_pass then 'completed' else 'failed' end/);
  assert.match(sql, /status = case when did_pass then 'awaiting_documents' else 'assessment_failed' end/);
  assert.match(sql, /where onboarding_id = onboarding_record\.id and required and status <> 'completed'/);
  assert.match(sql, /A passing assessment is required/);
});

test('certificate has verifiable identity, internal disclaimer, expiry and immutable evidence', () => {
  assert.match(sql, /MWS-PARTNER-/);
  assert.match(sql, /verification_hash text not null/);
  assert.match(sql, /Interne Max Webstudio-kwalificatie; geen wettelijk erkend diploma/);
  assert.match(sql, /issued \+ interval '1 year'/);
  assert.match(sql, /Certificate identity and evidence are immutable/);
});

test('revocation is an admin-only fail-closed status transition', () => {
  assert.match(sql, /role in \('super_admin','admin'\)/);
  assert.match(sql, /Only an active admin may revoke certification/);
  assert.match(sql, /set status='revoked'/);
  assert.match(sql, /set status='disabled'/);
  assert.match(sql, /'certificate\.revoked'/);
});

test('assessment answers and certificate mutations are never exposed to authenticated clients', () => {
  assert.doesNotMatch(sql, /grant select on public\.partner_assessment_versions to authenticated/);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]*to authenticated/i);
  const api = fs.readFileSync(path.join(root, 'functions/partner-onboarding.js'), 'utf8');
  assert.match(api, /options: Array\.isArray\(question\.options\)/);
  assert.doesNotMatch(api, /correct:\s*question\.correct/);
  assert.match(api, /partner_submit_assessment/);
  assert.match(api, /partner_finalize_certification/);
});

test('admin portal can verify and revoke an accessible certificate', () => {
  const endpoint = fs.readFileSync(path.join(root, 'functions/admin-partner-onboarding.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'public/admin-partners.html'), 'utf8');
  assert.match(endpoint, /certificateId/);
  assert.match(endpoint, /partner_revoke_certificate/);
  assert.match(endpoint, /onboarding_id=in/);
  assert.match(page, /Verifieer een certificaat-ID/);
  assert.match(page, /interne kwalificatie/i);
});
