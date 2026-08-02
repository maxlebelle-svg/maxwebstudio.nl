const { rest } = require("./partnerOnboardingAccessService");
const { sendEmail } = require("../email");
const { getCompanySettings } = require("../company-settings");

async function fulfilSignedCommercialOffer(context, signing, activation = {}) {
  assertEnabled();
  const claim = await rpc(context, "commercial_claim_signed_fulfilment_v1", { input_signing_transaction_id: signing.id });
  if (claim.duplicate || !["processing", "pending", "failed"].includes(clean(claim.status))) return claim;
  try {
    const commercial = await loadCommercialContext(context, claim.offerVersionId);
    const customer = await resolveCustomer(context, commercial, activation.customerId);
    const factory = await prepareFactoryHandover(context, commercial, customer.id, claim);
    const payment = paymentAmounts(commercial.version);
    await markCustomerPaymentPending(context, customer, claim, factory);
    if (payment.totalCents <= 0) return finalize(context, claim.runId, "ready_for_production", { customerId: customer.id, factoryProjectId: factory?.id });
    const invoice = claim.invoiceId ? await fetchOne(context, `invoices?select=*&id=eq.${claim.invoiceId}&limit=1`) : await ensureInvoice(context, customer, commercial, payment, claim);
    const mollie = await ensureMolliePayment(context, invoice, customer, commercial, payment, claim);
    await sendPaymentRequest(context, invoice, customer, payment, mollie, claim);
    return finalize(context, claim.runId, "payment_pending", { customerId: customer.id, invoiceId: invoice.id, factoryProjectId: factory?.id, checkoutUrl: mollie.checkoutUrl, paymentId: mollie.paymentId });
  } catch (error) {
    await finalize(context, claim.runId, "failed", { errorCode: safeCode(error) }).catch(() => {});
    throw error;
  }
}

async function loadCommercialContext(context, offerVersionId) {
  const version = await fetchOne(context, `commercial_offer_versions?select=*&id=eq.${offerVersionId}&limit=1`);
  const offer = version ? await fetchOne(context, `commercial_offers?select=*&id=eq.${version.offer_id}&limit=1`) : null;
  if (!version || !offer || offer.current_version_id !== version.id) throw coded("COMMERCIAL_OFFER_CONTEXT_INVALID", 409, "De ondertekende offertecontext ontbreekt.");
  const table = offer.relationship_type === "lead" ? "leads" : "customers";
  const relationship = await fetchOne(context, `${table}?select=*&id=eq.${offer.relationship_id}&limit=1`);
  if (!relationship) throw coded("COMMERCIAL_RELATIONSHIP_MISSING", 409, "De relatie van de ondertekende offerte ontbreekt.");
  return { version, offer, relationship };
}

async function resolveCustomer(context, commercial, activationCustomerId) {
  const customerId = clean(activationCustomerId || (commercial.offer.relationship_type === "customer" ? commercial.offer.relationship_id : commercial.relationship.converted_customer_id || commercial.relationship.customer_id));
  const customer = customerId ? await fetchOne(context, `customers?select=*&id=eq.${customerId}&limit=1`) : null;
  if (!customer) throw coded("COMMERCIAL_CUSTOMER_ACTIVATION_PENDING", 409, "De klantactivatie na ondertekening is nog niet afgerond.");
  if (!validEmail(customer.email)) throw coded("COMMERCIAL_CUSTOMER_EMAIL_INVALID", 409, "Het e-mailadres van de klant is ongeldig.");
  return customer;
}

async function markCustomerPaymentPending(context, customer, claim, factory) {
  await rest(context.url, context.service, `customers?id=eq.${customer.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
    status: customer.status || "onboarding",
    metadata: { ...object(customer.metadata), commercialOrderStatus: "signed_payment_pending", commercialOfferId: claim.offerId, commercialOfferVersionId: claim.offerVersionId, productionHandoverStatus: factory ? "prepared" : "not_linked" },
    updated_at: new Date().toISOString(),
  }) });
}

async function prepareFactoryHandover(context, commercial, customerId, claim) {
  const id = clean(commercial.offer.factory_project_id);
  if (!id) return null;
  const factory = await fetchOne(context, `factory_projects?select=*&id=eq.${id}&limit=1`);
  if (!factory) throw coded("FACTORY_PROJECT_MISSING", 409, "Het gekoppelde Factory-dossier ontbreekt.");
  const configuration = { ...object(factory.configuration), commercialOffer: { ...object(factory.configuration?.commercialOffer), offerId: claim.offerId, offerVersionId: claim.offerVersionId, customerId, signatureStatus: "signed", paymentStatus: "pending", handoverPreparedAt: new Date().toISOString() } };
  const rows = await rest(context.url, context.service, `factory_projects?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ relationship_type: "customer", relationship_id: customerId, status: ["intake", "paused"].includes(clean(factory.status)) ? "ready" : factory.status, configuration, updated_at: new Date().toISOString() }) });
  return rows?.[0] || factory;
}

function paymentAmounts(version = {}) {
  const totalCents = integer(version.due_now_incl_vat_cents); const subtotalCents = integer(version.due_now_ex_vat_cents);
  return { totalCents, subtotalCents, vatCents: Math.max(0, totalCents - subtotalCents), total: euros(totalCents), subtotal: euros(subtotalCents), vat: euros(Math.max(0, totalCents - subtotalCents)) };
}

async function ensureInvoice(context, customer, commercial, payment, claim) {
  const existing = await fetchOne(context, `invoices?select=*&metadata->>commercialOfferVersionId=eq.${claim.offerVersionId}&limit=1`);
  if (existing?.id) return existing;
  const snapshot = object(commercial.version.snapshot); const paymentChoice = snapshot.paymentChoice === "full" ? "full" : "deposit";
  const invoiceNumber = `OFF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${claim.offerVersionId.slice(0, 8).toUpperCase()}`;
  const invoiceContext = { source: "commercial_order", environment: mollieConfig().testMode ? "test" : "live", testOrder: mollieConfig().testMode, orderId: orderId(claim.offerVersionId), customerId: customer.id, customerName: clean(customer.name), customerCompany: clean(customer.company || customer.company_name), customerEmail: clean(customer.email).toLowerCase(), packageLabel: packageLabel(snapshot), paymentChoice, commercialOfferId: claim.offerId, commercialOfferVersionId: claim.offerVersionId, signedAt: new Date().toISOString(), terms: { source: "signed_commercial_offer", acceptedAt: new Date().toISOString() }, invoiceLines: invoiceLines(snapshot, payment, paymentChoice) };
  const rows = await rest(context.url, context.service, "invoices", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ customer_id: customer.id, invoice_number: invoiceNumber, type: paymentChoice === "full" ? "full_payment" : "deposit", title: paymentChoice === "full" ? "Opdrachtbevestiging Max Webstudio" : "Aanbetaling ondertekende opdracht", subtotal: payment.subtotal, vat: payment.vat, total: payment.total, status: "draft", invoice_date: new Date().toISOString().slice(0, 10), due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), notes: `Ondertekende offerte ${claim.offerVersionId}.\n---\nFactuurregels: ${JSON.stringify(invoiceContext)}`, metadata: { commercialOfferId: claim.offerId, commercialOfferVersionId: claim.offerVersionId, fulfilmentRunId: claim.runId }, environment: invoiceContext.testOrder ? "test" : "production", is_demo: invoiceContext.testOrder, updated_at: new Date().toISOString() }) });
  if (!rows?.[0]?.id) throw coded("COMMERCIAL_INVOICE_CREATE_FAILED", 502, "De factuur kon niet worden aangemaakt.");
  return rows[0];
}

async function ensureMolliePayment(context, invoice, customer, commercial, payment, claim) {
  if (clean(invoice.mollie_payment_id) && clean(invoice.mollie_checkout_url) && !["failed", "expired", "canceled"].includes(clean(invoice.mollie_payment_status))) return { paymentId: invoice.mollie_payment_id, checkoutUrl: invoice.mollie_checkout_url, reused: true };
  const config = mollieConfig();
  const response = await fetch("https://api.mollie.com/v2/payments", { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": `commercial-offer-${claim.offerVersionId}` }, body: JSON.stringify({ amount: { currency: "EUR", value: payment.total.toFixed(2) }, description: `${invoice.invoice_number} - ${customer.company || customer.name}`.slice(0, 255), redirectUrl: `${config.siteUrl}/bedankt.html?order=${encodeURIComponent(orderId(claim.offerVersionId))}&invoice=${invoice.id}`, webhookUrl: `${config.siteUrl}/.netlify/functions/mollie-webhook`, metadata: { source: "commercial_order", orderId: orderId(claim.offerVersionId), invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, customerReference: clean(customer.email).toLowerCase(), environment: config.testMode ? "test" : "live", testOrder: config.testMode ? "true" : "false", paymentChoice: object(commercial.version.snapshot).paymentChoice === "full" ? "full" : "deposit", commercialOfferId: claim.offerId, commercialOfferVersionId: claim.offerVersionId } }) });
  const data = await response.json().catch(() => ({})); const checkoutUrl = clean(data?._links?.checkout?.href);
  if (!response.ok || !clean(data.id) || !checkoutUrl) throw coded("COMMERCIAL_MOLLIE_CREATE_FAILED", 502, "Mollie kon geen geldige betaallink aanmaken.");
  await rest(context.url, context.service, `invoices?id=eq.${invoice.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ mollie_payment_id: data.id, mollie_checkout_url: checkoutUrl, payment_link: checkoutUrl, mollie_payment_status: clean(data.status || "open"), mollie_payment_created_at: clean(data.createdAt) || new Date().toISOString(), mollie_payment_expires_at: clean(data.expiresAt) || null, status: "sent", updated_at: new Date().toISOString() }) });
  return { paymentId: data.id, checkoutUrl, reused: false };
}

async function sendPaymentRequest(context, invoice, customer, payment, mollie, claim) {
  if (invoice.email_sent_at) return { sent: true, reused: true };
  const company = getCompanySettings();
  const firstName = clean(customer.name).split(/\s+/)[0] || "daar";
  const amount = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(payment.total);
  const siteUrl = clean(process.env.SITE_URL || process.env.URL).replace(/\/$/, "");
  const invoiceUrl = `${siteUrl}/factuur.html?supabaseInvoiceId=${encodeURIComponent(invoice.id)}`;
  const text = [
    `Hallo ${firstName},`,
    "",
    "Bedankt voor het ondertekenen van de offerte. De opdracht is veilig geregistreerd en je klantportaal is klaargezet.",
    `De ${object(invoice).title || "factuur"} van ${amount} staat klaar. Rond de betaling af via de beveiligde Mollie-link hieronder.`,
    "Na ontvangst van de betaling wordt de opdracht automatisch vrijgegeven aan productie.",
    "",
    `Betaallink: ${mollie.checkoutUrl}`,
    `Factuur bekijken: ${invoiceUrl}`,
    "",
    `Met vriendelijke groet,\n${company.companyName}`,
  ].join("\n");
  const result = await sendEmail({
    to: clean(customer.email).toLowerCase(),
    bcc: clean(process.env.ADMIN_EMAIL) || undefined,
    subject: `Aanbetaling voor je opdracht bij ${company.companyName}`,
    text,
    html: paymentEmailHtml(company.companyName, firstName, amount, mollie.checkoutUrl, invoiceUrl),
    templateKey: "commercial_offer_payment_request",
    templateName: "Betaalverzoek na ondertekende offerte",
    customerId: customer.id,
    invoiceId: invoice.id,
    triggeredBy: "commercial_offer_signhost_postback",
    metadata: { offerId: claim.offerId, offerVersionId: claim.offerVersionId, fulfilmentRunId: claim.runId },
    idempotencyKey: `commercial-offer-payment-request:${claim.offerVersionId}`,
  });
  if (!result.sent) throw coded("COMMERCIAL_PAYMENT_EMAIL_FAILED", 502, "De betaallink is aangemaakt, maar de betaalmail kon niet worden verzonden.");
  await rest(context.url, context.service, `invoices?id=eq.${invoice.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  return result;
}

function paymentEmailHtml(companyName, firstName, amount, checkoutUrl, invoiceUrl) {
  return `<div style="margin:0;padding:0;background:#07111f;color:#eaf1ff;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:32px 20px"><div style="border:1px solid rgba(255,255,255,.12);border-radius:18px;background:#0b1728;padding:28px"><p style="margin:0 0 10px;color:#45e0bd;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">${escapeHtml(companyName)}</p><h1 style="margin:0 0 20px;color:#fff;font-size:28px">Je opdracht is ondertekend</h1><p style="color:#d7e3f7;line-height:1.7">Hallo ${escapeHtml(firstName)},</p><p style="color:#d7e3f7;line-height:1.7">Bedankt voor het ondertekenen. Je betaalverzoek van <strong style="color:#fff">${escapeHtml(amount)}</strong> staat klaar. Na betaling geven we de opdracht automatisch vrij aan productie.</p><p style="margin:26px 0"><a href="${escapeHtml(checkoutUrl)}" style="display:inline-block;background:#45e0bd;color:#07111f;text-decoration:none;border-radius:10px;padding:13px 20px;font-weight:800">Veilig betalen via Mollie</a></p><p style="margin:0 0 18px"><a href="${escapeHtml(invoiceUrl)}" style="color:#8edcf5;text-decoration:underline">Bekijk de volledige factuur</a></p><p style="color:#91a4bf;font-size:13px;line-height:1.6">Werkt de knop niet? Kopieer deze link:<br>${escapeHtml(checkoutUrl)}</p></div></div></div>`;
}

async function finalize(context, runId, status, values = {}) { const result = await rpc(context, "commercial_finalize_fulfilment_v1", { input_run_id: runId, input_status: status, input_customer_id: values.customerId || null, input_invoice_id: values.invoiceId || null, input_project_id: values.projectId || null, input_factory_project_id: values.factoryProjectId || null, input_error_code: values.errorCode || null }); return { ...result, checkoutUrl: values.checkoutUrl || "", paymentId: values.paymentId || "" }; }
async function fetchOne(context, route) { return (await rest(context.url, context.service, route))?.[0] || null; }
async function rpc(context, name, body) { const response = await fetch(`${context.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: context.service, Authorization: `Bearer ${context.service}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw coded(clean(data.code || "COMMERCIAL_RPC_FAILED"), response.status, clean(data.message || "De commerciële automatisering kon niet worden verwerkt.")); return data; }
function mollieConfig() { const mode = clean(process.env.MOLLIE_MODE || "test").toLowerCase(); const apiKey = mode === "test" ? clean(process.env.MOLLIE_TEST_API_KEY || process.env.MOLLIE_API_KEY) : clean(process.env.MOLLIE_API_KEY); const testMode = apiKey.startsWith("test_"); const liveAllowed = clean(process.env.MOLLIE_ALLOW_LIVE_PAYMENTS).toLowerCase() === "true"; const siteUrl = clean(process.env.SITE_URL || process.env.URL).replace(/\/$/, ""); if (!apiKey || !siteUrl) throw coded("COMMERCIAL_MOLLIE_CONFIG_MISSING", 503, "De Mollie-configuratie ontbreekt."); if ((!testMode || mode !== "test") && !liveAllowed) throw coded("COMMERCIAL_MOLLIE_LIVE_BLOCKED", 403, "Live betalingen zijn nog niet vrijgegeven."); return { apiKey, mode, testMode, siteUrl }; }
function assertEnabled() { if (clean(process.env.COMMERCIAL_OFFER_POST_SIGNATURE_ENABLED).toLowerCase() !== "true") throw coded("COMMERCIAL_POST_SIGNATURE_DISABLED", 403, "De automatisering na ondertekening is nog niet geactiveerd."); }
function packageLabel(snapshot = {}) { return (Array.isArray(snapshot.lines) ? snapshot.lines : []).filter((line) => line.componentType === "one_time").map((line) => clean(line.productName)).filter(Boolean).slice(0, 3).join(" + ") || "Max Webstudio opdracht"; }
function invoiceLines(snapshot, payment, paymentChoice) { const label = paymentChoice === "full" ? `Volledige betaling ${packageLabel(snapshot)}` : `Aanbetaling ${packageLabel(snapshot)}`; const vatRate = payment.subtotal > 0 ? Math.round((payment.vat / payment.subtotal) * 10000) / 100 : 0; return [{ description: label, quantity: 1, unitPrice: payment.subtotal, vatRate, subtotal: payment.subtotal, vat: payment.vat, total: payment.total }]; }
function orderId(versionId) { return `signed_offer_${clean(versionId).replace(/-/g, "")}`.slice(0, 90); }
function integer(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : 0; }
function euros(cents) { return Math.round(integer(cents)) / 100; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value)); }
function safeCode(error) { return clean(error?.code || "commercial_fulfilment_failed").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 120); }
function clean(value) { return String(value ?? "").trim(); }
function escapeHtml(value) { return clean(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
function coded(code, status, message) { return Object.assign(new Error(message), { code, status }); }
module.exports = { fulfilSignedCommercialOffer, _private: { paymentAmounts, packageLabel, invoiceLines, orderId, mollieConfig, safeCode } };
