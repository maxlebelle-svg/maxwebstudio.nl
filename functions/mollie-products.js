const VAT_RATE = 21;

const PRODUCTS = {
  starter_site_full: {
    productName: "Starter Site volledig betalen",
    description: "Max Webstudio - Starter Site volledig betalen",
    amountExVatCents: 49500,
  },
  business_website_full: {
    productName: "Business Website volledig betalen",
    description: "Max Webstudio - Business Website volledig betalen",
    amountExVatCents: 99500,
  },
  premium_growth_full: {
    productName: "Premium Growth volledig betalen",
    description: "Max Webstudio - Premium Growth volledig betalen",
    amountExVatCents: 175000,
  },
  starter_site_deposit: {
    productName: "Starter Site aanbetaling",
    description: "Max Webstudio - Starter Site aanbetaling",
    amountExVatCents: 15000,
  },
  business_website_deposit: {
    productName: "Business Website aanbetaling",
    description: "Max Webstudio - Business Website aanbetaling",
    amountExVatCents: 30000,
  },
  premium_growth_deposit: {
    productName: "Premium Growth aanbetaling",
    description: "Max Webstudio - Premium Growth aanbetaling",
    amountExVatCents: 50000,
  },
  care_basic: {
    productName: "Care Basic",
    description: "Max Webstudio - Care Basic",
    amountExVatCents: 1995,
  },
  care_plus: {
    productName: "Care Plus",
    description: "Max Webstudio - Care Plus",
    amountExVatCents: 4900,
  },
  care_growth: {
    productName: "Care Growth",
    description: "Max Webstudio - Care Growth",
    amountExVatCents: 9900,
  },
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

function centsToEuro(cents) {
  return (cents / 100).toFixed(2);
}

function getMollieApiKey() {
  const isLive = process.env.MOLLIE_MODE === "live";
  return isLive ? process.env.MOLLIE_API_KEY : process.env.MOLLIE_TEST_API_KEY;
}

function getBaseUrl() {
  return (process.env.BASE_URL || "https://maxwebstudio.nl").replace(/\/$/, "");
}

module.exports = {
  PRODUCTS,
  getAmounts,
  getBaseUrl,
  getMollieApiKey,
};
