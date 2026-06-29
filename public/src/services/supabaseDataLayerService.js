import { CUSTOMER_DATA_MODES } from "../config/environment.js";
import { getSafeSupabaseClientSummary } from "../providers/supabaseClient.js";
import { CustomerRepository } from "../repositories/CustomerRepository.js";
import { WebsiteRepository } from "../repositories/WebsiteRepository.js";
import { ProjectRepository } from "../repositories/ProjectRepository.js";
import { QuoteRepository } from "../repositories/QuoteRepository.js";
import { InvoiceRepository } from "../repositories/InvoiceRepository.js";
import { SubscriptionRepository } from "../repositories/SubscriptionRepository.js";

const MVP_MODULES = Object.freeze([
  "customers",
  "websites",
  "projects",
  "quotes",
  "quote_lines",
  "invoices",
  "invoice_lines",
  "subscriptions",
]);

function normalizeMode(mode = CUSTOMER_DATA_MODES.HYBRID) {
  return Object.values(CUSTOMER_DATA_MODES).includes(mode) ? mode : CUSTOMER_DATA_MODES.HYBRID;
}

function moduleResult(module, result = {}, recordsKey) {
  const records = Array.isArray(result[recordsKey]) ? result[recordsKey] : [];
  return {
    module,
    mode: result.mode || CUSTOMER_DATA_MODES.LOCAL,
    records,
    count: records.length,
    counts: result.counts || {},
    duplicateMerges: result.duplicateMerges || [],
    fallbackUsed: Boolean(result.fallbackUsed),
    error: result.error || "",
    refreshedAt: result.refreshedAt || new Date().toISOString(),
  };
}

function lineModuleResult(module, parentResult = {}, parentRecordsKey, lineParentKey) {
  const parents = Array.isArray(parentResult[parentRecordsKey]) ? parentResult[parentRecordsKey] : [];
  const records = parents.flatMap((parent) => (Array.isArray(parent.lines) ? parent.lines : []).map((line, index) => ({
    ...line,
    [lineParentKey]: line[lineParentKey] || parent.id || "",
    parentNumber: parent.quoteNumber || parent.invoiceNumber || "",
    parentStatus: parent.status || "",
    parentSource: parent._source || parent.source || "",
    sortOrder: line.sortOrder ?? index,
  })));
  return {
    module,
    mode: parentResult.mode || CUSTOMER_DATA_MODES.LOCAL,
    records,
    count: records.length,
    counts: {
      ...(parentResult.counts || {}),
      parentCount: parents.length,
      lineCount: records.length,
    },
    duplicateMerges: parentResult.duplicateMerges || [],
    fallbackUsed: Boolean(parentResult.fallbackUsed),
    error: parentResult.error || "",
    refreshedAt: parentResult.refreshedAt || new Date().toISOString(),
  };
}

async function readModule(module, mode) {
  if (module === "customers") {
    return moduleResult(module, await CustomerRepository.listByDataMode(mode), "customers");
  }
  if (module === "websites") {
    return moduleResult(module, await WebsiteRepository.listByDataMode(mode), "websites");
  }
  if (module === "projects") {
    return moduleResult(module, await ProjectRepository.listByDataMode(mode), "projects");
  }
  if (module === "quotes") {
    return moduleResult(module, await QuoteRepository.listByDataMode(mode), "quotes");
  }
  if (module === "quote_lines") {
    return lineModuleResult(module, await QuoteRepository.listByDataMode(mode), "quotes", "quoteId");
  }
  if (module === "invoices") {
    return moduleResult(module, await InvoiceRepository.listByDataMode(mode), "invoices");
  }
  if (module === "invoice_lines") {
    return lineModuleResult(module, await InvoiceRepository.listByDataMode(mode), "invoices", "invoiceId");
  }
  if (module === "subscriptions") {
    return moduleResult(module, await SubscriptionRepository.listByDataMode(mode), "subscriptions");
  }
  throw new Error(`Onbekende Supabase Data Layer module: ${module}`);
}

export async function readSupabaseDataLayerModule(module, options = {}) {
  const mode = normalizeMode(options.mode || CUSTOMER_DATA_MODES.HYBRID);
  return readModule(module, mode);
}

export async function readSupabaseDataLayerMvp(options = {}) {
  const mode = normalizeMode(options.mode || CUSTOMER_DATA_MODES.HYBRID);
  const modules = Array.isArray(options.modules) && options.modules.length
    ? options.modules.filter((module) => MVP_MODULES.includes(module))
    : MVP_MODULES;
  const results = {};
  for (const module of modules) {
    results[module] = await readModule(module, mode);
  }
  const fallbackModules = Object.values(results).filter((result) => result.fallbackUsed).map((result) => result.module);
  const errors = Object.values(results).filter((result) => result.error).map((result) => ({
    module: result.module,
    error: result.error,
  }));
  return {
    mode,
    modules: results,
    fallbackUsed: fallbackModules.length > 0,
    fallbackModules,
    errors,
    writesEnabled: false,
    writePolicy: "MVP is read-only. Writes blijven local/demo of bestaande gated write-test flows.",
    refreshedAt: new Date().toISOString(),
  };
}

export function getSupabaseDataLayerMvpStatus() {
  const supabase = getSafeSupabaseClientSummary();
  return {
    phase: "32",
    name: "Supabase Data Layer MVP",
    modules: MVP_MODULES,
    defaultMode: CUSTOMER_DATA_MODES.HYBRID,
    supportedModes: [
      CUSTOMER_DATA_MODES.LOCAL,
      CUSTOMER_DATA_MODES.SUPABASE_READ,
      CUSTOMER_DATA_MODES.HYBRID,
    ],
    supabase,
    readsPrepared: true,
    writesEnabled: false,
    productionReady: false,
    reason: "Customers, websites, projects en finance modules hebben read-only Supabase services met localStorage fallback. Productie blijft uit tot expliciete releaseapproval.",
  };
}

export const SupabaseDataLayerService = {
  getStatus: getSupabaseDataLayerMvpStatus,
  readModule: readSupabaseDataLayerModule,
  readMvp: readSupabaseDataLayerMvp,
};
