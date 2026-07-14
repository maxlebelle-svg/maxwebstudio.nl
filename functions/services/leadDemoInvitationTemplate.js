const DEFAULT_SUPPORT_EMAIL = "info@maxwebstudio.nl";

function buildLeadDemoInvitationMail(input = {}) {
  const contactName = clean(input.contactName) || "daar";
  const companyName = clean(input.companyName) || "uw bedrijf";
  const activationUrl = safeHttpsUrl(input.activationUrl);
  const previewUrl = safeHttpsUrl(input.previewUrl);
  const supportEmail = validEmail(input.supportEmail) ? clean(input.supportEmail).toLowerCase() : DEFAULT_SUPPORT_EMAIL;
  if (!activationUrl) throw invalid("activation_url_invalid");
  if (!previewUrl) throw invalid("preview_url_invalid");

  const subject = `Je website-demo voor ${companyName} staat klaar`;
  const preheader = "Bekijk je persoonlijke website-demo in een beveiligde omgeving.";
  const text = [
    `Hoi ${contactName},`,
    "",
    `De website-demo voor ${companyName} staat voor je klaar.`,
    "Via de beveiligde persoonlijke omgeving kun je de demo bekijken, feedback geven en het ontwerp goedkeuren.",
    "Dit is vrijblijvend: je zit nog nergens aan vast.",
    "",
    `Account activeren en demo bekijken: ${activationUrl}`,
    `Preview: ${previewUrl}`,
    "",
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
      <tr><td style="padding:28px 30px;background:#0f2742;color:#fff;"><img src="https://maxwebstudio.nl/max-webstudio-logo-mark.svg" width="46" height="46" alt="Max Webstudio"><h1 style="margin:18px 0 0;font-size:28px;line-height:1.2;">Je website-demo staat klaar</h1></td></tr>
      <tr><td style="padding:30px;"><p style="margin:0 0 16px;font-size:16px;line-height:1.65;">Hoi ${escape(contactName)},</p><p style="margin:0 0 16px;font-size:16px;line-height:1.65;">De website-demo voor <strong>${escape(companyName)}</strong> staat klaar in je beveiligde persoonlijke omgeving.</p><p style="margin:0 0 24px;font-size:16px;line-height:1.65;">Je kunt de demo bekijken, feedback geven of goedkeuren. Dit is vrijblijvend: je zit nog nergens aan vast.</p><a class="mws-cta" href="${escape(activationUrl)}" style="display:inline-block;background:#28d39a;color:#07121f;text-decoration:none;font-weight:900;padding:14px 20px;border-radius:10px;">Bekijk je website-demo</a><p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:#5b6b7c;">Deze persoonlijke activatielink is tijdelijk geldig. Deel hem niet met anderen. Je kiest zelf een wachtwoord; wij sturen nooit een wachtwoord per e-mail.</p><p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#5b6b7c;">Werkt de knop niet? Open de beveiligde link:<br><a href="${escape(activationUrl)}" style="color:#0f6f92;word-break:break-all;">${escape(activationUrl)}</a></p></td></tr>
      <tr><td style="padding:22px 30px;background:#f2f6f8;font-size:13px;line-height:1.6;color:#526170;">Hulp nodig? <a href="mailto:${escape(supportEmail)}" style="color:#0f6f92;">${escape(supportEmail)}</a><br>Max Webstudio · <a href="https://maxwebstudio.nl" style="color:#0f6f92;">maxwebstudio.nl</a></td></tr>
    </table>
  </td></tr></table>
  <style>@media (max-width:620px){table{width:100%!important}td{box-sizing:border-box}.mws-cta{display:block!important;text-align:center!important}}</style>
</body></html>`;

  return { subject, preheader, html, text, activationUrl, previewUrl, supportEmail };
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
function clean(value) { return String(value || "").trim(); }
function escape(value) { return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function invalid(code) { return Object.assign(new Error("Lead demo invitation template is ongeldig."), { code, statusCode: 422 }); }

module.exports = { buildLeadDemoInvitationMail, _private: { safeHttpsUrl, validEmail } };
