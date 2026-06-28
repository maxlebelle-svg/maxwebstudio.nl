import { getSupabaseClient, getSupabaseClientStatus, testSupabaseConnection } from "../providers/supabaseClient.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";

let lastReadOnlyResult = null;

export async function checkSupabaseConnection() {
  lastReadOnlyResult = await testSupabaseConnection();
  if (lastReadOnlyResult.success) {
    localStorage.setItem(STORAGE_KEYS.lastSupabaseReadOnlyTest, JSON.stringify({
      ...lastReadOnlyResult,
      type: "supabase_readonly_connection_test",
    }));
  }
  return lastReadOnlyResult;
}

export async function checkTableAccess(tableName) {
  const testedAt = new Date().toISOString();
  const client = await getSupabaseClient();
  if (!client) {
    const status = getSupabaseClientStatus();
    return {
      success: false,
      tableName,
      accessible: false,
      count: null,
      testedAt,
      error: status.lastError || status.reason,
    };
  }
  try {
    const { count, error } = await client.from(tableName).select("id", { count: "exact", head: true });
    if (error) throw error;
    const result = {
      success: true,
      tableName,
      accessible: true,
      count: count ?? 0,
      testedAt,
      error: "",
    };
    if (tableName === "customers") {
      lastReadOnlyResult = { ...result, customersTableAccessible: true, connected: true };
      localStorage.setItem(STORAGE_KEYS.lastSupabaseReadOnlyTest, JSON.stringify({
        ...lastReadOnlyResult,
        type: "supabase_readonly_customers_check",
      }));
    }
    return result;
  } catch (error) {
    const result = {
      success: false,
      tableName,
      accessible: false,
      count: null,
      testedAt,
      error: error.message || `${tableName} table check mislukt.`,
    };
    if (tableName === "customers") lastReadOnlyResult = { ...result, customersTableAccessible: false, connected: false };
    return result;
  }
}

export function checkCustomersTable() {
  return checkTableAccess("customers");
}

export function getReadOnlySummary() {
  const status = getSupabaseClientStatus();
  return {
    configured: status.configured,
    clientLoaded: status.clientPackageAvailable,
    connected: Boolean(lastReadOnlyResult?.connected || status.connected),
    customersTableAccessible: Boolean(lastReadOnlyResult?.customersTableAccessible || lastReadOnlyResult?.accessible),
    customersCount: lastReadOnlyResult?.count ?? null,
    lastTestedAt: lastReadOnlyResult?.testedAt || status.lastTestedAt || "",
    error: lastReadOnlyResult?.error || status.lastError || "",
    readOnlyEnabled: status.readOnlyEnabled,
    writesBlocked: true,
  };
}
