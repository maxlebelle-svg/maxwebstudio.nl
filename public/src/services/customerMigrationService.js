import { STORAGE_KEYS, getKnownStorageKeys } from "../config/storageKeys.js";
import { getCurrentProviderType, PROVIDERS } from "../config/environment.js";
import { getSupabaseClientStatus } from "../providers/supabaseClient.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import {
  mapLocalCustomerToSupabase,
  prepareCustomersForMigration,
  validateCustomerForSupabase,
} from "../repositories/CustomerRepository.js";
import { normalizeCustomer, customerIdentityKeys } from "../utils/customerNormalizer.js";
import { logActivity } from "./activityLogService.js";

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

function readSessionJson(key, fallback = null) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSessionJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session markers only gate risky actions; local logs still keep display history.
  }
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

function sessionKey(name) {
  return `${name}:session`;
}

function latestMigrationLogs(type) {
  return readArray(STORAGE_KEYS.migrationLog).filter((entry) => entry.type === type);
}

function logMigrationEntry(entry) {
  writeArray(STORAGE_KEYS.migrationLog, [entry, ...readArray(STORAGE_KEYS.migrationLog)].slice(0, 120));
  return entry;
}

function logDryRun(analysis) {
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
  logMigrationEntry(entry);
  writeSessionJson(sessionKey("customer_migration_dry_run"), entry);
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
  const log = logMigrationEntry({
    id: backup.id,
    type: "pre_migration_backup",
    createdAt,
    migrationType: "customers",
    status: "created",
    summary: "Pre-migration backup aangemaakt voor CRM klantenmigratie.",
  });
  writeSessionJson(sessionKey("pre_migration_backup"), marker);
  if (options.download !== false) downloadJsonFile(marker.filename, backup);
  return { backup, marker, log, downloaded: options.download !== false };
}

export function getLastPreMigrationBackup() {
  return readJson(STORAGE_KEYS.lastPreMigrationBackup, null);
}

function isDeveloperModeEnabled() {
  return Boolean(readJson(STORAGE_KEYS.settings, {})?.developerMode);
}

function normalizeMigrationOptions(options = {}) {
  return {
    includeDemo: Boolean(options.includeDemo),
    includeProduction: options.includeProduction !== false,
    batchSize: Math.max(1, Math.min(Number(options.batchSize || 10), 100)),
    skipDuplicates: options.skipDuplicates !== false,
    stopOnError: options.stopOnError !== false,
    allowRemoteDuplicateWarning: Boolean(options.allowRemoteDuplicateWarning),
  };
}

function optionsSignature(options = {}) {
  const normalized = normalizeMigrationOptions(options);
  return JSON.stringify({
    includeDemo: normalized.includeDemo,
    includeProduction: normalized.includeProduction,
    batchSize: normalized.batchSize,
    skipDuplicates: normalized.skipDuplicates,
    stopOnError: normalized.stopOnError,
  });
}

export function canRunLiveCustomerMigration(options = {}) {
  const normalizedOptions = normalizeMigrationOptions(options);
  const analysis = analyzeCustomerData();
  const supabase = getSupabaseClientStatus();
  const providerMode = getCurrentProviderType();
  const lastBackup = getLastPreMigrationBackup();
  const sessionBackup = readSessionJson(sessionKey("pre_migration_backup"), null);
  const sessionDryRun = readSessionJson(sessionKey("customer_migration_dry_run"), null);
  const sessionWritePreview = readSessionJson(sessionKey(STORAGE_KEYS.lastCustomerWritePreview), null);
  const sessionWriteTest = readSessionJson(sessionKey(STORAGE_KEYS.lastSupabaseWriteTest), null);
  const lastDryRun = sessionDryRun || latestMigrationLogs("customer_migration_dry_run")[0];
  const lastReadOnlyTest = readJson(STORAGE_KEYS.lastSupabaseReadOnlyTest, null);
  const lastWriteTest = readJson(STORAGE_KEYS.lastSupabaseWriteTest, null);
  const writePreview = getCustomerMigrationWritePreview(normalizedOptions);
  const readyRecords = writePreview.records.length;
  const missing = [];
  if (!isDeveloperModeEnabled()) missing.push("Developer Mode staat niet aan.");
  if (!supabase.hasUrl) missing.push("Supabase URL ontbreekt.");
  if (!supabase.hasAnonKey) missing.push("Supabase anon key ontbreekt.");
  if (![PROVIDERS.SUPABASE_WRITE_TEST, PROVIDERS.SUPABASE_MIGRATION].includes(providerMode)) {
    missing.push("Provider mode is niet supabase-write-test of supabase-migration.");
  }
  if (!sessionDryRun?.id || !["ready", "attention_needed"].includes(sessionDryRun.status)) {
    missing.push("Dry-run succesvol binnen huidige sessie ontbreekt.");
  }
  if (!lastDryRun || !["ready", "attention_needed"].includes(lastDryRun.status)) missing.push("Laatste dry-run is niet uitgevoerd.");
  if (!lastBackup?.id || !sessionBackup?.id || sessionBackup.id !== lastBackup.id) {
    missing.push("Pre-migration backup binnen huidige sessie ontbreekt.");
  }
  if (!sessionWritePreview?.id || sessionWritePreview.signature !== optionsSignature(normalizedOptions)) {
    missing.push("Write preview met huidige opties is nog niet bekeken in deze sessie.");
  }
  if (readyRecords < 1) missing.push("Geen klanten klaar voor migratie met de gekozen opties.");
  if (!supabase.clientPackageAvailable) missing.push("Supabase client is niet geladen.");
  if (!lastReadOnlyTest?.connected && !lastReadOnlyTest?.success) missing.push("Supabase read-only connectietest ontbreekt of is niet succesvol.");
  const customersTableConfirmed = lastReadOnlyTest?.customersTableAccessible === true
    || (lastReadOnlyTest?.tableName === "customers" && lastReadOnlyTest?.success === true);
  if (!customersTableConfirmed) missing.push("Customers table check ontbreekt of is niet succesvol.");
  if (lastWriteTest?.status !== "completed" || sessionWriteTest?.status !== "completed") {
    missing.push("Supabase write-test succesvol binnen huidige sessie ontbreekt.");
  }
  return {
    allowed: missing.length === 0,
    missing,
    providerMode,
    developerMode: isDeveloperModeEnabled(),
    supabase,
    lastBackup,
    sessionBackup,
    lastDryRun,
    sessionDryRun,
    lastReadOnlyTest,
    lastWriteTest,
    sessionWriteTest,
    sessionWritePreview,
    readyRecords,
    writePreview,
    analysis,
  };
}

export function getCustomerMigrationWritePreview(options = {}) {
  const {
    includeDemo,
    includeProduction,
    batchSize,
    skipDuplicates,
  } = normalizeMigrationOptions(options);
  const analysis = analyzeCustomerData();
  const duplicateIds = new Set(analysis.duplicates.map((item) => item.customer.id).filter(Boolean));
  const skipped = [];
  const entries = analysis.readyCustomers.map((localCustomer) => {
    const row = mapLocalCustomerToSupabase(localCustomer);
    row.metadata = {
      ...(row.metadata || {}),
      migrationPreparedBy: "customerMigrationService",
      migrationPreparedAt: nowIso(),
    };
    const isDemo = row.is_demo || row.is_demo_journey || row.environment === "demo";
    const reasons = [];
    if (isDemo && !includeDemo) reasons.push("Demo-klant uitgesloten door opties.");
    if (!isDemo && !includeProduction) reasons.push("Productieklant uitgesloten door opties.");
    if (skipDuplicates && duplicateIds.has(row.id)) reasons.push("Lokale duplicate overgeslagen.");
    return {
      localCustomer,
      supabaseRecord: row,
      isDemo,
      skipped: reasons.length > 0,
      reasons,
    };
  });
  const readyEntries = entries.filter((entry) => !entry.skipped);
  entries.filter((entry) => entry.skipped).forEach((entry) => {
    skipped.push({
      localCustomerId: entry.localCustomer.id || entry.supabaseRecord.id,
      email: entry.supabaseRecord.email || "",
      company: entry.supabaseRecord.company_name || "",
      reasons: entry.reasons,
    });
  });
  const records = readyEntries.map((entry) => entry.supabaseRecord);
  return {
    id: createId("customer-write-preview"),
    targetTable: "customers",
    includeDemo,
    includeProduction,
    skipDuplicates,
    batchSize,
    signature: optionsSignature({ includeDemo, includeProduction, batchSize, skipDuplicates }),
    readyCount: records.length,
    demoCount: records.filter((row) => row.environment === "demo").length,
    productionCount: records.filter((row) => row.environment !== "demo").length,
    duplicateCount: analysis.duplicateCount,
    skippedCount: skipped.length,
    remoteDuplicateCheck: true,
    remoteDuplicateWarning: "Remote duplicate-check wordt tijdens live migratie per klant uitgevoerd.",
    skipped,
    entries: readyEntries,
    records,
    preview: records.slice(0, 10),
  };
}

export function markCustomerWritePreviewViewed(options = {}) {
  const preview = getCustomerMigrationWritePreview(options);
  const marker = {
    id: preview.id,
    type: "customer_write_preview",
    status: "viewed",
    viewedAt: nowIso(),
    signature: preview.signature,
    readyCount: preview.readyCount,
    includeDemo: preview.includeDemo,
    includeProduction: preview.includeProduction,
    batchSize: preview.batchSize,
    skipDuplicates: preview.skipDuplicates,
  };
  writeJson(STORAGE_KEYS.lastCustomerWritePreview, marker);
  writeSessionJson(sessionKey(STORAGE_KEYS.lastCustomerWritePreview), marker);
  logMigrationEntry({
    ...marker,
    createdAt: marker.viewedAt,
    summary: `${preview.readyCount} customer records bekeken in write preview.`,
  });
  return preview;
}

function logCustomerMigrationItem(type, payload = {}) {
  const entry = {
    id: createId(`customer-live-migration-${type}`),
    type: `customer_live_migration_${type}`,
    createdAt: nowIso(),
    ...payload,
  };
  logMigrationEntry(entry);
  return entry;
}

function localDuplicateReason(localCustomer, batchId) {
  const normalized = normalizeCustomer(localCustomer);
  if (normalized.migrationStatus === "migrated" || normalized.supabaseCustomerId) {
    return `Klant is lokaal al gemarkeerd als gemigreerd (${normalized.supabaseCustomerId || "zonder Supabase id"}).`;
  }
  const identities = customerIdentityKeys(normalized);
  const migrated = getLocalCustomers().map(normalizeCustomer).find((customer) => {
    if (customer.id === normalized.id) return false;
    if (customer.migrationBatchId === batchId) return false;
    if (customer.supabaseCustomerId && customer.email && normalized.email && customer.email === normalized.email) return true;
    if (customer.supabaseCustomerId && customer.company && normalized.company && customer.company === normalized.company && customer.phone === normalized.phone) return true;
    return false;
  });
  if (!migrated) return "";
  const migratedKeys = customerIdentityKeys(migrated);
  if (identities.email && identities.email === migratedKeys.email) return "E-mailadres is lokaal al gekoppeld aan een gemigreerde klant.";
  if (identities.companyPhone && identities.companyPhone === migratedKeys.companyPhone) return "Bedrijf + telefoon is lokaal al gekoppeld aan een gemigreerde klant.";
  return "Lokale duplicate met bestaande gemigreerde klant.";
}

async function checkRemoteDuplicate(record, options = {}) {
  const result = await supabaseProvider.findDuplicateCustomer(record);
  if (result.warning && !options.allowRemoteDuplicateWarning) {
    throw new Error(`Remote duplicate-check gaf waarschuwing en is niet expliciet bevestigd: ${result.warning}`);
  }
  return result;
}

export function markCustomerAsMigrated(localCustomer, supabaseResult, context = {}) {
  const sourceKeys = [localCustomer.sourceKey, STORAGE_KEYS.crmCustomers, STORAGE_KEYS.customers].filter(Boolean);
  const updatedAt = nowIso();
  for (const sourceKey of sourceKeys) {
    const records = readArray(sourceKey);
    const index = records.findIndex((record) => String(record.id || "") === String(localCustomer.id || ""));
    if (index < 0) continue;
    const original = records[index];
    records[index] = {
      ...original,
      supabaseCustomerId: supabaseResult?.data?.id || supabaseResult?.id || "",
      migratedToSupabaseAt: updatedAt,
      migrationStatus: "migrated",
      migrationBatchId: context.batchId || "",
      lastMigrationProvider: PROVIDERS.SUPABASE_MIGRATION,
      migrationOriginalData: original.migrationOriginalData || original,
      updatedAt,
    };
    writeArray(sourceKey, records);
    return records[index];
  }
  return null;
}

export async function migrateCustomerBatch(customers = [], options = {}) {
  const normalizedOptions = normalizeMigrationOptions(options);
  const batchId = options.batchId || createId("customer-migration-batch");
  const batchResult = {
    batchId,
    attempted: customers.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    migrated: [],
    skippedRecords: [],
    errors: [],
    warnings: [],
  };
  for (const entry of customers) {
    const localCustomer = entry.localCustomer || entry;
    const record = entry.supabaseRecord || mapLocalCustomerToSupabase(localCustomer);
    record.metadata = {
      ...(record.metadata || {}),
      migrationPreparedBy: "customerMigrationService",
      migrationBatchId: batchId,
    };
    const validation = validateCustomerForSupabase(localCustomer);
    const baseLog = {
      batchId,
      localCustomerId: localCustomer.id || record.metadata?.localStorageId || record.id || "",
      email: record.email || "",
      company: record.company_name || "",
    };
    if (!validation.ready) {
      const reason = validation.errors.join(" ");
      batchResult.skipped += 1;
      batchResult.skippedRecords.push({ ...baseLog, reason });
      logCustomerMigrationItem("skipped", { ...baseLog, status: "skipped", reason });
      logActivity("developer_tools", "customers", "customer_live_migration_skipped", { ...baseLog, reason });
      continue;
    }
    if (normalizedOptions.skipDuplicates) {
      const reason = localDuplicateReason(localCustomer, batchId);
      if (reason) {
        batchResult.skipped += 1;
        batchResult.skippedRecords.push({ ...baseLog, reason });
        logCustomerMigrationItem("skipped", { ...baseLog, status: "skipped", reason });
        logActivity("developer_tools", "customers", "customer_live_migration_skipped", { ...baseLog, reason });
        continue;
      }
    }
    try {
      const remoteDuplicate = await checkRemoteDuplicate(record, normalizedOptions);
      if (remoteDuplicate.warning) batchResult.warnings.push(`${record.email || record.id}: ${remoteDuplicate.warning}`);
      if (remoteDuplicate.duplicate && normalizedOptions.skipDuplicates) {
        const reason = `Remote duplicate gevonden via ${remoteDuplicate.type}.`;
        batchResult.skipped += 1;
        batchResult.skippedRecords.push({ ...baseLog, reason, supabaseCustomerId: remoteDuplicate.data?.id || "" });
        logCustomerMigrationItem("skipped", { ...baseLog, supabaseCustomerId: remoteDuplicate.data?.id || "", status: "skipped", reason });
        logActivity("developer_tools", "customers", "customer_live_migration_skipped", { ...baseLog, reason });
        continue;
      }
      const inserted = await supabaseProvider.create("customers", record);
      const marked = markCustomerAsMigrated(localCustomer, inserted, { batchId });
      const supabaseCustomerId = inserted.data?.id || record.id || "";
      batchResult.inserted += 1;
      batchResult.migrated.push({ ...baseLog, supabaseCustomerId, marked: Boolean(marked) });
      logCustomerMigrationItem("migrated", { ...baseLog, supabaseCustomerId, status: "migrated" });
      logActivity("developer_tools", "customers", "customer_live_migration_customer_migrated", { ...baseLog, supabaseCustomerId });
    } catch (error) {
      batchResult.failed += 1;
      batchResult.errors.push({ ...baseLog, error: error.message || "Onbekende migratiefout." });
      logCustomerMigrationItem("failed", { ...baseLog, status: "failed", error: error.message || "Onbekende migratiefout." });
      logActivity("developer_tools", "customers", "customer_live_migration_customer_failed", { ...baseLog, error: error.message });
      if (normalizedOptions.stopOnError) break;
    }
  }
  return batchResult;
}

export async function runLiveCustomerMigration(options = {}) {
  const normalizedOptions = normalizeMigrationOptions(options);
  const startedAt = nowIso();
  const writePreview = getCustomerMigrationWritePreview(normalizedOptions);
  const readiness = canRunLiveCustomerMigration(normalizedOptions);
  const backup = readiness.lastBackup;
  const dryRun = readiness.lastDryRun;
  const result = {
    id: createId("customer-live-migration"),
    type: "customer_live_migration",
    status: "blocked",
    batchId: createId("customer-migration-batch"),
    startedAt,
    completedAt: "",
    totalAttempted: writePreview.records.length,
    successful: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    warnings: [],
    skippedReasons: [],
    migrated: [],
    backupId: backup?.id || "",
    dryRunId: dryRun?.id || "",
    includeDemo: normalizedOptions.includeDemo,
    includeProduction: normalizedOptions.includeProduction,
    batchSize: normalizedOptions.batchSize,
    batches: Math.ceil(writePreview.records.length / normalizedOptions.batchSize) || 0,
    skipDuplicates: normalizedOptions.skipDuplicates,
    stopOnError: normalizedOptions.stopOnError,
    dryRunOnly: false,
    summary: "",
    rollback: "Rollback is handmatig: gebruik backup om lokale data te herstellen en verwijder test/migratierecords in Supabase handmatig indien nodig.",
  };
  logCustomerMigrationItem("started", {
    batchId: result.batchId,
    status: "started",
    includeDemo: result.includeDemo,
    includeProduction: result.includeProduction,
    totalAttempted: result.totalAttempted,
  });
  logActivity("developer_tools", "customers", "customer_live_migration_started", {
    batchId: result.batchId,
    totalAttempted: result.totalAttempted,
  });
  if (!readiness.allowed) {
    result.errors = readiness.missing;
    result.failed = writePreview.records.length;
    result.summary = `Live migratie geblokkeerd: ${readiness.missing.join(" ")}`;
    logCustomerMigrationItem("failed", { batchId: result.batchId, status: "blocked", error: result.summary });
  } else {
    for (let index = 0; index < writePreview.entries.length; index += normalizedOptions.batchSize) {
      const batch = writePreview.entries.slice(index, index + normalizedOptions.batchSize);
      const batchResult = await migrateCustomerBatch(batch, { ...normalizedOptions, batchId: result.batchId });
      result.successful += batchResult.inserted;
      result.inserted = result.successful;
      result.skipped += batchResult.skipped;
      result.failed += batchResult.failed;
      result.migrated.push(...batchResult.migrated);
      result.skippedReasons.push(...batchResult.skippedRecords);
      result.errors.push(...batchResult.errors);
      result.warnings.push(...batchResult.warnings);
      if (normalizedOptions.stopOnError && batchResult.failed) break;
    }
    result.status = result.failed ? "failed" : "completed";
    result.summary = result.failed
      ? "CRM live migratie afgerond met fouten. Provider blijft localStorage."
      : "CRM live migratie afgerond. Provider blijft localStorage.";
    logCustomerMigrationItem(result.failed ? "failed" : "completed", {
      batchId: result.batchId,
      status: result.status,
      successful: result.successful,
      skipped: result.skipped,
      failed: result.failed,
      summary: result.summary,
    });
    logActivity("developer_tools", "customers", result.failed ? "customer_live_migration_failed" : "customer_live_migration_completed", {
      batchId: result.batchId,
      successful: result.successful,
      skipped: result.skipped,
      failed: result.failed,
    });
  }
  result.completedAt = nowIso();
  logMigrationEntry(result);
  writeJson(STORAGE_KEYS.lastCustomerMigrationResult, result);
  return {
    ...result,
    providerStillLocal: true,
    writePreview,
    readiness,
  };
}

export async function runCustomerMigrationBatch(options = {}) {
  if (options.dryRunOnly !== false) {
    const normalizedOptions = normalizeMigrationOptions(options);
    const writePreview = getCustomerMigrationWritePreview(normalizedOptions);
    const result = {
      id: createId("customer-live-migration"),
      type: "customer_live_migration",
      status: "dry_run_only",
      startedAt: nowIso(),
      completedAt: nowIso(),
      totalAttempted: writePreview.records.length,
      successful: 0,
      inserted: 0,
      skipped: writePreview.records.length,
      failed: 0,
      errors: [],
      includeDemo: normalizedOptions.includeDemo,
      includeProduction: normalizedOptions.includeProduction,
      batchSize: normalizedOptions.batchSize,
      batches: Math.ceil(writePreview.records.length / normalizedOptions.batchSize) || 0,
      dryRunOnly: true,
      summary: "Batch migratie voorbereid als dry-run only. Geen Supabase writes uitgevoerd.",
    };
    logMigrationEntry(result);
    writeJson(STORAGE_KEYS.lastCustomerMigrationResult, result);
    return { ...result, providerStillLocal: true, writePreview, readiness: canRunLiveCustomerMigration(normalizedOptions) };
  }
  return runLiveCustomerMigration(options);
}

export function getCustomerMigrationResult() {
  return readJson(STORAGE_KEYS.lastCustomerMigrationResult, null);
}

export function getCustomerMigrationLogs(limit = 5) {
  return readArray(STORAGE_KEYS.migrationLog)
    .filter((entry) => [
      "customer_migration_dry_run",
      "customer_live_migration",
      "customer_live_migration_started",
      "customer_live_migration_migrated",
      "customer_live_migration_skipped",
      "customer_live_migration_failed",
      "customer_live_migration_completed",
      "pre_migration_backup",
      "customer_write_preview",
    ].includes(entry.type))
    .slice(0, limit);
}

export function mapCustomerForPreview(customer) {
  return mapLocalCustomerToSupabase(customer);
}
