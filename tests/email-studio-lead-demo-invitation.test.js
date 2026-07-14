const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const emailStudio = fs.readFileSync(path.join(__dirname, "../public/admin-email-studio.html"), "utf8");
const selectionSource = fs.readFileSync(path.join(__dirname, "../public/src/emailStudioTemplateSelection.js"), "utf8");
const invitationImplementation = `${emailStudio}\n${selectionSource}`;
const onboarding = fs.readFileSync(path.join(__dirname, "../functions/admin-customer-onboarding.js"), "utf8");
const selection = require("../public/src/emailStudioTemplateSelection.js");

const accountTemplate = {
  id: "account-aanmaken",
  name: "Accountuitnodiging",
  subject: "Je Max Webstudio account staat klaar",
};
const testCustomer = {
  relationshipType: "customer",
  relationshipId: "11111111-1111-4111-8111-111111111111",
  companyName: "Max Webstudio Test",
  contactName: "Interne Testklant",
  email: "test+klant@maxwebstudio.nl",
};

test("Email Studio heeft aparte demo- en contextafhankelijke accounttemplate", () => {
  assert.match(emailStudio, /id: "lead-demo-uitnodiging"[\s\S]*name: "Je website-demo staat klaar"/);
  assert.match(emailStudio, /id: "account-aanmaken"[\s\S]*name: "Accountuitnodiging"/);
  assert.match(emailStudio, /lead\.relationshipType !== "lead"[\s\S]*uitsluitend voor leads/);
  assert.doesNotMatch(emailStudio, /Accountactivatie kan alleen naar een bestaande klant/);
  assert.match(emailStudio, /lead\.relationshipType === "lead"\) await sendLeadDemoInvitation/);
  assert.match(emailStudio, /else await sendAccountActivationEmail/);
});

test("leadactie gebruikt canonieke relationshipId, UUID action key en blokkeert dubbelklikken", () => {
  assert.match(emailStudio, /if \(sendInFlight\) return/);
  assert.match(invitationImplementation, /leadId: recipient\.relationshipId, action, actionKey/);
  assert.match(emailStudio, /accountInvitationRequest\(\{ recipient: lead, status: leadInvitationStatus, actionKey: crypto\.randomUUID\(\) \}\)/);
  assert.doesNotMatch(emailStudio, /admin-lead-demo-invitation[\s\S]{0,300}(?:companyName|contactName|email):/);
});

test("Email Studio toont alle leaduitnodigingsstatussen en resend/new-link acties", () => {
  for (const label of ["Niet uitgenodigd", "Gepland", "Verzonden", "Geactiveerd", "Link verlopen", "Verzendfout", "Uitnodiging opnieuw versturen", "Nieuwe activatielink genereren"]) assert.match(emailStudio, new RegExp(label));
});

test("accountactie toont relatieafhankelijke status, bevestiging en server-side ids", () => {
  for (const label of ["Uitnodiging nog niet verstuurd", "Uitnodiging gepland", "Uitnodiging verzonden", "Account geactiveerd", "Link verlopen", "Verzendfout"]) assert.match(emailStudio, new RegExp(label));
  assert.match(emailStudio, /Bevestig handmatige verzending/);
  assert.match(invitationImplementation, /customerId: recipient\.relationshipId, action, actionKey/);
  assert.match(emailStudio, /accountInvitationRequest\(\{ recipient: lead, status: customerInvitationStatus, actionKey: crypto\.randomUUID\(\) \}\)/);
  assert.doesNotMatch(emailStudio, /body: JSON\.stringify\([^)]*email: lead\.email/);
});

test("account-aanmaken houdt dropdown, preview en controlesamenvatting consequent", () => {
  assert.match(emailStudio, /selectTemplate\(elements\.templateSelect\.value, "preview"\)/);
  assert.match(emailStudio, /renderEditor\(\);\s*syncManualSendPanel\(\);/);
  const summary = selection.manualSendSummary({ recipient: testCustomer, template: accountTemplate, subject: accountTemplate.subject });
  assert.match(summary, /Accountuitnodiging/);
  assert.match(summary, /Je Max Webstudio account staat klaar/);
  assert.match(summary, /test\+klant@maxwebstudio\.nl/);
  assert.doesNotMatch(summary, /Welkomstmail/);
  assert.match(emailStudio, /dropdownValue:[\s\S]*dropdownLabel:[\s\S]*templateKey:[\s\S]*previewTitle:[\s\S]*summary:[\s\S]*subject:/);
});

test("accountuitnodiging bouwt de canonieke customer payload zonder mailbody", () => {
  const request = selection.accountInvitationRequest({ recipient: testCustomer, status: "not_invited", actionKey: "action-1" });
  assert.equal(request.endpoint, "/.netlify/functions/admin-customer-welcome-email");
  assert.deepEqual(request.payload, { customerId: testCustomer.relationshipId, action: "invite", actionKey: "action-1" });
  assert.equal(JSON.stringify(request.payload).includes(testCustomer.email), false);
  assert.equal(JSON.stringify(request.payload).includes("Welkomstmail"), false);
});

test("opnieuw versturen hergebruikt de juiste accountbackend en templatecontext", () => {
  const customer = selection.accountInvitationRequest({ recipient: testCustomer, status: "sent", actionKey: "action-2" });
  assert.equal(customer.action, "resend");
  assert.equal(customer.payload.action, "resend");
  const lead = selection.accountInvitationRequest({ recipient: { ...testCustomer, relationshipType: "lead" }, status: "link_expired", actionKey: "action-3" });
  assert.equal(lead.endpoint, "/.netlify/functions/admin-lead-demo-invitation");
  assert.deepEqual(lead.payload, { leadId: testCustomer.relationshipId, action: "resend", actionKey: "action-3" });
});

test("accountuitnodigingstests versturen nooit een echte e-mail", () => {
  assert.equal(typeof selection.accountInvitationRequest, "function");
  assert.doesNotMatch(fs.readFileSync(__filename, "utf8"), /fetch\(|sendEmail\(|sendTrackedEmail\(/);
});

test("conversie bewaart profielmetadata, hergebruikt auth en onderdrukt tweede accountmail voor actief account", () => {
  assert.match(onboarding, /const existingProfile = await readByLookup/);
  assert.match(onboarding, /\.\.\.existingProfileMetadata/);
  assert.match(onboarding, /accountAlreadyActive[\s\S]*existing_active_account/);
  assert.match(onboarding, /input\.sendWelcomeEmail && !accountAlreadyActive/);
  assert.match(onboarding, /Bestaand actief account hergebruikt; er is geen nieuwe account-aanmaakmail verstuurd/);
  assert.match(onboarding, /finalizeLeadDemoIdentity/);
});

test("demo opslaan blijft los van uitnodigen en alleen expliciete leadactie plant mail", () => {
  const demoJourney = fs.readFileSync(path.join(__dirname, "../functions/demo-journey.js"), "utf8");
  assert.doesNotMatch(demoJourney, /admin-lead-demo-invitation/);
  assert.match(emailStudio, /sendLeadDemoInvitation/);
  assert.match(emailStudio, /\$\{invitationLabel\} is duurzaam gepland/);
});
