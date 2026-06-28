import { CUSTOMER_DATA_MODES } from "../config/environment.js";
import { PRIMARY_MODULE_KEYS, STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { logActivity, listActivitiesForEntity } from "../services/activityLogService.js";
import {
  calculateQuoteTotals,
  localQuoteStatus,
  normalizeQuote,
  normalizeQuoteLine,
  quoteIdentityKeys,
  supabaseQuoteStatus,
} from "../utils/quoteNormalizer.js";
import { listLocalCustomers, getCustomerSource } from "./CustomerRepository.js";
import { listLocalProjects, getProjectSource } from "./ProjectRepository.js";
import { listLocalWebsites, getWebsiteSource } from "./WebsiteRepository.js";
import { createRepository } from "./createRepository.js";

const localQuoteRepository = createRepository(PRIMARY_MODULE_KEYS.quotes);

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

function quoteDataMode() {
  return readJson(STORAGE_KEYS.settings, {})?.quoteDataMode
    || localStorage.getItem(STORAGE_KEYS.quoteDataMode)
    || CUSTOMER_DATA_MODES.LOCAL;
}

function sourceLabel(quote = {}) {
  if (quote.isDemo || quote.isDemoJourney || quote.environment === "demo") return "demo";
  return quote._source || "local";
}

function isSupabaseQuote(quote = {}) {
  return ["supabase", "hybrid"].includes(quote._source) || Boolean(quote._supabaseQuoteId || quote.supabaseQuoteId);
}

function quoteWriteTarget(quote = {}, options = {}) {
  if (options.target) return options.target;
  if (options.forceLocal || quote.isDemo || quote.environment === "demo") return "local";
  return isSupabaseQuote(quote) ? "supabase" : "local";
}

function localQuotePayload(quote = {}) {
  return normalizeQuote({
    ...quote,
    status: localQuoteStatus(quote.status),
  });
}

export function markQuoteSource(quote = {}, source = "local", extra = {}) {
  return {
    ...quote,
    _source: sourceLabel({ ...quote, _source: source }),
    _isMigrated: Boolean(quote.supabaseQuoteId || quote.migratedToSupabaseAt || extra.supabaseQuoteId),
    _supabaseQuoteId: extra.supabaseQuoteId || quote.supabaseQuoteId || quote.id || "",
    _localQuoteId: extra.localQuoteId || quote._localQuoteId || quote.metadata?.localStorageId || "",
    _customerSource: extra.customerSource || quote._customerSource || "",
    _websiteSource: extra.websiteSource || quote._websiteSource || "",
    _projectSource: extra.projectSource || quote._projectSource || "",
    _linkedCustomerStatus: extra.linkedCustomerStatus || quote._linkedCustomerStatus || "",
    _linkedWebsiteStatus: extra.linkedWebsiteStatus || quote._linkedWebsiteStatus || "",
    _linkedProjectStatus: extra.linkedProjectStatus || quote._linkedProjectStatus || "",
    _sourceMeta: {
      ...(quote._sourceMeta || {}),
      ...extra,
    },
  };
}

export function getQuoteSource(quote = {}) {
  return sourceLabel(quote);
}

function localQuotesFromStorage() {
  const seen = new Set();
  return readArray(STORAGE_KEYS.quotes)
    .map(normalizeQuote)
    .filter((quote) => {
      const keys = quoteIdentityKeys(quote);
      const key = keys.quoteNumber || keys.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function listLocalQuotes() {
  return localQuotesFromStorage().map((quote) => markQuoteSource(quote, quote.isDemo || quote.environment === "demo" ? "demo" : "local", {
    localQuoteId: quote.id,
    supabaseQuoteId: quote.supabaseQuoteId || "",
  }));
}

export async function listSupabaseQuotes() {
  const [rows, lineRows] = await Promise.all([
    supabaseProvider.getAll("quotes", { limit: 100 }),
    supabaseProvider.getAll("quote_lines", { limit: 100 }),
  ]);
  const linesByQuoteId = new Map();
  lineRows.forEach((line) => {
    const quoteId = line.quote_id || "";
    if (!quoteId) return;
    if (!linesByQuoteId.has(quoteId)) linesByQuoteId.set(quoteId, []);
    linesByQuoteId.get(quoteId).push(line);
  });
  return rows.map((row) => markQuoteSource(mapSupabaseQuoteToLocal(row, linesByQuoteId.get(row.id) || []), "supabase", {
    supabaseQuoteId: row.id,
    localQuoteId: row.metadata?.localStorageId || row.external_id || "",
  }));
}

function mergeSupabaseWithLocal(localQuote, supabaseQuote, reason = "supabase_match") {
  return markQuoteSource({
    ...localQuote,
    ...supabaseQuote,
    id: localQuote.id || supabaseQuote.id,
    profileId: localQuote.profileId || supabaseQuote.profileId,
    customerId: localQuote.customerId || supabaseQuote.customerId,
    websiteId: localQuote.websiteId || supabaseQuote.websiteId,
    projectId: localQuote.projectId || supabaseQuote.projectId,
    createdAt: supabaseQuote.createdAt || localQuote.createdAt,
    updatedAt: supabaseQuote.updatedAt || localQuote.updatedAt,
  }, "hybrid", {
    reason,
    localQuoteId: localQuote.id || "",
    supabaseQuoteId: supabaseQuote.id || localQuote.supabaseQuoteId || "",
  });
}

export function mergeQuoteSources(localQuotes = [], supabaseQuotes = []) {
  const merged = [];
  const duplicateMerges = [];
  const usedLocalIds = new Set();
  const localBySupabaseId = new Map();
  const localByNumber = new Map();
  localQuotes.forEach((quote) => {
    const normalized = normalizeQuote(quote);
    if (normalized.supabaseQuoteId) localBySupabaseId.set(String(normalized.supabaseQuoteId), normalized);
    if (normalized.quoteNumber) localByNumber.set(normalized.quoteNumber.toLowerCase(), normalized);
  });
  supabaseQuotes.forEach((quote) => {
    const normalized = normalizeQuote(quote);
    const localMatch = localBySupabaseId.get(String(normalized.id))
      || (normalized.quoteNumber ? localByNumber.get(normalized.quoteNumber.toLowerCase()) : null);
    if (localMatch) {
      usedLocalIds.add(localMatch.id);
      const reason = localMatch.supabaseQuoteId === normalized.id ? "supabaseQuoteId" : "quoteNumber";
      duplicateMerges.push({ reason, localQuoteId: localMatch.id, supabaseQuoteId: normalized.id, quoteNumber: normalized.quoteNumber });
      merged.push(mergeSupabaseWithLocal(localMatch, normalized, reason));
      return;
    }
    merged.push(markQuoteSource(normalized, "supabase", { supabaseQuoteId: normalized.id }));
  });
  localQuotes.map(normalizeQuote).forEach((quote) => {
    if (usedLocalIds.has(quote.id)) return;
    if (quote.supabaseQuoteId && !quote.isDemo && quote.environment !== "demo") return;
    merged.push(markQuoteSource(quote, quote.isDemo || quote.environment === "demo" ? "demo" : "local", {
      localQuoteId: quote.id,
      supabaseQuoteId: quote.supabaseQuoteId || "",
    }));
  });
  return {
    quotes: merged,
    duplicateMerges,
    counts: {
      local: localQuotes.length,
      supabase: supabaseQuotes.length,
      hybrid: merged.length,
      duplicateMerges: duplicateMerges.length,
      demo: merged.filter((quote) => getQuoteSource(quote) === "demo").length,
      unmigratedLocal: merged.filter((quote) => getQuoteSource(quote) === "local" && !quote._isMigrated).length,
    },
  };
}

export async function listHybridQuotes() {
  const localQuotes = listLocalQuotes();
  const supabaseQuotes = await listSupabaseQuotes();
  return mergeQuoteSources(localQuotes, supabaseQuotes);
}

export async function listByDataMode(mode = CUSTOMER_DATA_MODES.LOCAL) {
  if (mode === CUSTOMER_DATA_MODES.SUPABASE_READ) {
    const quotes = await listSupabaseQuotes();
    return {
      mode,
      quotes,
      counts: { local: listLocalQuotes().length, supabase: quotes.length, hybrid: quotes.length, duplicateMerges: 0, demo: 0, unmigratedLocal: 0 },
      fallbackUsed: false,
      error: "",
      refreshedAt: nowIso(),
    };
  }
  if (mode === CUSTOMER_DATA_MODES.HYBRID) {
    try {
      const merged = await listHybridQuotes();
      return { mode, ...merged, fallbackUsed: false, error: "", refreshedAt: nowIso() };
    } catch (error) {
      const quotes = listLocalQuotes();
      return {
        mode,
        quotes,
        counts: {
          local: quotes.length,
          supabase: 0,
          hybrid: quotes.length,
          duplicateMerges: 0,
          demo: quotes.filter((quote) => getQuoteSource(quote) === "demo").length,
          unmigratedLocal: quotes.filter((quote) => getQuoteSource(quote) === "local" && !quote._isMigrated).length,
        },
        duplicateMerges: [],
        fallbackUsed: true,
        error: error.message || "Supabase offertes konden niet worden gelezen.",
        refreshedAt: nowIso(),
      };
    }
  }
  const quotes = listLocalQuotes();
  return {
    mode: CUSTOMER_DATA_MODES.LOCAL,
    quotes,
    counts: {
      local: quotes.length,
      supabase: 0,
      hybrid: quotes.length,
      duplicateMerges: 0,
      demo: quotes.filter((quote) => getQuoteSource(quote) === "demo").length,
      unmigratedLocal: quotes.filter((quote) => getQuoteSource(quote) === "local" && !quote._isMigrated).length,
    },
    duplicateMerges: [],
    fallbackUsed: false,
    error: "",
    refreshedAt: nowIso(),
  };
}

function relationLookup() {
  const customers = listLocalCustomers();
  const websites = listLocalWebsites();
  const projects = listLocalProjects();
  return {
    customers,
    websites,
    projects,
    customersById: new Map(customers.map((customer) => [customer.id, customer])),
    websitesById: new Map(websites.map((website) => [website.id, website])),
    projectsById: new Map(projects.map((project) => [project.id, project])),
  };
}

export function resolveQuoteCustomerLink(quote = {}, relations = null) {
  const normalized = normalizeQuote(quote);
  const lookup = relations || relationLookup();
  const localCustomer = lookup.customersById?.get(normalized.profileId || normalized.customerId) || null;
  const supabaseCustomerId = normalized.supabaseCustomerId || localCustomer?._supabaseCustomerId || localCustomer?.supabaseCustomerId || "";
  if (supabaseCustomerId) return { status: "linked", localCustomer, localCustomerId: localCustomer?.id || normalized.profileId || "", supabaseCustomerId, customerSource: localCustomer ? getCustomerSource(localCustomer) : "supabase", message: "Gekoppelde Supabase customer gevonden." };
  if (!normalized.profileId && !normalized.customerId) return { status: "missing_customer", localCustomer: null, localCustomerId: "", supabaseCustomerId: "", customerSource: "", message: "Offerte mist klantkoppeling." };
  if (localCustomer) return { status: "waiting_customer_migration", localCustomer, localCustomerId: localCustomer.id, supabaseCustomerId: "", customerSource: getCustomerSource(localCustomer), message: "Klant bestaat lokaal, maar heeft nog geen Supabase customer ID." };
  return { status: "customer_not_found", localCustomer: null, localCustomerId: normalized.profileId || normalized.customerId, supabaseCustomerId: "", customerSource: "", message: "Gekoppelde klant niet gevonden." };
}

export function resolveQuoteWebsiteLink(quote = {}, relations = null) {
  const normalized = normalizeQuote(quote);
  const lookup = relations || relationLookup();
  const localWebsite = lookup.websitesById?.get(normalized.websiteId) || null;
  const supabaseWebsiteId = normalized.supabaseWebsiteId || localWebsite?._supabaseWebsiteId || localWebsite?.supabaseWebsiteId || "";
  if (supabaseWebsiteId) return { status: "linked", localWebsite, localWebsiteId: localWebsite?.id || normalized.websiteId || "", supabaseWebsiteId, websiteSource: localWebsite ? getWebsiteSource(localWebsite) : "supabase", message: "Gekoppelde Supabase website gevonden." };
  if (!normalized.websiteId) return { status: "not_required", localWebsite: null, localWebsiteId: "", supabaseWebsiteId: "", websiteSource: "", message: "Offerte mag zonder website worden gemigreerd." };
  if (localWebsite) return { status: "waiting_website_migration", localWebsite, localWebsiteId: localWebsite.id, supabaseWebsiteId: "", websiteSource: getWebsiteSource(localWebsite), message: "Website bestaat lokaal, maar heeft nog geen Supabase website ID." };
  return { status: "website_not_found", localWebsite: null, localWebsiteId: normalized.websiteId, supabaseWebsiteId: "", websiteSource: "", message: "Gekoppelde website niet gevonden." };
}

export function resolveQuoteProjectLink(quote = {}, relations = null) {
  const normalized = normalizeQuote(quote);
  const lookup = relations || relationLookup();
  const localProject = lookup.projectsById?.get(normalized.projectId) || null;
  const supabaseProjectId = normalized.supabaseProjectId || localProject?._supabaseProjectId || localProject?.supabaseProjectId || "";
  if (supabaseProjectId) return { status: "linked", localProject, localProjectId: localProject?.id || normalized.projectId || "", supabaseProjectId, projectSource: localProject ? getProjectSource(localProject) : "supabase", message: "Gekoppeld Supabase project gevonden." };
  if (!normalized.projectId) return { status: "not_required", localProject: null, localProjectId: "", supabaseProjectId: "", projectSource: "", message: "Offerte mag zonder project worden gemigreerd." };
  if (localProject) return { status: "waiting_project_migration", localProject, localProjectId: localProject.id, supabaseProjectId: "", projectSource: getProjectSource(localProject), message: "Project bestaat lokaal, maar heeft nog geen Supabase project ID." };
  return { status: "project_not_found", localProject: null, localProjectId: normalized.projectId, supabaseProjectId: "", projectSource: "", message: "Gekoppeld project niet gevonden." };
}

export function mapLocalQuoteLineToSupabase(line = {}, index = 0) {
  const normalized = normalizeQuoteLine(line, index);
  const supabaseLineId = line.supabaseLineId || line._supabaseLineId || line.metadata?.supabaseLineId || "";
  return {
    id: supabaseLineId || null,
    external_id: normalized.externalId || normalized.id || null,
    description: normalized.description,
    quantity: normalized.quantity,
    unit_price: normalized.unitPrice,
    vat_percentage: normalized.vatRate,
    subtotal: normalized.subtotal,
    vat_amount: normalized.vat,
    total: normalized.total,
    sort_order: normalized.sortOrder,
    metadata: {
      ...(normalized.metadata || {}),
      localStorageId: normalized.id || "",
      supabaseLineId,
    },
  };
}

function mapQuoteWritePayload(quote = {}, options = {}) {
  const normalized = normalizeQuote(quote);
  const customerLink = options.customerLink || resolveQuoteCustomerLink(normalized);
  const websiteLink = options.websiteLink || resolveQuoteWebsiteLink(normalized);
  const projectLink = options.projectLink || resolveQuoteProjectLink(normalized);
  return {
    external_id: normalized.externalId || normalized._localQuoteId || normalized.id || null,
    quote_number: normalized.quoteNumber || null,
    customer_id: customerLink.supabaseCustomerId || normalized.supabaseCustomerId || null,
    customer_external_id: normalized.profileId || normalized.customerId || null,
    website_id: websiteLink.supabaseWebsiteId || normalized.supabaseWebsiteId || null,
    website_external_id: normalized.websiteId || null,
    project_id: projectLink.supabaseProjectId || normalized.supabaseProjectId || null,
    project_external_id: normalized.projectId || null,
    quote_type: normalized.type || null,
    title: normalized.title || null,
    status: supabaseQuoteStatus(normalized.status),
    quote_date: normalized.quoteDate || null,
    valid_until: normalized.validUntil || null,
    accepted_at: normalized.acceptedAt || null,
    subtotal: normalized.subtotal,
    vat_amount: normalized.vat,
    total_amount: normalized.total,
    proposal: normalized.proposal || null,
    internal_notes: normalized.notes || null,
    demo_quote_link: normalized.quoteLink || normalized.demoQuoteLink || null,
    converted_to_invoice_id: normalized.convertedToInvoiceId || null,
    converted_at: normalized.convertedAt || null,
    is_demo: Boolean(normalized.isDemo),
    is_demo_journey: Boolean(normalized.isDemoJourney),
    environment: normalized.environment || (normalized.isDemo || normalized.isDemoJourney ? "demo" : "production"),
    demo_scenario_id: normalized.demoScenarioId || null,
    demo_journey_id: normalized.demoJourneyId || null,
    source: "crm",
    metadata: {
      ...(normalized.metadata || {}),
      localStorageId: normalized._localQuoteId || normalized.id || normalized.metadata?.localStorageId || "",
      localCustomerId: normalized.profileId || normalized.customerId || "",
      localWebsiteId: normalized.websiteId || "",
      localProjectId: normalized.projectId || "",
      customerLinkStatus: customerLink.status,
      websiteLinkStatus: websiteLink.status,
      projectLinkStatus: projectLink.status,
      lineCount: normalized.lines.length,
      lastQuoteWriteContext: "crm_quote_write",
    },
  };
}

export function mapLocalQuoteToSupabase(quote = {}) {
  const normalized = normalizeQuote(quote);
  return {
    quote: mapQuoteWritePayload(normalized),
    lines: normalized.lines.map(mapLocalQuoteLineToSupabase),
  };
}

export function mapSupabaseQuoteLineToLocal(row = {}) {
  return normalizeQuoteLine({
    id: row.id,
    supabaseLineId: row.id,
    externalId: row.external_id,
    quoteId: row.quote_id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    vatRate: row.vat_percentage,
    subtotal: row.subtotal,
    vat: row.vat_amount,
    total: row.total,
    sortOrder: row.sort_order,
    metadata: { ...(row.metadata || {}), supabaseLineId: row.id },
  });
}

export function mapSupabaseQuoteToLocal(row = {}, lineRows = []) {
  const lines = lineRows.map(mapSupabaseQuoteLineToLocal).sort((a, b) => a.sortOrder - b.sortOrder);
  return normalizeQuote({
    id: row.id,
    externalId: row.external_id,
    quoteNumber: row.quote_number,
    profileId: row.customer_external_id || row.metadata?.localCustomerId || "",
    supabaseCustomerId: row.customer_id,
    websiteId: row.website_external_id || row.metadata?.localWebsiteId || "",
    supabaseWebsiteId: row.website_id,
    projectId: row.project_external_id || row.metadata?.localProjectId || "",
    supabaseProjectId: row.project_id,
    type: row.quote_type,
    title: row.title,
    status: row.status,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    acceptedAt: row.accepted_at,
    subtotal: row.subtotal,
    vat: row.vat_amount,
    total: row.total_amount,
    proposal: row.proposal,
    notes: row.internal_notes,
    quoteLink: row.demo_quote_link,
    convertedToInvoiceId: row.converted_to_invoice_id,
    convertedAt: row.converted_at,
    isDemo: row.is_demo,
    isDemoJourney: row.is_demo_journey,
    environment: row.environment,
    demoScenarioId: row.demo_scenario_id,
    demoJourneyId: row.demo_journey_id,
    supabaseQuoteId: row.id,
    lines,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function validateQuoteForSupabase(quote = {}, relations = null) {
  const normalized = normalizeQuote(quote);
  const warnings = [];
  const errors = [];
  if (!normalized.id) errors.push("Offerte mist id.");
  if (!normalized.quoteNumber) errors.push("Offerte mist offertenummer.");
  if (!normalized.profileId && !normalized.customerId) errors.push("Offerte mist klantkoppeling.");
  if (!Array.isArray(normalized.lines) || !normalized.lines.length) errors.push("Offerte mist offertregels.");
  normalized.lines.forEach((line, index) => {
    if (!line.description) errors.push(`Offertregel ${index + 1} mist omschrijving.`);
    if (line.quantity <= 0) errors.push(`Offertregel ${index + 1} heeft een ongeldige hoeveelheid.`);
    if (line.unitPrice < 0) errors.push(`Offertregel ${index + 1} heeft een negatieve prijs.`);
  });
  if (!normalized.quoteDate) warnings.push("Offerte mist offertedatum.");
  if (!normalized.validUntil) warnings.push("Offerte mist geldigheidsdatum.");
  const totals = calculateQuoteTotals(normalized.lines);
  if (Math.abs(Number(normalized.total || 0) - Number(totals.total || 0)) > 0.05) warnings.push("Offertetotaal wijkt af van berekende regels.");
  const customerLink = resolveQuoteCustomerLink(normalized, relations);
  const websiteLink = resolveQuoteWebsiteLink(normalized, relations);
  const projectLink = resolveQuoteProjectLink(normalized, relations);
  if (["missing_customer", "customer_not_found"].includes(customerLink.status)) errors.push(customerLink.message);
  if (customerLink.status === "waiting_customer_migration") warnings.push(customerLink.message);
  if (websiteLink.status === "waiting_website_migration") warnings.push(websiteLink.message);
  if (projectLink.status === "waiting_project_migration") warnings.push(projectLink.message);
  if (["website_not_found"].includes(websiteLink.status)) warnings.push(websiteLink.message);
  if (["project_not_found"].includes(projectLink.status)) warnings.push(projectLink.message);
  return {
    id: normalized.id,
    ready: errors.length === 0 && customerLink.status === "linked",
    canDryRun: errors.length === 0,
    errors,
    warnings,
    customerLink,
    websiteLink,
    projectLink,
    normalized,
  };
}

export function prepareQuotesForMigration(quotes = []) {
  const relations = relationLookup();
  const seen = new Map();
  const unique = [];
  const duplicates = [];
  quotes.forEach((quote) => {
    const normalized = normalizeQuote(quote);
    const key = quoteIdentityKeys(normalized).quoteNumber || normalized.id;
    if (key && seen.has(key)) {
      duplicates.push({ key, quote: normalized, duplicateOf: seen.get(key) });
      return;
    }
    if (key) seen.set(key, normalized.id);
    unique.push(normalized);
  });
  const validation = unique.map((quote) => validateQuoteForSupabase(quote, relations));
  return {
    total: quotes.length,
    unique,
    duplicates,
    ready: validation.filter((item) => item.ready),
    waitingForCustomer: validation.filter((item) => item.customerLink.status === "waiting_customer_migration"),
    waitingForWebsite: validation.filter((item) => item.websiteLink.status === "waiting_website_migration"),
    waitingForProject: validation.filter((item) => item.projectLink.status === "waiting_project_migration"),
    invalidLines: validation.filter((item) => item.errors.some((error) => error.includes("Offertregel") || error.includes("offertregels"))),
    attention: validation.filter((item) => !item.ready || item.warnings.length),
    payload: unique.map(mapLocalQuoteToSupabase),
    validation,
  };
}

function getSupabaseWriteTest() {
  const quoteLatest = readJson(STORAGE_KEYS.lastQuoteWriteTest, null);
  const generalLatest = readJson(STORAGE_KEYS.lastSupabaseWriteTest, null);
  return quoteLatest || generalLatest;
}

export function canWriteQuote(quote = {}, context = {}) {
  const mode = context.mode || quoteDataMode();
  const status = supabaseProvider.getStatus();
  const readOnly = readJson(STORAGE_KEYS.lastSupabaseReadOnlyTest, null);
  const writeTest = getSupabaseWriteTest();
  const validation = validateQuoteForSupabase(quote);
  const customerLink = context.customerLink || validation.customerLink;
  const websiteLink = context.websiteLink || validation.websiteLink;
  const projectLink = context.projectLink || validation.projectLink;
  const source = getQuoteSource(quote);
  const missing = [];
  const target = context.target || (isSupabaseQuote(quote) ? "supabase" : "local");
  if (target === "local") return { allowed: true, target, mode, source, missing, reason: "Lokale offerte blijft localStorage.", customerLink, websiteLink, projectLink };
  if ((quote.isDemo || quote.environment === "demo") && context.allowDemoSupabase !== true) missing.push("Demo-offerte mag niet naar Supabase zonder expliciete demo-Supabase context.");
  if (![CUSTOMER_DATA_MODES.SUPABASE_READ, CUSTOMER_DATA_MODES.HYBRID].includes(mode) && context.allowSupabaseInLocalMode !== true) missing.push("Quote data mode is niet supabase-read of hybrid.");
  if (!status.hasUrl) missing.push("Supabase URL ontbreekt.");
  if (!status.hasAnonKey) missing.push("Supabase anon key ontbreekt.");
  if (!status.clientPackageAvailable) missing.push("Supabase client is niet geladen.");
  if (!readOnly?.success && !readOnly?.connected) missing.push("Read-only test is niet succesvol.");
  if (customerLink.status !== "linked" && context.allowOrphanQuote !== true) missing.push(customerLink.message || "Offerte mist Supabase customer koppeling.");
  if (validation.errors.length && context.quoteWriteTest !== true) missing.push(validation.errors.join(" "));
  if (context.quoteWriteTest !== true && writeTest?.status !== "completed" && writeTest?.status !== "quote_completed") missing.push("Supabase write-test is niet succesvol.");
  return { allowed: missing.length === 0, target, mode, source, missing, reason: missing.join(" "), supabase: status, readOnly, writeTest, customerLink, websiteLink, projectLink, validation };
}

function logQuoteWrite(action, quote, metadata = {}) {
  return logActivity("quotes", quote?.id || metadata.quoteId || "unknown", action, {
    quoteId: quote?.id || metadata.quoteId || "",
    supabaseQuoteId: quote?._supabaseQuoteId || quote?.supabaseQuoteId || metadata.supabaseQuoteId || "",
    customerId: quote?.profileId || quote?.customerId || metadata.customerId || "",
    websiteId: quote?.websiteId || metadata.websiteId || "",
    projectId: quote?.projectId || metadata.projectId || "",
    source: getQuoteSource(quote),
    performedBy: "local-admin",
    timestamp: nowIso(),
    ...metadata,
  });
}

export function getQuoteHistory(id) {
  return listActivitiesForEntity("quotes", id).filter((activity) => [
    "quote_created",
    "quote_updated",
    "quote_archived",
    "quote_reactivated",
    "quote_accepted",
    "quote_write_failed",
    "quote_dry_run",
    "quote_source_mode_changed",
  ].includes(activity.action));
}

async function assertNoConflict(id, baseUpdatedAt, options = {}) {
  const remote = await supabaseProvider.getById("quotes", id);
  if (!remote) throw new Error("Supabase offerte bestaat niet meer of is niet bereikbaar.");
  const remoteUpdated = remote.updated_at || remote.updatedAt || "";
  if (remoteUpdated && baseUpdatedAt && new Date(remoteUpdated).getTime() > new Date(baseUpdatedAt).getTime()) {
    const error = new Error("Supabase offerte is nieuwer dan de geopende detailversie. Ververs offertegegevens voordat je opslaat.");
    error.code = "QUOTE_CONFLICT";
    error.remote = remote;
    throw error;
  }
  return remote;
}

function requireQuoteWrite(quote = {}, options = {}) {
  const readiness = canWriteQuote(quote, { ...options, target: "supabase" });
  if (!readiness.allowed) {
    const error = new Error(readiness.reason || "Quote write naar Supabase is geblokkeerd.");
    error.code = "QUOTE_WRITE_BLOCKED";
    error.readiness = readiness;
    throw error;
  }
  return readiness;
}

function supabaseQuoteId(quote = {}, fallbackId = "") {
  return quote._supabaseQuoteId || quote.supabaseQuoteId || quote.id || fallbackId;
}

export async function createQuote(data = {}, options = {}) {
  const target = quoteWriteTarget(data, options);
  if (target === "local") {
    const created = localQuoteRepository.create(localQuotePayload(data));
    logQuoteWrite("quote_created", markQuoteSource(created, getQuoteSource(created)), { source: "local" });
    return markQuoteSource(normalizeQuote(created), created.isDemo || created.environment === "demo" ? "demo" : "local", { localQuoteId: created.id });
  }
  try {
    const readiness = requireQuoteWrite(data, options);
    const mapped = mapLocalQuoteToSupabase(data);
    const result = await supabaseProvider.createQuote(mapped.quote, mapped.lines, { quoteWrite: true });
    const created = markQuoteSource(mapSupabaseQuoteToLocal(result.data, result.lines), "supabase", {
      supabaseQuoteId: result.data.id,
      localQuoteId: data.id || data._localQuoteId || "",
      linkedCustomerStatus: readiness.customerLink.status,
      linkedWebsiteStatus: readiness.websiteLink.status,
      linkedProjectStatus: readiness.projectLink.status,
    });
    logQuoteWrite("quote_created", created, { source: "supabase", supabaseQuoteId: result.data.id });
    return created;
  } catch (error) {
    logQuoteWrite("quote_write_failed", data, { action: "create", source: "supabase", error: error.message || "Offerte aanmaken in Supabase mislukt." });
    throw error;
  }
}

export async function updateQuote(id, data = {}, options = {}) {
  const oldQuote = options.oldQuote || data || {};
  const target = quoteWriteTarget(oldQuote, options);
  if (target === "local") {
    const updated = localQuoteRepository.update(id, localQuotePayload(data));
    if (!updated) throw new Error("Lokale offerte niet gevonden.");
    logQuoteWrite("quote_updated", markQuoteSource(updated, getQuoteSource(updated)), { source: "local" });
    return markQuoteSource(normalizeQuote(updated), updated.isDemo || updated.environment === "demo" ? "demo" : "local", { localQuoteId: updated.id });
  }
  try {
    const readiness = requireQuoteWrite({ ...oldQuote, ...data }, options);
    const remoteId = supabaseQuoteId(oldQuote, id);
    await assertNoConflict(remoteId, options.baseUpdatedAt || oldQuote.updatedAt || oldQuote.updated_at || "", options);
    const mapped = mapLocalQuoteToSupabase({ ...oldQuote, ...data, id: remoteId });
    const result = await supabaseProvider.updateQuote(remoteId, mapped.quote, mapped.lines, { quoteWrite: true });
    const updated = markQuoteSource(mapSupabaseQuoteToLocal(result.data, result.lines), oldQuote._source === "hybrid" ? "hybrid" : "supabase", {
      supabaseQuoteId: result.data.id,
      localQuoteId: oldQuote._localQuoteId || data.id || "",
      linkedCustomerStatus: readiness.customerLink.status,
      linkedWebsiteStatus: readiness.websiteLink.status,
      linkedProjectStatus: readiness.projectLink.status,
    });
    logQuoteWrite("quote_updated", updated, { source: "supabase", supabaseQuoteId: result.data.id });
    return updated;
  } catch (error) {
    logQuoteWrite("quote_write_failed", oldQuote, { action: "update", source: "supabase", error: error.message || "Offerte bijwerken in Supabase mislukt." });
    throw error;
  }
}

export async function archiveQuote(id, options = {}) {
  const quote = options.oldQuote || normalizeQuote({ id });
  const target = quoteWriteTarget(quote, options);
  if (target === "local") {
    const updated = localQuoteRepository.update(id, localQuotePayload({ ...quote, status: "gearchiveerd", isArchived: true }));
    logQuoteWrite("quote_archived", updated, { source: "local" });
    return markQuoteSource(normalizeQuote(updated), getQuoteSource(updated), { localQuoteId: updated.id });
  }
  const remoteId = supabaseQuoteId(quote, id);
  const result = await supabaseProvider.archiveQuote(remoteId, { quoteWrite: true });
  const archived = markQuoteSource(mapSupabaseQuoteToLocal(result.data), "supabase", { supabaseQuoteId: result.data.id });
  logQuoteWrite("quote_archived", archived, { source: "supabase", supabaseQuoteId: result.data.id });
  return archived;
}

export async function reactivateQuote(id, options = {}) {
  const quote = options.oldQuote || normalizeQuote({ id });
  const target = quoteWriteTarget(quote, options);
  if (target === "local") {
    const updated = localQuoteRepository.update(id, localQuotePayload({ ...quote, status: "concept", isArchived: false }));
    logQuoteWrite("quote_reactivated", updated, { source: "local" });
    return markQuoteSource(normalizeQuote(updated), getQuoteSource(updated), { localQuoteId: updated.id });
  }
  const remoteId = supabaseQuoteId(quote, id);
  const result = await supabaseProvider.reactivateQuote(remoteId, { quoteWrite: true });
  const reactivated = markQuoteSource(mapSupabaseQuoteToLocal(result.data), "supabase", { supabaseQuoteId: result.data.id });
  logQuoteWrite("quote_reactivated", reactivated, { source: "supabase", supabaseQuoteId: result.data.id });
  return reactivated;
}

export async function acceptQuote(id, options = {}) {
  const quote = options.oldQuote || normalizeQuote({ id });
  const target = quoteWriteTarget(quote, options);
  if (target === "local") {
    const updated = localQuoteRepository.update(id, localQuotePayload({ ...quote, status: "geaccepteerd", acceptedAt: nowIso() }));
    logQuoteWrite("quote_accepted", updated, { source: "local" });
    return markQuoteSource(normalizeQuote(updated), getQuoteSource(updated), { localQuoteId: updated.id });
  }
  const remoteId = supabaseQuoteId(quote, id);
  const result = await supabaseProvider.acceptQuote(remoteId, { quoteWrite: true });
  const accepted = markQuoteSource(mapSupabaseQuoteToLocal(result.data), "supabase", { supabaseQuoteId: result.data.id });
  logQuoteWrite("quote_accepted", accepted, { source: "supabase", supabaseQuoteId: result.data.id });
  return accepted;
}

export const QuoteRepository = {
  ...localQuoteRepository,
  listLocalQuotes,
  listSupabaseQuotes,
  listHybridQuotes,
  listByDataMode,
  createQuote,
  updateQuote,
  archiveQuote,
  reactivateQuote,
  acceptQuote,
  getQuoteHistory,
  canWriteQuote,
};
