import { PRIMARY_MODULE_KEYS } from "../config/storageKeys.js";
import { normalizeCustomer, customerIdentityKeys } from "../utils/customerNormalizer.js";
import { createRepository } from "./createRepository.js";

export const CustomerRepository = createRepository(PRIMARY_MODULE_KEYS.customers);

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export function mapLocalCustomerToSupabase(customer = {}) {
  const normalized = normalizeCustomer(customer);
  return compactObject({
    id: normalized.id || undefined,
    auth_user_id: normalized.authUserId || null,
    profile_id: normalized.profileId || normalized.id || null,
    name: normalized.name || null,
    first_name: normalized.firstName || null,
    last_name: normalized.lastName || null,
    company_name: normalized.company || null,
    email: normalized.email || null,
    phone: normalized.phone || null,
    website: normalized.website || null,
    package_name: normalized.package || null,
    status: normalized.status || "actief",
    portal_status: normalized.portalStatus || "geen_login",
    customer_since: normalized.customerSince || null,
    address: normalized.address || null,
    postal_code: normalized.postalCode || null,
    city: normalized.city || null,
    country: normalized.country || "NL",
    is_demo: Boolean(normalized.isDemo),
    is_demo_journey: Boolean(normalized.isDemoJourney),
    environment: normalized.environment || "production",
    demo_scenario_id: normalized.demoScenarioId || null,
    demo_journey_id: normalized.demoJourneyId || null,
    source: "localStorage",
    metadata: {
      localStorageId: normalized.id || "",
      originalStatus: customer.status || "",
      originalCompany: customer.company || customer.companyName || "",
    },
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
  });
}

export function mapSupabaseCustomerToLocal(row = {}) {
  return normalizeCustomer({
    id: row.id,
    authUserId: row.auth_user_id,
    profileId: row.profile_id,
    name: row.name,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company_name,
    email: row.email,
    phone: row.phone,
    website: row.website,
    package: row.package_name,
    status: row.status,
    portalStatus: row.portal_status,
    customerSince: row.customer_since,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    isDemo: row.is_demo,
    isDemoJourney: row.is_demo_journey,
    environment: row.environment,
    demoScenarioId: row.demo_scenario_id,
    demoJourneyId: row.demo_journey_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function validateCustomerForSupabase(customer = {}) {
  const normalized = normalizeCustomer(customer);
  const warnings = [];
  const errors = [];
  if (!normalized.id) errors.push("Klant mist id.");
  if (!normalized.name && !normalized.company) warnings.push("Klant mist naam en bedrijfsnaam.");
  if (!normalized.email) warnings.push("Klant mist e-mailadres.");
  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) errors.push("Klant heeft ongeldig e-mailadres.");
  if (!normalized.status) warnings.push("Klant mist status.");
  if (!normalized.createdAt) warnings.push("Klant mist createdAt.");
  if ((normalized.isDemo || normalized.isDemoJourney || normalized.environment === "demo") && !normalized.demoScenarioId && !normalized.demoJourneyId) {
    warnings.push("Demo-klant mist demoScenarioId/demoJourneyId.");
  }
  return {
    id: normalized.id,
    ready: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
}

export function prepareCustomersForMigration(customers = []) {
  const seen = new Map();
  const unique = [];
  const duplicates = [];
  customers.forEach((customer) => {
    const normalized = normalizeCustomer(customer);
    const keys = customerIdentityKeys(normalized);
    const duplicateKey = [
      keys.id && `id:${keys.id}`,
      keys.email && `email:${keys.email}`,
      keys.companyPhone && `company_phone:${keys.companyPhone}`,
    ].filter(Boolean).find((key) => seen.has(key));
    if (duplicateKey) {
      duplicates.push({ key: duplicateKey, customer: normalized, duplicateOf: seen.get(duplicateKey) });
      return;
    }
    unique.push(normalized);
    [keys.id && `id:${keys.id}`, keys.email && `email:${keys.email}`, keys.companyPhone && `company_phone:${keys.companyPhone}`]
      .filter(Boolean)
      .forEach((key) => seen.set(key, normalized.id || normalized.email || normalized.company));
  });
  const validation = unique.map(validateCustomerForSupabase);
  return {
    total: customers.length,
    unique,
    duplicates,
    ready: validation.filter((item) => item.ready),
    attention: validation.filter((item) => !item.ready || item.warnings.length),
    payload: unique.map(mapLocalCustomerToSupabase),
    validation,
  };
}
