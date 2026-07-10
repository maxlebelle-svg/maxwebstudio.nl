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

function isProductionEnvironment(config = {}) {
  const appEnv = String(config.appEnv || config.APP_ENV || "").toLowerCase();
  const appEnvironment = String(config.appEnvironment || config.APP_ENVIRONMENT || "").toLowerCase();
  return appEnv === "production" || appEnvironment === "production";
}

function isAllowedAuthEnvironment(config = {}) {
  return isTestEnvironment(config) || isProductionEnvironment(config);
}

function isAdminLoginRequest() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search || "");
  if (params.get("mode") === "admin") return true;
  const redirect = params.get("redirect") || params.get("returnTo") || params.get("next") || "";
  try {
    const parsed = new URL(redirect, window.location.origin);
    return parsed.origin === window.location.origin && /^\/admin(?:-|\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function normalizePublicConfig(config = {}) {
  const url = String(config.supabaseUrl || config.SUPABASE_URL || config.url || "").replace(/\/$/, "");
  const project = getSupabaseProjectInfo(url);
  const anonKey = String(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || config.anonKey || "");
  return {
    url,
    anonKey,
    appEnv: String(config.appEnv || config.APP_ENV || ""),
    appEnvironment: String(config.appEnvironment || config.APP_ENVIRONMENT || ""),
    clientPortalAuthLive: isTruthy(config.clientPortalAuthLive || config.CLIENT_PORTAL_AUTH_LIVE),
    host: project.host,
    projectRef: project.projectRef,
    keyType: getPublicKeyType(anonKey),
  };
}

function getSupabaseProjectInfo(url = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const projectRef = host.endsWith(".supabase.co") ? host.split(".")[0] : "";
    return { host, projectRef };
  } catch {
    return { host: "", projectRef: "" };
  }
}

function getPublicKeyType(key = "") {
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.split(".").length === 3) return "jwt-anon";
  return key ? "unknown-public-key-shape" : "missing";
}

function sanitizeAuthMessage(value = "") {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/apikey['":\s]+[A-Za-z0-9._-]+/gi, "apikey [redacted]")
    .trim();
}

function createAuthDebug(config = {}, response = {}, payload = {}) {
  const code = payload.error_code || payload.code || payload.error || "SUPABASE_AUTH_FAILED";
  const message = sanitizeAuthMessage(payload.message || payload.msg || payload.error_description || "Inloggen is niet gelukt.");
  return {
    code,
    message,
    status: response.status || "",
    host: config.host || "",
    projectRef: config.projectRef || "",
    keyType: config.keyType || "unknown",
  };
}

function recoveryRedirectUrl() {
  if (typeof window === "undefined") return "";
  const origin = window.location?.origin || "";
  return origin ? `${origin}/login.html?type=recovery` : "";
}

function readRecoveryParamsFromUrl() {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
  const search = new URLSearchParams(String(window.location.search || "").replace(/^\?/, ""));
  const accessToken = hash.get("access_token") || search.get("access_token") || "";
  const refreshToken = hash.get("refresh_token") || search.get("refresh_token") || "";
  const tokenHash = hash.get("token_hash") || search.get("token_hash") || hash.get("token") || search.get("token") || "";
  const authCode = hash.get("code") || search.get("code") || "";
  const type = hash.get("type") || search.get("type") || (accessToken || refreshToken || tokenHash || authCode ? "recovery" : "");
  const allowedSessionTypes = new Set(["invite", "recovery"]);
  if (!allowedSessionTypes.has(type)) return null;
  if (!accessToken) {
    return {
      token_hash: tokenHash,
      code: authCode,
      recovery: type === "recovery",
      invite: type === "invite",
    };
  }
  const expiresIn = Number(hash.get("expires_in") || search.get("expires_in") || 3600);
  const expiresAt = Number(hash.get("expires_at") || search.get("expires_at")) || Math.floor(Date.now() / 1000) + expiresIn;
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: hash.get("token_type") || search.get("token_type") || "bearer",
    expires_in: expiresIn,
    expires_at: expiresAt,
    user: null,
    recovery: type === "recovery",
    invite: type === "invite",
  };
}

function clearRecoveryParamsFromUrl() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("access_token");
  url.searchParams.delete("refresh_token");
  url.searchParams.delete("expires_in");
  url.searchParams.delete("expires_at");
  url.searchParams.delete("token_type");
  url.searchParams.delete("type");
  url.searchParams.delete("token_hash");
  url.searchParams.delete("token");
  url.searchParams.delete("code");
  window.history.replaceState({}, document.title, url.pathname + url.search);
}

async function verifyRecoveryTokenHash(config, tokenHash) {
  if (!tokenHash) return null;
  const response = await fetch(`${config.url}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "recovery", token_hash: tokenHash }),
  });
  const payload = await response.json().catch(() => ({}));
  const session = normalizeAuthSession(payload);
  if (!response.ok || !session?.access_token) {
    const fallbackSession = await requestRecoverySessionFallback({ tokenHash }).catch(() => null);
    if (fallbackSession?.access_token) return fallbackSession;
    const debug = createAuthDebug(config, response, payload);
    const error = new Error(debug.message || "Herstel-link kon niet worden gecontroleerd.");
    error.code = debug.code || "SUPABASE_RECOVERY_VERIFY_FAILED";
    error.status = response.status;
    error.supabaseAuth = debug;
    throw error;
  }
  return session;
}

async function exchangeRecoveryCode(config, code) {
  if (!code) return null;
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ auth_code: code }),
  });
  const payload = await response.json().catch(() => ({}));
  const session = normalizeAuthSession(payload);
  if (!response.ok || !session?.access_token) {
    const fallbackSession = await requestRecoverySessionFallback({ code }).catch(() => null);
    if (fallbackSession?.access_token) return fallbackSession;
    const debug = createAuthDebug(config, response, payload);
    const error = new Error(debug.message || "Herstel-code kon niet worden gecontroleerd.");
    error.code = debug.code || "SUPABASE_RECOVERY_CODE_FAILED";
    error.status = response.status;
    error.supabaseAuth = debug;
    throw error;
  }
  return session;
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
  const active = Boolean(config.url && config.anonKey && (config.clientPortalAuthLive || isAdminLoginRequest()) && isAllowedAuthEnvironment(config));

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
    provider: "supabase",
    active: Boolean(session?.access_token),
  };
}

function normalizeAuthSession(payload = {}) {
  if (payload?.access_token) return payload;
  if (payload?.session?.access_token) return payload.session;
  if (payload?.data?.session?.access_token) return payload.data.session;
  return null;
}

async function requestRecoverySessionFallback(input = {}) {
  const response = await fetch("/.netlify/functions/client-recovery-session", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) return null;
  return normalizeAuthSession(payload.session || payload);
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

  let response;
  try {
    response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
  } catch (requestError) {
    const error = new Error("Supabase Auth request kon de omgeving niet bereiken.");
    error.code = "SUPABASE_AUTH_NETWORK_ERROR";
    error.status = "";
    error.supabaseAuth = {
      code: error.code,
      message: sanitizeAuthMessage(requestError?.message || "Network request failed"),
      status: "",
      host: config.host || "",
      projectRef: config.projectRef || "",
      keyType: config.keyType || "unknown",
    };
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const debug = createAuthDebug(config, response, payload);
    const error = new Error(debug.message || "Inloggen is niet gelukt.");
    error.code = debug.code;
    error.status = response.status;
    error.supabaseAuth = debug;
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
  return { success: true, provider: "supabase" };
}

export async function getSession() {
  return toSessionResult(readStoredSession());
}

export async function getUser() {
  const session = readStoredSession();
  return { user: session?.user || null, provider: "supabase", active: Boolean(session?.user) };
}

export async function resetPassword(email) {
  if (!email) throw new Error("Vul een e-mailadres in.");
  const config = await getRuntimeAuthConfig();
  if (!config.active) return throwPrepared("resetPassword");

  const recoverUrl = new URL(`${config.url}/auth/v1/recover`);
  const redirectTo = recoveryRedirectUrl();
  if (redirectTo) recoverUrl.searchParams.set("redirect_to", redirectTo);
  let response;
  try {
    response = await fetch(recoverUrl.toString(), {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
  } catch (requestError) {
    const error = new Error("Supabase password reset kon de omgeving niet bereiken.");
    error.code = "SUPABASE_RESET_NETWORK_ERROR";
    error.status = "";
    error.supabaseAuth = {
      code: error.code,
      message: sanitizeAuthMessage(requestError?.message || "Network request failed"),
      status: "",
      host: config.host || "",
      projectRef: config.projectRef || "",
      keyType: config.keyType || "unknown",
    };
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const debug = createAuthDebug(config, response, payload);
    const error = new Error(debug.message || "Resetlink aanvragen is niet gelukt.");
    error.code = debug.code || "SUPABASE_RESET_FAILED";
    error.status = response.status;
    error.supabaseAuth = debug;
    throw error;
  }
  return { success: true, provider: "supabase", redirectTo };
}

export async function consumeRecoverySessionFromUrl() {
  const config = await getRuntimeAuthConfig();
  if (!config.active) return { success: false, reason: "auth_inactive" };
  let session = readRecoveryParamsFromUrl();
  if (!session) return { success: false, reason: "no_recovery_session" };
  if (!session.access_token && session.token_hash) {
    session = await verifyRecoveryTokenHash(config, session.token_hash);
  }
  if (!session.access_token && session.code) {
    session = await exchangeRecoveryCode(config, session.code);
  }
  if (!session?.access_token) return { success: false, reason: "no_recovery_session" };
  storeSession(session);
  clearRecoveryParamsFromUrl();
  return { success: true, provider: "supabase" };
}

export async function updatePassword(newPassword) {
  if (!newPassword) throw new Error("Vul een nieuw wachtwoord in.");
  const config = await getRuntimeAuthConfig();
  if (!config.active) return throwPrepared("updatePassword");
  const session = readStoredSession();
  if (!session?.access_token) {
    const error = new Error("De herstel-link is verlopen of niet compleet. Vraag een nieuwe resetlink aan.");
    error.code = "SUPABASE_RECOVERY_SESSION_MISSING";
    throw error;
  }

  let response;
  try {
    response = await fetch(`${config.url}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
    });
  } catch (requestError) {
    const error = new Error("Wachtwoord instellen kon de loginomgeving niet bereiken.");
    error.code = "SUPABASE_PASSWORD_UPDATE_NETWORK_ERROR";
    error.supabaseAuth = {
      code: error.code,
      message: sanitizeAuthMessage(requestError?.message || "Network request failed"),
      status: "",
      host: config.host || "",
      projectRef: config.projectRef || "",
      keyType: config.keyType || "unknown",
    };
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const debug = createAuthDebug(config, response, payload);
    const error = new Error(debug.message || "Wachtwoord instellen is niet gelukt.");
    error.code = debug.code || "SUPABASE_PASSWORD_UPDATE_FAILED";
    error.status = response.status;
    error.supabaseAuth = debug;
    throw error;
  }

  localStorage.removeItem(AUTH_SESSION_KEY);
  return { success: true, provider: "supabase" };
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
  const productionEnvironment = isProductionEnvironment(browserConfig);
  const active = Boolean(config.configured && browserConfig.clientPortalAuthLive && isAllowedAuthEnvironment(browserConfig));
  return {
    mode: "supabase-prepared",
    configured: Boolean(config.configured),
    hasUrl: Boolean(config.hasUrl),
    hasAnonKey: Boolean(config.hasAnonKey),
    active,
    reason: active
      ? productionEnvironment
        ? "Supabase Auth UI is actief voor productie."
        : "Supabase Auth UI is actief voor test/staging."
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
  consumeRecoverySessionFromUrl,
  updatePassword,
  onAuthStateChange,
  getStatus: getSupabaseAuthStatus,
};
