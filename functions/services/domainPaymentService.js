const { sendEmail } = require("../email");

const OFFERS = Object.freeze({
  nl: Object.freeze({ extension: "nl", amountCents: 2495, amount: "24.95", label: "€ 24,95", description: ".nl-domeinregistratie voor 1 jaar" }),
  com: Object.freeze({ extension: "com", amountCents: 2995, amount: "29.95", label: "€ 29,95", description: ".com-domeinregistratie voor 1 jaar" }),
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function offerForDomain(domainName = "") {
  const extension = String(domainName).trim().toLowerCase().split(".").pop();
  const offer = OFFERS[extension];
  return offer ? { ...offer, automaticPayment: true, billingPeriod: "year", vatIncluded: true } : {
    extension, automaticPayment: false, label: "Prijs op aanvraag", billingPeriod: "year", vatIncluded: true,
  };
}

async function createDomainPayment(input = {}, dependencies = {}) {
  const env = dependencies.env || process.env;
  const fetchImpl = dependencies.fetchImpl || global.fetch;
  const send = dependencies.sendEmail || sendEmail;
  const request = input.request || {};
  const customer = input.customer || {};
  const order = input.order || {};
  const offer = offerForDomain(request.domainName || order.domainName);
  if (!offer.automaticPayment) return { created: false, supported: false, offer };

  const config = paymentConfig(env);
  if (!config.enabled) return { created: false, supported: true, offer, warning: config.warning };
  const invoice = await ensureInvoice(config, { request, customer, order, offer }, fetchImpl);
  const payment = reusablePayment(invoice) || await createMolliePayment(config, invoice, request, offer, fetchImpl);
  const checkoutUrl = clean(payment.checkoutUrl || payment.mollie_checkout_url || payment?._links?.checkout?.href);
  const paymentId = clean(payment.paymentId || payment.mollie_payment_id || payment.id);
  if (!checkoutUrl || !paymentId) throw serviceError(502, "Mollie gaf geen geldige betaallink terug.");

  const savedInvoice = reusablePayment(invoice) ? invoice : await patchInvoice(config, invoice.id, {
    mollie_payment_id: paymentId,
    mollie_checkout_url: checkoutUrl,
    mollie_payment_status: clean(payment.status || "open"),
    mollie_payment_created_at: clean(payment.createdAt) || new Date().toISOString(),
    mollie_payment_expires_at: clean(payment.expiresAt) || null,
    payment_link: checkoutUrl,
    status: "sent",
    updated_at: new Date().toISOString(),
  }, fetchImpl);
  await markRequestAwaitingPayment(config, request, savedInvoice, paymentId, checkoutUrl, fetchImpl);

  const mail = buildPaymentLinkEmail({ request, customer, order, offer, checkoutUrl });
  const emailResult = await send({
    to: cleanEmail(order.email || customer.email),
    bcc: cleanEmail(env.DOMAIN_ORDER_ADMIN_EMAIL || env.ADMIN_EMAIL) || undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    templateKey: "domain_payment_link",
    templateName: "Betaallink domeinregistratie",
    customerId: customer.id,
    invoiceId: savedInvoice.id,
    triggeredBy: "public_domain_order",
    idempotencyKey: `domain.payment.link:${request.id}:${paymentId}`,
    sensitiveContent: true,
    metadata: { domainName: request.domainName, domainRequestId: request.id, paymentId, amount: offer.amount },
  });
  if (emailResult.sent && !savedInvoice.email_sent_at) {
    await patchInvoice(config, savedInvoice.id, { email_sent_at: new Date().toISOString(), email_last_error: null }, fetchImpl).catch(() => null);
  } else if (!emailResult.sent) {
    await patchInvoice(config, savedInvoice.id, { email_last_error: clean(emailResult.warning || "Betaalmail kon niet worden verzonden.") }, fetchImpl).catch(() => null);
  }
  return { created: true, supported: true, offer, invoiceId: savedInvoice.id, paymentId, checkoutUrl, emailSent: Boolean(emailResult.sent) };
}

function paymentConfig(env = {}) {
  const enabled = truthy(env.DOMAIN_PAYMENT_AUTOMATION_ENABLED) && truthy(env.DOMAIN_PAYMENT_LIVE_ENABLED);
  const apiKey = clean(env.MOLLIE_API_KEY);
  const siteUrl = clean(env.SITE_URL || env.URL || "https://maxwebstudio.nl").replace(/\/$/, "");
  const supabaseUrl = clean(env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!enabled) return { enabled: false, warning: "Automatische domeinbetaling staat nog niet live." };
  if (!apiKey.startsWith("live_")) return { enabled: false, warning: "De live Mollie-sleutel voor domeinbetalingen ontbreekt." };
  if (!siteUrl || !supabaseUrl || !serviceRoleKey) return { enabled: false, warning: "De betaal- of opslagconfiguratie is onvolledig." };
  return { enabled: true, apiKey, siteUrl, supabaseUrl, serviceRoleKey };
}

async function ensureInvoice(config, input, fetchImpl) {
  const invoiceNumber = `DOM-${input.request.id}`;
  const existing = await rest(config, `invoices?select=*&id=eq.${encodeURIComponent(input.request.id)}&limit=1`, {}, fetchImpl);
  if (existing?.[0]) return existing[0];
  const subtotalCents = Math.round(input.offer.amountCents / 1.21);
  const vatCents = input.offer.amountCents - subtotalCents;
  const now = new Date();
  const context = {
    source: "domain_order",
    domainRequestId: input.request.id,
    customerId: input.customer.id,
    domainName: input.request.domainName,
    extension: input.offer.extension,
    customerName: input.order.holderName,
    customerCompany: input.order.companyName,
    customerEmail: input.order.email,
    amountInclVat: input.offer.amount,
  };
  const record = {
    id: input.request.id,
    customer_id: input.customer.id,
    invoice_number: invoiceNumber,
    type: "domain_registration",
    title: `Domeinregistratie ${input.request.domainName}`,
    status: "draft",
    invoice_date: now.toISOString().slice(0, 10),
    due_date: new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10),
    subtotal: (subtotalCents / 100).toFixed(2),
    vat: (vatCents / 100).toFixed(2),
    total: input.offer.amount,
    notes: `Automatische betaling voor ${input.request.domainName}.\n---\nFactuurregels: ${JSON.stringify(context)}`,
    is_demo: false,
    environment: "production",
    metadata: { source: "domain_order", domainRequestId: input.request.id, domainName: input.request.domainName },
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  let created;
  try {
    created = await rest(config, "invoices", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) }, fetchImpl);
  } catch (error) {
    if (error.status !== 409) throw error;
    const raced = await rest(config, `invoices?select=*&id=eq.${encodeURIComponent(input.request.id)}&limit=1`, {}, fetchImpl);
    if (!raced?.[0]) throw error;
    return raced[0];
  }
  const invoice = created?.[0];
  if (!invoice?.id) throw serviceError(500, "Domeinfactuur kon niet worden aangemaakt.");
  await rest(config, "invoice_lines", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      invoice_id: invoice.id,
      description: input.offer.description,
      quantity: 1,
      unit_price: (subtotalCents / 100).toFixed(2),
      vat_rate: 21,
      line_total: input.offer.amount,
      position: 1,
      metadata: { domainName: input.request.domainName, domainRequestId: input.request.id },
    }),
  }, fetchImpl);
  return invoice;
}

function reusablePayment(invoice = {}) {
  const status = clean(invoice.mollie_payment_status || invoice.status).toLowerCase();
  const active = !["paid", "failed", "expired", "canceled", "cancelled"].includes(status);
  if (active && invoice.mollie_payment_id && invoice.mollie_checkout_url) return invoice;
  return null;
}

async function createMolliePayment(config, invoice, request, offer, fetchImpl) {
  const response = await fetchImpl("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": `domain-payment-${request.id}` },
    body: JSON.stringify({
      amount: { currency: "EUR", value: offer.amount },
      description: `Domeinregistratie ${request.domainName}`.slice(0, 255),
      redirectUrl: `${config.siteUrl}/domein-betaling-bedankt.html?request=${encodeURIComponent(request.id)}`,
      webhookUrl: `${config.siteUrl}/.netlify/functions/mollie-webhook`,
      metadata: { source: "domain_order", domainRequestId: request.id, customerId: request.customerId, invoiceId: invoice.id, domainName: request.domainName },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw serviceError(response.status >= 500 ? 502 : 400, data.detail || data.title || "Mollie kon de domeinbetaling niet aanmaken.");
  return data;
}

async function patchInvoice(config, invoiceId, patch, fetchImpl) {
  const rows = await rest(config, `invoices?id=eq.${encodeURIComponent(invoiceId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }, fetchImpl);
  return rows?.[0] || { id: invoiceId, ...patch };
}

async function markRequestAwaitingPayment(config, request, invoice, paymentId, checkoutUrl, fetchImpl) {
  const internalMetadata = {
    ...(request.internalMetadata || {}),
    payment: { invoiceId: invoice.id, paymentId, checkoutUrl, status: "open", amount: invoice.total, currency: "EUR", updatedAt: new Date().toISOString() },
  };
  await rest(config, `domain_requests?id=eq.${encodeURIComponent(request.id)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "awaiting_approval", internal_metadata: internalMetadata, updated_at: new Date().toISOString() }),
  }, fetchImpl);
  await rest(config, "domain_request_events", {
    method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ domain_request_id: request.id, customer_id: request.customerId, actor_type: "system", event_type: "domain_payment_link_created", safe_metadata: { invoiceId: invoice.id, paymentId, amount: invoice.total, currency: "EUR" } }),
  }, fetchImpl);
}

function buildPaymentLinkEmail({ request, customer, order, offer, checkoutUrl }) {
  const name = clean(order.holderName || customer.name || customer.company || "klant");
  const subject = `Betaallink voor ${request.domainName}`;
  const text = `Beste ${name},\n\nJe domeinnaam ${request.domainName} is beschikbaar en gereserveerd voor controle. Rond de betaling van ${offer.label} inclusief btw af via:\n${checkoutUrl}\n\nNa bevestiging van Mollie registreren we het domein op basis van de aangeleverde houdergegevens. Een reservering is pas definitief na succesvolle registratie.\n\nMet vriendelijke groet,\nMax Webstudio`;
  const html = `<!doctype html><html lang="nl"><body style="margin:0;background:#f4f7fb;font-family:Inter,Arial,sans-serif;color:#0f172a"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="padding:30px;border:1px solid #dbe6f0;border-radius:18px;background:#fff"><p style="margin:0 0 8px;color:#1594d0;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em">Max Webstudio · Domeinregistratie</p><h1 style="margin:0 0 14px;font-size:25px">${escapeHtml(request.domainName)} staat klaar</h1><p style="color:#52677a;line-height:1.65">Beste ${escapeHtml(name)}, je domeinnaam is beschikbaar en gereserveerd voor controle. Rond de betaling af om de registratie te laten uitvoeren.</p><div style="margin:22px 0;padding:18px;border-radius:12px;background:#f3f7ff"><strong style="font-size:22px">${escapeHtml(offer.label)}</strong><span style="display:block;margin-top:4px;color:#64748b;font-size:13px">Inclusief btw · registratie voor 1 jaar</span></div><a href="${escapeHtml(checkoutUrl)}" style="display:inline-block;padding:14px 20px;border-radius:10px;background:#155eef;color:#fff;font-weight:800;text-decoration:none">Veilig betalen via Mollie</a><p style="margin:22px 0 0;color:#64748b;font-size:12px;line-height:1.6">Een reservering is pas definitief nadat Mollie de betaling heeft bevestigd en de registratie bij de registrar succesvol is afgerond.</p></div></div></body></html>`;
  return { subject, text, html };
}

async function rest(config, path, options = {}, fetchImpl = global.fetch) {
  const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/${path}`, { ...options, headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, Accept: "application/json", "Content-Type": "application/json", "Accept-Profile": "public", "Content-Profile": "public", ...(options.headers || {}) } });
  const data = await response.json().catch(() => null);
  if (!response.ok) { const error = serviceError(response.status, data?.message || data?.error || "Betaalgegevens konden niet worden opgeslagen."); error.code = data?.code || ""; throw error; }
  return data;
}

function truthy(value) { return ["true", "1", "yes", "on"].includes(clean(value).toLowerCase()); }
function clean(value) { return String(value || "").trim(); }
function cleanEmail(value) { const email = clean(value).toLowerCase(); return EMAIL.test(email) ? email : ""; }
function escapeHtml(value) { return clean(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
function serviceError(status, message) { const error = new Error(message); error.status = status; error.statusCode = status; return error; }

module.exports = { createDomainPayment, offerForDomain, _private: { buildPaymentLinkEmail, paymentConfig, reusablePayment } };
