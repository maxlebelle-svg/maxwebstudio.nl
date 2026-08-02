const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _private } = require("../functions/services/commercialOfferFulfilmentService");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("phase 2 extends the verified Signhost source without replacing its privacy model", () => {
  const sql = read("supabase/migrations/20260802230000_commercial_offer_phase_2_fulfilment.sql");
  assert.match(sql, /commercial_offer_signing_transactions/);
  assert.match(sql, /commercial_finalize_offer_signature_v1/);
  assert.match(sql, /signed_document_sha256 is null or tx\.receipt_sha256 is null/);
  assert.doesNotMatch(sql, /create table public\.commercial_offer_signing_transactions/i);
  assert.doesNotMatch(sql, /signer_(?:email|phone)\s+text/i);
});

test("one signed offer can create only one fulfilment run, invoice path and production handoff", () => {
  const sql = read("supabase/migrations/20260802230000_commercial_offer_phase_2_fulfilment.sql");
  assert.match(sql, /offer_version_id uuid not null unique/);
  assert.match(sql, /signing_transaction_id uuid not null unique/);
  assert.match(sql, /commercial_claim_signed_fulfilment_v1/);
  assert.match(sql, /commercial_finalize_fulfilment_v1/);
  assert.match(sql, /payment_pending/);
  assert.match(sql, /ready_for_production/);
  assert.match(sql, /grant execute[\s\S]*service_role/);
  assert.doesNotMatch(sql, /grant execute[^;]*(?:anon|authenticated)/i);
});

test("the payment request uses the immutable due-now amount exactly", () => {
  assert.deepEqual(_private.paymentAmounts({ due_now_ex_vat_cents: 10000, due_now_incl_vat_cents: 12100 }), {
    totalCents: 12100,
    subtotalCents: 10000,
    vatCents: 2100,
    total: 121,
    subtotal: 100,
    vat: 21,
  });
});

test("signed postback activates the portal, claims fulfilment and sends one idempotent payment request", () => {
  const postback = read("functions/signhost-postback.js");
  const service = read("functions/services/commercialOfferFulfilmentService.js");
  assert.match(postback, /activateSignedCommercialOffer/);
  assert.match(postback, /fulfilSignedCommercialOffer/);
  assert.match(service, /commercial_claim_signed_fulfilment_v1/);
  assert.match(service, /Idempotency-Key.*commercial-offer-/s);
  assert.match(service, /commercial-offer-payment-request:\$\{claim\.offerVersionId\}/);
  assert.match(service, /commercial_offer_payment_request/);
  assert.match(service, /email_sent_at/);
});

test("payment releases the linked Factory dossier only after Mollie confirms paid", () => {
  const webhook = read("functions/mollie-webhook.js");
  assert.match(webhook, /if \(payment\.status === "paid"\)[\s\S]*finalizeSignedOfferFulfilmentIfNeeded/);
  assert.match(webhook, /paymentStatus: "paid"/);
  assert.match(webhook, /status: \["intake", "ready", "paused"\][\s\S]*"in_production"/);
  assert.match(webhook, /input_status: "ready_for_production"/);
});

test("the post-signature automation remains behind an explicit production feature flag", () => {
  const service = read("functions/services/commercialOfferFulfilmentService.js");
  assert.match(service, /COMMERCIAL_OFFER_POST_SIGNATURE_ENABLED/);
  assert.match(service, /COMMERCIAL_POST_SIGNATURE_DISABLED/);
});
