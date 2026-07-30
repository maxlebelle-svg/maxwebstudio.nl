const DEFAULT_SUPPORT_EMAIL = "info@maxwebstudio.nl";

function buildCommercialOfferMail(input = {}) {
  const relationship = input.relationship || {};
  const demo = input.demo || {};
  const snapshot = input.snapshot || {};
  const test = input.mode === "test";
  const preview = input.mode === "preview";
  const recipientName = clean(relationship.contactName).split(/\s+/)[0] || "ondernemer";
  const companyName = clean(relationship.companyName) || "jouw organisatie";
  const desktopUrl = safeHttpsUrl(demo.desktopUrl);
  const mobileUrl = safeHttpsUrl(demo.mobileUrl || demo.desktopUrl);
  const qrCodeUrl = safeHttpsUrl(demo.qrCodeUrl);
  const interestUrl = safeHttpsUrl(input.interestUrl);
  const supportEmail = validEmail(input.supportEmail) ? clean(input.supportEmail).toLowerCase() : DEFAULT_SUPPORT_EMAIL;
  if (!desktopUrl || !mobileUrl || !qrCodeUrl) throw invalid("DEMO_MAIL_INCOMPLETE", "De demo mist een veilige desktop-, mobiele of QR-link.");
  if (!Array.isArray(snapshot.lines) || !snapshot.lines.length || snapshot.hasNonBindingLines) throw invalid("OFFER_MAIL_INCOMPLETE", "De aanbodversie bevat geen volledig bindende productregels.");
  if (!test && !preview && !interestUrl) throw invalid("INTEREST_LINK_REQUIRED", "De veilige interesselink ontbreekt.");

  const prefix = test ? "[TEST] " : "";
  const subject = `${prefix}Jouw demo en voorstel van Max Webstudio`;
  const lineRows = snapshot.lines.map((line) => {
    const interval = line.componentType === "recurring" ? " per maand" : " eenmalig";
    return `<tr><td style="padding:9px 0;border-bottom:1px solid #e1e8ee;">${escape(line.productName)}</td><td align="right" style="padding:9px 0;border-bottom:1px solid #e1e8ee;font-weight:700;">${escape(money(line.subtotalExVatCents))} excl. btw${interval}</td></tr>`;
  }).join("");
  const textLines = snapshot.lines.map((line) => `- ${line.productName}: ${money(line.subtotalExVatCents)} excl. btw${line.componentType === "recurring" ? " per maand" : " eenmalig"}`);
  const disclaimer = "Met deze bevestiging geeft u aan dat u verder wilt praten over dit voorstel. Dit is nog geen digitale ondertekening of betalingsopdracht.";
  const testBanner = test ? `<tr><td style="padding:12px 28px;background:#fff1bd;color:#5b4200;font-weight:900;text-align:center;">TESTMAIL — niet naar de klant verzonden</td></tr>` : "";
  const cta = test || preview
    ? `<div style="margin-top:22px;padding:14px;border:1px dashed #8aa0b2;border-radius:10px;color:#526170;text-align:center;font-weight:700;">${test ? "TEST: " : "VOORBEELD: "}interesseknop wordt pas in de definitieve klantmail geactiveerd</div>`
    : `<a href="${escape(interestUrl)}" style="display:block;margin-top:22px;padding:15px 18px;border-radius:10px;background:#0d9b70;color:#fff;text-decoration:none;text-align:center;font-weight:900;">Ja, ik wil verder met deze demo</a>`;

  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(subject)}</title></head><body style="margin:0;background:#07121f;font-family:Inter,Arial,sans-serif;color:#142130;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:30px 14px;background:#07121f;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border-radius:18px;overflow:hidden;">${testBanner}<tr><td style="padding:28px;background:#08243a;color:#fff;"><img src="https://maxwebstudio.nl/max-webstudio-logo-full.svg" width="190" alt="Max Webstudio"><h1 style="margin:22px 0 6px;font-size:28px;">Je demo en persoonlijke voorstel staan klaar</h1><p style="margin:0;color:#b9d3e4;">Voor ${escape(companyName)}</p></td></tr><tr><td style="padding:30px;"><p style="font-size:16px;line-height:1.65;">Hoi ${escape(recipientName)},</p><p style="font-size:16px;line-height:1.65;">Bekijk de demo op je computer of open de mobiele versie op je telefoon.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:8px;"><a href="${escape(desktopUrl)}" style="display:block;padding:14px;background:#1477d4;color:#fff;text-decoration:none;text-align:center;border-radius:9px;font-weight:800;">Demo op computer bekijken</a><a href="${escape(mobileUrl)}" style="display:block;margin-top:10px;padding:14px;background:#e5eef7;color:#14518b;text-decoration:none;text-align:center;border-radius:9px;font-weight:800;">Mobiele demo openen</a></td><td width="132" align="center"><img src="${escape(qrCodeUrl)}" width="112" height="112" alt="QR-code naar de mobiele demo" style="display:block;padding:6px;border:1px solid #d9e6e1;border-radius:10px;"></td></tr></table><h2 style="margin:28px 0 8px;">Jouw voorstel</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${lineRows}</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;background:#f2f6f8;border-radius:12px;"><tr><td style="padding:15px;">Eenmalig excl. btw</td><td align="right" style="padding:15px;font-weight:800;">${escape(money(snapshot.oneTimeExVatCents))}</td></tr><tr><td style="padding:0 15px 15px;">Per maand excl. btw</td><td align="right" style="padding:0 15px 15px;font-weight:800;">${escape(money(snapshot.recurringExVatCents))}</td></tr><tr><td style="padding:0 15px 15px;">Vaste aanbetaling excl. btw</td><td align="right" style="padding:0 15px 15px;font-weight:800;">${escape(money(snapshot.fixedDepositExVatCents))}</td></tr></table>${cta}<p style="margin:16px 0 0;color:#526170;font-size:13px;line-height:1.55;">${escape(disclaimer)}</p></td></tr><tr><td style="padding:22px 30px;background:#f2f6f8;color:#526170;font-size:13px;">Vragen? Mail <a href="mailto:${escape(supportEmail)}">${escape(supportEmail)}</a>.<br>Max Webstudio · maxwebstudio.nl</td></tr></table></td></tr></table></body></html>`;
  const text = [
    test ? "TESTMAIL — niet naar de klant verzonden" : "",
    `Hoi ${recipientName},`, "", `Je demo en persoonlijke voorstel voor ${companyName} staan klaar.`, "",
    `Demo op computer: ${desktopUrl}`, `Mobiele demo: ${mobileUrl}`, `QR-code: ${qrCodeUrl}`, "",
    "Jouw voorstel:", ...textLines, "",
    `Eenmalig excl. btw: ${money(snapshot.oneTimeExVatCents)}`,
    `Per maand excl. btw: ${money(snapshot.recurringExVatCents)}`,
    `Vaste aanbetaling excl. btw: ${money(snapshot.fixedDepositExVatCents)}`,
    "", test ? "TEST: de interesseknop is niet actief." : preview ? "VOORBEELD: de interesseknop is nog niet actief." : `Ja, ik wil verder met deze demo: ${interestUrl}`,
    "", disclaimer, "", `Vragen? ${supportEmail}`,
  ].filter((line, index, rows) => !(line === "" && rows[index - 1] === "")).join("\n");
  return { subject, html, text, desktopUrl, mobileUrl, qrCodeUrl, interestUrl, disclaimer, test, preview };
}

function money(value) {
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 0) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}
function safeHttpsUrl(value) { try { const url = new URL(clean(value)); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : ""; } catch { return ""; } }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value)); }
function clean(value) { return String(value || "").trim(); }
function escape(value) { return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function invalid(code, message) { return Object.assign(new Error(message), { code, statusCode: 409 }); }

module.exports = { buildCommercialOfferMail, _private: { money, safeHttpsUrl, validEmail } };
