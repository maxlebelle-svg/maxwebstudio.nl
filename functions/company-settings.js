const DEFAULT_COMPANY_SETTINGS = Object.freeze({
  companyName: "Max Webstudio",
  phoneDisplay: "085 130 5282",
  phoneInternational: "+31851305282",
  whatsappNumber: "+31851305282",
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

module.exports.handler = async (event = {}) => {
  const method = String(event.httpMethod || "GET").toUpperCase();
  if (method === "OPTIONS") return companySettingsResponse(204, null);
  if (method !== "GET") {
    return companySettingsResponse(405, {
      success: false,
      error: "Methode niet toegestaan.",
    });
  }

  return companySettingsResponse(200, {
    success: true,
    settings: getCompanySettings(),
  });
};

function companySettingsResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}
