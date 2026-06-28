import { STORAGE_KEYS } from "../config/storageKeys.js";
import {
  listLocalInvoices,
  prepareInvoicesForMigration,
  validateInvoiceForSupabase,
  mapLocalInvoiceToSupabase,
  resolveInvoiceCustomerLink,
  resolveInvoiceWebsiteLink,
  resolveInvoiceProjectLink,
  resolveInvoiceQuoteLink,
  resolveInvoiceSubscriptionLink,
} from "../repositories/InvoiceRepository.js";
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

function createId(prefix = "invoice-migration") {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function analyzeInvoiceData() {
  const invoices = listLocalInvoices();
  const prepared = prepareInvoicesForMigration(invoices);
  const linkedCustomers = prepared.validation.filter((item) => item.customerLink.status === "linked").length;
  const waitingForCustomer = prepared.validation.filter((item) => item.customerLink.status === "waiting_customer_migration").length;
  const missingCustomer = prepared.validation.filter((item) => ["missing_customer", "customer_not_found"].includes(item.customerLink.status)).length;
  const invalidLines = prepared.invalidLines.length;
  return {
    totalInvoices: invoices.length,
    uniqueInvoices: prepared.unique.length,
    demoInvoices: invoices.filter((invoice) => invoice.isDemo || invoice.environment === "demo").length,
    productionInvoices: invoices.filter((invoice) => !invoice.isDemo && invoice.environment !== "demo").length,
    readyCount: prepared.ready.length,
    waitingForCustomer,
    waitingForWebsite: prepared.waitingForWebsite.length,
    waitingForProject: prepared.waitingForProject.length,
    waitingForQuote: prepared.waitingForQuote.length,
    waitingForSubscription: prepared.waitingForSubscription.length,
    missingCustomer,
    invalidLines,
    duplicateCount: prepared.duplicates.length,
    attentionCount: prepared.attention.length,
    linkedCustomerCount: linkedCustomers,
    prepared,
  };
}

export function getInvoiceMigrationPreview() {
  const analysis = analyzeInvoiceData();
  return {
    summary: {
      totalInvoices: analysis.totalInvoices,
      uniqueInvoices: analysis.uniqueInvoices,
      readyCount: analysis.readyCount,
      waitingForCustomer: analysis.waitingForCustomer,
      waitingForWebsite: analysis.waitingForWebsite,
      waitingForProject: analysis.waitingForProject,
      waitingForQuote: analysis.waitingForQuote,
      waitingForSubscription: analysis.waitingForSubscription,
      invalidLines: analysis.invalidLines,
      duplicateCount: analysis.duplicateCount,
    },
    rows: analysis.prepared.validation.slice(0, 20).map((item) => ({
      localId: item.normalized.id,
      invoiceNumber: item.normalized.invoiceNumber,
      title: item.normalized.title,
      customerId: item.normalized.profileId || item.normalized.customerId,
      websiteId: item.normalized.websiteId,
      projectId: item.normalized.projectId,
      sourceQuoteId: item.normalized.sourceQuoteId,
      subscriptionId: item.normalized.subscriptionId,
      customerStatus: item.customerLink.status,
      websiteStatus: item.websiteLink.status,
      projectStatus: item.projectLink.status,
      quoteStatus: item.quoteLink.status,
      subscriptionStatus: item.subscriptionLink.status,
      supabaseCustomerId: item.customerLink.supabaseCustomerId,
      supabaseWebsiteId: item.websiteLink.supabaseWebsiteId,
      supabaseProjectId: item.projectLink.supabaseProjectId,
      supabaseQuoteId: item.quoteLink.supabaseQuoteId,
      supabaseSubscriptionId: item.subscriptionLink.supabaseSubscriptionId,
      lineCount: item.normalized.lines.length,
      total: item.normalized.total,
      ready: item.ready,
      errors: item.errors,
      warnings: item.warnings,
      payload: mapLocalInvoiceToSupabase(item.normalized),
    })),
  };
}

export function detectDuplicateInvoices() {
  return analyzeInvoiceData().prepared.duplicates;
}

export function detectMissingInvoiceLinks() {
  return analyzeInvoiceData().prepared.validation
    .filter((item) => item.customerLink.status !== "linked"
      || item.websiteLink.status === "waiting_website_migration"
      || item.projectLink.status === "waiting_project_migration"
      || item.quoteLink.status === "waiting_quote_migration"
      || item.subscriptionLink.status === "waiting_subscription_migration")
    .map((item) => ({
      id: item.normalized.id,
      invoiceNumber: item.normalized.invoiceNumber,
      title: item.normalized.title,
      customerLink: item.customerLink,
      websiteLink: item.websiteLink,
      projectLink: item.projectLink,
      quoteLink: item.quoteLink,
      subscriptionLink: item.subscriptionLink,
      errors: item.errors,
      warnings: item.warnings,
    }));
}

export function detectInvalidInvoiceLines() {
  return analyzeInvoiceData().prepared.validation
    .filter((item) => item.errors.some((error) => error.includes("Factuurregel") || error.includes("factuurregels")))
    .map((item) => ({
      id: item.normalized.id,
      invoiceNumber: item.normalized.invoiceNumber,
      title: item.normalized.title,
      lines: item.normalized.lines,
      errors: item.errors,
      warnings: item.warnings,
    }));
}

export function detectMissingInvoiceFields() {
  return analyzeInvoiceData().prepared.validation
    .filter((item) => item.errors.length || item.warnings.length)
    .map((item) => ({
      id: item.normalized.id,
      invoiceNumber: item.normalized.invoiceNumber,
      title: item.normalized.title,
      errors: item.errors,
      warnings: item.warnings,
      customerLink: item.customerLink,
      websiteLink: item.websiteLink,
      projectLink: item.projectLink,
      quoteLink: item.quoteLink,
      subscriptionLink: item.subscriptionLink,
    }));
}

export function prepareInvoiceMigrationPayload(options = {}) {
  const includeWaitingForCustomer = Boolean(options.includeWaitingForCustomer);
  const invoices = listLocalInvoices();
  const prepared = prepareInvoicesForMigration(invoices);
  const validation = prepared.validation.filter((item) => (
    item.ready
    || (includeWaitingForCustomer && item.customerLink.status === "waiting_customer_migration")
  ) && item.canDryRun);
  return {
    targetTables: ["invoices", "invoice_lines"],
    total: invoices.length,
    readyCount: prepared.ready.length,
    waitingForCustomerCount: prepared.waitingForCustomer.length,
    waitingForWebsiteCount: prepared.waitingForWebsite.length,
    waitingForProjectCount: prepared.waitingForProject.length,
    waitingForQuoteCount: prepared.waitingForQuote.length,
    waitingForSubscriptionCount: prepared.waitingForSubscription.length,
    invalidLineCount: prepared.invalidLines.length,
    skippedCount: prepared.validation.length - validation.length,
    payload: validation.map((item) => mapLocalInvoiceToSupabase(item.normalized)),
    validation,
  };
}

export function runInvoiceMigrationDryRun(options = {}) {
  const dryRun = {
    id: createId("invoice-dry-run"),
    type: "invoice_migration_dry_run",
    createdAt: new Date().toISOString(),
    options,
    analysis: analyzeInvoiceData(),
    preview: getInvoiceMigrationPreview(),
    duplicates: detectDuplicateInvoices(),
    missingFields: detectMissingInvoiceFields(),
    missingLinks: detectMissingInvoiceLinks(),
    invalidLines: detectInvalidInvoiceLines(),
    payloadSummary: prepareInvoiceMigrationPayload(options),
    status: "completed",
    liveWrite: false,
    message: "Dry-run voltooid. Er zijn geen facturen of factuurregels naar Supabase geschreven.",
  };
  writeJson(STORAGE_KEYS.lastInvoiceMigrationDryRun, dryRun);
  logActivity("invoices", dryRun.id, "invoice_dry_run", {
    readyCount: dryRun.analysis.readyCount,
    waitingForCustomer: dryRun.analysis.waitingForCustomer,
    waitingForWebsite: dryRun.analysis.waitingForWebsite,
    waitingForProject: dryRun.analysis.waitingForProject,
    waitingForQuote: dryRun.analysis.waitingForQuote,
    waitingForSubscription: dryRun.analysis.waitingForSubscription,
    duplicateCount: dryRun.analysis.duplicateCount,
    invalidLines: dryRun.analysis.invalidLines,
  });
  return dryRun;
}

export function getInvoiceMigrationWritePreview(options = {}) {
  const payload = prepareInvoiceMigrationPayload(options);
  return {
    targetTables: ["invoices", "invoice_lines"],
    writeEnabled: false,
    reason: "Live factuurmigratie volgt later. Deze preview schrijft niets.",
    readyCount: payload.readyCount,
    waitingForCustomerCount: payload.waitingForCustomerCount,
    waitingForWebsiteCount: payload.waitingForWebsiteCount,
    waitingForProjectCount: payload.waitingForProjectCount,
    waitingForQuoteCount: payload.waitingForQuoteCount,
    waitingForSubscriptionCount: payload.waitingForSubscriptionCount,
    invalidLineCount: payload.invalidLineCount,
    skippedCount: payload.skippedCount,
    preview: payload.payload.slice(0, 12),
    lastDryRun: readJson(STORAGE_KEYS.lastInvoiceMigrationDryRun, null),
  };
}

export function getInvoiceReadinessSummary() {
  const analysis = analyzeInvoiceData();
  const lastDryRun = readJson(STORAGE_KEYS.lastInvoiceMigrationDryRun, null);
  return {
    ready: analysis.readyCount,
    waitingForCustomer: analysis.waitingForCustomer,
    waitingForWebsite: analysis.waitingForWebsite,
    waitingForProject: analysis.waitingForProject,
    waitingForQuote: analysis.waitingForQuote,
    waitingForSubscription: analysis.waitingForSubscription,
    missingCustomer: analysis.missingCustomer,
    invalidLines: analysis.invalidLines,
    duplicates: analysis.duplicateCount,
    missingFields: analysis.attentionCount,
    lastDryRun,
    validation: analysis.prepared.validation,
  };
}

export function inspectInvoiceLinks(invoice = {}) {
  const customerLink = resolveInvoiceCustomerLink(invoice);
  const websiteLink = resolveInvoiceWebsiteLink(invoice);
  const projectLink = resolveInvoiceProjectLink(invoice);
  const quoteLink = resolveInvoiceQuoteLink(invoice);
  const subscriptionLink = resolveInvoiceSubscriptionLink(invoice);
  const validation = validateInvoiceForSupabase(invoice);
  return { customerLink, websiteLink, projectLink, quoteLink, subscriptionLink, validation };
}
