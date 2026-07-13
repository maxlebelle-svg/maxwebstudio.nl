const { validatePayload } = require("../validation");
const { applyRecipientPolicy, normalizeEmail } = require("./recipientPolicy");

const TEMPLATE_KEY = "journey.test_status_update";
const PREVIEW_READY_TEMPLATE_KEY = "journey.preview_ready";
const FEEDBACK_RECEIVED_TEMPLATE_KEY = "journey.feedback_received";
const TEMPLATE_VERSION = 1;
const TEMPLATES = new Set([TEMPLATE_KEY, PREVIEW_READY_TEMPLATE_KEY, FEEDBACK_RECEIVED_TEMPLATE_KEY]);
const ALLOWED_FIELDS = new Set(["automationKey", "templateKey", "templateVersion", "journeyEventKey", "outboxIdempotencyKey", "customerReference", "journeyInstanceReference", "recipient", "fromProfile", "replyToProfile", "subjectData", "templateData", "actionUrl", "locale", "metadata", "scheduledTime", "cc", "bcc"]);
const MAX_COMMAND_BYTES = 32 * 1024;

function validateMailCommand(input = {}, context = {}, env = process.env) {
  if (!plainObject(input)) invalid("invalid_mail_command");
  const unknown = Object.keys(input).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknown.length) invalid("unknown_mail_command_field");
  let encoded = "";
  try { encoded = JSON.stringify(input); } catch { invalid("invalid_mail_command"); }
  if (Buffer.byteLength(encoded, "utf8") > MAX_COMMAND_BYTES) invalid("payload_too_large");
  const templateKey = key(input.templateKey, "template_key");
  const templateVersion = Number(input.templateVersion);
  if (!TEMPLATES.has(templateKey) || templateVersion !== TEMPLATE_VERSION) invalid("template_not_found");
  const idempotencyKey = key(input.outboxIdempotencyKey, "outbox_idempotency_key", 256);
  const policy = applyRecipientPolicy({ recipient: input.recipient, replyTo: input.replyToProfile?.email, cc: input.cc, bcc: input.bcc }, context, env);
  const actionUrl = safeActionUrl(input.actionUrl);
  const templateData = validatePayload(input.templateData || {});
  const subjectData = validatePayload(input.subjectData || {});
  rejectHtmlValues(templateData);
  rejectHtmlValues(subjectData);
  return {
    automationKey: key(input.automationKey, "automation_key", 120),
    templateKey,
    templateVersion,
    journeyEventKey: key(input.journeyEventKey, "journey_event_key", 200),
    outboxIdempotencyKey: idempotencyKey,
    customerReference: bounded(input.customerReference, 120, true),
    journeyInstanceReference: bounded(input.journeyInstanceReference, 120, true),
    recipient: policy.recipient,
    recipientPolicy: policy,
    fromProfile: { name: "Max Webstudio", email: "info@maxwebstudio.nl" },
    replyToProfile: { name: "Max Webstudio", email: policy.replyTo },
    subjectData,
    templateData,
    actionUrl,
    locale: input.locale === "en" ? "en" : "nl",
    metadata: safeMetadata(input.metadata),
    scheduledTime: timestamp(input.scheduledTime),
  };
}

function safeActionUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { invalid("unsafe_action_url"); }
  if (url.protocol !== "https:" || !["maxwebstudio.nl", "www.maxwebstudio.nl"].includes(url.hostname.toLowerCase())) invalid("unsafe_action_url");
  if (url.username || url.password) invalid("unsafe_action_url");
  return url.toString();
}
function safeMetadata(value) { const metadata = validatePayload(value || {}); return { testMode: true, scenario: bounded(metadata.scenario, 60, true) || "synthetic_status_update", previewVersionReference: bounded(metadata.previewVersionReference, 120, true), feedbackReference: bounded(metadata.feedbackReference, 80, true) }; }
function rejectHtmlValues(value) { for (const item of Object.values(value || {})) { if (typeof item === "string" && /[<>]/.test(item)) invalid("unsafe_template_data"); if (plainObject(item)) rejectHtmlValues(item); if (Array.isArray(item)) item.forEach((entry) => { if (typeof entry === "string" && /[<>]/.test(entry)) invalid("unsafe_template_data"); }); } }
function key(value, field, max = 200) { const result = String(value || "").trim().toLowerCase(); if (!result || result.length > max || !/^[a-z0-9][a-z0-9._:/-]+$/.test(result)) invalid(`invalid_${field}`); return result; }
function bounded(value, max, optional = false) { const result = String(value || "").trim(); if (!result && optional) return null; if (!result || result.length > max) invalid("invalid_mail_command"); return result; }
function timestamp(value) { if (!value) return null; const date = new Date(value); if (Number.isNaN(date.getTime())) invalid("invalid_scheduled_time"); return date.toISOString(); }
function plainObject(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype); }
function invalid(code) { const error = new Error("Journey mailcommand is ongeldig."); error.name = "JourneyMailCommandError"; error.code = code; error.statusCode = 400; error.retryable = false; throw error; }

module.exports = { FEEDBACK_RECEIVED_TEMPLATE_KEY, MAX_COMMAND_BYTES, PREVIEW_READY_TEMPLATE_KEY, TEMPLATE_KEY, TEMPLATE_VERSION, validateMailCommand, _private: { safeActionUrl } };
