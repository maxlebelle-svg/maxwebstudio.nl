const { createHash } = require("crypto");
const { getCompanySettings } = require("../../company-settings");
const { resolveJourneyFeatureFlag } = require("../featureFlags");
const { FEATURE_FLAGS } = require("../types");

function evaluateJourneyEmailMode(context = {}, env = process.env) {
  const gate = resolveJourneyFeatureFlag(FEATURE_FLAGS.JOURNEY_EMAIL_AUTOMATION_ENABLED, context, env);
  if (!gate.enabled) return { ...gate, allowed: false, testMode: true };
  if (!["test_only", "allowlist"].includes(gate.mode)) return { ...gate, allowed: false, testMode: true, reason: "unsafe_feature_mode_blocked" };
  if (isProduction(context, env)) return { ...gate, allowed: false, testMode: true, reason: "production_context_blocked" };
  return { ...gate, allowed: true, testMode: true };
}

function applyRecipientPolicy(input = {}, context = {}, env = process.env) {
  const mode = evaluateJourneyEmailMode(context, env);
  if (!mode.allowed) throw policyError(mode.reason || "feature_disabled");
  if ((input.cc && list(input.cc).length) || (input.bcc && list(input.bcc).length)) throw policyError("cc_bcc_not_allowed");
  const allowed = new Set(list(env.JOURNEY_EMAIL_TEST_RECIPIENTS).map(normalizeEmail).filter(Boolean));
  if (!allowed.size) throw policyError("test_recipient_allowlist_empty");
  const requested = normalizeEmail(input.recipient || input.to);
  if (!requested) throw policyError("invalid_recipient");
  const redirect = truthy(env.JOURNEY_EMAIL_TEST_REDIRECT_ENABLED);
  const recipient = allowed.has(requested) ? requested : redirect ? [...allowed][0] : "";
  if (!recipient) throw policyError("recipient_not_allowed");
  const company = getCompanySettings();
  const centralReplyTo = normalizeEmail(company.primaryEmail);
  const requestedReplyTo = normalizeEmail(input.replyTo);
  const allowedReplyTo = new Set([centralReplyTo, ...list(env.JOURNEY_EMAIL_TEST_REPLY_TO).map(normalizeEmail).filter(Boolean)]);
  const replyTo = requestedReplyTo && allowedReplyTo.has(requestedReplyTo) && isBusinessReplyTo(requestedReplyTo) ? requestedReplyTo : centralReplyTo;
  return {
    allowed: true,
    testMode: true,
    mode: mode.mode,
    recipient,
    replyTo,
    redirected: recipient !== requested,
    recipientFingerprint: fingerprint(recipient),
    originalRecipientFingerprint: recipient !== requested ? fingerprint(requested) : null,
  };
}

function normalizeEmail(value) { const email = String(value || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
function isBusinessReplyTo(email) { return /@(?:[a-z0-9-]+\.)*maxwebstudio\.nl$/i.test(email); }
function fingerprint(value) { return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16); }
function list(value) { return Array.isArray(value) ? value : String(value || "").split(/[\s,;]+/); }
function truthy(value) { return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase()); }
function isProduction(context, env) { const values = [context.environment, env.APP_ENV, env.APP_ENVIRONMENT, env.CONTEXT, env.NETLIFY_ENV].map((value) => String(value || "").trim().toLowerCase()); return values.some((value) => ["production", "prod"].includes(value)); }
function policyError(code) { const error = new Error("Journey test recipient is niet toegestaan."); error.name = "JourneyRecipientPolicyError"; error.code = code; error.statusCode = 400; error.retryable = false; return error; }

module.exports = { applyRecipientPolicy, evaluateJourneyEmailMode, normalizeEmail, _private: { fingerprint, isBusinessReplyTo } };
