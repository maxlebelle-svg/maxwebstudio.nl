const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260726202000_partner_training_content_v1.sql');

test('B3 publishes one immutable Dutch training version with all seven modules', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /'partner_training_nl_v1', 'nl-NL'/);
  for (const key of [
    'welcome', 'vision', 'working_principles', 'lead_and_task_registration',
    'privacy_confidentiality', 'responsible_customer_contact', 'sales_process_call_script',
  ]) {
    assert.match(sql, new RegExp(`\\('${key}',`));
  }
  assert.match(sql, /Published partner training versions are immutable/);
  assert.match(sql, /Modules in published partner training versions are immutable/);
});

test('training content is owner/manager/admin scoped and has no authenticated writes', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /p\.auth_user_id = auth\.uid\(\)/);
  assert.match(sql, /assigned_manager_profile_id = public\.current_profile_id\(\)/);
  assert.match(sql, /has_app_role\(array\['super_admin','admin'\]\)/);
  assert.match(sql, /enable row level security/g);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]*to authenticated/i);
});

test('partner API returns assigned published content without answer or secret fields', () => {
  const source = fs.readFileSync(path.join(root, 'functions/partner-onboarding.js'), 'utf8');
  assert.match(source, /partner_training_versions\?select=/);
  assert.match(source, /status=eq\.published/);
  assert.match(source, /partner_training_modules\?select=/);
  assert.doesNotMatch(source, /correct_answer|answer_key|serviceRoleKey[^\n]*return/);
});

test('wizard supports saved progress, explicit acknowledgement, and controlled follow-up steps', () => {
  const html = fs.readFileSync(path.join(root, 'public/partner-onboarding.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'public/src/partner/partner-onboarding.js'), 'utf8');
  assert.match(html, /role="progressbar"/);
  assert.match(html, /id="acknowledge" type="checkbox"/);
  assert.match(script, /complete_step/);
  assert.match(script, /firstIncomplete/);
  assert.match(script, /commission_system/);
  assert.match(script, /knowledge_assessment/);
  assert.match(script, /document_acceptance/);
});

test('owner preview exposes branded training and assessment without server writes or answer keys', () => {
  const html = fs.readFileSync(path.join(root, 'public/partner-onboarding.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'public/src/partner/partner-onboarding.js'), 'utf8');
  const preview = fs.readFileSync(path.join(root, 'public/src/partner/partner-onboarding-preview.js'), 'utf8');
  assert.match(html, /max-webstudio-logo-mark\.svg/);
  assert.match(html, /id="previewBadge"/);
  assert.match(script, /get\("preview"\) === "1"/);
  assert.match(script, /De previewstand voert geen serveracties uit/);
  assert.match(preview, /Welkom bij Max Webstudio/);
  assert.match(preview, /Kennistoets Partnertraining V1/);
  assert.match(preview, /Wanneer opent de Sales Workspace\?/);
  assert.doesNotMatch(preview, /\bcorrect\s*:/);
});
