export const SUPABASE_ENV_KEYS = Object.freeze({
  url: "SUPABASE_URL",
  anonKey: "SUPABASE_ANON_KEY",
  projectId: "SUPABASE_PROJECT_ID",
});

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
