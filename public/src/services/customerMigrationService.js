import { STORAGE_KEYS, getKnownStorageKeys } from "../config/storageKeys.js";
import { getCurrentProviderType } from "../config/environment.js";
import { getSupabaseClientStatus } from "../providers/supabaseClient.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
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

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
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

function recordCountsForKeys(keys = getKnownStorageKeys()) {
  return Object.fromEntries(keys.map((key) => [key, readArray(key).length]));
}

function exportLocalStorageData() {
  return Object.fromEntries(getKnownStorageKeys().map((key) => [key, readJson(key, [])]));
}

function downloadJsonFile(filename, data) {
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return false;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
  return true;
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

export function createPreMigrationBackup(options = {}) {
  const createdAt = nowIso();
  const backup = {
    id: createId("pre-migration-backup"),
    type: "pre_migration_backup",
    migrationType: "customers",
    createdAt,
    recordCounts: recordCountsForKeys(),
    data: exportLocalStorageData(),
  };
  const marker = {
    id: backup.id,
    type: backup.type,
    migrationType: backup.migrationType,
    createdAt,
    recordCounts: backup.recordCounts,
    filename: `maxwebstudio-customers-pre-migration-backup-${createdAt.slice(0, 10)}.json`,
  };
  writeJson(STORAGE_KEYS.lastPreMigrationBackup, marker);
  const logs = readArray(STORAGE_KEYS.migrationLog);
  writeArray(STORAGE_KEYS.migrationLog, [{
    id: backup.id,
    type: "pre_migration_backup",
    createdAt,
    migrationType: "customers",
    status: "created",
    summary: "Pre-migration backup aangemaakt voor CRM klantenmigratie.",
  }, ...logs].slice(0, 50));
  if (options.download !== false) downloadJsonFile(marker.filename, backup);
  return { backup, marker, downloaded: options.download !== false };
}

export function getLastPreMigrationBackup() {
  return readJson(STORAGE_KEYS.lastPreMigrationBackup, null);
}

export function canRunLiveCustomerMigration(options = {}) {
  const analysis = analyzeCustomerData();
  const supabase = getSupabaseClientStatus();
  const providerMode = getCurrentProviderType();
  const lastBackup = getLastPreMigrationBackup();
  const lastDryRun = readArray(STORAGE_KEYS.migrationLog).find((entry) => entry.type === "customer_migration_dry_run");
  const lastReadOnlyTest = readJson(STORAGE_KEYS.lastSupabaseReadOnlyTest, null);
  const readyRecords = getCustomerMigrationWritePreview(options).records.length;
  const missing = [];
  if (!supabase.hasUrl) missing.push("Supabase URL ontbreekt.");
  if (!supabase.hasAnonKey) missing.push("Supabase anon key ontbreekt.");
  if (!["supabase-prepared", "supabase"].includes(providerMode)) missing.push("Provider mode is niet supabase-prepared/supabase.");
  if (!lastDryRun || lastDryRun.status !== "ready") missing.push("Laatste dry-run is niet succesvol of ontbreekt.");
  if (!lastBackup?.id) missing.push("Pre-migration backup ontbreekt in deze browser.");
  if (readyRecords < 1) missing.push("Geen klanten klaar voor migratie met de gekozen opties.");
  if (!supabase.clientPackageAvailable || !supabase.customerWritesEnabled) missing.push("Supabase client package nog niet actief; live migratie blijft geblokkeerd.");
  if (!supabase.clientPackageAvailable) missing.push("Supabase client is niet geladen.");
  if (!lastReadOnlyTest?.connected && !lastReadOnlyTest?.success) missing.push("Supabase read-only connectietest ontbreekt of is niet succesvol.");
  const customersTableConfirmed = lastReadOnlyTest?.customersTableAccessible === true
    || (lastReadOnlyTest?.tableName === "customers" && lastReadOnlyTest?.success === true);
  if (!customersTableConfirmed) missing.push("Customers table check ontbreekt of is niet succesvol.");
  return {
    allowed: missing.length === 0,
    missing,
    providerMode,
    supabase,
    lastBackup,
    lastDryRun,
    lastReadOnlyTest,
    readyRecords,
    analysis,
  };
}

export function getCustomerMigrationWritePreview(options = {}) {
  const {
    includeDemo = false,
    includeProduction = true,
    batchSize = 25,
    skipDuplicates = true,
  } = options;
  const analysis = analyzeCustomerData();
  const duplicateIds = new Set(analysis.duplicates.map((item) => item.customer.id).filter(Boolean));
  const records = analysis.payload.filter((row) => {
    const isDemo = row.is_demo || row.is_demo_journey || row.environment === "demo";
    if (isDemo && !includeDemo) return false;
    if (!isDemo && !includeProduction) return false;
    if (skipDuplicates && duplicateIds.has(row.id)) return false;
    return true;
  });
  return {
    targetTable: "customers",
    includeDemo,
    includeProduction,
    skipDuplicates,
    batchSize: Number(batchSize || 25),
    readyCount: records.length,
    demoCount: records.filter((row) => row.environment === "demo").length,
    productionCount: records.filter((row) => row.environment !== "demo").length,
    duplicateCount: analysis.duplicateCount,
    skippedCount: analysis.payload.length - records.length,
    remoteDuplicateCheck: false,
    remoteDuplicateWarning: "Remote duplicate-check niet beschikbaar.",
    records,
    preview: records.slice(0, 10),
  };
}

export async function runCustomerMigrationBatch(options = {}) {
  const normalizedOptions = {
    includeDemo: Boolean(options.includeDemo),
    includeProduction: options.includeProduction !== false,
    batchSize: Number(options.batchSize || 25),
    dryRunOnly: options.dryRunOnly !== false,
    skipDuplicates: options.skipDuplicates !== false,
  };
  const startedAt = nowIso();
  const writePreview = getCustomerMigrationWritePreview(normalizedOptions);
  const readiness = canRunLiveCustomerMigration(normalizedOptions);
  const backup = readiness.lastBackup;
  const dryRun = readiness.lastDryRun;
  const result = {
    id: createId("customer-live-migration"),
    type: "customer_live_migration",
    status: "blocked",
    startedAt,
    completedAt: "",
    totalAttempted: writePreview.records.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    backupId: backup?.id || "",
    dryRunId: dryRun?.id || "",
    includeDemo: normalizedOptions.includeDemo,
    includeProduction: normalizedOptions.includeProduction,
    batchSize: normalizedOptions.batchSize,
    batches: Math.ceil(writePreview.records.length / normalizedOptions.batchSize) || 0,
    dryRunOnly: normalizedOptions.dryRunOnly,
    summary: "",
  };
  if (normalizedOptions.dryRunOnly) {
    result.status = "dry_run_only";
    result.skipped = writePreview.records.length;
    result.summary = "Batch migratie voorbereid als dry-run only. Geen Supabase writes uitgevoerd.";
  } else if (!readiness.allowed) {
    result.errors = readiness.missing;
    result.failed = writePreview.records.length;
    result.summary = `Live migratie geblokkeerd: ${readiness.missing.join(" ")}`;
  } else {
    for (let index = 0; index < writePreview.records.length; index += normalizedOptions.batchSize) {
      const batch = writePreview.records.slice(index, index + normalizedOptions.batchSize);
      for (const record of batch) {
        try {
          await supabaseProvider.create("customers", record);
          result.inserted += 1;
        } catch (error) {
          result.failed += 1;
          result.errors.push(`${record.email || record.id || "record"}: ${error.message}`);
        }
      }
    }
    result.status = result.failed ? "failed" : "completed";
    result.summary = result.failed
      ? "CRM live migratie afgerond met fouten. Provider blijft localStorage."
      : "CRM live migratie afgerond. Provider blijft localStorage.";
  }
  result.completedAt = nowIso();
  const logs = readArray(STORAGE_KEYS.migrationLog);
  writeArray(STORAGE_KEYS.migrationLog, [result, ...logs].slice(0, 50));
  return {
    ...result,
    providerStillLocal: true,
    writePreview,
    readiness,
  };
}

export function getCustomerMigrationLogs(limit = 5) {
  return readArray(STORAGE_KEYS.migrationLog)
    .filter((entry) => ["customer_migration_dry_run", "customer_live_migration", "pre_migration_backup"].includes(entry.type))
    .slice(0, limit);
}

export function mapCustomerForPreview(customer) {
  return mapLocalCustomerToSupabase(customer);
}
