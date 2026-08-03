const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const loginHtml = fs.readFileSync(path.join(projectRoot, "public/admin-login.html"), "utf8");
const styles = fs.readFileSync(path.join(projectRoot, "public/admin-login.css"), "utf8");

test("employee admin login uses the live Supabase auth and admin bridge", () => {
  assert.match(loginHtml, /auth\.signInWithEmail\(data\.email, data\.password\)/);
  assert.match(loginHtml, /adminAuthBridgeService\.js/);
  assert.match(loginHtml, /bridge\.resolveAdminAuth\(\{ account \}\)/);
  assert.match(loginHtml, /developer.*super_admin.*admin.*sales_manager.*sales_partner.*designer.*support/);
  assert.match(loginHtml, /account\.profile\?\.status/);
});

test("employee admin login exposes complete accessible login and recovery controls", () => {
  assert.match(loginHtml, /Log in met je Max Webstudio medewerkersaccount\./);
  assert.match(loginHtml, /autocomplete="email"/);
  assert.match(loginHtml, /autocomplete="current-password"/);
  assert.match(loginHtml, /aria-label="Wachtwoord tonen"/);
  assert.match(loginHtml, /client-password-reset/);
  assert.match(loginHtml, /Wachtwoord vergeten/);
});

test("employee admin login uses the scoped responsive studio design", () => {
  assert.match(styles, /\.admin-login-page\s*\{/);
  assert.match(styles, /url\("assets\/admin-login-studio\.png"\)/);
  assert.match(styles, /@media \(min-width: 681px\) and \(max-height: 820px\)/);
  assert.match(styles, /@media \(max-width: 680px\)/);
  assert.ok(fs.existsSync(path.join(projectRoot, "public/assets/admin-login-studio.png")));
});
