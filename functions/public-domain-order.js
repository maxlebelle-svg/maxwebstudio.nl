const dns = require("node:dns").promises;
const crypto = require("node:crypto");
const domainRequests = require("./services/domainRequestService");
const registrar = require("./services/domainRegistrarService");
const { notifyAdminOfDomainReservation } = require("./services/domainReservationNotificationService");
const { createDomainPayment, offerForDomain } = require("./services/domainPaymentService");
const { prepareAbuseControlRequest, runLeadIntakeAbuseGate } = require("./services/leadIntakeAbuseControl");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 32 * 1024;

exports.handler = async (event = {}) => {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  if (event.httpMethod !== "POST") return response(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
  if (Buffer.byteLength(event.body || "", "utf8") > MAX_BODY_BYTES) return response(413, { success: false, error: "De aanvraag is te groot." });
  try {
    const input = domainRequests.parsePayload(event.body);
    const domainName = domainRequests.normalizeDomain(input.domainName);
    if (!validDomain(domainName)) return response(400, { success: false, error: "Vul een geldige domeinnaam in." });
    const context = domainRequests.contextFromEnv();
    if (input.action === "check") return response(200, { success: true, check: await checkAvailability(context, domainName) });
    if (input.action !== "reserve") return response(400, { success: false, error: "Onbekende domeinactie." });
    if (String(input.website || "").trim()) return response(200, { success: true, accepted: false });
    const order = validateOrder(input, domainName);
    const availability = await checkAvailability(context, domainName);
    if (availability.definitive && !availability.available) throw conflictError("Deze domeinnaam is niet beschikbaar voor registratie.");
    const requestId = UUID.test(String(input.requestId || "")) ? String(input.requestId) : crypto.randomUUID();
    const references = prepareAbuseControlRequest(event, `lead-intake:v1:${requestId}`, process.env);
    const result = await runLeadIntakeAbuseGate({
      supabaseUrl: context.supabaseUrl,
      serviceRoleKey: context.serviceRoleKey,
      references,
      onAllowed: () => persistReservation(context, order, requestId),
    });
    let payment = { created: false, supported: false, offer: offerForDomain(order.domainName) };
    try {
      payment = await createDomainPayment({ request: result.request, customer: result.customer, order });
    } catch (paymentError) {
      console.error("Domain reservation payment automation failed", { code: safe(paymentError.code), message: safe(paymentError.message) });
      payment = { created: false, supported: true, offer: offerForDomain(order.domainName), warning: "De reservering is opgeslagen; de betaallink wordt handmatig nagekeken." };
    }
    try {
      await notifyAdminOfDomainReservation({ request: result.request, customer: result.customer, order, payment });
    } catch (notificationError) {
      console.error("Domain reservation admin notification failed", { code: safe(notificationError.code), message: safe(notificationError.message) });
    }
    return response(result.idempotent ? 200 : 201, {
      success: true,
      accepted: true,
      orderReference: result.request.id,
      domainName: result.request.domainName,
      status: result.request.status,
      idempotent: Boolean(result.idempotent),
      payment: publicPayment(payment),
      message: payment.created
        ? `Je domeinreservering is ontvangen. De betaallink voor ${payment.offer.label} inclusief btw is per e-mail verstuurd.`
        : availability.definitive
        ? "Je domeinreservering is ontvangen. De registrar heeft de beschikbaarheid bevestigd; we sturen je de betaallink voordat we registreren."
        : "Je domeinreservering is ontvangen. We controleren beschikbaarheid en de definitieve prijs voordat je betaalt.",
    });
  } catch (error) {
    const status = error.statusCode || error.status || 500;
    console.error("Public domain order failed", { status, code: safe(error.code), message: safe(error.message) });
    const message = status === 429 ? "Te veel aanvragen. Probeer het later opnieuw."
      : status === 409 ? "Deze domeinnaam is al gereserveerd of wordt al verwerkt."
        : status < 500 ? error.message : "Je domeinreservering kon niet veilig worden verwerkt.";
    return response(status, { success: false, error: message });
  }
};

async function checkAvailability(context, domainName) {
  let registrarStatus = "not_configured";
  let registrarCode = null;
  const [domainAsset, openRequest] = await Promise.all([
    fetchOne(context, "domains", "id", `domain_name=eq.${encodeURIComponent(domainName)}`).catch(() => null),
    fetchOne(context, "domain_requests", "id,status", `domain_name=eq.${encodeURIComponent(domainName)}&status=not.in.(active,failed,cancelled)`).catch(() => null),
  ]);
  const reserved = Boolean(domainAsset || openRequest);
  if (reserved) return {
    domainName, state: "registered_or_reserved", available: false, possiblyAvailable: false, definitive: true,
    provider: "maxwebstudio", label: "Niet beschikbaar", note: "Deze domeinnaam is al geregistreerd of staat bij Max Webstudio in behandeling.",
  };
  try {
    const providerCheck = await registrar.checkDomain(domainName);
    registrarStatus = providerCheck.configured ? "connected" : "not_configured";
    if (providerCheck.configured) return {
      domainName,
      state: providerCheck.available ? "available" : "unavailable",
      available: providerCheck.available,
      possiblyAvailable: providerCheck.available,
      definitive: true,
      provider: providerCheck.provider,
      premium: providerCheck.premium,
      offer: offerForDomain(domainName),
      label: providerCheck.available ? "Beschikbaar" : "Niet beschikbaar",
      note: providerCheck.available
        ? `Beschikbaarheid bevestigd door Openprovider${providerCheck.premium ? " · premium domein" : ""}.`
        : "Openprovider bevestigt dat deze domeinnaam niet beschikbaar is voor registratie.",
    };
  } catch (error) {
    registrarStatus = safeRegistrarStatus(error.code);
    registrarCode = Number.isInteger(error.externalCode) ? error.externalCode : null;
    console.error("Registrar availability check failed", { code: safe(error.code), message: safe(error.message) });
  }
  const dnsFound = await hasDns(domainName);
  return {
    domainName,
    state: reserved || dnsFound ? "registered_or_reserved" : "possibly_available",
    available: false,
    possiblyAvailable: !reserved && !dnsFound,
    definitive: false,
    provider: "preliminary",
    offer: offerForDomain(domainName),
    registrarStatus,
    ...(registrarCode !== null ? { registrarCode } : {}),
    label: reserved || dnsFound ? "Waarschijnlijk niet beschikbaar" : "Voorlopig beschikbaar",
    note: reserved || dnsFound
      ? "Deze domeinnaam heeft al DNS. De registrarcontrole is nog niet beschikbaar."
      : "De voorlopige controle vond geen registratie. De registrarcontrole moet nog worden gekoppeld of is tijdelijk niet bereikbaar.",
  };
}

async function persistReservation(context, order, requestId) {
  const profile = await ensureProfile(context, order, requestId);
  const customer = await ensureCustomer(context, order, profile, requestId);
  const existing = (await domainRequests.listRequests(context, customer.id)).find((item) => item.domainName === order.domainName && !["active", "failed", "cancelled"].includes(item.status));
  if (existing) return { request: existing, customer, idempotent: true };
  const created = await domainRequests.createRequest(context, {
    customerId: customer.id,
    requestType: "registration",
    domainName: order.domainName,
    alternativeDomains: order.alternativeDomains,
    note: `Publieke Netlify-reservering ${requestId}. Controleer beschikbaarheid en definitieve prijs vóór betaling.`,
  }, {});
  const request = await domainRequests.saveCustomerInput(context, customer, {
    action: "submit",
    requestId: created.id,
    customerPayload: {
      holderType: order.holderType,
      holderName: order.holderName,
      companyName: order.companyName,
      address: order.address,
      postalCode: order.postalCode,
      city: order.city,
      country: order.country,
      phone: order.phone,
      email: order.email,
      dnsScope: "full_dns",
      autoRenew: order.autoRenew,
      approval: true,
      notes: order.notes,
    },
  }, {});
  return { request, customer, idempotent: false };
}

function validateOrder(input, domainName) {
  const value = {
    domainName,
    alternativeDomains: Array.isArray(input.alternativeDomains) ? input.alternativeDomains : [],
    holderType: input.holderType === "person" ? "person" : "company",
    holderName: text(input.holderName, 240),
    companyName: text(input.companyName, 240),
    email: text(input.email, 320).toLowerCase(),
    phone: text(input.phone, 80),
    address: text(input.address, 300),
    postalCode: text(input.postalCode, 40),
    city: text(input.city, 120),
    country: text(input.country || "Nederland", 120),
    notes: text(input.notes, 1200),
    autoRenew: input.autoRenew === true,
    termsAccepted: input.termsAccepted === true,
  };
  if (!value.holderName || !value.email || !value.phone || !value.address || !value.postalCode || !value.city) throw clientError("Vul alle verplichte contact- en houdergegevens in.");
  if (!EMAIL.test(value.email)) throw clientError("Vul een geldig e-mailadres in.");
  if (value.holderType === "company" && !value.companyName) throw clientError("Vul de officiële bedrijfsnaam in.");
  if (!value.termsAccepted) throw clientError("Accepteer de voorwaarden en geef toestemming voor de domeincontrole.");
  return value;
}

async function ensureProfile(context, order, requestId) {
  const existing = await fetchOne(context, "profiles", "id,auth_user_id,name,company,email,phone,role,status,metadata", `email=eq.${encodeURIComponent(order.email)}`);
  const record = {
    id: existing?.id || undefined,
    auth_user_id: existing?.auth_user_id || null,
    name: order.holderName,
    company: order.companyName || order.holderName,
    email: order.email,
    phone: order.phone,
    role: existing?.role || "customer",
    status: existing?.status || "pending",
    metadata: { ...(existing?.metadata || {}), domainOrderStatus: "review_pending", latestDomainOrderReference: requestId },
    updated_at: new Date().toISOString(),
  };
  return upsert(context, "profiles", record);
}

async function ensureCustomer(context, order, profile, requestId) {
  const existing = await fetchOne(context, "customers", "id,profile_id,auth_user_id,name,company,email,phone,status,portal_status,metadata", `profile_id=eq.${encodeURIComponent(profile.id)}`)
    || await fetchOne(context, "customers", "id,profile_id,auth_user_id,name,company,email,phone,status,portal_status,metadata", `email=eq.${encodeURIComponent(order.email)}`);
  return upsert(context, "customers", {
    id: existing?.id || undefined,
    profile_id: profile.id,
    auth_user_id: existing?.auth_user_id || profile.auth_user_id || null,
    name: order.holderName,
    company: order.companyName || order.holderName,
    email: order.email,
    phone: order.phone,
    status: existing?.status || "onboarding",
    portal_status: existing?.portal_status || "prepared",
    metadata: { ...(existing?.metadata || {}), domainOrderStatus: "review_pending", latestDomainOrderReference: requestId },
    updated_at: new Date().toISOString(),
  });
}

async function hasDns(domainName) {
  try {
    const records = await Promise.race([dns.resolveNs(domainName), new Promise((resolve) => setTimeout(() => resolve([]), 2500))]);
    return Array.isArray(records) && records.length > 0;
  } catch { return false; }
}

async function fetchOne(context, table, select, filter) {
  const rows = await rest(context, `${table}?select=${encodeURIComponent(select)}&${filter}&limit=1`);
  return rows?.[0] || null;
}
async function upsert(context, table, record) {
  const payload = { ...record }; if (!payload.id) delete payload.id;
  const rows = await rest(context, `${table}?on_conflict=id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload) });
  if (!rows?.[0]) throw new Error("Klantgegevens konden niet worden opgeslagen.");
  return rows[0];
}
async function rest(context, path, options = {}) {
  const response = await fetch(`${context.supabaseUrl}/rest/v1/${path}`, { ...options, headers: { apikey: context.serviceRoleKey, Authorization: `Bearer ${context.serviceRoleKey}`, Accept: "application/json", "Content-Type": "application/json", "Accept-Profile": "public", "Content-Profile": "public", ...(options.headers || {}) } });
  const data = await response.json().catch(() => null);
  if (!response.ok) { const error = new Error(data?.message || "Platformdata kon niet worden verwerkt."); error.statusCode = response.status; error.code = data?.code; throw error; }
  return data;
}
function validDomain(value) { return /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value); }
function text(value, max) { return String(value || "").trim().slice(0, max); }
function safe(value) { return String(value || "").replace(/[\r\n]/g, " ").slice(0, 160); }
function publicPayment(payment = {}) {
  return {
    created: Boolean(payment.created),
    supported: Boolean(payment.supported),
    checkoutUrl: payment.created ? safeCheckoutUrl(payment.checkoutUrl) : "",
    offer: payment.offer || null,
    emailSent: Boolean(payment.emailSent),
  };
}
function safeCheckoutUrl(value) { try { const url = new URL(String(value || "")); return url.protocol === "https:" && /(^|\.)mollie\.com$/i.test(url.hostname) ? url.toString() : ""; } catch { return ""; } }
function safeRegistrarStatus(value) { const allowed = new Set(["registrar_access_denied", "registrar_api_disabled", "registrar_2fa_required", "registrar_credentials_rejected", "registrar_contract_required", "registrar_check_failed", "registrar_invalid_response", "registrar_unavailable"]); return allowed.has(value) ? value : "registrar_unavailable"; }
function clientError(message) { const error = new Error(message); error.statusCode = 400; return error; }
function conflictError(message) { const error = new Error(message); error.statusCode = 409; return error; }
function response(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "https://maxwebstudio.nl", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { checkAvailability, validateOrder, validDomain };
