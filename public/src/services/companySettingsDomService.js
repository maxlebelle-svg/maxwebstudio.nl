import {
  getCompanyDisplayValues,
  getCompanySettings,
  getMailtoLink,
  getTelephoneLink,
  getWhatsappLink,
} from "./companySettingsService.js";

export function applyCompanySettings(root = document) {
  const settings = getCompanySettings();
  const display = getCompanyDisplayValues(settings);
  const links = {
    telephone: getTelephoneLink(settings),
    whatsapp: getWhatsappLink(settings),
    mailto: getMailtoLink(settings),
    website: settings.websiteUrl,
  };

  root.querySelectorAll("[data-company-text]").forEach((element) => {
    const key = element.dataset.companyText;
    if (display[key] || settings[key]) {
      element.textContent = display[key] || settings[key];
    }
  });

  root.querySelectorAll("[data-company-href]").forEach((element) => {
    const key = element.dataset.companyHref;
    if (links[key]) {
      element.href = links[key];
    }
  });

  root.querySelectorAll("[data-company-social]").forEach((element) => {
    const key = element.dataset.companySocial;
    if (settings.socials?.[key]) {
      element.href = settings.socials[key];
    }
  });

  root.querySelectorAll("[data-company-aria-label]").forEach((element) => {
    const key = element.dataset.companyAriaLabel;
    const label = display[key] || settings[key];
    if (label) {
      element.setAttribute("aria-label", label);
    }
  });

  const structuredData = root.querySelector("[data-company-json-ld]");
  if (structuredData) {
    try {
      const payload = JSON.parse(structuredData.textContent || "{}");
      structuredData.textContent = JSON.stringify({
        ...payload,
        name: settings.companyName,
        url: settings.websiteUrl,
        email: settings.primaryEmail,
        telephone: settings.phoneDisplay,
        sameAs: Object.values(settings.socials || {}).filter(Boolean),
      });
    } catch (error) {
      console.warn("Company structured data fallback actief", error);
    }
  }
}

if (typeof document !== "undefined") {
  applyCompanySettings(document);
}
