const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/admin-demo-sites.html"), "utf8");
const css = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
const actions = require("../public/admin/ui/demo-sites-commercial-actions");

const IDS = {
  lead: "11111111-1111-4111-8111-111111111111",
  preview: "22222222-2222-4222-8222-222222222222",
};

function context(overrides = {}) {
  return actions.shareContext({
    relationshipType: "lead",
    relationshipId: IDS.lead,
    email: "lisanne@example.test",
    selectedVersion: { id: IDS.preview, version: 4, sourceType: "manual_zip" },
    publication: { publicPreviewEnabled: true, previewVersionId: IDS.preview, publicPreviewUrl: "https://maxwebstudio.nl/preview/advies-post" },
    ...overrides,
  });
}

test("publieke WhatsApp-deelactie gebruikt de korte link en gewenste Nederlandse tekst", () => {
  const value = context();
  const message = actions.whatsappMessage({ contactName: "Lisanne", companyName: "Advies Post", publicPreviewUrl: value.publicPreviewUrl });
  assert.match(message, /^Hallo Lisanne,/);
  assert.match(message, /alvast een demo voor Advies Post/);
  assert.match(message, /https:\/\/maxwebstudio\.nl\/preview\/advies-post/);
  assert.match(decodeURIComponent(actions.whatsappUrl({ contactName: "Lisanne", companyName: "Advies Post", publicPreviewUrl: value.publicPreviewUrl })), /Ik hoor graag wat u ervan vindt/);
});

test("deelacties blijven geblokkeerd wanneer de publieke pointer niet exact de geselecteerde versie is", () => {
  const value = context({ publication: { publicPreviewEnabled: true, previewVersionId: "33333333-3333-4333-8333-333333333333", publicPreviewUrl: "https://maxwebstudio.nl/preview/advies-post" } });
  assert.equal(value.published, false);
  assert.equal(value.publicPreviewUrl, "");
  assert.match(value.blockedReason, /Publiceer eerst exact deze demo/);
});

test("willekeurige externe publieke URL wordt niet gedeeld", () => {
  const value = context({ publication: { publicPreviewEnabled: true, previewVersionId: IDS.preview, publicPreviewUrl: "https://evil.example/preview/advies-post" } });
  assert.equal(value.published, false);
});

test("ontbrekend e-mailadres blokkeert e-mail en portaaluitnodiging maar niet de publieke link", () => {
  const value = context({ email: "" });
  assert.equal(value.published, true);
  assert.equal(value.hasEmail, false);
  assert.equal(value.canInvite, false);
  assert.match(value.blockedReason, /e-mailadres/);
});

test("uitnodigingsknop ondersteunt eerste uitnodiging, resend, nieuwe link en actief portaal", () => {
  assert.deepEqual(actions.invitationAction({ status: "not_invited" }), { label: "Uitnodigen voor klantportaal", action: "invite", active: true });
  assert.equal(actions.invitationAction({ status: "sent" }).action, "resend");
  assert.equal(actions.invitationAction({ status: "link_expired" }).action, "new_link");
  assert.equal(actions.invitationAction({ status: "activated" }).action, "open_portal");
});

test("klantreisstatus gebruikt serverbevestigde publicatie, invitation, review en betaling", () => {
  const steps = actions.journeySteps({
    publicPreviewEnabled: true,
    invitation: { status: "activated", activatedAt: "2026-07-18", openedAt: "2026-07-18" },
    demo: { demoStatus: "feedback_ontvangen", approvalStatus: "customer_approved", previewApprovedAt: "2026-07-18" },
    payment: { available: true, status: "paid", paid: true },
  });
  assert.equal(steps.length, 7);
  assert.equal(steps.every((step) => step.complete), true);
});

test("betaling blijft niet van toepassing zonder echte bestaande factuurstatus", () => {
  const paid = actions.journeySteps({ payment: { available: false } }).find((step) => step.key === "paid");
  assert.equal(paid.complete, false);
  assert.equal(paid.unavailable, true);
});

test("Demo Sites toont vier aparte publieke deelacties en een afzonderlijke portaalactie", () => {
  assert.match(html, />Demo delen</);
  assert.match(html, /data-demo-share-whatsapp/);
  assert.match(html, /data-demo-share-email/);
  assert.match(html, /data-demo-commercial-copy/);
  assert.match(html, />Preview openen</);
  assert.match(html, /data-demo-portal-invite/);
});

test("uitnodigingsdialoog toont lead, e-mail, bron, versie, publieke link en accountuitleg", () => {
  for (const id of ["demo-portal-invitation-lead", "demo-portal-invitation-email", "demo-portal-invitation-source", "demo-portal-invitation-version", "demo-portal-invitation-public-link"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /kan daarna exact deze preview beoordelen/);
  assert.match(html, /Dit maakt geen klant aan/);
});

test("publiek e-mailen gebruikt de bestaande publicatie-endpoint met exacte previewVersionId", () => {
  const section = html.match(/async function sharePublicPreviewByEmail[\s\S]*?\n        }/)[0];
  assert.match(section, /share_public_preview_email/);
  assert.match(section, /previewVersionId: context\.previewVersionId/);
  assert.doesNotMatch(section, /ensureCustomer|customer-onboarding|demoStatus|approvalStatus|paymentStatus/);
});

test("portaaluitnodigen verstuurt exact journey, lead en geselecteerde preview zonder customerconversie", () => {
  const section = html.match(/async function submitPortalInvitation[\s\S]*?\n        }/)[0];
  assert.match(section, /leadId: context\.relationshipId/);
  assert.match(section, /demoJourneyId: activeActionRecord\.id/);
  assert.match(section, /previewVersionId: context\.previewVersionId/);
  assert.doesNotMatch(section, /ensureCustomer|customers|onboarding|handlingStatus|approvalStatus/);
});

test("alleen publieke delen maakt geen account, customer, approval of betaling aan", () => {
  const section = html.match(/function commercialPanelHtml[\s\S]*?\n        }/)[0];
  assert.doesNotMatch(section, /ensureCustomerForRecord|saveAccountFromModal|saveInvoiceFromModal|approve|payment/);
});

test("Demo Sites hydrateert invitationstatus opnieuw vanuit de beveiligde statusroute", () => {
  assert.match(html, /async function loadInvitationState/);
  assert.match(html, /leadInvitation}\?leadId=/);
  assert.match(html, /await Promise\.all\(records\.map\(\(record\) => loadInvitationState\(record\)\)\)/);
});

test("mobiele Demo Sites-acties hebben op 390 px één kolom en geen horizontale overflow", () => {
  const mobile = css.match(/@media\(max-width:390px\)\{[^}]+(?:\}[^@]*)?/g)?.join("\n") || "";
  assert.match(mobile, /demo-commercial-panel/);
  assert.match(mobile, /demo-share-actions\{grid-template-columns:1fr/);
  assert.match(mobile, /overflow:hidden/);
  assert.match(mobile, /max-width:100%/);
});

test("Demo Sites voegt geen nieuwe betalingstrigger toe", () => {
  assert.doesNotMatch(html, /data-demo-(?:commercial|portal)[^>]*(?:mollie|payment|pay)/i);
  assert.doesNotMatch(html, /share_public_preview_email[\s\S]{0,500}(?:commercial-order|mollie|admin-billing)/i);
});
