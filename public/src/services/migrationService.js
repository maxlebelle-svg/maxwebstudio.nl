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

export function analyzeLocalStorageData() {
  const validation = validateLocalStorageData();
  const brokenReferences = findBrokenReferences();
  return {
    counts: getRecordCounts(),
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
