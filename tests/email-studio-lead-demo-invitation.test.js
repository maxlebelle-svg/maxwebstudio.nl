const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const emailStudio = fs.readFileSync(path.join(__dirname, "../public/admin-email-studio.html"), "utf8");
const onboarding = fs.readFileSync(path.join(__dirname, "../functions/admin-customer-onboarding.js"), "utf8");

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
  assert.match(emailStudio, /leadId: lead\.relationshipId, action, actionKey: crypto\.randomUUID\(\)/);
  assert.doesNotMatch(emailStudio, /admin-lead-demo-invitation[\s\S]{0,300}(?:companyName|contactName|email):/);
});

test("Email Studio toont alle leaduitnodigingsstatussen en resend/new-link acties", () => {
  for (const label of ["Niet uitgenodigd", "Gepland", "Verzonden", "Geactiveerd", "Link verlopen", "Verzendfout", "Uitnodiging opnieuw versturen", "Nieuwe activatielink genereren"]) assert.match(emailStudio, new RegExp(label));
});

test("accountactie toont relatieafhankelijke status, bevestiging en server-side ids", () => {
  for (const label of ["Uitnodiging nog niet verstuurd", "Uitnodiging gepland", "Uitnodiging verzonden", "Account geactiveerd", "Link verlopen", "Verzendfout"]) assert.match(emailStudio, new RegExp(label));
  assert.match(emailStudio, /Bevestig handmatige verzending/);
  assert.match(emailStudio, /customerId: lead\.relationshipId/);
  assert.match(emailStudio, /actionKey: crypto\.randomUUID\(\)/);
  assert.doesNotMatch(emailStudio, /body: JSON\.stringify\([^)]*email: lead\.email/);
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
