const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const checkout = fs.readFileSync(path.join(root, "public/betalen.html"), "utf8");
const commercialOrder = require("../functions/commercial-order");
const adminMolliePayment = require("../functions/admin-mollie-payment");

function validOrder(overrides = {}) {
  return {
    publicCheckout: true,
    source: "public_checkout",
    websitePackage: "starter_site",
    productIds: ["starter_site"],
    paymentChoice: "deposit",
    customerName: "Max Test",
    customerEmail: "max@example.nl",
    customerPhone: "0612345678",
    companyName: "Testbedrijf B.V.",
    kvkNumber: "12 34 56 78",
    businessPurposeConfirmed: true,
    businessPurposeConfirmedAt: "2026-08-02T12:00:00.000Z",
    termsAccepted: true,
    termsAcceptedAt: "2026-08-02T12:00:00.000Z",
    ...overrides,
  };
}

test("public checkout requires company, KvK number and a business-purpose confirmation", () => {
  assert.match(checkout, /name="companyName"[^>]*required/);
  assert.match(checkout, /name="kvkNumber"[^>]*pattern="\[0-9\]\{8\}"[^>]*required/);
  assert.match(checkout, /name="businessPurposeConfirmed"[^>]*required/);
  assert.match(checkout, /uitsluitend voor zakelijke klanten/);
});

test("public order validation normalizes and records the business evidence", () => {
  const value = commercialOrder._private.validatePayload(validOrder());
  assert.equal(value.company, "Testbedrijf B.V.");
  assert.equal(value.kvkNumber, "12345678");
  assert.equal(value.businessPurposeConfirmed, true);
  assert.equal(value.businessPurposeConfirmedAt, "2026-08-02T12:00:00.000Z");
});

test("public order validation rejects incomplete business identification", () => {
  assert.throws(
    () => commercialOrder._private.validatePayload(validOrder({ companyName: "" })),
    /Vul je bedrijfsnaam in/,
  );
  assert.throws(
    () => commercialOrder._private.validatePayload(validOrder({ kvkNumber: "1234" })),
    /geldig KvK-nummer van 8 cijfers/,
  );
  assert.throws(
    () => commercialOrder._private.validatePayload(validOrder({ businessPurposeConfirmed: false })),
    /uitsluitend zakelijk sluit/,
  );
  assert.throws(
    () => commercialOrder._private.validatePayload(validOrder({ businessPurposeConfirmed: "false" })),
    /uitsluitend zakelijk sluit/,
  );
});

test("public checkout follows the explicit Mollie mode and never forces the test key in production", () => {
  const base = {
    SITE_URL: "https://maxwebstudio.nl",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    MOLLIE_TEST_API_KEY: "test_example",
    MOLLIE_API_KEY: "live_example",
  };
  const previous = Object.fromEntries(Object.keys(base).concat(["MOLLIE_MODE", "MOLLIE_ALLOW_LIVE_PAYMENTS"]).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, base, { MOLLIE_MODE: "live", MOLLIE_ALLOW_LIVE_PAYMENTS: "true" });
    const live = commercialOrder._private.readConfig({ publicCheckout: true });
    assert.equal(live.success, true);
    assert.equal(live.testMode, false);
    assert.equal(live.mollieApiKey, "live_example");

    Object.assign(process.env, { MOLLIE_MODE: "test", MOLLIE_ALLOW_LIVE_PAYMENTS: "false" });
    const testConfig = commercialOrder._private.readConfig({ publicCheckout: true });
    assert.equal(testConfig.success, true);
    assert.equal(testConfig.testMode, true);
    assert.equal(testConfig.mollieApiKey, "test_example");
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : (process.env[key] = value);
  }
});

test("an old test checkout is never reused after the live switch", () => {
  const oldTestInvoice = {
    status: "sent",
    environment: "production",
    notes: 'TESTORDER - Mollie testbetaling. Niet leveren. {"testOrder":true}',
    mollie_payment_id: "tr_old_test",
    mollie_checkout_url: "https://www.mollie.com/checkout/old-test",
    mollie_payment_status: "open",
  };
  assert.equal(commercialOrder._private.invoicePaymentEnvironment(oldTestInvoice), "test");
  assert.equal(commercialOrder._private.hasReusableOrderCheckout(oldTestInvoice, { testMode: false }), false);
  assert.equal(commercialOrder._private.hasReusableOrderCheckout(oldTestInvoice, { testMode: true }), true);
  assert.equal(adminMolliePayment._private.hasReusableCheckout({ ...oldTestInvoice, environment: "test", is_demo: true }, { testMode: false }), false);
  assert.equal(adminMolliePayment._private.hasReusableCheckout({ ...oldTestInvoice, environment: "test", is_demo: true }, { testMode: true }), true);
});
