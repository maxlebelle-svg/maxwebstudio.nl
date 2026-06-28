import { getSupabaseConfigStatus } from "../config/supabaseConfig.js";
import { getSupabaseClientStatus } from "../providers/supabaseClient.js";

const PREPARED_MESSAGE = "Supabase Auth is voorbereid maar nog niet actief/geconfigureerd.";

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

function throwPrepared(action) {
  throw authNotActive(action);
}

export async function signInWithEmail(email, password) {
  if (!email || !password) throw new Error("Vul e-mailadres en wachtwoord in.");
  return throwPrepared("signInWithEmail");
}

export async function signUpWithEmail(email, password, metadata = {}) {
  if (!email || !password) throw new Error("Vul e-mailadres en wachtwoord in.");
  return throwPrepared("signUpWithEmail");
}

export async function signOut() {
  return throwPrepared("signOut");
}

export async function getSession() {
  return { session: null, provider: "supabase-prepared", active: false };
}

export async function getUser() {
  return { user: null, provider: "supabase-prepared", active: false };
}

export async function resetPassword(email) {
  if (!email) throw new Error("Vul een e-mailadres in.");
  return throwPrepared("resetPassword");
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
  return {
    mode: "supabase-prepared",
    configured: Boolean(config.configured),
    hasUrl: Boolean(config.hasUrl),
    hasAnonKey: Boolean(config.hasAnonKey),
    active: false,
    reason: config.configured
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
