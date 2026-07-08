const DEFAULT_COMPANY_SETTINGS = Object.freeze({
  companyName: "Max Webstudio",
  phoneDisplay: "085 130 2326",
  phoneInternational: "+31851302326",
  whatsappNumber: "+31851302326",
  primaryEmail: "info@maxwebstudio.nl",
  websiteUrl: "https://www.maxwebstudio.nl",
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
    ...overrides,
  };

  return {
    ...settings,
    phoneInternational: cleanPhoneValue(settings.phoneInternational) || DEFAULT_COMPANY_SETTINGS.phoneInternational,
    whatsappNumber: cleanPhoneValue(settings.whatsappNumber || settings.phoneInternational) || DEFAULT_COMPANY_SETTINGS.whatsappNumber,
    primaryEmail: cleanText(settings.primaryEmail) || DEFAULT_COMPANY_SETTINGS.primaryEmail,
    websiteUrl: cleanText(settings.websiteUrl).replace(/\/$/, "") || DEFAULT_COMPANY_SETTINGS.websiteUrl,
  };
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
