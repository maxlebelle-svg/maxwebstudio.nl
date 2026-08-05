const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fulfilment = require("../functions/services/commercialOfferFulfilmentService")._private;
const signhost = require("../functions/services/signhostService");

test("phase 2 extends the canonical Signhost transaction and adds idempotent fulfilment state", () => {
  const signhostSql = read("supabase/migrations/20260802213000_commercial_offer_signhost.sql");
  const sql = read("supabase/migrations/20260802230000_commercial_offer_phase_2_fulfilment.sql");
  assert.match(signhostSql, /create table public\.commercial_offer_signing_transactions/i);
  assert.doesNotMatch(sql, /create table public\.commercial_offer_signing_transactions/i);
  assert.match(sql, /alter table public\.commercial_offer_signing_transactions/i);
  assert.match(sql, /signing_origin text not null default 'customer_link'/i);
  assert.match(sql, /signing_origin='staff_direct'/i);
  assert.match(sql, /encode\(extensions\.digest\(lower\(btrim\(input_signer_email\)\),'sha256'\),'hex'\)/i);
  assert.doesNotMatch(sql, /\bsigner_email\s+text\b/i);
  assert.match(sql, /create table public\.commercial_offer_fulfilment_runs/i);
  assert.match(sql, /constraint commercial_offer_fulfilment_version_unique unique \(offer_version_id\)/i);
  assert.match(sql, /commercial_claim_signed_fulfilment_v1/i);
  assert.match(sql, /on conflict\(offer_version_id\) do update/i);
  assert.match(sql, /commercial_finalize_fulfilment_v1/i);
  assert.match(sql, /commercial-private-documents/i);
  assert.match(sql, /grant execute .* to service_role/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete).* to (anon|authenticated)/i);
});

test("signed offer fulfilment uses immutable version totals", () => {
  assert.deepEqual(fulfilment.paymentAmounts({ due_now_ex_vat_cents: 30000, due_now_incl_vat_cents: 36300 }), {
    totalCents: 36300,
    subtotalCents: 30000,
    vatCents: 6300,
    total: 363,
    subtotal: 300,
    vat: 63,
  });
  assert.equal(fulfilment.orderId("11111111-1111-4111-8111-111111111111"), "signed_offer_11111111111141118111111111111111");
  assert.equal(fulfilment.packageLabel({ lines: [{ componentType: "one_time", productName: "Business website" }, { componentType: "recurring", productName: "Care" }] }), "Business website");
});

test("signed-offer fulfilment never reuses a checkout from the other Mollie environment", () => {
  assert.equal(fulfilment.invoiceMatchesMollieEnvironment({ environment: "test", is_demo: true }, { testMode: false }), false);
  assert.equal(fulfilment.invoiceMatchesMollieEnvironment({ environment: "production", is_demo: false }, { testMode: false }), true);
  assert.equal(fulfilment.invoiceMatchesMollieEnvironment({ environment: "test", is_demo: true }, { testMode: true }), true);
  assert.equal(fulfilment.invoiceMatchesMollieEnvironment({ environment: "production", is_demo: false }, { testMode: true }), false);
});

test("pre-payment customer state stays inside the canonical CRM schema", () => {
  const service = read("functions/services/commercialOfferFulfilmentService.js");
  assert.match(service, /status: existing\?\.status \|\| "onboarding"/);
  assert.match(service, /converted_customer_id: customerId/);
  assert.doesNotMatch(service, /customer_id: customerId, converted_customer_id/);
  assert.match(service, /relationship_type: "customer"/);
  assert.match(service, /relationship_id: customerId/);
});

test("commercial Signhost metadata binds exactly one customer signature", () => {
  const transaction = { Signers: [{ Id: "signer-1", Email: "klant@example.nl" }] };
  const metadata = signhost.buildCommercialOfferMetadata(transaction, { signerEmail: "klant@example.nl", pageNumber: 6, displayName: "Definitieve offerte" });
  assert.deepEqual(metadata.Signers, { "signer-1": { FormSets: ["CustomerSignature"] } });
  assert.equal(metadata.FormSets.CustomerSignature.Handtekening.Type, "Signature");
  assert.equal(metadata.FormSets.CustomerSignature.Handtekening.Location.PageNumber, 6);
});

test("admin composer exposes signature only after confirmed interest", () => {
  const endpoint = read("functions/admin-commercial-offer-signing.js");
  const ui = read("public/src/offer-composer-phase2.js");
  const html = read("public/admin-offer-composer.html");
  assert.match(endpoint, /request_signature/);
  assert.match(endpoint, /reconcile_signature/);
  assert.match(endpoint, /resume_fulfilment/);
  assert.match(endpoint, /fulfilSignedCommercialOffer/);
  assert.match(endpoint, /activateSignedCommercialOffer[\s\S]*fulfilSignedCommercialOffer/);
  assert.match(endpoint, /persistSignerEmailIfMissing/);
  assert.match(endpoint, /getTransaction/);
  assert.match(endpoint, /commercial_reserve_signature_v1/);
  assert.match(endpoint, /SIGNABLE_DOCUMENT_INTEGRITY_FAILED/);
  assert.doesNotMatch(endpoint, /commercial_offer_signing_transactions\?select=[^`]*signing_origin/);
  assert.match(ui, /if \(!state\.interestConfirmed\)/);
  assert.match(ui, /Naar Signhost sturen/);
  assert.match(ui, /Status bij Signhost controleren/);
  assert.match(ui, /Mollie-testbetaallink/);
  assert.match(ui, /reconciliationError/);
  assert.match(ui, /resumeFulfilment/);
  assert.match(ui, /error\.code/);
  assert.match(endpoint, /SIGNHOST_RECONCILE_/);
  assert.match(html, /offer-composer-phase2\.js/);
  assert.match(ui, /klantstatus, factuur, betaallink en productieoverdracht automatisch/i);
});

test("production repair restores both idempotent fulfilment RPCs to the API schema", () => {
  const sql = read("supabase/migrations/20260804173000_repair_commercial_fulfilment_rpcs.sql");
  assert.match(sql, /create or replace function public\.commercial_claim_signed_fulfilment_v1/);
  assert.match(sql, /create or replace function public\.commercial_finalize_fulfilment_v1/);
  assert.match(sql, /grant execute[\s\S]*service_role/);
  assert.match(sql, /notify pgrst,'reload schema'/);
  assert.doesNotMatch(sql, /grant execute[^;]*\b(?:anon|authenticated)\b/i);
});

test("Signhost and Mollie webhooks complete the two provider halves", () => {
  const signhostPostback = read("functions/signhost-postback.js");
  const mollieWebhook = read("functions/mollie-webhook.js");
  assert.match(signhostPostback, /commercial_offer_signing_transactions/);
  assert.match(signhostPostback, /fulfilSignedCommercialOffer/);
  assert.match(signhostPostback, /preserveCommercialArtifacts/);
  assert.match(mollieWebhook, /finalizeSignedOfferFulfilmentIfNeeded/);
  assert.match(mollieWebhook, /commercial_finalize_fulfilment_v1/);
  assert.match(mollieWebhook, /"in_production"/);
});
