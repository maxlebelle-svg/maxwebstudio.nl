const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculateCommissionCents } = require('../functions/services/partnerCommissionService');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260726204000_partner_canonical_commission.sql'), 'utf8');

test('default progressive commission handles every boundary in integer cents', () => {
  assert.equal(calculateCommissionCents(0), 0);
  assert.equal(calculateCommissionCents(200000), 40000);
  assert.equal(calculateCommissionCents(500000), 115000);
  assert.equal(calculateCommissionCents(1000000), 265000);
  assert.equal(calculateCommissionCents(1100000), 300000);
  assert.equal(calculateCommissionCents(550000) - calculateCommissionCents(500000), 15000);
});

test('retroactive mode remains explicitly configurable without becoming the default', () => {
  assert.equal(calculateCommissionCents(500001, { calculationMethod: 'retroactive_tier' }), 150000);
  assert.equal(calculateCommissionCents(500001), 115000);
});

test('B5 depends only on canonical invoices, lines, quotes and payment evidence', () => {
  assert.match(sql, /to_regclass\('public\.invoices'\)/);
  assert.match(sql, /to_regclass\('public\.invoice_lines'\)/);
  assert.match(sql, /from public\.invoices where id=input_invoice_id/);
  assert.match(sql, /invoice_record\.status<>'paid'/);
  assert.match(sql, /invoice_record\.mollie_payment_status<>'paid'/);
  assert.match(sql, /invoice_record\.environment<>'production'/);
  assert.match(sql, /status='accepted' and accepted_at is not null/);
  assert.doesNotMatch(sql, /(?:from|join|update|insert into|references) public\.customer_invoices/i);
});

test('one provider payment can create only one earned ledger entry', () => {
  assert.match(sql, /unique\(provider,event_type,provider_payment_id\)/);
  assert.match(sql, /unique\(payment_event_id,entry_type\)/);
  assert.match(sql, /where provider=input_provider and provider_payment_id=input_provider_payment_id and event_type='paid'/);
  assert.match(sql, /return result_id/);
});

test('refund and chargeback append exact negative reversals without mutating history', () => {
  assert.match(sql, /input_reversal_type not in \('refund','chargeback'\)/);
  assert.match(sql, /-original_entry\.basis_ex_vat_cents,-original_entry\.commission_cents/);
  assert.match(sql, /Partner finance and acceptance evidence is immutable/);
});

test('commission requires valid lead attribution, active certification and accepted plan', () => {
  assert.match(sql, /Valid lead attribution is required/);
  assert.match(sql, /Partner must hold active valid certification/);
  assert.match(sql, /a\.status='accepted'/);
  assert.match(sql, /not version_record\.include_subscriptions/);
});

test('document acknowledgement is versioned and explicitly not a signed agreement', () => {
  assert.match(sql, /partner_legal_notice_nl_v1/);
  assert.match(sql, /geen vervanging voor een volledig ondertekende opdrachtovereenkomst/);
  assert.match(sql, /Every current required document version must be accepted/);
  const page = fs.readFileSync(path.join(root, 'public/src/partner/partner-onboarding.js'), 'utf8');
  assert.match(page, /geen vervanging voor een volledig ondertekende opdrachtovereenkomst/);
});
