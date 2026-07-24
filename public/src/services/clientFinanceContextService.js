import { getSession } from "./supabaseAuthProvider.js";

const FINANCE_ENDPOINT = "/.netlify/functions/client-finance-context";
const FINANCE_STATES = Object.freeze({
  LOADING: "loading",
  FOUND: "found",
  MISSING: "missing",
  ERROR: "error",
});

function safeString(value = "") {
  return String(value || "").trim();
}

function sanitizeMessage(value = "") {
  return safeString(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/apikey['\":\s]+[A-Za-z0-9._-]+/gi, "apikey [redacted]");
}

function result(state, overrides = {}) {
  return {
    state,
    loading: state === FINANCE_STATES.LOADING,
    found: state === FINANCE_STATES.FOUND,
    fallbackAllowed: false,
    summary: null,
    quotes: [],
    invoices: [],
    subscriptions: [],
    source: "canonical-server-finance-context",
    message: "",
    error: "",
    ...overrides,
  };
}

export async function getClientFinanceContext() {
  try {
    const sessionResult = await getSession();
    const session = sessionResult?.session;
    if (!session?.access_token) {
      return result(FINANCE_STATES.MISSING, { message: "Geen actieve Supabase Auth-sessie gevonden." });
    }

    const response = await fetch(FINANCE_ENDPOINT, {
      method: "GET",
      headers: { Authorization: `Bearer ${session.access_token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      const error = new Error(payload?.error || "Finance data kon niet veilig worden opgehaald.");
      error.status = response.status;
      throw error;
    }

    const finance = payload.finance || {};
    const quotes = Array.isArray(finance.quotes) ? finance.quotes : [];
    const invoices = Array.isArray(finance.invoices) ? finance.invoices : [];
    const subscriptions = Array.isArray(finance.subscriptions) ? finance.subscriptions : [];
    if (!quotes.length && !invoices.length && !subscriptions.length) {
      return result(FINANCE_STATES.MISSING, {
        summary: finance,
        message: "Geen facturen, offertes of abonnementen gevonden voor deze klant.",
      });
    }

    return result(FINANCE_STATES.FOUND, {
      summary: finance,
      quotes,
      invoices,
      subscriptions,
      message: "Finance data veilig geladen uit het canonieke datamodel.",
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
