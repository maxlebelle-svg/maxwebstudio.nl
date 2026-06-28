import { STORAGE_KEYS } from "../config/storageKeys.js";
import {
  listLocalQuotes,
  prepareQuotesForMigration,
  validateQuoteForSupabase,
  mapLocalQuoteToSupabase,
  resolveQuoteCustomerLink,
  resolveQuoteWebsiteLink,
  resolveQuoteProjectLink,
} from "../repositories/QuoteRepository.js";
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

function createId(prefix = "quote-migration") {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function analyzeQuoteData() {
  const quotes = listLocalQuotes();
  const prepared = prepareQuotesForMigration(quotes);
  const linkedCustomers = prepared.validation.filter((item) => item.customerLink.status === "linked").length;
  const waitingForCustomer = prepared.validation.filter((item) => item.customerLink.status === "waiting_customer_migration").length;
  const missingCustomer = prepared.validation.filter((item) => ["missing_customer", "customer_not_found"].includes(item.customerLink.status)).length;
  const invalidLines = prepared.invalidLines.length;
  return {
    totalQuotes: quotes.length,
    uniqueQuotes: prepared.unique.length,
    demoQuotes: quotes.filter((quote) => quote.isDemo || quote.environment === "demo").length,
    productionQuotes: quotes.filter((quote) => !quote.isDemo && quote.environment !== "demo").length,
    readyCount: prepared.ready.length,
    waitingForCustomer,
    waitingForWebsite: prepared.waitingForWebsite.length,
    waitingForProject: prepared.waitingForProject.length,
    missingCustomer,
    invalidLines,
    duplicateCount: prepared.duplicates.length,
    attentionCount: prepared.attention.length,
    linkedCustomerCount: linkedCustomers,
    prepared,
  };
}

export function getQuoteMigrationPreview() {
  const analysis = analyzeQuoteData();
  return {
    summary: {
      totalQuotes: analysis.totalQuotes,
      uniqueQuotes: analysis.uniqueQuotes,
      readyCount: analysis.readyCount,
      waitingForCustomer: analysis.waitingForCustomer,
      waitingForWebsite: analysis.waitingForWebsite,
      waitingForProject: analysis.waitingForProject,
      invalidLines: analysis.invalidLines,
      duplicateCount: analysis.duplicateCount,
    },
    rows: analysis.prepared.validation.slice(0, 20).map((item) => ({
      localId: item.normalized.id,
      quoteNumber: item.normalized.quoteNumber,
      title: item.normalized.title,
      customerId: item.normalized.profileId || item.normalized.customerId,
      websiteId: item.normalized.websiteId,
      projectId: item.normalized.projectId,
      customerStatus: item.customerLink.status,
      websiteStatus: item.websiteLink.status,
      projectStatus: item.projectLink.status,
      supabaseCustomerId: item.customerLink.supabaseCustomerId,
      supabaseWebsiteId: item.websiteLink.supabaseWebsiteId,
      supabaseProjectId: item.projectLink.supabaseProjectId,
      lineCount: item.normalized.lines.length,
      total: item.normalized.total,
      ready: item.ready,
      errors: item.errors,
      warnings: item.warnings,
      payload: mapLocalQuoteToSupabase(item.normalized),
    })),
  };
}

export function detectDuplicateQuotes() {
  return analyzeQuoteData().prepared.duplicates;
}

export function detectMissingQuoteLinks() {
  return analyzeQuoteData().prepared.validation
    .filter((item) => item.customerLink.status !== "linked"
      || item.websiteLink.status === "waiting_website_migration"
      || item.projectLink.status === "waiting_project_migration")
    .map((item) => ({
      id: item.normalized.id,
      quoteNumber: item.normalized.quoteNumber,
      title: item.normalized.title,
      customerLink: item.customerLink,
      websiteLink: item.websiteLink,
      projectLink: item.projectLink,
      errors: item.errors,
      warnings: item.warnings,
    }));
}

export function detectInvalidQuoteLines() {
  return analyzeQuoteData().prepared.validation
    .filter((item) => item.errors.some((error) => error.includes("Offertregel") || error.includes("offertregels")))
    .map((item) => ({
      id: item.normalized.id,
      quoteNumber: item.normalized.quoteNumber,
      title: item.normalized.title,
      lines: item.normalized.lines,
      errors: item.errors,
      warnings: item.warnings,
    }));
}

export function detectMissingQuoteFields() {
  return analyzeQuoteData().prepared.validation
    .filter((item) => item.errors.length || item.warnings.length)
    .map((item) => ({
      id: item.normalized.id,
      quoteNumber: item.normalized.quoteNumber,
      title: item.normalized.title,
      errors: item.errors,
      warnings: item.warnings,
      customerLink: item.customerLink,
      websiteLink: item.websiteLink,
      projectLink: item.projectLink,
    }));
}

export function prepareQuoteMigrationPayload(options = {}) {
  const includeWaitingForCustomer = Boolean(options.includeWaitingForCustomer);
  const quotes = listLocalQuotes();
  const prepared = prepareQuotesForMigration(quotes);
  const validation = prepared.validation.filter((item) => (
    item.ready
    || (includeWaitingForCustomer && item.customerLink.status === "waiting_customer_migration")
  ) && item.canDryRun);
  return {
    targetTables: ["quotes", "quote_lines"],
    total: quotes.length,
    readyCount: prepared.ready.length,
    waitingForCustomerCount: prepared.waitingForCustomer.length,
    waitingForWebsiteCount: prepared.waitingForWebsite.length,
    waitingForProjectCount: prepared.waitingForProject.length,
    invalidLineCount: prepared.invalidLines.length,
    skippedCount: prepared.validation.length - validation.length,
    payload: validation.map((item) => mapLocalQuoteToSupabase(item.normalized)),
    validation,
  };
}

export function runQuoteMigrationDryRun(options = {}) {
  const dryRun = {
    id: createId("quote-dry-run"),
    type: "quote_migration_dry_run",
    createdAt: new Date().toISOString(),
    options,
    analysis: analyzeQuoteData(),
    preview: getQuoteMigrationPreview(),
    duplicates: detectDuplicateQuotes(),
    missingFields: detectMissingQuoteFields(),
    missingLinks: detectMissingQuoteLinks(),
    invalidLines: detectInvalidQuoteLines(),
    payloadSummary: prepareQuoteMigrationPayload(options),
    status: "completed",
    liveWrite: false,
    message: "Dry-run voltooid. Er zijn geen offertes of offertregels naar Supabase geschreven.",
  };
  writeJson(STORAGE_KEYS.lastQuoteMigrationDryRun, dryRun);
  logActivity("quotes", dryRun.id, "quote_dry_run", {
    readyCount: dryRun.analysis.readyCount,
    waitingForCustomer: dryRun.analysis.waitingForCustomer,
    waitingForWebsite: dryRun.analysis.waitingForWebsite,
    waitingForProject: dryRun.analysis.waitingForProject,
    duplicateCount: dryRun.analysis.duplicateCount,
    invalidLines: dryRun.analysis.invalidLines,
  });
  return dryRun;
}

export function getQuoteMigrationWritePreview(options = {}) {
  const payload = prepareQuoteMigrationPayload(options);
  return {
    targetTables: ["quotes", "quote_lines"],
    writeEnabled: false,
    reason: "Live offertemigratie volgt later. Deze preview schrijft niets.",
    readyCount: payload.readyCount,
    waitingForCustomerCount: payload.waitingForCustomerCount,
    waitingForWebsiteCount: payload.waitingForWebsiteCount,
    waitingForProjectCount: payload.waitingForProjectCount,
    invalidLineCount: payload.invalidLineCount,
    skippedCount: payload.skippedCount,
    preview: payload.payload.slice(0, 12),
    lastDryRun: readJson(STORAGE_KEYS.lastQuoteMigrationDryRun, null),
  };
}

export function getQuoteReadinessSummary() {
  const analysis = analyzeQuoteData();
  const lastDryRun = readJson(STORAGE_KEYS.lastQuoteMigrationDryRun, null);
  return {
    ready: analysis.readyCount,
    waitingForCustomer: analysis.waitingForCustomer,
    waitingForWebsite: analysis.waitingForWebsite,
    waitingForProject: analysis.waitingForProject,
    missingCustomer: analysis.missingCustomer,
    invalidLines: analysis.invalidLines,
    duplicates: analysis.duplicateCount,
    missingFields: analysis.attentionCount,
    lastDryRun,
    validation: analysis.prepared.validation,
  };
}

export function inspectQuoteLinks(quote = {}) {
  const customerLink = resolveQuoteCustomerLink(quote);
  const websiteLink = resolveQuoteWebsiteLink(quote);
  const projectLink = resolveQuoteProjectLink(quote);
  const validation = validateQuoteForSupabase(quote);
  return { customerLink, websiteLink, projectLink, validation };
}
