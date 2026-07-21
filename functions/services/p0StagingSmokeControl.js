const crypto = require("crypto");

const MODE_SUPPRESS = "suppress";
const AUTH_HEADER = "x-mws-p0-smoke-auth";
const SECRET_MIN_BYTES = 32;
const MAX_CLOCK_SKEW_SECONDS = 300;
const STAGING_SITE_ID = "67b2b8af-83fc-4c61-9cd8-2f78842b7615";
const STAGING_SUPABASE_PROJECT_ID = "xlxpuuycigeqhgxqtzni";

function resolveP0StagingSmokeControl({ event = {}, rawBody = "", env = process.env, now = Date.now } = {}) {
  const mode = cleanText(env.OUTBOUND_PROVIDER_MODE).toLowerCase();
  const authorization = readHeader(event, AUTH_HEADER);

  if (mode && mode !== MODE_SUPPRESS) throw smokeError("SMOKE_MODE_INVALID", 503);

  if (mode !== MODE_SUPPRESS) {
    if (authorization) throw smokeError("SMOKE_MODE_NOT_ENABLED", 403);
    return normalControl();
  }

  assertLockedStagingTarget(env);
  const secret = requireSecret(env.P0_STAGING_SMOKE_HMAC_SECRET);
  if (!authorization) return normalControl();

  verifyAuthorization({ authorization, rawBody, secret, now });
  return Object.freeze({
    suppressProviders: true,
    mode: MODE_SUPPRESS,
    reason: "staging_smoke",
    provider: "resend",
    target: "maxwebstudio-staging",
  });
}

function createOutboundEmailSender(control, sendEmail, logger = console) {
  if (!control?.suppressProviders) return sendEmail;
  return async (input = {}) => {
    const result = Object.freeze({
      sent: false,
      suppressed: true,
      provider: "resend",
      reason: "staging_smoke",
      deliveryJobCreated: false,
      retryScheduled: false,
    });
    if (typeof logger?.info === "function") {
      logger.info("outbound_provider_suppressed", {
        provider: result.provider,
        reason: result.reason,
        templateKey: safeLabel(input.templateKey || input.template_key),
        deliveryJobCreated: false,
        retryScheduled: false,
      });
    }
    return result;
  };
}

function signSmokeAuthorization({ rawBody = "", secret, timestamp = Math.floor(Date.now() / 1000), nonce } = {}) {
  const safeSecret = requireSecret(secret);
  const safeNonce = cleanText(nonce);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(safeNonce)) throw smokeError("SMOKE_NONCE_INVALID", 403);
  const safeTimestamp = Number(timestamp);
  if (!Number.isSafeInteger(safeTimestamp) || safeTimestamp <= 0) throw smokeError("SMOKE_TIMESTAMP_INVALID", 403);
  const signature = crypto.createHmac("sha256", safeSecret)
    .update(signaturePayload(safeTimestamp, safeNonce, rawBody))
    .digest("hex");
  return `v1:${safeTimestamp}:${safeNonce}:${signature}`;
}

function verifyAuthorization({ authorization, rawBody, secret, now }) {
  const match = /^v1:([0-9]{10}):([A-Za-z0-9_-]{16,64}):([0-9a-f]{64})$/.exec(cleanText(authorization));
  if (!match) throw smokeError("SMOKE_AUTH_INVALID", 403);
  const timestamp = Number(match[1]);
  const currentSeconds = Math.floor(Number(now()) / 1000);
  if (!Number.isSafeInteger(currentSeconds) || Math.abs(currentSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    throw smokeError("SMOKE_AUTH_EXPIRED", 403);
  }
  const expected = signSmokeAuthorization({ rawBody, secret, timestamp, nonce: match[2] }).split(":").pop();
  if (!timingSafeEqualHex(expected, match[3])) throw smokeError("SMOKE_AUTH_INVALID", 403);
}

function signaturePayload(timestamp, nonce, rawBody) {
  const bodyHash = crypto.createHash("sha256").update(String(rawBody || ""), "utf8").digest("hex");
  return `p0-staging-smoke:v1\n${timestamp}\n${nonce}\n${bodyHash}`;
}

function assertLockedStagingTarget(env) {
  if (cleanText(env.SITE_ID) !== STAGING_SITE_ID
    || cleanText(env.SUPABASE_PROJECT_ID) !== STAGING_SUPABASE_PROJECT_ID) {
    throw smokeError("SMOKE_TARGET_REFUSED", 503);
  }
}

function requireSecret(value) {
  const secret = cleanText(value);
  if (Buffer.byteLength(secret, "utf8") < SECRET_MIN_BYTES) throw smokeError("SMOKE_SECRET_INVALID", 503);
  return secret;
}

function readHeader(event, name) {
  const headers = event.headers || {};
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => String(key).toLowerCase() === target);
  return cleanText(entry?.[1]);
}

function timingSafeEqualHex(left, right) {
  const a = Buffer.from(cleanText(left), "hex");
  const b = Buffer.from(cleanText(right), "hex");
  return a.length === 32 && b.length === 32 && crypto.timingSafeEqual(a, b);
}

function normalControl() {
  return Object.freeze({ suppressProviders: false, mode: "normal", reason: "", provider: "" });
}

function smokeError(code, statusCode) {
  const error = new Error("Staging-smokeverificatie is niet beschikbaar.");
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function cleanText(value) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function safeLabel(value) { return cleanText(value).replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80); }

module.exports = {
  AUTH_HEADER,
  createOutboundEmailSender,
  resolveP0StagingSmokeControl,
  signSmokeAuthorization,
  _private: {
    MAX_CLOCK_SKEW_SECONDS,
    STAGING_SITE_ID,
    STAGING_SUPABASE_PROJECT_ID,
    signaturePayload,
  },
};
