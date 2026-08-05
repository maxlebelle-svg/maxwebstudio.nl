const crypto = require("node:crypto");
const { rest } = require("./partnerOnboardingAccessService");
const { createCommercialOfferReturnToken } = require("./signhostService");

async function fulfilSignedCommercialOffer(context, providerTransactionId, providerStatus) {
  assertEnabled();
  const claim = await rpc(context, "commercial_claim_signed_fulfilment_v1", {
    input_provider_transaction_id: clean(providerTransactionId),
    input_provider_status: Number(providerStatus),
  });
  if (claim.duplicate || !["processing", "pending", "failed"].includes(clean(claim.status))) return claim;
  try {
    const commercial = await loadCommercialContext(context, claim.offerVersionId);
    const identity = relationshipIdentity(commercial.relationship);
    const profile = await ensureProfile(context, identity, commercial, claim);
    const customer = await ensureCustomer(context, identity, profile, commercial, claim);
    await convertLeadIfNeeded(context, commercial, customer.id);
    const factoryProject = await prepareFactoryHandover(context, commercial, customer.id, claim);
    const payment = paymentAmounts(commercial.version);
    if (payment.totalCents <= 0) {
      return finalize(context, claim.runId, "ready_for_production", {
        customerId: customer.id,
        factoryProjectId: factoryProject?.id || null,
      });
    }
    let invoice = claim.invoiceId
      ? await fetchOne(context, `invoices?select=*&id=eq.${encodeURIComponent(claim.invoiceId)}&limit=1`)
      : await ensureInvoice(context, identity, customer, commercial, payment, claim);
    const paymentConfig = mollieConfig();
    if (invoice && !invoiceMatchesMollieEnvironment(invoice, paymentConfig)) {
      invoice = await ensureInvoice(context, identity, customer, commercial, payment, claim);
    }
    const mollie = await ensureMolliePayment(context, invoice, identity, commercial, payment, claim);
    return finalize(context, claim.runId, "payment_pending", {
      customerId: customer.id,
      invoiceId: invoice.id,
      factoryProjectId: factoryProject?.id || null,
      checkoutUrl: mollie.checkoutUrl,
      paymentId: mollie.paymentId,
    });
  } catch (error) {
    await finalize(context, claim.runId, "failed", { errorCode: safeCode(error) }).catch(() => {});
    throw error;
  }
}

async function loadCommercialContext(context, offerVersionId) {
  const version = await fetchOne(context, `commercial_offer_versions?select=*&id=eq.${encodeURIComponent(offerVersionId)}&limit=1`);
  if (!version) throw coded("COMMERCIAL_VERSION_MISSING", 409, "De ondertekende offerteversie ontbreekt.");
  const offer = await fetchOne(context, `commercial_offers?select=*&id=eq.${encodeURIComponent(version.offer_id)}&limit=1`);
  if (!offer || offer.current_version_id !== version.id) throw coded("COMMERCIAL_OFFER_SUPERSEDED", 409, "De ondertekende offerte is niet meer de actuele versie.");
  const table = offer.relationship_type === "lead" ? "leads" : "customers";
  const relationship = await fetchOne(context, `${table}?select=*&id=eq.${encodeURIComponent(offer.relationship_id)}&limit=1`);
  if (!relationship) throw coded("COMMERCIAL_RELATIONSHIP_MISSING", 409, "De relatie bij de ondertekende offerte ontbreekt.");
  return { version, offer, relationship };
}

function relationshipIdentity(row = {}) {
  const metadata = object(row.metadata);
  const email = clean(row.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw coded("COMMERCIAL_CUSTOMER_EMAIL_INVALID", 409, "Het e-mailadres van de klant is ongeldig.");
  return {
    name: clean(row.contact_name || row.name || metadata.contactName || row.company_name || row.company),
    company: clean(row.company_name || row.company || metadata.companyName || row.name),
    email,
    phone: clean(row.phone || metadata.phone),
    website: clean(row.website || row.website_url || metadata.website),
  };
}

async function ensureProfile(context, identity, commercial, claim) {
  const existing = await fetchOne(context, `profiles?select=*&email=eq.${encodeURIComponent(identity.email)}&limit=1`);
  const metadata = {
    ...object(existing?.metadata),
    commercialOrderStatus: "signed_payment_pending",
    latestCommercialOrderId: orderId(claim.offerVersionId),
    commercialOfferId: claim.offerId,
    commercialOfferVersionId: claim.offerVersionId,
    portalAccessStatus: existing?.auth_user_id ? "active" : "prepared",
  };
  return upsert(context, "profiles", {
    id: existing?.id,
    auth_user_id: existing?.auth_user_id || null,
    name: existing?.name || identity.name || identity.company,
    company: existing?.company || identity.company,
    email: identity.email,
    phone: existing?.phone || identity.phone,
    website: existing?.website || identity.website,
    package: existing?.package || packageLabel(commercial.version.snapshot),
    role: existing?.role || "customer",
    status: existing?.status || "pending",
    metadata,
    updated_at: new Date().toISOString(),
  });
}

async function ensureCustomer(context, identity, profile, commercial, claim) {
  const relationshipCustomer = commercial.offer.relationship_type === "customer" ? commercial.relationship : null;
  const existing = relationshipCustomer || await fetchOne(context, `customers?select=*&profile_id=eq.${encodeURIComponent(profile.id)}&limit=1`)
    || await fetchOne(context, `customers?select=*&email=eq.${encodeURIComponent(identity.email)}&limit=1`);
  return upsert(context, "customers", {
    id: existing?.id,
    profile_id: profile.id,
    auth_user_id: existing?.auth_user_id || profile.auth_user_id || null,
    name: existing?.name || identity.name || identity.company,
    company: existing?.company || existing?.company_name || identity.company,
    email: identity.email,
    phone: existing?.phone || identity.phone,
    website: existing?.website || identity.website,
    package: existing?.package || packageLabel(commercial.version.snapshot),
    status: existing?.status || "onboarding",
    portal_status: existing?.auth_user_id || profile.auth_user_id ? "active" : "prepared",
    metadata: {
      ...object(existing?.metadata),
      commercialOrderStatus: "signed_payment_pending",
      latestCommercialOrderId: orderId(claim.offerVersionId),
      commercialOfferId: claim.offerId,
      commercialOfferVersionId: claim.offerVersionId,
      productionHandoverStatus: commercial.offer.factory_project_id ? "prepared" : "not_linked",
    },
    updated_at: new Date().toISOString(),
  });
}

async function convertLeadIfNeeded(context, commercial, customerId) {
  if (commercial.offer.relationship_type !== "lead") return;
  await rest(context.url, context.service, `leads?id=eq.${encodeURIComponent(commercial.offer.relationship_id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ converted_customer_id: customerId, status: "converted", converted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
}

async function prepareFactoryHandover(context, commercial, customerId, claim) {
  const id = clean(commercial.offer.factory_project_id);
  if (!id) return null;
  const factory = await fetchOne(context, `factory_projects?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!factory) throw coded("FACTORY_PROJECT_MISSING", 409, "Het gekoppelde Factory-dossier ontbreekt.");
  const configuration = {
    ...object(factory.configuration),
    commercialOffer: {
      ...object(factory.configuration?.commercialOffer),
      offerId: claim.offerId,
      offerVersionId: claim.offerVersionId,
      customerId,
      signatureStatus: "signed",
      paymentStatus: "pending",
      handoverPreparedAt: new Date().toISOString(),
    },
  };
  const nextStatus = ["intake", "paused"].includes(clean(factory.status)) ? "ready" : factory.status;
  const rows = await rest(context.url, context.service, `factory_projects?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      relationship_type: "customer",
      relationship_id: customerId,
      status: nextStatus,
      configuration,
      updated_at: new Date().toISOString(),
    }),
  });
  return rows?.[0] || factory;
}

function paymentAmounts(version = {}) {
  const totalCents = integer(version.due_now_incl_vat_cents);
  const subtotalCents = integer(version.due_now_ex_vat_cents);
  const vatCents = Math.max(0, totalCents - subtotalCents);
  return { totalCents, subtotalCents, vatCents, total: euros(totalCents), subtotal: euros(subtotalCents), vat: euros(vatCents) };
}

async function ensureInvoice(context, identity, customer, commercial, payment, claim) {
  const snapshot = object(commercial.version.snapshot);
  const paymentChoice = snapshot.paymentChoice === "full" ? "full" : "deposit";
  const remainingAmount = euros(integer(snapshot.remainingExVatCents) + Math.round(integer(snapshot.remainingExVatCents) * Number(snapshot.vatRate || 21) / 100));
  const invoiceNumber = `OFF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${claim.offerVersionId.slice(0, 8).toUpperCase()}`;
  const contextData = {
    source: "commercial_order",
    environment: mollieConfig().testMode ? "test" : "live",
    testOrder: mollieConfig().testMode,
    orderId: orderId(claim.offerVersionId),
    customerId: customer.id,
    customerName: identity.name,
    customerCompany: identity.company,
    customerEmail: identity.email,
    packageLabel: packageLabel(snapshot),
    paymentChoice,
    remainingAmount,
    commercialOfferId: claim.offerId,
    commercialOfferVersionId: claim.offerVersionId,
    signedAt: new Date().toISOString(),
    terms: { source: "signed_commercial_offer", acceptedAt: new Date().toISOString() },
    lines: (Array.isArray(snapshot.lines) ? snapshot.lines : []).map((line) => ({
      description: clean(line.productName), quantity: integer(line.quantity) || 1,
      unitPrice: euros(integer(line.unitExVatCents)), vatRate: Number(line.vatRate || snapshot.vatRate || 21), billingType: line.componentType,
    })),
  };
  const rows = await rest(context.url, context.service, "invoices", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      customer_id: customer.id,
      invoice_number: invoiceNumber,
      title: paymentChoice === "full" ? "Opdrachtbevestiging Max Webstudio" : "Aanbetaling ondertekende opdracht",
      subtotal: payment.subtotal,
      vat: payment.vat,
      total: payment.total,
      status: "draft",
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      notes: `Ondertekende offerte ${claim.offerVersionId}.\n---\nFactuurregels: ${JSON.stringify(contextData)}`,
      metadata: { commercialOfferId: claim.offerId, commercialOfferVersionId: claim.offerVersionId, fulfilmentRunId: claim.runId },
      environment: contextData.environment === "test" ? "test" : "production",
      is_demo: contextData.testOrder,
      updated_at: new Date().toISOString(),
    }),
  });
  const invoice = rows?.[0];
  if (!invoice?.id) throw coded("COMMERCIAL_INVOICE_CREATE_FAILED", 502, "De aanbetalingsfactuur kon niet worden aangemaakt.");
  return invoice;
}

async function ensureMolliePayment(context, invoice, identity, commercial, payment, claim) {
  const config = mollieConfig();
  if (invoiceMatchesMollieEnvironment(invoice, config) && clean(invoice.mollie_payment_id) && clean(invoice.mollie_checkout_url) && !["failed", "expired", "canceled"].includes(clean(invoice.mollie_payment_status))) {
    return { paymentId: invoice.mollie_payment_id, checkoutUrl: invoice.mollie_checkout_url, reused: true };
  }
  const response = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      amount: { currency: "EUR", value: payment.total.toFixed(2) },
      description: `${invoice.invoice_number} - ${identity.company || identity.name}`.slice(0, 255),
      redirectUrl: `${config.siteUrl}/betaling-verwerken?status=${encodeURIComponent(createCommercialOfferReturnToken(claim.signingId))}`,
      webhookUrl: `${config.siteUrl}/.netlify/functions/mollie-webhook`,
      metadata: {
        source: "commercial_order", orderId: orderId(claim.offerVersionId), invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number, customerReference: identity.email,
        environment: config.testMode ? "test" : "live", testOrder: config.testMode ? "true" : "false",
        paymentChoice: object(commercial.version.snapshot).paymentChoice === "full" ? "full" : "deposit",
        commercialOfferId: claim.offerId, commercialOfferVersionId: claim.offerVersionId,
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  const checkoutUrl = clean(data?._links?.checkout?.href);
  if (!response.ok || !clean(data.id) || !checkoutUrl) throw coded("COMMERCIAL_MOLLIE_CREATE_FAILED", 502, "Mollie kon geen geldige betaallink aanmaken.");
  await rest(context.url, context.service, `invoices?id=eq.${encodeURIComponent(invoice.id)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
      mollie_payment_id: data.id, mollie_checkout_url: checkoutUrl, payment_link: checkoutUrl,
      mollie_payment_status: clean(data.status || "open"), mollie_payment_created_at: clean(data.createdAt) || new Date().toISOString(),
      mollie_payment_expires_at: clean(data.expiresAt) || null, status: "sent", updated_at: new Date().toISOString(),
    }),
  });
  return { paymentId: data.id, checkoutUrl, reused: false };
}

async function finalize(context, runId, status, values = {}) {
  const result = await rpc(context, "commercial_finalize_fulfilment_v1", {
    input_run_id: runId,
    input_status: status,
    input_customer_id: values.customerId || null,
    input_invoice_id: values.invoiceId || null,
    input_project_id: values.projectId || null,
    input_factory_project_id: values.factoryProjectId || null,
    input_error_code: values.errorCode || null,
  });
  return { ...result, checkoutUrl: values.checkoutUrl || "", paymentId: values.paymentId || "" };
}

async function fetchOne(context, route) { return (await rest(context.url, context.service, route))?.[0] || null; }
async function upsert(context, table, record) {
  const payload = { ...record }; if (!payload.id) delete payload.id;
  const rows = await rest(context.url, context.service, `${table}?on_conflict=id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload) });
  if (!rows?.[0]) throw coded("COMMERCIAL_RECORD_WRITE_FAILED", 502, `${table} kon niet worden opgeslagen.`);
  return rows[0];
}
async function rpc(context, name, body) {
  const response = await fetch(`${context.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: context.service, Authorization: `Bearer ${context.service}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw coded(clean(data.code || "COMMERCIAL_RPC_FAILED"), response.status, clean(data.message || "De commerciële automatisering kon niet worden verwerkt."));
  return data;
}

function mollieConfig() {
  const mode = clean(process.env.MOLLIE_MODE || "test").toLowerCase();
  const apiKey = mode === "test" ? clean(process.env.MOLLIE_TEST_API_KEY || process.env.MOLLIE_API_KEY) : clean(process.env.MOLLIE_API_KEY);
  const testMode = apiKey.startsWith("test_");
  const liveAllowed = clean(process.env.MOLLIE_ALLOW_LIVE_PAYMENTS).toLowerCase() === "true";
  const siteUrl = clean(process.env.SITE_URL || process.env.URL).replace(/\/$/, "");
  if (!apiKey || !siteUrl) throw coded("COMMERCIAL_MOLLIE_CONFIG_MISSING", 503, "De Mollie-configuratie voor ondertekende offertes ontbreekt.");
  if ((!testMode || mode !== "test") && !liveAllowed) throw coded("COMMERCIAL_MOLLIE_LIVE_BLOCKED", 403, "Live betalingen zijn nog niet vrijgegeven.");
  return { apiKey, mode, testMode, siteUrl };
}
function invoiceMatchesMollieEnvironment(invoice = {}, config = {}) {
  const environment = clean(invoice.environment).toLowerCase();
  const invoiceIsTest = invoice.is_demo === true || environment === "test";
  return config.testMode ? invoiceIsTest : !invoiceIsTest && ["production", "live"].includes(environment);
}
function assertEnabled() { if (clean(process.env.COMMERCIAL_OFFER_POST_SIGNATURE_ENABLED).toLowerCase() !== "true") throw coded("COMMERCIAL_POST_SIGNATURE_DISABLED", 403, "De automatisering na ondertekening is nog niet geactiveerd."); }
function packageLabel(snapshot = {}) { const names = (Array.isArray(snapshot.lines) ? snapshot.lines : []).filter((line) => line.componentType === "one_time").map((line) => clean(line.productName)).filter(Boolean); return names.slice(0, 3).join(" + ") || "Max Webstudio opdracht"; }
function invoiceLines(snapshot, payment, paymentChoice) {
  const label = paymentChoice === "full" ? `Volledige betaling ${packageLabel(snapshot)}` : `Aanbetaling ${packageLabel(snapshot)}`;
  const vatRate = payment.subtotal > 0 ? Math.round((payment.vat / payment.subtotal) * 10000) / 100 : 0;
  return [{
    description: label,
    quantity: 1,
    unitPrice: payment.subtotal,
    vatRate,
    subtotal: payment.subtotal,
    vat: payment.vat,
    total: payment.total,
  }];
}
function orderId(versionId) { return `signed_offer_${clean(versionId).replace(/-/g, "")}`.slice(0, 90); }
function integer(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : 0; }
function euros(cents) { return Math.round(integer(cents)) / 100; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clean(value) { return String(value ?? "").trim(); }
function safeCode(error) { return clean(error?.code || "commercial_fulfilment_failed").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 120); }
function coded(code, status, message) { return Object.assign(new Error(message), { code, status }); }

module.exports = {
  fulfilSignedCommercialOffer,
  _private: { paymentAmounts, relationshipIdentity, packageLabel, invoiceLines, orderId, mollieConfig, invoiceMatchesMollieEnvironment, safeCode },
};
