import { getSupabaseConfig } from "../config/supabaseConfig.js";
import { getSession } from "./supabaseAuthProvider.js";

const AUTH_CONFIG_ENDPOINT = "/.netlify/functions/client-auth-config";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const FINANCE_STATES = Object.freeze({
  LOADING: "loading",
  FOUND: "found",
  MISSING: "missing",
  ERROR: "error",
});

function safeString(value = "") {
  return String(value || "").trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && safeString(value) !== "") || "";
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isUuid(value) {
  return UUID_PATTERN.test(safeString(value));
}

function normalizePublicConfig(config = {}) {
  return {
    url: safeString(config.supabaseUrl || config.SUPABASE_URL || config.url).replace(/\/$/, ""),
    anonKey: safeString(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || config.anonKey),
  };
}

function isSafeSupabaseUrl(value = "") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function publicConfigReady(config = {}) {
  return Boolean(isSafeSupabaseUrl(config.url) && config.anonKey);
}

function sanitizeMessage(value = "") {
  return safeString(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/apikey['":\s]+[A-Za-z0-9._-]+/gi, "apikey [redacted]");
}

async function getRuntimePublicConfig() {
  let endpointConfig = {};
  try {
    const response = await fetch(AUTH_CONFIG_ENDPOINT, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) endpointConfig = await response.json();
  } catch {
    endpointConfig = {};
  }

  return normalizePublicConfig({
    ...getSupabaseConfig(),
    ...(window.__MAXWEBSTUDIO_SUPABASE_CONFIG__ || {}),
    ...endpointConfig,
  });
}

async function supabaseRestGet(config, session, table, query) {
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || `${table} kon niet worden gelezen.`);
    error.status = response.status;
    error.table = table;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

function mapQuote(row = {}) {
  return {
    id: safeString(row.id),
    supabaseQuoteId: safeString(row.id),
    customerId: safeString(firstValue(row.customer_id, row.customerId)),
    websiteId: safeString(firstValue(row.website_id, row.websiteId)),
    projectId: safeString(firstValue(row.project_id, row.projectId)),
    quoteNumber: firstValue(row.quote_number, row.quoteNumber),
    type: firstValue(row.type, "quote"),
    title: firstValue(row.title, row.quote_number, "Offerte"),
    description: firstValue(row.proposal, row.notes),
    status: firstValue(row.status, "draft"),
    quoteDate: firstValue(row.quote_date, row.created_at),
    validUntil: firstValue(row.valid_until),
    amount: numberValue(firstValue(row.total, row.subtotal)),
    total: numberValue(firstValue(row.total, row.subtotal)),
    currency: "EUR",
    acceptedAt: firstValue(row.accepted_at),
    createdAt: firstValue(row.created_at),
    updatedAt: firstValue(row.updated_at),
    source: "supabase-finance",
    _source: "supabase",
    _supabaseId: safeString(row.id),
  };
}

function mapInvoice(row = {}) {
  return {
    id: safeString(row.id),
    supabaseInvoiceId: safeString(row.id),
    customerId: safeString(firstValue(row.customer_id, row.customerId)),
    websiteId: safeString(firstValue(row.website_id, row.websiteId)),
    projectId: safeString(firstValue(row.project_id, row.projectId)),
    subscriptionId: safeString(firstValue(row.subscription_id, row.subscriptionId)),
    invoiceNumber: firstValue(row.invoice_number, row.invoiceNumber),
    type: firstValue(row.type, "invoice"),
    title: firstValue(row.title, row.invoice_number, "Factuur"),
    description: firstValue(row.notes),
    status: firstValue(row.status, row.mollie_payment_status, "draft"),
    paymentStatus: firstValue(row.mollie_payment_status, row.status),
    invoiceDate: firstValue(row.invoice_date, row.created_at),
    dueDate: firstValue(row.due_date),
    paidAt: firstValue(row.paid_at),
    amount: numberValue(firstValue(row.total, row.subtotal)),
    total: numberValue(firstValue(row.total, row.subtotal)),
    currency: "EUR",
    createdAt: firstValue(row.created_at),
    updatedAt: firstValue(row.updated_at),
    source: "supabase-finance",
    _source: "supabase",
    _supabaseId: safeString(row.id),
  };
}

function mapSubscription(row = {}) {
  return {
    id: safeString(row.id),
    customerId: safeString(firstValue(row.customer_id, row.customerId)),
    websiteId: safeString(firstValue(row.website_id, row.websiteId)),
    projectId: safeString(firstValue(row.project_id, row.projectId)),
    plan: firstValue(row.plan, "Onderhoud"),
    packageName: firstValue(row.plan, "Onderhoud"),
    status: firstValue(row.status, "active"),
    billingCycle: firstValue(row.billing_cycle, "monthly"),
    invoiceFrequency: firstValue(row.billing_cycle, "monthly"),
    totalInclVat: numberValue(row.total_incl_vat),
    monthlyAmount: numberValue(row.total_incl_vat),
    amount: numberValue(row.total_incl_vat),
    currency: "EUR",
    nextInvoiceDate: firstValue(row.next_invoice_date),
    lastInvoiceId: firstValue(row.last_invoice_id),
    lastInvoiceDate: firstValue(row.last_invoice_date),
    paymentStatus: firstValue(row.mandate_status, row.status),
    createdAt: firstValue(row.created_at),
    updatedAt: firstValue(row.updated_at),
    source: "supabase-finance",
    _source: "supabase",
    _supabaseId: safeString(row.id),
  };
}

function result(state, overrides = {}) {
  return {
    state,
    loading: state === FINANCE_STATES.LOADING,
    found: state === FINANCE_STATES.FOUND,
    fallbackAllowed: state !== FINANCE_STATES.FOUND,
    quotes: [],
    invoices: [],
    subscriptions: [],
    source: "supabase-finance-context",
    message: "",
    error: "",
    ...overrides,
  };
}

export async function getClientFinanceContext(customerContext = {}) {
  try {
    const customerId = safeString(customerContext.supabaseCustomerId || customerContext.customerId || customerContext.customer?.id);
    if (!isUuid(customerId)) {
      return result(FINANCE_STATES.MISSING, {
        message: "Geen production-ready customer_id beschikbaar voor finance data.",
      });
    }

    const sessionResult = await getSession();
    const session = sessionResult?.session;
    if (!session?.access_token) {
      return result(FINANCE_STATES.MISSING, {
        message: "Geen actieve Supabase Auth-sessie gevonden.",
      });
    }

    const config = await getRuntimePublicConfig();
    if (!publicConfigReady(config)) {
      return result(FINANCE_STATES.MISSING, {
        message: "Publieke Supabase financeconfiguratie is nog niet beschikbaar.",
      });
    }

    const baseParams = {
      customer_id: `eq.${customerId}`,
      select: "*",
      order: "created_at.desc",
      limit: "50",
    };
    const [quoteRows, invoiceRows, subscriptionRows] = await Promise.all([
      supabaseRestGet(config, session, "quotes", new URLSearchParams(baseParams).toString()),
      supabaseRestGet(config, session, "invoices", new URLSearchParams(baseParams).toString()),
      supabaseRestGet(config, session, "subscriptions", new URLSearchParams(baseParams).toString()),
    ]);

    const quotes = quoteRows.map(mapQuote);
    const invoices = invoiceRows.map(mapInvoice);
    const subscriptions = subscriptionRows.map(mapSubscription);
    if (!quotes.length && !invoices.length && !subscriptions.length) {
      return result(FINANCE_STATES.MISSING, {
        message: "Geen facturen, offertes of abonnementen gevonden voor deze klant.",
      });
    }
    return result(FINANCE_STATES.FOUND, {
      quotes,
      invoices,
      subscriptions,
      message: "Finance data gevonden via Supabase.",
    });
  } catch (error) {
    return result(FINANCE_STATES.ERROR, {
      message: "Finance data kon niet veilig worden opgehaald.",
      error: sanitizeMessage(error?.message || "Onbekende fout."),
    });
  }
}

export function getClientFinanceStates() {
  return FINANCE_STATES;
}

export const clientFinanceContextService = {
  getClientFinanceContext,
  getClientFinanceStates,
};
