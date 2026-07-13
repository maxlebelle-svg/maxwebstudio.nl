const { FEATURE_FLAGS, FEATURE_FLAG_MODES } = require("./types");

function resolveJourneyFeatureFlag(flagName, context = {}, env = process.env) {
  if (!Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, flagName)) {
    return result(flagName, "off", false, "unknown_feature_flag");
  }

  const mode = normalizeFeatureFlagMode(env?.[flagName]);
  if (mode === "off") return result(flagName, mode, false, "feature_disabled");
  if (mode === "on") return result(flagName, mode, true, "feature_enabled");

  if (mode === "test_only") {
    const enabled = isTestContext(context, env);
    return result(flagName, mode, enabled, enabled ? "test_context_allowed" : "test_context_required");
  }

  const allowlist = parseAllowlist(env?.[`${flagName}_ALLOWLIST`]);
  const candidates = contextIdentifiers(context);
  const enabled = candidates.some((candidate) => allowlist.has(candidate));
  return {
    ...result(flagName, mode, enabled, enabled ? "allowlist_match" : "allowlist_miss"),
    allowlistConfigured: allowlist.size > 0,
  };
}

function getJourneyFeatureFlags(context = {}, env = process.env) {
  return Object.keys(FEATURE_FLAGS).reduce((flags, flagName) => {
    flags[flagName] = resolveJourneyFeatureFlag(flagName, context, env);
    return flags;
  }, {});
}

function normalizeFeatureFlagMode(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (["1", "true", "yes", "enabled", "on"].includes(normalized)) return "on";
  if (["test", "test_only"].includes(normalized)) return "test_only";
  if (["allowlist", "selected"].includes(normalized)) return "allowlist";
  return FEATURE_FLAG_MODES.includes(normalized) ? normalized : "off";
}

function isTestContext(context = {}, env = process.env) {
  if (context.isTest === true || context.testOnly === true) return true;
  const values = [
    context.environment,
    env?.APP_ENV,
    env?.APP_ENVIRONMENT,
    env?.CONTEXT,
    env?.NETLIFY_ENV,
  ].map((value) => String(value || "").trim().toLowerCase());
  return values.some((value) => ["test", "testing", "demo", "development", "dev", "local"].includes(value));
}

function parseAllowlist(value) {
  return new Set(String(value || "").split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean));
}

function contextIdentifiers(context = {}) {
  return [
    context.customerId,
    context.journeyKey,
    context.journeyInstanceId,
    context.entityId,
    context.scopeKey,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function result(flagName, mode, enabled, reason) {
  return { flagName, mode, enabled, reason };
}

module.exports = {
  getJourneyFeatureFlags,
  isTestContext,
  normalizeFeatureFlagMode,
  parseAllowlist,
  resolveJourneyFeatureFlag,
};
