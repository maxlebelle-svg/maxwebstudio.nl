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
  return key.startsWith("sb_publishable_") || (key.split(".").length === 3 && key.length > 80);
}

function redactConfig(config = {}) {
  return {
    urlPresent: Boolean(config.supabaseUrl || config.SUPABASE_URL || config.url),
    anonKeyPresent: Boolean(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || config.anonKey),
    projectIdPresent: Boolean(config.supabaseProjectId || config.SUPABASE_PROJECT_ID || config.projectId),
  };
}

function isTruthy(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function isTestEnvironment(config = {}) {
  const appEnv = String(config.appEnv || config.APP_ENV || "").toLowerCase();
  const appEnvironment = String(config.appEnvironment || config.APP_ENVIRONMENT || "").toLowerCase();
  return ["test", "staging"].includes(appEnv) || ["test", "staging"].includes(appEnvironment);
}

function isProductionEnvironment(config = {}) {
  const appEnv = String(config.appEnv || config.APP_ENV || "").toLowerCase();
  const appEnvironment = String(config.appEnvironment || config.APP_ENVIRONMENT || "").toLowerCase();
  return appEnv === "production" || appEnvironment === "production";
}

function isAllowedAuthEnvironment(config = {}) {
  return isTestEnvironment(config) || isProductionEnvironment(config);
}

export function evaluateClientAuthConfig(config = {}) {
  const supabaseUrl = String(config.supabaseUrl || config.SUPABASE_URL || config.url || "").trim();
  const anonKey = String(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || config.anonKey || "").trim();
  const urlSafe = isSafeSupabaseUrl(supabaseUrl);
  const anonKeySafe = isPublicAnonKeyShape(anonKey);
  const configured = Boolean(urlSafe && anonKeySafe);
  const testEnvironment = isTestEnvironment(config);
  const productionEnvironment = isProductionEnvironment(config);
  const allowedEnvironment = isAllowedAuthEnvironment(config);
  const authLiveRequested = isTruthy(config.clientPortalAuthLive || config.CLIENT_PORTAL_AUTH_LIVE);
  const authLive = Boolean(configured && allowedEnvironment && authLiveRequested);

  return {
    configured,
    urlPresent: Boolean(supabaseUrl),
    anonKeyPresent: Boolean(anonKey),
    urlSafe,
    anonKeySafe,
    testEnvironment,
    productionEnvironment,
    allowedEnvironment,
    authLiveRequested,
    authLive,
    canShowLoginForm: authLive,
    status: authLive
      ? productionEnvironment
        ? "production_auth_enabled"
        : "staging_auth_enabled"
      : configured
      ? "ready_for_auth_release"
      : "not_ready",
    visitorMessage: authLive
      ? "Klantlogin is actief. Gebruik je e-mailadres en wachtwoord om naar je portaal te gaan."
      : configured
      ? "Het klantportaal wordt gecontroleerd klaargezet. Je ontvangt toegang zodra je account is geactiveerd."
      : "Het klantportaal wordt momenteel afgerond. Vraag toegang aan of neem contact op als je al klant bent.",
    developerMessage: authLive
      ? productionEnvironment
        ? "Production Auth UI is actief via CLIENT_PORTAL_AUTH_LIVE en production environment."
        : "Staging Auth UI is actief via CLIENT_PORTAL_AUTH_LIVE in test/staging."
      : configured
      ? "Publieke Supabase URL en anon key zijn veilig beschikbaar. Auth blijft uit totdat release approval groen is."
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
    source: endpointReadiness ? "client-auth-config" : "browser-runtime-config",
    functionStatus,
    browserConfig,
    blockers: preferred.authLive
      ? preferred.productionEnvironment
        ? ["Production Auth UI is actief. Production writes blijven apart gegated."]
        : ["Staging/test Auth UI is actief. Productie blijft geblokkeerd tot release approval."]
      : preferred.configured
      ? ["Supabase Auth blijft bewust uit totdat release approval groen is en CLIENT_PORTAL_AUTH_LIVE aan staat."]
      : ["Publieke Supabase Auth-config is nog niet veilig beschikbaar voor de browser."],
  };
}

export const clientAuthReadinessService = {
  evaluateClientAuthConfig,
  getClientAuthReadiness,
};
