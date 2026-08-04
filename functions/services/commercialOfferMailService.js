const DEFAULT_SUPPORT_EMAIL = "info@maxwebstudio.nl";
const SITE_URL = "https://maxwebstudio.nl";
const LOGO_URL = `${SITE_URL}/assets/maxwebstudio-logo-mark.png`;
const EMAIL_BACKGROUNDS = Object.freeze({
  outer: `${SITE_URL}/assets/email/mws-email-bg-outer.png`,
  card: `${SITE_URL}/assets/email/mws-email-bg-card.png`,
  header: `${SITE_URL}/assets/email/mws-email-bg-header.png`,
  panel: `${SITE_URL}/assets/email/mws-email-bg-panel.png`,
});
const { normalizeValidityDate, isExpired, formatValidityDate } = require("./commercialOfferValidityService");

function buildCommercialOfferMail(input = {}) {
  const relationship = input.relationship || {};
  const demo = input.demo || {};
  const snapshot = input.snapshot || {};
  const test = input.mode === "test";
  const preview = input.mode === "preview";
  const staging = input.staging === true;
  const recipientName = clean(relationship.contactName).split(/\s+/)[0] || "ondernemer";
  const companyName = clean(relationship.companyName) || "jouw organisatie";
  const desktopUrl = safeHttpsUrl(demo.desktopUrl);
  const mobileUrl = safeHttpsUrl(demo.mobileUrl || demo.desktopUrl);
  const storefrontUrl = safeHttpsUrl(demo.storefrontUrl);
  const restaurantPortalUrl = safeHttpsUrl(demo.restaurantPortalUrl);
  const foodDemo = Boolean(storefrontUrl || restaurantPortalUrl || clean(demo.type).toLowerCase() === "food");
  const qrCodeUrl = safeHttpsUrl(demo.qrCodeUrl);
  const interestUrl = safeHttpsUrl(input.interestUrl);
  const signingUrl = safeHttpsUrl(input.signingUrl);
  const definitiveOffer = clean(snapshot.offerPurpose) === "definitive_offer";
  const actionUrl = definitiveOffer ? signingUrl : interestUrl;
  const supportEmail = validEmail(input.supportEmail) ? clean(input.supportEmail).toLowerCase() : DEFAULT_SUPPORT_EMAIL;
  const validUntil = normalizeValidityDate(snapshot.validUntil);
  if (!desktopUrl || !mobileUrl || !qrCodeUrl) throw invalid("DEMO_MAIL_INCOMPLETE", "De demo mist een veilige desktop-, mobiele of QR-link.");
  if (foodDemo && (!storefrontUrl || !restaurantPortalUrl)) throw invalid("FOOD_DEMO_MAIL_INCOMPLETE", "De restaurant-demo mist de bestelpagina of het restaurantportaal.");
  if (!Array.isArray(snapshot.lines) || !snapshot.lines.length || snapshot.hasNonBindingLines) throw invalid("OFFER_MAIL_INCOMPLETE", "De aanbodversie bevat geen volledig bindende productregels.");
  if (!validUntil) throw invalid("OFFER_VALIDITY_REQUIRED", "De aanbodversie mist een geldige, server-side bepaalde geldigheidsdatum.");
  if (isExpired(validUntil)) throw invalid("OFFER_EXPIRED", "De aanbodversie is verlopen en kan niet worden verzonden.");
  if (!test && !preview && !actionUrl) throw invalid(definitiveOffer ? "SIGNING_LINK_REQUIRED" : "INTEREST_LINK_REQUIRED", definitiveOffer ? "De veilige ondertekenlink ontbreekt." : "De veilige interesselink ontbreekt.");

  const prefix = staging ? "[STAGING TEST] " : test ? "[TEST] " : "";
  const subject = `${prefix}${definitiveOffer ? `Definitieve offerte voor ${companyName}` : "Jouw demo en voorstel van Max Webstudio"}`;
  const lineRows = snapshot.lines.map((line) => `<tr><td style="padding:11px 0;border-bottom:1px solid #29445a;color:#c9d7e8;font-size:14px;">${escape(line.productName)}${line.componentType === "recurring" ? " · per maand" : " · eenmalig"}</td><td align="right" style="padding:11px 0;border-bottom:1px solid #29445a;color:#ffffff;font-size:14px;font-weight:900;">${escape(money(line.subtotalExVatCents))}</td></tr>`).join("");
  const textLines = snapshot.lines.map((line) => `- ${line.productName}: ${money(line.subtotalExVatCents)} excl. btw${line.componentType === "recurring" ? " per maand" : " eenmalig"}`);
  const discountPercentage = Number(snapshot.discountPercentage || 0);
  const discountHtmlRows = discountPercentage > 0 ? `<tr><td style="padding:15px 15px 0;color:#91a6bc;">Eenmalig vóór korting</td><td align="right" style="padding:15px 15px 0;color:#ffffff;font-weight:900;">${escape(money(snapshot.oneTimeBeforeDiscountExVatCents))}</td></tr><tr><td style="padding:8px 15px 0;color:#28d39a;">Korting (${discountPercentage}%)</td><td align="right" style="padding:8px 15px 0;color:#28d39a;font-weight:900;">− ${escape(money(snapshot.discountExVatCents))}</td></tr>` : "";
  const discountTextLines = discountPercentage > 0 ? [`Eenmalig vóór korting: ${money(snapshot.oneTimeBeforeDiscountExVatCents)}`, `Korting (${discountPercentage}%): -${money(snapshot.discountExVatCents)}`] : [];
  const disclaimer = definitiveOffer
    ? "Controleer de offerte en voorwaarden zorgvuldig. Alleen ondertekening via Signhost maakt deze zakelijke offerte definitief; betaling, facturatie en abonnementen starten niet automatisch."
    : "Met deze bevestiging geeft u aan dat u verder wilt praten over dit voorstel. Dit is nog geen digitale ondertekening of betalingsopdracht.";
  const banner = staging ? "STAGINGTEST — niet naar een echte klant verzenden" : test ? "TESTMAIL — niet naar de klant verzonden" : "";
  const customerAction = test || preview
    ? `<div class="mws-panel" style="margin-top:22px;padding:14px;border:1px dashed #47718f;border-radius:14px;background-color:#102a3d;background-image:url('${EMAIL_BACKGROUNDS.panel}');background-repeat:repeat;color:#91a6bc;text-align:center;font-weight:800;">${test ? "TEST" : "VOORBEELD"}: de ${definitiveOffer ? "Signhost-ondertekenknop" : "interesseknop"} wordt pas in de definitieve klantmail geactiveerd</div>`
    : `<a class="mws-cta mws-primary-link" href="${escape(actionUrl)}" style="display:block;margin-top:22px;padding:15px 18px;border-radius:12px;background-color:#24d3ee;background-image:linear-gradient(#24d3ee,#24d3ee);color:#03111f;-webkit-text-fill-color:#03111f;text-decoration:none;text-align:center;font-weight:900;">${definitiveOffer ? "Bekijk offerte en onderteken" : "Ja, ik wil verder met deze demo"}</a>`;
  const primarySigningAction = definitiveOffer
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td class="mws-sign-panel" bgcolor="#08283b" background="${EMAIL_BACKGROUNDS.panel}" style="padding:18px;border:1px solid #17627b;border-radius:16px;background-color:#08283b;background-image:url('${EMAIL_BACKGROUNDS.panel}');background-repeat:repeat;"><div style="margin:0 0 5px;color:#24d3ee;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;">Volgende stap</div><div style="color:#ffffff;font-size:16px;line-height:1.55;font-weight:800;">Controleer de offerte en start de beveiligde ondertekening via Signhost.</div>${customerAction}</td></tr></table>`
    : "";
  const bannerRow = banner ? `<tr><td class="mws-test" bgcolor="#061523" background="${EMAIL_BACKGROUNDS.header}" style="padding:14px 28px;background-color:#061523;background-image:url('${EMAIL_BACKGROUNDS.header}');background-repeat:repeat;border-top:4px solid #fbbf24;color:#ffe29a;-webkit-text-fill-color:#ffe29a;font-weight:900;text-align:center;letter-spacing:.03em;">${escape(banner)}</td></tr>` : "";
  const demoIntro = foodDemo
    ? "Bekijk de bestelervaring voor je klanten en open daarnaast het restaurantportaal voor bestellingen en beheer."
    : "Bekijk de demo op je computer of open de mobiele versie op je telefoon.";
  const demoLinks = foodDemo
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="mws-demo-primary" bgcolor="#155eef" style="border-radius:12px;background-color:#155eef;background-image:linear-gradient(#155eef,#155eef);"><a class="mws-cta mws-demo-primary-link" href="${escape(storefrontUrl)}" style="display:block;padding:14px 16px;border-radius:12px;background-color:#155eef;background-image:linear-gradient(#155eef,#155eef);color:#ffffff;-webkit-text-fill-color:#ffffff;text-decoration:none;text-align:center;font-weight:900;">Bekijk de bestelpagina</a></td></tr><tr><td height="10" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr><tr><td class="mws-secondary" bgcolor="#0a3148" style="border:1px solid #17627b;border-radius:12px;background-color:#0a3148;background-image:linear-gradient(#0a3148,#0a3148);"><a class="mws-cta mws-secondary-link" href="${escape(restaurantPortalUrl)}" style="display:block;padding:14px 16px;border-radius:12px;background-color:#0a3148;background-image:linear-gradient(#0a3148,#0a3148);color:#a5f3fc;-webkit-text-fill-color:#a5f3fc;text-decoration:none;text-align:center;font-weight:900;">Open het restaurantportaal</a></td></tr></table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="mws-demo-primary" bgcolor="#155eef" style="border-radius:12px;background-color:#155eef;background-image:linear-gradient(#155eef,#155eef);"><a class="mws-cta mws-demo-primary-link" href="${escape(desktopUrl)}" style="display:block;padding:14px 16px;border-radius:12px;background-color:#155eef;background-image:linear-gradient(#155eef,#155eef);color:#ffffff;-webkit-text-fill-color:#ffffff;text-decoration:none;text-align:center;font-weight:900;">Demo op computer bekijken</a></td></tr><tr><td height="10" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr><tr><td class="mws-secondary" bgcolor="#0a3148" style="border:1px solid #17627b;border-radius:12px;background-color:#0a3148;background-image:linear-gradient(#0a3148,#0a3148);"><a class="mws-cta mws-secondary-link" href="${escape(mobileUrl)}" style="display:block;padding:14px 16px;border-radius:12px;background-color:#0a3148;background-image:linear-gradient(#0a3148,#0a3148);color:#a5f3fc;-webkit-text-fill-color:#a5f3fc;text-decoration:none;text-align:center;font-weight:900;">Mobiele demo openen</a></td></tr></table>`;

  // Outlook Mobile recolors the brand palette when flat colors are encoded as gradients.
  // Keep the redundant bgcolor + background combination that rendered correctly before.
  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escape(subject)}</title><style>
@media(max-width:620px){.mws-shell{padding:14px 8px!important}.mws-card{width:100%!important;border-radius:18px!important}.mws-pad{padding-left:20px!important;padding-right:20px!important}.mws-title{font-size:29px!important}.mws-demo-grid td{display:block!important;width:100%!important;box-sizing:border-box}.mws-qr{text-align:center!important;padding-top:18px!important}.mws-cta{display:block!important;text-align:center!important}}
</style></head>
<body class="mws-body" bgcolor="#030b14" style="margin:0;background-color:#030b14;background-image:url('${EMAIL_BACKGROUNDS.outer}');background-repeat:repeat;color:#ffffff;font-family:Inter,Arial,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Je persoonlijke demo en voorstel van Max Webstudio staan klaar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mws-shell" bgcolor="#030b14" background="${EMAIL_BACKGROUNDS.outer}" style="background-color:#030b14;background-image:url('${EMAIL_BACKGROUNDS.outer}');background-repeat:repeat;padding:30px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mws-card" bgcolor="#071b2c" background="${EMAIL_BACKGROUNDS.card}" style="max-width:680px;background-color:#071b2c;background-image:url('${EMAIL_BACKGROUNDS.card}');background-repeat:repeat;border:1px solid #163d58;border-top:4px solid #24d3ee;border-radius:20px;overflow:hidden;">
${bannerRow}<tr><td class="mws-pad mws-header" bgcolor="#061523" background="${EMAIL_BACKGROUNDS.header}" style="padding:27px 30px 20px;background-color:#061523;background-image:url('${EMAIL_BACKGROUNDS.header}');background-repeat:repeat;border-bottom:1px solid #163d58;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="52" bgcolor="#030b14" background="${EMAIL_BACKGROUNDS.outer}" style="width:52px;height:52px;border-radius:12px;background-color:#030b14;background-image:url('${EMAIL_BACKGROUNDS.outer}');background-repeat:repeat;text-align:center;"><img src="${LOGO_URL}" width="46" height="46" alt="Max Webstudio" style="display:block;margin:3px auto;border:0;width:46px;height:46px;"></td><td style="padding-left:14px;"><div style="font-size:20px;color:#ffffff;font-weight:900;">Max Webstudio</div><div style="margin-top:3px;font-size:10px;color:#24d3ee;font-weight:900;letter-spacing:.18em;text-transform:uppercase;">BUILD BETTER ONLINE</div></td><td align="right" style="color:#8eefff;font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;">${definitiveOffer ? "Definitieve offerte" : "Persoonlijk voorstel"}</td></tr></table></td></tr>
<tr><td class="mws-pad" style="padding:8px 30px 22px;"><h1 class="mws-title" style="margin:0;color:#ffffff;font-size:34px;line-height:1.12;font-weight:900;">${definitiveOffer ? "Je definitieve offerte staat klaar" : "Je demo en persoonlijke voorstel staan klaar"}</h1><p style="margin:12px 0 0;color:#91a6bc;font-size:16px;">Voor ${escape(companyName)}</p></td></tr>
<tr><td class="mws-pad" style="padding:4px 30px 30px;"><p style="margin:0 0 14px;color:#d7e6f3;font-size:16px;line-height:1.7;">Hoi ${escape(recipientName)},</p><p style="margin:0 0 22px;color:#d7e6f3;font-size:16px;line-height:1.7;">${escape(demoIntro)}</p>${primarySigningAction}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mws-demo-grid mws-panel" bgcolor="#102a3d" background="${EMAIL_BACKGROUNDS.panel}" style="background-color:#102a3d;background-image:url('${EMAIL_BACKGROUNDS.panel}');background-repeat:repeat;border-radius:16px;"><tr><td style="padding:18px;">${demoLinks}</td><td width="150" class="mws-qr" style="padding:18px 18px 18px 0;text-align:right;"><img src="${escape(qrCodeUrl)}" width="120" height="120" alt="QR-code naar de mobiele demo" style="display:inline-block;background:#ffffff;padding:7px;border-radius:14px;width:120px;height:120px;"></td></tr></table>
<h2 style="margin:28px 0 8px;color:#ffffff;font-size:21px;">Jouw voorstel</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lineRows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mws-panel" bgcolor="#102a3d" background="${EMAIL_BACKGROUNDS.panel}" style="margin-top:18px;background-color:#102a3d;background-image:url('${EMAIL_BACKGROUNDS.panel}');background-repeat:repeat;border-radius:14px;">${discountHtmlRows}<tr><td style="padding:15px;color:#91a6bc;">Eenmalig${discountPercentage > 0 ? " na korting" : ""} excl. btw</td><td align="right" style="padding:15px;color:#ffffff;font-weight:900;">${escape(money(snapshot.oneTimeExVatCents))}</td></tr><tr><td style="padding:0 15px 15px;color:#91a6bc;">Per maand excl. btw</td><td align="right" style="padding:0 15px 15px;color:#ffffff;font-weight:900;">${escape(money(snapshot.recurringExVatCents))}</td></tr><tr><td style="padding:0 15px 15px;color:#91a6bc;">Vaste aanbetaling excl. btw</td><td align="right" style="padding:0 15px 15px;color:#ffffff;font-weight:900;">${escape(money(Math.min(Number(snapshot.fixedDepositExVatCents || 0), Number(snapshot.oneTimeExVatCents || 0))))}</td></tr></table>
<p style="margin:18px 0 0;color:#7dd3fc;font-size:14px;font-weight:800;">Geldig tot en met ${escape(formatValidityDate(validUntil))}</p>${customerAction}<p style="margin:16px 0 0;color:#91a6bc;font-size:13px;line-height:1.65;">${escape(disclaimer)}</p></td></tr>
<tr><td class="mws-pad mws-footer" bgcolor="#102a3d" background="${EMAIL_BACKGROUNDS.panel}" style="padding:24px 30px 26px;background-color:#102a3d;background-image:url('${EMAIL_BACKGROUNDS.panel}');background-repeat:repeat;border-top:1px solid #29445a;"><strong style="color:#ffffff;font-size:16px;">Max Webstudio</strong><p style="margin:7px 0 14px;color:#91a6bc;font-size:13px;line-height:1.6;">Professionele websites voor ondernemers die snel vertrouwen en aanvragen willen.</p><a href="mailto:${supportEmail}" style="color:#7dd3fc;text-decoration:underline;">${supportEmail}</a><span style="color:#587088;"> · </span><a href="https://wa.me/31851305282" style="color:#7dd3fc;text-decoration:underline;">WhatsApp</a><span style="color:#587088;"> · </span><a href="${SITE_URL}" style="color:#7dd3fc;text-decoration:underline;">maxwebstudio.nl</a></td></tr>
</table></td></tr></table></body></html>`
    .replace(/background-image:linear-gradient\([^)]*\)(?:!important)?;?/g, "")
    .replace(/background-color:/g, "background:");

  const demoTextLinks = foodDemo
    ? [`Bestelpagina voor klanten: ${storefrontUrl}`, `Restaurantportaal voor beheer: ${restaurantPortalUrl}`]
    : [`Demo op computer: ${desktopUrl}`, `Mobiele demo: ${mobileUrl}`];
  const actionText = definitiveOffer ? "Bekijk offerte en onderteken" : "Ja, ik wil verder met deze demo";
  const text = [banner, `Hoi ${recipientName},`, "", definitiveOffer ? `Je definitieve offerte voor ${companyName} staat klaar.` : `Je demo en persoonlijke voorstel voor ${companyName} staan klaar.`, "", ...demoTextLinks, "", "Jouw voorstel:", ...textLines, "", ...discountTextLines, `Eenmalig${discountPercentage > 0 ? " na korting" : ""} excl. btw: ${money(snapshot.oneTimeExVatCents)}`, `Per maand excl. btw: ${money(snapshot.recurringExVatCents)}`, `Vaste aanbetaling excl. btw: ${money(Math.min(Number(snapshot.fixedDepositExVatCents || 0), Number(snapshot.oneTimeExVatCents || 0)))}`, `Geldig tot en met: ${formatValidityDate(validUntil)}`, "", test ? `TEST: de ${definitiveOffer ? "ondertekenknop" : "interesseknop"} is niet actief.` : preview ? `VOORBEELD: de ${definitiveOffer ? "ondertekenknop" : "interesseknop"} is nog niet actief.` : `${actionText}: ${actionUrl}`, "", disclaimer, "", `Vragen? ${supportEmail}`].filter((line, index, rows) => !(line === "" && rows[index - 1] === "")).join("\n");
  return { subject, html, text, desktopUrl, mobileUrl, storefrontUrl, restaurantPortalUrl, qrCodeUrl, interestUrl, signingUrl, actionUrl, offerPurpose: definitiveOffer ? "definitive_offer" : "personal_proposal", disclaimer, validUntil, test, preview, staging };
}

function money(value) { const cents = Number(value); return Number.isInteger(cents) && cents >= 0 ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100) : "—"; }
function safeHttpsUrl(value) { try { const url = new URL(clean(value)); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : ""; } catch { return ""; } }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value)); }
function clean(value) { return String(value || "").trim(); }
function escape(value) { return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function invalid(code, message) { return Object.assign(new Error(message), { code, statusCode: 409 }); }

module.exports = { buildCommercialOfferMail, _private: { money, safeHttpsUrl, validEmail, normalizeValidityDate, isExpired, formatValidityDate } };
