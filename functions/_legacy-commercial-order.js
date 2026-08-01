// Isolated compatibility contract for the pre-catalog admin order form.
// New commercial offer code must never import this module. It intentionally
// preserves the historical behaviour until that separate production flow is
// retired under its own release approval.
const LEGACY_PACKAGE_CATALOG = Object.freeze({
  starter: Object.freeze({ label: "Starter Website", price: 950 }),
  business: Object.freeze({ label: "Business Website", price: 1750 }),
  premium: Object.freeze({ label: "Premium Website", price: 2950 }),
  maatwerk: Object.freeze({ label: "Maatwerk Website", price: 4500 }),
});

const LEGACY_OPTION_CATALOG = Object.freeze({
  seo: Object.freeze({ label: "SEO basispakket", price: 350 }),
  copy: Object.freeze({ label: "Copywriting", price: 450 }),
  logo: Object.freeze({ label: "Logo opfrissen", price: 300 }),
  rush: Object.freeze({ label: "Spoedoplevering", price: 600 }),
  maintenance: Object.freeze({ label: "Onderhoud eerste maand", price: 95 }),
});

function calculateLegacyDepositExVat(totalInclVat) {
  return Math.round((Number(totalInclVat || 0) * 0.5 / 1.21) * 100) / 100;
}

module.exports = {
  LEGACY_PACKAGE_CATALOG,
  LEGACY_OPTION_CATALOG,
  calculateLegacyDepositExVat,
};
