const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const invite = require("../functions/admin-invite-user")._test;

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
  assert.match(control, /action === "send_password_reset"/);
  assert.match(control, /\/\.netlify\/functions\/admin-invite-user/);
  assert.match(control, /mailWarning/);
});
