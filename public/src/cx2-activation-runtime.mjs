const SAFE_PORTAL_ROUTE = /^\/(?:klantportaal|client-dashboard)\.html(?:[?#]|$)/;

export const CALLBACK_ERRORS = Object.freeze({
  CX2_ACTIVATION_INVALID: "Deze activatielink is ongeldig. Vraag Max Webstudio om een nieuwe link.",
  CX2_ACTIVATION_EXPIRED: "Deze activatielink is verlopen. Vraag Max Webstudio om een nieuwe link.",
  CX2_ACTIVATION_REVOKED: "Deze activatielink is ingetrokken. Vraag Max Webstudio om een nieuwe link.",
  CX2_IDENTITY_MISMATCH: "Deze link hoort niet bij het ingelogde account.",
  CX2_OWNERSHIP_AMBIGUOUS: "We kunnen deze omgeving niet veilig aan één klant koppelen. Neem contact op met Max Webstudio.",
  CX2_SESSION_RESTORE_TIMEOUT: "Je veilige sessie kon nog niet worden hersteld. Vernieuw de pagina om het opnieuw te proberen.",
  CX2_CALLBACK_TEMPORARY_FAILURE: "De activatie is tijdelijk niet bereikbaar. Vernieuw de pagina om het opnieuw te proberen.",
});

export function safePortalRoute(value = "") {
  const route = String(value || "").trim();
  if (!SAFE_PORTAL_ROUTE.test(route)) return "";
  try {
    const parsed = new URL(route, "https://portal.invalid");
    return parsed.origin === "https://portal.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "";
  } catch {
    return "";
  }
}

export function canonicalActivationResult(data = {}) {
  const redirectTo = safePortalRoute(data.redirectTo);
  if (data.success !== true
      || data.status !== "activated"
      || data.activationSucceeded !== true
      || data.identityVerified !== true
      || data.customerBindingSucceeded !== true
      || data.invitationActivated !== true
      || !redirectTo
      || !/^[0-9a-f-]{36}$/i.test(String(data.correlationId || ""))) return null;
  return { ...data, redirectTo };
}

export function callbackError(error = {}) {
  const code = Object.prototype.hasOwnProperty.call(CALLBACK_ERRORS, error.code)
    ? error.code
    : "CX2_CALLBACK_TEMPORARY_FAILURE";
  return { code, message: CALLBACK_ERRORS[code], retryable: ["CX2_SESSION_RESTORE_TIMEOUT", "CX2_CALLBACK_TEMPORARY_FAILURE"].includes(code) };
}

export function remainingCooldownSeconds(cooldownEnd, now = Date.now()) {
  const end = Number(cooldownEnd || 0);
  if (!Number.isFinite(end) || end <= now) return 0;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

function sessionFrom(result = {}) {
  return result?.session?.access_token ? result.session : null;
}

export async function waitForVerifiedSession(provider, { timeoutMs = 5000, timers = globalThis } = {}) {
  const fromUrl = await provider.consumeMagicLinkSessionFromUrl();
  const immediate = sessionFrom(fromUrl) || sessionFrom(await provider.getSession());
  if (immediate) return immediate;

  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription = null;
    const finish = (session, error) => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(timeout);
      subscription?.data?.subscription?.unsubscribe?.();
      if (session) resolve(session);
      else reject(Object.assign(new Error("session_restore_timeout"), { code: error || "CX2_SESSION_RESTORE_TIMEOUT" }));
    };
    const timeout = timers.setTimeout(() => finish(null, "CX2_SESSION_RESTORE_TIMEOUT"), Math.max(250, Number(timeoutMs) || 5000));
    subscription = provider.onAuthStateChange((_event, result) => {
      const session = sessionFrom(result);
      if (session) finish(session);
    });
  });
}

export async function completeCallbackFlow({
  state,
  provider,
  completeRequest,
  timeoutMs = 5000,
  timers = globalThis,
} = {}) {
  if (!/^[0-9a-f]{64}$/i.test(String(state || ""))) {
    throw Object.assign(new Error("invalid_callback"), { code: "CX2_ACTIVATION_INVALID" });
  }
  const session = await waitForVerifiedSession(provider, { timeoutMs, timers });
  const raw = await completeRequest(state, session.access_token);
  const result = canonicalActivationResult(raw);
  if (!result) throw Object.assign(new Error("invalid_activation_contract"), { code: "CX2_CALLBACK_TEMPORARY_FAILURE" });
  return result;
}
