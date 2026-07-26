const crypto = require("crypto");
const { clean, correlationId } = require("./_dca-invitation");
const { bodyWithinLimit, isJsonRequest, readSessionCookie, sameOrigin, sha256 } = require("./_dca-exchange");

const STATE = /^[0-9a-f]{64}$/i;
const GENERIC_SENT = "Als dit e-mailadres bij deze uitnodiging hoort, is de magische link verstuurd.";

exports.handler = async (event) => {
  const correlation = correlationId();
  if (event.httpMethod !== "POST") return json(405, { success: false, code: "CX2_METHOD_NOT_ALLOWED", error: "Methode niet toegestaan.", correlationId: correlation });
  if (!sameOrigin(event) || !isJsonRequest(event) || !bodyWithinLimit(event)) return genericError(400, "CX2_ACTIVATION_INVALID", correlation);
  const context = config(process.env);
  if (!context.available) return genericError(503, "CX2_CALLBACK_TEMPORARY_FAILURE", correlation);
  try {
    const input = JSON.parse(event.body || "{}");
    const action = clean(input.action).toLowerCase();
    if (action === "send" || action === "resend") return sendMagicLink(event, context, correlation);
    if (action === "complete") return completeMagicLink(event, context, input, correlation);
    return genericError(400, "CX2_ACTIVATION_INVALID", correlation);
  } catch (error) {
    // Deliberately never log tokens, state, request bodies, e-mail addresses or upstream payloads.
    const code = publicErrorCode(error);
    console.error("CX2 activation stopped", { correlationId: correlation, code, status: Number(error.status || 500) });
    if (code === "CX2_RESEND_COOLDOWN") {
      const cooldown = cooldownWindow(60);
      return json(429, { success: false, code, error: "Wacht nog even voordat je een nieuwe link aanvraagt.", ...cooldown, correlationId: correlation }, { "Retry-After": String(cooldown.retryAfter) });
    }
    return genericError(safeStatus(error, code), code, correlation);
  }
};

async function sendMagicLink(event, context, correlation) {
  const sessionSecret = readSessionCookie(event.headers?.cookie || event.headers?.Cookie, context.environment);
  if (!sessionSecret) return genericError(401, "CX2_SESSION_MISSING", correlation);
  const rawState = crypto.randomBytes(32).toString("hex");
  const prepared = first(await rpc(context, "cx2_prepare_magic_link", {
    input_session_hash: sha256(sessionSecret),
    input_state_hash: sha256(rawState),
    input_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }).catch((error) => {
    if (/cooldown/i.test(clean(error.message))) error.code = "CX2_RESEND_COOLDOWN";
    throw error;
  }));
  if (!prepared?.challenge_id || !prepared.intended_email) return genericError(400, "CX2_ACTIVATION_INVALID", correlation);

  const redirectTo = callbackUrl(event, context, rawState);
  if (!redirectTo) throw fault("CX2_REDIRECT_REJECTED", 400);
  if (!context.suppressEmail) {
    const response = await context.fetchImpl(`${context.supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      headers: { apikey: context.anonKey, Authorization: `Bearer ${context.anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: prepared.intended_email, create_user: false }),
    });
    if (!response.ok) throw fault("CX2_AUTH_PROVIDER_REJECTED", response.status >= 500 ? 502 : 400);
  }
  await rpc(context, "cx2_mark_magic_link_sent", { input_challenge_id: prepared.challenge_id });
  const cooldown = cooldownWindow(Number(prepared.resend_after_seconds || 60));
  return json(202, {
    success: true,
    message: GENERIC_SENT,
    maskedEmail: maskEmail(prepared.intended_email),
    resendAfter: cooldown.retryAfter,
    cooldownEndsAt: cooldown.cooldownEndsAt,
    deliverySuppressed: context.suppressEmail,
    correlationId: correlation,
  });
}

async function completeMagicLink(event, context, input, correlation) {
  const rawState = clean(input.state).toLowerCase();
  if (!STATE.test(rawState)) return genericError(400, "CX2_ACTIVATION_INVALID", correlation);
  const accessToken = bearer(event.headers?.authorization || event.headers?.Authorization);
  if (!accessToken) return genericError(401, "CX2_SESSION_MISSING", correlation);
  const userResponse = await context.fetchImpl(`${context.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: context.anonKey, Authorization: `Bearer ${accessToken}` },
  });
  const user = await userResponse.json().catch(() => ({}));
  if (!userResponse.ok || !user?.id || !user?.email_confirmed_at) return genericError(401, "CX2_SESSION_MISSING", correlation);
  const inputBody = { input_state_hash: sha256(rawState), input_auth_user_id: user.id };
  let completed;
  let recovered = false;
  try {
    completed = first(await rpc(context, "cx2_complete_magic_link", inputBody));
  } catch (_initialError) {
    recovered = true;
    completed = first(await rpc(context, "cx2_resolve_magic_link_completion", inputBody));
  }
  if (!completed?.customer_id || !safePortalPath(completed.portal_path)) return genericError(400, "CX2_OWNERSHIP_AMBIGUOUS", correlation);
  return json(200, {
    success: true,
    status: "activated",
    activationSucceeded: true,
    identityVerified: true,
    customerBindingSucceeded: true,
    invitationActivated: true,
    replayRecovered: recovered,
    firstName: firstName(user.user_metadata?.name || user.user_metadata?.full_name || "daar"),
    redirectTo: completed.portal_path,
    correlationId: correlation,
  });
}

function callbackUrl(event, context, state) {
  const origin = requestOrigin(event);
  if (!origin || !context.allowedOrigins.has(origin)) return "";
  const url = new URL("/start", origin);
  url.searchParams.set("cx2", "callback");
  url.searchParams.set("state", state);
  return url.toString();
}
function requestOrigin(event) {
  const proto = clean(event.headers?.["x-forwarded-proto"] || "https").split(",")[0];
  const host = clean(event.headers?.["x-forwarded-host"] || event.headers?.host).split(",")[0].toLowerCase();
  if (proto !== "https" || !/^[a-z0-9.-]+(?::\d+)?$/.test(host)) return "";
  return `https://${host}`;
}
function config(env = {}, fetchImpl = global.fetch) {
  const supabaseUrl = clean(env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = clean(env.SUPABASE_ANON_KEY);
  const environment = clean(env.APP_ENV || env.APP_ENVIRONMENT || "staging").toLowerCase();
  const origins = clean(env.CX2_AUTH_REDIRECT_ORIGINS || env.DEPLOY_PRIME_URL || env.URL || env.SITE_URL)
    .split(",").map((value) => value.trim()).filter(Boolean);
  const allowedOrigins = new Set(origins.map(normalizeOrigin).filter(Boolean));
  const suppressEmail = clean(env.CX2_MAGIC_LINK_SUPPRESS_EMAIL).toLowerCase() !== "false";
  return { supabaseUrl, serviceRoleKey, anonKey, environment, allowedOrigins, suppressEmail, fetchImpl,
    available: Boolean(supabaseUrl && serviceRoleKey && anonKey && allowedOrigins.size) };
}
function normalizeOrigin(value) { try { const url = new URL(value); return url.protocol === "https:" ? url.origin : ""; } catch { return ""; } }
async function rpc(context, name, body) {
  const response = await context.fetchImpl(`${context.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: context.serviceRoleKey, Authorization: `Bearer ${context.serviceRoleKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(clean(payload?.message || "CX2 RPC failed")), { status: response.status, code: clean(payload?.code) });
  return payload;
}
function maskEmail(value = "") { const [local, domain] = clean(value).split("@"); if (!local || !domain) return "j***@***"; return `${local.slice(0, 1)}${"*".repeat(Math.min(5, Math.max(3, local.length - 1)))}@${domain}`; }
function bearer(value = "") { const match = clean(value).match(/^Bearer\s+([^\s]+)$/i); return match?.[1] || ""; }
function safePortalPath(value = "") { try { const url = new URL(clean(value), "https://portal.invalid"); return url.origin === "https://portal.invalid" && /^\/(?:klantportaal|client-dashboard)\.html/.test(url.pathname); } catch { return false; } }
function first(value) { return Array.isArray(value) ? value[0] || null : value || null; }
function firstName(value = "") { return clean(value).split(/\s+/)[0] || "daar"; }
function fault(code, status) { return Object.assign(new Error(code), { code, status }); }
function cooldownWindow(seconds = 60, now = Date.now()) {
  const retryAfter = Math.max(1, Math.min(3600, Number(seconds) || 60));
  return { retryAfter, cooldownEndsAt: new Date(now + retryAfter * 1000).toISOString() };
}
function publicErrorCode(error = {}) {
  const explicit = clean(error.code);
  if (explicit === "CX2_RESEND_COOLDOWN") return explicit;
  const message = clean(error.message).toLowerCase();
  if (/expired/.test(message)) return "CX2_ACTIVATION_EXPIRED";
  if (/revoked/.test(message)) return "CX2_ACTIVATION_REVOKED";
  if (/identity|verified identity/.test(message)) return "CX2_IDENTITY_MISMATCH";
  if (/ambiguous|ownership/.test(message)) return "CX2_OWNERSHIP_AMBIGUOUS";
  if (/invalid|not completed|no longer active/.test(message)) return "CX2_ACTIVATION_INVALID";
  return "CX2_CALLBACK_TEMPORARY_FAILURE";
}
function safeStatus(error, code) {
  if (code === "CX2_SESSION_MISSING") return 401;
  if (["CX2_IDENTITY_MISMATCH", "CX2_OWNERSHIP_AMBIGUOUS"].includes(code)) return 403;
  if (code === "CX2_CALLBACK_TEMPORARY_FAILURE") return Number(error?.status || 0) >= 500 ? 503 : 409;
  return 400;
}
function genericError(statusCode = 400, code = "CX2_CALLBACK_TEMPORARY_FAILURE", correlation = correlationId()) {
  const messages = {
    CX2_ACTIVATION_INVALID: "Deze activatielink is ongeldig. Vraag Max Webstudio om een nieuwe link.",
    CX2_ACTIVATION_EXPIRED: "Deze activatielink is verlopen. Vraag Max Webstudio om een nieuwe link.",
    CX2_ACTIVATION_REVOKED: "Deze activatielink is ingetrokken. Vraag Max Webstudio om een nieuwe link.",
    CX2_IDENTITY_MISMATCH: "Deze link hoort niet bij het ingelogde account.",
    CX2_OWNERSHIP_AMBIGUOUS: "Deze klantomgeving kon niet veilig worden gekoppeld.",
    CX2_SESSION_MISSING: "Je veilige sessie ontbreekt of is verlopen.",
    CX2_CALLBACK_TEMPORARY_FAILURE: "Accountactivatie is tijdelijk niet bereikbaar. Probeer het opnieuw.",
  };
  return json(statusCode, { success: false, code, error: messages[code] || messages.CX2_CALLBACK_TEMPORARY_FAILURE, correlationId: correlation });
}
function json(statusCode, body, extraHeaders = {}) { return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", ...extraHeaders }, body: JSON.stringify(body) }; }

exports._private = { bearer, callbackUrl, config, cooldownWindow, maskEmail, normalizeOrigin, publicErrorCode, requestOrigin, safePortalPath };
