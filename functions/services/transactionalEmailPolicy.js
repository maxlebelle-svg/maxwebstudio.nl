const CANONICAL_FROM_NAME = "Max Webstudio";
const CANONICAL_FROM_EMAIL = "info@maxwebstudio.nl";
const CANONICAL_FROM = `${CANONICAL_FROM_NAME} <${CANONICAL_FROM_EMAIL}>`;

function applyTransactionalEmailPolicy(input = {}, env = process.env) {
  const configuredFrom = clean(input.from || env.FROM_EMAIL || CANONICAL_FROM_EMAIL);
  const parsedFrom = parseAddress(configuredFrom);
  if (parsedFrom.email.toLowerCase() !== CANONICAL_FROM_EMAIL) {
    throw policyError("invalid_sender_configuration", "Transactional email sender must be info@maxwebstudio.nl.");
  }
  if (isProduction(env) && !isEnabled(env.RESEND_DOMAIN_VERIFIED)) {
    throw policyError("sender_domain_not_verified", "Transactional email sender domain is not explicitly verified.");
  }
  if (!clean(input.html) || !clean(input.text)) {
    throw policyError("multipart_content_required", "Transactional email requires both HTML and plain text.");
  }

  const linkDomains = extractHttpsDomains(input.html, input.text);
  return {
    ...input,
    from: CANONICAL_FROM,
    replyTo: CANONICAL_FROM_EMAIL,
    deliveryConfiguration: {
      senderDomain: "maxwebstudio.nl",
      replyToDomain: "maxwebstudio.nl",
      multipart: true,
      linkDomains,
      tracking: {
        clickExpected: isEnabled(env.RESEND_CLICK_TRACKING_ENABLED),
        openExpected: isEnabled(env.RESEND_OPEN_TRACKING_ENABLED),
        verification: "resend-domain-dashboard-required",
      },
    },
  };
}

function extractHttpsDomains(...values) {
  const domains = new Set();
  values.forEach((value) => {
    const matches = String(value || "").match(/https:\/\/[^\s"'<>]+/gi) || [];
    matches.forEach((match) => {
      try { domains.add(new URL(match.replace(/[),.;]+$/, "")).hostname.toLowerCase()); } catch {}
    });
  });
  return [...domains].sort();
}

function parseAddress(value = "") {
  const text = clean(value);
  const match = text.match(/^(.*?)<([^>]+)>$/);
  return match ? { name: clean(match[1]).replace(/^"|"$/g, ""), email: clean(match[2]) } : { name: "", email: text };
}

function isProduction(env = {}) {
  return [env.APP_ENV, env.CONTEXT, env.NODE_ENV].some((value) => ["production", "prod"].includes(clean(value).toLowerCase()));
}
function isEnabled(value) { return ["true", "1", "yes", "on"].includes(clean(value).toLowerCase()); }
function clean(value) { return String(value || "").trim(); }
function policyError(code, message) { return Object.assign(new Error(message), { code, statusCode: 503, retryable: false }); }

module.exports = {
  applyTransactionalEmailPolicy,
  CANONICAL_FROM,
  CANONICAL_FROM_EMAIL,
  _private: { extractHttpsDomains, isProduction, parseAddress },
};
