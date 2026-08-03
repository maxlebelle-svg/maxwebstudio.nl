const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const login = fs.readFileSync(path.join(root, "public/login.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/client-login.css"), "utf8");

test("klantlogin gebruikt de herkenbare klantportaalpresentatie zonder de andere loginmodi te vervangen", () => {
  assert.match(login, /classList\.toggle\("is-client-login", clientPortalMode\)/);
  assert.match(login, /Welkom in jouw klantportaal\./);
  assert.match(login, /Bekijk de voortgang, geef feedback, deel bestanden/);
  assert.match(login, /Max Webstudio Klantportaal/);
  assert.match(login, /data-auth-panel-trigger="request">Toegang aanvragen/);
  assert.match(login, /portal-client-return[^>]*data-auth-panel-trigger="real">Terug naar inloggen/);
  assert.match(login, /function isFoodPortalRequest\(\)/);
  assert.match(login, /Admin login Max Webstudio\./);
});

test("klantlogin gebruikt een lokale studioachtergrond en responsieve formulieren", () => {
  assert.match(styles, /\.portal-body\.is-client-login/);
  assert.match(styles, /url\("assets\/client-login-studio\.png"\)/);
  assert.match(styles, /@media \(min-width: 681px\) and \(max-height: 820px\)/);
  assert.match(styles, /@media \(max-width: 680px\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.equal(fs.existsSync(path.join(root, "public/assets/client-login-studio.png")), true);
});
