import { getSupabaseConfigStatus, getSupabaseSafeSummary } from "../config/supabaseConfig.js";

export function getSupabaseClientStatus() {
  const status = getSupabaseConfigStatus();
  return {
    ...status,
    connected: false,
    liveQueriesEnabled: false,
    reason: status.configured
      ? "Supabase voorbereid, live queries komen in Fase 11.5/11.6."
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
