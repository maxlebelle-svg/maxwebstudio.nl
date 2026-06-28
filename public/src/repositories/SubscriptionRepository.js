import { CUSTOMER_DATA_MODES } from "../config/environment.js";
import { PRIMARY_MODULE_KEYS, STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { logActivity, listActivitiesForEntity } from "../services/activityLogService.js";
import {
  calculateSubscriptionTotals,
  normalizeSubscription,
  normalizeSubscriptionFrequency,
  normalizeSubscriptionStatus,
  subscriptionIdentityKeys,
  supabaseSubscriptionStatus,
} from "../utils/subscriptionNormalizer.js";
import { listLocalCustomers } from "./CustomerRepository.js";
import { listLocalInvoices } from "./InvoiceRepository.js";
import { listLocalProjects } from "./ProjectRepository.js";
import { listLocalWebsites } from "./WebsiteRepository.js";
import { createRepository } from "./createRepository.js";

const localSubscriptionRepository = createRepository(PRIMARY_MODULE_KEYS.subscriptions);

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

function subscriptionDataMode() {
  return readJson(STORAGE_KEYS.settings, {})?.subscriptionDataMode
    || localStorage.getItem(STORAGE_KEYS.subscriptionDataMode)
    || CUSTOMER_DATA_MODES.LOCAL;
}

function sourceLabel(subscription = {}) {
  if (subscription.isDemo || subscription.isDemoJourney || subscription.environment === "demo") return "demo";
  return subscription._source || "local";
}

function isSupabaseSubscription(subscription = {}) {
  return ["supabase", "hybrid"].includes(subscription._source) || Boolean(subscription._supabaseSubscriptionId || subscription.supabaseSubscriptionId);
}

function subscriptionWriteTarget(subscription = {}, options = {}) {
  if (options.target) return options.target;
  if (options.forceLocal || subscription.isDemo || subscription.environment === "demo") return "local";
  return isSupabaseSubscription(subscription) ? "supabase" : "local";
}

export function markSubscriptionSource(subscription = {}, source = "local", extra = {}) {
  const normalized = normalizeSubscription(subscription);
  const resolvedSource = sourceLabel({ ...normalized, _source: source });
  const supabaseSubscriptionId = extra.supabaseSubscriptionId
    || normalized.supabaseSubscriptionId
    || (["supabase", "hybrid"].includes(resolvedSource) ? normalized.id : "");
  const totals = calculateSubscriptionTotals(normalized);
  return {
    ...normalized,
    _source: resolvedSource,
    _isMigrated: Boolean(normalized.supabaseSubscriptionId || normalized.migratedToSupabaseAt || extra.supabaseSubscriptionId),
    _supabaseSubscriptionId: supabaseSubscriptionId,
    _localSubscriptionId: extra.localSubscriptionId || normalized._localSubscriptionId || normalized.metadata?.localStorageId || "",
    _linkedCustomerStatus: extra.linkedCustomerStatus || normalized._linkedCustomerStatus || "",
    _linkedWebsiteStatus: extra.linkedWebsiteStatus || normalized._linkedWebsiteStatus || "",
    _linkedProjectStatus: extra.linkedProjectStatus || normalized._linkedProjectStatus || "",
    _linkedInvoiceStatus: extra.linkedInvoiceStatus || normalized._linkedInvoiceStatus || "",
    _mrrExVat: totals.mrrExVat,
    _mrrInclVat: totals.mrrInclVat,
    _arrExVat: totals.arrExVat,
    _arrInclVat: totals.arrInclVat,
    _sourceMeta: {
      ...(normalized._sourceMeta || {}),
      ...extra,
    },
  };
}

export function getSubscriptionSource(subscription = {}) {
  return sourceLabel(subscription);
}

function localSubscriptionsFromStorage() {
  const seen = new Set();
  return readArray(STORAGE_KEYS.subscriptions)
    .map(normalizeSubscription)
    .filter((subscription) => {
      const keys = subscriptionIdentityKeys(subscription);
      const key = keys.id || keys.customerWebsitePlan;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function listLocalSubscriptions() {
  return localSubscriptionsFromStorage().map((subscription) => markSubscriptionSource(subscription, subscription.isDemo || subscription.environment === "demo" ? "demo" : "local", {
    localSubscriptionId: subscription.id,
    supabaseSubscriptionId: subscription.supabaseSubscriptionId || "",
  }));
}

export async function listSupabaseSubscriptions() {
  const rows = await supabaseProvider.getAll("subscriptions", { limit: 100 });
  return rows.map((row) => markSubscriptionSource(mapSupabaseSubscriptionToLocal(row), "supabase", {
    supabaseSubscriptionId: row.id,
    localSubscriptionId: row.metadata?.localStorageId || row.external_id || "",
  }));
}

function mergeSupabaseWithLocal(localSubscription, supabaseSubscription, reason = "supabase_match") {
  return markSubscriptionSource({
    ...localSubscription,
    ...supabaseSubscription,
    id: localSubscription.id || supabaseSubscription.id,
    profileId: localSubscription.profileId || supabaseSubscription.profileId,
    customerId: localSubscription.customerId || supabaseSubscription.customerId,
    websiteId: localSubscription.websiteId || supabaseSubscription.websiteId,
    projectId: localSubscription.projectId || supabaseSubscription.projectId,
    lastInvoiceId: localSubscription.lastInvoiceId || supabaseSubscription.lastInvoiceId,
    createdAt: supabaseSubscription.createdAt || localSubscription.createdAt,
    updatedAt: supabaseSubscription.updatedAt || localSubscription.updatedAt,
  }, "hybrid", {
    reason,
    localSubscriptionId: localSubscription.id || "",
    supabaseSubscriptionId: supabaseSubscription.id || localSubscription.supabaseSubscriptionId || "",
  });
}

export function mergeSubscriptionSources(localSubscriptions = [], supabaseSubscriptions = []) {
  const merged = [];
  const duplicateMerges = [];
  const usedLocalIds = new Set();
  const localBySupabaseId = new Map();
  const localByCustomerWebsitePlan = new Map();
  localSubscriptions.forEach((subscription) => {
    const normalized = normalizeSubscription(subscription);
    const keys = subscriptionIdentityKeys(normalized);
    if (keys.supabaseSubscriptionId) localBySupabaseId.set(keys.supabaseSubscriptionId, normalized);
    if (keys.customerWebsitePlan) localByCustomerWebsitePlan.set(keys.customerWebsitePlan, normalized);
  });
  supabaseSubscriptions.forEach((subscription) => {
    const normalized = normalizeSubscription(subscription);
    const keys = subscriptionIdentityKeys(normalized);
    const localMatch = localBySupabaseId.get(String(normalized.id))
      || (keys.customerWebsitePlan ? localByCustomerWebsitePlan.get(keys.customerWebsitePlan) : null);
    if (localMatch) {
      usedLocalIds.add(localMatch.id);
      const reason = localMatch.supabaseSubscriptionId === normalized.id ? "supabaseSubscriptionId" : "customerWebsitePlan";
      duplicateMerges.push({ reason, localSubscriptionId: localMatch.id, supabaseSubscriptionId: normalized.id, plan: normalized.plan });
      merged.push(mergeSupabaseWithLocal(localMatch, normalized, reason));
      return;
    }
    merged.push(markSubscriptionSource(normalized, "supabase", { supabaseSubscriptionId: normalized.id }));
  });
  localSubscriptions.map(normalizeSubscription).forEach((subscription) => {
    if (usedLocalIds.has(subscription.id)) return;
    if (subscription.supabaseSubscriptionId && !subscription.isDemo && subscription.environment !== "demo") return;
    merged.push(markSubscriptionSource(subscription, subscription.isDemo || subscription.environment === "demo" ? "demo" : "local", {
      localSubscriptionId: subscription.id,
      supabaseSubscriptionId: subscription.supabaseSubscriptionId || "",
    }));
  });
  const active = merged.filter((subscription) => subscription.status === "actief");
  const mrrExVat = active.reduce((sum, subscription) => sum + Number(subscription._mrrExVat ?? subscription.mrrExVat ?? 0), 0);
  const mrrInclVat = active.reduce((sum, subscription) => sum + Number(subscription._mrrInclVat ?? subscription.mrrInclVat ?? 0), 0);
  return {
    subscriptions: merged,
    duplicateMerges,
    counts: {
      local: localSubscriptions.length,
      supabase: supabaseSubscriptions.length,
      hybrid: merged.length,
      duplicateMerges: duplicateMerges.length,
      demo: merged.filter((subscription) => getSubscriptionSource(subscription) === "demo").length,
      unmigratedLocal: merged.filter((subscription) => getSubscriptionSource(subscription) === "local" && !subscription._isMigrated).length,
      active: active.length,
      paused: merged.filter((subscription) => subscription.status === "gepauzeerd").length,
      cancelled: merged.filter((subscription) => subscription.status === "opgezegd").length,
      mrrExVat,
      mrrInclVat,
      arrExVat: mrrExVat * 12,
      arrInclVat: mrrInclVat * 12,
    },
  };
}

export async function listHybridSubscriptions() {
  const localSubscriptions = listLocalSubscriptions();
  const supabaseSubscriptions = await listSupabaseSubscriptions();
  return mergeSubscriptionSources(localSubscriptions, supabaseSubscriptions);
}

export async function listByDataMode(mode = CUSTOMER_DATA_MODES.LOCAL) {
  if (mode === CUSTOMER_DATA_MODES.SUPABASE_READ) {
    const subscriptions = await listSupabaseSubscriptions();
    return {
      mode,
      subscriptions,
      counts: { local: listLocalSubscriptions().length, supabase: subscriptions.length, hybrid: subscriptions.length, duplicateMerges: 0, demo: 0, unmigratedLocal: 0 },
      fallbackUsed: false,
      error: "",
      refreshedAt: nowIso(),
    };
  }
  if (mode === CUSTOMER_DATA_MODES.HYBRID) {
    try {
      const merged = await listHybridSubscriptions();
      return { mode, ...merged, fallbackUsed: false, error: "", refreshedAt: nowIso() };
    } catch (error) {
      const subscriptions = listLocalSubscriptions();
      return {
        mode,
        subscriptions,
        counts: { local: subscriptions.length, supabase: 0, hybrid: subscriptions.length, duplicateMerges: 0, demo: subscriptions.filter((subscription) => getSubscriptionSource(subscription) === "demo").length, unmigratedLocal: subscriptions.length },
        fallbackUsed: true,
        error: error.message || "Supabase subscriptions konden niet worden gelezen.",
        refreshedAt: nowIso(),
      };
    }
  }
  const subscriptions = listLocalSubscriptions();
  return {
    mode: CUSTOMER_DATA_MODES.LOCAL,
    subscriptions,
    counts: { local: subscriptions.length, supabase: 0, hybrid: subscriptions.length, duplicateMerges: 0, demo: subscriptions.filter((subscription) => getSubscriptionSource(subscription) === "demo").length, unmigratedLocal: subscriptions.length },
    fallbackUsed: false,
    error: "",
    refreshedAt: nowIso(),
  };
}

function localCustomersById() {
  return new Map(listLocalCustomers().map((customer) => [customer.id, customer]));
}

function localWebsitesById() {
  return new Map(listLocalWebsites().map((website) => [website.id, website]));
}

function localProjectsById() {
  return new Map(listLocalProjects().map((project) => [project.id, project]));
}

function localInvoicesById() {
  return new Map(listLocalInvoices().map((invoice) => [invoice.id, invoice]));
}

export function resolveSubscriptionCustomerLink(subscription = {}) {
  const normalized = normalizeSubscription(subscription);
  if (normalized.supabaseCustomerId) return { status: "linked", supabaseCustomerId: normalized.supabaseCustomerId, source: "subscription" };
  const customer = localCustomersById().get(normalized.profileId || normalized.customerId);
  if (!normalized.profileId && !normalized.customerId) return { status: "missing_customer", message: "Abonnement mist customerId." };
  if (!customer) return { status: "customer_not_found", message: "Lokale klant niet gevonden." };
  const supabaseCustomerId = customer.supabaseCustomerId || customer._supabaseCustomerId || customer.id;
  if (supabaseCustomerId && (customer._source === "supabase" || customer._source === "hybrid" || customer.supabaseCustomerId)) {
    return { status: "linked", supabaseCustomerId, source: customer._source || "local_with_supabase_id" };
  }
  return { status: "waiting_customer_migration", localCustomerId: customer.id, message: "Wacht op customer migratie." };
}

export function resolveSubscriptionWebsiteLink(subscription = {}) {
  const normalized = normalizeSubscription(subscription);
  if (!normalized.websiteId && !normalized.supabaseWebsiteId) return { status: "not_required", message: "Geen website gekoppeld." };
  if (normalized.supabaseWebsiteId) return { status: "linked", supabaseWebsiteId: normalized.supabaseWebsiteId, source: "subscription" };
  const website = localWebsitesById().get(normalized.websiteId);
  if (!website) return { status: "website_not_found", message: "Lokale website niet gevonden." };
  const supabaseWebsiteId = website.supabaseWebsiteId || website._supabaseWebsiteId || website.id;
  if (supabaseWebsiteId && (website._source === "supabase" || website._source === "hybrid" || website.supabaseWebsiteId)) {
    return { status: "linked", supabaseWebsiteId, source: website._source || "local_with_supabase_id" };
  }
  return { status: "waiting_website_migration", localWebsiteId: website.id, message: "Wacht op website migratie." };
}

export function resolveSubscriptionProjectLink(subscription = {}) {
  const normalized = normalizeSubscription(subscription);
  if (!normalized.projectId && !normalized.supabaseProjectId) return { status: "not_required", message: "Geen project gekoppeld." };
  if (normalized.supabaseProjectId) return { status: "linked", supabaseProjectId: normalized.supabaseProjectId, source: "subscription" };
  const project = localProjectsById().get(normalized.projectId);
  if (!project) return { status: "project_not_found", message: "Lokaal project niet gevonden." };
  const supabaseProjectId = project.supabaseProjectId || project._supabaseProjectId || project.id;
  if (supabaseProjectId && (project._source === "supabase" || project._source === "hybrid" || project.supabaseProjectId)) {
    return { status: "linked", supabaseProjectId, source: project._source || "local_with_supabase_id" };
  }
  return { status: "waiting_project_migration", localProjectId: project.id, message: "Wacht op project migratie." };
}

export function resolveSubscriptionInvoiceLink(subscription = {}) {
  const normalized = normalizeSubscription(subscription);
  if (!normalized.lastInvoiceId && !normalized.supabaseLastInvoiceId) return { status: "not_required", message: "Geen laatste factuur gekoppeld." };
  if (normalized.supabaseLastInvoiceId) return { status: "linked", supabaseLastInvoiceId: normalized.supabaseLastInvoiceId, source: "subscription" };
  const invoice = localInvoicesById().get(normalized.lastInvoiceId);
  if (!invoice) return { status: "invoice_not_found", message: "Lokale laatste factuur niet gevonden." };
  const supabaseLastInvoiceId = invoice.supabaseInvoiceId || invoice._supabaseInvoiceId || "";
  if (supabaseLastInvoiceId) return { status: "linked", supabaseLastInvoiceId, source: invoice._source || "local_with_supabase_id" };
  return { status: "waiting_invoice_migration", localInvoiceId: invoice.id, message: "Wacht op factuur migratie." };
}

export function mapLocalSubscriptionToSupabase(subscription = {}) {
  const normalized = normalizeSubscription(subscription);
  const customerLink = resolveSubscriptionCustomerLink(normalized);
  const websiteLink = resolveSubscriptionWebsiteLink(normalized);
  const projectLink = resolveSubscriptionProjectLink(normalized);
  const invoiceLink = resolveSubscriptionInvoiceLink(normalized);
  const totals = calculateSubscriptionTotals(normalized);
  return {
    subscription: {
      external_id: normalized.id,
      customer_id: customerLink.supabaseCustomerId || null,
      website_id: websiteLink.supabaseWebsiteId || null,
      project_id: projectLink.supabaseProjectId || null,
      last_invoice_id: invoiceLink.supabaseLastInvoiceId || null,
      plan: normalized.plan,
      status: supabaseSubscriptionStatus(normalized.status),
      start_date: normalized.startDate || null,
      end_date: normalized.endDate || null,
      next_invoice_date: normalized.nextInvoiceDate || null,
      last_invoice_date: normalized.lastInvoiceDate || null,
      invoice_frequency: normalizeSubscriptionFrequency(normalized.invoiceFrequency),
      price_ex_vat: totals.priceExVat,
      vat_percentage: totals.vatPercentage,
      total_incl_vat: totals.totalInclVat,
      auto_invoice_enabled: normalized.autoInvoiceEnabled,
      payment_provider_customer_id: normalized.paymentProviderCustomerId,
      payment_mandate_id: normalized.paymentMandateId,
      mollie_customer_id: normalized.mollieCustomerId,
      mollie_subscription_id: normalized.mollieSubscriptionId,
      mollie_subscription_status: normalized.mollieSubscriptionStatus,
      subscription_invoice_sequence: normalized.subscriptionInvoiceSequence,
      next_auto_invoice_run: normalized.nextAutoInvoiceRun || null,
      invoice_generation_log: normalized.invoiceGenerationLog,
      internal_notes: normalized.internalNotes || normalized.notes || "",
      is_demo: normalized.isDemo,
      is_demo_journey: normalized.isDemoJourney,
      environment: normalized.environment,
      metadata: {
        ...(normalized.metadata || {}),
        localStorageId: normalized.id,
        localCustomerId: normalized.profileId || normalized.customerId || "",
        localWebsiteId: normalized.websiteId || "",
        localProjectId: normalized.projectId || "",
        localLastInvoiceId: normalized.lastInvoiceId || "",
        demoScenarioId: normalized.demoScenarioId || "",
        demoJourneyId: normalized.demoJourneyId || "",
      },
      created_at: normalized.createdAt,
      updated_at: normalized.updatedAt || nowIso(),
    },
    links: { customerLink, websiteLink, projectLink, invoiceLink },
    totals,
  };
}

export function mapSupabaseSubscriptionToLocal(row = {}) {
  return normalizeSubscription({
    id: row.external_id || row.id,
    externalId: row.external_id || "",
    supabaseSubscriptionId: row.id,
    profileId: row.metadata?.localCustomerId || row.customer_id || "",
    supabaseCustomerId: row.customer_id || "",
    websiteId: row.metadata?.localWebsiteId || row.website_id || "",
    supabaseWebsiteId: row.website_id || "",
    projectId: row.metadata?.localProjectId || row.project_id || "",
    supabaseProjectId: row.project_id || "",
    lastInvoiceId: row.metadata?.localLastInvoiceId || row.last_invoice_id || "",
    supabaseLastInvoiceId: row.last_invoice_id || "",
    plan: row.plan,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    nextInvoiceDate: row.next_invoice_date,
    lastInvoiceDate: row.last_invoice_date,
    invoiceFrequency: row.invoice_frequency,
    priceExVat: row.price_ex_vat,
    vatPercentage: row.vat_percentage,
    totalInclVat: row.total_incl_vat,
    autoInvoiceEnabled: row.auto_invoice_enabled,
    paymentProviderCustomerId: row.payment_provider_customer_id,
    paymentMandateId: row.payment_mandate_id,
    mollieCustomerId: row.mollie_customer_id,
    mollieSubscriptionId: row.mollie_subscription_id,
    mollieSubscriptionStatus: row.mollie_subscription_status,
    subscriptionInvoiceSequence: row.subscription_invoice_sequence,
    nextAutoInvoiceRun: row.next_auto_invoice_run,
    invoiceGenerationLog: row.invoice_generation_log,
    notes: row.internal_notes,
    internalNotes: row.internal_notes,
    isDemo: row.is_demo,
    isDemoJourney: row.is_demo_journey,
    environment: row.environment,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function validateSubscriptionForSupabase(subscription = {}) {
  const normalized = normalizeSubscription(subscription);
  const errors = [];
  const warnings = [];
  if (!normalized.profileId && !normalized.supabaseCustomerId) errors.push("Abonnement mist klantkoppeling.");
  if (!normalized.plan) warnings.push("Abonnement mist plan.");
  if (!normalized.status) warnings.push("Abonnement mist status.");
  if (normalized.priceExVat < 0) errors.push("Abonnement heeft negatieve prijs.");
  if (normalized.priceExVat === 0) warnings.push("Abonnement heeft prijs 0.");
  if (!normalized.invoiceFrequency) warnings.push("Abonnement mist factuurfrequentie.");
  if (!normalized.startDate) warnings.push("Abonnement mist startdatum.");
  if (normalized.nextInvoiceDate && Number.isNaN(new Date(normalized.nextInvoiceDate).getTime())) warnings.push("Volgende factuurdatum is ongeldig.");
  if ((normalized.isDemo || normalized.isDemoJourney) && !normalized.demoScenarioId && !normalized.demoJourneyId && normalized.environment === "demo") {
    warnings.push("Demo-abonnement mist demoScenarioId/demoJourneyId.");
  }
  const customerLink = resolveSubscriptionCustomerLink(normalized);
  const websiteLink = resolveSubscriptionWebsiteLink(normalized);
  const projectLink = resolveSubscriptionProjectLink(normalized);
  const invoiceLink = resolveSubscriptionInvoiceLink(normalized);
  if (customerLink.status !== "linked") errors.push(customerLink.message || "Customer koppeling is niet klaar.");
  [websiteLink, projectLink, invoiceLink].forEach((link) => {
    if (String(link.status || "").startsWith("waiting_")) warnings.push(link.message);
    if (String(link.status || "").endsWith("_not_found")) warnings.push(link.message);
  });
  return {
    normalized,
    errors,
    warnings,
    ready: errors.length === 0,
    canDryRun: errors.length === 0 || customerLink.status === "waiting_customer_migration",
    customerLink,
    websiteLink,
    projectLink,
    invoiceLink,
    totals: calculateSubscriptionTotals(normalized),
  };
}

export function prepareSubscriptionsForMigration(subscriptions = listLocalSubscriptions()) {
  const normalized = subscriptions.map(normalizeSubscription);
  const seen = new Map();
  const duplicates = [];
  const unique = [];
  normalized.forEach((subscription) => {
    const key = subscriptionIdentityKeys(subscription).customerWebsitePlan;
    if (subscription.status === "actief" && key && seen.has(key)) {
      duplicates.push({ key, subscription, duplicateOf: seen.get(key) });
      return;
    }
    if (subscription.status === "actief" && key) seen.set(key, subscription.id);
    unique.push(subscription);
  });
  const validation = unique.map(validateSubscriptionForSupabase);
  return {
    total: normalized.length,
    unique,
    duplicates,
    ready: validation.filter((item) => item.ready),
    waitingForCustomer: validation.filter((item) => item.customerLink.status === "waiting_customer_migration"),
    waitingForWebsite: validation.filter((item) => item.websiteLink.status === "waiting_website_migration"),
    waitingForProject: validation.filter((item) => item.projectLink.status === "waiting_project_migration"),
    waitingForInvoice: validation.filter((item) => item.invoiceLink.status === "waiting_invoice_migration"),
    attention: validation.filter((item) => !item.ready || item.warnings.length),
    payload: unique.map(mapLocalSubscriptionToSupabase),
    validation,
  };
}

function getSupabaseWriteTest() {
  const subscriptionLatest = readJson(STORAGE_KEYS.lastSubscriptionWriteTest, null);
  const generalLatest = readJson(STORAGE_KEYS.lastSupabaseWriteTest, null);
  return subscriptionLatest || generalLatest;
}

export function canWriteSubscription(subscription = {}, context = {}) {
  const mode = context.mode || subscriptionDataMode();
  const status = supabaseProvider.getStatus();
  const readOnly = readJson(STORAGE_KEYS.lastSupabaseReadOnlyTest, null);
  const writeTest = getSupabaseWriteTest();
  const validation = validateSubscriptionForSupabase(subscription);
  const customerLink = context.customerLink || validation.customerLink;
  const websiteLink = context.websiteLink || validation.websiteLink;
  const projectLink = context.projectLink || validation.projectLink;
  const invoiceLink = context.invoiceLink || validation.invoiceLink;
  const source = getSubscriptionSource(subscription);
  const missing = [];
  const target = context.target || (isSupabaseSubscription(subscription) ? "supabase" : "local");
  if (target === "local") return { allowed: true, target, mode, source, missing, reason: "Lokaal abonnement blijft localStorage.", customerLink, websiteLink, projectLink, invoiceLink };
  if ((subscription.isDemo || subscription.environment === "demo") && context.allowDemoSupabase !== true) missing.push("Demo-abonnement mag niet naar Supabase zonder expliciete demo-Supabase context.");
  if (![CUSTOMER_DATA_MODES.SUPABASE_READ, CUSTOMER_DATA_MODES.HYBRID].includes(mode) && context.allowSupabaseInLocalMode !== true) missing.push("Subscription data mode is niet supabase-read of hybrid.");
  if (!status.hasUrl) missing.push("Supabase URL ontbreekt.");
  if (!status.hasAnonKey) missing.push("Supabase anon key ontbreekt.");
  if (!status.clientPackageAvailable) missing.push("Supabase client is niet geladen.");
  if (!readOnly?.success && !readOnly?.connected) missing.push("Read-only test is niet succesvol.");
  if (customerLink.status !== "linked" && context.allowOrphanSubscription !== true) missing.push(customerLink.message || "Abonnement mist Supabase customer koppeling.");
  if (validation.errors.length && context.subscriptionWriteTest !== true) missing.push(validation.errors.join(" "));
  if (context.subscriptionWriteTest !== true && writeTest?.status !== "completed" && writeTest?.status !== "subscription_completed") missing.push("Supabase write-test is niet succesvol.");
  return { allowed: missing.length === 0, target, mode, source, missing, reason: missing.join(" "), supabase: status, readOnly, writeTest, customerLink, websiteLink, projectLink, invoiceLink, validation };
}

function logSubscriptionWrite(action, subscription, metadata = {}) {
  return logActivity("subscriptions", subscription?.id || metadata.subscriptionId || "unknown", action, {
    subscriptionId: subscription?.id || metadata.subscriptionId || "",
    supabaseSubscriptionId: subscription?._supabaseSubscriptionId || subscription?.supabaseSubscriptionId || metadata.supabaseSubscriptionId || "",
    customerId: subscription?.profileId || subscription?.customerId || metadata.customerId || "",
    websiteId: subscription?.websiteId || metadata.websiteId || "",
    projectId: subscription?.projectId || metadata.projectId || "",
    lastInvoiceId: subscription?.lastInvoiceId || metadata.lastInvoiceId || "",
    source: getSubscriptionSource(subscription),
    performedBy: "local-admin",
    timestamp: nowIso(),
    ...metadata,
  });
}

export function getSubscriptionHistory(id) {
  return listActivitiesForEntity("subscriptions", id).filter((activity) => [
    "subscription_created",
    "subscription_updated",
    "subscription_paused",
    "subscription_cancelled",
    "subscription_reactivated",
    "subscription_archived",
    "subscription_invoice_created",
    "subscription_write_failed",
  ].includes(activity.action));
}

function cleanLocalSubscription(subscription = {}) {
  const normalized = normalizeSubscription(subscription);
  const {
    _source,
    _isMigrated,
    _supabaseSubscriptionId,
    _localSubscriptionId,
    _linkedCustomerStatus,
    _linkedWebsiteStatus,
    _linkedProjectStatus,
    _linkedInvoiceStatus,
    _mrrExVat,
    _mrrInclVat,
    _arrExVat,
    _arrInclVat,
    _sourceMeta,
    ...clean
  } = normalized;
  return clean;
}

function writeLocalSubscriptions(subscriptions = []) {
  localStorage.setItem(STORAGE_KEYS.subscriptions, JSON.stringify(subscriptions.map(cleanLocalSubscription)));
}

function saveLocalSubscription(data = {}) {
  const subscriptions = listLocalSubscriptions();
  const index = subscriptions.findIndex((subscription) => subscription.id === data.id);
  const existing = index >= 0 ? subscriptions[index] : {};
  const subscription = normalizeSubscription({
    ...existing,
    ...data,
    id: data.id || existing.id,
    createdAt: existing.createdAt || nowIso(),
    updatedAt: nowIso(),
  });
  if (!subscription.profileId && !subscription.customerId) throw new Error("Kies eerst een klant.");
  if (!subscription.plan) throw new Error("Kies een onderhoudsplan.");
  if (subscription.priceExVat < 0) throw new Error("Prijs mag niet negatief zijn.");
  if (index >= 0) subscriptions[index] = subscription;
  else subscriptions.unshift(subscription);
  writeLocalSubscriptions(subscriptions);
  logSubscriptionWrite(index >= 0 ? "subscription_updated" : "subscription_created", subscription, { target: "local" });
  return markSubscriptionSource(subscription, subscription.isDemo || subscription.environment === "demo" ? "demo" : "local", { localSubscriptionId: subscription.id });
}

function requireSubscriptionWrite(subscription = {}, options = {}) {
  const readiness = canWriteSubscription(subscription, { ...options, target: "supabase" });
  if (!readiness.allowed) {
    const error = new Error(readiness.reason || "Subscription write naar Supabase is geblokkeerd.");
    error.code = "SUBSCRIPTION_WRITE_BLOCKED";
    error.readiness = readiness;
    throw error;
  }
  return readiness;
}

function assertNoConflict(oldSubscription = {}, options = {}) {
  const remoteUpdatedAt = oldSubscription._sourceMeta?.remoteUpdatedAt || oldSubscription.updatedAt;
  if (!options.baseUpdatedAt || !remoteUpdatedAt) return;
  if (new Date(remoteUpdatedAt).getTime() > new Date(options.baseUpdatedAt).getTime()) {
    const error = new Error("Supabase heeft een nieuwere abonnementsversie. Ververs abonnementgegevens voordat je opslaat.");
    error.code = "SUBSCRIPTION_CONFLICT";
    throw error;
  }
}

export async function createSubscription(data = {}, options = {}) {
  const target = subscriptionWriteTarget(data, options);
  if (target === "local") return saveLocalSubscription(data);
  const readiness = requireSubscriptionWrite(data, options);
  const mapped = mapLocalSubscriptionToSupabase(data);
  const result = await supabaseProvider.createSubscription(mapped.subscription, { subscriptionWrite: true });
  const subscription = markSubscriptionSource(mapSupabaseSubscriptionToLocal(result.data), "supabase", {
    supabaseSubscriptionId: result.data.id,
    linkedCustomerStatus: readiness.customerLink.status,
    linkedWebsiteStatus: readiness.websiteLink.status,
    linkedProjectStatus: readiness.projectLink.status,
    linkedInvoiceStatus: readiness.invoiceLink.status,
  });
  logSubscriptionWrite("subscription_created", subscription, { target: "supabase" });
  return subscription;
}

export async function updateSubscription(id, data = {}, options = {}) {
  const oldSubscription = options.oldSubscription || listLocalSubscriptions().find((subscription) => subscription.id === id || subscription.supabaseSubscriptionId === id) || {};
  const target = subscriptionWriteTarget(oldSubscription, options);
  if (target === "local") return saveLocalSubscription({ ...oldSubscription, ...data, id: oldSubscription.id || id });
  assertNoConflict(oldSubscription, options);
  const remoteId = oldSubscription._supabaseSubscriptionId || oldSubscription.supabaseSubscriptionId || id;
  const readiness = requireSubscriptionWrite({ ...oldSubscription, ...data }, options);
  const mapped = mapLocalSubscriptionToSupabase({ ...oldSubscription, ...data, supabaseSubscriptionId: remoteId });
  const result = await supabaseProvider.updateSubscription(remoteId, mapped.subscription, { subscriptionWrite: true });
  const subscription = markSubscriptionSource(mapSupabaseSubscriptionToLocal(result.data), "supabase", {
    supabaseSubscriptionId: result.data.id,
    linkedCustomerStatus: readiness.customerLink.status,
    linkedWebsiteStatus: readiness.websiteLink.status,
    linkedProjectStatus: readiness.projectLink.status,
    linkedInvoiceStatus: readiness.invoiceLink.status,
  });
  logSubscriptionWrite("subscription_updated", subscription, { target: "supabase" });
  return subscription;
}

async function changeSubscriptionStatus(id, status, action, options = {}) {
  const subscription = options.subscription || options.oldSubscription || listLocalSubscriptions().find((item) => item.id === id || item.supabaseSubscriptionId === id) || {};
  const target = subscriptionWriteTarget(subscription, options);
  const extra = {};
  if (status === "opgezegd") extra.endDate = new Date().toISOString().slice(0, 10);
  if (status === "actief") extra.endDate = "";
  if (target === "local") {
    const saved = saveLocalSubscription({ ...subscription, status, ...extra });
    logSubscriptionWrite(action, saved, { target: "local", status });
    return saved;
  }
  requireSubscriptionWrite({ ...subscription, status, ...extra }, options);
  const remoteId = subscription._supabaseSubscriptionId || subscription.supabaseSubscriptionId || id;
  const context = { subscriptionWrite: true };
  const result = action === "subscription_paused"
    ? await supabaseProvider.pauseSubscription(remoteId, context)
    : action === "subscription_cancelled"
      ? await supabaseProvider.cancelSubscription(remoteId, context)
      : action === "subscription_reactivated"
        ? await supabaseProvider.reactivateSubscription(remoteId, context)
        : await supabaseProvider.archiveSubscription(remoteId, context);
  const saved = markSubscriptionSource(mapSupabaseSubscriptionToLocal(result.data), "supabase", { supabaseSubscriptionId: result.data.id });
  logSubscriptionWrite(action, saved, { target: "supabase", status });
  return saved;
}

export function pauseSubscription(id, options = {}) {
  return changeSubscriptionStatus(id, "gepauzeerd", "subscription_paused", options);
}

export function cancelSubscription(id, options = {}) {
  return changeSubscriptionStatus(id, "opgezegd", "subscription_cancelled", options);
}

export function reactivateSubscription(id, options = {}) {
  return changeSubscriptionStatus(id, "actief", "subscription_reactivated", options);
}

export function archiveSubscription(id, options = {}) {
  return changeSubscriptionStatus(id, "gearchiveerd", "subscription_archived", options);
}

export function createInvoiceFromSubscription(id, options = {}) {
  logActivity("subscriptions", id, "subscription_invoice_created", { source: options.source || "admin-dashboard", timestamp: nowIso() });
  return { success: true, deferredToAdminDashboard: true };
}

export const SubscriptionRepository = {
  ...localSubscriptionRepository,
  listLocalSubscriptions,
  listSupabaseSubscriptions,
  listHybridSubscriptions,
  listByDataMode,
  getSubscriptionSource,
  mergeSubscriptionSources,
  mapLocalSubscriptionToSupabase,
  mapSupabaseSubscriptionToLocal,
  validateSubscriptionForSupabase,
  prepareSubscriptionsForMigration,
  createSubscription,
  updateSubscription,
  pauseSubscription,
  cancelSubscription,
  reactivateSubscription,
  archiveSubscription,
  createInvoiceFromSubscription,
  getSubscriptionHistory,
  canWriteSubscription,
};
