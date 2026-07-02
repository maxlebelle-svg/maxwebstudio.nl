export const SUPABASE_ENV_KEYS = Object.freeze({
  url: "SUPABASE_URL",
  anonKey: "SUPABASE_ANON_KEY",
  projectId: "SUPABASE_PROJECT_ID",
});

const AUTH_CONFIG_ENDPOINT = "/.netlify/functions/client-auth-config";
let runtimeConfigPromise = null;

function readBrowserConfig() {
  const runtimeConfig = window.__MAXWEBSTUDIO_SUPABASE_CONFIG__ || {};
  let storedConfig = {};
  try {
    storedConfig = JSON.parse(localStorage.getItem("maxwebstudioSupabaseConfig") || "{}");
  } catch {
    storedConfig = {};
  }
  return { ...storedConfig, ...runtimeConfig };
}

export async function ensureSupabaseRuntimeConfig() {
  const current = getSupabaseConfig();
  if (current.url && current.anonKey) return current;
  if (typeof fetch !== "function") return current;
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch(AUTH_CONFIG_ENDPOINT, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !data.supabaseUrl || !data.supabaseAnonKey) {
          throw new Error(data.error || "Supabase browserconfiguratie is niet beschikbaar.");
        }
        window.__MAXWEBSTUDIO_SUPABASE_CONFIG__ = {
          ...(window.__MAXWEBSTUDIO_SUPABASE_CONFIG__ || {}),
          supabaseUrl: data.supabaseUrl,
          supabaseAnonKey: data.supabaseAnonKey,
          supabaseProjectId: data.supabaseProjectId || "",
          appEnv: data.appEnv || "",
          appEnvironment: data.appEnvironment || "",
        };
        return getSupabaseConfig();
      })
      .catch((error) => {
        runtimeConfigPromise = null;
        throw error;
      });
  }
  return runtimeConfigPromise;
}

export function getSupabaseConfig() {
  const config = readBrowserConfig();
  return {
    url: String(config.supabaseUrl || config.SUPABASE_URL || "").trim(),
    anonKey: String(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || "").trim(),
    projectId: String(config.supabaseProjectId || config.SUPABASE_PROJECT_ID || "").trim(),
  };
}

export function getSupabaseConfigStatus() {
  const config = getSupabaseConfig();
  const hasUrl = Boolean(config.url);
  const hasAnonKey = Boolean(config.anonKey);
  const hasProjectId = Boolean(config.projectId);
  return {
    configured: hasUrl && hasAnonKey,
    hasUrl,
    hasAnonKey,
    hasProjectId,
    connected: false,
    reason: hasUrl && hasAnonKey
      ? "Supabase configuratie aanwezig, maar live queries zijn nog niet actief."
      : "Supabase URL of anon key ontbreekt. Gebruik .env.example als invullijst.",
  };
}

export function getSupabaseSafeSummary() {
  const status = getSupabaseConfigStatus();
  return {
    urlPresent: status.hasUrl,
    anonKeyPresent: status.hasAnonKey,
    projectIdPresent: status.hasProjectId,
    configured: status.configured,
    connected: false,
    reason: status.reason,
  };
}
