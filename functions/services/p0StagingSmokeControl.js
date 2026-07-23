const crypto = require("crypto");

const MODE_SUPPRESS = "suppress";
const AUTH_HEADER = "x-mws-p0-smoke-auth";
const ROTATION_HEADER = "x-mws-p0-smoke-rotation";
const SECRET_PROOF_HEADER = "x-mws-p0-smoke-secret-proof";
const BODY_PROOF_HEADER = "x-mws-p0-smoke-body-proof";
const SECRET_MIN_BYTES = 32;
const MAX_CLOCK_SKEW_SECONDS = 300;
const NONCE_TIMEOUT_MS = 3000;
const SMOKE_SCOPE = "p0_staging_smoke_v1";
const STAGING_SITE_ID = "67b2b8af-83fc-4c61-9cd8-2f78842b7615";
const STAGING_SUPABASE_PROJECT_ID = "xlxpuuycigeqhgxqtzni";
const STAGING_TARGET_BINDING = "9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e";
const ROTATION_PATTERN = /^rot_[0-9a-f]{32}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const PROOF_PATTERN = /^[0-9a-f]{32}$/;

async function resolveP0StagingSmokeControl({
  event = {}, rawBody = "", env = process.env, now = Date.now, fetchImpl = fetch, signal, logger = console,
} = {}) {
  const mode = cleanText(env.OUTBOUND_PROVIDER_MODE).toLowerCase();
  if (mode && mode !== MODE_SUPPRESS) throw smokeError("SMOKE_MODE_INVALID", 503, diagnostics("stagingMode", { modeAccepted: false }));
  if (mode !== MODE_SUPPRESS) {
    if (readHeader(event, AUTH_HEADER)) throw smokeError("SMOKE_MODE_NOT_ENABLED", 403, diagnostics("stagingMode", { modeAccepted: false }));
    return normalControl();
  }

  assertLockedStagingTarget(env);
  const secret = requireSecret(env.P0_STAGING_SMOKE_HMAC_SECRET);
  const runtimeRotationId = requireRotationId(env.P0_STAGING_SMOKE_ROTATION_ID);
  const verified = verifyAuthorization({ event, rawBody, secret, runtimeRotationId, now });
  const verifiedDiagnostics = diagnostics("signature", {
    headerParsed: true,
    protocolAccepted: true,
    timestampStatus: "pass",
    nonceShapeValid: true,
    targetStatus: "pass",
    secretVersionStatus: "pass",
    bodyStatus: "pass",
    signatureStatus: "pass",
    protocolVersion: "v1",
    signedTimestamp: verified.timestamp,
    rotationId: runtimeRotationId,
    secretVersionProof: verified.secretVersionProof,
    bodyProof: verified.bodyProof,
    nonceProof: verified.nonceProof,
  });

  let decision;
  try {
    decision = await consumeNonce({
      env,
      fetchImpl,
      signal,
      nonceFingerprint: sha256(`p0-staging-smoke:nonce:v1\n${verified.nonce}`),
      requestBinding: sha256(signaturePayload(verified.timestamp, verified.nonce, rawBody)),
    });
  } catch (error) {
    if (error?.code && /^SMOKE_NONCE_/.test(error.code)) {
      throw smokeError("SMOKE_AUTH_INTERNAL_FAILURE", 503, { ...verifiedDiagnostics, validationStage: "nonceConsumption", internalComponent: safeInternalComponent(error.code) });
    }
    throw smokeError("SMOKE_AUTH_INTERNAL_FAILURE", 503, { ...verifiedDiagnostics, validationStage: "nonceConsumption", internalComponent: "unexpected" });
  }
  if (!decision.consumed) {
    throw smokeError(
      decision.decision === "replay" ? "SMOKE_AUTH_REPLAY" : "SMOKE_AUTH_BINDING_CONFLICT",
      403,
      { ...verifiedDiagnostics, validationStage: "nonceConsumption", nonceDecision: decision.decision },
    );
  }
  if (typeof logger?.info === "function") {
    logger.info("p0_smoke_auth_validation", { ...verifiedDiagnostics, validationStage: "nonceConsumption", nonceDecision: "consumed" });
  }
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
    const result = Object.freeze({ sent: false, suppressed: true, provider: "resend", reason: "staging_smoke", deliveryJobCreated: false, retryScheduled: false });
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

function buildSmokeAuthorization({ rawBody = "", secret, rotationId, timestamp = Math.floor(Date.now() / 1000), nonce } = {}) {
  const safeSecret = requireSecret(secret);
  const safeRotationId = requireRotationId(rotationId);
  const safeNonce = cleanText(nonce);
  if (!NONCE_PATTERN.test(safeNonce)) throw smokeError("SMOKE_AUTH_NONCE_INVALID", 403, diagnostics("nonce", { nonceShapeValid: false }));
  const safeTimestamp = Number(timestamp);
  if (!Number.isSafeInteger(safeTimestamp) || safeTimestamp <= 0 || String(safeTimestamp).length !== 10) {
    throw smokeError("SMOKE_AUTH_TIMESTAMP_INVALID", 403, diagnostics("timestamp", { timestampStatus: "invalid" }));
  }
  const signature = hmacHex(safeSecret, signaturePayload(safeTimestamp, safeNonce, rawBody));
  const secretVersionProof = diagnosticProof(safeSecret, `secret-version\n${safeRotationId}\n${STAGING_TARGET_BINDING}`);
  const bodyProof = diagnosticProof(safeSecret, bodyProofPayload(safeRotationId, safeTimestamp, safeNonce, rawBody));
  const nonceProof = diagnosticProof(safeSecret, `nonce-correlation\n${safeRotationId}\n${safeNonce}`);
  return Object.freeze({
    authorization: `v1:${safeTimestamp}:${safeNonce}:${signature}`,
    headers: Object.freeze({
      [AUTH_HEADER]: `v1:${safeTimestamp}:${safeNonce}:${signature}`,
      [ROTATION_HEADER]: safeRotationId,
      [SECRET_PROOF_HEADER]: secretVersionProof,
      [BODY_PROOF_HEADER]: bodyProof,
    }),
    evidence: Object.freeze({
      protocolVersion: "v1",
      timestamp: safeTimestamp,
      nonceShapeValid: true,
      targetBinding: STAGING_TARGET_BINDING,
      rotationId: safeRotationId,
      secretVersionProof,
      bodyProof,
      nonceProof,
    }),
  });
}

function signSmokeAuthorization(options = {}) {
  return buildSmokeAuthorization(options).authorization;
}

function verifyAuthorization({ event, rawBody, secret, runtimeRotationId, now }) {
  const authorization = readHeader(event, AUTH_HEADER);
  if (!authorization) throw smokeError("SMOKE_AUTH_HEADER_MISSING", 403, diagnostics("header", { headerParsed: false }));

  const parts = authorization.split(":");
  if (parts.length !== 4) throw smokeError("SMOKE_AUTH_FORMAT_INVALID", 403, diagnostics("header", { headerParsed: false }));
  if (parts[0] !== "v1") throw smokeError("SMOKE_AUTH_VERSION_INVALID", 403, diagnostics("protocolVersion", { headerParsed: true, protocolAccepted: false }));
  if (!/^[0-9]{10}$/.test(parts[1])) throw smokeError("SMOKE_AUTH_TIMESTAMP_INVALID", 403, diagnostics("timestamp", { headerParsed: true, protocolAccepted: true, timestampStatus: "invalid" }));
  if (!NONCE_PATTERN.test(parts[2])) throw smokeError("SMOKE_AUTH_NONCE_INVALID", 403, diagnostics("nonce", { headerParsed: true, protocolAccepted: true, timestampStatus: "parsed", nonceShapeValid: false }));
  if (!SIGNATURE_PATTERN.test(parts[3])) throw smokeError("SMOKE_AUTH_FORMAT_INVALID", 403, diagnostics("signatureFormat", { headerParsed: true, protocolAccepted: true, timestampStatus: "parsed", nonceShapeValid: true, signatureStatus: "invalid_format" }));

  const timestamp = Number(parts[1]);
  const currentSeconds = Math.floor(Number(now()) / 1000);
  if (!Number.isSafeInteger(currentSeconds) || Math.abs(currentSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    throw smokeError("SMOKE_AUTH_EXPIRED", 403, diagnostics("timestampWindow", { headerParsed: true, protocolAccepted: true, timestampStatus: "expired", nonceShapeValid: true }));
  }

  const clientRotationId = readHeader(event, ROTATION_HEADER);
  const clientSecretProof = readHeader(event, SECRET_PROOF_HEADER);
  const clientBodyProof = readHeader(event, BODY_PROOF_HEADER);
  if (!clientRotationId || !clientSecretProof || !clientBodyProof) {
    throw smokeError("SMOKE_AUTH_HEADER_MISSING", 403, diagnostics("diagnosticHeaders", { headerParsed: true, protocolAccepted: true, timestampStatus: "pass", nonceShapeValid: true }));
  }
  if (!ROTATION_PATTERN.test(clientRotationId) || !PROOF_PATTERN.test(clientSecretProof) || !PROOF_PATTERN.test(clientBodyProof)) {
    throw smokeError("SMOKE_AUTH_FORMAT_INVALID", 403, diagnostics("diagnosticHeaders", { headerParsed: true, protocolAccepted: true, timestampStatus: "pass", nonceShapeValid: true }));
  }

  const serverSecretProof = diagnosticProof(secret, `secret-version\n${runtimeRotationId}\n${STAGING_TARGET_BINDING}`);
  const serverNonceProof = diagnosticProof(secret, `nonce-correlation\n${runtimeRotationId}\n${parts[2]}`);
  if (!timingSafeEqualText(clientRotationId, runtimeRotationId) || !timingSafeEqualProof(clientSecretProof, serverSecretProof)) {
    throw smokeError("SMOKE_AUTH_SECRET_VERSION_MISMATCH", 403, diagnostics("secretVersion", {
      headerParsed: true, protocolAccepted: true, timestampStatus: "pass", nonceShapeValid: true,
      targetStatus: "pass", secretVersionStatus: "mismatch", rotationId: runtimeRotationId,
      secretVersionProof: serverSecretProof, nonceProof: serverNonceProof,
    }));
  }

  const serverBodyProof = diagnosticProof(secret, bodyProofPayload(runtimeRotationId, timestamp, parts[2], rawBody));
  if (!timingSafeEqualProof(clientBodyProof, serverBodyProof)) {
    throw smokeError("SMOKE_AUTH_BODY_MISMATCH", 403, diagnostics("bodyDigest", {
      headerParsed: true, protocolAccepted: true, timestampStatus: "pass", nonceShapeValid: true,
      targetStatus: "pass", secretVersionStatus: "pass", bodyStatus: "mismatch",
      rotationId: runtimeRotationId, secretVersionProof: serverSecretProof, bodyProof: serverBodyProof, nonceProof: serverNonceProof,
    }));
  }

  const expected = hmacHex(secret, signaturePayload(timestamp, parts[2], rawBody));
  if (!timingSafeEqualHex(expected, parts[3])) {
    throw smokeError("SMOKE_AUTH_SIGNATURE_INVALID", 403, diagnostics("signature", {
      headerParsed: true, protocolAccepted: true, timestampStatus: "pass", nonceShapeValid: true,
      targetStatus: "pass", secretVersionStatus: "pass", bodyStatus: "pass", signatureStatus: "mismatch",
      rotationId: runtimeRotationId, secretVersionProof: serverSecretProof, bodyProof: serverBodyProof, nonceProof: serverNonceProof,
    }));
  }
  return Object.freeze({ timestamp, nonce: parts[2], secretVersionProof: serverSecretProof, bodyProof: serverBodyProof, nonceProof: serverNonceProof });
}

function signaturePayload(timestamp, nonce, rawBody) {
  const bodyHash = sha256(String(rawBody || ""));
  return `p0-staging-smoke:v1\n${timestamp}\n${nonce}\n${STAGING_SITE_ID}\n${STAGING_SUPABASE_PROJECT_ID}\n${bodyHash}`;
}

function bodyProofPayload(rotationId, timestamp, nonce, rawBody) {
  return `diagnostic-body:v1\n${rotationId}\n${timestamp}\n${nonce}\n${STAGING_TARGET_BINDING}\n${sha256(String(rawBody || ""))}`;
}

function diagnosticProof(secret, value) {
  return hmacHex(secret, `p0-staging-smoke:diagnostic:v1\n${value}`).slice(0, 32);
}

async function consumeNonce({ env, fetchImpl, signal, nonceFingerprint, requestBinding }) {
  const supabaseUrl = cleanText(env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) throw nonceError("SMOKE_NONCE_CONFIG_INVALID");
  let response;
  try {
    response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/mws_consume_p0_staging_smoke_nonce_v1`, {
      method: "POST",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" },
      body: JSON.stringify({ p_scope: SMOKE_SCOPE, p_nonce_fingerprint: nonceFingerprint, p_request_binding: requestBinding, p_target_binding: STAGING_TARGET_BINDING }),
      signal: signal || AbortSignal.timeout(NONCE_TIMEOUT_MS),
    });
  } catch (cause) {
    throw nonceError(cause?.name === "TimeoutError" || cause?.name === "AbortError" ? "SMOKE_NONCE_TIMEOUT" : "SMOKE_NONCE_UNAVAILABLE");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !validNonceDecision(data)) throw nonceError("SMOKE_NONCE_INVALID_RESPONSE");
  return data;
}

function validNonceDecision(value) {
  if (!value || value.version !== 1 || typeof value.consumed !== "boolean") return false;
  const shapes = { consumed: true, replay: false, binding_conflict: false };
  return Object.prototype.hasOwnProperty.call(shapes, value.decision) && value.consumed === shapes[value.decision];
}

function assertLockedStagingTarget(env) {
  if (cleanText(env.SITE_ID) !== STAGING_SITE_ID || cleanText(env.SUPABASE_PROJECT_ID) !== STAGING_SUPABASE_PROJECT_ID) {
    throw smokeError("SMOKE_TARGET_REFUSED", 503, diagnostics("target", { targetStatus: "fail" }));
  }
}

function requireSecret(value) {
  const secret = cleanText(value);
  if (Buffer.byteLength(secret, "utf8") < SECRET_MIN_BYTES) throw smokeError("SMOKE_SECRET_INVALID", 503, diagnostics("secretConfiguration", { secretVersionStatus: "invalid" }));
  return secret;
}

function requireRotationId(value) {
  const rotationId = cleanText(value);
  if (!ROTATION_PATTERN.test(rotationId)) throw smokeError("SMOKE_SECRET_INVALID", 503, diagnostics("secretVersionConfiguration", { secretVersionStatus: "invalid" }));
  return rotationId;
}

function readHeader(event, name) {
  const headers = event.headers || {};
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => String(key).toLowerCase() === target);
  return cleanText(entry?.[1]);
}

function diagnostics(validationStage, fields = {}) {
  return Object.freeze({
    validationStage,
    headerParsed: false,
    protocolAccepted: false,
    timestampStatus: "not_checked",
    nonceShapeValid: false,
    targetStatus: "not_checked",
    secretVersionStatus: "not_checked",
    bodyStatus: "not_checked",
    signatureStatus: "not_checked",
    ...fields,
  });
}

function hmacHex(secret, value) { return crypto.createHmac("sha256", secret).update(value).digest("hex"); }
function sha256(value) { return crypto.createHash("sha256").update(String(value), "utf8").digest("hex"); }
function timingSafeEqualText(left, right) {
  const a = Buffer.from(cleanText(left), "utf8");
  const b = Buffer.from(cleanText(right), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function timingSafeEqualProof(left, right) {
  const a = Buffer.from(cleanText(left), "hex");
  const b = Buffer.from(cleanText(right), "hex");
  return a.length === 16 && b.length === 16 && crypto.timingSafeEqual(a, b);
}
function timingSafeEqualHex(left, right) {
  const a = Buffer.from(cleanText(left), "hex");
  const b = Buffer.from(cleanText(right), "hex");
  return a.length === 32 && b.length === 32 && crypto.timingSafeEqual(a, b);
}
function normalControl() { return Object.freeze({ suppressProviders: false, mode: "normal", reason: "", provider: "" }); }
function smokeError(code, statusCode, safeDiagnostics = diagnostics("internal")) {
  const error = new Error("Staging-smokeverificatie is niet beschikbaar.");
  error.code = code;
  error.statusCode = statusCode;
  error.diagnostics = safeDiagnostics;
  return error;
}
function nonceError(code) { const error = new Error("Noncecontrole is niet beschikbaar."); error.code = code; return error; }
function safeInternalComponent(code) { return ({ SMOKE_NONCE_CONFIG_INVALID: "configuration", SMOKE_NONCE_TIMEOUT: "timeout", SMOKE_NONCE_UNAVAILABLE: "transport", SMOKE_NONCE_INVALID_RESPONSE: "response" })[code] || "unexpected"; }
function cleanText(value) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function safeLabel(value) { return cleanText(value).replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 80); }

module.exports = {
  AUTH_HEADER,
  BODY_PROOF_HEADER,
  ROTATION_HEADER,
  SECRET_PROOF_HEADER,
  buildSmokeAuthorization,
  createOutboundEmailSender,
  resolveP0StagingSmokeControl,
  signSmokeAuthorization,
  _private: {
    MAX_CLOCK_SKEW_SECONDS,
    NONCE_TIMEOUT_MS,
    SMOKE_SCOPE,
    STAGING_SITE_ID,
    STAGING_SUPABASE_PROJECT_ID,
    STAGING_TARGET_BINDING,
    bodyProofPayload,
    consumeNonce,
    diagnosticProof,
    signaturePayload,
    validNonceDecision,
    verifyAuthorization,
  },
};
