const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const invite = require("../functions/admin-invite-user")._test;
const { normalizeLogRecord } = require("../functions/services/mailLogService");

test("existing partner invite redirects directly to the production onboarding", () => {
  const actionLink = invite.forceRedirect("https://example.supabase.co/auth/v1/verify?token=secret", invite.partnerOnboardingRedirectTo());
  const parsed = new URL(actionLink);
  assert.equal(parsed.searchParams.get("redirect_to"), "https://maxwebstudio.nl/partner-onboarding.html");
});

test("onboarding invite email has the dedicated onboarding call to action", () => {
  const html = invite.buildEmployeeInviteHtml({
    firstName: "Lisanne",
    roleLabel: "Sales Partner",
    actionLink: "https://example.test/personal-link",
    isSalesPartner: true,
    onboardingOnly: true,
  });
  assert.match(html, /Je onboarding staat klaar/);
  assert.match(html, /Start je onboarding/);
  assert.match(html, /persoonlijke link/);
  assert.doesNotMatch(html, /Account activeren/);
});

test("employee directory exposes a confirmed one-click onboarding invitation", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/src/staff/admin-staff-directory.js"), "utf8");
  assert.match(source, /Onboarding uitnodiging versturen/);
  assert.match(source, /action:\"onboarding_invite\"/);
  assert.match(source, /confirm\(`Onboardinguitnodiging versturen/);
  assert.match(source, /button\.disabled=true/);
});

test("existing users still receive the dedicated onboarding email", () => {
  const source = fs.readFileSync(path.join(__dirname, "../functions/admin-invite-user.js"), "utf8");
  assert.match(source, /action === "onboarding_invite"/);
  assert.match(source, /action === "invite" \|\| action === "onboarding_invite"/);
  assert.match(source, /"magiclink", partnerOnboardingRedirectTo\(\)/);
});

test("settings has an isolated production invite control when the legacy admin script stops early", () => {
  const page = fs.readFileSync(path.join(__dirname, "../public/admin-instellingen.html"), "utf8");
  const control = fs.readFileSync(path.join(__dirname, "../public/src/staff/admin-invite-controls.js"), "utf8");
  assert.match(page, /src\/staff\/admin-invite-controls\.js/);
  assert.match(control, /getAdminAccessToken/);
  assert.match(control, /event\.stopImmediatePropagation\(\)/);
  assert.match(control, /dataset\.inviteControls/);
  assert.doesNotMatch(control, /if \(!form \|\| submitting\)/);
  assert.match(control, /emailField\?\.value/);
  assert.match(control, /action === "send_password_reset"/);
  assert.match(control, /\/\.netlify\/functions\/admin-invite-user/);
  assert.match(control, /mailWarning/);
});

test("sensitive employee invitations create a schema-compatible log without storing the action link", () => {
  const actionLink = "https://example.supabase.co/auth/v1/verify?token=one-time-secret";
  const record = normalizeLogRecord({
    to: "Ravenna@MaxWebstudio.nl",
    subject: "Welkom bij Max Webstudio",
    html: `<a href=\"${actionLink}\">Activeren</a>`,
    text: `Activeren: ${actionLink}`,
    messageType: "employee_account_activation",
    templateKey: "employee_account_activation",
    idempotencyKey: "employee-invite:test",
    sensitiveContent: true,
    triggeredBy: "admin_invite_user",
  });

  assert.match(record.idempotency_key, /^[0-9a-f]{64}$/);
  assert.equal(record.normalized_recipient_email, "ravenna@maxwebstudio.nl");
  assert.equal(record.created_by, "admin_invite_user");
  assert.equal(record.message_type, "employee_account_activation");
  assert.equal(record.html_body, null);
  assert.equal(record.text_body, null);
  assert.equal(JSON.stringify(record).includes("one-time-secret"), false);
});

test("mail logging keeps modern sent timestamps out of legacy list projections", () => {
  const source = fs.readFileSync(path.join(__dirname, "../functions/services/mailLogService.js"), "utf8");
  assert.match(source, /sent_at\.\*schema cache/);
  assert.match(source, /const \{ sent_at, \.\.\.legacyPatch \} = normalizedPatch/);
});

test("partner activation keeps the recovery session and uses partner-specific copy", () => {
  const activation = fs.readFileSync(path.join(__dirname, "../public/account-activeren.html"), "utf8");
  const provider = fs.readFileSync(path.join(__dirname, "../public/src/services/supabaseAuthProvider.js"), "utf8");
  const inviteSource = fs.readFileSync(path.join(__dirname, "../functions/admin-invite-user.js"), "utf8");

  assert.match(activation, /updatePassword\(data\.password, \{ preserveSession: true \}\)/);
  assert.match(activation, /passwordResult\.session \|\| readJson/);
  assert.match(activation, /previewContext\.mode === "partner"/);
  assert.match(activation, /Account activeren en onboarding starten/);
  assert.match(provider, /if \(!preserveSession\) localStorage\.removeItem\(AUTH_SESSION_KEY\)/);
  assert.match(inviteSource, /account-activeren\?context=partner/);
  assert.match(inviteSource, /forceRedirect\(actionLink, partnerActivationRedirectTo\(\)\)/);
});
