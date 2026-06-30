import { STORAGE_KEYS } from "../config/storageKeys.js";
import { getCurrentEnvironment, getCurrentProviderType } from "../config/environment.js";

const AUDITABLE_ACTIONS = Object.freeze([
  "crm_task_create",
  "lead_note_append",
  "change_request_create",
  "client_portal_message_create",
  "project_status_update",
  "customer_contact_update",
  "website_operational_update",
]);

const OBSERVABILITY_EVENTS = Object.freeze([
  "write_success",
  "write_failure",
  "rls_denied",
  "fallback_activated",
  "gate_blocked",
  "validation_failed",
  "readback_verified",
  "security_spoof_blocked",
]);

const FORBIDDEN_FIELD_PATTERNS = Object.freeze([
  /password/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /authorization/i,
  /service[_-]?role/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /mollie/i,
  /resend/i,
  /openai/i,
  /prompt/i,
  /payment[_-]?details/i,
  /card/i,
]);

const MAX_EVENTS = 250;

function storageAvailable() {
  return typeof localStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix = "audit") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeCurrentEnvironment() {
  try {
    return getCurrentEnvironment();
  } catch {
    return "unknown";
  }
}

function safeCurrentProviderType() {
  try {
    return getCurrentProviderType();
  } catch {
    return "unknown";
  }
}

function readJsonArray(key) {
  if (!storageAvailable()) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeJson(key, value) {
  if (!storageAvailable()) return value;
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function shouldRedact(key = "") {
  return FORBIDDEN_FIELD_PATTERNS.some((pattern) => pattern.test(String(key)));
}

export function sanitizeAuditMetadata(value, parentKey = "") {
  if (shouldRedact(parentKey)) return "[redacted]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeAuditMetadata(item, parentKey));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [
      key,
      sanitizeAuditMetadata(nestedValue, key),
    ]));
  }
  if (typeof value === "string" && value.length > 600) return `${value.slice(0, 600)}...`;
  return value;
}

export function createAuditRequestId(prefix = "audit") {
  return randomId(prefix);
}

export function buildAuditEvent(input = {}) {
  const timestamp = input.timestamp || nowIso();
  const entity = input.entity || input.entityType || "unknown";
  const action = input.action || "unknown_action";
  const outcome = input.outcome || "unknown";
  const environment = input.environment || safeCurrentEnvironment();
  const providerMode = input.providerMode || safeCurrentProviderType();

  return {
    id: input.id || randomId("audit_event"),
    timestamp,
    actor: input.actor || input.actorId || "unknown",
    role: input.role || input.actorRole || "unknown",
    customer: input.customer || input.customerId || null,
    project: input.project || input.projectId || null,
    entity,
    entityId: input.entityId || input.id || null,
    action,
    outcome,
    environment,
    providerMode,
    requestId: input.requestId || randomId("request"),
    metadata: sanitizeAuditMetadata(input.metadata || {}),
  };
}

export function recordAuditEvent(input = {}) {
  const event = buildAuditEvent(input);
  const events = [event, ...readJsonArray(STORAGE_KEYS.auditObservabilityEvents)].slice(0, MAX_EVENTS);
  writeJson(STORAGE_KEYS.auditObservabilityEvents, events);
  writeJson(STORAGE_KEYS.lastAuditObservabilityStatus, {
    status: "recorded_local_foundation_event",
    lastEventId: event.id,
    lastAction: event.action,
    lastOutcome: event.outcome,
    checkedAt: nowIso(),
    productionAuditWrites: "blocked",
  });

  try {
    if (typeof window === "undefined") return event;
    import("./activityLogService.js").then(({ logActivity }) => {
      logActivity("audit_observability", event.id, event.action, {
        outcome: event.outcome,
        entity: event.entity,
        requestId: event.requestId,
        localFoundationOnly: true,
      });
    }).catch(() => {});
  } catch {
    // Activity log is helpful evidence, but it must never block the audit foundation.
  }

  return event;
}

export function recordObservabilityEvent(input = {}) {
  return recordAuditEvent({
    ...input,
    action: input.action || input.eventType || "observability_event",
    outcome: input.outcome || input.eventType || "observed",
    metadata: {
      eventType: input.eventType || "unknown",
      ...(input.metadata || {}),
    },
  });
}

export function listAuditObservabilityEvents(limit = 50) {
  return readJsonArray(STORAGE_KEYS.auditObservabilityEvents).slice(0, limit);
}

export function getAuditEventSchema() {
  return [
    "timestamp",
    "actor",
    "role",
    "customer",
    "project",
    "entity",
    "entityId",
    "action",
    "outcome",
    "environment",
    "providerMode",
    "requestId",
    "metadata",
  ];
}

export function getForbiddenAuditFields() {
  return [
    "wachtwoorden",
    "tokens",
    "API keys",
    "service role keys",
    "volledige prompts",
    "volledige betaalgegevens",
    "secrets",
    "base64/file content",
  ];
}

export function getAuditObservabilityReadiness() {
  const latest = storageAvailable()
    ? JSON.parse(localStorage.getItem(STORAGE_KEYS.lastAuditObservabilityStatus) || "null")
    : null;
  return {
    status: "FOUNDATION_READY",
    sprint: "3A",
    storageKey: STORAGE_KEYS.auditObservabilityEvents,
    lastStatusKey: STORAGE_KEYS.lastAuditObservabilityStatus,
    auditableActions: AUDITABLE_ACTIONS,
    observabilityEvents: OBSERVABILITY_EVENTS,
    schema: getAuditEventSchema(),
    forbiddenFields: getForbiddenAuditFields(),
    localFoundationOnly: true,
    productionAuditWrites: "blocked",
    serverSideAuditLogging: "not_enabled",
    externalMonitoring: "not_connected",
    latest,
  };
}
