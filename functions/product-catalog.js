// Backwards-compatible projection of the canonical commercial catalog.
// New code should import _commercial-catalog directly.
const {
  VAT_RATE,
  WEBSITE_PRODUCT_IDS,
  CARE_PRODUCT_IDS,
  legacyProducts,
} = require("./_commercial-catalog");

const PRODUCTS = legacyProducts();

function centsToEuro(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

function euroToMollieValue(euro) {
  return Number(euro || 0).toFixed(2);
}

function withVatCents(exVatCents, vatRate = VAT_RATE) {
  return Math.round(Number(exVatCents || 0) * (1 + vatRate / 100));
}

module.exports = {
  VAT_RATE,
  PRODUCTS,
  WEBSITE_PRODUCT_IDS,
  CARE_PRODUCT_IDS,
  centsToEuro,
  euroToMollieValue,
  withVatCents,
};
