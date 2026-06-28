import { STORAGE_KEYS, getKnownStorageKeys } from "../config/storageKeys.js";
import { validateLocalStorageData } from "./dataValidationService.js";

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function getRecordCounts() {
  return Object.fromEntries(getKnownStorageKeys().map((key) => [key, readArray(key).length]));
}

export function getSupabaseTableMapping() {
  return [
    { module: "profiles", table: "profiles", keys: [STORAGE_KEYS.crmCustomers, STORAGE_KEYS.customers], relation: "auth_user_id -> auth.users.id", status: "prepared" },
    { module: "customers", table: "customers", keys: [STORAGE_KEYS.crmCustomers, STORAGE_KEYS.customers], relation: "profile_id -> profiles.id", status: "prepared" },
    { module: "leads", table: "leads", keys: [STORAGE_KEYS.leads, STORAGE_KEYS.leadRequests], relation: "converted_customer_id -> customers.id", status: "prepared" },
    { module: "websites", table: "websites", keys: [STORAGE_KEYS.managedSites, STORAGE_KEYS.websites], relation: "customer_id -> customers.id", status: "prepared" },
    { module: "projects", table: "projects", keys: [STORAGE_KEYS.projects], relation: "customer_id -> customers.id, website_id -> websites.id", status: "prepared" },
    { module: "files", table: "files", keys: [STORAGE_KEYS.files], relation: "customer_id/project_id/website_id", status: "prepared" },
    { module: "quotes", table: "quotes", keys: [STORAGE_KEYS.quotes], relation: "customer_id -> customers.id", status: "prepared" },
    { module: "quoteLines", table: "quote_lines", keys: [STORAGE_KEYS.quotes], relation: "quote_id -> quotes.id; split from quote.lines[]", status: "prepared" },
    { module: "invoices", table: "invoices", keys: [STORAGE_KEYS.invoices], relation: "customer_id/source_quote_id/subscription_id", status: "prepared" },
    { module: "invoiceLines", table: "invoice_lines", keys: [STORAGE_KEYS.invoices], relation: "invoice_id -> invoices.id; split from invoice.lines[]", status: "prepared" },
    { module: "subscriptions", table: "subscriptions", keys: [STORAGE_KEYS.subscriptions], relation: "customer_id/website_id/last_invoice_id", status: "prepared" },
    { module: "settings", table: "settings", keys: [STORAGE_KEYS.settings], relation: "workspace_key = default", status: "prepared" },
    { module: "demoEmails", table: "demo_emails", keys: [STORAGE_KEYS.demoEmails], relation: "customer_id -> customers.id", status: "prepared" },
    { module: "activityLogs", table: "activity_logs", keys: [STORAGE_KEYS.activityLog], relation: "profile_id -> profiles.id; entity reference is polymorphic", status: "prepared" },
    { module: "importLogs", table: "import_logs", keys: [STORAGE_KEYS.importLog], relation: "standalone import history", status: "prepared" },
  ];
}

export function findMissingRequiredFields() {
  return validateLocalStorageData().issues.filter((issue) => issue.message.includes("mist"));
}

export function findBrokenReferences() {
  const warnings = [];
  const customerIds = new Set(readArray(STORAGE_KEYS.crmCustomers).map((record) => record.id));
  const websiteIds = new Set(readArray(STORAGE_KEYS.managedSites).map((record) => record.id));
  const projectIds = new Set(readArray(STORAGE_KEYS.projects).map((record) => record.id));
  const quoteIds = new Set(readArray(STORAGE_KEYS.quotes).map((record) => record.id));

  const checkCustomer = (module, record) => {
    const customerId = record.profileId || record.customerId;
    if (customerId && !customerIds.has(customerId)) warnings.push({ module, id: record.id, message: "Klantreferentie niet gevonden." });
  };
  readArray(STORAGE_KEYS.quotes).forEach((record) => checkCustomer("quotes", record));
  readArray(STORAGE_KEYS.invoices).forEach((record) => {
    checkCustomer("invoices", record);
    if (record.sourceQuoteId && !quoteIds.has(record.sourceQuoteId)) warnings.push({ module: "invoices", id: record.id, message: "Offerte-referentie niet gevonden." });
  });
  readArray(STORAGE_KEYS.managedSites).forEach((record) => checkCustomer("websites", record));
  readArray(STORAGE_KEYS.projects).forEach((record) => {
    checkCustomer("projects", record);
    if (record.websiteId && !websiteIds.has(record.websiteId)) warnings.push({ module: "projects", id: record.id, message: "Website-referentie niet gevonden." });
  });
  readArray(STORAGE_KEYS.subscriptions).forEach((record) => {
    checkCustomer("subscriptions", record);
    if (record.websiteId && !websiteIds.has(record.websiteId)) warnings.push({ module: "subscriptions", id: record.id, message: "Website-referentie niet gevonden." });
  });
  readArray(STORAGE_KEYS.files).forEach((record) => {
    checkCustomer("files", record);
    if (record.websiteId && !websiteIds.has(record.websiteId)) warnings.push({ module: "files", id: record.id, message: "Website-referentie niet gevonden." });
    if (record.projectId && !projectIds.has(record.projectId)) warnings.push({ module: "files", id: record.id, message: "Project-referentie niet gevonden." });
  });
  return warnings;
}

function getPrimaryCustomerIds() {
  return new Set([
    ...readArray(STORAGE_KEYS.crmCustomers).map((record) => record.id),
    ...readArray(STORAGE_KEYS.customers).map((record) => record.id),
  ].filter(Boolean));
}

function migrationRecordState(records, isReady) {
  const ready = [];
  const blocked = [];
  const demo = [];
  const production = [];
  records.forEach((record) => {
    if (record.isDemo || record.isDemoJourney || record.environment === "demo") demo.push(record);
    else production.push(record);
    if (isReady(record)) ready.push(record);
    else blocked.push(record);
  });
  return {
    total: records.length,
    ready: ready.length,
    blocked: blocked.length,
    demo: demo.length,
    production: production.length,
    readyIds: ready.map((record) => record.id).filter(Boolean),
    blockedIds: blocked.map((record) => record.id).filter(Boolean),
  };
}

function mergeRecordsById(...groups) {
  const records = [];
  const seen = new Set();
  groups.flat().forEach((record) => {
    const key = record.id || JSON.stringify(record);
    if (seen.has(key)) return;
    seen.add(key);
    records.push(record);
  });
  return records;
}

export function getRecordsReadyForMigration() {
  const customerIds = getPrimaryCustomerIds();
  const websites = mergeRecordsById(readArray(STORAGE_KEYS.managedSites), readArray(STORAGE_KEYS.websites));
  const websiteIds = new Set(websites.map((record) => record.id));
  const quoteIds = new Set(readArray(STORAGE_KEYS.quotes).map((record) => record.id));
  const customers = mergeRecordsById(readArray(STORAGE_KEYS.crmCustomers), readArray(STORAGE_KEYS.customers));
  const leads = mergeRecordsById(readArray(STORAGE_KEYS.leads), readArray(STORAGE_KEYS.leadRequests));

  return {
    customers: migrationRecordState(customers, (record) => Boolean(record.id && (record.name || record.company || record.email))),
    leads: migrationRecordState(leads, (record) => Boolean(record.id && (record.name || record.email || record.company))),
    websites: migrationRecordState(websites, (record) => Boolean(record.id && (record.customerId || record.profileId) && customerIds.has(record.customerId || record.profileId))),
    projects: migrationRecordState(readArray(STORAGE_KEYS.projects), (record) => Boolean(record.id && (record.customerId || record.profileId) && customerIds.has(record.customerId || record.profileId) && (!record.websiteId || websiteIds.has(record.websiteId)))),
    files: migrationRecordState(readArray(STORAGE_KEYS.files), (record) => Boolean(record.id && (record.customerId || record.profileId) && customerIds.has(record.customerId || record.profileId))),
    quotes: migrationRecordState(readArray(STORAGE_KEYS.quotes), (record) => Boolean(record.id && (record.customerId || record.profileId) && customerIds.has(record.customerId || record.profileId) && Array.isArray(record.lines) && record.lines.length)),
    invoices: migrationRecordState(readArray(STORAGE_KEYS.invoices), (record) => Boolean(record.id && (record.customerId || record.profileId) && customerIds.has(record.customerId || record.profileId) && (!record.sourceQuoteId || quoteIds.has(record.sourceQuoteId)) && Array.isArray(record.lines) && record.lines.length)),
    subscriptions: migrationRecordState(readArray(STORAGE_KEYS.subscriptions), (record) => Boolean(record.id && (record.customerId || record.profileId) && customerIds.has(record.customerId || record.profileId))),
    demoEmails: migrationRecordState(readArray(STORAGE_KEYS.demoEmails), (record) => Boolean(record.id)),
    activityLogs: migrationRecordState(readArray(STORAGE_KEYS.activityLog), (record) => Boolean(record.id && record.action)),
    importLogs: migrationRecordState(readArray(STORAGE_KEYS.importLog), (record) => Boolean(record.id || record.createdAt)),
  };
}

export function getRecordsWithMissingForeignKeys() {
  return findBrokenReferences();
}

export function checkSupabaseReadiness() {
  const tableMapping = getSupabaseTableMapping();
  const records = getRecordsReadyForMigration();
  const missingForeignKeys = getRecordsWithMissingForeignKeys();
  const validation = validateLocalStorageData();
  const readyRecords = Object.values(records).reduce((total, item) => total + item.ready, 0);
  const blockedRecords = Object.values(records).reduce((total, item) => total + item.blocked, 0);
  const demoRecords = Object.values(records).reduce((total, item) => total + item.demo, 0);
  const productionRecords = Object.values(records).reduce((total, item) => total + item.production, 0);

  return {
    plannedTables: tableMapping.length,
    schemaStatus: "prepared",
    rlsStatus: "prepared",
    demoSeedStatus: "prepared",
    migrationPlanStatus: "prepared",
    provider: "localStorage",
    liveSwitch: "not_active",
    ready: validation.ready && missingForeignKeys.length === 0,
    readyRecords,
    blockedRecords,
    demoRecords,
    productionRecords,
    missingForeignKeys,
    tableMapping,
    records,
  };
}

export function analyzeLocalStorageData() {
  const validation = validateLocalStorageData();
  const brokenReferences = findBrokenReferences();
  return {
    counts: getRecordCounts(),
    tableMapping: getSupabaseTableMapping(),
    supabaseReadiness: checkSupabaseReadiness(),
    missingRequiredFields: findMissingRequiredFields(),
    brokenReferences,
    validation,
    ready: validation.ready && brokenReferences.length === 0,
  };
}

export function generateMigrationSummary() {
  const analysis = analyzeLocalStorageData();
  const totalRecords = Object.values(analysis.counts).reduce((total, count) => total + count, 0);
  return {
    status: analysis.ready ? "ready" : "action_needed",
    message: analysis.ready ? "Lokale data is klaar voor proefmigratie." : "Los validatie of referentiepunten op voor migratie.",
    counts: analysis.counts,
    totalRecords,
    readyForMigration: analysis.ready,
    missingRequiredFields: analysis.missingRequiredFields,
    brokenReferences: analysis.brokenReferences,
    warnings: [...analysis.missingRequiredFields, ...analysis.brokenReferences],
  };
}
