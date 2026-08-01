const DEFAULT_SUPPORT_EMAIL = "info@maxwebstudio.nl";
const SITE_URL = "https://maxwebstudio.nl";
const LOGO_URL = `${SITE_URL}/max-webstudio-logo-mark.svg`;
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
  const qrCodeUrl = safeHttpsUrl(demo.qrCodeUrl);
  const interestUrl = safeHttpsUrl(input.interestUrl);
  const supportEmail = validEmail(input.supportEmail) ? clean(input.supportEmail).toLowerCase() : DEFAULT_SUPPORT_EMAIL;
  const validUntil = normalizeValidityDate(snapshot.validUntil);
  if (!desktopUrl || !mobileUrl || !qrCodeUrl) throw invalid("DEMO_MAIL_INCOMPLETE", "De demo mist een veilige desktop-, mobiele of QR-link.");
  if (!Array.isArray(snapshot.lines) || !snapshot.lines.length || snapshot.hasNonBindingLines) throw invalid("OFFER_MAIL_INCOMPLETE", "De aanbodversie bevat geen volledig bindende productregels.");
  if (!validUntil) throw invalid("OFFER_VALIDITY_REQUIRED", "De aanbodversie mist een geldige, server-side bepaalde geldigheidsdatum.");
  if (isExpired(validUntil)) throw invalid("OFFER_EXPIRED", "De aanbodversie is verlopen en kan niet worden verzonden.");
  if (!test && !preview && !interestUrl) throw invalid("INTEREST_LINK_REQUIRED", "De veilige interesselink ontbreekt.");

  const prefix = staging ? "[STAGING TEST] " : test ? "[TEST] " : "";
  const subject = `${prefix}Jouw demo en voorstel van Max Webstudio`;
  const lineRows = snapshot.lines.map((line) => `<tr><td style="padding:11px 0;border-bottom:1px solid rgba(125,211,252,.12);color:#c9d7e8;font-size:14px;">${escape(line.productName)}${line.componentType === "recurring" ? " · per maand" : " · eenmalig"}</td><td align="right" style="padding:11px 0;border-bottom:1px solid rgba(125,211,252,.12);color:#ffffff;font-size:14px;font-weight:900;">${escape(money(line.subtotalExVatCents))}</td></tr>`).join("");
  const textLines = snapshot.lines.map((line) => `- ${line.productName}: ${money(line.subtotalExVatCents)} excl. btw${line.componentType === "recurring" ? " per maand" : " eenmalig"}`);
  const disclaimer = "Met deze bevestiging geeft u aan dat u verder wilt praten over dit voorstel. Dit is nog geen digitale ondertekening of betalingsopdracht.";
  const banner = staging ? "STAGINGTEST — niet naar een echte klant verzenden" : test ? "TESTMAIL — niet naar de klant verzonden" : "";
  const customerAction = test || preview
    ? `<div style="margin-top:22px;padding:14px;border:1px dashed rgba(125,211,252,.38);border-radius:14px;color:#91a6bc;text-align:center;font-weight:800;">${test ? "TEST" : "VOORBEELD"}: de interesseknop wordt pas in de definitieve klantmail geactiveerd</div>`
    : `<a class="mws-cta" href="${escape(interestUrl)}" style="display:block;margin-top:22px;padding:15px 18px;border-radius:14px;background:#28d39a;color:#06121f;text-decoration:none;text-align:center;font-weight:900;">Ja, ik wil verder met deze demo</a>`;
  const bannerRow = banner ? `<tr><td style="padding:14px 28px;background:#4b3a08;color:#ffe29a;font-weight:900;text-align:center;letter-spacing:.03em;">${escape(banner)}</td></tr>` : "";

  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escape(subject)}</title><style>
@media(max-width:620px){.mws-shell{padding:14px 8px!important}.mws-card{width:100%!important;border-radius:18px!important}.mws-pad{padding-left:20px!important;padding-right:20px!important}.mws-title{font-size:29px!important}.mws-demo-grid td{display:block!important;width:100%!important;box-sizing:border-box}.mws-qr{text-align:center!important;padding-top:18px!important}.mws-cta{display:block!important;text-align:center!important}}
</style></head>
<body style="margin:0;background:#061626;color:#ffffff;font-family:Inter,Arial,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Je persoonlijke demo en voorstel van Max Webstudio staan klaar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mws-shell" style="background:#061626;padding:30px 14px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mws-card" style="max-width:680px;background:#0d2235;border:1px solid rgba(68,180,255,.28);border-radius:24px;overflow:hidden;">
${bannerRow}<tr><td class="mws-pad" style="padding:30px 30px 14px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:48px;height:48px;border-radius:14px;background:#07111f;text-align:center;"><img src="${LOGO_URL}" width="42" height="42" alt="Max Webstudio" style="display:block;margin:3px auto;border:0;"></td><td style="padding-left:13px;"><div style="font-size:18px;color:#ffffff;font-weight:900;">Max Webstudio</div><div style="font-size:12px;color:#27c7ff;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Persoonlijk voorstel</div></td></tr></table></td></tr>
<tr><td class="mws-pad" style="padding:8px 30px 22px;"><h1 class="mws-title" style="margin:0;color:#ffffff;font-size:34px;line-height:1.12;font-weight:900;">Je demo en persoonlijke voorstel staan klaar</h1><p style="margin:12px 0 0;color:#91a6bc;font-size:16px;">Voor ${escape(companyName)}</p></td></tr>
<tr><td class="mws-pad" style="padding:4px 30px 30px;"><p style="margin:0 0 14px;color:#c9d7e8;font-size:16px;line-height:1.7;">Hoi ${escape(recipientName)},</p><p style="margin:0 0 22px;color:#c9d7e8;font-size:16px;line-height:1.7;">Bekijk de demo op je computer of open de mobiele versie op je telefoon.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mws-demo-grid" style="background:#102a3d;border-radius:16px;"><tr><td style="padding:18px;"><a class="mws-cta" href="${escape(desktopUrl)}" style="display:block;padding:14px 16px;border-radius:13px;background:#2563eb;color:#ffffff;text-decoration:none;text-align:center;font-weight:900;">Demo op computer bekijken</a><a class="mws-cta" href="${escape(mobileUrl)}" style="display:block;margin-top:10px;padding:14px 16px;border-radius:13px;background:#173a53;color:#bfe9ff;text-decoration:none;text-align:center;font-weight:900;">Mobiele demo openen</a></td><td width="150" class="mws-qr" style="padding:18px 18px 18px 0;text-align:right;"><img src="${escape(qrCodeUrl)}" width="120" height="120" alt="QR-code naar de mobiele demo" style="display:inline-block;background:#fff;padding:7px;border-radius:14px;"></td></tr></table>
<h2 style="margin:28px 0 8px;color:#ffffff;font-size:21px;">Jouw voorstel</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lineRows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#102a3d;border-radius:14px;"><tr><td style="padding:15px;color:#91a6bc;">Eenmalig excl. btw</td><td align="right" style="padding:15px;color:#ffffff;font-weight:900;">${escape(money(snapshot.oneTimeExVatCents))}</td></tr><tr><td style="padding:0 15px 15px;color:#91a6bc;">Per maand excl. btw</td><td align="right" style="padding:0 15px 15px;color:#ffffff;font-weight:900;">${escape(money(snapshot.recurringExVatCents))}</td></tr><tr><td style="padding:0 15px 15px;color:#91a6bc;">Vaste aanbetaling excl. btw</td><td align="right" style="padding:0 15px 15px;color:#ffffff;font-weight:900;">${escape(money(snapshot.fixedDepositExVatCents))}</td></tr></table>
<p style="margin:18px 0 0;color:#7dd3fc;font-size:14px;font-weight:800;">Geldig tot en met ${escape(formatValidityDate(validUntil))}</p>${customerAction}<p style="margin:16px 0 0;color:#91a6bc;font-size:13px;line-height:1.65;">${escape(disclaimer)}</p></td></tr>
<tr><td class="mws-pad" style="padding:24px 30px 26px;background:#102a3d;border-top:1px solid rgba(125,211,252,.12);"><strong style="color:#ffffff;font-size:16px;">Max Webstudio</strong><p style="margin:7px 0 14px;color:#91a6bc;font-size:13px;line-height:1.6;">Professionele websites voor ondernemers die snel vertrouwen en aanvragen willen.</p><a href="mailto:${supportEmail}" style="color:#7dd3fc;text-decoration:underline;">${supportEmail}</a><span style="color:#587088;"> · </span><a href="https://wa.me/31851302326" style="color:#7dd3fc;text-decoration:underline;">WhatsApp</a><span style="color:#587088;"> · </span><a href="${SITE_URL}" style="color:#7dd3fc;text-decoration:underline;">maxwebstudio.nl</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = [banner, `Hoi ${recipientName},`, "", `Je demo en persoonlijke voorstel voor ${companyName} staan klaar.`, "", `Demo op computer: ${desktopUrl}`, `Mobiele demo: ${mobileUrl}`, "", "Jouw voorstel:", ...textLines, "", `Eenmalig excl. btw: ${money(snapshot.oneTimeExVatCents)}`, `Per maand excl. btw: ${money(snapshot.recurringExVatCents)}`, `Vaste aanbetaling excl. btw: ${money(snapshot.fixedDepositExVatCents)}`, `Geldig tot en met: ${formatValidityDate(validUntil)}`, "", test ? "TEST: de interesseknop is niet actief." : preview ? "VOORBEELD: de interesseknop is nog niet actief." : `Ja, ik wil verder met deze demo: ${interestUrl}`, "", disclaimer, "", `Vragen? ${supportEmail}`].filter((line, index, rows) => !(line === "" && rows[index - 1] === "")).join("\n");
  return { subject, html, text, desktopUrl, mobileUrl, qrCodeUrl, interestUrl, disclaimer, validUntil, test, preview, staging };
}

function money(value) { const cents = Number(value); return Number.isInteger(cents) && cents >= 0 ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100) : "—"; }
function safeHttpsUrl(value) { try { const url = new URL(clean(value)); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : ""; } catch { return ""; } }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value)); }
function clean(value) { return String(value || "").trim(); }
function escape(value) { return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function invalid(code, message) { return Object.assign(new Error(message), { code, statusCode: 409 }); }

module.exports = { buildCommercialOfferMail, _private: { money, safeHttpsUrl, validEmail, normalizeValidityDate, isExpired, formatValidityDate } };
