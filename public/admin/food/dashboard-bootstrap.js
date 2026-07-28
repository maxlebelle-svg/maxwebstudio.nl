import "./dashboard.js";
import { getSession, onAuthStateChange, signOut } from "../../src/services/supabaseAuthProvider.js";

const loginPath = "/login.html?next=%2Fadmin%2Ffood";
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

app.start();
const subscription = onAuthStateChange((event, result) => {
  if (event === "SIGNED_OUT" || !result?.session?.access_token) app.handleLogout(loginPath);
});
window.addEventListener("pagehide", () => {
  app.stop();
  subscription?.data?.subscription?.unsubscribe?.();
}, { once: true });
