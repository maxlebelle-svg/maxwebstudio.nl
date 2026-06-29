import { PRIMARY_MODULE_KEYS, STORAGE_KEYS } from "../config/storageKeys.js";
import { CUSTOMER_DATA_MODES, getCurrentProviderType, PROVIDERS } from "../config/environment.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { normalizeCustomer, customerIdentityKeys } from "../utils/customerNormalizer.js";
import { createRepository } from "./createRepository.js";
import { logActivity, listActivitiesForEntity } from "../services/activityLogService.js";

const localCustomerRepository = createRepository(PRIMARY_MODULE_KEYS.customers);

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function crmCustomerDataMode() {
  return readJson(STORAGE_KEYS.settings, {})?.customerDataMode
    || localStorage.getItem(STORAGE_KEYS.customerDataMode)
    || CUSTOMER_DATA_MODES.LOCAL;
}

function isSupabaseCustomer(customer = {}) {
  return ["supabase", "hybrid"].includes(customer._source) || Boolean(customer._supabaseCustomerId || customer.supabaseCustomerId);
}

function supabaseStatusValue(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "actief") return "active";
  if (normalized === "gearchiveerd") return "archived";
  if (normalized === "pauze") return "paused";
  return normalized || "active";
}

function localStatusValue(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active") return "actief";
  if (normalized === "archived") return "gearchiveerd";
  if (normalized === "paused") return "pauze";
  return status || "actief";
}

function customerWriteTarget(customer = {}, options = {}) {
  if (options.target) return options.target;
  if (options.forceLocal || customer.isDemo || customer.environment === "demo") return "local";
  return isSupabaseCustomer(customer) ? "supabase" : "local";
}

function localCustomerPayload(customer = {}) {
  return normalizeCustomer({
    ...customer,
    status: localStatusValue(customer.status),
  });
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

export function compareCustomerChanges(oldCustomer = {}, newCustomer = {}) {
  const fields = ["name", "company", "email", "phone", "website", "package", "status", "portalStatus", "customerSince", "notes"];
  const changedFields = [];
  const oldValues = {};
  const newValues = {};
  fields.forEach((field) => {
    const oldValue = oldCustomer[field] ?? "";
    const newValue = newCustomer[field] ?? "";
    if (String(oldValue) === String(newValue)) return;
    changedFields.push(field);
    oldValues[field] = oldValue;
    newValues[field] = newValue;
  });
  return { changedFields, oldValues, newValues };
}

function mapCustomerWritePayload(customer = {}) {
  const normalized = normalizeCustomer(customer);
  return {
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
    status: supabaseStatusValue(normalized.status),
    portal_status: normalized.portalStatus || "geen_login",
    customer_since: normalized.customerSince || null,
    address: normalized.address || null,
    postal_code: normalized.postalCode || null,
    city: normalized.city || null,
    country: normalized.country || "NL",
    is_demo: Boolean(normalized.isDemo),
    is_demo_journey: Boolean(normalized.isDemoJourney),
    environment: normalized.environment || (normalized.isDemo || normalized.isDemoJourney ? "demo" : "production"),
    demo_scenario_id: normalized.demoScenarioId || null,
    demo_journey_id: normalized.demoJourneyId || null,
    source: "crm",
    metadata: {
      ...(customer.metadata && typeof customer.metadata === "object" ? customer.metadata : {}),
      localStorageId: customer._localCustomerId || customer.id || customer.metadata?.localStorageId || "",
      lastCustomerWriteContext: "crm_customer_write",
    },
  };
}

function getSupabaseWriteTest() {
  const latest = readJson(STORAGE_KEYS.lastSupabaseWriteTest, null);
  const sessionLatest = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(`${STORAGE_KEYS.lastSupabaseWriteTest}:session`) || "null");
    } catch {
      return null;
    }
  })();
  return sessionLatest || latest;
}

export function canWriteCustomer(customer = {}, context = {}) {
  const mode = context.mode || crmCustomerDataMode();
  const status = supabaseProvider.getStatus();
  const readOnly = readJson(STORAGE_KEYS.lastSupabaseReadOnlyTest, null);
  const writeTest = getSupabaseWriteTest();
  const source = getCustomerSource(customer);
  const missing = [];
  const target = context.target || (isSupabaseCustomer(customer) ? "supabase" : "local");
  if (target === "local") {
    return { allowed: true, target, mode, source, missing, reason: "Lokale klant blijft localStorage." };
  }
  if ((customer.isDemo || customer.environment === "demo") && context.allowDemoSupabase !== true) {
    missing.push("Demo-klant mag niet naar Supabase zonder expliciete demo-Supabase context.");
  }
  if (![CUSTOMER_DATA_MODES.SUPABASE_READ, CUSTOMER_DATA_MODES.HYBRID].includes(mode) && context.allowSupabaseInLocalMode !== true) {
    missing.push("Customer data mode is niet supabase-read of hybrid.");
  }
  if (!status.hasUrl) missing.push("Supabase URL ontbreekt.");
  if (!status.hasAnonKey) missing.push("Supabase anon key ontbreekt.");
  if (!status.clientPackageAvailable) missing.push("Supabase client is niet geladen.");
  if (!readOnly?.success && !readOnly?.connected) missing.push("Read-only test is niet succesvol.");
  const customersReady = readOnly?.customersTableAccessible === true
    || (readOnly?.tableName === "customers" && readOnly?.success === true);
  if (!customersReady) missing.push("Customers table is niet bevestigd.");
  if (writeTest?.status !== "completed") missing.push("Supabase write-test is niet succesvol.");
  return {
    allowed: missing.length === 0,
    target,
    mode,
    source,
    missing,
    reason: missing.join(" "),
    supabase: status,
    readOnly,
    writeTest,
  };
}

function logCustomerWrite(action, customer, metadata = {}) {
  return logActivity("customers", customer?.id || metadata.customerId || "unknown", action, {
    customerId: customer?.id || metadata.customerId || "",
    supabaseCustomerId: customer?._supabaseCustomerId || customer?.supabaseCustomerId || metadata.supabaseCustomerId || "",
    source: getCustomerSource(customer),
    performedBy: "local-admin",
    timestamp: nowIso(),
    ...metadata,
  });
}

export function getCustomerHistory(id) {
  const activities = listActivitiesForEntity("customers", id);
  return activities.filter((activity) => [
    "customer_created",
    "customer_updated",
    "customer_archived",
    "customer_reactivated",
    "customer_write_failed",
  ].includes(activity.action));
}

async function assertNoConflict(id, baseUpdatedAt, options = {}) {
  const remote = await supabaseProvider.getById("customers", id);
  if (!remote) throw new Error("Supabase customer bestaat niet meer of is niet bereikbaar.");
  const remoteUpdated = remote.updated_at || remote.updatedAt || "";
  if (!remoteUpdated) {
    if (!options.confirmMissingUpdatedAt) {
      const error = new Error("Supabase customer mist updated_at. Bevestig gecontroleerd opslaan eerst.");
      error.code = "CUSTOMER_UPDATED_AT_MISSING";
      error.remote = remote;
      throw error;
    }
    return remote;
  }
  if (baseUpdatedAt && new Date(remoteUpdated).getTime() > new Date(baseUpdatedAt).getTime()) {
    const error = new Error("Supabase customer is nieuwer dan de geopende detailversie. Ververs klantgegevens voordat je opslaat.");
    error.code = "CUSTOMER_CONFLICT";
    error.remote = remote;
    throw error;
  }
  return remote;
}

function requireCustomerWrite(customer = {}, options = {}) {
  const readiness = canWriteCustomer(customer, {
    ...options,
    target: "supabase",
  });
  if (!readiness.allowed) {
    const error = new Error(readiness.reason || "Customer write naar Supabase is geblokkeerd.");
    error.code = "CUSTOMER_WRITE_BLOCKED";
    error.readiness = readiness;
    throw error;
  }
  return readiness;
}

function supabaseCustomerId(customer = {}, fallbackId = "") {
  return customer._supabaseCustomerId || customer.supabaseCustomerId || customer.id || fallbackId;
}

async function createCustomer(data = {}, options = {}) {
  const target = customerWriteTarget(data, options);
  if (target === "local") {
    const created = localCustomerRepository.create(localCustomerPayload(data));
    logCustomerWrite("customer_created", markCustomerSource(created, getCustomerSource(created)), {
      source: "local",
      changedFields: Object.keys(data).filter(Boolean),
      oldValues: {},
      newValues: data,
    });
    return markCustomerSource(normalizeCustomer(created), created.isDemo || created.environment === "demo" ? "demo" : "local", { localCustomerId: created.id });
  }

  try {
    requireCustomerWrite(data, options);
    const result = await supabaseProvider.createCustomer(mapCustomerWritePayload(data), { customerWrite: true });
    const created = markCustomerSource(mapSupabaseCustomerToLocal(result.data), "supabase", {
      supabaseCustomerId: result.data.id,
      localCustomerId: data.id || data._localCustomerId || "",
    });
    logCustomerWrite("customer_created", created, {
      customerId: created.id,
      supabaseCustomerId: result.data.id,
      source: "supabase",
      changedFields: Object.keys(data).filter(Boolean),
      oldValues: {},
      newValues: data,
    });
    return created;
  } catch (error) {
    logCustomerWrite("customer_write_failed", data, {
      action: "create",
      source: "supabase",
      error: error.message || "Customer aanmaken in Supabase mislukt.",
    });
    throw error;
  }
}

async function updateCustomer(id, data = {}, options = {}) {
  const oldCustomer = options.oldCustomer || data || {};
  const target = customerWriteTarget(oldCustomer, options);
  if (target === "local") {
    const updated = localCustomerRepository.update(id, localCustomerPayload(data));
    if (!updated) throw new Error("Lokale klant niet gevonden.");
    const changes = compareCustomerChanges(oldCustomer, updated);
    logCustomerWrite("customer_updated", markCustomerSource(updated, getCustomerSource(updated)), {
      source: "local",
      changedFields: changes.changedFields,
      oldValues: changes.oldValues,
      newValues: changes.newValues,
    });
    return markCustomerSource(normalizeCustomer(updated), updated.isDemo || updated.environment === "demo" ? "demo" : "local", { localCustomerId: updated.id });
  }

  try {
    requireCustomerWrite(oldCustomer, options);
    const remoteId = supabaseCustomerId(oldCustomer, id);
    await assertNoConflict(remoteId, options.baseUpdatedAt || oldCustomer.updatedAt || oldCustomer.updated_at || "", options);
    const changes = compareCustomerChanges(oldCustomer, data);
    const result = await supabaseProvider.updateCustomer(remoteId, mapCustomerWritePayload({
      ...oldCustomer,
      ...data,
      id: remoteId,
    }), { customerWrite: true });
    const updated = markCustomerSource(mapSupabaseCustomerToLocal(result.data), oldCustomer._source === "hybrid" ? "hybrid" : "supabase", {
      supabaseCustomerId: result.data.id,
      localCustomerId: oldCustomer._localCustomerId || data.id || "",
    });
    logCustomerWrite("customer_updated", updated, {
      customerId: oldCustomer.id || updated.id,
      supabaseCustomerId: remoteId,
      source: oldCustomer._source === "hybrid" ? "hybrid" : "supabase",
      changedFields: changes.changedFields,
      oldValues: changes.oldValues,
      newValues: changes.newValues,
      remoteUpdatedAt: result.data.updated_at || "",
    });
    return updated;
  } catch (error) {
    logCustomerWrite("customer_write_failed", oldCustomer, {
      action: "update",
      source: "supabase",
      error: error.message || "Customer bijwerken in Supabase mislukt.",
      supabaseCustomerId: supabaseCustomerId(oldCustomer, id),
    });
    throw error;
  }
}

async function archiveCustomer(id, options = {}) {
  const customer = options.customer || localCustomerRepository.get(id) || {};
  const target = customerWriteTarget(customer, options);
  if (target === "local") {
    const updated = localCustomerRepository.update(id, { status: "gearchiveerd", archivedAt: nowIso() });
    if (!updated) throw new Error("Lokale klant niet gevonden.");
    logCustomerWrite("customer_archived", updated, { source: "local" });
    return markCustomerSource(normalizeCustomer(updated), getCustomerSource(updated), { localCustomerId: updated.id });
  }

  try {
    requireCustomerWrite(customer, options);
    const remoteId = supabaseCustomerId(customer, id);
    await assertNoConflict(remoteId, options.baseUpdatedAt || customer.updatedAt || customer.updated_at || "", options);
    const result = await supabaseProvider.archiveCustomer(remoteId, { customerWrite: true });
    const archived = markCustomerSource(mapSupabaseCustomerToLocal(result.data), customer._source === "hybrid" ? "hybrid" : "supabase", {
      supabaseCustomerId: result.data.id,
      localCustomerId: customer._localCustomerId || "",
    });
    logCustomerWrite("customer_archived", archived, {
      customerId: customer.id || archived.id,
      supabaseCustomerId: remoteId,
      source: customer._source === "hybrid" ? "hybrid" : "supabase",
    });
    return archived;
  } catch (error) {
    logCustomerWrite("customer_write_failed", customer, {
      action: "archive",
      source: "supabase",
      error: error.message || "Customer archiveren in Supabase mislukt.",
      supabaseCustomerId: supabaseCustomerId(customer, id),
    });
    throw error;
  }
}

async function reactivateCustomer(id, options = {}) {
  const customer = options.customer || localCustomerRepository.get(id) || {};
  const target = customerWriteTarget(customer, options);
  if (target === "local") {
    const updated = localCustomerRepository.update(id, { status: "actief", archivedAt: "", deletedAt: "" });
    if (!updated) throw new Error("Lokale klant niet gevonden.");
    logCustomerWrite("customer_reactivated", updated, { source: "local" });
    return markCustomerSource(normalizeCustomer(updated), getCustomerSource(updated), { localCustomerId: updated.id });
  }

  try {
    requireCustomerWrite(customer, options);
    const remoteId = supabaseCustomerId(customer, id);
    await assertNoConflict(remoteId, options.baseUpdatedAt || customer.updatedAt || customer.updated_at || "", options);
    const result = await supabaseProvider.reactivateCustomer(remoteId, { customerWrite: true });
    const reactivated = markCustomerSource(mapSupabaseCustomerToLocal(result.data), customer._source === "hybrid" ? "hybrid" : "supabase", {
      supabaseCustomerId: result.data.id,
      localCustomerId: customer._localCustomerId || "",
    });
    logCustomerWrite("customer_reactivated", reactivated, {
      customerId: customer.id || reactivated.id,
      supabaseCustomerId: remoteId,
      source: customer._source === "hybrid" ? "hybrid" : "supabase",
    });
    return reactivated;
  } catch (error) {
    logCustomerWrite("customer_write_failed", customer, {
      action: "reactivate",
      source: "supabase",
      error: error.message || "Customer reactiveren in Supabase mislukt.",
      supabaseCustomerId: supabaseCustomerId(customer, id),
    });
    throw error;
  }
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
  createCustomer,
  updateCustomer,
  archiveCustomer,
  reactivateCustomer,
  getCustomerHistory,
  compareCustomerChanges,
  canWriteCustomer,
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
    company: row.company || row.company_name,
    email: row.email,
    phone: row.phone,
    website: row.website,
    package: row.package || row.package_name,
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
