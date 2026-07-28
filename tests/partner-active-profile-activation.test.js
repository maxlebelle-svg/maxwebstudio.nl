const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20260728131500_partner_activation_accept_active_profile.sql"),
  "utf8",
);

test("an active sales partner can complete the onboarding activation handshake", () => {
  assert.match(migration, /profile_record\.status not in \('invited','pending','active'\)/);
  assert.match(migration, /if profile_record\.status = 'invited' then[\s\S]*status = 'pending'/);
  assert.doesNotMatch(migration, /if profile_record\.status = 'active' then[\s\S]*update public\.profiles/);
});

test("activation remains scoped, idempotent and service-role only", () => {
  assert.match(migration, /auth_user_id = input_auth_user_id and role = 'sales_partner' for update/);
  assert.match(migration, /on conflict \(onboarding_id, idempotency_key\) do nothing/);
  assert.match(migration, /revoke all on function public\.partner_mark_account_activated\(uuid,text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.partner_mark_account_activated\(uuid,text\) to service_role/);
});
