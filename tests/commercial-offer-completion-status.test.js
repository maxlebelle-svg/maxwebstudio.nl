const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const statusApi = require("../functions/commercial-offer-completion-status")._test;

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("public completion status exposes only coarse safe customer actions", () => {
  const signing = { status:"completed", signed_at:"2026-08-04T00:00:00Z" };
  const fulfilment = { status:"payment_pending", customer_id:"customer-1", invoice_id:"invoice-1", updated_at:"2026-08-04T00:00:01Z" };
  const invoice = { invoice_number:"OFF-2026-1", total:181.5, status:"sent", mollie_checkout_url:"https://www.mollie.com/checkout/select-method/test", mollie_payment_status:"open", environment:"test" };
  const result = statusApi.publicStatus(signing, fulfilment, invoice);
  assert.equal(result.state, "payment_pending");
  assert.equal(result.portalReady, true);
  assert.equal(result.payment.amount, "181.50");
  assert.equal(result.payment.testMode, true);
  assert.match(result.payment.checkoutUrl, /^https:\/\/www\.mollie\.com\/checkout\//);
  assert.deepEqual(Object.keys(result).sort(), ["payment", "portalReady", "portalUrl", "signingConfirmed", "state", "updatedAt"].sort());
});

test("completion status never returns an unapproved payment host", () => {
  const result = statusApi.publicStatus(
    { status:"completed", signed_at:"2026-08-04T00:00:00Z" },
    { status:"payment_pending", customer_id:"customer-1", invoice_id:"invoice-1" },
    { total:181.5, status:"sent", mollie_checkout_url:"https://mollie.example.test/checkout", mollie_payment_status:"open", environment:"test" },
  );
  assert.equal(result.state, "processing");
  assert.equal(result.payment, null);
  assert.equal(statusApi.safePaymentUrl("javascript:alert(1)"), "");
});

test("Mollie return page waits for the verified webhook and routes to the portal", () => {
  const page = read("public/betaling-verwerken.html");
  const fulfilment = read("functions/services/commercialOfferFulfilmentService.js");
  const netlify = read("netlify.toml");
  assert.match(page, /Mollie stuurt de definitieve betaalstatus beveiligd/);
  assert.match(page, /commercial-offer-completion-status/);
  assert.doesNotMatch(page, /payment.?=.?paid|status.?=.?paid/i);
  assert.match(fulfilment, /\/betaling-verwerken\?status=/);
  assert.doesNotMatch(fulfilment, /redirectUrl: `\$\{config\.siteUrl\}\/bedankt\.html/);
  assert.match(netlify, /from = "\/betaling-verwerken"[\s\S]*to = "\/betaling-verwerken\.html"/);
});
