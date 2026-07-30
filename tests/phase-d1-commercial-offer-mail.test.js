const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { buildCommercialOfferMail } = require("../functions/services/commercialOfferMailService");
const offerService = require("../functions/services/commercialOfferService");
const endpoint = require("../functions/admin-commercial-offers")._private;
const interest = require("../functions/commercial-offer-interest")._private;
const migration = read("supabase/migrations/20260730223000_commercial_offer_phase_d1_mail.sql");
const browser = read("public/src/offer-composer.js");
const html = read("public/admin-offer-composer.html");
const css = read("public/src/offer-composer.css");
const interestPage = read("public/voorstel-interesse.html");
const legacy = read("public/admin-nieuwe-opdracht.html");
const corePromise = import("../public/src/offer-composer-core.mjs");

const snapshot = offerService.buildOfferVersion({
  paymentChoice: "fixed_deposit",
  selections: [{ productId: "business_website" }, { productId: "care_basic" }],
}, { id: "11111111-1111-4111-8111-111111111111", profileId: "22222222-2222-4222-8222-222222222222", role: "admin" });
const base = {
  relationship: { contactName: "Max Le Belle", companyName: "Silverado", email: "max@example.test" },
  demo: { desktopUrl: "https://maxwebstudio.nl/preview/silverado", mobileUrl: "https://maxwebstudio.nl/preview/silverado?mobile=1", qrCodeUrl: "https://maxwebstudio.nl/assets/food/silverado/silverado-demo-qr.svg" },
  snapshot,
};

test("canonical Composer replaces the legacy hardcoded order flow and preserves safe context", () => {
  assert.match(legacy, /location\.replace/);
  for (const key of ["relationshipType", "relationshipId", "leadId", "customerId", "demoJourneyId", "factoryProjectId", "offerId", "source"]) assert.match(legacy, new RegExp(key));
  assert.doesNotMatch(legacy, /1750|50%|commercial-order-form|data-price|factuur.*aanmaak/i);
  const commerce = require("../public/admin/config/sidebar-navigation.js").ADMIN_SIDEBAR_NAVIGATION.find((section) => section.id === "commerce");
  assert.equal(commerce.items[0].label, "Voorstellen");
  assert.equal(commerce.items[0].route, "admin-offer-composer.html");
});

test("server-rendered mail contains demo, internal QR, selected lines and exact canonical prices", () => {
  const mail = buildCommercialOfferMail({ ...base, mode: "definitive", interestUrl: "https://maxwebstudio-staging.netlify.app/voorstel-interesse.html#token=safe_token_value_12345678901234567890123456789012" });
  assert.match(mail.html, /Demo op computer bekijken/);
  assert.match(mail.html, /Mobiele demo openen/);
  assert.match(mail.html, /silverado-demo-qr\.svg/);
  assert.match(mail.text, /Business Website: € 995,00 excl\. btw eenmalig/);
  assert.match(mail.text, /Care Basic: € 19,95 excl\. btw per maand/);
  assert.match(mail.text, /Vaste aanbetaling excl\. btw: € 300,00/);
  assert.match(mail.text, /Geldig tot en met:/);
  assert.match(mail.html, /Geldig tot en met/);
  assert.doesNotMatch(mail.text, /50%|€ 1\.750,00/);
  assert.match(mail.text, /nog geen digitale ondertekening of betalingsopdracht/i);
});

test("offer validity is server-side, immutable, fourteen calendar days and fail-closed", () => {
  const manipulated = offerService.buildOfferVersion({
    paymentChoice: "fixed_deposit",
    validUntil: "2099-12-31",
    selections: [{ productId: "business_website" }, { productId: "care_basic" }],
  }, { id: "11111111-1111-4111-8111-111111111111", profileId: "22222222-2222-4222-8222-222222222222", role: "admin" });
  assert.equal(manipulated.validUntil, offerService._private.validityDate(14));
  assert.notEqual(manipulated.validUntil, "2099-12-31");
  assert.throws(() => buildCommercialOfferMail({ ...base, snapshot: { ...snapshot, validUntil: undefined }, mode: "test" }), /geldigheidsdatum/i);
  assert.throws(() => buildCommercialOfferMail({ ...base, snapshot: { ...snapshot, validUntil: "2020-01-01" }, mode: "definitive", interestUrl: "https://example.test/interest" }), /verlopen/i);
  assert.throws(() => endpoint.offerExpiry({}), /geldigheidsdatum/i);
  assert.throws(() => endpoint.offerExpiry({ validUntil: "2020-01-01" }), /verlopen/i);
});

test("staging mail is unmistakably labelled and interest page displays validity", () => {
  const mail = buildCommercialOfferMail({ ...base, mode: "test", staging: true });
  assert.match(mail.subject, /^\[STAGING TEST\]/);
  assert.match(mail.html, /STAGINGTEST — niet naar een echte klant verzenden/);
  const interestPage = read("public/voorstel-interesse.html");
  assert.match(interestPage, /Geldigheid controleren/);
  assert.match(interestPage, /validUntil/);
  assert.match(read("functions/commercial-offer-interest.js"), /commercial_offer_versions\?select=offer_id,snapshot/);
});

test("test mail is clearly labelled and cannot contain a customer interest token", () => {
  const mail = buildCommercialOfferMail({ ...base, mode: "test" });
  assert.match(mail.subject, /^\[TEST\]/);
  assert.match(mail.html, /TESTMAIL — niet naar de klant verzonden/);
  assert.doesNotMatch(mail.html, /voorstel-interesse\.html#token=/);
  assert.throws(() => buildCommercialOfferMail({ ...base, mode: "definitive" }), /interesselink/i);
});

test("unsafe or incomplete demos and non-binding prices fail closed before mail delivery", () => {
  assert.throws(() => buildCommercialOfferMail({ ...base, demo: { ...base.demo, desktopUrl: "javascript:alert(1)" }, mode: "test" }), /demo mist/i);
  assert.throws(() => buildCommercialOfferMail({ ...base, snapshot: { ...snapshot, hasNonBindingLines: true }, mode: "test" }), /bindende/i);
});

test("Phase D1 is environment gated and cannot be enabled in production", () => {
  const previous = { flag: process.env.COMMERCIAL_OFFER_PHASE_D1_ENABLED, url: process.env.URL, supabaseUrl: process.env.SUPABASE_URL };
  try {
    process.env.COMMERCIAL_OFFER_PHASE_D1_ENABLED = "true";
    process.env.URL = "https://maxwebstudio-staging.netlify.app";
    process.env.SUPABASE_URL = "https://xlxpuuycigeqhgxqtzni.supabase.co";
    assert.equal(endpoint.phaseD1Enabled(), true);
    process.env.URL = "https://maxwebstudio.nl";
    assert.equal(endpoint.phaseD1Enabled(), false);
    process.env.URL = "https://maxwebstudio-staging.netlify.app";
    process.env.SUPABASE_URL = "https://yxxahurphdbblkuxoeje.supabase.co";
    assert.equal(endpoint.phaseD1Enabled(), false);
  } finally {
    if (previous.flag === undefined) delete process.env.COMMERCIAL_OFFER_PHASE_D1_ENABLED; else process.env.COMMERCIAL_OFFER_PHASE_D1_ENABLED = previous.flag;
    if (previous.url === undefined) delete process.env.URL; else process.env.URL = previous.url;
    if (previous.supabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.supabaseUrl;
  }
});

test("recipient, provider and public tokens are represented only by SHA-256 evidence", () => {
  assert.match(endpoint.sha256("secret"), /^[a-f0-9]{64}$/);
  assert.equal(endpoint.sha256("secret"), interest.sha256("secret"));
  assert.match(migration, /recipient_sha256 text not null/);
  assert.match(migration, /provider_message_id_sha256/);
  assert.match(migration, /token_sha256 text not null unique/);
  assert.doesNotMatch(migration, /raw_token|token_plaintext|recipient_email/);
});

test("database enforces preview then successful test then definitive send", () => {
  assert.match(migration, /event_type='offer\.previewed'/);
  assert.match(migration, /dispatch_kind='test' and status='sent'/);
  assert.match(migration, /Test mail cannot create an interest token/);
  assert.match(migration, /Successful test mail evidence is required/);
  assert.match(browser, /previewed && tested/);
  assert.match(html, /Pas na geslaagde testmail/);
});

test("mail dispatches are idempotent, rate limited and provider ambiguity is not retried", () => {
  assert.match(migration, /commercial_offer_mail_dispatch_idempotency unique/);
  assert.match(migration, /interval '1 hour'/);
  assert.match(migration, /interval '24 hours'/);
  assert.match(read("functions/admin-commercial-offers.js"), /DISPATCH_ALREADY_RESERVED/);
  assert.match(read("functions/admin-commercial-offers.js"), /wordt niet opnieuw uitgevoerd/);
  assert.match(read("functions/admin-commercial-offers.js"), /niet automatisch opnieuw geprobeerd/);
});

test("interest tokens are version scoped, expiring, revocable and explicitly non-binding", () => {
  for (const field of ["offer_version_id", "expires_at", "confirmed_at", "revoked_at"]) assert.match(migration, new RegExp(field));
  assert.match(migration, /offer\.interest_confirmed/);
  assert.match(migration, /offer\.interest_revoked/);
  assert.match(migration, /'nonBinding',true/);
  assert.match(read("public/voorstel-interesse.html"), /geen digitale ondertekening, contract, factuur of betalingsopdracht/i);
  assert.match(read("functions/commercial-offer-interest.js"), /geen digitale ondertekening of betalingsopdracht/i);
});

test("cross-relationship demo checks remain mandatory for preview and send", () => {
  const source = read("functions/admin-commercial-offers.js");
  assert.match(source, /DEMO_RELATIONSHIP_MISMATCH/);
  assert.match(source, /demo_journeys\?select=id&id=eq/);
  assert.match(source, /assertRelationshipAccess\(actor, offer\.relationship_type/);
});

test("D1 contains no Signhost, Mollie, invoice, subscription or onboarding activation", () => {
  const d1 = [read("functions/admin-commercial-offers.js"), read("functions/commercial-offer-interest.js"), read("functions/services/commercialOfferMailService.js"), migration].join("\n");
  assert.doesNotMatch(d1, /signhost|api\.mollie|create_invoice|insert into public\.invoices|insert into public\.subscriptions|start_onboarding/i);
  assert.match(html, /geen contract, betaling, factuur, abonnement of onboarding/i);
});

test("manual fallback is generated from the same exact server mail", () => {
  assert.match(read("functions/admin-commercial-offers.js"), /manualFallback: \{ subject: mail\.subject/);
  assert.match(html, /id="manual-mail-text"/);
  assert.match(browser, /navigator\.clipboard\.writeText\(elements\.manualMailText\.value\)/);
});

test("modal 1: native browser prompts are completely absent", () => {
  assert.doesNotMatch(browser, /window\.(?:confirm|alert|prompt)|\b(?:confirm|alert|prompt)\s*\(/);
});

test("modal 2: in-app dialog opens with deterministic accessible semantics", () => {
  assert.match(html, /id="definitive-send-dialog"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="definitive-send-title"/);
  assert.match(html, /Voorstel definitief verzenden\?/);
  assert.match(browser, /definitiveSendDialog\.showModal\(\)/);
});

test("modal 3: exact immutable offer details are selected for display", async () => {
  const { definitiveConfirmationDetails } = await corePromise;
  const details = definitiveConfirmationDetails({ relationship: base.relationship, demo: { name: "Silverado" }, snapshot });
  assert.equal(details.companyName, "Silverado");
  assert.equal(details.demoName, "Silverado");
  assert.equal(details.websiteName, "Business Website");
  assert.equal(details.careName, "Care Basic");
  assert.equal(details.oneTimeExVatCents, 99500);
  assert.equal(details.recurringExVatCents, 1995);
  assert.equal(details.dueNowExVatCents, 30000);
  assert.equal(details.validUntil, snapshot.validUntil);
});

test("modal 4: customer email is masked rather than rendered raw", async () => {
  const { maskEmail } = await corePromise;
  const masked = maskEmail("silverado@example.test");
  assert.match(masked, /^s[•]+@e[•]+\.test$/);
  assert.doesNotMatch(masked, /silverado|example/);
  assert.match(browser, /details\.maskedEmail/);
});

test("modal 5: staging warning is explicit and definitive staging subject is labelled", () => {
  assert.match(html, /STAGINGTEST[^<]*<\/strong> Deze mail mag uitsluitend naar de beheerde stagingtestontvanger/);
  const mail = buildCommercialOfferMail({ ...base, mode: "definitive", staging: true, interestUrl: "https://maxwebstudio-staging.netlify.app/voorstel-interesse.html#token=safe_token_value_12345678901234567890123456789012" });
  assert.match(mail.subject, /^\[STAGING TEST\]/);
});

test("modal 6: explicit verification checkbox gates the send button", () => {
  assert.match(html, /id="definitive-send-check"[^>]*type="checkbox"/);
  assert.match(html, /id="confirm-definitive-send"[^>]*disabled/);
  assert.match(browser, /!elements\.definitiveSendCheck\.checked \|\| state\.definitiveRequestPending \|\| state\.definitiveRequestLocked/);
});

test("modal 7: cancel closes without invoking the mail request", () => {
  assert.match(browser, /cancelDefinitiveSend\.addEventListener\('click', closeDefinitiveSendDialog\)/);
  const closeBody = browser.match(/function closeDefinitiveSendDialog\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.doesNotMatch(closeBody, /request\(|definitive_send/);
});

test("modal 8: Escape is intercepted and cannot close during an active send", () => {
  assert.match(browser, /addEventListener\('cancel', \(event\) => \{/);
  assert.match(browser, /event\.preventDefault\(\)/);
  assert.match(browser, /if \(!state\.definitiveRequestPending\) closeDefinitiveSendDialog\(\)/);
});

test("modal 9: focus moves into the dialog and returns to the trigger", () => {
  assert.match(browser, /definitiveSendCheck\.focus\(\)/);
  assert.match(browser, /trigger\?\.focus\(\)/);
  assert.match(browser, /state\.definitiveTrigger\?\.focus\(\)/);
});

test("modal 10: keyboard focus is trapped from first through last control", () => {
  assert.match(browser, /trapDefinitiveDialogFocus/);
  assert.match(browser, /event\.key !== 'Tab'/);
  assert.match(browser, /event\.shiftKey && document\.activeElement === first/);
  assert.match(browser, /document\.activeElement === last/);
});

test("modal 11: synchronous pending guard makes double click a single request", () => {
  assert.match(browser, /if \(state\.definitiveRequestPending[^\n]+return;/);
  assert.match(browser, /state\.definitiveRequestPending = true;/);
  assert.match(browser, /actionKey: state\.definitiveActionKey/);
  assert.match(migration, /commercial_offer_mail_dispatch_idempotency unique/);
});

test("modal 12: frontend modal does not replace authoritative server validation", () => {
  const server = read("functions/admin-commercial-offers.js");
  for (const evidence of ["assertPhaseD1Enabled", "assertRelationshipAccess", "offerExpiry", "DEMO_RELATIONSHIP_MISMATCH", "OFFER_NOT_SEND_READY"]) assert.match(server, new RegExp(evidence));
  assert.match(server, /commercial_reserve_offer_dispatch_v1/);
});

test("modal 13: expired offers remain blocked server-side", () => {
  assert.throws(() => endpoint.offerExpiry({ validUntil: "2020-01-01" }), /verlopen/i);
  assert.match(read("functions/admin-commercial-offers.js"), /const snapshotExpiry = offerExpiry\(context\.version\.snapshot\)/);
});

test("modal 14: definitive send still requires successful test-mail evidence", () => {
  assert.match(migration, /Successful test mail evidence is required/);
  assert.match(browser, /previewed && tested/);
});

test("modal 15: wrong relationship or demo linkage stays fail-closed", () => {
  const server = read("functions/admin-commercial-offers.js");
  assert.match(server, /assertRelationshipAccess\(actor, offer\.relationship_type, relationshipRow\)/);
  assert.match(server, /if \(!ownership\[0\]\) throw problem\(409, "DEMO_RELATIONSHIP_MISMATCH"/);
});

test("modal 16: 390px mobile layout has bounded width and no horizontal overflow", () => {
  assert.match(css, /@media\(max-width:520px\)\{\.definitive-send-dialog\{width:calc\(100% - 16px\);max-height:calc\(100dvh - 16px\)\}/);
  assert.match(css, /\.definitive-send-summary\{grid-template-columns:1fr\}/);
  assert.match(css, /overflow-wrap:anywhere/);
});

test("modal 17: desktop dialog remains centered, bounded and scrollable", () => {
  assert.match(css, /\.definitive-send-dialog\{width:min\(720px,calc\(100% - 30px\)\);max-height:calc\(100dvh - 30px\)/);
  assert.match(css, /overflow:auto/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("interest inspection exposes useful offer facts without internal identifiers", () => {
  const details = interest.publicOfferDetails(snapshot, { company_name: "Silverado", email: "secret@example.test" }, { business_name: "Silverado demo" }, snapshot.validUntil);
  assert.equal(details.companyName, "Silverado");
  assert.equal(details.demoName, "Silverado demo");
  assert.equal(details.oneTimeExVatCents, 99500);
  assert.equal(details.recurringExVatCents, 1995);
  assert.equal(details.dueNowExVatCents, 30000);
  assert.equal("id" in details, false);
  assert.equal("email" in details, false);
  assert.match(interestPage, /data\.companyName/);
  assert.doesNotMatch(interestPage, /offerVersionId|relationshipId|dispatchId/);
});
