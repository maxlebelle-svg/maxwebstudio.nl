const { corsHeaders } = require("./_cors");
const { INVOICE_FIELDS, SUBSCRIPTION_FIELDS } = require("./_canonical-finance");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPEN_INVOICE_STATUSES = new Set(["draft", "sent"]);
const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["canceled", "expired", "archived"]);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "GET") return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });

  const context = getContext();
  if (!context.available) return jsonResponse(500, { success: false, error: "De financeomgeving is nog niet geconfigureerd." });

  try {
    const bearer = getBearer(event);
    const authUser = await readAuthUser(context, bearer);
    const customer = await resolveCustomerForAuthUser(context, authUser.id);
    if (!customer?.id) return jsonResponse(403, { success: false, error: "Geen klantprofiel gekoppeld aan deze sessie." });

    const customerId = uuidOrEmpty(customer.id);
    if (!customerId) throw httpError("De klantkoppeling is ongeldig.", 500);
    const [quotes, invoices, subscriptions] = await Promise.all([
      readRows(context, "quotes", `select=id,customer_id,website_id,project_id,quote_number,type,title,status,quote_date,valid_until,subtotal,vat,total,accepted_at,created_at,updated_at&customer_id=eq.${customerId}&deleted_at=is.null&order=created_at.desc&limit=50`, bearer),
      readRows(context, "invoices", `select=${INVOICE_FIELDS}&customer_id=eq.${customerId}&deleted_at=is.null&order=created_at.desc&limit=50`, bearer),
      readRows(context, "subscriptions", `select=${SUBSCRIPTION_FIELDS}&customer_id=eq.${customerId}&archived_at=is.null&order=created_at.desc&limit=50`, bearer),
    ]);

    const viewModel = buildCustomerFinanceSummary(customerId, quotes, invoices, subscriptions);
    return jsonResponse(200, {
      success: true,
      finance: viewModel,
      sideEffects: { paymentStarted: false, providerCalled: false, emailSent: false },
    });
  } catch (error) {
    console.error("Client finance context failed", { message: error.message, status: error.status || 500 });
    return jsonResponse(error.status || 500, { success: false, error: error.message || "Financegegevens konden niet veilig worden geladen." });
  }
};

function buildCustomerFinanceSummary(customerId, quoteRows = [], invoiceRows = [], subscriptionRows = [], now = new Date()) {
  const belongsToCustomer = (row) => cleanText(row?.customer_id) === cleanText(customerId);
  const invoices = invoiceRows.filter(belongsToCustomer).map((row) => sanitizeInvoice(row, now));
  const subscriptions = subscriptionRows.filter(belongsToCustomer).map(sanitizeSubscription);
  const quotes = quoteRows.filter(belongsToCustomer).map(sanitizeQuote);
  const openInvoices = invoices.filter((invoice) => OPEN_INVOICE_STATUSES.has(invoice.status));
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "expired" || (OPEN_INVOICE_STATUSES.has(invoice.status) && isPast(invoice.dueAt, now)));
  const activeSubscriptions = subscriptions.filter((subscription) => !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status));
  const nextBillingDates = activeSubscriptions.map((subscription) => subscription.renewsAt).filter(Boolean).sort();

  return {
    customerId,
    openInvoiceCount: openInvoices.length,
    overdueInvoiceCount: overdueInvoices.length,
    outstandingAmount: currencyRound(openInvoices.reduce((sum, invoice) => sum + invoice.total, 0)),
    currency: "EUR",
    latestInvoice: invoices[0] || null,
    activeSubscriptions,
    nextBillingDate: nextBillingDates[0] || "",
    paymentState: overdueInvoices.length ? "overdue" : openInvoices.length ? "outstanding" : "settled",
    quotes,
    invoices,
    subscriptions,
  };
}

function sanitizeInvoice(row = {}, now = new Date()) {
  const status = normalizeInvoiceStatus(row.status, row.due_date, now);
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    projectId: cleanText(row.project_id),
    websiteId: cleanText(row.website_id),
    quoteId: cleanText(row.source_quote_id),
    subscriptionId: cleanText(row.subscription_id),
    invoiceNumber: cleanText(row.invoice_number) || "Factuur",
    title: cleanText(row.title) || "Factuur",
    status,
    paymentStatus: normalizePaymentStatus(row.mollie_payment_status, status),
    issuedAt: cleanText(row.invoice_date || row.created_at),
    dueAt: cleanText(row.due_date),
    paidAt: cleanText(row.paid_at),
    subtotal: currencyRound(row.subtotal),
    vatAmount: currencyRound(row.vat),
    total: currencyRound(row.total),
    amount: currencyRound(row.total),
    currency: "EUR",
    paymentAvailable: Boolean(cleanText(row.payment_link || row.mollie_checkout_url)) && !["paid", "canceled", "failed", "archived"].includes(status),
    downloadAvailable: Boolean(cleanText(row.pdf_file_path)),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function sanitizeSubscription(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    projectId: cleanText(row.project_id),
    websiteId: cleanText(row.website_id),
    lastInvoiceId: cleanText(row.last_invoice_id),
    plan: cleanText(row.plan) || "Onderhoud",
    packageName: cleanText(row.plan) || "Onderhoud",
    status: normalizeSubscriptionStatus(row.status),
    billingInterval: cleanText(row.billing_cycle || "monthly"),
    billingCycle: cleanText(row.billing_cycle || "monthly"),
    subtotal: currencyRound(row.price_ex_vat),
    vatRate: currencyRound(row.vat_rate),
    amount: currencyRound(row.total_incl_vat),
    totalInclVat: currencyRound(row.total_incl_vat),
    currency: "EUR",
    startsAt: cleanText(row.start_date),
    renewsAt: cleanText(row.next_invoice_date || row.next_payment_at),
    endsAt: cleanText(row.canceled_at),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function sanitizeQuote(row = {}) {
  return {
    id: cleanText(row.id),
    customerId: cleanText(row.customer_id),
    projectId: cleanText(row.project_id),
    websiteId: cleanText(row.website_id),
    quoteNumber: cleanText(row.quote_number) || "Offerte",
    title: cleanText(row.title) || "Offerte",
    status: cleanText(row.status || "draft").toLowerCase(),
    quoteDate: cleanText(row.quote_date || row.created_at),
    validUntil: cleanText(row.valid_until),
    subtotal: currencyRound(row.subtotal),
    vat: currencyRound(row.vat),
    total: currencyRound(row.total),
    amount: currencyRound(row.total),
    currency: "EUR",
    acceptedAt: cleanText(row.accepted_at),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function normalizeInvoiceStatus(value, dueDate, now = new Date()) {
  const status = cleanText(value || "draft").toLowerCase();
  if (["canceled", "cancelled", "credited", "credit", "gecrediteerd"].includes(status)) return "canceled";
  if (["paid", "betaald"].includes(status)) return "paid";
  if (["expired", "verlopen", "overdue"].includes(status) || (OPEN_INVOICE_STATUSES.has(status) && isPast(dueDate, now))) return "expired";
  if (status === "concept") return "draft";
  if (status === "verzonden") return "sent";
  if (status === "mislukt") return "failed";
  return ["draft", "sent", "failed", "archived"].includes(status) ? status : "draft";
}

function normalizePaymentStatus(providerStatus, invoiceStatus) {
  const value = cleanText(providerStatus).toLowerCase();
  if (["paid", "open", "pending", "failed", "expired", "canceled"].includes(value)) return value;
  return invoiceStatus === "paid" ? "paid" : invoiceStatus === "expired" ? "expired" : "unavailable";
}

function normalizeSubscriptionStatus(value) {
  const status = cleanText(value || "active").toLowerCase();
  return status === "cancelled" ? "canceled" : status;
}

function isPast(value, now = new Date()) {
  const timestamp = Date.parse(cleanText(value));
  return Number.isFinite(timestamp) && timestamp < now.getTime();
}

async function readAuthUser(context, bearer) {
  if (!bearer) throw httpError("Log in om financegegevens te bekijken.", 401);
  const response = await fetch(`${context.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: context.anonKey, Authorization: `Bearer ${bearer}`, Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) throw httpError("Sessie is ongeldig.", 401);
  return data;
}

async function resolveCustomerForAuthUser(context, authUserId) {
  const direct = await readSingle(context, "customers", `select=id,profile_id,auth_user_id&auth_user_id=eq.${encodeURIComponent(authUserId)}&limit=1`);
  if (direct?.id) return direct;
  const profile = await readSingle(context, "profiles", `select=id&auth_user_id=eq.${encodeURIComponent(authUserId)}&limit=1`);
  if (!profile?.id) return null;
  return readSingle(context, "customers", `select=id,profile_id,auth_user_id&profile_id=eq.${encodeURIComponent(profile.id)}&limit=1`);
}

async function readRows(context, table, query, bearer = "") {
  const headers = bearer
    ? { apikey: context.anonKey, Authorization: `Bearer ${bearer}`, Accept: "application/json", "Accept-Profile": "public" }
    : restHeaders(context.serviceRoleKey);
  const data = await supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}?${query}`, { headers });
  return Array.isArray(data) ? data : [];
}

async function readSingle(context, table, query) {
  const rows = await readRows(context, table, query);
  return rows[0] || null;
}

async function supabaseFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Databaseverzoek mislukt.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function getContext() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const anonKey = cleanText(process.env.SUPABASE_ANON_KEY);
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { available: Boolean(supabaseUrl && anonKey && serviceRoleKey), supabaseUrl, anonKey, serviceRoleKey };
}

function restHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Accept-Profile": "public" };
}

function getBearer(event = {}) {
  const value = event.headers?.authorization || event.headers?.Authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function uuidOrEmpty(value) {
  const text = cleanText(value);
  return UUID_PATTERN.test(text) ? text : "";
}

function currencyRound(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
}

function cleanText(value = "") { return String(value || "").trim(); }
function httpError(message, status) { return Object.assign(new Error(message), { status }); }
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...corsHeaders({ methods: "GET, OPTIONS" }) },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

exports._private = {
  buildCustomerFinanceSummary,
  sanitizeInvoice,
  sanitizeSubscription,
  normalizeInvoiceStatus,
};
