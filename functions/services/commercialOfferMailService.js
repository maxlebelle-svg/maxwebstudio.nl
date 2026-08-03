const DEFAULT_SUPPORT_EMAIL = "info@maxwebstudio.nl";
const SITE_URL = "https://maxwebstudio.nl";
const LOGO_URL = `${SITE_URL}/assets/maxwebstudio-logo-mark.png`;
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
    ? `<div style="margin-top:22px;padding:14px;border:1px dashed #47718f;border-radius:14px;color:#91a6bc;text-align:center;font-weight:800;">${test ? "TEST" : "VOORBEELD"}: de ${definitiveOffer ? "Signhost-ondertekenknop" : "interesseknop"} wordt pas in de definitieve klantmail geactiveerd</div>`
    : `<a class="mws-cta" href="${escape(actionUrl)}" style="display:block;margin-top:22px;padding:15px 18px;border-radius:14px;background:#28d39a;color:#06121f;text-decoration:none;text-align:center;font-weight:900;">${definitiveOffer ? "Bekijk offerte en onderteken" : "Ja, ik wil verder met deze demo"}</a>`;
  const bannerRow = banner ? `<tr><td style="padding:14px 28px;background:#4b3a08;color:#ffe29a;font-weight:900;text-align:center;letter-spacing:.03em;">${escape(banner)}</td></tr>` : "";
  const demoIntro = foodDemo
    ? "Bekijk de bestelervaring voor je klanten en open daarnaast het restaurantportaal voor bestellingen en beheer."
    : "Bekijk de demo op je computer of open de mobiele versie op je telefoon.";
  const demoLinks = foodDemo
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#2563eb" style="border-radius:13px;background:#2563eb;"><a class="mws-cta" href="${escape(storefrontUrl)}" style="display:block;padding:14px 16px;border-radius:13px;background:#2563eb;color:#ffffff;text-decoration:none;text-align:center;font-weight:900;">Bekijk de bestelpagina</a></td></tr><tr><td height="10" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr><tr><td bgcolor="#173a53" style="border-radius:13px;background:#173a53;"><a class="mws-cta" href="${escape(restaurantPortalUrl)}" style="display:block;padding:14px 16px;border-radius:13px;background:#173a53;color:#bfe9ff;text-decoration:none;text-align:center;font-weight:900;">Open het restaurantportaal</a></td></tr></table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#2563eb" style="border-radius:13px;background:#2563eb;"><a class="mws-cta" href="${escape(desktopUrl)}" style="display:block;padding:14px 16px;border-radius:13px;background:#2563eb;color:#ffffff;text-decoration:none;text-align:center;font-weight:900;">Demo op computer bekijken</a></td></tr><tr><td height="10" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr><tr><td bgcolor="#173a53" style="border-radius:13px;background:#173a53;"><a class="mws-cta" href="${escape(mobileUrl)}" style="display:block;padding:14px 16px;border-radius:13px;background:#173a53;color:#bfe9ff;text-decoration:none;text-align:center;font-weight:900;">Mobiele demo openen</a></td></tr></table>`;

  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${escape(subject)}</title><style>
@media(max-width:620px){.mws-shell{padding:14px 8px!important}.mws-card{width:100%!important;border-radius:18px!important}.mws-pad{padding-left:20px!important;padding-right:20px!important}.mws-title{font-size:29px!important}.mws-demo-grid td{display:block!important;width:100%!important;box-sizing:border-box}.mws-qr{text-align:center!important;padding-top:18px!important}.mws-cta{display:block!important;text-align:center!important}}
</style></head>
<body bgcolor="#061626" style="margin:0;background:#061626;color:#ffffff;font-family:Inter,Arial,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Je persoonlijke demo en voorstel van Max Webstudio staan klaar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mws-shell" bgcolor="#061626" style="background:#061626;padding:30px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mws-card" bgcolor="#0d2235" style="max-width:680px;background:#0d2235;border:1px solid #29445a;border-radius:24px;overflow:hidden;">
${bannerRow}<tr><td class="mws-pad" style="padding:30px 30px 14px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#07111f" style="width:48px;height:48px;border-radius:14px;background:#07111f;text-align:center;"><img src="${LOGO_URL}" width="42" height="42" alt="Max Webstudio" style="display:block;margin:3px auto;border:0;width:42px;height:42px;"></td><td style="padding-left:13px;"><div style="font-size:18px;color:#ffffff;font-weight:900;">Max Webstudio</div><div style="font-size:12px;color:#27c7ff;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">${definitiveOffer ? "Definitieve offerte" : "Persoonlijk voorstel"}</div></td></tr></table></td></tr>
<tr><td class="mws-pad" style="padding:8px 30px 22px;"><h1 class="mws-title" style="margin:0;color:#ffffff;font-size:34px;line-height:1.12;font-weight:900;">${definitiveOffer ? "Je definitieve offerte staat klaar" : "Je demo en persoonlijke voorstel staan klaar"}</h1><p style="margin:12px 0 0;color:#91a6bc;font-size:16px;">Voor ${escape(companyName)}</p></td></tr>
<tr><td class="mws-pad" style="padding:4px 30px 30px;"><p style="margin:0 0 14px;color:#c9d7e8;font-size:16px;line-height:1.7;">Hoi ${escape(recipientName)},</p><p style="margin:0 0 22px;color:#c9d7e8;font-size:16px;line-height:1.7;">${escape(demoIntro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mws-demo-grid" bgcolor="#102a3d" style="background:#102a3d;border-radius:16px;"><tr><td style="padding:18px;">${demoLinks}</td><td width="150" class="mws-qr" style="padding:18px 18px 18px 0;text-align:right;"><img src="${escape(qrCodeUrl)}" width="120" height="120" alt="QR-code naar de mobiele demo" style="display:inline-block;background:#ffffff;padding:7px;border-radius:14px;width:120px;height:120px;"></td></tr></table>
<h2 style="margin:28px 0 8px;color:#ffffff;font-size:21px;">Jouw voorstel</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lineRows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#102a3d;border-radius:14px;">${discountHtmlRows}<tr><td style="padding:15px;color:#91a6bc;">Eenmalig${discountPercentage > 0 ? " na korting" : ""} excl. btw</td><td align="right" style="padding:15px;color:#ffffff;font-weight:900;">${escape(money(snapshot.oneTimeExVatCents))}</td></tr><tr><td style="padding:0 15px 15px;color:#91a6bc;">Per maand excl. btw</td><td align="right" style="padding:0 15px 15px;color:#ffffff;font-weight:900;">${escape(money(snapshot.recurringExVatCents))}</td></tr><tr><td style="padding:0 15px 15px;color:#91a6bc;">Vaste aanbetaling excl. btw</td><td align="right" style="padding:0 15px 15px;color:#ffffff;font-weight:900;">${escape(money(Math.min(Number(snapshot.fixedDepositExVatCents || 0), Number(snapshot.oneTimeExVatCents || 0))))}</td></tr></table>
<p style="margin:18px 0 0;color:#7dd3fc;font-size:14px;font-weight:800;">Geldig tot en met ${escape(formatValidityDate(validUntil))}</p>${customerAction}<p style="margin:16px 0 0;color:#91a6bc;font-size:13px;line-height:1.65;">${escape(disclaimer)}</p></td></tr>
<tr><td class="mws-pad" bgcolor="#102a3d" style="padding:24px 30px 26px;background:#102a3d;border-top:1px solid #29445a;"><strong style="color:#ffffff;font-size:16px;">Max Webstudio</strong><p style="margin:7px 0 14px;color:#91a6bc;font-size:13px;line-height:1.6;">Professionele websites voor ondernemers die snel vertrouwen en aanvragen willen.</p><a href="mailto:${supportEmail}" style="color:#7dd3fc;text-decoration:underline;">${supportEmail}</a><span style="color:#587088;"> · </span><a href="https://wa.me/31851305282" style="color:#7dd3fc;text-decoration:underline;">WhatsApp</a><span style="color:#587088;"> · </span><a href="${SITE_URL}" style="color:#7dd3fc;text-decoration:underline;">maxwebstudio.nl</a></td></tr>
</table></td></tr></table></body></html>`;

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
