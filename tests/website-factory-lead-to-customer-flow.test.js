const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const factory = fs.readFileSync(path.join(root, "public/admin-website-factory.html"), "utf8");
const onboarding = fs.readFileSync(path.join(root, "functions/admin-customer-onboarding.js"), "utf8");

test("Website Factory toont een contextuele lead-naar-klantactie naast Nieuwe klant", () => {
  assert.match(factory, /id="convert-active-lead-topbar"[^>]*hidden[^>]*>Van deze lead een klant maken</);
  assert.ok(
    factory.indexOf('id="convert-active-lead-topbar"') < factory.indexOf('id="open-new-customer-topbar"'),
    "de contextuele actie hoort links van Nieuwe klant te staan",
  );
  assert.match(factory, /const canConvert = Boolean\(lead\?\.id && !convertedCustomerIdForLead\(lead\)\)/);
  assert.match(factory, /window\.syncActiveLeadConversionAction = syncActiveLeadConversionAction/);
  assert.match(factory, /window\.syncActiveLeadConversionAction\?\.\(context\)/);
});

test("leadgegevens vullen het bestaande klantportaalformulier zonder automatisch mail te versturen", () => {
  assert.match(factory, /function openActiveLeadCustomerOnboarding\(\)/);
  for (const field of ["leadId", "name", "email", "phone", "company", "website", "package", "projectName"]) {
    assert.match(factory, new RegExp(`${field}:`), `prefill mist ${field}`);
  }
  assert.match(factory, /leadId: newCustomerWizardContext\?\.leadId \|\| ""/);
  assert.match(factory, /sendWelcomeEmail: Boolean\(newSendWelcomeEmail\?\.checked\)/);
  assert.match(factory, /welkomstmail wordt alleen verstuurd als je die optie bewust aanvinkt/);
});

test("server koppelt uitsluitend via leads.converted_customer_id en stopt bij dubbel converteren", () => {
  assert.match(onboarding, /sourceLead\?\.converted_customer_id/);
  assert.match(onboarding, /converted_customer_id: customerId/);
  assert.match(onboarding, /converted_at: now/);
  assert.doesNotMatch(onboarding, /\bcustomer_id:\s*customerId[\s\S]{0,120}status:\s*"converted"/);
  assert.match(onboarding, /linkedLead\.converted_customer_id/);
});
