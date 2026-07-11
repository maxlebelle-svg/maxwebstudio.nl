import { getSupabaseConfig } from "../config/supabaseConfig.js";
import { getSession } from "./supabaseAuthProvider.js";

const AUTH_CONFIG_ENDPOINT = "/.netlify/functions/client-auth-config";

const PROFILE_CONTEXT_STATES = Object.freeze({
  LOADING: "loading",
  PROFILE_FOUND: "profile_found",
  PROFILE_MISSING: "profile_missing",
  ERROR: "error",
});

function safeString(value = "") {
  return String(value || "").trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && safeString(value) !== "") || "";
}

function normalizePublicConfig(config = {}) {
  return {
    url: safeString(config.supabaseUrl || config.SUPABASE_URL || config.url).replace(/\/$/, ""),
    anonKey: safeString(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || config.anonKey),
    appEnv: safeString(config.appEnv || config.APP_ENV),
    appEnvironment: safeString(config.appEnvironment || config.APP_ENVIRONMENT),
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
  const url = `${config.url}/rest/v1/${table}?${query}`;
  const response = await fetch(url, {
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

async function readProfile(config, session) {
  const authUserId = safeString(session?.user?.id);
  if (!authUserId) return null;
  const query = new URLSearchParams({
    auth_user_id: `eq.${authUserId}`,
    select: "*",
    limit: "1",
  });
  const profiles = await supabaseRestGet(config, session, "profiles", query.toString());
  return profiles[0] || null;
}

async function readCustomersByFilter(config, session, field, value) {
  const safeValue = safeString(value);
  if (!safeValue) return [];
  const query = new URLSearchParams({
    [field]: `eq.${safeValue}`,
    select: "*",
    limit: "1",
  });
  return supabaseRestGet(config, session, "customers", query.toString());
}

async function readCustomer(config, session, profile = {}) {
  const customerId = firstValue(profile.customer_id, profile.customerId);
  if (customerId) {
    const customers = await readCustomersByFilter(config, session, "id", customerId);
    if (customers[0]) return customers[0];
  }

  const fallbackFilters = [
    ["profile_id", firstValue(profile.id)],
    ["auth_user_id", firstValue(profile.auth_user_id, profile.authUserId)],
  ];

  for (const [field, value] of fallbackFilters) {
    try {
      const customers = await readCustomersByFilter(config, session, field, value);
      if (customers[0]) return customers[0];
    } catch {
      // Some staging schemas may not expose every future ownership column yet.
    }
  }

  return null;
}

function mapCustomer(customer = {}, profile = {}) {
  const id = firstValue(customer.id, profile.customer_id, profile.customerId);
  return {
    id,
    supabaseCustomerId: id,
    _supabaseCustomerId: id,
    name: firstValue(customer.name, customer.contact_name, profile.full_name, profile.name),
    company: firstValue(customer.company, customer.company_name, customer.name),
    email: firstValue(customer.email, customer.contact_email, profile.email),
    phone: firstValue(customer.phone, customer.contact_phone),
    address: firstValue(customer.address, customer.address_line, customer.metadata?.address, customer.metadata?.adres),
    postalCode: firstValue(customer.postal_code, customer.postalCode, customer.metadata?.postalCode, customer.metadata?.postal_code),
    city: firstValue(customer.city, customer.metadata?.city, customer.metadata?.plaats),
    kvk: firstValue(customer.kvk, customer.kvk_number, customer.chamber_of_commerce, customer.metadata?.kvk, customer.metadata?.kvkNumber),
    vatNumber: firstValue(customer.vat_number, customer.btw_nummer, customer.btwNumber, customer.metadata?.vatNumber, customer.metadata?.btwNummer),
    website: firstValue(customer.website, customer.website_url),
    package: firstValue(customer.package, customer.package_name, customer.plan),
    status: firstValue(customer.status, "actief"),
    portalStatus: firstValue(customer.portal_status, customer.portalStatus, "supabase-profile"),
    customerSince: firstValue(customer.customer_since, customer.created_at),
    createdAt: firstValue(customer.created_at),
    updatedAt: firstValue(customer.updated_at),
    source: "supabase-profile",
  };
}

function mapPermissions(profile = {}) {
  const role = firstValue(profile.role, "customer");
  return {
    role,
    isCustomer: role === "customer",
    canReadPortal: role === "customer",
  };
}

function result(state, overrides = {}) {
  return {
    state,
    loading: state === PROFILE_CONTEXT_STATES.LOADING,
    profileFound: state === PROFILE_CONTEXT_STATES.PROFILE_FOUND,
    fallbackAllowed: state !== PROFILE_CONTEXT_STATES.PROFILE_FOUND,
    customerId: "",
    supabaseCustomerId: "",
    mode: "",
    authUserId: "",
    profileId: "",
    permissions: mapPermissions({}),
    profile: null,
    customer: null,
    source: "supabase-profile-context",
    message: "",
    error: "",
    ...overrides,
  };
}

export async function getClientCustomerProfileContext() {
  try {
    const sessionResult = await getSession();
    const session = sessionResult?.session;
    if (!session?.access_token || !session?.user?.id) {
      return result(PROFILE_CONTEXT_STATES.PROFILE_MISSING, {
        message: "Geen actieve Supabase Auth-sessie gevonden.",
      });
    }

    const config = await getRuntimePublicConfig();
    if (!publicConfigReady(config)) {
      return result(PROFILE_CONTEXT_STATES.PROFILE_MISSING, {
        message: "Publieke Supabase klantprofielconfiguratie is nog niet beschikbaar.",
      });
    }

    const profile = await readProfile(config, session);
    if (!profile) {
      return result(PROFILE_CONTEXT_STATES.PROFILE_MISSING, {
        message: "Geen profile gevonden voor de ingelogde gebruiker.",
      });
    }

    const customer = await readCustomer(config, session, profile);
    if (!customer) {
      return result(PROFILE_CONTEXT_STATES.PROFILE_MISSING, {
        profile,
        message: "Profile gevonden, maar nog geen gekoppelde customer.",
      });
    }

    const mappedCustomer = mapCustomer(customer, profile);
    return result(PROFILE_CONTEXT_STATES.PROFILE_FOUND, {
      profile,
      customer: mappedCustomer,
      authUserId: safeString(session.user.id),
      profileId: safeString(profile.id),
      customerId: mappedCustomer.id,
      supabaseCustomerId: mappedCustomer.supabaseCustomerId,
      permissions: mapPermissions(profile),
      mode: "hybrid",
      message: "Klantprofiel gevonden via Supabase Auth en profiles.",
    });
  } catch (error) {
    return result(PROFILE_CONTEXT_STATES.ERROR, {
      message: "Klantprofiel kon niet veilig worden opgehaald.",
      error: sanitizeMessage(error?.message || "Onbekende fout."),
    });
  }
}

export function getClientCustomerProfileContextStates() {
  return PROFILE_CONTEXT_STATES;
}

export const clientCustomerProfileContextService = {
  getClientCustomerProfileContext,
  getClientCustomerProfileContextStates,
};
