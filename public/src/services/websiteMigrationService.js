import { STORAGE_KEYS } from "../config/storageKeys.js";
import {
  listLocalWebsites,
  prepareWebsitesForMigration,
  validateWebsiteForSupabase,
  mapLocalWebsiteToSupabase,
  resolveWebsiteCustomerLink,
} from "../repositories/WebsiteRepository.js";
import { logActivity } from "./activityLogService.js";

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

function createId(prefix = "website-migration") {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function analyzeWebsiteData() {
  const websites = listLocalWebsites();
  const prepared = prepareWebsitesForMigration(websites);
  const linked = prepared.validation.filter((item) => item.customerLink.status === "linked").length;
  const waitingForCustomer = prepared.validation.filter((item) => item.customerLink.status === "waiting_customer_migration").length;
  const missingCustomer = prepared.validation.filter((item) => ["missing_customer", "customer_not_found"].includes(item.customerLink.status)).length;
  return {
    totalWebsites: websites.length,
    uniqueWebsites: prepared.unique.length,
    demoWebsites: websites.filter((website) => website.isDemo || website.environment === "demo").length,
    productionWebsites: websites.filter((website) => !website.isDemo && website.environment !== "demo").length,
    readyCount: prepared.ready.length,
    waitingForCustomer,
    missingCustomer,
    duplicateCount: prepared.duplicates.length,
    attentionCount: prepared.attention.length,
    linkedCustomerCount: linked,
    prepared,
  };
}

export function getWebsiteMigrationPreview() {
  const analysis = analyzeWebsiteData();
  return {
    summary: {
      totalWebsites: analysis.totalWebsites,
      uniqueWebsites: analysis.uniqueWebsites,
      readyCount: analysis.readyCount,
      waitingForCustomer: analysis.waitingForCustomer,
      missingCustomer: analysis.missingCustomer,
      duplicateCount: analysis.duplicateCount,
    },
    rows: analysis.prepared.validation.slice(0, 20).map((item) => ({
      localId: item.normalized.id,
      name: item.normalized.name,
      domain: item.normalized.domain,
      customerId: item.normalized.customerId,
      customerStatus: item.customerLink.status,
      supabaseCustomerId: item.customerLink.supabaseCustomerId,
      ready: item.ready,
      errors: item.errors,
      warnings: item.warnings,
      payload: mapLocalWebsiteToSupabase(item.normalized),
    })),
  };
}

export function detectDuplicateWebsites() {
  return analyzeWebsiteData().prepared.duplicates;
}

export function detectMissingWebsiteFields() {
  return analyzeWebsiteData().prepared.validation
    .filter((item) => item.errors.length || item.warnings.length)
    .map((item) => ({
      id: item.normalized.id,
      name: item.normalized.name,
      domain: item.normalized.domain,
      errors: item.errors,
      warnings: item.warnings,
      customerLink: item.customerLink,
    }));
}

export function prepareWebsiteMigrationPayload(options = {}) {
  const includeWaitingForCustomer = Boolean(options.includeWaitingForCustomer);
  const websites = listLocalWebsites();
  const prepared = prepareWebsitesForMigration(websites);
  const validation = prepared.validation.filter((item) => item.ready || (includeWaitingForCustomer && item.canDryRun));
  return {
    targetTable: "websites",
    total: websites.length,
    readyCount: prepared.ready.length,
    waitingForCustomerCount: prepared.waitingForCustomer.length,
    skippedCount: prepared.validation.length - validation.length,
    payload: validation.map((item) => mapLocalWebsiteToSupabase(item.normalized)),
    validation,
  };
}

export function runWebsiteMigrationDryRun(options = {}) {
  const dryRun = {
    id: createId("website-dry-run"),
    type: "website_migration_dry_run",
    createdAt: new Date().toISOString(),
    options,
    analysis: analyzeWebsiteData(),
    preview: getWebsiteMigrationPreview(),
    duplicates: detectDuplicateWebsites(),
    missingFields: detectMissingWebsiteFields(),
    payloadSummary: prepareWebsiteMigrationPayload(options),
    status: "completed",
    liveWrite: false,
    message: "Dry-run voltooid. Er zijn geen websites naar Supabase geschreven.",
  };
  writeJson(STORAGE_KEYS.lastWebsiteMigrationDryRun, dryRun);
  logActivity("websites", dryRun.id, "website_dry_run", {
    readyCount: dryRun.analysis.readyCount,
    waitingForCustomer: dryRun.analysis.waitingForCustomer,
    duplicateCount: dryRun.analysis.duplicateCount,
    missingCustomer: dryRun.analysis.missingCustomer,
  });
  return dryRun;
}

export function getWebsiteMigrationWritePreview(options = {}) {
  const payload = prepareWebsiteMigrationPayload(options);
  return {
    targetTable: "websites",
    writeEnabled: false,
    reason: "Live website bulk migratie volgt later. Deze preview schrijft niets.",
    readyCount: payload.readyCount,
    waitingForCustomerCount: payload.waitingForCustomerCount,
    skippedCount: payload.skippedCount,
    preview: payload.payload.slice(0, 12),
    lastDryRun: readJson(STORAGE_KEYS.lastWebsiteMigrationDryRun, null),
  };
}

export function getWebsiteReadinessSummary() {
  const analysis = analyzeWebsiteData();
  const lastDryRun = readJson(STORAGE_KEYS.lastWebsiteMigrationDryRun, null);
  return {
    ready: analysis.readyCount,
    waitingForCustomer: analysis.waitingForCustomer,
    missingCustomer: analysis.missingCustomer,
    duplicates: analysis.duplicateCount,
    missingFields: analysis.attentionCount,
    lastDryRun,
    validation: analysis.prepared.validation,
  };
}

export function inspectWebsiteCustomerLink(website = {}) {
  const link = resolveWebsiteCustomerLink(website);
  const validation = validateWebsiteForSupabase(website);
  return { link, validation };
}
