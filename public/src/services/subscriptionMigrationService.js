import { STORAGE_KEYS } from "../config/storageKeys.js";
import {
  listLocalSubscriptions,
  prepareSubscriptionsForMigration,
  validateSubscriptionForSupabase,
  mapLocalSubscriptionToSupabase,
  resolveSubscriptionCustomerLink,
  resolveSubscriptionWebsiteLink,
  resolveSubscriptionProjectLink,
  resolveSubscriptionInvoiceLink,
} from "../repositories/SubscriptionRepository.js";
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

function createId(prefix = "subscription-migration") {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function analyzeSubscriptionData() {
  const subscriptions = listLocalSubscriptions();
  const prepared = prepareSubscriptionsForMigration(subscriptions);
  const linkedCustomers = prepared.validation.filter((item) => item.customerLink.status === "linked").length;
  const waitingForCustomer = prepared.validation.filter((item) => item.customerLink.status === "waiting_customer_migration").length;
  const missingCustomer = prepared.validation.filter((item) => ["missing_customer", "customer_not_found"].includes(item.customerLink.status)).length;
  const mrrImpact = calculateSubscriptionMigrationMrrImpact(prepared.validation);
  return {
    totalSubscriptions: subscriptions.length,
    uniqueSubscriptions: prepared.unique.length,
    demoSubscriptions: subscriptions.filter((subscription) => subscription.isDemo || subscription.environment === "demo").length,
    productionSubscriptions: subscriptions.filter((subscription) => !subscription.isDemo && subscription.environment !== "demo").length,
    readyCount: prepared.ready.length,
    waitingForCustomer,
    waitingForWebsite: prepared.waitingForWebsite.length,
    waitingForProject: prepared.waitingForProject.length,
    waitingForInvoice: prepared.waitingForInvoice.length,
    missingCustomer,
    duplicateCount: prepared.duplicates.length,
    attentionCount: prepared.attention.length,
    linkedCustomerCount: linkedCustomers,
    mrrImpact,
    prepared,
  };
}

export function calculateSubscriptionMigrationMrrImpact(validation = null) {
  const rows = validation || prepareSubscriptionsForMigration(listLocalSubscriptions()).validation;
  const active = rows.filter((item) => item.normalized.status === "actief");
  const ready = active.filter((item) => item.ready);
  const blocked = active.filter((item) => !item.ready);
  const sum = (items, key) => items.reduce((total, item) => total + Number(item.totals?.[key] || item.normalized?.[key] || 0), 0);
  return {
    activeCount: active.length,
    readyCount: ready.length,
    blockedCount: blocked.length,
    readyMrrExVat: sum(ready, "mrrExVat"),
    readyMrrInclVat: sum(ready, "mrrInclVat"),
    readyArrExVat: sum(ready, "arrExVat"),
    readyArrInclVat: sum(ready, "arrInclVat"),
    blockedMrrExVat: sum(blocked, "mrrExVat"),
    totalMrrExVat: sum(active, "mrrExVat"),
    totalMrrInclVat: sum(active, "mrrInclVat"),
    totalArrExVat: sum(active, "arrExVat"),
    totalArrInclVat: sum(active, "arrInclVat"),
  };
}

export function getSubscriptionMigrationPreview() {
  const analysis = analyzeSubscriptionData();
  return {
    summary: {
      totalSubscriptions: analysis.totalSubscriptions,
      uniqueSubscriptions: analysis.uniqueSubscriptions,
      readyCount: analysis.readyCount,
      waitingForCustomer: analysis.waitingForCustomer,
      waitingForWebsite: analysis.waitingForWebsite,
      waitingForProject: analysis.waitingForProject,
      waitingForInvoice: analysis.waitingForInvoice,
      duplicateCount: analysis.duplicateCount,
      mrrImpact: analysis.mrrImpact,
    },
    rows: analysis.prepared.validation.slice(0, 20).map((item) => ({
      localId: item.normalized.id,
      plan: item.normalized.plan,
      status: item.normalized.status,
      customerId: item.normalized.profileId || item.normalized.customerId,
      websiteId: item.normalized.websiteId,
      projectId: item.normalized.projectId,
      lastInvoiceId: item.normalized.lastInvoiceId,
      customerStatus: item.customerLink.status,
      websiteStatus: item.websiteLink.status,
      projectStatus: item.projectLink.status,
      invoiceStatus: item.invoiceLink.status,
      supabaseCustomerId: item.customerLink.supabaseCustomerId,
      supabaseWebsiteId: item.websiteLink.supabaseWebsiteId,
      supabaseProjectId: item.projectLink.supabaseProjectId,
      supabaseLastInvoiceId: item.invoiceLink.supabaseLastInvoiceId,
      mrrExVat: item.totals.mrrExVat,
      mrrInclVat: item.totals.mrrInclVat,
      ready: item.ready,
      errors: item.errors,
      warnings: item.warnings,
      payload: mapLocalSubscriptionToSupabase(item.normalized),
    })),
  };
}

export function detectDuplicateSubscriptions() {
  return analyzeSubscriptionData().prepared.duplicates;
}

export function detectMissingSubscriptionLinks() {
  return analyzeSubscriptionData().prepared.validation
    .filter((item) => item.customerLink.status !== "linked"
      || item.websiteLink.status === "waiting_website_migration"
      || item.projectLink.status === "waiting_project_migration"
      || item.invoiceLink.status === "waiting_invoice_migration")
    .map((item) => ({
      id: item.normalized.id,
      plan: item.normalized.plan,
      customerLink: item.customerLink,
      websiteLink: item.websiteLink,
      projectLink: item.projectLink,
      invoiceLink: item.invoiceLink,
      errors: item.errors,
      warnings: item.warnings,
    }));
}

export function detectMissingSubscriptionFields() {
  return analyzeSubscriptionData().prepared.validation
    .filter((item) => item.errors.length || item.warnings.length)
    .map((item) => ({
      id: item.normalized.id,
      plan: item.normalized.plan,
      errors: item.errors,
      warnings: item.warnings,
      customerLink: item.customerLink,
      websiteLink: item.websiteLink,
      projectLink: item.projectLink,
      invoiceLink: item.invoiceLink,
    }));
}

export function prepareSubscriptionMigrationPayload(options = {}) {
  const includeWaitingForCustomer = Boolean(options.includeWaitingForCustomer);
  const subscriptions = listLocalSubscriptions();
  const prepared = prepareSubscriptionsForMigration(subscriptions);
  const validation = prepared.validation.filter((item) => (
    item.ready
    || (includeWaitingForCustomer && item.customerLink.status === "waiting_customer_migration")
  ) && item.canDryRun);
  return {
    targetTables: ["subscriptions"],
    total: subscriptions.length,
    readyCount: prepared.ready.length,
    waitingForCustomerCount: prepared.waitingForCustomer.length,
    waitingForWebsiteCount: prepared.waitingForWebsite.length,
    waitingForProjectCount: prepared.waitingForProject.length,
    waitingForInvoiceCount: prepared.waitingForInvoice.length,
    skippedCount: prepared.validation.length - validation.length,
    mrrImpact: calculateSubscriptionMigrationMrrImpact(validation),
    payload: validation.map((item) => mapLocalSubscriptionToSupabase(item.normalized)),
    validation,
  };
}

export function runSubscriptionMigrationDryRun(options = {}) {
  const dryRun = {
    id: createId("subscription-dry-run"),
    type: "subscription_migration_dry_run",
    createdAt: new Date().toISOString(),
    options,
    analysis: analyzeSubscriptionData(),
    preview: getSubscriptionMigrationPreview(),
    duplicates: detectDuplicateSubscriptions(),
    missingFields: detectMissingSubscriptionFields(),
    missingLinks: detectMissingSubscriptionLinks(),
    mrrImpact: calculateSubscriptionMigrationMrrImpact(),
    payloadSummary: prepareSubscriptionMigrationPayload(options),
    status: "completed",
    liveWrite: false,
    message: "Dry-run voltooid. Er zijn geen abonnementen naar Supabase geschreven.",
  };
  writeJson(STORAGE_KEYS.lastSubscriptionMigrationDryRun, dryRun);
  logActivity("subscriptions", dryRun.id, "subscription_dry_run", {
    readyCount: dryRun.analysis.readyCount,
    waitingForCustomer: dryRun.analysis.waitingForCustomer,
    waitingForWebsite: dryRun.analysis.waitingForWebsite,
    waitingForProject: dryRun.analysis.waitingForProject,
    waitingForInvoice: dryRun.analysis.waitingForInvoice,
    duplicateCount: dryRun.analysis.duplicateCount,
    mrrExVat: dryRun.mrrImpact.totalMrrExVat,
  });
  return dryRun;
}

export function getSubscriptionMigrationWritePreview(options = {}) {
  const payload = prepareSubscriptionMigrationPayload(options);
  return {
    targetTables: ["subscriptions"],
    writeEnabled: false,
    reason: "Live abonnementmigratie volgt later. Deze preview schrijft niets.",
    readyCount: payload.readyCount,
    waitingForCustomerCount: payload.waitingForCustomerCount,
    waitingForWebsiteCount: payload.waitingForWebsiteCount,
    waitingForProjectCount: payload.waitingForProjectCount,
    waitingForInvoiceCount: payload.waitingForInvoiceCount,
    skippedCount: payload.skippedCount,
    mrrImpact: payload.mrrImpact,
    preview: payload.payload.slice(0, 12),
    lastDryRun: readJson(STORAGE_KEYS.lastSubscriptionMigrationDryRun, null),
  };
}

export function getSubscriptionReadinessSummary() {
  const analysis = analyzeSubscriptionData();
  const lastDryRun = readJson(STORAGE_KEYS.lastSubscriptionMigrationDryRun, null);
  return {
    ready: analysis.readyCount,
    waitingForCustomer: analysis.waitingForCustomer,
    waitingForWebsite: analysis.waitingForWebsite,
    waitingForProject: analysis.waitingForProject,
    waitingForInvoice: analysis.waitingForInvoice,
    missingCustomer: analysis.missingCustomer,
    duplicates: analysis.duplicateCount,
    missingFields: analysis.attentionCount,
    mrrImpact: analysis.mrrImpact,
    lastDryRun,
    validation: analysis.prepared.validation,
  };
}

export function inspectSubscriptionLinks(subscription = {}) {
  const customerLink = resolveSubscriptionCustomerLink(subscription);
  const websiteLink = resolveSubscriptionWebsiteLink(subscription);
  const projectLink = resolveSubscriptionProjectLink(subscription);
  const invoiceLink = resolveSubscriptionInvoiceLink(subscription);
  const validation = validateSubscriptionForSupabase(subscription);
  return { customerLink, websiteLink, projectLink, invoiceLink, validation };
}
