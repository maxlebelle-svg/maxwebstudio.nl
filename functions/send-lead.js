const crypto = require("crypto");
const { sendEmail } = require("./email");
const { getCompanySettings, getWhatsappLink } = require("./company-settings");
const { createTimelineEvent } = require("./services/timelineService");

const { prepareAbuseControlRequest, runLeadIntakeAbuseGate } = require("./services/leadIntakeAbuseControl");
const { createOutboundEmailSender, resolveP0StagingSmokeControl } = require("./services/p0StagingSmokeControl");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUEST_MAX_BYTES = 131072;
const CREATE_TIMEOUT_MS = 8000;
const RECONCILIATION_TIMEOUT_MS = 3000;
const LIMITS = Object.freeze({ name: 240, company: 240, email: 320, phone: 80, message: 4000, source: 120, requestId: 255, packageInterest: 240, carePackage: 240 });

function createHandler(overrides = {}) {
  const dependencies = {
    sendEmail, getCompanySettings, getWhatsappLink, createTimelineEvent,
    fetchImpl: (...args) => fetch(...args), env: process.env, logger: console,
    createRequestReference: () => crypto.randomBytes(12).toString("hex"), ...overrides,
  };

  return async (event = {}) => {
    let requestReference = dependencies.createRequestReference();
    if (event.httpMethod !== "POST") {
      recordOutcome(dependencies.logger, "validationRejected", requestReference, { reason: "unsupportedMethod" });
      return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan.", requestReference });
    }

    const rawBody = readRequestBody(event);
    if (!rawBody.valid || rawBody.bytes > REQUEST_MAX_BYTES) {
      recordOutcome(dependencies.logger, "validationRejected", requestReference, { reason: "requestTooLarge" });
      return jsonResponse(413, { success: false, error: "De aanvraag is te groot.", requestReference });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.text || "{}");
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid shape");
    } catch (error) {
      recordOutcome(dependencies.logger, "validationRejected", requestReference, { reason: "malformedJson" });
      return jsonResponse(400, { success: false, error: "Ongeldige JSON body.", requestReference });
    }

    if (hasHoneypotSignal(payload)) {
      recordOutcome(dependencies.logger, "abuseRejected", requestReference, { reason: "honeypot" });
      return jsonResponse(200, { success: true, accepted: false, requestReference });
    }

    const lead = sanitizeLead(payload);
    const invalid = validateLead(lead);
    if (invalid) {
      recordOutcome(dependencies.logger, "validationRejected", requestReference, { reason: invalid.code });
      return jsonResponse(400, { success: false, error: invalid.message, requestReference });
    }

    let smokeControl;
    try {
      smokeControl = resolveP0StagingSmokeControl({ event, rawBody: rawBody.text, env: dependencies.env });
    } catch (error) {
      const statusCode = error.statusCode || 503;
      recordOutcome(dependencies.logger, "validationRejected", requestReference, { reason: safeReason(error.code) });
      return jsonResponse(statusCode, {
        success: false,
        error: statusCode === 403 ? "Staging-smokeverificatie geweigerd." : "Staging-smokemodus is niet veilig geconfigureerd.",
        classification: "validationRejected",
        requestReference,
      });
    }

    const idempotencyKey = leadIdempotencyKey(lead);
    try {
      const requestDependencies = { ...dependencies, smokeControl };
      const references = prepareAbuseControlRequest(event, idempotencyKey, dependencies.env);
      requestReference = references.requestReference;
      const persisted = await runLeadIntakeAbuseGate({
        supabaseUrl: dependencies.env.SUPABASE_URL,
        serviceRoleKey: dependencies.env.SUPABASE_SERVICE_ROLE_KEY,
        references,
        fetchImpl: dependencies.fetchImpl,
        onAllowed: () => persistLeadWithReconciliation(lead, idempotencyKey, requestDependencies),
      });
      const { intake, classification } = persisted;
      recordOutcome(dependencies.logger, classification, requestReference, { reconciled: persisted.reconciled });

      if (classification === "idempotentReplay") {
        return jsonResponse(200, {
          success: true, leadId: text(intake.leadId || intake.lead?.id), emailSent: false, confirmationSent: false,
          classification, storageClassification: classification, reconciled: false, idempotentReplay: true, requestReference,
        });
      }

      const { notificationDegraded, result, confirmation, suppressedDeliveries } = await runPostStorageNotifications(lead, intake, requestDependencies);
      if (notificationDegraded) recordOutcome(dependencies.logger, "notificationDegraded", requestReference, { storageClassification: classification });

      return jsonResponse(notificationDegraded ? 202 : 200, {
        success: true,
        leadId: text(intake.leadId || intake.lead?.id),
        emailSent: Boolean(result?.sent),
        confirmationSent: Boolean(confirmation.sent),
        classification: notificationDegraded ? "notificationDegraded" : classification,
        storageClassification: classification,
        reconciled: persisted.reconciled,
        idempotentReplay: Boolean(intake.idempotentReplay),
        requestReference,
        ...(suppressedDeliveries.length > 0 ? {
          providerSuppressed: true,
          suppressedProviders: ["resend"],
          suppressionReason: "staging_smoke",
          suppressedDeliveryCount: suppressedDeliveries.length,
        } : {}),
        warning: notificationDegraded ? "Je aanvraag is veilig ontvangen. Een notificatie wordt handmatig opgevolgd." : undefined,
      });
    } catch (error) {
      const abuseRejected = error.code === "ABUSE_RATE_LIMITED" || error.code === "ABUSE_IDEMPOTENCY_CONFLICT";
      const classification = abuseRejected ? "abuseRejected" : "storageFailed";
      recordOutcome(dependencies.logger, classification, requestReference, { reason: safeReason(error.code) });
      const statusCode = error.code === "ABUSE_RATE_LIMITED" ? 429 : (error.statusCode || 503);
      const publicMessage = error.code === "ABUSE_RATE_LIMITED" ? "Te veel aanvragen. Probeer het later opnieuw."
        : error.code === "ABUSE_IDEMPOTENCY_CONFLICT" ? "Deze aanvraag kan niet worden verwerkt."
          : "Aanvraag kon niet veilig worden verwerkt.";
      return jsonResponse(statusCode, { success: false, error: publicMessage, classification, requestReference });
    }
  };
}

async function runPostStorageNotifications(lead, intake, dependencies) {
  let notificationDegraded = false;
  let result = { sent: false };
  let confirmation = { sent: false };

  const outboundEmail = createOutboundEmailSender(dependencies.smokeControl, dependencies.sendEmail, dependencies.logger);
  const notificationDependencies = { ...dependencies, sendEmail: outboundEmail };

  try { await dependencies.createTimelineEvent(timelineInput(lead, intake, dependencies.smokeControl)); }
  catch (error) { notificationDegraded = true; }

  try {
    const companySettings = dependencies.getCompanySettings() || {};
    result = await outboundEmail(adminEmailInput(lead, companySettings, dependencies.env));
    if (!deliverySucceededOrSuppressed(result)) notificationDegraded = true;
    if (deliverySucceededOrSuppressed(result)) confirmation = await sendCustomerConfirmation(lead, notificationDependencies, companySettings);
    if (!deliverySucceededOrSuppressed(confirmation)) notificationDegraded = true;
  } catch (error) {
    notificationDegraded = true;
  }

  const suppressedDeliveries = [result, confirmation].filter((value) => value?.suppressed === true);
  return { notificationDegraded, result, confirmation, suppressedDeliveries };
}

exports.handler = createHandler();

function sanitizeLead(payload) {
  return {
    name: normalizeWhitespace(payload.name), requestId: text(payload.id), company: normalizeWhitespace(payload.company),
    email: text(payload.email).toLowerCase(), phone: text(payload.phone),
    packageInterest: text(payload.packageInterest || payload.package), carePackage: text(payload.carePackage),
    termsAccepted: payload.termsAccepted === true, message: normalizeWhitespace(payload.message),
    source: text(payload.source || "homepage-contact-form"), submittedAt: text(payload.createdAt) || new Date().toISOString(),
  };
}

async function persistLeadWithReconciliation(lead, idempotencyKey, dependencies) {
  try {
    const intake = await createLead(lead, idempotencyKey, dependencies);
    return { intake, classification: classifyIntake(intake, false), reconciled: false };
  } catch (error) {
    if (!error.ambiguous) throw error;
    const intake = await reconcileLead(idempotencyKey, dependencies);
    if (!intake) throw storageError("STORAGE_RECONCILIATION_NOT_FOUND");
    return { intake, classification: classifyIntake(intake, true), reconciled: true };
  }
}

async function createLead(lead, idempotencyKey, dependencies) {
  const { supabaseUrl, serviceRoleKey } = databaseConfiguration(dependencies.env);
  let response;
  try {
    response = await dependencies.fetchImpl(`${supabaseUrl}/rest/v1/rpc/mws_create_lead_transactional_v1`, {
      method: "POST", headers: rpcHeaders(serviceRoleKey),
      body: JSON.stringify({ p_lead: leadRpcPayload(lead, dependencies.env, dependencies.smokeControl), p_idempotency_key: idempotencyKey, p_actor_profile_id: null, p_actor_type: "service", p_actor_id: "homepage-contact-form" }),
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
    });
  } catch (cause) { throw ambiguousStorageError(cause); }
  if (!response.ok) throw definitiveStorageError(response.status);
  let data;
  try { data = await response.json(); } catch (cause) { throw ambiguousStorageError(cause); }
  return requireIntakeResult(data);
}

async function reconcileLead(idempotencyKey, dependencies) {
  const { supabaseUrl, serviceRoleKey } = databaseConfiguration(dependencies.env);
  let response;
  try {
    response = await dependencies.fetchImpl(`${supabaseUrl}/rest/v1/rpc/mws_get_lead_intake_result_v1`, {
      method: "POST", headers: rpcHeaders(serviceRoleKey), body: JSON.stringify({ p_idempotency_key: idempotencyKey }),
      signal: AbortSignal.timeout(RECONCILIATION_TIMEOUT_MS),
    });
  } catch (cause) { throw storageError("STORAGE_RECONCILIATION_FAILED"); }
  if (!response.ok) throw storageError("STORAGE_RECONCILIATION_FAILED");
  let data;
  try { data = await response.json(); } catch (cause) { throw storageError("STORAGE_RECONCILIATION_FAILED"); }
  return data == null ? null : requireIntakeResult(data);
}

async function persistLead(lead, options = {}) {
  const dependencies = { env: options.env || process.env, fetchImpl: options.fetchImpl || ((...args) => fetch(...args)) };
  return (await persistLeadWithReconciliation(lead, options.idempotencyKey || leadIdempotencyKey(lead), dependencies)).intake;
}

function databaseConfiguration(env) {
  const supabaseUrl = text(env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = text(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) throw storageError(!supabaseUrl ? "STORAGE_URL_MISSING" : "STORAGE_KEY_MISSING");
  return { supabaseUrl, serviceRoleKey };
}

function leadRpcPayload(lead, env = process.env, smokeControl = null) {
  const environment = smokeControl?.suppressProviders ? "test" : (text(env.CONTEXT).toLowerCase() === "production" ? "production" : "test");
  const smokeMetadata = smokeControl?.suppressProviders
    ? { stagingSmoke: true, providerMode: "suppress", suppressionReason: "staging_smoke" }
    : {};
  return {
    company: lead.company || lead.name, name: lead.name, email: lead.email, phone: lead.phone || null,
    source: lead.source || "homepage-contact-form", external_source: "homepage-contact-form", external_source_id: lead.requestId || null,
    notes: lead.message, environment, is_demo: false,
    metadata: { requestId: lead.requestId || null, submittedAt: lead.submittedAt, termsAccepted: lead.termsAccepted, packageInterest: lead.packageInterest || null, carePackage: lead.carePackage || null, ...smokeMetadata },
  };
}

function leadIdempotencyKey(lead) {
  const seed = [lead.source, lead.requestId, lead.email, lead.submittedAt].map(text).join("|");
  const bytes = Buffer.from(crypto.createHash("sha256").update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `lead-intake:v1:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateLead(lead) {
  if (!lead.name) return validationError("nameRequired", "Vul je naam in.");
  if (charLength(lead.name) > LIMITS.name) return validationError("nameTooLong", "Je naam is te lang.");
  if (charLength(lead.company) > LIMITS.company) return validationError("companyTooLong", "De bedrijfsnaam is te lang.");
  if (charLength(lead.email) > LIMITS.email) return validationError("emailTooLong", "Het e-mailadres is te lang.");
  if (!emailPattern.test(lead.email)) return validationError("emailInvalid", "Vul een geldig e-mailadres in.");
  if (charLength(lead.phone) > LIMITS.phone) return validationError("phoneTooLong", "Het telefoonnummer is te lang.");
  if (!lead.message) return validationError("messageRequired", "Vul je bericht of wensen in.");
  if (charLength(lead.message) > LIMITS.message) return validationError("messageTooLong", "Het bericht is te lang.");
  if (!lead.source) return validationError("sourceRequired", "De aanvraagbron is ongeldig.");
  if (charLength(lead.source) > LIMITS.source) return validationError("sourceTooLong", "De aanvraagbron is ongeldig.");
  if (charLength(lead.requestId) > LIMITS.requestId) return validationError("requestIdTooLong", "De aanvraagreferentie is ongeldig.");
  if (charLength(lead.packageInterest) > LIMITS.packageInterest || charLength(lead.carePackage) > LIMITS.carePackage) return validationError("selectionTooLong", "Een gekozen optie is ongeldig.");
  if (!lead.termsAccepted) return validationError("termsRequired", "Akkoord met de voorwaarden is nodig.");
  const rpcPayload = leadRpcPayload(lead, { CONTEXT: "test" });
  if (Buffer.byteLength(JSON.stringify(rpcPayload.metadata), "utf8") > 65536) return validationError("metadataTooLarge", "De aanvraagmetadata is te groot.");
  if (Buffer.byteLength(JSON.stringify(rpcPayload), "utf8") > REQUEST_MAX_BYTES) return validationError("rpcPayloadTooLarge", "De aanvraag is te groot.");
  return null;
}

function readRequestBody(event) {
  const source = typeof event.body === "string" ? event.body : "";
  if (!event.isBase64Encoded) return { valid: true, text: source, bytes: Buffer.byteLength(source, "utf8") };
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(source)) return { valid: false, text: "", bytes: 0 };
  const decoded = Buffer.from(source, "base64");
  return { valid: true, text: decoded.toString("utf8"), bytes: decoded.length };
}

function rpcHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json",
    Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public",
  };
}

function requireIntakeResult(value) {
  const leadId = text(value?.leadId || value?.lead?.id);
  if (!value || typeof value !== "object" || value.status !== "resolved" || !leadId
    || typeof value.created !== "boolean" || typeof value.duplicate !== "boolean"
    || typeof value.idempotentReplay !== "boolean") throw storageError("STORAGE_INVALID_RESPONSE");
  return value;
}

function classifyIntake(intake, reconciled) {
  if (reconciled) return intake.duplicate ? "reconciledDuplicate" : "reconciledCreated";
  if (intake.idempotentReplay) return "idempotentReplay";
  if (intake.created) return "created";
  if (intake.duplicate) return "duplicate";
  throw storageError("STORAGE_INVALID_RESPONSE");
}

function ambiguousStorageError(cause) {
  const error = storageError(cause?.name === "TimeoutError" || cause?.name === "AbortError" ? "STORAGE_CREATE_TIMEOUT" : "STORAGE_CREATE_TRANSPORT");
  error.ambiguous = true;
  return error;
}

function definitiveStorageError(status) {
  const error = storageError("STORAGE_CREATE_DEFINITIVE");
  error.statusCode = status >= 500 ? 503 : 400;
  return error;
}

function storageError(code) {
  const error = new Error("Aanvraag kon niet veilig worden verwerkt.");
  error.code = code;
  error.statusCode = 503;
  error.ambiguous = false;
  return error;
}

function validationError(code, message) { return { code, message }; }
function charLength(value) { return Array.from(text(value)).length; }
function normalizeWhitespace(value) { return text(value).replace(/\s+/gu, " "); }
function text(value) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }

function hasHoneypotSignal(payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, "_gotcha")) return false;
  return typeof payload._gotcha !== "string" || payload._gotcha.trim().length > 0;
}
function safeReason(value) {
  const reason = text(value);
  return /^(?:ABUSE|STORAGE|SMOKE)_[A-Z0-9_]+$/.test(reason) ? reason : "INTERNAL_ERROR";
}

function recordOutcome(logger, classification, requestReference, details = {}) {
  const safeDetails = {};
  for (const key of ["reason", "reconciled", "storageClassification"]) {
    if (details[key] !== undefined) safeDetails[key] = details[key];
  }
  if (typeof logger?.info === "function") logger.info("lead_intake_outcome", { classification, requestReference, ...safeDetails });
}

function timelineInput(lead, intake, smokeControl = null) {
  return {
    eventType: "lead_created", title: `Nieuwe lead ontvangen: ${lead.name}`,
    description: lead.company ? `${lead.company} heeft een aanvraag ingestuurd.` : "Er is een nieuwe aanvraag ingestuurd.",
    module: "sales", referenceType: "lead", referenceId: text(intake.leadId || intake.lead?.id),
    actorName: lead.name, actorRole: "lead", icon: "🔔", severity: "info",
    metadata: {
      dedupeKey: `lead_created:${lead.email}:${lead.submittedAt}`,
      leadEmail: lead.email,
      leadName: lead.name,
      company: lead.company,
      packageInterest: lead.packageInterest,
      ...(smokeControl?.suppressProviders ? { stagingSmoke: true, suppressionReason: "staging_smoke" } : {}),
    },
  };
}

function adminEmailInput(lead, companySettings, env) {
  return {
    to: env.LEAD_TO_EMAIL || env.ADMIN_EMAIL || companySettings.primaryEmail,
    from: env.LEAD_FROM_EMAIL || env.FROM_EMAIL || undefined,
    replyTo: lead.email,
    subject: `Nieuwe aanvraag Max Webstudio - ${lead.packageInterest} - ${lead.name}`,
    html: buildLeadHtml(lead), text: buildLeadText(lead), templateKey: "lead_notification",
    templateName: "Nieuwe lead notificatie", triggeredBy: "homepage_contact_form",
    metadata: { leadEmail: lead.email, leadName: lead.name, company: lead.company, source: lead.source, packageInterest: lead.packageInterest },
  };
}

function buildLeadHtml(lead) {
  const rows = [
    ["Naam", lead.name],
    ["Bedrijfsnaam", lead.company || "-"],
    ["E-mailadres", lead.email],
    ["Telefoonnummer", lead.phone || "-"],
    ["Pakket / interesse", lead.packageInterest || "-"],
    ["Hosting & onderhoud", lead.carePackage || "-"],
    ["Akkoord voorwaarden", lead.termsAccepted ? "Ja" : "Nee"],
    ["Bron", lead.source],
    ["Datum/tijd", lead.submittedAt],
  ];

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.6">
      <h1 style="margin:0 0 16px;font-size:24px">Nieuwe aanvraag via Max Webstudio</h1>
      <p style="margin:0 0 22px">Er is een nieuwe aanvraag binnengekomen via het homepageformulier.</p>
      <table style="width:100%;border-collapse:collapse">
        <tbody>
          ${rows
            .map(
              ([label, value]) => `
                <tr>
                  <td style="padding:10px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;width:190px">${escapeHtml(label)}</td>
                  <td style="padding:10px 12px;border:1px solid #e2e8f0">${escapeHtml(value)}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <h2 style="margin:24px 0 8px;font-size:18px">Bericht</h2>
      <p style="white-space:pre-line;margin:0;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">${escapeHtml(lead.message)}</p>
    </div>
  `;
}

function buildLeadText(lead) {
  return [
    "Nieuwe aanvraag via Max Webstudio",
    "",
    `Naam: ${lead.name}`,
    `Bedrijfsnaam: ${lead.company || "-"}`,
    `E-mailadres: ${lead.email}`,
    `Telefoonnummer: ${lead.phone || "-"}`,
    `Pakket / interesse: ${lead.packageInterest || "-"}`,
    `Hosting & onderhoud: ${lead.carePackage || "-"}`,
    `Akkoord voorwaarden: ${lead.termsAccepted ? "Ja" : "Nee"}`,
    `Bron: ${lead.source}`,
    `Datum/tijd: ${lead.submittedAt}`,
    "",
    "Bericht:",
    lead.message,
  ].join("\n");
}

async function sendCustomerConfirmation(lead, dependencies, companySettings = {}) {
  try {
    return await dependencies.sendEmail({
      to: lead.email,
      from: dependencies.env.LEAD_FROM_EMAIL || dependencies.env.FROM_EMAIL || undefined,
      subject: "Bedankt voor je aanvraag bij Max Webstudio 🚀",
      html: buildCustomerConfirmationHtml(lead, dependencies, companySettings),
      text: buildCustomerConfirmationText(lead, dependencies, companySettings),
      templateKey: "lead_customer_confirmation",
      templateName: "Lead klantbevestiging",
      triggeredBy: "homepage_contact_form",
      metadata: {
        leadName: lead.name,
        company: lead.company,
        source: lead.source,
        packageInterest: lead.packageInterest,
      },
    });
  } catch (error) {
    return { sent: false, warning: "Klantbevestiging kon niet worden verzonden." };
  }
}

function buildCustomerConfirmationHtml(lead, dependencies, companySettings) {
  const whatsappLink = dependencies.getWhatsappLink(companySettings);
  const rows = [
    ["Naam", lead.name],
    ["Bedrijf", lead.company || "-"],
    ["E-mailadres", lead.email],
    ["Telefoonnummer", lead.phone || "-"],
    ["Gekozen pakket", lead.packageInterest || "-"],
    ["Hosting & onderhoud", lead.carePackage || "-"],
    ["Bericht", lead.message],
  ];

  return `
    <!doctype html>
    <html lang="nl">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Bedankt voor je aanvraag bij Max Webstudio</title>
      </head>
      <body style="margin:0;padding:0;background:#f3f7fc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f7fc;">
          <tr>
            <td align="center" style="padding:32px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;">
                <tr>
                  <td style="padding:0 0 18px;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:48px;height:48px;border-radius:14px;background:#06121f;text-align:center;vertical-align:middle;">
                          ${buildEmailLogo()}
                        </td>
                        <td style="padding-left:12px;font-size:18px;font-weight:900;color:#06121f;">Max Webstudio</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="border-radius:28px;background:#ffffff;border:1px solid #dbeafe;box-shadow:0 20px 60px rgba(15,23,42,0.10);overflow:hidden;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:34px 34px 24px;background:linear-gradient(135deg,#0b5cff,#19c2ff);color:#ffffff;">
                          <p style="margin:0 0 10px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-weight:900;">Aanvraag ontvangen</p>
                          <h1 style="margin:0;font-size:32px;line-height:1.08;">Bedankt voor je aanvraag!</h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:30px 34px 10px;font-size:16px;line-height:1.7;color:#334155;">
                          <p style="margin:0 0 16px;">Hi ${escapeHtml(lead.name)},</p>
                          <p style="margin:0 0 16px;">Bedankt voor je aanvraag bij Max Webstudio.</p>
                          <p style="margin:0 0 16px;">We hebben jouw aanvraag goed ontvangen en nemen meestal binnen 24 uur persoonlijk contact met je op.</p>
                          <p style="margin:0;">Ondertussen kun je alvast onze demo-websites bekijken of ons direct een WhatsApp-bericht sturen.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:20px 34px 6px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #dbeafe;border-radius:18px;overflow:hidden;">
                            ${rows
                              .map(
                                ([label, value]) => `
                                  <tr>
                                    <td style="padding:13px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:900;width:190px;">${escapeHtml(label)}</td>
                                    <td style="padding:13px 16px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(value)}</td>
                                  </tr>`
                              )
                              .join("")}
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:24px 34px 8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="padding:0 12px 12px 0;">
                                <a href="https://maxwebstudio.nl/#projecten" style="display:inline-block;padding:14px 18px;border-radius:999px;background:#155eef;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;">Bekijk onze demo-websites</a>
                              </td>
                              <td style="padding:0 0 12px;">
                                <a href="${escapeHtml(whatsappLink)}" style="display:inline-block;padding:14px 18px;border-radius:999px;background:#ecfdf3;color:#047857;text-decoration:none;font-size:14px;font-weight:900;">WhatsApp Max Webstudio</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:18px 34px 34px;color:#334155;font-size:15px;line-height:1.7;">
                          <p style="margin:0;">Met vriendelijke groet,</p>
                          <p style="margin:8px 0 0;font-weight:900;color:#0f172a;">Max Webstudio</p>
                          <p style="margin:4px 0 0;color:#64748b;">Professionele websites sinds 2018.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function buildCustomerConfirmationText(lead, dependencies, companySettings) {
  return [
    "Bedankt voor je aanvraag!",
    "",
    `Hi ${lead.name},`,
    "",
    "Bedankt voor je aanvraag bij Max Webstudio.",
    "We hebben jouw aanvraag goed ontvangen en nemen meestal binnen 24 uur persoonlijk contact met je op.",
    "Ondertussen kun je alvast onze demo-websites bekijken of ons direct een WhatsApp-bericht sturen.",
    "",
    `Naam: ${lead.name}`,
    `Bedrijf: ${lead.company || "-"}`,
    `E-mailadres: ${lead.email}`,
    `Telefoonnummer: ${lead.phone || "-"}`,
    `Gekozen pakket: ${lead.packageInterest || "-"}`,
    `Hosting & onderhoud: ${lead.carePackage || "-"}`,
    "",
    "Bericht:",
    lead.message,
    "",
    "Demo-websites: https://maxwebstudio.nl/#projecten",
    `WhatsApp Max Webstudio: ${dependencies.getWhatsappLink(companySettings)}`,
    "",
    "Met vriendelijke groet,",
    "Max Webstudio",
    "Professionele websites sinds 2018.",
  ].join("\n");
}

function buildEmailLogo() {
  return `
    <svg width="32" height="32" viewBox="0 0 80 80" role="img" aria-label="Max Webstudio logo" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="68" height="68" rx="18" fill="#06121f"/>
      <path d="M22 53V27h7.3L40 42.2 50.7 27H58v26h-8.1V39.1l-7.5 10.2h-4.8l-7.5-10.2V53H22Z" fill="#ffffff"/>
      <path d="M58 25h9v9" fill="none" stroke="#19c2ff" stroke-width="4" stroke-linecap="round"/>
    </svg>
  `;
}

exports._private = {
  LIMITS,
  REQUEST_MAX_BYTES,
  createHandler,
  classifyIntake,
  hasHoneypotSignal,
  leadIdempotencyKey,
  leadRpcPayload,
  persistLead,
  persistLeadWithReconciliation,
  sanitizeLead,
  validateLead,
};

function deliverySucceededOrSuppressed(value) {
  return Boolean(value?.sent || value?.suppressed);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}
