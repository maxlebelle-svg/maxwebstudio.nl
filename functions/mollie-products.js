const VAT_RATE = 21;

const WEBSITE_PACKAGES = {
  starter_site: {
    websitePackageName: "Starter Site",
    priceExVatCents: 49500,
    depositExVatCents: 15000,
    remainingExVatCents: 34500,
  },
  business_website: {
    websitePackageName: "Business Website",
    priceExVatCents: 99500,
    depositExVatCents: 30000,
    remainingExVatCents: 69500,
  },
  premium_growth: {
    websitePackageName: "Premium Growth",
    priceExVatCents: 175000,
    depositExVatCents: 50000,
    remainingExVatCents: 125000,
  },
};

const CARE_PACKAGES = {
  no_care: {
    carePackageName: "Geen onderhoud",
    priceExVatCents: 0,
  },
  care_basic: {
    carePackageName: "Care Basic",
    priceExVatCents: 1995,
  },
  care_plus: {
    carePackageName: "Care Plus",
    priceExVatCents: 4900,
  },
  care_growth: {
    carePackageName: "Care Growth",
    priceExVatCents: 9900,
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
  return isLive ? process.env.MOLLIE_API_KEY : (process.env.MOLLIE_TEST_API_KEY || process.env.MOLLIE_API_KEY);
}

function getMollieTestApiKey() {
  return process.env.MOLLIE_TEST_API_KEY;
}

function getBaseUrl() {
  return (process.env.BASE_URL || "https://maxwebstudio.nl").replace(/\/$/, "");
}

module.exports = {
  WEBSITE_PACKAGES,
  CARE_PACKAGES,
  getAmounts,
  getBaseUrl,
  getMollieApiKey,
  getMollieTestApiKey,
};
