import { demoAuthProvider } from "./demoAuthProvider.js";
import { supabaseAuthProvider } from "./supabaseAuthProvider.js";
import { getSupabaseAuthStatus } from "./supabaseAuthProvider.js";

const AUTH_PROVIDER_KEY = "maxwebstudioAuthProvider";
const PRODUCTION_HOSTS = new Set(["maxwebstudio.nl", "www.maxwebstudio.nl"]);

function isBrowserProductionRuntime() {
  const host = String(window.location?.hostname || "").toLowerCase();
  const configuredEnvironment = String(window.__MAXWEBSTUDIO_ENV__ || localStorage.getItem("maxwebstudioEnvironment") || "").toUpperCase();
  return PRODUCTION_HOSTS.has(host) || configuredEnvironment === "PRODUCTION";
}

function configuredAuthPreference() {
  if (isBrowserProductionRuntime()) return "supabase-prepared";
  return window.__MAXWEBSTUDIO_AUTH_PROVIDER__
    || localStorage.getItem(AUTH_PROVIDER_KEY)
    || localStorage.getItem("maxwebstudioAuthMode")
    || "demo";
}

export function getAuthMode() {
  const preferred = configuredAuthPreference();
  if (preferred === "supabase" || preferred === "supabase-prepared") return "supabase-prepared";
  return "demo";
}

export function getDemoAuthProvider() {
  return demoAuthProvider;
}

export function getSupabaseAuthProvider() {
  return supabaseAuthProvider;
}

export function getAuthProvider(mode = getAuthMode()) {
  if (isBrowserProductionRuntime()) return supabaseAuthProvider;
  if (mode === "supabase-prepared") return supabaseAuthProvider;
  return demoAuthProvider;
}

export function getSessionAuthProvider() {
  // Session reads still use the existing local bridge because account activation
  // stores the sanitized Supabase session there for route guards.
  return demoAuthProvider;
}

export function getEmailAuthProvider() {
  return supabaseAuthProvider;
}

export function setAuthMode(mode = "demo") {
  if (isBrowserProductionRuntime()) {
    localStorage.setItem(AUTH_PROVIDER_KEY, "supabase-prepared");
    localStorage.setItem("maxwebstudioAuthMode", "supabase-prepared");
    return getAuthMode();
  }
  const normalized = mode === "supabase" ? "supabase-prepared" : mode;
  localStorage.setItem(AUTH_PROVIDER_KEY, normalized === "supabase-prepared" ? "supabase-prepared" : "demo");
  localStorage.setItem("maxwebstudioAuthMode", normalized === "supabase-prepared" ? "supabase-prepared" : "demo");
  return getAuthMode();
}

export function getAuthStatus() {
  const demoStatus = demoAuthProvider.getStatus();
  const supabaseStatus = getSupabaseAuthStatus();
  const mode = getAuthMode();
  return {
    mode,
    activeProvider: supabaseStatus.active ? "supabase" : "demo",
    emailProvider: "supabase-prepared",
    demoAuthActive: !isBrowserProductionRuntime(),
    productionLockdown: isBrowserProductionRuntime(),
    supabaseAuthConfigured: Boolean(supabaseStatus.configured),
    supabaseAuthActive: Boolean(supabaseStatus.active),
    demoStatus,
    supabaseStatus,
    reason: supabaseStatus.active
      ? "Supabase Auth UI is actief via de gecontroleerde releasegate."
      : mode === "supabase-prepared"
      ? "Supabase Auth is voorbereid, maar demo/local sessies blijven actief totdat live Auth expliciet wordt gekoppeld."
      : "Demo auth actief. Supabase Auth is voorbereid als productiepad.",
  };
}
