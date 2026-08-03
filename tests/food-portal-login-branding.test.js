const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const login = fs.readFileSync(path.join(root, "public/login.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");

test("Food-adminroutes krijgen herkenbare restaurantbranding zonder de gewone login te vervangen", () => {
  assert.match(login, /function isFoodPortalRequest\(\)/);
  assert.match(login, /max-webstudio-food-demo\.netlify\.app/);
  assert.match(login, /\^\\\/admin\\\/food/);
  assert.match(login, /Welkom bij Max Food Portal\./);
  assert.match(login, /Restaurantbeheer/);
  assert.match(login, /menu's, bestellingen en je restaurantomgeving/);
  assert.match(login, /classList\.toggle\("is-food-portal", foodPortalMode\)/);
  assert.match(login, /Admin login Max Webstudio\./);
});

test("Food-login gebruikt een lokale restaurantachtergrond met leesbare mobiele fallback", () => {
  assert.match(styles, /\.portal-body\.is-food-portal/);
  assert.match(styles, /food-portal-login-background\.png/);
  assert.match(styles, /backdrop-filter: blur\(20px\)/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.equal(fs.existsSync(path.join(root, "public/assets/food/portal/food-portal-login-background.png")), true);
});
