function trim(value) {
  return String(value || "").trim();
}

function lower(value) {
  return trim(value).toLowerCase();
}

function normalizeStatus(value) {
  const status = lower(value).replace(/\s+/g, "_");
  if (!status) return "actief";
  if (["active", "live"].includes(status)) return "actief";
  if (["paused", "pauzed"].includes(status)) return "pauze";
  if (["archived", "archive"].includes(status)) return "gearchiveerd";
  return status;
}

function normalizeTimestamp(value, fallback = "") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function normalizeCustomer(customer = {}) {
  const now = new Date().toISOString();
  const firstName = trim(customer.firstName || customer.first_name);
  const lastName = trim(customer.lastName || customer.last_name);
  const name = trim(customer.name || [firstName, lastName].filter(Boolean).join(" "));
  const company = trim(customer.company || customer.companyName || customer.company_name || customer.bedrijf);
  const email = lower(customer.email || customer.authEmail || customer.contactEmail);
  const phone = trim(customer.phone || customer.telefoon || customer.phoneNumber);
  const createdAt = normalizeTimestamp(customer.createdAt || customer.created_at || customer.customerSince, now);
  const updatedAt = normalizeTimestamp(customer.updatedAt || customer.updated_at || customer.lastChanged, createdAt);
  return {
    ...customer,
    id: trim(customer.id),
    authUserId: trim(customer.authUserId || customer.auth_user_id),
    profileId: trim(customer.profileId || customer.profile_id),
    firstName,
    lastName,
    name,
    company,
    companyName: company,
    email,
    authEmail: lower(customer.authEmail || email),
    phone,
    website: trim(customer.website || customer.websiteUrl || customer.domain),
    package: trim(customer.package || customer.packageName || customer.carePackage),
    status: normalizeStatus(customer.status),
    portalStatus: trim(customer.portalStatus || customer.portal_status || "geen_login"),
    customerSince: trim(customer.customerSince || customer.customer_since || createdAt.slice(0, 10)),
    address: trim(customer.address || customer.adres),
    postalCode: trim(customer.postalCode || customer.postal_code),
    city: trim(customer.city || customer.plaats),
    country: trim(customer.country || "NL"),
    createdAt,
    updatedAt,
    isDemo: Boolean(customer.isDemo),
    isDemoJourney: Boolean(customer.isDemoJourney),
    environment: customer.environment || (customer.isDemo || customer.isDemoJourney ? "demo" : "production"),
    demoScenarioId: trim(customer.demoScenarioId),
    demoJourneyId: trim(customer.demoJourneyId),
  };
}

export function customerIdentityKeys(customer = {}) {
  const normalized = normalizeCustomer(customer);
  return {
    id: normalized.id,
    email: normalized.email,
    companyPhone: [lower(normalized.company), normalized.phone.replace(/\s+/g, "")].filter(Boolean).join("|"),
    company: lower(normalized.company),
    phone: normalized.phone.replace(/\s+/g, ""),
  };
}
