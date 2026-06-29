import { CUSTOMER_DATA_MODES } from "../config/environment.js";
import { getSafeSupabaseClientSummary } from "../providers/supabaseClient.js";
import { CustomerRepository } from "../repositories/CustomerRepository.js";
import { WebsiteRepository } from "../repositories/WebsiteRepository.js";
import { ProjectRepository } from "../repositories/ProjectRepository.js";

const MVP_MODULES = Object.freeze(["customers", "websites", "projects"]);

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
    phase: "29",
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
    reason: "Customers, websites en projects hebben read-only Supabase services met localStorage fallback. Productie blijft uit tot expliciete releaseapproval.",
  };
}

export const SupabaseDataLayerService = {
  getStatus: getSupabaseDataLayerMvpStatus,
  readModule: readSupabaseDataLayerModule,
  readMvp: readSupabaseDataLayerMvp,
};
