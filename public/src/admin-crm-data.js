const DEFAULT_CUSTOMER_ENDPOINT = "/.netlify/functions/admin-supabase-data";
const DEFAULT_ONBOARDING_ENDPOINT = "/.netlify/functions/admin-customer-onboarding";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeCustomer(customer = {}) {
  return {
    ...customer,
    id: cleanText(customer.id),
    authUserId: cleanText(customer.authUserId || customer.auth_user_id),
    profileId: cleanText(customer.profileId || customer.profile_id),
    name: cleanText(customer.name),
    company: cleanText(customer.company || customer.companyName || customer.company_name),
    email: cleanText(customer.email).toLowerCase(),
    phone: cleanText(customer.phone),
    website: cleanText(customer.website || customer.domain),
    package: cleanText(customer.package || customer.packageName || customer.package_name) || "Basis",
    status: cleanText(customer.status) || "actief",
    portalStatus: cleanText(customer.portalStatus || customer.portal_status) || "niet_actief",
    customerSince: cleanText(customer.customerSince || customer.customer_since || customer.createdAt || customer.created_at),
    notes: cleanText(customer.notes),
    createdAt: cleanText(customer.createdAt || customer.created_at),
    updatedAt: cleanText(customer.updatedAt || customer.updated_at),
  };
}

function authTokenFrom(options = {}) {
  const token = typeof options.getAuthToken === "function" ? options.getAuthToken() : options.authToken;
  return cleanText(token);
}

async function readJsonResponse(response, fallbackError) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = new Error(data.error || fallbackError || `CRM request failed (${response.status}).`);
    error.status = response.status;
    error.diagnostics = data.diagnostics || {};
    throw error;
  }
  return data;
}

function customerEndpoint(options = {}) {
  return cleanText(options.customerEndpoint) || DEFAULT_CUSTOMER_ENDPOINT;
}

function onboardingEndpoint(options = {}) {
  return cleanText(options.onboardingEndpoint) || DEFAULT_ONBOARDING_ENDPOINT;
}

export async function loadCustomers(options = {}) {
  const token = authTokenFrom(options);
  if (!token) {
    const error = new Error("Log in als admin om centrale CRM-klanten te laden.");
    error.code = "CRM_AUTH_MISSING";
    throw error;
  }
  const endpoint = `${customerEndpoint(options)}?module=customers`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await readJsonResponse(response, "Centrale CRM-klanten konden niet worden geladen.");
  const customers = Array.isArray(data.records) ? data.records.map(normalizeCustomer) : [];
  return {
    customers,
    records: customers,
    mode: data.mode || "supabase-read",
    counts: data.counts || { local: 0, supabase: customers.length, hybrid: customers.length },
    fallbackUsed: Boolean(data.fallbackUsed),
    error: data.error || "",
    warning: data.warning || "",
    diagnostics: data.diagnostics || {},
    endpoint,
    authenticated: true,
    refreshedAt: data.refreshedAt || new Date().toISOString(),
    dataLayer: "admin-supabase-data",
  };
}

export function getCustomer(customers = [], id = "") {
  return customers.find((customer) => String(customer.id) === String(id)) || null;
}

export function searchCustomers(customers = [], query = "") {
  const needle = cleanText(query).toLowerCase();
  if (!needle) return customers;
  return customers.filter((customer) => [
    customer.name,
    customer.company,
    customer.email,
    customer.phone,
    customer.website,
    customer.package,
    customer.status,
    customer.portalStatus,
  ].some((value) => cleanText(value).toLowerCase().includes(needle)));
}

export async function saveCustomer(customer = {}, options = {}) {
  const token = authTokenFrom(options);
  if (!token) throw new Error("Log in als admin om de klant centraal op te slaan.");
  const response = await fetch(`${customerEndpoint(options)}?module=customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: "save_customer", customer }),
  });
  const data = await readJsonResponse(response, "Klant kon niet centraal worden opgeslagen.");
  return normalizeCustomer(data.customer || data.record || customer);
}

export async function createCustomer(customer = {}, options = {}) {
  const token = authTokenFrom(options);
  if (!token) throw new Error("Log in als admin om de klant centraal aan te maken.");
  const response = await fetch(onboardingEndpoint(options), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(customer),
  });
  const data = await readJsonResponse(response, "Klant kon niet centraal worden aangemaakt.");
  return {
    ...data,
    customer: normalizeCustomer(data.onboarding?.customer || data.customer || {}),
  };
}
