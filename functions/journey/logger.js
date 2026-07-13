const SAFE_CONTEXT_FIELDS = new Set([
  "action",
  "attemptCount",
  "code",
  "component",
  "duplicate",
  "effectType",
  "enabled",
  "entityType",
  "environment",
  "eventType",
  "featureFlag",
  "mode",
  "operation",
  "provider",
  "reason",
  "recordCount",
  "result",
  "source",
  "status",
  "statusCode",
  "durationMs",
  "errorCategory",
]);

function createJourneyLogger(options = {}) {
  const logger = options.logger || console;
  const component = clean(options.component || "journey_foundation");
  return {
    info: (code, context) => emit(logger, "info", component, code, context),
    warn: (code, context) => emit(logger, "warn", component, code, context),
    error: (code, context) => emit(logger, "error", component, code, context),
  };
}

function emit(logger, level, component, code, context = {}) {
  const method = typeof logger?.[level] === "function" ? logger[level].bind(logger) : logger.log.bind(logger);
  method("Journey automation", {
    component,
    code: clean(code).slice(0, 120) || "journey_event",
    ...sanitizeLogContext(context),
  });
}

function sanitizeLogContext(context = {}) {
  if (!context || typeof context !== "object" || Array.isArray(context)) return {};
  return Object.entries(context).reduce((safe, [name, value]) => {
    if (!SAFE_CONTEXT_FIELDS.has(name)) return safe;
    if (["string", "number", "boolean"].includes(typeof value)) safe[name] = typeof value === "string" ? value.slice(0, 160) : value;
    return safe;
  }, {});
}

function clean(value) {
  return String(value || "").trim();
}

module.exports = { createJourneyLogger, sanitizeLogContext };
