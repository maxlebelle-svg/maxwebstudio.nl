import { getSupabaseConfig, getSupabaseSafeSummary } from "../config/supabaseConfig.js";

const AUTH_CONFIG_ENDPOINT = "/.netlify/functions/client-auth-config";

function isSafeSupabaseUrl(value = "") {
  const url = String(value || "").trim();
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function isPublicAnonKeyShape(value = "") {
  const key = String(value || "").trim();
  return key.split(".").length === 3 && key.length > 80;
}

function redactConfig(config = {}) {
  return {
    urlPresent: Boolean(config.supabaseUrl || config.SUPABASE_URL || config.url),
    anonKeyPresent: Boolean(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || config.anonKey),
    projectIdPresent: Boolean(config.supabaseProjectId || config.SUPABASE_PROJECT_ID || config.projectId),
  };
}

export function evaluateClientAuthConfig(config = {}) {
  const supabaseUrl = String(config.supabaseUrl || config.SUPABASE_URL || config.url || "").trim();
  const anonKey = String(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || config.anonKey || "").trim();
  const urlSafe = isSafeSupabaseUrl(supabaseUrl);
  const anonKeySafe = isPublicAnonKeyShape(anonKey);
  const configured = Boolean(urlSafe && anonKeySafe);

  return {
    configured,
    urlPresent: Boolean(supabaseUrl),
    anonKeyPresent: Boolean(anonKey),
    urlSafe,
    anonKeySafe,
    canShowLoginForm: configured,
    status: configured ? "ready_for_staging_auth" : "not_ready",
    visitorMessage: configured
      ? "Het klantportaal wordt gecontroleerd klaargezet. Je ontvangt toegang zodra je account is geactiveerd."
      : "Het klantportaal wordt momenteel afgerond. Vraag toegang aan of neem contact op als je al klant bent.",
    developerMessage: configured
      ? "Publieke Supabase URL en anon key zijn veilig beschikbaar. Auth blijft uit totdat staging approval groen is."
      : "Publieke Supabase URL of anon key ontbreekt of voldoet niet aan de veilige browserconfig-vorm.",
    safeSummary: redactConfig(config),
  };
}

export async function getClientAuthReadiness() {
  const browserConfig = getSupabaseSafeSummary();
  let functionStatus = {
    checked: false,
    available: false,
    error: "",
    safeSummary: {},
  };
  let endpointReadiness = null;

  try {
    const response = await fetch(AUTH_CONFIG_ENDPOINT, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    functionStatus.checked = true;
    functionStatus.available = response.ok;
    if (response.ok) {
      const payload = await response.json();
      endpointReadiness = evaluateClientAuthConfig(payload);
      functionStatus.safeSummary = endpointReadiness.safeSummary;
    } else {
      functionStatus.error = `client-auth-config gaf status ${response.status}`;
    }
  } catch (error) {
    functionStatus.checked = true;
    functionStatus.error = error.message || "client-auth-config kon niet worden opgehaald";
  }

  const runtimeReadiness = evaluateClientAuthConfig(getSupabaseConfig());
  const preferred = endpointReadiness || runtimeReadiness;

  return {
    ...preferred,
    authLive: false,
    source: endpointReadiness ? "client-auth-config" : "browser-runtime-config",
    functionStatus,
    browserConfig,
    blockers: preferred.configured
      ? ["Supabase Auth blijft bewust uit totdat staging Auth-validatie en release approval groen zijn."]
      : ["Publieke Supabase Auth-config is nog niet veilig beschikbaar voor de browser."],
  };
}

export const clientAuthReadinessService = {
  evaluateClientAuthConfig,
  getClientAuthReadiness,
};
