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
const hardening = read("supabase/migrations/20260731100000_harden_commercial_offer_interest_security.sql");
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

test("proposal mail visibly reconciles the original amount, discount and final total", () => {
  const discountedSnapshot = offerService.buildOfferVersion({ paymentChoice: "full", discountPercentage: 25, selections: [{ productId: "business_website" }, { productId: "care_basic" }] }, { id: "11111111-1111-4111-8111-111111111111", profileId: "22222222-2222-4222-8222-222222222222", role: "admin" });
  const mail = buildCommercialOfferMail({ ...base, snapshot: discountedSnapshot, mode: "preview" });
  assert.match(mail.text, /Eenmalig vóór korting: € 995,00/);
  assert.match(mail.text, /Korting \(25%\): -€ 248,75/);
  assert.match(mail.text, /Eenmalig na korting excl\. btw: € 746,25/);
  assert.match(mail.text, /Per maand excl\. btw: € 19,95/);
  assert.match(mail.html, /Korting \(25%\)/);
});

test("Silverado proposal mail shows the storefront and restaurant portal as separate verified actions", () => {
  const demo = {
    ...base.demo,
    type: "food",
    storefrontUrl: "https://max-webstudio-food-demo.netlify.app/food/silverado-roti-shop-emmeloord",
    restaurantPortalUrl: "https://max-webstudio-food-demo.netlify.app/admin/food",
  };
  const mail = buildCommercialOfferMail({ ...base, demo, mode: "preview" });
  assert.match(mail.html, />Bekijk de bestelpagina</);
  assert.match(mail.html, />Open het restaurantportaal</);
  assert.match(mail.html, /href="https:\/\/max-webstudio-food-demo\.netlify\.app\/food\/silverado-roti-shop-emmeloord"/);
  assert.match(mail.html, /href="https:\/\/max-webstudio-food-demo\.netlify\.app\/admin\/food"/);
  assert.match(mail.text, /Bestelpagina voor klanten:/);
  assert.match(mail.text, /Restaurantportaal voor beheer:/);
  assert.doesNotMatch(mail.html, />Demo op computer bekijken</);
  const preview = endpoint.publicMail(mail);
  assert.equal(preview.storefrontUrl, demo.storefrontUrl);
  assert.equal(preview.restaurantPortalUrl, demo.restaurantPortalUrl);
});

test("an incomplete food proposal fails closed before email delivery", () => {
  assert.throws(() => buildCommercialOfferMail({ ...base, demo: { ...base.demo, type: "food", storefrontUrl: base.demo.mobileUrl }, mode: "test" }), /restaurant-demo mist/i);
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

test("Phase D1 is enabled only for exact staging or production host and database pairs", () => {
  const previous = { flag: process.env.COMMERCIAL_OFFER_PHASE_D1_ENABLED, url: process.env.URL, supabaseUrl: process.env.SUPABASE_URL };
  try {
    process.env.COMMERCIAL_OFFER_PHASE_D1_ENABLED = "true";
    process.env.URL = "https://maxwebstudio-staging.netlify.app";
    process.env.SUPABASE_URL = "https://xlxpuuycigeqhgxqtzni.supabase.co";
    assert.equal(endpoint.phaseD1Enabled(), true);
    assert.equal(endpoint.isStagingDeployment(), true);
    process.env.URL = "https://maxwebstudio.nl";
    process.env.SUPABASE_URL = "https://yxxahurphdbblkuxoeje.supabase.co";
    assert.equal(endpoint.phaseD1Enabled(), true);
    assert.equal(endpoint.isStagingDeployment(), false);
    process.env.SUPABASE_URL = "https://wrong-project.supabase.co";
    assert.equal(endpoint.phaseD1Enabled(), false);
    process.env.URL = "https://wrong-site.example";
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

test("hardening migration is the only forward-only D1 security migration", () => {
  assert.match(hardening, /^-- Harden D1 interest access/m);
  assert.match(hardening, /begin;[\s\S]*commit;/);
  assert.match(hardening, /Commercial offer D1 foundation is missing/);
  assert.doesNotMatch(hardening, /drop table|truncate|delete from/i);
});

test("definitive mail content is structurally redacted while provider delivery keeps its body", () => {
  const server = read("functions/admin-commercial-offers.js");
  const logger = read("functions/services/mailLogService.js");
  assert.match(server, /sensitiveContent: kind === "definitive"/);
  assert.match(logger, /html_body: sensitiveContent \? null/);
  assert.match(logger, /text_body: sensitiveContent \? null/);
  assert.match(logger, /contentRedacted: true/);
  assert.match(hardening, /set html_body=null,text_body=null/);
});

test("sensitive definitive proposal logs cannot be replayed through Mail Center", () => {
  const source = read("functions/admin-email-logs.js");
  assert.match(source, /metadata\?\.contentRedacted === true/);
  assert.match(source, /commercial_offer_definitive/);
  assert.match(source, /kan niet vanuit Mail Center opnieuw worden verzonden/);
});

test("one active unconfirmed token per immutable version is database enforced", () => {
  assert.match(hardening, /unique index commercial_offer_interest_one_active_unconfirmed_idx/);
  assert.match(hardening, /where confirmed_at is null and revoked_at is null/);
  assert.match(hardening, /for update/);
});

test("resend revokes only the previous unconfirmed link with actor and reason evidence", () => {
  assert.match(hardening, /confirmed_at is null and revoked_at is null/);
  assert.match(hardening, /revoked_by_profile_id=input_actor_profile_id/);
  assert.match(hardening, /revoked_by_auth_user_id=input_actor_auth_user_id/);
  assert.match(hardening, /offer\.previous_interest_token_revoked/);
  assert.match(hardening, /offer\.email_resent/);
});

test("confirmed interest blocks creation of a fresh unconfirmed token", () => {
  assert.match(hardening, /confirmed_at is not null/);
  assert.match(hardening, /Confirmed interest cannot create a new access token/);
  assert.doesNotMatch(browser, /currentVersionStatus === 'interested'.*resendReady/);
  assert.match(browser, /resendReady && !interestConfirmed/);
});

test("interest confirmation is an explicit offer and version lifecycle status", async () => {
  const { statusLabel } = await corePromise;
  assert.equal(statusLabel("interested"), "Interesse bevestigd");
  assert.match(hardening, /update public\.commercial_offer_versions set status='interested'/);
  assert.match(hardening, /update public\.commercial_offers set status='interested'/);
  assert.match(hardening, /'offer\.interest_confirmed'.*'interested'/s);
});

test("stale, revoked and expired interest links remain fail closed", () => {
  assert.match(hardening, /token_record\.revoked_at is not null or token_record\.expires_at<=clock_timestamp\(\)/);
  assert.match(hardening, /offer_record\.current_version_id is distinct from version_record\.id/);
  assert.match(hardening, /version_record\.status not in \('sent','viewed'\)/);
});

test("interest revoke is restricted to admin roles and requires a bounded reason", () => {
  const server = read("functions/admin-commercial-offers.js");
  assert.match(server, /\["super_admin", "admin"\]\.includes\(normalizeRole\(actor\.role\)\)/);
  assert.match(server, /reason\.length < 8 \|\| reason\.length > 500/);
  assert.match(hardening, /actor_role not in \('super_admin','admin'\)/);
  assert.match(hardening, /offer\.interest_access_revoked/);
});

test("revoke maintenance redacts existing staging message bodies with append-only audit", () => {
  assert.match(hardening, /commercial_redact_offer_email_logs_v1/);
  assert.match(hardening, /template_key='commercial_offer_definitive'/);
  assert.match(hardening, /offer\.sensitive_email_log_redacted/);
  assert.match(hardening, /jsonb_build_array\('html_body','text_body'\)/);
  assert.doesNotMatch(hardening, /raw_token|token_plaintext|interest_url.*safe_metadata/i);
});

test("revoke modal is accessible, explicit and never uses a native prompt", () => {
  assert.match(html, /id="revoke-interest-dialog"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="revoke-interest-title"/);
  assert.match(html, /id="revoke-interest-reason"[^>]*minlength="8"[^>]*maxlength="500"/);
  assert.match(html, /id="confirm-revoke-interest"[^>]*disabled/);
  assert.match(browser, /revokeInterestDialog\.showModal\(\)/);
  assert.match(browser, /trapDialogFocus/);
  assert.doesNotMatch(browser, /window\.(?:confirm|alert|prompt)/);
});

test("revoke modal shows only safe operational facts and masks the recipient", () => {
  assert.match(html, /Laatste verzending/);
  assert.match(html, /Link geldig tot/);
  assert.match(html, /Interesse bevestigd/);
  assert.match(browser, /revokeRecipient\.textContent = details\.maskedEmail/);
  assert.doesNotMatch(html, /token_sha256|raw token|service.role/i);
});

test("revoke UI is disabled without active unconfirmed access or sufficient role", () => {
  assert.match(browser, /!token\.confirmed_at && !token\.revoked_at/);
  assert.match(browser, /capabilities\?\.revokeInterest/);
  assert.match(browser, /elements\.revokeInterest\.disabled/);
  assert.match(read("functions/admin-commercial-offers.js"), /revokeInterest: phaseD1Enabled\(\)/);
});

test("revoke request is idempotent and performs no provider action", () => {
  const body = browser.match(/async function revokeInterestAccess\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(body, /state\.revokeInterestPending = true/);
  assert.match(body, /action: 'revoke_interest'/);
  assert.match(body, /redactionActionKey/);
  assert.doesNotMatch(body, /definitive_send|sendTestMail|sendTrackedEmail/);
  assert.match(hardening, /idempotency_key=input_idempotency_key/);
});

test("D1 hardening remains free of production providers and activation side effects", () => {
  const scope = [hardening, read("functions/admin-commercial-offers.js"), browser].join("\n");
  assert.doesNotMatch(scope, /signhost|api\.mollie|insert into public\.invoices|insert into public\.subscriptions|start_onboarding/i);
});

test("manual definitive recipient is normalized while test mail remains admin-only", () => {
  const actor = { email: "beheerder@maxwebstudio.nl" };
  const relationship = { email: "lead@voorbeeld.nl" };
  assert.equal(endpoint.resolveDispatchRecipient("definitive", { recipientEmail: " Keuze@Voorbeeld.nl " }, actor, relationship), "keuze@voorbeeld.nl");
  assert.equal(endpoint.resolveDispatchRecipient("definitive", {}, actor, relationship), "lead@voorbeeld.nl");
  assert.equal(endpoint.resolveDispatchRecipient("test", { recipientEmail: "klant@voorbeeld.nl" }, actor, relationship), "beheerder@maxwebstudio.nl");
  assert.throws(() => endpoint.resolveDispatchRecipient("definitive", { recipientEmail: "ongeldig" }, actor, relationship), /geldig verzendadres/i);
  assert.match(browser, /relationship: \{ \.\.\.state\.data\.relationship, email: effectiveRecipientEmail\(\) \}/);
});

test("production preview and dispatch do not force a staging label", () => {
  const server = read("functions/admin-commercial-offers.js");
  assert.doesNotMatch(server, /buildCommercialOfferMail\([^\n]+staging:\s*true/);
  assert.match(server, /staging: isStagingDeployment\(\)/);
});

test("Silverado manual preview maps computer to the restaurant portal and mobile to the storefront", () => {
  const previousUrl = process.env.URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.URL = "https://maxwebstudio.nl";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-qr-signing-secret";
    const demo = endpoint.mapDemo({
      id: "33333333-3333-4333-8333-333333333333",
      business_name: "Emmeloord Rotishop",
      preview_url: "/.netlify/functions/manual-preview-render?version=9e1c8a3b-06e2-4187-9a5b-97152b03ec93&token=safe-token",
      preview_package: {},
    });
    assert.equal(demo.type, "food");
    assert.equal(demo.storefrontUrl, endpoint.SILVERADO_FOOD_DEMO.storefrontUrl);
    assert.equal(demo.restaurantPortalUrl, endpoint.SILVERADO_FOOD_DEMO.restaurantPortalUrl);
    assert.equal(demo.desktopUrl, endpoint.SILVERADO_FOOD_DEMO.restaurantPortalUrl);
    assert.equal(demo.mobileUrl, endpoint.SILVERADO_FOOD_DEMO.storefrontUrl);
    assert.match(demo.qrCodeUrl, /^https:\/\/maxwebstudio\.nl\/api\/commercial-offer-qr\?target=/);
    assert.match(decodeURIComponent(demo.qrCodeUrl), /max-webstudio-food-demo\.netlify\.app\/food\/silverado-roti-shop-emmeloord/);
    assert.doesNotThrow(() => buildCommercialOfferMail({ ...base, demo, mode: "preview" }));
    assert.equal(endpoint.isSilveradoFoodDemo({ business_name: "Andere rotishop", preview_url: "/preview/andere-rotishop" }), false);
  } finally {
    if (previousUrl === undefined) delete process.env.URL; else process.env.URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("proposal mail uses the canonical Max Webstudio dark branding", () => {
  const mail = buildCommercialOfferMail({ ...base, mode: "test" });
  assert.match(mail.html, /supported-color-schemes/);
  assert.match(mail.html, /assets\/maxwebstudio-logo-mark\.png/);
  assert.match(mail.html, /class="mws-card"/);
  assert.match(mail.html, /#061626/);
  assert.match(mail.html, /bgcolor="#061626"/);
  assert.doesNotMatch(mail.html, /rgba\(/);
  assert.match(mail.html, /wa\.me\/31851302326/);
  assert.match(mail.html, /@media\(max-width:620px\)/);
});

test("production hides the staging-only definitive warning", () => {
  assert.match(html, /id="definitive-staging-warning" hidden/);
  assert.match(browser, /definitiveStagingWarning\.hidden = !state\.data\?\.capabilities\?\.stagingMail/);
  assert.match(read("functions/admin-commercial-offers.js"), /stagingMail: isStagingDeployment\(\)/);
});

test("version history selects only the current immutable version of an offer", () => {
  assert.match(browser, /class="version-select"/);
  assert.match(browser, /data-offer-id/);
  assert.match(browser, /offer\.current_version_id !== version\.id/);
  assert.match(browser, /Alleen de actuele versie van een voorstel kan veilig worden verzonden/);
  assert.match(browser, /state\.currentVersionId = version\.id/);
});
