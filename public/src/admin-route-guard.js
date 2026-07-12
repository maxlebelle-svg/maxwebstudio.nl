import { requireAuth } from "./services/routeGuardService.js";
import { resolveAdminAuth } from "./services/adminAuthBridgeService.js";

const ADMIN_SESSION_KEY = "mws_admin_supabase_session";
const ADMIN_LOGIN_PATH = "/admin-login.html";

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
  try {
    await resolveAdminAuth();
    return { allowed: true, reason: "profile" };
  } catch (error) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return { allowed: false, reason: ["ROLE_NOT_ALLOWED", "PROFILE_INACTIVE"].includes(error?.code) ? "profile" : "session" };
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
