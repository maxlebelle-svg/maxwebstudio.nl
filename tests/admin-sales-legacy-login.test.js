const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("the main login canonicalizes legacy sales profiles before the admin role check", () => {
  const login = source("public/login.html");
  assert.match(login, /sales:\s*"sales_partner"/);
  assert.match(login, /const value = String\(role \|\| ""\)\.trim\(\)\.toLowerCase\(\)\.replace/);
  assert.match(login, /return roleAliases\[value\] \|\| value/);
});

test("the live login cannot remain indefinitely in its checking state", () => {
  const login = source("public/login.html");
  const provider = source("public/src/services/supabaseAuthProvider.js");
  assert.match(provider, /AUTH_REQUEST_TIMEOUT_MS = 12000/);
  assert.match(provider, /AUTH_CLIENT_INIT_TIMEOUT_MS = 2500/);
  assert.match(provider, /fetchWithTimeout\(AUTH_CONFIG_ENDPOINT/);
  assert.match(provider, /SUPABASE_AUTH_TIMEOUT/);
  assert.match(login, /Login gelukt\. Je profiel wordt gecontroleerd/);
  assert.match(login, /PROFILE_LOOKUP_TIMEOUT/);
});

test("sales partners with unfinished onboarding are signed in and routed to onboarding", () => {
  const login = source("public/login.html");
  assert.match(login, /const partnerOnboardingRequired = role === "sales_partner" && account\.access\?\.onboardingRequired/);
  assert.match(login, /profileStatus !== "active" && !partnerOnboardingRequired/);
  assert.match(login, /window\.location\.href = "\/partner-onboarding\.html"/);
  assert.match(login, /PARTNER_ONBOARDING_REQUIRED/);
});

test("the admin session bridge preserves access for legacy sales profiles", () => {
  const bridge = source("public/src/services/adminAuthBridgeService.js");
  assert.match(bridge, /LEGACY_ROLE_ALIASES = Object\.freeze\(\{ sales: "sales_partner" \}\)/);
  assert.match(bridge, /return LEGACY_ROLE_ALIASES\[normalized\] \|\| normalized/);
});

test("the admin-login handoff canonicalizes legacy sales profiles", () => {
  const adminLogin = source("public/admin-login.html");
  assert.match(adminLogin, /const roleAliases = \{ sales: "sales_partner" \}/);
  assert.match(adminLogin, /return roleAliases\[rawRole\] \|\| rawRole/);
});

test("the admin-login handoff permits the dedicated onboarding destination", () => {
  const adminLogin = source("public/admin-login.html");
  assert.match(adminLogin, /parsed\.pathname === "\/partner-onboarding\.html"/);
  assert.match(adminLogin, /account\.access\?\.onboardingRequired/);
  assert.match(adminLogin, /navigateOnce\("\/partner-onboarding\.html"\)/);
});
