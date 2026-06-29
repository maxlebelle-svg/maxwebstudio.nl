import { CUSTOMER_DATA_MODES } from "../config/environment.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import * as CustomerRepository from "../repositories/CustomerRepository.js";
import * as WebsiteRepository from "../repositories/WebsiteRepository.js";
import * as ProjectRepository from "../repositories/ProjectRepository.js";
import * as QuoteRepository from "../repositories/QuoteRepository.js";
import * as InvoiceRepository from "../repositories/InvoiceRepository.js";
import * as SubscriptionRepository from "../repositories/SubscriptionRepository.js";

export const CLIENT_PORTAL_DATA_MODES = Object.freeze({
  DEMO: "demo",
  LOCAL: "local",
  SUPABASE_READ: "supabase-read",
  HYBRID: "hybrid",
});

const MODULES = Object.freeze(["customers", "websites", "projects", "quotes", "invoices", "subscriptions", "files"]);
const OPEN_QUOTE_STATUSES = new Set(["concept", "draft", "verzonden", "sent", "geaccepteerd", "accepted"]);
const OPEN_INVOICE_STATUSES = new Set(["concept", "draft", "verzonden", "sent", "verlopen", "expired", "open"]);
const RUNNING_PROJECT_EXCLUDED = new Set(["live", "onderhoud", "maintenance", "gepauzeerd", "paused", "gearchiveerd", "archived"]);
const ACTIVE_WEBSITE_STATUSES = new Set(["online", "active", "actief", "live"]);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["actief", "active", "wacht_op_mandate", "mandate_required"]);

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readArray(key) {
  const value = readJson(key, []);
  return Array.isArray(value) ? value : [];
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sourceOf(record = {}) {
  if (record.isDemo || record.isDemoJourney || record.environment === "demo") return "demo";
  return record._source || record.source || "local";
}

function readClientPortalSettings() {
  return {
    ...(readJson(STORAGE_KEYS.settings, {}) || {}),
    ...(readJson(STORAGE_KEYS.clientPortalSettings, {}) || {}),
  };
}

function normalizeMode(mode = "") {
  const normalized = String(mode || "").trim().toLowerCase();
  if (Object.values(CLIENT_PORTAL_DATA_MODES).includes(normalized)) return normalized;
  if (normalized === CUSTOMER_DATA_MODES.SUPABASE_READ) return CLIENT_PORTAL_DATA_MODES.SUPABASE_READ;
  if (normalized === CUSTOMER_DATA_MODES.HYBRID) return CLIENT_PORTAL_DATA_MODES.HYBRID;
  return "";
}

export function resolveClientPortalDataMode(options = {}) {
  const settings = readClientPortalSettings();
  const explicit = normalizeMode(options.mode || options.dataMode || options.portalDataMode);
  if (explicit) return explicit;
  if (options.demo || String(options.customerId || "").startsWith("demo-")) return CLIENT_PORTAL_DATA_MODES.DEMO;
  const configured = normalizeMode(settings.clientPortalDataMode || localStorage.getItem(STORAGE_KEYS.clientPortalSettings));
  if (configured) return configured;
  if (options.supabaseCustomerId) return CLIENT_PORTAL_DATA_MODES.HYBRID;
  return CLIENT_PORTAL_DATA_MODES.LOCAL;
}

function repositoryMode(mode) {
  if (mode === CLIENT_PORTAL_DATA_MODES.SUPABASE_READ) return CUSTOMER_DATA_MODES.SUPABASE_READ;
  if (mode === CLIENT_PORTAL_DATA_MODES.HYBRID) return CUSTOMER_DATA_MODES.HYBRID;
  return CUSTOMER_DATA_MODES.LOCAL;
}

function localFiles() {
  return readArray(STORAGE_KEYS.files).map((file) => ({ ...file, _source: file._source || "local" }));
}

async function listModule(repository, collectionKey, mode) {
  if (!repository?.listByDataMode) {
    return { items: [], status: { mode, fallbackUsed: false, error: "", count: 0 } };
  }
  try {
    const result = await repository.listByDataMode(repositoryMode(mode));
    const items = Array.isArray(result?.[collectionKey]) ? result[collectionKey] : [];
    return {
      items,
      status: {
        mode: result?.mode || repositoryMode(mode),
        fallbackUsed: Boolean(result?.fallbackUsed),
        error: result?.error || "",
        count: items.length,
        refreshedAt: result?.refreshedAt || new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      items: [],
      status: {
        mode: repositoryMode(mode),
        fallbackUsed: true,
        error: error.message || "Data kon niet worden gelezen.",
        count: 0,
        refreshedAt: new Date().toISOString(),
      },
    };
  }
}

function identityValues(record = {}) {
  return [
    record.id,
    record.customerId,
    record.profileId,
    record.authUserId,
    record.supabaseCustomerId,
    record._supabaseCustomerId,
    record.customer_id,
    record.profile_id,
    record.metadata?.localCustomerId,
    record.metadata?.localStorageId,
    record._localCustomerId,
  ].filter(Boolean).map(String);
}

function customerMatches(customer = {}, ids = {}) {
  const values = identityValues(customer);
  const localId = ids.customerId ? String(ids.customerId) : "";
  const supabaseId = ids.supabaseCustomerId ? String(ids.supabaseCustomerId) : "";
  if (localId && values.includes(localId)) return true;
  if (supabaseId && values.includes(supabaseId)) return true;
  return false;
}

function findCustomer(customers = [], ids = {}) {
  const localId = ids.customerId ? String(ids.customerId) : "";
  const supabaseId = ids.supabaseCustomerId ? String(ids.supabaseCustomerId) : "";
  const customer = customers.find((item) => customerMatches(item, ids)) || null;
  const warnings = [];
  if (customer && localId && supabaseId) {
    const values = identityValues(customer);
    if (!values.includes(localId) || !values.includes(supabaseId)) {
      warnings.push("De opgegeven customerId en supabaseCustomerId wijzen niet naar dezelfde klant. Er wordt geen klantdata getoond.");
      return { customer: null, warnings, mismatch: true };
    }
  }
  return { customer, warnings, mismatch: false };
}

function belongsToCustomer(item = {}, customer = {}) {
  const values = new Set(identityValues(customer));
  return identityValues(item).some((value) => values.has(value));
}

function pick(record = {}, keys = []) {
  return keys.reduce((safe, key) => {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") safe[key] = record[key];
    return safe;
  }, {});
}

function safeSource(record = {}) {
  return { source: sourceOf(record) };
}

function safeCustomer(customer = {}) {
  return {
    ...pick(customer, ["id", "name", "company", "email", "phone", "website", "package", "status", "portalStatus", "customerSince", "createdAt", "updatedAt"]),
    ...safeSource(customer),
  };
}

function safeWebsite(website = {}) {
  return {
    ...pick(website, ["id", "name", "domain", "liveUrl", "stagingUrl", "status", "hostingPackage", "carePackage", "sslStatus", "lastDeployAt", "updatedAt"]),
    ...safeSource(website),
  };
}

function safeProject(project = {}) {
  return {
    ...pick(project, ["id", "name", "projectName", "status", "phase", "progress", "startDate", "deadline", "publicNotes", "updatedAt"]),
    ...safeSource(project),
  };
}

function safeQuote(quote = {}) {
  return {
    ...pick(quote, ["id", "quoteNumber", "status", "quoteDate", "validUntil", "total", "amount", "title", "acceptedAt"]),
    supabaseQuoteId: quote.supabaseQuoteId || quote._supabaseQuoteId || "",
    ...safeSource(quote),
  };
}

function safeInvoice(invoice = {}) {
  return {
    ...pick(invoice, ["id", "invoiceNumber", "status", "paymentStatus", "invoiceDate", "dueDate", "total", "amount", "paidAt", "subscriptionId", "subscriptionPlan"]),
    supabaseInvoiceId: invoice.supabaseInvoiceId || invoice._supabaseInvoiceId || "",
    ...safeSource(invoice),
  };
}

function safeSubscription(subscription = {}) {
  return {
    ...pick(subscription, ["id", "plan", "packageName", "status", "billingCycle", "invoiceFrequency", "totalInclVat", "monthlyAmount", "nextInvoiceDate", "lastInvoiceId", "lastInvoiceDate", "websiteName", "websiteDomain", "paymentStatus"]),
    ...safeSource(subscription),
  };
}

function safeFile(file = {}) {
  return {
    ...pick(file, ["id", "name", "type", "category", "status", "location", "url", "createdAt", "updatedAt"]),
    ...safeSource(file),
  };
}

export function sanitizeClientPortalData(data = {}) {
  return {
    mode: data.mode || CLIENT_PORTAL_DATA_MODES.LOCAL,
    customer: data.customer ? safeCustomer(data.customer) : null,
    websites: (data.websites || []).map(safeWebsite),
    projects: (data.projects || []).map(safeProject),
    quotes: (data.quotes || []).map(safeQuote),
    invoices: (data.invoices || []).map(safeInvoice),
    subscriptions: (data.subscriptions || []).map(safeSubscription),
    files: (data.files || []).map(safeFile),
    metrics: data.metrics || {},
    sourceSummary: data.sourceSummary || {},
    warnings: data.warnings || [],
  };
}

function computeMetrics(payload = {}) {
  const quotes = payload.quotes || [];
  const invoices = payload.invoices || [];
  const projects = payload.projects || [];
  const websites = payload.websites || [];
  const subscriptions = payload.subscriptions || [];
  const openInvoices = invoices.filter((invoice) => OPEN_INVOICE_STATUSES.has(normalizeKey(invoice.status)));
  return {
    openQuotes: quotes.filter((quote) => OPEN_QUOTE_STATUSES.has(normalizeKey(quote.status))).length,
    openInvoices: openInvoices.length,
    openInvoiceTotal: openInvoices.reduce((sum, invoice) => sum + numberValue(invoice.total ?? invoice.amount), 0),
    runningProjects: projects.filter((project) => !RUNNING_PROJECT_EXCLUDED.has(normalizeKey(project.status))).length,
    activeWebsites: websites.filter((website) => ACTIVE_WEBSITE_STATUSES.has(normalizeKey(website.status))).length,
    activeSubscriptions: subscriptions.filter((subscription) => ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeKey(subscription.status))).length,
  };
}

export function getClientPortalSourceSummary(data = {}) {
  const moduleStatuses = data.moduleStatuses || {};
  return {
    mode: data.mode || CLIENT_PORTAL_DATA_MODES.LOCAL,
    customerSource: data.customer ? sourceOf(data.customer) : "none",
    modules: Object.fromEntries(MODULES.map((moduleName) => [moduleName, moduleStatuses[moduleName] || { count: 0, mode: "local" }])),
    fallbackUsed: Object.values(moduleStatuses).some((status) => status?.fallbackUsed),
    warningCount: (data.warnings || []).length,
    generatedAt: new Date().toISOString(),
  };
}

async function readAllForMode(mode) {
  const [customers, websites, projects, quotes, invoices, subscriptions] = await Promise.all([
    listModule(CustomerRepository, "customers", mode),
    listModule(WebsiteRepository, "websites", mode),
    listModule(ProjectRepository, "projects", mode),
    listModule(QuoteRepository, "quotes", mode),
    listModule(InvoiceRepository, "invoices", mode),
    listModule(SubscriptionRepository, "subscriptions", mode),
  ]);
  const files = { items: localFiles(), status: { mode: "local", fallbackUsed: false, error: "", count: localFiles().length, refreshedAt: new Date().toISOString() } };
  return { customers, websites, projects, quotes, invoices, subscriptions, files };
}

export async function getClientCustomer(customerId, options = {}) {
  const mode = resolveClientPortalDataMode({ ...options, customerId });
  const result = await listModule(CustomerRepository, "customers", mode);
  const match = findCustomer(result.items, { customerId, supabaseCustomerId: options.supabaseCustomerId });
  return sanitizeClientPortalData({ mode, customer: match.customer, warnings: match.warnings }).customer;
}

export async function getClientWebsites(customerId, options = {}) {
  const data = await getClientPortalData(customerId, options);
  return data.websites;
}

export async function getClientProjects(customerId, options = {}) {
  const data = await getClientPortalData(customerId, options);
  return data.projects;
}

export async function getClientQuotes(customerId, options = {}) {
  const data = await getClientPortalData(customerId, options);
  return data.quotes;
}

export async function getClientInvoices(customerId, options = {}) {
  const data = await getClientPortalData(customerId, options);
  return data.invoices;
}

export async function getClientSubscriptions(customerId, options = {}) {
  const data = await getClientPortalData(customerId, options);
  return data.subscriptions;
}

export async function getClientFiles(customerId, options = {}) {
  const data = await getClientPortalData(customerId, options);
  return data.files;
}

export async function getClientPortalData(customerId, options = {}) {
  const mode = resolveClientPortalDataMode({ ...options, customerId });
  const results = await readAllForMode(mode);
  const moduleStatuses = Object.fromEntries(Object.entries(results).map(([key, result]) => [key, result.status]));
  const match = findCustomer(results.customers.items, { customerId, supabaseCustomerId: options.supabaseCustomerId });
  const warnings = [...match.warnings];
  if (!match.customer) {
    if (!match.mismatch) warnings.push("Klant niet gevonden in de gekozen klantportaal-bron.");
    return sanitizeClientPortalData({
      mode,
      customer: null,
      websites: [],
      projects: [],
      quotes: [],
      invoices: [],
      subscriptions: [],
      files: [],
      metrics: computeMetrics({}),
      sourceSummary: getClientPortalSourceSummary({ mode, moduleStatuses, warnings }),
      warnings,
    });
  }
  const raw = {
    mode,
    customer: match.customer,
    websites: results.websites.items.filter((item) => belongsToCustomer(item, match.customer)),
    projects: results.projects.items.filter((item) => belongsToCustomer(item, match.customer)),
    quotes: results.quotes.items.filter((item) => belongsToCustomer(item, match.customer)),
    invoices: results.invoices.items.filter((item) => belongsToCustomer(item, match.customer)),
    subscriptions: results.subscriptions.items.filter((item) => belongsToCustomer(item, match.customer)),
    files: results.files.items.filter((item) => belongsToCustomer(item, match.customer)),
    warnings,
    moduleStatuses,
  };
  raw.metrics = computeMetrics(raw);
  raw.sourceSummary = getClientPortalSourceSummary(raw);
  return sanitizeClientPortalData(raw);
}
