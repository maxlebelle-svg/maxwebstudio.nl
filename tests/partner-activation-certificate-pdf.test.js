const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateCertificatePdf } = require('../functions/services/certificatePdfService');
const { _private: pdfEndpoint } = require('../functions/partner-certificate-pdf');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260726160000_partner_certification_activation_control.sql'), 'utf8');
const certificate = {
  certificateId: 'MWS-PARTNER-0123456789ABCDEF',
  partnerName: 'Zoë van den IJssel',
  certificationType: 'Gecertificeerd Max Webstudio Sales Partner',
  trainingVersionCode: 'partner_training_nl_v1',
  certificateVersion: 'mws_sales_partner_certificate_v1',
  authorizedSignerName: 'Max Webstudio Directie',
  authorizedSignerTitle: 'Bevoegde vertegenwoordiger',
  verificationPath: '/admin-partners.html?certificateId=MWS-PARTNER-0123456789ABCDEF',
  issuedAt: '2026-07-26T10:00:00Z',
  expiresAt: '2027-07-26T10:00:00Z',
  disclaimer: 'Interne Max Webstudio-kwalificatie; geen wettelijk erkend diploma.',
};

test('certification ends at certified and never activates the account implicitly', () => {
  assert.match(sql, /set status='certified',certified_at=issued/);
  const finalizeBody = sql.match(/create or replace function public\.partner_finalize_certification[\s\S]*?\n\$function\$;/i)?.[0] || '';
  assert.doesNotMatch(finalizeBody, /set status='active'/);
  assert.match(sql, /'activationRequired',true/);
});

test('only active admins can explicitly activate, suspend, or reactivate', () => {
  assert.match(sql, /input_action not in \('activate','suspend'\)/);
  assert.match(sql, /role in \('super_admin','admin'\)/);
  assert.match(sql, /Partner is not eligible for explicit activation/);
  assert.match(sql, /'partner\.activated'/);
  assert.match(sql, /'partner\.suspended'/);
  assert.match(sql, /set status='disabled'/);
});

test('exact published agreement bytes and declaration version are acceptance-bound', () => {
  assert.match(sql, /partner_assignment_agreement_nl_v1/);
  assert.match(sql, /public\.dca_0_sha256\(agreement\.content\)/);
  assert.match(sql, /partner_phase_b_documents_and_agreement_nl_v2/);
  assert.match(sql, /Every current required document and agreement version must be accepted/);
});

test('certificate PDF is a single self-contained PDF with identity and version metadata', () => {
  const pdf = generateCertificatePdf(certificate, { baseUrl:'https://staging.maxwebstudio.nl' });
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 8).toString('binary'), '%PDF-1.4');
  assert.match(pdf.toString('binary'), /MWS-PARTNER-0123456789ABCDEF/);
  assert.match(pdf.toString('binary'), /mws_sales_partner_certificate_v1/);
  assert.match(pdf.toString('binary'), /startxref/);
  assert.ok(pdf.length > 2500);
});

test('PDF download authorization is owner/admin/assigned-manager bound', () => {
  const partnerProfile = { profile_id:'profile-partner', assigned_manager_profile_id:'profile-manager' };
  assert.equal(pdfEndpoint.allowed({ id:'profile-partner', role:'sales_partner', status:'pending' }, partnerProfile), true);
  assert.equal(pdfEndpoint.allowed({ id:'other', role:'sales_partner', status:'active' }, partnerProfile), false);
  assert.equal(pdfEndpoint.allowed({ id:'admin', role:'admin', status:'active' }, partnerProfile), true);
  assert.equal(pdfEndpoint.allowed({ id:'profile-manager', role:'sales_manager', status:'active' }, partnerProfile), true);
  assert.equal(pdfEndpoint.allowed({ id:'other-manager', role:'sales_manager', status:'active' }, partnerProfile), false);
});
