const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const notifications = require("../public/src/emailActionNotifications.js");
const studio = fs.readFileSync(path.join(root, "public/admin-email-studio.html"), "utf8");
const toastSource = fs.readFileSync(path.join(root, "public/admin/ui/admin-toast.js"), "utf8");
const resetSource = fs.readFileSync(path.join(root, "functions/client-password-reset.js"), "utf8");
const leadInviteSource = fs.readFileSync(path.join(root, "functions/admin-lead-demo-invitation.js"), "utf8");

test("alle Mail Studio-acties gebruiken dezelfde status-toast", () => {
  assert.match(studio, /admin\/ui\/admin-toast\.js/);
  assert.match(studio, /src\/emailActionNotifications\.js/);
  assert.match(studio, /EmailActionNotifications\.start/);
  assert.match(studio, /sendLeadDemoInvitation[\s\S]*sendAccountActivationEmail[\s\S]*sendPasswordResetEmail[\s\S]*sendRenderedEmail[\s\S]*notification\.success/);
  assert.match(studio, /notification\.failure\(error\)/);
});

test("succes toont ontvanger, template, tijdstip en twee vervolgacties", () => {
  const calls = [];
  let opened = 0;
  let repeated = 0;
  const controller = { update: (...args) => calls.push(["update", ...args]) };
  const flow = notifications.start({
    showToast: (...args) => { calls.push(["start", ...args]); return controller; },
    recipient: "test+mail@maxwebstudio.nl",
    template: "Accountuitnodiging",
    now: () => new Date("2026-07-14T12:34:00.000Z"),
    onOpenTimeline: () => { opened += 1; },
    onRepeat: () => { repeated += 1; },
  });

  assert.deepEqual(calls[0].slice(1, 3), ["E-mail naar test+mail@maxwebstudio.nl wordt verstuurd…", "info"]);
  assert.deepEqual(calls[0][3], { persistent: true, loading: true });
  const message = flow.success();
  assert.match(message, /test\+mail@maxwebstudio\.nl/);
  assert.match(message, /Accountuitnodiging/);
  assert.match(message, /14:34/);
  assert.equal(calls[1][2], "success");
  assert.deepEqual(calls[1][3].actions.map((action) => action.label), ["Open tijdlijn", "Nogmaals versturen"]);
  calls[1][3].actions[0].onAction();
  calls[1][3].actions[1].onAction();
  assert.equal(opened, 1);
  assert.equal(repeated, 1);
});

test("fouten zijn Nederlands en bieden alleen opnieuw proberen", () => {
  const updates = [];
  let retries = 0;
  const flow = notifications.start({
    showToast: () => ({ update: (...args) => updates.push(args) }),
    recipient: "test@example.test",
    template: "Testmail",
    onOpenTimeline() {},
    onRepeat: () => { retries += 1; },
  });
  const message = flow.failure(new Error("Network error: failed to fetch"));
  assert.match(message, /verbinding met de mailserver/i);
  assert.equal(updates[0][1], "error");
  assert.deepEqual(updates[0][2].actions.map((action) => action.label), ["Opnieuw proberen"]);
  updates[0][2].actions[0].onAction();
  assert.equal(retries, 1);
});

test("de gedeelde admin-toast ondersteunt meerdere acties in de bestaande toaststijl", () => {
  assert.match(toastSource, /toast-region/);
  assert.match(toastSource, /toast toast-\$\{normalizedType\}/);
  assert.match(toastSource, /Array\.isArray\(options\.actions\)/);
  assert.match(toastSource, /actions\.append\(button\)/);
});

test("succesvolle speciale mails worden via de bestaande globale timeline gelogd", () => {
  assert.doesNotMatch(leadInviteSource, /triggeredBy: "admin_lead_demo_invitation", suppressTimelineEvent: true/);
  assert.match(leadInviteSource, /leadId: lead\.id, triggeredBy: "admin_lead_demo_invitation"/);
  assert.match(resetSource, /customerId: input\.relationshipType === "customer" \? input\.relationshipId : null/);
  assert.match(resetSource, /leadId: input\.relationshipType === "lead" \? input\.relationshipId : null/);
  assert.match(resetSource, /suppressTimelineEvent: !input\.relationshipId/);
  assert.match(resetSource, /email:[\s\S]*sent: Boolean\(mailResult\?\.sent\)/);
});

test("regressietests voeren geen echte e-mailactie uit", () => {
  assert.doesNotMatch(fs.readFileSync(__filename, "utf8"), /fetch\(|sendTrackedEmail\(|sendEmail\(/);
});
