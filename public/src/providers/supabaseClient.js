import { ensureSupabaseRuntimeConfig, getSupabaseConfig, getSupabaseConfigStatus, getSupabaseSafeSummary } from "../config/supabaseConfig.js";

let cachedClient = null;
let cachedClientStatus = null;

function browserSupabaseFactory() {
  if (window.__MAXWEBSTUDIO_SUPABASE_CLIENT_FACTORY__) return window.__MAXWEBSTUDIO_SUPABASE_CLIENT_FACTORY__;
  if (window.supabase?.createClient) return window.supabase.createClient;
  if (window.Supabase?.createClient) return window.Supabase.createClient;
  return null;
}

async function importConfiguredSupabaseFactory() {
  const moduleUrl = window.__MAXWEBSTUDIO_SUPABASE_MODULE_URL__ || "";
  if (!moduleUrl) return null;
  try {
    const mod = await import(moduleUrl);
    return mod.createClient || mod.default?.createClient || null;
  } catch (error) {
    console.info("Supabase module kon niet worden geladen.", error);
    return null;
  }
}

export function isSupabaseConfigured() {
  return getSupabaseConfigStatus().configured;
}

export function getSupabaseClientStatus() {
  const status = getSupabaseConfigStatus();
  const factoryAvailable = Boolean(browserSupabaseFactory());
  return {
    ...status,
    connected: Boolean(cachedClientStatus?.connected),
    liveQueriesEnabled: Boolean(status.configured && (factoryAvailable || cachedClient) && cachedClientStatus?.connected),
    clientPackageAvailable: Boolean(factoryAvailable || cachedClient),
    customerWritesEnabled: false,
    readOnlyEnabled: Boolean(status.configured && (factoryAvailable || cachedClient)),
    lastTestedAt: cachedClientStatus?.lastTestedAt || "",
    lastError: cachedClientStatus?.lastError || "",
    reason: status.configured
      ? "Supabase configuratie aanwezig. Frontend env-config moet via Netlify/build/runtime config beschikbaar worden gemaakt."
      : status.reason,
  };
}

export async function getSupabaseClient() {
  await ensureSupabaseRuntimeConfig().catch((error) => {
    cachedClientStatus = {
      connected: false,
      lastTestedAt: new Date().toISOString(),
      lastError: error.message || "Supabase runtime-config kon niet worden geladen.",
    };
  });
  const config = getSupabaseConfig();
  const status = getSupabaseConfigStatus();
  if (!status.configured) {
    cachedClientStatus = {
      connected: false,
      lastTestedAt: new Date().toISOString(),
      lastError: "Supabase URL of anon key ontbreekt.",
    };
    return null;
  }
  if (cachedClient) return cachedClient;
  const factory = browserSupabaseFactory() || await importConfiguredSupabaseFactory();
  if (!factory) {
    cachedClientStatus = {
      connected: false,
      lastTestedAt: new Date().toISOString(),
      lastError: "Supabase client package nog niet actief. Gebruik runtime client of module-URL.",
    };
    return null;
  }
  try {
    cachedClient = factory(config.url, config.anonKey);
    return cachedClient;
  } catch (error) {
    cachedClientStatus = {
      connected: false,
      lastTestedAt: new Date().toISOString(),
      lastError: error.message || "Supabase client kon niet worden aangemaakt.",
    };
    return null;
  }
}

export async function testSupabaseConnection() {
  const testedAt = new Date().toISOString();
  const client = await getSupabaseClient();
  if (!client) {
    const status = getSupabaseClientStatus();
    return {
      success: false,
      configured: status.configured,
      clientLoaded: status.clientPackageAvailable,
      connected: false,
      customersTableAccessible: false,
      count: null,
      testedAt,
      error: status.lastError || status.reason,
    };
  }
  try {
    const query = client.from("customers").select("id", { count: "exact", head: true });
    const { count, error } = await query;
    if (error) throw error;
    cachedClientStatus = {
      connected: true,
      lastTestedAt: testedAt,
      lastError: "",
      customersCount: count ?? 0,
    };
    return {
      success: true,
      configured: true,
      clientLoaded: true,
      connected: true,
      customersTableAccessible: true,
      count: count ?? 0,
      testedAt,
      error: "",
    };
  } catch (error) {
    cachedClientStatus = {
      connected: false,
      lastTestedAt: testedAt,
      lastError: error.message || "Supabase read-only test mislukt.",
    };
    return {
      success: false,
      configured: true,
      clientLoaded: true,
      connected: false,
      customersTableAccessible: false,
      count: null,
      testedAt,
      error: cachedClientStatus.lastError,
    };
  }
}

export function createSupabaseClientPlaceholder() {
  const status = getSupabaseClientStatus();
  return {
    status,
    client: cachedClient,
    reason: status.reason,
  };
}

export function getSafeSupabaseClientSummary() {
  const summary = getSupabaseSafeSummary();
  const status = getSupabaseClientStatus();
  return {
    ...summary,
    clientPackageAvailable: status.clientPackageAvailable,
    readOnlyEnabled: status.readOnlyEnabled,
    connected: status.connected,
    lastTestedAt: status.lastTestedAt,
    lastError: status.lastError,
  };
}
