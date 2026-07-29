function buildFoodDemoBundleMail(input = {}) {
  const contactName = text(input.contactName) || "relatie";
  const restaurantName = text(input.restaurantName) || "uw restaurant";
  const storefrontUrl = httpsUrl(input.storefrontUrl);
  const dashboardUrl = httpsUrl(input.dashboardUrl);
  const qrUrl = httpsUrl(input.qrUrl);
  if (!storefrontUrl || !dashboardUrl) throw Object.assign(new Error("De demonstratielinks zijn ongeldig."), { code: "DEMO_LINKS_INVALID" });
  const subject = input.blueprintKey === "silverado-food-v1"
    ? "Uw Silverado Food-demonstratie staat klaar"
    : `Uw ${restaurantName} Food-demonstratie staat klaar`;
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f7f5;color:#14231d;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #dce6e0;border-radius:18px;padding:30px"><span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#e7f6ed;color:#16613f;font-size:12px;font-weight:700">FOOD-DEMO · TESTOMGEVING</span><h1 style="font-size:27px;line-height:1.2;margin:20px 0 14px">Uw Food-demonstratie staat klaar</h1><p>Beste ${escapeHtml(contactName)},</p><p>We hebben een werkende demonstratie voorbereid van de online bestelomgeving en het restaurantdashboard van ${escapeHtml(restaurantName)}.</p><h2 style="font-size:17px;margin-top:24px">Op uw telefoon</h2><p>Open de bestelomgeving en plaats tijdens de demonstratie een testbestelling.</p><p><a href="${escapeHtml(storefrontUrl)}" style="display:inline-block;background:#16734a;color:#fff;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:700">Open bestelomgeving</a></p>${qrUrl?`<p><a href="${escapeHtml(storefrontUrl)}"><img src="${escapeHtml(qrUrl)}" width="150" height="150" alt="QR-code naar de bestelomgeving" style="display:block;border:8px solid #fff"></a></p>`:""}<h2 style="font-size:17px;margin-top:24px">Op uw computer</h2><p>Open het restaurantdashboard en bekijk hoe de bestelling binnenkomt en wordt verwerkt. Inloggen gebeurt veilig; de link bevat geen accountgegevens.</p><p><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#162b22;color:#fff;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:700">Open restaurantdashboard</a></p><p>U kunt de QR-code ook met uw telefoon scannen om direct naar de bestelomgeving te gaan.</p><p style="color:#52635b;font-size:13px">Dit is een demonstratie voor afhalen. Er vindt geen echte betaling plaats.</p><p style="margin-top:28px">Met vriendelijke groet,<br><strong>Max Webstudio</strong></p></div></div></body></html>`;
  const plain = [
    `Beste ${contactName},`, "", `We hebben een werkende demonstratie voorbereid van de online bestelomgeving en het restaurantdashboard van ${restaurantName}.`, "",
    "Op uw telefoon:", "Open de bestelomgeving en plaats tijdens de demonstratie een testbestelling.", storefrontUrl, "",
    "Op uw computer:", "Open het restaurantdashboard en bekijk hoe de bestelling binnenkomt en wordt verwerkt.", dashboardUrl, "",
    "Dit is een demonstratie voor afhalen. Er vindt geen echte betaling plaats.", "", "Met vriendelijke groet,", "Max Webstudio",
  ].join("\n");
  return { subject, html, text: plain };
}

function httpsUrl(value) { try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.href : ""; } catch { return ""; } }
function text(value) { return String(value || "").trim(); }
function escapeHtml(value) { return text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }

module.exports = { buildFoodDemoBundleMail, _private: { escapeHtml, httpsUrl } };
