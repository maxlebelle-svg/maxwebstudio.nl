const STEP_STATUSES = Object.freeze(["pending", "ready", "in_progress", "blocked", "completed", "skipped", "cancelled"]);

const STEP_TRANSITIONS = Object.freeze({
  pending: Object.freeze(["ready", "cancelled"]),
  ready: Object.freeze(["in_progress", "blocked", "cancelled"]),
  in_progress: Object.freeze(["completed", "blocked", "cancelled"]),
  blocked: Object.freeze(["in_progress", "cancelled"]),
  completed: Object.freeze([]),
  skipped: Object.freeze([]),
  cancelled: Object.freeze([]),
});

function validateStepTransition(input = {}, context = {}) {
  const from = status(input.from);
  const to = status(input.to);
  const optional = input.optional === true;
  if (!STEP_STATUSES.includes(from) || !STEP_STATUSES.includes(to)) return denied("unknown_step_status", from, to);
  if (!authorizedMutationContext(context)) return denied("transition_context_required", from, to);
  if (from === to) return { allowed: true, reason: "idempotent_transition", from, to };
  if (to === "skipped") {
    if (!optional) return denied("required_step_cannot_be_skipped", from, to);
    if (!["pending", "ready", "blocked"].includes(from)) return denied("invalid_optional_skip", from, to);
    return { allowed: true, reason: "optional_step_skipped", from, to };
  }
  if (explicitAdminOverride(input, context, from, to)) return { allowed: true, reason: "explicit_admin_override", from, to };
  if (!STEP_TRANSITIONS[from].includes(to)) return denied("invalid_step_transition", from, to);
  return { allowed: true, reason: "valid_step_transition", from, to };
}

function assertStepTransition(input = {}, context = {}) {
  const result = validateStepTransition(input, context);
  if (result.allowed) return result;
  const error = new Error("Deze journeystap-overgang is niet toegestaan.");
  error.name = "JourneyTransitionError";
  error.code = result.reason;
  error.statusCode = result.reason === "transition_context_required" ? 403 : 409;
  throw error;
}

function authorizedMutationContext(context = {}) {
  return context.isTest === true
    || (context.adminAuthorized === true && context.serviceContext === "journey_admin");
}

function explicitAdminOverride(input, context, from, to) {
  return input.adminOverride === true
    && context.adminAuthorized === true
    && context.serviceContext === "journey_admin"
    && from === "completed"
    && ["pending", "ready"].includes(to)
    && Boolean(String(input.reason || "").trim());
}

function denied(reason, from, to) {
  return { allowed: false, reason, from, to };
}

function status(value) {
  return String(value || "").trim().toLowerCase();
}

module.exports = { STEP_STATUSES, STEP_TRANSITIONS, assertStepTransition, validateStepTransition };
