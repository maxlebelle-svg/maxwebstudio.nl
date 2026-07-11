import { requireAuth } from "./services/routeGuardService.js";

const ADMIN_SESSION_KEY = "mws_admin_supabase_session";
const SUPABASE_SESSION_KEY = "maxwebstudioSupabaseAuthSession";
const ADMIN_LOGIN_PATH = "/admin-login.html";
const ADMIN_ROLES = new Set(["developer", "super_admin", "admin", "sales_manager", "sales_partner", "designer", "support"]);

function currentAdminPageName() {
  const fileName = String(window.location?.pathname || "").split("/").pop() || "";
  return fileName.replace(/\.html$/i, "") || "admin-dashboard";
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function sameDestination(target = "") {
  try {
    const parsed = new URL(target, window.location.origin);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` === currentPath();
  } catch {
    return false;
  }
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function toMillisExpiry(value) {
  if (!value) return 0;
  if (typeof value === "number") return value < 100000000000 ? value * 1000 : value;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function storedAuthSession() {
  const supabaseSession = readJson(SUPABASE_SESSION_KEY);
  if (supabaseSession?.access_token) {
    return {
      accessToken: supabaseSession.access_token,
      refreshToken: supabaseSession.refresh_token || "",
      user: supabaseSession.user || {},
      expiresAt: supabaseSession.expires_at ? supabaseSession.expires_at * 1000 : 0,
    };
  }
  const bridgeSession = readJson(ADMIN_SESSION_KEY);
  if (bridgeSession?.accessToken) {
    return {
      accessToken: bridgeSession.accessToken,
      refreshToken: bridgeSession.refreshToken || "",
      user: { id: bridgeSession.userId || "", email: bridgeSession.email || "" },
      expiresAt: toMillisExpiry(bridgeSession.expiresAt),
    };
  }
  return null;
}

function sessionExpired(session = {}) {
  return session.expiresAt && session.expiresAt <= Date.now() + 30000;
}

async function fetchAccountProfile(accessToken) {
  const response = await fetch("/api/account-profile", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    const error = new Error(data.error || "Profielcontrole is niet gelukt.");
    error.code = data.code || "PROFILE_LOOKUP_FAILED";
    throw error;
  }
  return data;
}

function writeAdminBridge(session, account) {
  const profile = account.profile || {};
  const user = account.user || session.user || {};
  const role = String(profile.role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const active = String(profile.status || "").toLowerCase() === "active";
  if (!session.accessToken || !ADMIN_ROLES.has(role) || !active) return false;
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
    id: session.accessToken ? `admin-${session.accessToken.slice(0, 12)}` : `admin-${Date.now()}`,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken || "",
    email: user.email || profile.email || "",
    userId: user.id || profile.authUserId || "",
    profileId: profile.id || "",
    role,
    status: profile.status || "active",
    startedAt: new Date().toISOString(),
    expiresAt: session.expiresAt || Date.now() + 60 * 60 * 1000,
  }));
  return true;
}

function redirectToAdminLogin(reason = "session") {
  if (window.location.pathname === ADMIN_LOGIN_PATH) return;
  const target = new URL(ADMIN_LOGIN_PATH, window.location.origin);
  target.searchParams.set("next", currentPath());
  if (reason) target.searchParams.set("reason", reason);
  const next = `${target.pathname}${target.search}`;
  if (!sameDestination(next)) window.location.replace(next);
}

async function verifyAdminAccess() {
  document.documentElement.dataset.adminAccess = "checking";
  const session = storedAuthSession();
  if (!session?.accessToken || sessionExpired(session)) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return { allowed: false, reason: "session" };
  }
  try {
    const account = await fetchAccountProfile(session.accessToken);
    if (!writeAdminBridge(session, account)) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return { allowed: false, reason: "profile" };
    }
    return { allowed: true, reason: "profile" };
  } catch {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return { allowed: false, reason: "profile" };
  }
}

const verification = await verifyAdminAccess();
if (!verification.allowed) {
  window.maxwebstudioAdminGuardDecision = {
    allowed: false,
    decision: "admin_profile_blocked",
    reason: verification.reason,
  };
  document.documentElement.dataset.adminAccess = "blocked";
  redirectToAdminLogin(verification.reason);
} else {
  const decision = requireAuth({
    pageName: currentAdminPageName(),
    allowDemo: false,
    mode: "hard",
  });

  window.maxwebstudioAdminGuardDecision = decision;
  document.documentElement.dataset.adminAccess = decision.allowed ? "allowed" : "blocked";
}
