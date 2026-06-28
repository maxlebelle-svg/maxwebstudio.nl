import { STORAGE_KEYS } from "../config/storageKeys.js";
import {
  mapLocalCustomerToSupabase,
  prepareCustomersForMigration,
  validateCustomerForSupabase,
} from "../repositories/CustomerRepository.js";
import { normalizeCustomer, customerIdentityKeys } from "../utils/customerNormalizer.js";

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix = "migration") {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function getLocalCustomers() {
  return [
    ...readArray(STORAGE_KEYS.crmCustomers).map((customer) => ({ ...customer, sourceKey: STORAGE_KEYS.crmCustomers })),
    ...readArray(STORAGE_KEYS.customers).map((customer) => ({ ...customer, sourceKey: STORAGE_KEYS.customers })),
  ];
}

export function detectDuplicateCustomers(customers = getLocalCustomers()) {
  const seen = new Map();
  const duplicates = [];
  customers.map(normalizeCustomer).forEach((customer) => {
    const keys = customerIdentityKeys(customer);
    const identities = [
      keys.id && { type: "id", value: keys.id },
      keys.email && { type: "email", value: keys.email },
      keys.companyPhone && { type: "company_phone", value: keys.companyPhone },
    ].filter(Boolean);
    const duplicate = identities.find((key) => seen.has(`${key.type}:${key.value}`));
    if (duplicate) {
      const identity = `${duplicate.type}:${duplicate.value}`;
      duplicates.push({
        key: identity,
        type: duplicate.type,
        value: duplicate.value,
        customer,
        duplicateOf: seen.get(identity),
      });
      return;
    }
    identities.forEach((key) => seen.set(`${key.type}:${key.value}`, customer));
  });
  return duplicates;
}

export function detectMissingCustomerFields(customers = getLocalCustomers()) {
  return customers.map((customer) => {
    const validation = validateCustomerForSupabase(customer);
    return {
      id: validation.id,
      customer: validation.normalized,
      errors: validation.errors,
      warnings: validation.warnings,
      missing: [...validation.errors, ...validation.warnings],
    };
  }).filter((item) => item.missing.length);
}

export function prepareCustomerMigrationPayload(customers = getLocalCustomers()) {
  return prepareCustomersForMigration(customers).payload;
}

export function analyzeCustomerData() {
  const customers = getLocalCustomers();
  const prepared = prepareCustomersForMigration(customers);
  const duplicates = detectDuplicateCustomers(customers);
  const missingFields = detectMissingCustomerFields(customers);
  const demoCustomers = prepared.unique.filter((customer) => customer.isDemo || customer.environment === "demo");
  const demoJourneyCustomers = prepared.unique.filter((customer) => customer.isDemoJourney || customer.demoJourneyId);
  const productionCustomers = prepared.unique.filter((customer) => !customer.isDemo && !customer.isDemoJourney && customer.environment !== "demo");
  return {
    totalCustomers: customers.length,
    uniqueCustomers: prepared.unique.length,
    demoCustomers: demoCustomers.length,
    demoJourneyCustomers: demoJourneyCustomers.length,
    productionCustomers: productionCustomers.length,
    duplicateCount: duplicates.length,
    missingFieldCount: missingFields.length,
    readyCount: prepared.ready.length,
    attentionCount: prepared.attention.length,
    duplicates,
    missingFields,
    validation: prepared.validation,
    readyCustomers: prepared.ready.map((item) => item.normalized),
    payload: prepared.payload,
  };
}

export function getCustomerMigrationPreview() {
  const analysis = analyzeCustomerData();
  return {
    summary: {
      totalCustomers: analysis.totalCustomers,
      uniqueCustomers: analysis.uniqueCustomers,
      readyCount: analysis.readyCount,
      duplicateCount: analysis.duplicateCount,
      missingFieldCount: analysis.missingFieldCount,
      demoCustomers: analysis.demoCustomers,
      productionCustomers: analysis.productionCustomers,
    },
    rows: analysis.payload.slice(0, 12).map((row) => ({
      localId: row.metadata?.localStorageId || row.id,
      supabase: row,
    })),
  };
}

function logDryRun(analysis) {
  const logs = readArray(STORAGE_KEYS.migrationLog);
  const entry = {
    id: createId("customer-migration-dry-run"),
    type: "customer_migration_dry_run",
    createdAt: nowIso(),
    totalCustomers: analysis.totalCustomers,
    readyCount: analysis.readyCount,
    duplicateCount: analysis.duplicateCount,
    missingFieldCount: analysis.missingFieldCount,
    demoCount: analysis.demoCustomers + analysis.demoJourneyCustomers,
    status: analysis.duplicateCount || analysis.missingFieldCount ? "attention_needed" : "ready",
    summary: `${analysis.readyCount}/${analysis.uniqueCustomers} unieke klanten klaar voor CRM Supabase dry-run.`,
  };
  writeArray(STORAGE_KEYS.migrationLog, [entry, ...logs].slice(0, 50));
  return entry;
}

export function runCustomerMigrationDryRun() {
  const analysis = analyzeCustomerData();
  const log = logDryRun(analysis);
  return {
    ...analysis,
    dryRun: true,
    writesExecuted: false,
    log,
  };
}

export function getCustomerMigrationLogs(limit = 5) {
  return readArray(STORAGE_KEYS.migrationLog)
    .filter((entry) => entry.type === "customer_migration_dry_run")
    .slice(0, limit);
}

export function mapCustomerForPreview(customer) {
  return mapLocalCustomerToSupabase(customer);
}
