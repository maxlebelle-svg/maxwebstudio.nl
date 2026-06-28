import { getSupabaseConfigStatus, getSupabaseSafeSummary } from "../config/supabaseConfig.js";

export function getSupabaseClientStatus() {
  const status = getSupabaseConfigStatus();
  return {
    ...status,
    connected: false,
    liveQueriesEnabled: false,
    clientPackageAvailable: false,
    customerWritesEnabled: false,
    reason: status.configured
      ? "Supabase configuratie voorbereid, maar de browserclient/package is nog niet actief."
      : status.reason,
  };
}

export function createSupabaseClientPlaceholder() {
  const status = getSupabaseClientStatus();
  return {
    status,
    client: null,
    reason: status.reason,
  };
}

export function getSafeSupabaseClientSummary() {
  return getSupabaseSafeSummary();
}
