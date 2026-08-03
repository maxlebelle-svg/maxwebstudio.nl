const { sendEmail } = require("../email");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_URL = "https://maxwebstudio.nl";

async function notifyAdminOfDomainReservation(input = {}, dependencies = {}) {
  const env = dependencies.env || process.env;
  const send = dependencies.sendEmail || sendEmail;
  const reservation = normalizeReservation(input);
  const recipient = cleanEmail(env.DOMAIN_ORDER_ADMIN_EMAIL || env.ADMIN_EMAIL || "info@maxwebstudio.nl");
  if (!EMAIL.test(recipient)) return { sent: false, warning: "Admin-e-mailadres voor domeinreserveringen ontbreekt." };

  const deepLink = buildDomainCenterLink(reservation.customerId, env.SITE_URL || env.URL || SITE_URL);
  const subject = `Nieuwe domeinreservering: ${reservation.domainName}`;
  const text = [
    "Er is een nieuwe domeinreservering ontvangen.",
    "",
    `Domein: ${reservation.domainName}`,
    `Klant: ${reservation.companyName || reservation.holderName}`,
    `Contactpersoon: ${reservation.holderName}`,
    `E-mail: ${reservation.email}`,
    `Telefoon: ${reservation.phone}`,
    `Referentie: ${reservation.requestId}`,
    "",
    reservation.paymentCreated
      ? `Betaallink: automatisch aangemaakt voor ${reservation.paymentLabel || "het ingestelde bedrag"}. Registreer het domein pas nadat Mollie de betaling heeft bevestigd.`
      : "Volgende stap: controleer de gegevens en stuur de betaallink. Registreer het domein pas nadat de betaling is bevestigd.",
    deepLink,
  ].join("\n");

  return send({
    to: recipient,
    subject,
    html: buildHtml({ ...reservation, deepLink }),
    text,
    templateKey: "domain_reservation_admin",
    templateName: "Nieuwe domeinreservering",
    customerId: reservation.customerId,
    triggeredBy: "public_domain_order",
    idempotencyKey: `domain.reservation.admin:${reservation.requestId}`,
    sensitiveContent: true,
    suppressTimelineEvent: true,
    metadata: {
      domainName: reservation.domainName,
      requestId: reservation.requestId,
      customerId: reservation.customerId,
      notificationType: "admin_domain_reservation",
    },
  });
}

function normalizeReservation(input = {}) {
  const request = input.request || {};
  const customer = input.customer || {};
  const order = input.order || {};
  const value = {
    requestId: clean(request.id || input.requestId),
    customerId: clean(customer.id || input.customerId),
    domainName: clean(request.domainName || request.domain_name || order.domainName).toLowerCase(),
    holderName: clean(order.holderName || customer.name || customer.contact_name || customer.company),
    companyName: clean(order.companyName || customer.company || customer.company_name),
    email: cleanEmail(order.email || customer.email),
    phone: clean(order.phone || customer.phone),
    paymentCreated: Boolean(input.payment?.created),
    paymentLabel: clean(input.payment?.offer?.label),
  };
  if (!value.requestId || !value.customerId || !value.domainName || !value.holderName || !EMAIL.test(value.email)) {
    const error = new Error("Domeinreservering bevat onvoldoende gegevens voor de adminmelding.");
    error.code = "DOMAIN_NOTIFICATION_INVALID";
    throw error;
  }
  return value;
}

function buildDomainCenterLink(customerId, baseUrl = SITE_URL) {
  const base = /^https:\/\//i.test(clean(baseUrl)) ? clean(baseUrl) : SITE_URL;
  const url = new URL("/admin-domain-center.html", base);
  url.searchParams.set("relationshipType", "customer");
  url.searchParams.set("relationshipId", customerId);
  url.searchParams.set("customerId", customerId);
  return url.toString();
}

function buildHtml(input) {
  const rows = [
    ["Domein", input.domainName],
    ["Klant", input.companyName || input.holderName],
    ["Contactpersoon", input.holderName],
    ["E-mail", input.email],
    ["Telefoon", input.phone || "Niet ingevuld"],
    ["Referentie", input.requestId],
  ].map(([label, value]) => `<tr><td style="padding:8px 12px;color:#64748b;font-size:13px">${escapeHtml(label)}</td><td style="padding:8px 12px;color:#0f172a;font-size:13px;font-weight:700">${escapeHtml(value)}</td></tr>`).join("");
  const instruction = input.paymentCreated
    ? `De betaallink voor ${escapeHtml(input.paymentLabel || "het ingestelde bedrag")} is automatisch verstuurd. Registreer het domein pas nadat Mollie de betaling heeft bevestigd.`
    : "Controleer de klantgegevens en stuur de betaallink. Registreer het domein pas nadat de betaling is bevestigd.";
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f4f7fb;font-family:Inter,Arial,sans-serif;color:#0f172a"><div style="max-width:640px;margin:0 auto;padding:32px 18px"><div style="padding:30px;border-radius:18px;background:#ffffff;border:1px solid #dbe6f0"><p style="margin:0 0 8px;color:#1594d0;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase">Max Webstudio · Domein Center</p><h1 style="margin:0 0 12px;font-size:26px;line-height:1.2">Nieuwe domeinreservering</h1><p style="margin:0 0 22px;color:#52677a;line-height:1.6">${instruction}</p><table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px">${rows}</table><p style="margin:24px 0 0"><a href="${escapeHtml(input.deepLink)}" style="display:inline-block;padding:13px 18px;border-radius:10px;background:#155eef;color:#ffffff;font-weight:800;text-decoration:none">Open in Domein Center</a></p></div></div></body></html>`;
}

function clean(value) { return String(value || "").trim(); }
function cleanEmail(value) { return clean(value).toLowerCase(); }
function escapeHtml(value) { return clean(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }

module.exports = {
  notifyAdminOfDomainReservation,
  _private: { buildDomainCenterLink, buildHtml, normalizeReservation },
};
