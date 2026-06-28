import { CUSTOMER_DATA_MODES } from "../config/environment.js";
import { PRIMARY_MODULE_KEYS, STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { logActivity, listActivitiesForEntity } from "../services/activityLogService.js";
import {
  calculateInvoiceTotals,
  invoiceIdentityKeys,
  localInvoiceStatus,
  normalizeInvoice,
  normalizeInvoiceLine,
  normalizePaymentStatus,
  supabaseInvoiceStatus,
  supabasePaymentStatus,
} from "../utils/invoiceNormalizer.js";
import { listLocalCustomers } from "./CustomerRepository.js";
import { listLocalProjects } from "./ProjectRepository.js";
import { listLocalQuotes } from "./QuoteRepository.js";
import { listLocalWebsites } from "./WebsiteRepository.js";
import { createRepository } from "./createRepository.js";

const localInvoiceRepository = createRepository(PRIMARY_MODULE_KEYS.invoices);

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

function invoiceDataMode() {
  return readJson(STORAGE_KEYS.settings, {})?.invoiceDataMode
    || localStorage.getItem(STORAGE_KEYS.invoiceDataMode)
    || CUSTOMER_DATA_MODES.LOCAL;
}

function sourceLabel(invoice = {}) {
  if (invoice.isDemo || invoice.isDemoJourney || invoice.environment === "demo") return "demo";
  return invoice._source || "local";
}

function isSupabaseInvoice(invoice = {}) {
  return ["supabase", "hybrid"].includes(invoice._source) || Boolean(invoice._supabaseInvoiceId || invoice.supabaseInvoiceId);
}

function invoiceWriteTarget(invoice = {}, options = {}) {
  if (options.target) return options.target;
  if (options.forceLocal || invoice.isDemo || invoice.environment === "demo") return "local";
  return isSupabaseInvoice(invoice) ? "supabase" : "local";
}

function localInvoicePayload(invoice = {}) {
  return normalizeInvoice({
    ...invoice,
    status: localInvoiceStatus(invoice.status),
    paymentStatus: normalizePaymentStatus(invoice.paymentStatus, invoice.status),
  });
}

export function markInvoiceSource(invoice = {}, source = "local", extra = {}) {
  const resolvedSource = sourceLabel({ ...invoice, _source: source });
  const supabaseInvoiceId = extra.supabaseInvoiceId
    || invoice.supabaseInvoiceId
    || (["supabase", "hybrid"].includes(resolvedSource) ? invoice.id : "");
  return {
    ...invoice,
    _source: resolvedSource,
    _isMigrated: Boolean(invoice.supabaseInvoiceId || invoice.migratedToSupabaseAt || extra.supabaseInvoiceId),
    _supabaseInvoiceId: supabaseInvoiceId,
    _localInvoiceId: extra.localInvoiceId || invoice._localInvoiceId || invoice.metadata?.localStorageId || "",
    _customerSource: extra.customerSource || invoice._customerSource || "",
    _websiteSource: extra.websiteSource || invoice._websiteSource || "",
    _projectSource: extra.projectSource || invoice._projectSource || "",
    _quoteSource: extra.quoteSource || invoice._quoteSource || "",
    _subscriptionSource: extra.subscriptionSource || invoice._subscriptionSource || "",
    _linkedCustomerStatus: extra.linkedCustomerStatus || invoice._linkedCustomerStatus || "",
    _linkedWebsiteStatus: extra.linkedWebsiteStatus || invoice._linkedWebsiteStatus || "",
    _linkedProjectStatus: extra.linkedProjectStatus || invoice._linkedProjectStatus || "",
    _linkedQuoteStatus: extra.linkedQuoteStatus || invoice._linkedQuoteStatus || "",
    _linkedSubscriptionStatus: extra.linkedSubscriptionStatus || invoice._linkedSubscriptionStatus || "",
    _sourceMeta: {
      ...(invoice._sourceMeta || {}),
      ...extra,
    },
  };
}

export function getInvoiceSource(invoice = {}) {
  return sourceLabel(invoice);
}

function localInvoicesFromStorage() {
  const seen = new Set();
  return readArray(STORAGE_KEYS.invoices)
    .map(normalizeInvoice)
    .filter((invoice) => {
      const keys = invoiceIdentityKeys(invoice);
      const key = keys.invoiceNumber || keys.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function listLocalInvoices() {
  return localInvoicesFromStorage().map((invoice) => markInvoiceSource(invoice, invoice.isDemo || invoice.environment === "demo" ? "demo" : "local", {
    localInvoiceId: invoice.id,
    supabaseInvoiceId: invoice.supabaseInvoiceId || "",
  }));
}

export async function listSupabaseInvoices() {
  const [rows, lineRows] = await Promise.all([
    supabaseProvider.getAll("invoices", { limit: 100 }),
    supabaseProvider.getAll("invoice_lines", { limit: 100 }),
  ]);
  const linesByInvoiceId = new Map();
  lineRows.forEach((line) => {
    const invoiceId = line.invoice_id || "";
    if (!invoiceId) return;
    if (!linesByInvoiceId.has(invoiceId)) linesByInvoiceId.set(invoiceId, []);
    linesByInvoiceId.get(invoiceId).push(line);
  });
  return rows.map((row) => markInvoiceSource(mapSupabaseInvoiceToLocal(row, linesByInvoiceId.get(row.id) || []), "supabase", {
    supabaseInvoiceId: row.id,
    localInvoiceId: row.metadata?.localStorageId || row.external_id || "",
  }));
}

function mergeSupabaseWithLocal(localInvoice, supabaseInvoice, reason = "supabase_match") {
  return markInvoiceSource({
    ...localInvoice,
    ...supabaseInvoice,
    id: localInvoice.id || supabaseInvoice.id,
    profileId: localInvoice.profileId || supabaseInvoice.profileId,
    customerId: localInvoice.customerId || supabaseInvoice.customerId,
    websiteId: localInvoice.websiteId || supabaseInvoice.websiteId,
    projectId: localInvoice.projectId || supabaseInvoice.projectId,
    sourceQuoteId: localInvoice.sourceQuoteId || supabaseInvoice.sourceQuoteId,
    subscriptionId: localInvoice.subscriptionId || supabaseInvoice.subscriptionId,
    createdAt: supabaseInvoice.createdAt || localInvoice.createdAt,
    updatedAt: supabaseInvoice.updatedAt || localInvoice.updatedAt,
  }, "hybrid", {
    reason,
    localInvoiceId: localInvoice.id || "",
    supabaseInvoiceId: supabaseInvoice.id || localInvoice.supabaseInvoiceId || "",
  });
}

export function mergeInvoiceSources(localInvoices = [], supabaseInvoices = []) {
  const merged = [];
  const duplicateMerges = [];
  const usedLocalIds = new Set();
  const localBySupabaseId = new Map();
  const localByNumber = new Map();
  localInvoices.forEach((invoice) => {
    const normalized = normalizeInvoice(invoice);
    if (normalized.supabaseInvoiceId) localBySupabaseId.set(String(normalized.supabaseInvoiceId), normalized);
    if (normalized.invoiceNumber) localByNumber.set(normalized.invoiceNumber.toLowerCase(), normalized);
  });
  supabaseInvoices.forEach((invoice) => {
    const normalized = normalizeInvoice(invoice);
    const localMatch = localBySupabaseId.get(String(normalized.id))
      || (normalized.invoiceNumber ? localByNumber.get(normalized.invoiceNumber.toLowerCase()) : null);
    if (localMatch) {
      usedLocalIds.add(localMatch.id);
      const reason = localMatch.supabaseInvoiceId === normalized.id ? "supabaseInvoiceId" : "invoiceNumber";
      duplicateMerges.push({ reason, localInvoiceId: localMatch.id, supabaseInvoiceId: normalized.id, invoiceNumber: normalized.invoiceNumber });
      merged.push(mergeSupabaseWithLocal(localMatch, normalized, reason));
      return;
    }
    merged.push(markInvoiceSource(normalized, "supabase", { supabaseInvoiceId: normalized.id }));
  });
  localInvoices.map(normalizeInvoice).forEach((invoice) => {
    if (usedLocalIds.has(invoice.id)) return;
    if (invoice.supabaseInvoiceId && !invoice.isDemo && invoice.environment !== "demo") return;
    merged.push(markInvoiceSource(invoice, invoice.isDemo || invoice.environment === "demo" ? "demo" : "local", {
      localInvoiceId: invoice.id,
      supabaseInvoiceId: invoice.supabaseInvoiceId || "",
    }));
  });
  return {
    invoices: merged,
    duplicateMerges,
    counts: {
      local: localInvoices.length,
      supabase: supabaseInvoices.length,
      hybrid: merged.length,
      duplicateMerges: duplicateMerges.length,
      demo: merged.filter((invoice) => getInvoiceSource(invoice) === "demo").length,
      unmigratedLocal: merged.filter((invoice) => getInvoiceSource(invoice) === "local" && !invoice._isMigrated).length,
      openAmount: merged.filter((invoice) => !["betaald", "geannuleerd", "gearchiveerd"].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.total || invoice.amount || 0), 0),
      paidAmount: merged.filter((invoice) => invoice.status === "betaald").reduce((sum, invoice) => sum + Number(invoice.total || invoice.amount || 0), 0),
    },
  };
}

export async function listHybridInvoices() {
  const localInvoices = listLocalInvoices();
  const supabaseInvoices = await listSupabaseInvoices();
  return mergeInvoiceSources(localInvoices, supabaseInvoices);
}

export async function listByDataMode(mode = CUSTOMER_DATA_MODES.LOCAL) {
  if (mode === CUSTOMER_DATA_MODES.SUPABASE_READ) {
    const invoices = await listSupabaseInvoices();
    return {
      mode,
      invoices,
      counts: { local: listLocalInvoices().length, supabase: invoices.length, hybrid: invoices.length, duplicateMerges: 0, demo: 0, unmigratedLocal: 0 },
      fallbackUsed: false,
      error: "",
      refreshedAt: nowIso(),
    };
  }
  if (mode === CUSTOMER_DATA_MODES.HYBRID) {
    try {
      const merged = await listHybridInvoices();
      return { mode, ...merged, fallbackUsed: false, error: "", refreshedAt: nowIso() };
    } catch (error) {
      const invoices = listLocalInvoices();
      return {
        mode,
        invoices,
        counts: { local: invoices.length, supabase: 0, hybrid: invoices.length, duplicateMerges: 0, demo: invoices.filter((invoice) => getInvoiceSource(invoice) === "demo").length, unmigratedLocal: invoices.length },
        fallbackUsed: true,
        error: error.message || "Supabase invoices konden niet worden gelezen.",
        refreshedAt: nowIso(),
      };
    }
  }
  const invoices = listLocalInvoices();
  return {
    mode: CUSTOMER_DATA_MODES.LOCAL,
    invoices,
    counts: { local: invoices.length, supabase: 0, hybrid: invoices.length, duplicateMerges: 0, demo: invoices.filter((invoice) => getInvoiceSource(invoice) === "demo").length, unmigratedLocal: invoices.length },
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

function localQuotesById() {
  return new Map(listLocalQuotes().map((quote) => [quote.id, quote]));
}

function localSubscriptionsById() {
  return new Map(readArray(STORAGE_KEYS.subscriptions).map((subscription) => [subscription.id, subscription]));
}

export function resolveInvoiceCustomerLink(invoice = {}) {
  const normalized = normalizeInvoice(invoice);
  if (normalized.supabaseCustomerId) return { status: "linked", supabaseCustomerId: normalized.supabaseCustomerId, source: "invoice" };
  const customer = localCustomersById().get(normalized.profileId || normalized.customerId);
  if (!normalized.profileId && !normalized.customerId) return { status: "missing_customer", message: "Factuur mist customerId." };
  if (!customer) return { status: "customer_not_found", message: "Lokale klant niet gevonden." };
  const supabaseCustomerId = customer.supabaseCustomerId || customer._supabaseCustomerId || customer.id;
  if (supabaseCustomerId && (customer._source === "supabase" || customer._source === "hybrid" || customer.supabaseCustomerId)) {
    return { status: "linked", supabaseCustomerId, source: customer._source || "local_with_supabase_id" };
  }
  return { status: "waiting_customer_migration", localCustomerId: customer.id, message: "Wacht op customer migratie." };
}

export function resolveInvoiceWebsiteLink(invoice = {}) {
  const normalized = normalizeInvoice(invoice);
  if (!normalized.websiteId && !normalized.supabaseWebsiteId) return { status: "not_required", message: "Geen website gekoppeld." };
  if (normalized.supabaseWebsiteId) return { status: "linked", supabaseWebsiteId: normalized.supabaseWebsiteId, source: "invoice" };
  const website = localWebsitesById().get(normalized.websiteId);
  if (!website) return { status: "website_not_found", message: "Lokale website niet gevonden." };
  const supabaseWebsiteId = website.supabaseWebsiteId || website._supabaseWebsiteId || website.id;
  if (supabaseWebsiteId && (website._source === "supabase" || website._source === "hybrid" || website.supabaseWebsiteId)) {
    return { status: "linked", supabaseWebsiteId, source: website._source || "local_with_supabase_id" };
  }
  return { status: "waiting_website_migration", localWebsiteId: website.id, message: "Wacht op website migratie." };
}

export function resolveInvoiceProjectLink(invoice = {}) {
  const normalized = normalizeInvoice(invoice);
  if (!normalized.projectId && !normalized.supabaseProjectId) return { status: "not_required", message: "Geen project gekoppeld." };
  if (normalized.supabaseProjectId) return { status: "linked", supabaseProjectId: normalized.supabaseProjectId, source: "invoice" };
  const project = localProjectsById().get(normalized.projectId);
  if (!project) return { status: "project_not_found", message: "Lokaal project niet gevonden." };
  const supabaseProjectId = project.supabaseProjectId || project._supabaseProjectId || project.id;
  if (supabaseProjectId && (project._source === "supabase" || project._source === "hybrid" || project.supabaseProjectId)) {
    return { status: "linked", supabaseProjectId, source: project._source || "local_with_supabase_id" };
  }
  return { status: "waiting_project_migration", localProjectId: project.id, message: "Wacht op project migratie." };
}

export function resolveInvoiceQuoteLink(invoice = {}) {
  const normalized = normalizeInvoice(invoice);
  if (!normalized.sourceQuoteId && !normalized.supabaseQuoteId) return { status: "not_required", message: "Geen offerte gekoppeld." };
  if (normalized.supabaseQuoteId) return { status: "linked", supabaseQuoteId: normalized.supabaseQuoteId, source: "invoice" };
  const quote = localQuotesById().get(normalized.sourceQuoteId);
  if (!quote) return { status: "quote_not_found", message: "Lokale offerte niet gevonden." };
  const supabaseQuoteId = quote.supabaseQuoteId || quote._supabaseQuoteId || quote.id;
  if (supabaseQuoteId && (quote._source === "supabase" || quote._source === "hybrid" || quote.supabaseQuoteId)) {
    return { status: "linked", supabaseQuoteId, source: quote._source || "local_with_supabase_id" };
  }
  return { status: "waiting_quote_migration", localQuoteId: quote.id, message: "Wacht op offerte migratie." };
}

export function resolveInvoiceSubscriptionLink(invoice = {}) {
  const normalized = normalizeInvoice(invoice);
  if (!normalized.subscriptionId && !normalized.supabaseSubscriptionId) return { status: "not_required", message: "Geen abonnement gekoppeld." };
  if (normalized.supabaseSubscriptionId) return { status: "linked", supabaseSubscriptionId: normalized.supabaseSubscriptionId, source: "invoice" };
  const subscription = localSubscriptionsById().get(normalized.subscriptionId);
  if (!subscription) return { status: "subscription_not_found", message: "Lokaal abonnement niet gevonden." };
  const supabaseSubscriptionId = subscription.supabaseSubscriptionId || subscription._supabaseSubscriptionId || "";
  if (supabaseSubscriptionId) return { status: "linked", supabaseSubscriptionId, source: "local_with_supabase_id" };
  return { status: "waiting_subscription_migration", localSubscriptionId: subscription.id, message: "Wacht op abonnement migratie." };
}

export function mapLocalInvoiceLineToSupabase(line = {}, invoice = {}) {
  const normalized = normalizeInvoiceLine(line);
  return {
    id: normalized.externalId && normalized.externalId !== normalized.id ? normalized.id : undefined,
    external_id: normalized.externalId || normalized.id,
    invoice_id: invoice.supabaseInvoiceId || invoice._supabaseInvoiceId || invoice.id || null,
    description: normalized.description,
    quantity: normalized.quantity,
    unit_price: normalized.unitPrice,
    vat_percentage: normalized.vatRate,
    line_subtotal: normalized.subtotal,
    line_vat: normalized.vat,
    line_total: normalized.total,
    sort_order: normalized.sortOrder,
    metadata: normalized.metadata || {},
  };
}

export function mapSupabaseInvoiceLineToLocal(row = {}) {
  return normalizeInvoiceLine({
    id: row.external_id || row.id,
    externalId: row.external_id || row.id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    vatRate: row.vat_percentage,
    subtotal: row.line_subtotal,
    vat: row.line_vat,
    total: row.line_total,
    sortOrder: row.sort_order,
    metadata: row.metadata || {},
  });
}

export function mapLocalInvoiceToSupabase(invoice = {}) {
  const normalized = normalizeInvoice(invoice);
  const customerLink = resolveInvoiceCustomerLink(normalized);
  const websiteLink = resolveInvoiceWebsiteLink(normalized);
  const projectLink = resolveInvoiceProjectLink(normalized);
  const quoteLink = resolveInvoiceQuoteLink(normalized);
  const subscriptionLink = resolveInvoiceSubscriptionLink(normalized);
  const totals = calculateInvoiceTotals(normalized.lines);
  return {
    invoice: {
      external_id: normalized.id,
      invoice_number: normalized.invoiceNumber,
      customer_id: customerLink.supabaseCustomerId || null,
      website_id: websiteLink.supabaseWebsiteId || null,
      project_id: projectLink.supabaseProjectId || null,
      quote_id: quoteLink.supabaseQuoteId || null,
      subscription_id: subscriptionLink.supabaseSubscriptionId || null,
      type: normalized.type,
      title: normalized.title,
      status: supabaseInvoiceStatus(normalized.status),
      payment_status: supabasePaymentStatus(normalized.paymentStatus),
      invoice_date: normalized.invoiceDate || null,
      due_date: normalized.dueDate || null,
      paid_at: normalized.paidAt || null,
      subtotal_amount: totals.subtotal,
      vat_amount: totals.vat,
      total_amount: totals.total,
      payment_link: normalized.paymentLink || "",
      demo_payment_link: normalized.demoPaymentLink || "",
      mollie_payment_id: normalized.molliePaymentId || "",
      pdf_file_path: normalized.pdfFilePath || "",
      internal_notes: normalized.internalNotes || normalized.notes || "",
      source_quote_number: normalized.sourceQuoteNumber || "",
      is_demo: normalized.isDemo,
      is_demo_journey: normalized.isDemoJourney,
      environment: normalized.environment,
      metadata: {
        ...(normalized.metadata || {}),
        localStorageId: normalized.id,
        localCustomerId: normalized.profileId || normalized.customerId || "",
        localWebsiteId: normalized.websiteId || "",
        localProjectId: normalized.projectId || "",
        localQuoteId: normalized.sourceQuoteId || "",
        localSubscriptionId: normalized.subscriptionId || "",
        demoScenarioId: normalized.demoScenarioId || "",
        demoJourneyId: normalized.demoJourneyId || "",
      },
      created_at: normalized.createdAt,
      updated_at: normalized.updatedAt || nowIso(),
    },
    lines: normalized.lines.map((line, index) => mapLocalInvoiceLineToSupabase({ ...line, sortOrder: index }, normalized)),
    links: { customerLink, websiteLink, projectLink, quoteLink, subscriptionLink },
  };
}

export function mapSupabaseInvoiceToLocal(row = {}, lineRows = []) {
  const lines = lineRows.map(mapSupabaseInvoiceLineToLocal);
  return normalizeInvoice({
    id: row.external_id || row.id,
    externalId: row.external_id || "",
    supabaseInvoiceId: row.id,
    invoiceNumber: row.invoice_number,
    profileId: row.metadata?.localCustomerId || row.customer_id || "",
    supabaseCustomerId: row.customer_id || "",
    websiteId: row.metadata?.localWebsiteId || row.website_id || "",
    supabaseWebsiteId: row.website_id || "",
    projectId: row.metadata?.localProjectId || row.project_id || "",
    supabaseProjectId: row.project_id || "",
    sourceQuoteId: row.metadata?.localQuoteId || row.quote_id || "",
    supabaseQuoteId: row.quote_id || "",
    subscriptionId: row.metadata?.localSubscriptionId || row.subscription_id || "",
    supabaseSubscriptionId: row.subscription_id || "",
    type: row.type,
    title: row.title,
    status: row.status,
    paymentStatus: row.payment_status,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    lines,
    subtotal: row.subtotal_amount,
    vatAmount: row.vat_amount,
    total: row.total_amount,
    paymentLink: row.payment_link,
    demoPaymentLink: row.demo_payment_link,
    molliePaymentId: row.mollie_payment_id,
    pdfFilePath: row.pdf_file_path,
    notes: row.internal_notes,
    internalNotes: row.internal_notes,
    sourceQuoteNumber: row.source_quote_number,
    isDemo: row.is_demo,
    isDemoJourney: row.is_demo_journey,
    environment: row.environment,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function validateInvoiceForSupabase(invoice = {}) {
  const normalized = normalizeInvoice(invoice);
  const errors = [];
  const warnings = [];
  if (!normalized.invoiceNumber) errors.push("Factuurnummer ontbreekt.");
  if (!normalized.profileId && !normalized.supabaseCustomerId) errors.push("Factuur mist klantkoppeling.");
  if (!normalized.status) errors.push("Factuurstatus ontbreekt.");
  if (!normalized.paymentStatus) warnings.push("Betaalstatus ontbreekt of is afgeleid van status.");
  if (!normalized.invoiceDate) warnings.push("Factuurdatum ontbreekt.");
  if (!normalized.dueDate && normalized.status !== "betaald") warnings.push("Vervaldatum ontbreekt.");
  if (!normalized.lines.length) errors.push("Factuur heeft geen factuurregels.");
  normalized.lines.forEach((line, index) => {
    if (!line.description) errors.push(`Factuurregel ${index + 1} mist omschrijving.`);
    if (line.quantity <= 0) errors.push(`Factuurregel ${index + 1} heeft ongeldig aantal.`);
    if (line.unitPrice < 0) errors.push(`Factuurregel ${index + 1} heeft ongeldige prijs.`);
  });
  const calculated = calculateInvoiceTotals(normalized.lines);
  if (Math.abs(calculated.total - Number(normalized.total || 0)) > 0.02) warnings.push("Factuurtotaal wijkt af van berekende regels.");
  if ((normalized.isDemo || normalized.isDemoJourney) && !normalized.demoScenarioId && !normalized.demoJourneyId && normalized.environment === "demo") {
    warnings.push("Demo-factuur mist demoScenarioId/demoJourneyId.");
  }
  const customerLink = resolveInvoiceCustomerLink(normalized);
  const websiteLink = resolveInvoiceWebsiteLink(normalized);
  const projectLink = resolveInvoiceProjectLink(normalized);
  const quoteLink = resolveInvoiceQuoteLink(normalized);
  const subscriptionLink = resolveInvoiceSubscriptionLink(normalized);
  if (customerLink.status !== "linked") errors.push(customerLink.message || "Customer koppeling is niet klaar.");
  [websiteLink, projectLink, quoteLink, subscriptionLink].forEach((link) => {
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
    quoteLink,
    subscriptionLink,
  };
}

export function prepareInvoicesForMigration(invoices = listLocalInvoices()) {
  const normalized = invoices.map(normalizeInvoice);
  const seenNumbers = new Map();
  const duplicates = [];
  const unique = [];
  normalized.forEach((invoice) => {
    const key = invoice.invoiceNumber.toLowerCase() || invoice.id;
    if (seenNumbers.has(key)) {
      duplicates.push({ key, invoice, duplicateOf: seenNumbers.get(key) });
      return;
    }
    seenNumbers.set(key, invoice.id);
    unique.push(invoice);
  });
  const validation = unique.map(validateInvoiceForSupabase);
  return {
    total: normalized.length,
    unique,
    duplicates,
    ready: validation.filter((item) => item.ready),
    waitingForCustomer: validation.filter((item) => item.customerLink.status === "waiting_customer_migration"),
    waitingForWebsite: validation.filter((item) => item.websiteLink.status === "waiting_website_migration"),
    waitingForProject: validation.filter((item) => item.projectLink.status === "waiting_project_migration"),
    waitingForQuote: validation.filter((item) => item.quoteLink.status === "waiting_quote_migration"),
    waitingForSubscription: validation.filter((item) => item.subscriptionLink.status === "waiting_subscription_migration"),
    invalidLines: validation.filter((item) => item.errors.some((error) => error.includes("Factuurregel") || error.includes("factuurregels"))),
    attention: validation.filter((item) => !item.ready || item.warnings.length),
    payload: unique.map(mapLocalInvoiceToSupabase),
    validation,
  };
}

function getSupabaseWriteTest() {
  const invoiceLatest = readJson(STORAGE_KEYS.lastInvoiceWriteTest, null);
  const generalLatest = readJson(STORAGE_KEYS.lastSupabaseWriteTest, null);
  return invoiceLatest || generalLatest;
}

export function canWriteInvoice(invoice = {}, context = {}) {
  const mode = context.mode || invoiceDataMode();
  const status = supabaseProvider.getStatus();
  const readOnly = readJson(STORAGE_KEYS.lastSupabaseReadOnlyTest, null);
  const writeTest = getSupabaseWriteTest();
  const validation = validateInvoiceForSupabase(invoice);
  const customerLink = context.customerLink || validation.customerLink;
  const websiteLink = context.websiteLink || validation.websiteLink;
  const projectLink = context.projectLink || validation.projectLink;
  const quoteLink = context.quoteLink || validation.quoteLink;
  const subscriptionLink = context.subscriptionLink || validation.subscriptionLink;
  const source = getInvoiceSource(invoice);
  const missing = [];
  const target = context.target || (isSupabaseInvoice(invoice) ? "supabase" : "local");
  if (target === "local") return { allowed: true, target, mode, source, missing, reason: "Lokale factuur blijft localStorage.", customerLink, websiteLink, projectLink, quoteLink, subscriptionLink };
  if ((invoice.isDemo || invoice.environment === "demo") && context.allowDemoSupabase !== true) missing.push("Demo-factuur mag niet naar Supabase zonder expliciete demo-Supabase context.");
  if (![CUSTOMER_DATA_MODES.SUPABASE_READ, CUSTOMER_DATA_MODES.HYBRID].includes(mode) && context.allowSupabaseInLocalMode !== true) missing.push("Invoice data mode is niet supabase-read of hybrid.");
  if (!status.hasUrl) missing.push("Supabase URL ontbreekt.");
  if (!status.hasAnonKey) missing.push("Supabase anon key ontbreekt.");
  if (!status.clientPackageAvailable) missing.push("Supabase client is niet geladen.");
  if (!readOnly?.success && !readOnly?.connected) missing.push("Read-only test is niet succesvol.");
  if (customerLink.status !== "linked" && context.allowOrphanInvoice !== true) missing.push(customerLink.message || "Factuur mist Supabase customer koppeling.");
  if (validation.errors.length && context.invoiceWriteTest !== true) missing.push(validation.errors.join(" "));
  if (context.invoiceWriteTest !== true && writeTest?.status !== "completed" && writeTest?.status !== "invoice_completed") missing.push("Supabase write-test is niet succesvol.");
  return { allowed: missing.length === 0, target, mode, source, missing, reason: missing.join(" "), supabase: status, readOnly, writeTest, customerLink, websiteLink, projectLink, quoteLink, subscriptionLink, validation };
}

function logInvoiceWrite(action, invoice, metadata = {}) {
  return logActivity("invoices", invoice?.id || metadata.invoiceId || "unknown", action, {
    invoiceId: invoice?.id || metadata.invoiceId || "",
    supabaseInvoiceId: invoice?._supabaseInvoiceId || invoice?.supabaseInvoiceId || metadata.supabaseInvoiceId || "",
    customerId: invoice?.profileId || invoice?.customerId || metadata.customerId || "",
    websiteId: invoice?.websiteId || metadata.websiteId || "",
    projectId: invoice?.projectId || metadata.projectId || "",
    sourceQuoteId: invoice?.sourceQuoteId || metadata.sourceQuoteId || "",
    subscriptionId: invoice?.subscriptionId || metadata.subscriptionId || "",
    source: getInvoiceSource(invoice),
    performedBy: "local-admin",
    timestamp: nowIso(),
    ...metadata,
  });
}

export function getInvoiceHistory(id) {
  return listActivitiesForEntity("invoices", id).filter((activity) => [
    "invoice_created",
    "invoice_updated",
    "invoice_archived",
    "invoice_reactivated",
    "invoice_marked_sent",
    "invoice_marked_paid",
    "invoice_marked_expired",
    "invoice_write_failed",
  ].includes(activity.action));
}

function cleanLocalInvoice(invoice = {}) {
  const normalized = normalizeInvoice(invoice);
  const {
    _source,
    _isMigrated,
    _supabaseInvoiceId,
    _localInvoiceId,
    _customerSource,
    _websiteSource,
    _projectSource,
    _quoteSource,
    _subscriptionSource,
    _linkedCustomerStatus,
    _linkedWebsiteStatus,
    _linkedProjectStatus,
    _linkedQuoteStatus,
    _linkedSubscriptionStatus,
    _sourceMeta,
    ...clean
  } = normalized;
  return clean;
}

function writeLocalInvoices(invoices = []) {
  localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(invoices.map(cleanLocalInvoice)));
}

function saveLocalInvoice(data = {}) {
  const invoices = listLocalInvoices();
  const index = invoices.findIndex((invoice) => invoice.id === data.id);
  const existing = index >= 0 ? invoices[index] : {};
  const invoice = localInvoicePayload({
    ...existing,
    ...data,
    id: data.id || existing.id,
    createdAt: existing.createdAt || nowIso(),
    updatedAt: nowIso(),
  });
  const validation = validateInvoiceForSupabase({ ...invoice, supabaseCustomerId: invoice.supabaseCustomerId || "local" });
  if (!invoice.profileId && !invoice.customerId) throw new Error("Kies eerst een klant.");
  if (!invoice.invoiceNumber) throw new Error("Vul een factuurnummer in.");
  if (!invoice.lines.length) throw new Error("Voeg minimaal een factuurregel toe.");
  if (validation.errors.some((error) => error.includes("Factuurregel"))) throw new Error(validation.errors.find((error) => error.includes("Factuurregel")));
  if (index >= 0) invoices[index] = invoice;
  else invoices.unshift(invoice);
  writeLocalInvoices(invoices);
  logInvoiceWrite(index >= 0 ? "invoice_updated" : "invoice_created", invoice, { target: "local" });
  return markInvoiceSource(invoice, invoice.isDemo || invoice.environment === "demo" ? "demo" : "local", { localInvoiceId: invoice.id });
}

function requireInvoiceWrite(invoice = {}, options = {}) {
  const readiness = canWriteInvoice(invoice, { ...options, target: "supabase" });
  if (!readiness.allowed) {
    const error = new Error(readiness.reason || "Invoice write naar Supabase is geblokkeerd.");
    error.code = "INVOICE_WRITE_BLOCKED";
    error.readiness = readiness;
    throw error;
  }
  return readiness;
}

function assertNoConflict(oldInvoice = {}, options = {}) {
  const remoteUpdatedAt = oldInvoice._sourceMeta?.remoteUpdatedAt || oldInvoice.updatedAt;
  if (!options.baseUpdatedAt || !remoteUpdatedAt) return;
  if (new Date(remoteUpdatedAt).getTime() > new Date(options.baseUpdatedAt).getTime()) {
    const error = new Error("Supabase heeft een nieuwere factuurversie. Ververs factuurgegevens voordat je opslaat.");
    error.code = "INVOICE_CONFLICT";
    throw error;
  }
}

export async function createInvoice(data = {}, options = {}) {
  const target = invoiceWriteTarget(data, options);
  if (target === "local") return saveLocalInvoice(data);
  const readiness = requireInvoiceWrite(data, options);
  const mapped = mapLocalInvoiceToSupabase(data);
  const result = await supabaseProvider.createInvoice(mapped.invoice, mapped.lines, { invoiceWrite: true });
  const invoice = markInvoiceSource(mapSupabaseInvoiceToLocal(result.data, result.lines), "supabase", {
    supabaseInvoiceId: result.data.id,
    linkedCustomerStatus: readiness.customerLink.status,
    linkedWebsiteStatus: readiness.websiteLink.status,
    linkedProjectStatus: readiness.projectLink.status,
    linkedQuoteStatus: readiness.quoteLink.status,
    linkedSubscriptionStatus: readiness.subscriptionLink.status,
  });
  logInvoiceWrite("invoice_created", invoice, { target: "supabase" });
  return invoice;
}

export async function updateInvoice(id, data = {}, options = {}) {
  const oldInvoice = options.oldInvoice || listLocalInvoices().find((invoice) => invoice.id === id || invoice.supabaseInvoiceId === id) || {};
  const target = invoiceWriteTarget(oldInvoice, options);
  if (target === "local") return saveLocalInvoice({ ...oldInvoice, ...data, id: oldInvoice.id || id });
  assertNoConflict(oldInvoice, options);
  const remoteId = oldInvoice._supabaseInvoiceId || oldInvoice.supabaseInvoiceId || id;
  const readiness = requireInvoiceWrite({ ...oldInvoice, ...data }, options);
  const mapped = mapLocalInvoiceToSupabase({ ...oldInvoice, ...data, supabaseInvoiceId: remoteId });
  const result = await supabaseProvider.updateInvoice(remoteId, mapped.invoice, mapped.lines, { invoiceWrite: true });
  const invoice = markInvoiceSource(mapSupabaseInvoiceToLocal(result.data, result.lines), "supabase", {
    supabaseInvoiceId: result.data.id,
    linkedCustomerStatus: readiness.customerLink.status,
    linkedWebsiteStatus: readiness.websiteLink.status,
    linkedProjectStatus: readiness.projectLink.status,
    linkedQuoteStatus: readiness.quoteLink.status,
    linkedSubscriptionStatus: readiness.subscriptionLink.status,
  });
  logInvoiceWrite("invoice_updated", invoice, { target: "supabase" });
  return invoice;
}

export async function archiveInvoice(id, options = {}) {
  const invoice = options.invoice || listLocalInvoices().find((item) => item.id === id || item.supabaseInvoiceId === id) || {};
  const target = invoiceWriteTarget(invoice, options);
  if (target === "local") return saveLocalInvoice({ ...invoice, status: "gearchiveerd" });
  const remoteId = invoice._supabaseInvoiceId || invoice.supabaseInvoiceId || id;
  const result = await supabaseProvider.archiveInvoice(remoteId, { invoiceWrite: true });
  const archived = markInvoiceSource(mapSupabaseInvoiceToLocal(result.data), "supabase", { supabaseInvoiceId: result.data.id });
  logInvoiceWrite("invoice_archived", archived, { target: "supabase" });
  return archived;
}

export async function reactivateInvoice(id, options = {}) {
  const invoice = options.invoice || listLocalInvoices().find((item) => item.id === id || item.supabaseInvoiceId === id) || {};
  const target = invoiceWriteTarget(invoice, options);
  if (target === "local") return saveLocalInvoice({ ...invoice, status: "concept" });
  const remoteId = invoice._supabaseInvoiceId || invoice.supabaseInvoiceId || id;
  const result = await supabaseProvider.reactivateInvoice(remoteId, { invoiceWrite: true });
  const reactivated = markInvoiceSource(mapSupabaseInvoiceToLocal(result.data), "supabase", { supabaseInvoiceId: result.data.id });
  logInvoiceWrite("invoice_reactivated", reactivated, { target: "supabase" });
  return reactivated;
}

async function markInvoiceStatus(id, status, action, options = {}) {
  const invoice = options.invoice || listLocalInvoices().find((item) => item.id === id || item.supabaseInvoiceId === id) || {};
  const target = invoiceWriteTarget(invoice, options);
  const paidAt = status === "betaald" ? nowIso() : invoice.paidAt;
  if (target === "local") {
    const saved = saveLocalInvoice({ ...invoice, status, paymentStatus: status, paidAt });
    logInvoiceWrite(action, saved, { target: "local", status });
    return saved;
  }
  const remoteId = invoice._supabaseInvoiceId || invoice.supabaseInvoiceId || id;
  const result = action === "invoice_marked_paid"
    ? await supabaseProvider.markInvoicePaid(remoteId, { invoiceWrite: true })
    : action === "invoice_marked_sent"
      ? await supabaseProvider.markInvoiceSent(remoteId, { invoiceWrite: true })
      : await supabaseProvider.markInvoiceExpired(remoteId, { invoiceWrite: true });
  const saved = markInvoiceSource(mapSupabaseInvoiceToLocal(result.data), "supabase", { supabaseInvoiceId: result.data.id });
  logInvoiceWrite(action, saved, { target: "supabase", status });
  return saved;
}

export function markInvoicePaid(id, options = {}) {
  return markInvoiceStatus(id, "betaald", "invoice_marked_paid", options);
}

export function markInvoiceSent(id, options = {}) {
  return markInvoiceStatus(id, "verzonden", "invoice_marked_sent", options);
}

export function markInvoiceExpired(id, options = {}) {
  return markInvoiceStatus(id, "verlopen", "invoice_marked_expired", options);
}

export const InvoiceRepository = {
  ...localInvoiceRepository,
  listLocalInvoices,
  listSupabaseInvoices,
  listHybridInvoices,
  listByDataMode,
  getInvoiceSource,
  mergeInvoiceSources,
  mapLocalInvoiceToSupabase,
  mapSupabaseInvoiceToLocal,
  mapLocalInvoiceLineToSupabase,
  mapSupabaseInvoiceLineToLocal,
  validateInvoiceForSupabase,
  prepareInvoicesForMigration,
  createInvoice,
  updateInvoice,
  archiveInvoice,
  reactivateInvoice,
  markInvoicePaid,
  markInvoiceSent,
  markInvoiceExpired,
  getInvoiceHistory,
  canWriteInvoice,
};
