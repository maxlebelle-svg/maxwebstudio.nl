import { STORAGE_KEYS } from "../config/storageKeys.js";

export const DEFAULT_COMPANY_SETTINGS = Object.freeze({
  companyName: "Max Webstudio",
  phoneDisplay: "085 130 2326",
  phoneInternational: "+31851302326",
  whatsappNumber: "+31851302326",
  primaryEmail: "info@maxwebstudio.nl",
  websiteUrl: "https://www.maxwebstudio.nl",
  logoMarkUrl: "/max-webstudio-logo-mark.svg",
  logoFullUrl: "/max-webstudio-logo-full.svg",
  socials: Object.freeze({
    instagram: "https://www.instagram.com/maxwebstudio.nl/",
    facebook: "https://www.facebook.com/profile.php?id=61591581955035",
    linkedin: "https://www.linkedin.com/company/130444905/",
    googleBusinessProfile: "",
  }),
  ctas: Object.freeze({
    call: "Bel direct",
    whatsapp: "WhatsApp",
    email: "E-mail",
    quote: "Vraag gratis website-preview aan",
  }),
});

function readStoredSettings() {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEYS.settings) || "{}") || {};
  } catch (error) {
    console.warn("Company settings fallback actief", error);
    return {};
  }
}

function cleanPhoneValue(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function phoneToWaNumber(value) {
  return cleanPhoneValue(value).replace(/^\+/, "");
}

function normalizeWebsiteUrl(value) {
  const url = String(value || "").trim();
  if (!url) return DEFAULT_COMPANY_SETTINGS.websiteUrl;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function getCompanySettings(overrides = {}) {
  const storedSettings = readStoredSettings();
  const storedCompanySettings = storedSettings.companySettings || {};
  const merged = {
    ...DEFAULT_COMPANY_SETTINGS,
    ...storedCompanySettings,
    ...overrides,
    socials: {
      ...DEFAULT_COMPANY_SETTINGS.socials,
      ...(storedCompanySettings.socials || {}),
      ...(overrides.socials || {}),
    },
    ctas: {
      ...DEFAULT_COMPANY_SETTINGS.ctas,
      ...(storedCompanySettings.ctas || {}),
      ...(overrides.ctas || {}),
    },
  };

  return {
    ...merged,
    websiteUrl: normalizeWebsiteUrl(merged.websiteUrl),
    phoneInternational: cleanPhoneValue(merged.phoneInternational) || DEFAULT_COMPANY_SETTINGS.phoneInternational,
    whatsappNumber: cleanPhoneValue(merged.whatsappNumber || merged.phoneInternational) || DEFAULT_COMPANY_SETTINGS.whatsappNumber,
    primaryEmail: String(merged.primaryEmail || DEFAULT_COMPANY_SETTINGS.primaryEmail).trim(),
  };
}

export function getTelephoneLink(settings = getCompanySettings()) {
  return `tel:${settings.phoneInternational}`;
}

export function getWhatsappLink(settings = getCompanySettings(), message = "") {
  const baseUrl = `https://wa.me/${phoneToWaNumber(settings.whatsappNumber || settings.phoneInternational)}`;
  return message ? `${baseUrl}?text=${encodeURIComponent(message)}` : baseUrl;
}

export function getMailtoLink(settings = getCompanySettings(), subject = "") {
  const baseUrl = `mailto:${settings.primaryEmail}`;
  return subject ? `${baseUrl}?subject=${encodeURIComponent(subject)}` : baseUrl;
}

export function getCompanyDisplayValues(settings = getCompanySettings()) {
  return {
    companyName: settings.companyName,
    phoneDisplay: settings.phoneDisplay,
    phoneInternational: settings.phoneInternational,
    whatsappDisplay: settings.phoneDisplay,
    primaryEmail: settings.primaryEmail,
    websiteUrl: settings.websiteUrl,
  };
}
