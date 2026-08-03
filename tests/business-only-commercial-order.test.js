const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const checkout = fs.readFileSync(path.join(root, "public/betalen.html"), "utf8");
const commercialOrder = require("../functions/commercial-order");

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
