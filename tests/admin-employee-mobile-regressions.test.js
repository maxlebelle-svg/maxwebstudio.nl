const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const relationshipSearch = require("../functions/admin-relationship-search")._test;

test("mobiele adminnavigatie start compact en kan expliciet worden geopend", () => {
  const component = read("public/admin/components/admin-sidebar.js");
  const css = read("public/admin/styles/admin-sidebar-system.css");
  assert.match(component, /mws-sidebar-mobile-toggle/);
  assert.match(component, /aria-expanded/);
  assert.match(component, /is-mobile-open/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*mws-admin-sidebar-v2 > \.mws-sidebar-content[\s\S]*display: none/);
  assert.match(css, /mws-admin-sidebar-v2\.is-mobile-open > \.mws-sidebar-content/);
});

test("normale medewerkers gebruiken nooit de legacy hybride customer_websites-route", () => {
  const sales = read("public/admin-sales.html");
  for (const functionName of ["currentCustomerDataMode", "currentWebsiteDataMode", "currentProjectDataMode", "currentQuoteDataMode", "currentInvoiceDataMode", "currentSubscriptionDataMode"]) {
    const start = sales.indexOf(`function ${functionName}()`);
    assert.notEqual(start, -1, `${functionName} ontbreekt`);
    assert.match(sales.slice(start, start + 220), /if \(!isDeveloperModeEnabled\(\)\) return "supabase-read"/);
  }
});

test("Super Admin kan zichtbare testleads ook in de relatiekiezer selecteren", () => {
  const testLead = { id: "33333333-3333-4333-8333-333333333333", is_test: true, environment: "test" };
  assert.equal(relationshipSearch.isUnavailableForActor({ role: "super_admin" }, testLead), false);
  assert.equal(relationshipSearch.isUnavailableForActor({ role: "sales_partner" }, testLead), true);
  assert.equal(relationshipSearch.isUnavailableForActor({ role: "super_admin" }, { ...testLead, archived_at: "2026-08-06" }), true);
});
