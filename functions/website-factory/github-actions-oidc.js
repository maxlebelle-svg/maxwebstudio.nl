"use strict";

const { createPublicKey, verify } = require("crypto");

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
const FACTORY_WORKER_AUDIENCE = "maxwebstudio-website-factory-browser-worker";
const FACTORY_WORKER_REPOSITORY = "maxlebelle-svg/maxwebstudio.nl";
const FACTORY_WORKER_REF = "refs/heads/main";
const FACTORY_WORKER_WORKFLOW = `${FACTORY_WORKER_REPOSITORY}/.github/workflows/website-factory-browser-worker.yml@${FACTORY_WORKER_REF}`;
const FACTORY_WORKER_ACTIONS = new Set(["get_browser_review_queue", "submit_browser_review"]);
const CLOCK_TOLERANCE_SECONDS = 30;
const MAX_TOKEN_LIFETIME_SECONDS = 900;
let cachedJwks = null;
let cachedJwksAt = 0;

async function authenticateFactoryBrowserWorker(event = {}, action = "", options = {}) {
  if (!FACTORY_WORKER_ACTIONS.has(String(action || ""))) return { attempted: false, success: false };
  const token = bearerToken(event);
  if (!token) return { attempted: false, success: false };
  let decoded;
  try { decoded = decodeJwt(token); } catch { return { attempted: false, success: false }; }
  if (decoded.payload?.iss !== GITHUB_OIDC_ISSUER) return { attempted: false, success: false };
  try {
    const claims = await verifyFactoryBrowserWorkerToken(token, options);
    return {
      attempted: true,
      success: true,
      source: "github_actions_oidc",
      claims,
      admin: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "website-factory-worker@github-actions.local",
        role: "admin",
        status: "active",
        profileId: "github-actions-oidc",
      },
    };
  } catch (error) {
    return { attempted: true, success: false, code: error.code || "FACTORY_WORKER_OIDC_INVALID" };
  }
}

async function verifyFactoryBrowserWorkerToken(token, options = {}) {
  const decoded = decodeJwt(token);
  const { header, payload, signingInput, signature } = decoded;
  if (header.alg !== "RS256" || header.typ !== "JWT" || !header.kid) throw oidcError("FACTORY_WORKER_OIDC_HEADER_INVALID");
  const jwks = options.jwks || await readGithubJwks(options.fetchImpl || fetch);
  const jwk = Array.isArray(jwks?.keys) ? jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA") : null;
  if (!jwk) throw oidcError("FACTORY_WORKER_OIDC_KEY_UNKNOWN");
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  if (!verify("RSA-SHA256", Buffer.from(signingInput), publicKey, signature)) throw oidcError("FACTORY_WORKER_OIDC_SIGNATURE_INVALID");
  validateClaims(payload, options.nowSeconds);
  return payload;
}

function validateClaims(claims = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
  const now = Number(nowSeconds);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== GITHUB_OIDC_ISSUER) throw oidcError("FACTORY_WORKER_OIDC_ISSUER_INVALID");
  if (!audience.includes(FACTORY_WORKER_AUDIENCE)) throw oidcError("FACTORY_WORKER_OIDC_AUDIENCE_INVALID");
  if (claims.repository !== FACTORY_WORKER_REPOSITORY) throw oidcError("FACTORY_WORKER_OIDC_REPOSITORY_INVALID");
  if (claims.workflow_ref !== FACTORY_WORKER_WORKFLOW) throw oidcError("FACTORY_WORKER_OIDC_WORKFLOW_INVALID");
  if (claims.ref !== FACTORY_WORKER_REF || claims.ref_type !== "branch") throw oidcError("FACTORY_WORKER_OIDC_REF_INVALID");
  if (claims.sub !== `repo:${FACTORY_WORKER_REPOSITORY}:ref:${FACTORY_WORKER_REF}`) throw oidcError("FACTORY_WORKER_OIDC_SUBJECT_INVALID");
  if (!['schedule', 'workflow_dispatch'].includes(String(claims.event_name || ""))) throw oidcError("FACTORY_WORKER_OIDC_EVENT_INVALID");
  if (claims.runner_environment !== "github-hosted") throw oidcError("FACTORY_WORKER_OIDC_RUNNER_INVALID");
  const issuedAt = Number(claims.iat);
  const notBefore = Number(claims.nbf);
  const expiresAt = Number(claims.exp);
  if (![issuedAt, notBefore, expiresAt].every(Number.isFinite)) throw oidcError("FACTORY_WORKER_OIDC_TIME_INVALID");
  if (issuedAt > now + CLOCK_TOLERANCE_SECONDS || notBefore > now + CLOCK_TOLERANCE_SECONDS || expiresAt <= now - CLOCK_TOLERANCE_SECONDS) {
    throw oidcError("FACTORY_WORKER_OIDC_TIME_INVALID");
  }
  if (expiresAt - issuedAt > MAX_TOKEN_LIFETIME_SECONDS || issuedAt < now - MAX_TOKEN_LIFETIME_SECONDS) {
    throw oidcError("FACTORY_WORKER_OIDC_LIFETIME_INVALID");
  }
  if (!String(claims.jti || "").trim() || !String(claims.run_id || "").trim()) throw oidcError("FACTORY_WORKER_OIDC_IDENTITY_INCOMPLETE");
}

async function readGithubJwks(fetchImpl = fetch) {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksAt < 5 * 60 * 1000) return cachedJwks;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(GITHUB_OIDC_JWKS_URL, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw oidcError("FACTORY_WORKER_OIDC_JWKS_UNAVAILABLE");
    const jwks = await response.json();
    if (!Array.isArray(jwks?.keys) || !jwks.keys.length) throw oidcError("FACTORY_WORKER_OIDC_JWKS_INVALID");
    cachedJwks = jwks;
    cachedJwksAt = now;
    return jwks;
  } catch (error) {
    if (error?.code) throw error;
    throw oidcError("FACTORY_WORKER_OIDC_JWKS_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

function decodeJwt(token = "") {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw oidcError("FACTORY_WORKER_OIDC_FORMAT_INVALID");
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")),
      payload: JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")),
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: Buffer.from(parts[2], "base64url"),
    };
  } catch {
    throw oidcError("FACTORY_WORKER_OIDC_FORMAT_INVALID");
  }
}

function bearerToken(event = {}) {
  const header = String(event.headers?.authorization || event.headers?.Authorization || "");
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "").trim() : "";
}

function oidcError(code) {
  const error = new Error("Website Factory worker-identiteit is niet geldig.");
  error.code = code;
  return error;
}

module.exports = {
  FACTORY_WORKER_ACTIONS,
  FACTORY_WORKER_AUDIENCE,
  FACTORY_WORKER_REF,
  FACTORY_WORKER_REPOSITORY,
  FACTORY_WORKER_WORKFLOW,
  GITHUB_OIDC_ISSUER,
  authenticateFactoryBrowserWorker,
  decodeJwt,
  validateClaims,
  verifyFactoryBrowserWorkerToken,
};
