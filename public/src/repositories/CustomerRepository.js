import { PRIMARY_MODULE_KEYS, STORAGE_KEYS } from "../config/storageKeys.js";
import { CUSTOMER_DATA_MODES, getCurrentProviderType, PROVIDERS } from "../config/environment.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { normalizeCustomer, customerIdentityKeys } from "../utils/customerNormalizer.js";
import { createRepository } from "./createRepository.js";

const localCustomerRepository = createRepository(PRIMARY_MODULE_KEYS.customers);

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function localCustomersFromStorage() {
  const sourceKeys = [STORAGE_KEYS.crmCustomers, STORAGE_KEYS.customers];
  const seen = new Set();
  return sourceKeys.flatMap((sourceKey) => readArray(sourceKey).map((customer) => ({ ...customer, _localSourceKey: sourceKey })))
    .map(normalizeCustomer)
    .filter((customer) => {
      const key = customer.id || customer.email || `${customer.company}|${customer.phone}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sourceLabel(customer = {}) {
  if (customer.isDemo || customer.isDemoJourney || customer.environment === "demo") return "demo";
  return customer._source || "local";
}

export function markCustomerSource(customer = {}, source = "local", extra = {}) {
  return {
    ...customer,
    _source: sourceLabel({ ...customer, _source: source }),
    _isMigrated: Boolean(customer.supabaseCustomerId || customer.migratedToSupabaseAt || extra.supabaseCustomerId),
    _supabaseCustomerId: extra.supabaseCustomerId || customer.supabaseCustomerId || customer.id || "",
    _localCustomerId: extra.localCustomerId || customer._localCustomerId || customer.metadata?.localStorageId || "",
    _sourceMeta: {
      ...(customer._sourceMeta || {}),
      ...extra,
    },
  };
}

export function getCustomerSource(customer = {}) {
  return sourceLabel(customer);
}

function mergeSupabaseWithLocal(localCustomer, supabaseCustomer, reason = "supabase_match") {
  return markCustomerSource({
    ...localCustomer,
    ...supabaseCustomer,
    id: localCustomer.id || supabaseCustomer.id,
    createdAt: supabaseCustomer.createdAt || localCustomer.createdAt,
    updatedAt: supabaseCustomer.updatedAt || localCustomer.updatedAt,
    customerSince: supabaseCustomer.customerSince || localCustomer.customerSince,
    isDemo: Boolean(localCustomer.isDemo || supabaseCustomer.isDemo),
    environment: localCustomer.environment === "demo" ? "demo" : supabaseCustomer.environment || localCustomer.environment,
  }, "hybrid", {
    reason,
    localCustomerId: localCustomer.id || "",
    supabaseCustomerId: supabaseCustomer.id || localCustomer.supabaseCustomerId || "",
  });
}

export function mergeCustomerSources(localCustomers = [], supabaseCustomers = []) {
  const merged = [];
  const duplicateMerges = [];
  const usedLocalIds = new Set();
  const localBySupabaseId = new Map();
  const localByEmail = new Map();
  const localByCompanyPhone = new Map();
  localCustomers.forEach((customer) => {
    const normalized = normalizeCustomer(customer);
    const keys = customerIdentityKeys(normalized);
    if (normalized.supabaseCustomerId) localBySupabaseId.set(String(normalized.supabaseCustomerId), normalized);
    if (keys.email) localByEmail.set(keys.email, normalized);
    if (keys.companyPhone) localByCompanyPhone.set(keys.companyPhone, normalized);
  });

  supabaseCustomers.forEach((customer) => {
    const normalized = normalizeCustomer(customer);
    const keys = customerIdentityKeys(normalized);
    const localMatch = localBySupabaseId.get(String(normalized.id))
      || (keys.email ? localByEmail.get(keys.email) : null)
      || (keys.companyPhone ? localByCompanyPhone.get(keys.companyPhone) : null);
    if (localMatch) {
      usedLocalIds.add(localMatch.id);
      const reason = localMatch.supabaseCustomerId === normalized.id ? "supabaseCustomerId" : keys.email && localByEmail.get(keys.email) ? "email" : "company_phone";
      duplicateMerges.push({ reason, localCustomerId: localMatch.id, supabaseCustomerId: normalized.id, email: normalized.email, company: normalized.company });
      merged.push(mergeSupabaseWithLocal(localMatch, normalized, reason));
      return;
    }
    merged.push(markCustomerSource(normalized, "supabase", { supabaseCustomerId: normalized.id }));
  });

  localCustomers.map(normalizeCustomer).forEach((customer) => {
    if (usedLocalIds.has(customer.id)) return;
    if (customer.supabaseCustomerId && !customer.isDemo && customer.environment !== "demo") return;
    merged.push(markCustomerSource(customer, customer.isDemo || customer.environment === "demo" ? "demo" : "local", {
      localCustomerId: customer.id,
      supabaseCustomerId: customer.supabaseCustomerId || "",
    }));
  });

  return {
    customers: merged,
    duplicateMerges,
    counts: {
      local: localCustomers.length,
      supabase: supabaseCustomers.length,
      hybrid: merged.length,
      duplicateMerges: duplicateMerges.length,
      demo: merged.filter((customer) => getCustomerSource(customer) === "demo").length,
      unmigratedLocal: merged.filter((customer) => getCustomerSource(customer) === "local" && !customer._isMigrated).length,
    },
  };
}

export function listLocalCustomers() {
  return localCustomersFromStorage().map((customer) => markCustomerSource(customer, customer.isDemo || customer.environment === "demo" ? "demo" : "local", {
    localCustomerId: customer.id,
    supabaseCustomerId: customer.supabaseCustomerId || "",
  }));
}

export async function listSupabaseCustomers() {
  const rows = await supabaseProvider.getAll("customers", { limit: 100 });
  return rows.map((row) => markCustomerSource(mapSupabaseCustomerToLocal(row), "supabase", {
    supabaseCustomerId: row.id,
    localCustomerId: row.metadata?.localStorageId || "",
  }));
}

export async function listHybridCustomers() {
  const localCustomers = listLocalCustomers();
  const supabaseCustomers = await listSupabaseCustomers();
  return mergeCustomerSources(localCustomers, supabaseCustomers);
}

export async function listByDataMode(mode = CUSTOMER_DATA_MODES.LOCAL) {
  if (mode === CUSTOMER_DATA_MODES.SUPABASE_READ) {
    const customers = await listSupabaseCustomers();
    return {
      mode,
      customers,
      counts: {
        local: listLocalCustomers().length,
        supabase: customers.length,
        hybrid: customers.length,
        duplicateMerges: 0,
        demo: 0,
        unmigratedLocal: 0,
      },
      fallbackUsed: false,
      error: "",
      refreshedAt: new Date().toISOString(),
    };
  }
  if (mode === CUSTOMER_DATA_MODES.HYBRID) {
    try {
      const merged = await listHybridCustomers();
      return { mode, ...merged, fallbackUsed: false, error: "", refreshedAt: new Date().toISOString() };
    } catch (error) {
      const customers = listLocalCustomers();
      return {
        mode,
        customers,
        counts: {
          local: customers.length,
          supabase: 0,
          hybrid: customers.length,
          duplicateMerges: 0,
          demo: customers.filter((customer) => getCustomerSource(customer) === "demo").length,
          unmigratedLocal: customers.filter((customer) => getCustomerSource(customer) === "local" && !customer._isMigrated).length,
        },
        duplicateMerges: [],
        fallbackUsed: true,
        error: error.message || "Supabase customers konden niet worden gelezen.",
        refreshedAt: new Date().toISOString(),
      };
    }
  }
  const customers = listLocalCustomers();
  return {
    mode: CUSTOMER_DATA_MODES.LOCAL,
    customers,
    counts: {
      local: customers.length,
      supabase: 0,
      hybrid: customers.length,
      duplicateMerges: 0,
      demo: customers.filter((customer) => getCustomerSource(customer) === "demo").length,
      unmigratedLocal: customers.filter((customer) => getCustomerSource(customer) === "local" && !customer._isMigrated).length,
    },
    duplicateMerges: [],
    fallbackUsed: false,
    error: "",
    refreshedAt: new Date().toISOString(),
  };
}

export const CustomerRepository = {
  ...localCustomerRepository,
  listByDataMode,
  listLocalCustomers,
  listSupabaseCustomers,
  listHybridCustomers,
  getCustomerSource,
  mergeCustomerSources,
  markCustomerSource,
  list(options = {}) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) {
      return supabaseProvider.getAll("customers", { limit: options.limit || 10 }).then((rows) => rows.map(mapSupabaseCustomerToLocal));
    }
    return localCustomerRepository.list();
  },
  count() {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) return supabaseProvider.count("customers");
    return localCustomerRepository.count();
  },
  create(data) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) throw new Error("Supabase writes zijn nog geblokkeerd in read-only mode.");
    return localCustomerRepository.create(data);
  },
  update(id, data) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) throw new Error("Supabase writes zijn nog geblokkeerd in read-only mode.");
    return localCustomerRepository.update(id, data);
  },
  remove(id) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) throw new Error("Supabase writes zijn nog geblokkeerd in read-only mode.");
    return localCustomerRepository.remove(id);
  },
};

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
    supabaseCustomerId: row.id,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
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
