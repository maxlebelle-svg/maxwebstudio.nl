const {
  BUSINESS_EVENT_TYPES,
  ENTITY_TYPES,
  ENVIRONMENTS,
  JOURNEY_DEFINITION_STATUSES,
  PROVIDER_EVENT_TYPES,
} = require("./types");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,199}$/;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,79}$/;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_PAYLOAD_DEPTH = 8;
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

class JourneyValidationError extends Error {
  constructor(code, message, field = "") {
    super(message);
    this.name = "JourneyValidationError";
    this.code = code;
    this.field = field;
    this.statusCode = 400;
  }
}

function validateBusinessEvent(input = {}) {
  const eventKey = key(input.eventKey || input.event_key, "event_key");
  const eventType = clean(input.eventType || input.event_type).toLowerCase();
  const entityType = clean(input.entityType || input.entity_type).toLowerCase();
  const entityId = bounded(input.entityId || input.entity_id, "entity_id", 180);
  const environment = normalizeEnvironment(input.environment);

  if (!BUSINESS_EVENT_TYPES.includes(eventType)) invalid("invalid_event_type", "Onbekend journey-eventtype.", "event_type");
  if (!ENTITY_TYPES.includes(entityType)) invalid("invalid_entity_type", "Onbekend journey-entitytype.", "entity_type");

  return {
    eventKey,
    eventType,
    entityType,
    entityId,
    customerId: optionalUuid(input.customerId || input.customer_id, "customer_id"),
    journeyInstanceId: optionalUuid(input.journeyInstanceId || input.journey_instance_id, "journey_instance_id"),
    occurredAt: optionalTimestamp(input.occurredAt || input.occurred_at, "occurred_at"),
    environment,
    payload: validatePayload(input.payload),
  };
}

function validateOutboxInput(input = {}) {
  return {
    idempotencyKey: key(input.idempotencyKey || input.idempotency_key, "idempotency_key"),
    effectType: dottedType(input.effectType || input.effect_type, "effect_type"),
    nextAttemptAt: optionalTimestamp(input.nextAttemptAt || input.next_attempt_at, "next_attempt_at"),
    payload: validatePayload(input.payload),
  };
}

function validateJourneyDefinition(input = {}) {
  const status = clean(input.status || "draft").toLowerCase();
  if (!JOURNEY_DEFINITION_STATUSES.includes(status)) invalid("invalid_definition_status", "Ongeldige journeydefinitionstatus.", "status");
  const version = Number(input.version || 1);
  if (!Number.isInteger(version) || version < 1) invalid("invalid_definition_version", "Journeyversie moet een positief geheel getal zijn.", "version");
  const productCode = clean(input.productCode || input.product_code).toUpperCase();
  if (!CODE_PATTERN.test(productCode)) invalid("invalid_product_code", "Ongeldige productcode.", "product_code");

  return {
    definitionKey: key(input.definitionKey || input.definition_key, "definition_key"),
    version,
    productCode,
    journeyType: dottedType(input.journeyType || input.journey_type, "journey_type"),
    status,
    config: validatePayload(input.config),
    checksum: bounded(input.checksum, "checksum", 128, true),
  };
}

function validateProviderEvent(input = {}) {
  const provider = clean(input.provider || "resend").toLowerCase();
  if (provider !== "resend") invalid("invalid_provider", "Onbekende mailprovider.", "provider");
  const eventType = clean(input.eventType || input.event_type).toLowerCase();
  if (!PROVIDER_EVENT_TYPES.includes(eventType)) invalid("invalid_provider_event_type", "Onbekend provider-eventtype.", "event_type");
  return {
    provider,
    providerEventId: key(input.providerEventId || input.provider_event_id, "provider_event_id"),
    eventType,
    providerMessageId: bounded(input.providerMessageId || input.provider_message_id, "provider_message_id", 180, true),
    payloadHash: bounded(input.payloadHash || input.payload_hash, "payload_hash", 128, true),
    signatureVerified: input.signatureVerified === true || input.signature_verified === true,
    environment: normalizeEnvironment(input.environment),
    payload: validatePayload(input.payload),
  };
}

function validatePayload(value) {
  const payload = value === undefined || value === null ? {} : value;
  if (!isPlainObject(payload)) invalid("invalid_payload", "Payload moet een JSON-object zijn.", "payload");
  assertSafeJson(payload, 0, new Set());
  let encoded = "";
  try {
    encoded = JSON.stringify(payload);
  } catch {
    invalid("invalid_payload", "Payload kan niet veilig als JSON worden opgeslagen.", "payload");
  }
  if (Buffer.byteLength(encoded, "utf8") > MAX_PAYLOAD_BYTES) invalid("payload_too_large", "Payload is groter dan 64 KB.", "payload");
  return JSON.parse(encoded);
}

function assertSafeJson(value, depth, seen) {
  if (depth > MAX_PAYLOAD_DEPTH) invalid("payload_too_deep", "Payload is te diep genest.", "payload");
  if (value === null || ["string", "boolean"].includes(typeof value) || (typeof value === "number" && Number.isFinite(value))) return;
  if (typeof value !== "object") invalid("invalid_payload_value", "Payload bevat een niet-JSON waarde.", "payload");
  if (seen.has(value)) invalid("invalid_payload_cycle", "Payload bevat een circulaire verwijzing.", "payload");
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item) => assertSafeJson(item, depth + 1, seen));
  else {
    if (!isPlainObject(value)) invalid("invalid_payload_value", "Payload bevat een ongeldig object.", "payload");
    Object.entries(value).forEach(([name, item]) => {
      if (UNSAFE_KEYS.has(name)) invalid("unsafe_payload_key", "Payload bevat een onveilige sleutel.", "payload");
      assertSafeJson(item, depth + 1, seen);
    });
  }
  seen.delete(value);
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeEnvironment(value) {
  const environment = clean(value || "test").toLowerCase();
  if (!ENVIRONMENTS.includes(environment)) invalid("invalid_environment", "Ongeldige journeyomgeving.", "environment");
  return environment;
}

function optionalUuid(value, field) {
  const text = clean(value);
  if (!text) return null;
  if (!UUID_PATTERN.test(text)) invalid("invalid_uuid", `Ongeldige ${field}.`, field);
  return text;
}

function optionalTimestamp(value, field) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) invalid("invalid_timestamp", `Ongeldige ${field}.`, field);
  return date.toISOString();
}

function key(value, field) {
  const text = clean(value).toLowerCase();
  if (!KEY_PATTERN.test(text)) invalid("invalid_key", `Ongeldige ${field}.`, field);
  return text;
}

function dottedType(value, field) {
  const text = clean(value).toLowerCase();
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(text) || text.length > 120) invalid("invalid_type", `Ongeldige ${field}.`, field);
  return text;
}

function bounded(value, field, max, optional = false) {
  const text = clean(value);
  if (!text && optional) return null;
  if (!text || text.length > max) invalid("invalid_text", `Ongeldige ${field}.`, field);
  return text;
}

function invalid(code, message, field) {
  throw new JourneyValidationError(code, message, field);
}

function clean(value) {
  return String(value || "").trim();
}

module.exports = {
  JourneyValidationError,
  MAX_PAYLOAD_BYTES,
  validateBusinessEvent,
  validateJourneyDefinition,
  validateOutboxInput,
  validatePayload,
  validateProviderEvent,
};
