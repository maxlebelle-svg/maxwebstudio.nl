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
const legacy = read("public/admin-nieuwe-opdracht.html");

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
  assert.match(read("functions/commercial-offer-interest.js"), /commercial_offer_versions\?select=snapshot/);
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
