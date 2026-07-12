import { getSession, signOut } from "./supabaseAuthProvider.js?v=20260712-authbridge";

const ADMIN_SESSION_KEY = "mws_admin_supabase_session";
const CURRENT_SESSION_KEY = "maxwebstudioCurrentSession";
const LEGACY_ADMIN_SESSION_KEY = "maxwebstudioAdminSession";
const ADMIN_ROLES = new Set(["developer", "super_admin", "admin", "sales_manager", "sales_partner", "designer", "support"]);

function normalizeRole(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function clearDerivedAdminSessions() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
  localStorage.removeItem(CURRENT_SESSION_KEY);
  localStorage.removeItem(LEGACY_ADMIN_SESSION_KEY);
}

async function fetchAccountProfile(accessToken) {
  const response = await fetch("/api/account-profile", {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    const error = new Error(data.error || "Profielcontrole is niet gelukt.");
    error.code = data.code || (response.status === 401 ? "AUTH_SESSION_INVALID" : "PROFILE_LOOKUP_FAILED");
    error.status = response.status;
    throw error;
  }
  return data;
}

function writeDerivedAdminSessions(session, account) {
  const profile = account?.profile || {};
  const user = account?.user || session?.user || {};
  const role = normalizeRole(profile.role);
  const status = String(profile.status || "").trim().toLowerCase();
  if (!session?.access_token || !ADMIN_ROLES.has(role) || status !== "active") {
    clearDerivedAdminSessions();
    const error = new Error(status !== "active" ? "Dit adminprofiel is niet actief." : "Dit account heeft geen actieve adminrol.");
    error.code = status !== "active" ? "PROFILE_INACTIVE" : "ROLE_NOT_ALLOWED";
    throw error;
  }

  const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + 60 * 60 * 1000;
  const startedAt = new Date().toISOString();
  const bridge = {
    id: `admin-${user.id || profile.authUserId || "session"}`,
    accessToken: session.access_token,
    refreshToken: session.refresh_token || "",
    email: user.email || profile.email || "",
    userId: user.id || profile.authUserId || "",
    profileId: profile.id || "",
    role,
    status: "active",
    provider: "supabase-admin",
    startedAt,
    expiresAt,
  };
  const current = {
    id: bridge.id,
    userId: bridge.userId,
    role,
    roleLabel: role,
    provider: "supabase-admin",
    accessToken: bridge.accessToken,
    customerId: "",
    startedAt,
    expiresAt: new Date(expiresAt).toISOString(),
  };
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(bridge));
  localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(current));
  localStorage.removeItem(LEGACY_ADMIN_SESSION_KEY);
  return { session, account, bridge, role };
}

export async function resolveAdminAuth(options = {}) {
  const result = await getSession();
  const session = result?.session || null;
  if (!session?.access_token) {
    clearDerivedAdminSessions();
    const error = new Error("Je sessie is verlopen. Log opnieuw in.");
    error.code = "AUTH_SESSION_MISSING";
    throw error;
  }
  const account = options.account || await fetchAccountProfile(session.access_token);
  return writeDerivedAdminSessions(session, account);
}

export async function getAdminAccessToken() {
  const resolved = await resolveAdminAuth();
  return resolved.session.access_token;
}

export async function logoutAdmin() {
  clearDerivedAdminSessions();
  await signOut();
  return { success: true };
}

export function clearAdminAuthBridge() {
  clearDerivedAdminSessions();
}

export function getSafeAdminAuthMessage(error = {}) {
  const code = String(error.code || "").toUpperCase();
  if (["AUTH_SESSION_MISSING", "AUTH_SESSION_INVALID", "AUTH_REFRESH_FAILED"].includes(code)) return "Je sessie is verlopen. Log opnieuw in.";
  if (["ROLE_NOT_ALLOWED", "PROFILE_ROLE_DENIED"].includes(code)) return "Dit account heeft geen actieve adminrol.";
  if (code === "PROFILE_INACTIVE") return "Dit adminprofiel is niet actief.";
  if (code === "PROFILE_LOOKUP_FAILED") return "Je adminprofiel kon tijdelijk niet worden gecontroleerd.";
  return "De klantcontext kon niet worden geladen. Probeer het opnieuw.";
}
