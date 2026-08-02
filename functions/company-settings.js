const DEFAULT_COMPANY_SETTINGS = Object.freeze({
  companyName: "Max Webstudio",
  phoneDisplay: "085 130 2326",
  phoneInternational: "+31851302326",
  whatsappNumber: "+31851302326",
  primaryEmail: "info@maxwebstudio.nl",
  websiteUrl: "https://www.maxwebstudio.nl",
  legalName: "Max Webstudio",
  tradeName: "Max Webstudio",
  addressLine1: "1319 DJ Almere",
  addressLine2: "",
  kvkNumber: "73275786",
  vatNumber: "NL002348726B70",
  iban: "NL11 INGB 0008 7856 94",
  ibanAccountName: "Lebellebox",
  paymentTermDays: 14,
  logoUrl: "https://maxwebstudio.nl/max-webstudio-logo-full.svg",
});

function cleanText(value) {
  return String(value || "").trim();
}

function cleanPhoneValue(value) {
  return cleanText(value).replace(/[^\d+]/g, "");
}

function phoneToWaNumber(value) {
  return cleanPhoneValue(value).replace(/^\+/, "");
}

function getCompanySettings(overrides = {}) {
  const settings = {
    ...DEFAULT_COMPANY_SETTINGS,
    ...environmentCompanySettings(),
    ...overrides,
  };

  return {
    ...settings,
    phoneInternational: cleanPhoneValue(settings.phoneInternational) || DEFAULT_COMPANY_SETTINGS.phoneInternational,
    whatsappNumber: cleanPhoneValue(settings.whatsappNumber || settings.phoneInternational) || DEFAULT_COMPANY_SETTINGS.whatsappNumber,
    primaryEmail: cleanText(settings.primaryEmail) || DEFAULT_COMPANY_SETTINGS.primaryEmail,
    websiteUrl: cleanText(settings.websiteUrl).replace(/\/$/, "") || DEFAULT_COMPANY_SETTINGS.websiteUrl,
    paymentTermDays: Number.isInteger(Number(settings.paymentTermDays)) && Number(settings.paymentTermDays) > 0
      ? Number(settings.paymentTermDays)
      : DEFAULT_COMPANY_SETTINGS.paymentTermDays,
  };
}

function environmentCompanySettings() {
  if (typeof process === "undefined" || !process.env) return {};
  const configured = {
    legalName: cleanText(process.env.COMPANY_LEGAL_NAME),
    tradeName: cleanText(process.env.COMPANY_TRADE_NAME),
    addressLine1: cleanText(process.env.COMPANY_ADDRESS_LINE_1),
    addressLine2: cleanText(process.env.COMPANY_ADDRESS_LINE_2),
    kvkNumber: cleanText(process.env.COMPANY_KVK_NUMBER),
    vatNumber: cleanText(process.env.COMPANY_VAT_NUMBER),
    iban: cleanText(process.env.COMPANY_IBAN).replace(/\s+/g, " ").toUpperCase(),
    ibanAccountName: cleanText(process.env.COMPANY_IBAN_ACCOUNT_NAME),
    paymentTermDays: Number(process.env.COMPANY_PAYMENT_TERM_DAYS || 0) || undefined,
    logoUrl: cleanText(process.env.COMPANY_LOGO_URL),
  };
  return Object.fromEntries(Object.entries(configured).filter(([, value]) => value !== "" && value !== undefined));
}

function getTelephoneLink(settings = getCompanySettings()) {
  return `tel:${settings.phoneInternational}`;
}

function getWhatsappLink(settings = getCompanySettings(), message = "") {
  const baseUrl = `https://wa.me/${phoneToWaNumber(settings.whatsappNumber || settings.phoneInternational)}`;
  return message ? `${baseUrl}?text=${encodeURIComponent(message)}` : baseUrl;
}

function getMailtoLink(settings = getCompanySettings(), subject = "") {
  const baseUrl = `mailto:${settings.primaryEmail}`;
  return subject ? `${baseUrl}?subject=${encodeURIComponent(subject)}` : baseUrl;
}

function getCompanyDisplayValues(settings = getCompanySettings()) {
  return {
    companyName: settings.companyName,
    phoneDisplay: settings.phoneDisplay,
    phoneInternational: settings.phoneInternational,
    whatsappDisplay: settings.phoneDisplay,
    primaryEmail: settings.primaryEmail,
    websiteUrl: settings.websiteUrl,
  };
}

module.exports = {
  DEFAULT_COMPANY_SETTINGS,
  getCompanySettings,
  getTelephoneLink,
  getWhatsappLink,
  getMailtoLink,
  getCompanyDisplayValues,
};
