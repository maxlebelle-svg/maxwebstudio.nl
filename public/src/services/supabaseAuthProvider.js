import { getSupabaseConfig, getSupabaseConfigStatus } from "../config/supabaseConfig.js";
import { getSupabaseClientStatus } from "../providers/supabaseClient.js";

const PREPARED_MESSAGE = "Supabase Auth is voorbereid maar nog niet actief/geconfigureerd.";
const AUTH_SESSION_KEY = "maxwebstudioSupabaseAuthSession";
const AUTH_CONFIG_ENDPOINT = "/.netlify/functions/client-auth-config";

function isTruthy(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function isTestEnvironment(config = {}) {
  const appEnv = String(config.appEnv || config.APP_ENV || "").toLowerCase();
  const appEnvironment = String(config.appEnvironment || config.APP_ENVIRONMENT || "").toLowerCase();
  return ["test", "staging"].includes(appEnv) || ["test", "staging"].includes(appEnvironment);
}

function normalizePublicConfig(config = {}) {
  return {
    url: String(config.supabaseUrl || config.SUPABASE_URL || config.url || "").replace(/\/$/, ""),
    anonKey: String(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || config.anonKey || ""),
    appEnv: String(config.appEnv || config.APP_ENV || ""),
    appEnvironment: String(config.appEnvironment || config.APP_ENVIRONMENT || ""),
    clientPortalAuthLive: isTruthy(config.clientPortalAuthLive || config.CLIENT_PORTAL_AUTH_LIVE),
  };
}

async function getRuntimeAuthConfig() {
  let endpointConfig = {};
  try {
    const response = await fetch(AUTH_CONFIG_ENDPOINT, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) endpointConfig = await response.json();
  } catch {
    endpointConfig = {};
  }

  const browserConfig = getSupabaseConfig();
  const runtimeConfig = window.__MAXWEBSTUDIO_SUPABASE_CONFIG__ || {};
  const config = normalizePublicConfig({
    ...browserConfig,
    ...runtimeConfig,
    ...endpointConfig,
  });
  const active = Boolean(config.url && config.anonKey && config.clientPortalAuthLive && isTestEnvironment(config));

  return {
    ...config,
    active,
  };
}

function readStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null");
    if (!session?.access_token) return null;
    if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function storeSession(session = null) {
  if (!session?.access_token) return null;
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

function toSessionResult(session = null) {
  return {
    session,
    user: session?.user || null,
    provider: "supabase-staging",
    active: Boolean(session?.access_token),
  };
}

function authNotActive(action) {
  const status = getSupabaseClientStatus();
  const reason = status.configured
    ? "Supabase configuratie is gevonden, maar de Auth-client wordt pas in een gecontroleerde vervolgfase live gekoppeld."
    : "SUPABASE_URL en SUPABASE_ANON_KEY ontbreken nog of zijn niet veilig beschikbaar.";
  const error = new Error(`${PREPARED_MESSAGE} ${reason}`);
  error.code = "SUPABASE_AUTH_PREPARED";
  error.action = action;
  error.status = {
    configured: Boolean(status.configured),
    hasUrl: Boolean(status.hasUrl),
    hasAnonKey: Boolean(status.hasAnonKey),
    liveAuthEnabled: false,
  };
  return error;
}

async function throwPrepared(action) {
  throw authNotActive(action);
}

export async function signInWithEmail(email, password) {
  if (!email || !password) throw new Error("Vul e-mailadres en wachtwoord in.");
  const config = await getRuntimeAuthConfig();
  if (!config.active) return throwPrepared("signInWithEmail");

  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.msg || payload.message || "Inloggen is niet gelukt.");
    error.code = payload.error || "SUPABASE_AUTH_FAILED";
    error.status = response.status;
    throw error;
  }
  return toSessionResult(storeSession(payload));
}

export async function signUpWithEmail(email, password, metadata = {}) {
  if (!email || !password) throw new Error("Vul e-mailadres en wachtwoord in.");
  return throwPrepared("signUpWithEmail");
}

export async function signOut() {
  const session = readStoredSession();
  const config = await getRuntimeAuthConfig();
  if (config.active && session?.access_token) {
    await fetch(`${config.url}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
    }).catch(() => null);
  }
  localStorage.removeItem(AUTH_SESSION_KEY);
  return { success: true, provider: "supabase-staging" };
}

export async function getSession() {
  return toSessionResult(readStoredSession());
}

export async function getUser() {
  const session = readStoredSession();
  return { user: session?.user || null, provider: "supabase-staging", active: Boolean(session?.user) };
}

export async function resetPassword(email) {
  if (!email) throw new Error("Vul een e-mailadres in.");
  const config = await getRuntimeAuthConfig();
  if (!config.active) return throwPrepared("resetPassword");

  const response = await fetch(`${config.url}/auth/v1/recover`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.msg || payload.message || "Resetlink aanvragen is niet gelukt.");
    error.code = payload.error || "SUPABASE_RESET_FAILED";
    error.status = response.status;
    throw error;
  }
  return { success: true, provider: "supabase-staging" };
}

export async function updatePassword(newPassword) {
  if (!newPassword) throw new Error("Vul een nieuw wachtwoord in.");
  return throwPrepared("updatePassword");
}

export function onAuthStateChange(callback) {
  if (typeof callback === "function") {
    callback("SUPABASE_AUTH_PREPARED", { session: null, user: null });
  }
  return {
    data: {
      subscription: {
        unsubscribe() {},
      },
    },
  };
}

export function getSupabaseAuthStatus() {
  const config = getSupabaseConfigStatus();
  const browserConfig = normalizePublicConfig({
    ...getSupabaseConfig(),
    ...(window.__MAXWEBSTUDIO_SUPABASE_CONFIG__ || {}),
  });
  const active = Boolean(config.configured && browserConfig.clientPortalAuthLive && isTestEnvironment(browserConfig));
  return {
    mode: "supabase-prepared",
    configured: Boolean(config.configured),
    hasUrl: Boolean(config.hasUrl),
    hasAnonKey: Boolean(config.hasAnonKey),
    active,
    reason: active
      ? "Supabase Auth UI is actief voor test/staging."
      : config.configured
      ? "Supabase Auth provider voorbereid; live client nog niet actief."
      : PREPARED_MESSAGE,
  };
}

export const supabaseAuthProvider = {
  type: "supabase-prepared",
  status: "prepared",
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getSession,
  getUser,
  resetPassword,
  updatePassword,
  onAuthStateChange,
  getStatus: getSupabaseAuthStatus,
};
