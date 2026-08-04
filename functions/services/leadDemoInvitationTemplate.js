const DEFAULT_SUPPORT_EMAIL = "info@maxwebstudio.nl";

function buildLeadDemoInvitationMail(input = {}) {
  const contactName = displayName(input.contactName) || "daar";
  const firstName = contactName.split(/\s+/)[0];
  const companyName = displayName(input.companyName) || "je bedrijf";
  const activationUrl = safeHttpsUrl(input.activationUrl);
  const previewUrl = safeHttpsUrl(input.previewUrl);
  const supportEmail = validEmail(input.supportEmail) ? clean(input.supportEmail).toLowerCase() : DEFAULT_SUPPORT_EMAIL;
  if (!activationUrl) throw invalid("activation_url_invalid");
  if (!previewUrl) throw invalid("preview_url_invalid");

  const subject = `${firstName}, je website-demo voor ${companyName} staat klaar`;
  const preheader = "Bekijk je persoonlijke website-demo in een beveiligde omgeving.";
  const text = [
    `Hoi ${contactName},`,
    "",
    `De website-demo voor ${companyName} staat voor je klaar.`,
    "Via de beveiligde persoonlijke omgeving kun je de demo bekijken, feedback geven en het ontwerp goedkeuren.",
    "Dit is vrijblijvend: je zit nog nergens aan vast.",
    "",
    `Account activeren en demo bekijken: ${activationUrl}`,
    "De activatielink is tijdelijk geldig. Deel hem niet met anderen en kies zelf een wachtwoord; wij mailen nooit een wachtwoord.",
    `Hulp nodig? Mail ${supportEmail}.`,
    "",
    "Groet,",
    "Max Webstudio",
  ].join("\n");

  const html = `<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escape(subject)}</title></head>
<body style="margin:0;background:#07121f;font-family:Inter,Arial,sans-serif;color:#102033;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07121f;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:18px;overflow:hidden;">
      <tr><td style="padding:28px 30px;background:#0f2742;color:#fff;"><img src="https://maxwebstudio.nl/assets/email/maxwebstudio-logo-mark-light-v1.png" width="46" height="46" alt="Max Webstudio"><h1 style="margin:18px 0 0;font-size:28px;line-height:1.2;">Je website-demo staat klaar</h1></td></tr>
      <tr><td style="padding:30px;"><p style="margin:0 0 16px;font-size:16px;line-height:1.65;">Hoi ${escape(contactName)},</p><p style="margin:0 0 16px;font-size:16px;line-height:1.65;">De website-demo voor <strong>${escape(companyName)}</strong> staat klaar in je beveiligde persoonlijke omgeving.</p><p style="margin:0 0 24px;font-size:16px;line-height:1.65;">Je kunt de demo bekijken, feedback geven of goedkeuren. Dit is vrijblijvend: je zit nog nergens aan vast.</p><a class="mws-cta" href="${escape(activationUrl)}" style="display:inline-block;background:#28d39a;color:#07121f;text-decoration:none;font-weight:900;padding:14px 20px;border-radius:10px;">Bekijk je website-demo</a><p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#5b6b7c;">Deze persoonlijke activatielink is tijdelijk geldig. Deel hem niet met anderen. Je kiest zelf een wachtwoord; wij sturen nooit een wachtwoord per e-mail.</p></td></tr>
      <tr><td style="padding:22px 30px;background:#f2f6f8;font-size:13px;line-height:1.6;color:#526170;">Hulp nodig? Mail ${escape(supportEmail)}.<br>Max Webstudio · maxwebstudio.nl</td></tr>
    </table>
  </td></tr></table>
  <style>@media (max-width:620px){table{width:100%!important}td{box-sizing:border-box}.mws-cta{display:block!important;text-align:center!important}}</style>
</body></html>`;

  return { subject, preheader, html, text, activationUrl, previewUrl, supportEmail };
}

function buildPublicDemoShareMail(input = {}) {
  const contactName = displayName(input.contactName) || "daar";
  const companyName = displayName(input.companyName) || "je bedrijf";
  const previewUrl = safeHttpsUrl(input.previewUrl);
  const supportEmail = validEmail(input.supportEmail) ? clean(input.supportEmail).toLowerCase() : DEFAULT_SUPPORT_EMAIL;
  if (!previewUrl) throw invalid("preview_url_invalid");

  const subject = `Website-demo voor ${companyName}`;
  const preheader = `Bekijk de vrijblijvende website-demo voor ${companyName}.`;
  const text = [
    `Hallo ${contactName},`,
    "",
    `Ik heb alvast een demo voor ${companyName} gemaakt.`,
    "",
    "Je kunt de website hier bekijken:",
    previewUrl,
    "",
    "Ik hoor graag wat je ervan vindt.",
    "",
    "Met vriendelijke groet,",
    "Max Webstudio",
  ].join("\n");

  const html = `<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escape(subject)}</title></head>
<body style="margin:0;background:#07121f;font-family:Inter,Arial,sans-serif;color:#102033;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07121f;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:18px;overflow:hidden;">
      <tr><td style="padding:28px 30px;background:#0f2742;color:#fff;"><img src="https://maxwebstudio.nl/assets/email/maxwebstudio-logo-mark-light-v1.png" width="46" height="46" alt="Max Webstudio"><h1 style="margin:18px 0 0;font-size:28px;line-height:1.2;">Je website-demo staat klaar</h1></td></tr>
      <tr><td style="padding:30px;"><p style="margin:0 0 16px;font-size:16px;line-height:1.65;">Hallo ${escape(contactName)},</p><p style="margin:0 0 16px;font-size:16px;line-height:1.65;">Ik heb alvast een demo voor <strong>${escape(companyName)}</strong> gemaakt.</p><p style="margin:0 0 24px;font-size:16px;line-height:1.65;">Je kunt de website rustig bekijken. Ik hoor graag wat je ervan vindt.</p><a class="mws-cta" href="${escape(previewUrl)}" style="display:inline-block;background:#28d39a;color:#07121f;text-decoration:none;font-weight:900;padding:14px 20px;border-radius:10px;">Bekijk de website-demo</a><p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#5b6b7c;">Deze openbare demo vraagt geen account en registreert geen goedkeuring of betaling.</p></td></tr>
      <tr><td style="padding:22px 30px;background:#f2f6f8;font-size:13px;line-height:1.6;color:#526170;">Vragen? Mail ${escape(supportEmail)}.<br>Max Webstudio · maxwebstudio.nl</td></tr>
    </table>
  </td></tr></table>
  <style>@media (max-width:620px){table{width:100%!important}td{box-sizing:border-box}.mws-cta{display:block!important;text-align:center!important}}</style>
</body></html>`;

  return { subject, preheader, html, text, previewUrl, supportEmail };
}

function buildFoodDemoShareMail(input = {}) {
  const contactName = displayName(input.contactName) || "daar";
  const companyName = displayName(input.companyName) || "je restaurant";
  const storefrontUrl = safeHttpsUrl(input.storefrontUrl);
  const restaurantPortalUrl = safeHttpsUrl(input.restaurantPortalUrl);
  const qrCodeUrl = safeHttpsUrl(input.qrCodeUrl);
  const supportEmail = validEmail(input.supportEmail) ? clean(input.supportEmail).toLowerCase() : DEFAULT_SUPPORT_EMAIL;
  if (!storefrontUrl) throw invalid("storefront_url_invalid");
  if (!restaurantPortalUrl) throw invalid("restaurant_portal_url_invalid");
  if (!qrCodeUrl) throw invalid("qr_code_url_invalid");

  const subject = `Restaurant-demo voor ${companyName}`;
  const preheader = `Bekijk de bestelwebsite en het restaurantportaal voor ${companyName}.`;
  const text = [
    `Hallo ${contactName},`,
    "",
    `Ik heb een complete restaurant-demo voor ${companyName} klaargezet.`,
    "",
    "Voorkant voor je klanten:",
    storefrontUrl,
    "",
    "Restaurantportaal voor bestellingen en beheer:",
    restaurantPortalUrl,
    "",
    "De QR-code in deze e-mail opent de voorkant direct op een telefoon.",
    "",
    "Ik hoor graag wat je ervan vindt.",
    "",
    "Met vriendelijke groet,",
    "Max Webstudio",
  ].join("\n");

  const html = `<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escape(subject)}</title></head>
<body style="margin:0;background:#07121f;font-family:Inter,Arial,sans-serif;color:#102033;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07121f;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:18px;overflow:hidden;">
      <tr><td style="padding:28px 30px;background:#0f3b31;color:#fff;"><img src="https://maxwebstudio.nl/assets/email/maxwebstudio-logo-mark-light-v1.png" width="46" height="46" alt="Max Webstudio"><h1 style="margin:18px 0 6px;font-size:28px;line-height:1.2;">Je restaurant-demo staat klaar</h1><p style="margin:0;color:#c7f9e8;font-size:15px;">De bestelwebsite én het restaurantportaal</p></td></tr>
      <tr><td style="padding:30px;"><p style="margin:0 0 16px;font-size:16px;line-height:1.65;">Hallo ${escape(contactName)},</p><p style="margin:0 0 24px;font-size:16px;line-height:1.65;">Ik heb een complete restaurant-demo voor <strong>${escape(companyName)}</strong> klaargezet. Zo zie je zowel wat je klanten gebruiken als hoe je zelf bestellingen beheert.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:18px;background:#f2f8f6;border-radius:12px;"><strong style="display:block;margin-bottom:8px;font-size:17px;">1. Voorkant voor je klanten</strong><p style="margin:0 0 14px;color:#526170;font-size:14px;line-height:1.55;">Bekijk de menukaart en bestelervaring zoals je klanten die zien.</p><a class="mws-cta" href="${escape(storefrontUrl)}" style="display:inline-block;background:#28d39a;color:#07121f;text-decoration:none;font-weight:900;padding:13px 18px;border-radius:10px;">Bekijk de bestelwebsite</a></td></tr></table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;"><tr><td style="padding:18px;background:#f2f6f8;border-radius:12px;"><strong style="display:block;margin-bottom:8px;font-size:17px;">2. Restaurantportaal</strong><p style="margin:0 0 14px;color:#526170;font-size:14px;line-height:1.55;">Open op een computer de beheeromgeving voor bestellingen en restaurantbeheer.</p><a class="mws-cta" href="${escape(restaurantPortalUrl)}" style="display:inline-block;background:#0f2742;color:#fff;text-decoration:none;font-weight:900;padding:13px 18px;border-radius:10px;">Open het restaurantportaal</a></td></tr></table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;"><tr><td width="128" valign="middle"><img src="${escape(qrCodeUrl)}" width="112" height="112" alt="QR-code naar de bestelwebsite" style="display:block;padding:6px;border:1px solid #d9e6e1;border-radius:10px;"></td><td valign="middle" style="padding-left:16px;"><strong style="display:block;margin-bottom:6px;font-size:17px;">Bekijk op je telefoon</strong><p style="margin:0;color:#526170;font-size:14px;line-height:1.55;">Scan deze QR-code met de camera van je telefoon. De bestelwebsite opent direct.</p></td></tr></table>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#5b6b7c;">Dit zijn demonstratielinks. Ze registreren geen goedkeuring of betaling bij Max Webstudio.</p></td></tr>
      <tr><td style="padding:22px 30px;background:#f2f6f8;font-size:13px;line-height:1.6;color:#526170;">Vragen? Mail ${escape(supportEmail)}.<br>Max Webstudio · maxwebstudio.nl</td></tr>
    </table>
  </td></tr></table>
  <style>@media (max-width:620px){table{width:100%!important}td{box-sizing:border-box}.mws-cta{display:block!important;text-align:center!important}}</style>
</body></html>`;

  return { subject, preheader, html, text, storefrontUrl, restaurantPortalUrl, qrCodeUrl, supportEmail };
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value)); }
function displayName(value) {
  const text = clean(value).replace(/\s+/g, " ");
  if (!text || /[A-ZÀ-ÖØ-Þ]/.test(text)) return text;
  return text.replace(/(^|[\s-])([a-zà-öø-ÿ])/g, (_, boundary, letter) => `${boundary}${letter.toUpperCase()}`);
}
function clean(value) { return String(value || "").trim(); }
function escape(value) { return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function invalid(code) { return Object.assign(new Error("Lead demo invitation template is ongeldig."), { code, statusCode: 422 }); }

module.exports = { buildLeadDemoInvitationMail, buildPublicDemoShareMail, buildFoodDemoShareMail, _private: { displayName, safeHttpsUrl, validEmail } };
