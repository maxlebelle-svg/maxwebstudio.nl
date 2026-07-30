const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/admin-demo-sites.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const qrPath = path.join(root, "public/assets/food/silverado/silverado-demo-qr.svg");

test("Silverado krijgt een afgebakende klant- en restaurantpresentatie", () => {
  assert.match(html, /function isSilveradoFoodDemo/);
  assert.match(html, /identity\.includes\("silverado"\)/);
  assert.match(html, /identity\.includes\("roti"\).*identity\.includes\("rotishop"\)/s);
  assert.match(html, /data-food-demo-presentation/);
  assert.match(html, />Klantweergave</);
  assert.match(html, />Restaurantportaal</);
  assert.match(html, /data-food-dashboard-preview/);
  assert.match(css, /\.demo-food-presentation-stack/);
  assert.match(css, /\.demo-food-portal-canvas/);
});

test("klantweergave behoudt de echte bestaande preview en externe Food-pagina's worden niet ingebed", () => {
  assert.match(html, /data-demo-preview-url="\$\{escapeHtml\(preview\)\}"/);
  assert.match(html, /storefrontUrl: "https:\/\/max-webstudio-food-demo\.netlify\.app\/food\/silverado-roti-shop-emmeloord"/);
  assert.match(html, /restaurantPortalUrl: "https:\/\/max-webstudio-food-demo\.netlify\.app\/admin\/food"/);
  assert.doesNotMatch(html, /<iframe[^>]+max-webstudio-food-demo/s);
  assert.match(html, /data-food-storefront-link/);
  assert.match(html, /data-food-restaurant-portal-link/);
  assert.match(html, /target="_blank" rel="noopener noreferrer" data-food-storefront-link/);
  assert.match(html, /target="_blank" rel="noopener noreferrer" data-food-restaurant-portal-link/);
});

test("QR-code en expliciete klantmailactie zijn aanwezig", () => {
  assert.equal(fs.existsSync(qrPath), true);
  const qr = fs.readFileSync(qrPath, "utf8");
  assert.match(qr, /<svg/);
  assert.match(qr, /viewBox="0 0 45 45"/);
  assert.match(html, /qrAssetUrl: "\/assets\/food\/silverado\/silverado-demo-qr\.svg"/);
  assert.match(html, /data-food-demo-email/);
  assert.match(html, />Naar klant mailen/);
  assert.match(html, /action: "share_silverado_food_demo_email"/);
  assert.match(html, /De mail bevat de voorkant, het restaurantportaal en de QR-code/);
});

test("de dubbele presentatie schaalt mee op kleinere Demo Sites-kaarten", () => {
  assert.match(css, /@container \(max-width: 980px\)[\s\S]*\.admin-body \.demo-library-card \{\s*grid-template-columns: 1fr;/);
  assert.match(css, /@container \(max-width: 620px\)[\s\S]*\.demo-food-mobile-tools/);
  assert.match(css, /grid-template-columns: 88px minmax\(0, 1fr\)/);
});
