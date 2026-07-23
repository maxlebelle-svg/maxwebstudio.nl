const crypto = require("crypto");
const net = require("net");

const ABUSE_SCOPE = "public_lead_intake_v1";
const HMAC_SECRET_MIN_BYTES = 32;
const LIMITER_TIMEOUT_MS = 3000;

function prepareAbuseControlRequest(event = {}, idempotencyKey = "", env = process.env) {
  const currentSecret = requireSecret(env.LEAD_ABUSE_HMAC_SECRET, "LEAD_ABUSE_HMAC_SECRET");
  const previousSecret = cleanText(env.LEAD_ABUSE_HMAC_SECRET_PREVIOUS);
  if (previousSecret && Buffer.byteLength(previousSecret, "utf8") < HMAC_SECRET_MIN_BYTES) {
    throw configurationError("LEAD_ABUSE_HMAC_SECRET_PREVIOUS is te kort.");
  }
  if (previousSecret && timingSafeEqualText(previousSecret, currentSecret)) {
    throw configurationError("De huidige en vorige abuse-controlsecret moeten verschillen.");
  }

  const opaqueKey = cleanText(idempotencyKey);
  if (!/^lead-intake:v1:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(opaqueKey)) {
    const error = new Error("Ongeldige intake-referentie.");
    error.code = "ABUSE_IDEMPOTENCY_INVALID";
    error.statusCode = 400;
    throw error;
  }

  const networkPrefix = coarsenTrustedClientIp(trustedClientIp(event));
  if (!networkPrefix) {
    const error = new Error("Aanvraagbeveiliging is tijdelijk niet beschikbaar.");
    error.code = "ABUSE_FINGERPRINT_UNAVAILABLE";
    error.statusCode = 503;
    throw error;
  }
  const userAgentClass = classifyUserAgent(header(event, "user-agent"));
  const fingerprintMaterial = `lead-abuse:fingerprint:v1|${networkPrefix}|${userAgentClass}`;
  const idempotencyMaterial = `lead-abuse:idempotency:v1|${opaqueKey}`;

  return {
    scope: ABUSE_SCOPE,
    fingerprintHmac: hmac(currentSecret, fingerprintMaterial),
    previousFingerprintHmac: previousSecret ? hmac(previousSecret, fingerprintMaterial) : null,
    idempotencyHmac: hmac(currentSecret, idempotencyMaterial),
    previousIdempotencyHmac: previousSecret ? hmac(previousSecret, idempotencyMaterial) : null,
    requestReference: hmac(currentSecret, `lead-abuse:request-reference:v1|${opaqueKey}`).slice(0, 24),
  };
}

async function checkLeadIntakeAbuse(options = {}) {
  const supabaseUrl = cleanText(options.supabaseUrl).replace(/\/$/, "");
  const serviceRoleKey = cleanText(options.serviceRoleKey);
  const references = options.references || {};
  const fetchImpl = options.fetchImpl || fetch;
  if (!supabaseUrl || !serviceRoleKey) throw configurationError("Supabase-configuratie voor abuse-control ontbreekt.");

  let response;
  try {
    response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/mws_check_lead_intake_abuse_v1`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Profile": "public",
        "Content-Profile": "public",
      },
      body: JSON.stringify({
        p_scope: references.scope,
        p_fingerprint_hmac: references.fingerprintHmac,
        p_idempotency_hmac: references.idempotencyHmac,
        p_previous_fingerprint_hmac: references.previousFingerprintHmac || null,
        p_previous_idempotency_hmac: references.previousIdempotencyHmac || null,
      }),
      signal: options.signal || AbortSignal.timeout(LIMITER_TIMEOUT_MS),
    });
  } catch (cause) {
    const error = new Error("Aanvraagbeveiliging is tijdelijk niet beschikbaar.");
    error.code = cause?.name === "TimeoutError" || cause?.name === "AbortError" ? "ABUSE_LIMITER_TIMEOUT" : "ABUSE_LIMITER_UNAVAILABLE";
    error.statusCode = 503;
    throw error;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !validDecision(data)) {
    const error = new Error("Aanvraagbeveiliging is tijdelijk niet beschikbaar.");
    error.code = "ABUSE_LIMITER_INVALID_RESPONSE";
    error.statusCode = 503;
    throw error;
  }
  return data;
}

async function runLeadIntakeAbuseGate(options = {}) {
  if (typeof options.onAllowed !== "function") throw configurationError("Abuse-control vervolgactie ontbreekt.");
  const decision = await checkLeadIntakeAbuse(options);
  if (!decision.allowed) {
    const limited = decision.decision === "short_window_limited" || decision.decision === "daily_window_limited";
    const error = new Error(limited ? "Te veel aanvragen. Probeer het later opnieuw." : "Deze aanvraag kan niet worden verwerkt.");
    error.code = limited ? "ABUSE_RATE_LIMITED" : "ABUSE_IDEMPOTENCY_CONFLICT";
    error.statusCode = limited ? 429 : 409;
    error.retryAfterSeconds = limited ? decision.retryAfterSeconds : null;
    throw error;
  }
  return options.onAllowed(decision);
}

function trustedClientIp(event = {}) {
  return cleanText(header(event, "x-nf-client-connection-ip") || event.ip);
}

function coarsenTrustedClientIp(value) {
  const raw = cleanText(value).replace(/^\[|\]$/g, "").split("%")[0];
  const version = net.isIP(raw);
  if (version === 4) {
    const parts = raw.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (version === 6) {
    const expanded = expandIpv6(raw);
    if (!expanded) return "";
    const fourthHighByte = (parseInt(expanded[3], 16) >> 8).toString(16).padStart(2, "0");
    return `${expanded[0]}:${expanded[1]}:${expanded[2]}:${fourthHighByte}00::/56`;
  }
  return "";
}

function expandIpv6(value) {
  let source = value.toLowerCase();
  if (source.includes(".")) {
    const lastColon = source.lastIndexOf(":");
    const ipv4 = source.slice(lastColon + 1).split(".").map(Number);
    if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    source = `${source.slice(0, lastColon)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }
  const halves = source.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = [...left, ...Array(missing).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => part.padStart(4, "0"));
}

function classifyUserAgent(value) {
  const ua = cleanText(value).toLowerCase();
  const device = /mobile|android|iphone|ipad/.test(ua) ? "mobile" : "desktop";
  let family = "other";
  if (/bot|crawler|spider|headless/.test(ua)) family = "automation";
  else if (/edg\//.test(ua)) family = "edge";
  else if (/firefox\//.test(ua)) family = "firefox";
  else if (/chrome\//.test(ua) || /crios\//.test(ua)) family = "chrome";
  else if (/safari\//.test(ua)) family = "safari";
  return `${family}:${device}`;
}

function validDecision(value) {
  if (!value || value.version !== 1 || typeof value.allowed !== "boolean"
    || typeof value.replay !== "boolean" || typeof value.uniqueCounted !== "boolean") return false;
  const shapes = {
    unique_allowed: [true, false, true],
    replay_allowed: [true, true, false],
    idempotency_fingerprint_conflict: [false, false, false],
    short_window_limited: [false, false, false],
    daily_window_limited: [false, false, false],
  };
  const expected = shapes[value.decision];
  return Boolean(expected && value.allowed === expected[0] && value.replay === expected[1]
    && value.uniqueCounted === expected[2]
    && Number.isInteger(value.retryAfterSeconds) && value.retryAfterSeconds >= 0);
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function header(event, name) {
  const headers = event.headers || {};
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => String(key).toLowerCase() === target);
  return entry ? entry[1] : "";
}

function requireSecret(value, label) {
  const secret = cleanText(value);
  if (Buffer.byteLength(secret, "utf8") < HMAC_SECRET_MIN_BYTES) throw configurationError(`${label} ontbreekt of is te kort.`);
  return secret;
}

function configurationError(message) {
  const error = new Error(message);
  error.code = "ABUSE_LIMITER_CONFIG_INVALID";
  error.statusCode = 503;
  return error;
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cleanText(value) {
  return String(value || "").trim();
}

module.exports = {
  ABUSE_SCOPE,
  checkLeadIntakeAbuse,
  prepareAbuseControlRequest,
  runLeadIntakeAbuseGate,
  _private: { classifyUserAgent, coarsenTrustedClientIp, expandIpv6, validDecision },
};
