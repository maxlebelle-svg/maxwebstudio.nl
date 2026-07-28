import "./dashboard.js";
import { getSession, onAuthStateChange, signOut } from "../../src/services/supabaseAuthProvider.js";
import "../../src/services/foodAuthBridgeService.js";

const requestedFoodPath = window.MaxFoodAuthBridge.canonicalFoodPath(window.location.pathname, window.location.origin) || "/admin/food";
const loginPath = `/login.html?next=${encodeURIComponent(requestedFoodPath)}`;
const sessionProvider = async () => {
  const result = await getSession();
  if (!result?.session?.access_token) {
    const error = new Error("Je sessie is verlopen. Log opnieuw in.");
    error.code = "AUTH_REQUIRED";
    throw error;
  }
  return result.session.access_token;
};

const app = window.MaxFoodDashboard.createDashboardApp({
  sessionProvider,
  logout: async () => { await signOut(); window.location.assign(loginPath); },
});

async function startWithFoodGate() {
  try {
    const accessToken = await sessionProvider();
    const access = await window.MaxFoodAuthBridge.resolveFoodRouteAccess({
      accessToken,
      requestedPath: window.location.pathname,
      origin: window.location.origin,
    });
    await app.start(access.context);
  } catch (error) {
    if (["AUTH_REQUIRED", "INVALID_SESSION"].includes(error?.code) || error?.status === 401) {
      await signOut().catch(() => null);
      app.handleLogout(loginPath);
      return;
    }
    app.deny(error);
  }
}

startWithFoodGate();
const subscription = onAuthStateChange((event, result) => {
  if (event === "SIGNED_OUT" || !result?.session?.access_token) app.handleLogout(loginPath);
});
window.addEventListener("pagehide", () => {
  app.stop();
  subscription?.data?.subscription?.unsubscribe?.();
}, { once: true });
