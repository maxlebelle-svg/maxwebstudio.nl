const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrations = [
  '20260726200000_partner_profile_role_status_foundation.sql',
  '20260726201000_partner_onboarding_gate_foundation.sql',
  '20260726202000_partner_training_content_v1.sql',
  '20260726203000_partner_assessment_certification.sql',
  '20260726204000_partner_canonical_commission.sql',
  '20260726205000_partner_certification_activation_control.sql',
];

test('B1-B5 migration chain is ordered, forward-only and transaction bounded', () => {
  assert.deepEqual(migrations.slice().sort(), migrations);
  for (const filename of migrations) {
    const sql = fs.readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8');
    assert.match(sql, /^--[\s\S]*\bbegin;/i, filename);
    assert.match(sql, /\bcommit;\s*$/i, filename);
    assert.doesNotMatch(sql, /\bdrop\s+(?:table|column|schema)\b|\btruncate\b/i, filename);
  }
});

test('partner runtime contains no outbound mail, payment provider call, or production deployment', () => {
  const files = ['partner-onboarding.js', 'admin-partner-onboarding.js', 'partner-commission.js'];
  const source = files.map((file) => fs.readFileSync(path.join(root, 'functions', file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /api\.mollie\.com|resend\.com|sendgrid|netlify.*deploy|supabase.*db push/i);
  assert.doesNotMatch(source, /customer_invoices/);
});

test('B6 evidence remains explicit NO-GO until real staging and legal signing are certified', () => {
  const report = fs.readFileSync(path.join(root, 'docs/PARTNER_ONBOARDING_V1_B6_STAGING_READINESS.md'), 'utf8');
  assert.match(report, /NO-GO \/ STAGING CERTIFICATION NOT COMPLETED/);
  assert.match(report, /468\/475 geslaagd; 7 mislukt/);
  assert.match(report, /g[eé]én digitaal ondertekende opdrachtovereenkomst/i);
  assert.match(report, /Niet mergen naar main en niet deployen naar productie/);
});
