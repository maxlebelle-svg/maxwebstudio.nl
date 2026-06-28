import { getCurrentEnvironment, getCurrentProviderType, PROVIDERS } from "../config/environment.js";
import { getSupabaseClientStatus, getSafeSupabaseClientSummary } from "../providers/supabaseClient.js";
import { getProviderInfo } from "../providers/providerFactory.js";

export function getDataProviderMode() {
  return getCurrentProviderType();
}

export function getSupabaseConfigStatus() {
  return getSupabaseClientStatus();
}

export function canUseSupabase() {
  const status = getSupabaseConfigStatus();
  return Boolean(status.configured && status.liveQueriesEnabled);
}

export function getProviderWarnings() {
  const providerMode = getDataProviderMode();
  const supabaseStatus = getSupabaseConfigStatus();
  const warnings = [];
  if (providerMode === PROVIDERS.LOCAL_STORAGE) {
    warnings.push("localStorage is actief. Dit is correct voor demo en salespresentaties.");
  }
  if (providerMode === PROVIDERS.SUPABASE_PREPARED) {
    warnings.push("Supabase provider is voorbereid, maar live datawrites zijn nog niet actief.");
  }
  if (providerMode === PROVIDERS.SUPABASE_READONLY) {
    warnings.push("Supabase read-only mode is actief voor connectiechecks. Writes blijven geblokkeerd en app-data blijft localStorage.");
  }
  if (!supabaseStatus.configured) {
    warnings.push("Supabase URL of anon key ontbreekt. Vul deze alleen in via environment configuratie, nooit hardcoded.");
  }
  warnings.push("Gebruik nooit SUPABASE_SERVICE_ROLE_KEY in browsercode.");
  return warnings;
}

export function getActiveProviderStatus() {
  const providerInfo = getProviderInfo();
  const supabaseStatus = getSupabaseConfigStatus();
  const providerMode = getDataProviderMode();
  return {
    environment: getCurrentEnvironment(),
    providerMode,
    activeProvider: providerInfo.type,
    activeStorage: providerMode === PROVIDERS.SUPABASE ? "supabase" : "localStorage",
    providerStatus: providerInfo.status,
    localStorageActive: providerMode !== PROVIDERS.SUPABASE,
    supabaseConfigured: supabaseStatus.configured,
    supabaseUrlPresent: supabaseStatus.hasUrl,
    supabaseAnonKeyPresent: supabaseStatus.hasAnonKey,
    supabaseProjectIdPresent: supabaseStatus.hasProjectId,
    liveDatabaseActive: false,
    liveQueriesEnabled: Boolean(providerMode === PROVIDERS.SUPABASE_READONLY && supabaseStatus.liveQueriesEnabled),
    readOnlyEnabled: Boolean(providerMode === PROVIDERS.SUPABASE_READONLY),
    supabaseClientLoaded: Boolean(supabaseStatus.clientPackageAvailable),
    supabaseConnected: Boolean(supabaseStatus.connected),
    safeSupabaseSummary: getSafeSupabaseClientSummary(),
    warnings: getProviderWarnings(),
  };
}
