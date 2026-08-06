const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const manifest = JSON.parse(read("public/admin.webmanifest"));
const login = read("public/admin-login.html");
const dashboard = read("public/admin-dashboard.html");
const sales = read("public/admin-sales.html");
const sidebar = read("public/admin/components/admin-sidebar.js");
const installer = read("public/src/admin-app-install.js");
const serviceWorker = read("public/admin-service-worker.js");
const redirects = read("netlify.toml");
const leadsApi = read("functions/admin-leads.js");

test("Max Webstudio Admin heeft een vaste veilige app-ingang", () => {
  assert.equal(manifest.name, "Max Webstudio Admin");
  assert.equal(manifest.short_name, "MWS Admin");
  assert.equal(manifest.id, "/admin");
  assert.equal(manifest.start_url, "/admin");
  assert.equal(manifest.scope, "/admin");
  assert.equal(manifest.display, "standalone");
  assert.match(redirects, /from = "\/admin"\s+to = "\/admin-login\.html"\s+status = 200/);
  assert.match(redirects, /for = "\/admin-service-worker\.js"\s+\[headers\.values\]\s+Cache-Control = "no-cache, max-age=0, must-revalidate"/);
  for (const page of [login, dashboard, sales]) {
    assert.match(page, /rel="manifest" href="\/admin\.webmanifest"/);
    assert.match(page, /apple-mobile-web-app-title" content="MWS Admin"/);
    assert.match(page, /src="\/src\/admin-app-install\.js/);
  }
  assert.match(sidebar, /element\("small", "", "ADMIN"\)/);
});

test("de web-app bewaart geen beveiligde html, api-antwoorden of klantdata offline", () => {
  assert.match(installer, /PRODUCTION_HOSTS/);
  assert.match(installer, /navigator\.serviceWorker\.register\("\/admin-service-worker\.js", \{ scope: "\/admin" \}\)/);
  assert.doesNotMatch(serviceWorker, /respondWith\s*\(/);
  assert.doesNotMatch(serviceWorker, /caches\.put\s*\(/);
  assert.doesNotMatch(serviceWorker, /cache\.add(?:All)?\s*\(/);
});

test("salesmedewerkers kunnen vanuit de app leads toevoegen en categoriseren", () => {
  assert.match(sales, /<strong>Lead registreren<\/strong>/);
  assert.match(sales, /<label for="leadfinder-smart-view">Categorie/);
  assert.match(sales, /manualSmartView: leadfinderElements\.smartView\?\.value/);
  assert.match(sales, /leadApiRequest\("POST", payload\)/);
  assert.match(sales, /href="#leadfinder-form"[^>]*><span[^>]*>\+<\/span><strong>Nieuwe lead<\/strong>/);
  assert.match(sales, /\["sales", "lead-generator"\]\.includes/);
  assert.match(leadsApi, /const staffRoles = \["super_admin", "admin", "sales_manager", "sales_partner"\]/);
  assert.match(leadsApi, /allowedRoles: staffRoles/);
  assert.match(leadsApi, /if \(event\.httpMethod === "POST"\) return await createLead/);
});

test("bestaande sales-login blijft de enige medewerkerslogin", () => {
  assert.match(login, /Log in met je Max Webstudio medewerkersaccount\./);
  assert.match(login, /\["sales_partner", "sales_manager"\]\.includes\(normalizeRole\(role\)\) \? "\/admin-sales\.html"/);
  assert.doesNotMatch(login, /base44/i);
});
