const {
  VAT_RATE,
  PRODUCTS,
  WEBSITE_PRODUCT_IDS,
  CARE_PRODUCT_IDS,
} = require("./_commercial-catalog");

function oneTimeAmount(product) {
  return product.components.find((entry) => entry.type === "one_time")?.amountExVatCents || 0;
}

function recurringAmount(product) {
  return product.components.find((entry) => entry.type === "recurring")?.amountExVatCents || 0;
}

const WEBSITE_PACKAGES = Object.fromEntries(WEBSITE_PRODUCT_IDS.map((id) => {
  const item = PRODUCTS[id];
  const priceExVatCents = oneTimeAmount(item);
  return [id, {
    websitePackageName: item.name,
    priceExVatCents,
    depositExVatCents: item.fixedDepositExVatCents,
    remainingExVatCents: priceExVatCents - item.fixedDepositExVatCents,
  }];
}));

const CARE_PACKAGES = {
  no_care: { carePackageName: "Geen onderhoud", priceExVatCents: 0 },
  ...Object.fromEntries(CARE_PRODUCT_IDS.map((id) => [id, {
    carePackageName: PRODUCTS[id].name,
    priceExVatCents: recurringAmount(PRODUCTS[id]),
  }])),
};

function getAmounts(amountExVatCents) {
  const vatAmountCents = Math.round((amountExVatCents * VAT_RATE) / 100);
  const amountInclVatCents = amountExVatCents + vatAmountCents;
  return {
    amountExVat: centsToEuro(amountExVatCents),
    vatAmount: centsToEuro(vatAmountCents),
    amountInclVat: centsToEuro(amountInclVatCents),
  };
}

function centsToEuro(cents) { return (cents / 100).toFixed(2); }
function getMollieApiKey() { return process.env.MOLLIE_MODE === "live" ? process.env.MOLLIE_API_KEY : (process.env.MOLLIE_TEST_API_KEY || process.env.MOLLIE_API_KEY); }
function getMollieTestApiKey() { return process.env.MOLLIE_TEST_API_KEY; }
function getBaseUrl() { return (process.env.BASE_URL || "https://maxwebstudio.nl").replace(/\/$/, ""); }

module.exports = {
  WEBSITE_PACKAGES,
  CARE_PACKAGES,
  getAmounts,
  getBaseUrl,
  getMollieApiKey,
  getMollieTestApiKey,
};
