const crypto = require("crypto");

const SESSION_PATTERN = /^[0-9a-f]{64}$/;
const MAX_BODY_BYTES = 1024;
const SESSION_MAX_AGE_SECONDS = 15 * 60;

function clean(value = "") {
  return String(value || "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function sessionSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function cookieName(environment = "") {
  return ["production", "prod"].includes(clean(environment).toLowerCase())
    ? "__Host-mws_activation"
    : "__Host-mws_activation_staging";
}

function sessionCookie(secret, environment, maxAge = SESSION_MAX_AGE_SECONDS) {
  if (!SESSION_PATTERN.test(clean(secret))) throw new Error("Invalid exchange session secret");
  return `${cookieName(environment)}=${secret}; Path=/; Max-Age=${Math.max(1, Math.min(Number(maxAge) || 0, SESSION_MAX_AGE_SECONDS))}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie(environment) {
  return `${cookieName(environment)}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function readSessionCookie(header, environment) {
  const target = `${cookieName(environment)}=`;
  for (const part of clean(header).split(";")) {
    const value = part.trim();
    if (value.startsWith(target)) {
      const secret = value.slice(target.length);
      return SESSION_PATTERN.test(secret) ? secret : "";
    }
  }
  return "";
}

function expectedRequestOrigin(event = {}) {
  const headers = event.headers || {};
  const host = clean(headers["x-forwarded-host"] || headers["X-Forwarded-Host"] || headers.host || headers.Host).split(",")[0];
  const protocol = clean(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "https").split(",")[0].toLowerCase();
  if (!host || protocol !== "https") return "";
  return `https://${host}`;
}

function sameOrigin(event = {}) {
  const expected = expectedRequestOrigin(event);
  const supplied = clean(event.headers?.origin || event.headers?.Origin);
  if (!expected || !supplied) return false;
  try {
    return new URL(supplied).origin === expected;
  } catch {
    return false;
  }
}

function isJsonRequest(event = {}) {
  const contentType = clean(event.headers?.["content-type"] || event.headers?.["Content-Type"]).toLowerCase();
  return contentType === "application/json" || contentType.startsWith("application/json;");
}

function bodyWithinLimit(event = {}) {
  return Buffer.byteLength(String(event.body || ""), event.isBase64Encoded ? "base64" : "utf8") <= MAX_BODY_BYTES;
}

function clientRateKey(event = {}, rateSecret = "") {
  const secret = clean(rateSecret);
  if (secret.length < 32) return "";
  const headers = event.headers || {};
  const client = clean(headers["x-nf-client-connection-ip"] || headers["X-Nf-Client-Connection-Ip"] || headers["x-forwarded-for"] || "unknown").split(",")[0];
  return crypto.createHmac("sha256", secret).update(`dca1-exchange:${client}`).digest("hex");
}

module.exports = {
  MAX_BODY_BYTES,
  SESSION_MAX_AGE_SECONDS,
  SESSION_PATTERN,
  bodyWithinLimit,
  clearSessionCookie,
  clientRateKey,
  cookieName,
  expectedRequestOrigin,
  isJsonRequest,
  readSessionCookie,
  sameOrigin,
  sessionCookie,
  sessionSecret,
  sha256,
};
