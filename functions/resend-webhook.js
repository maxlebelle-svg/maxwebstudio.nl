const crypto = require("node:crypto");
const { findEmailLogByProviderMessageId, updateEmailLog } = require("./services/mailLogService");
const { createActivityEvent } = require("./services/timelineService");

const eventStatusMap = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "sent",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
};

function createHandler(dependencies = {}) {
  const findLog = dependencies.findEmailLogByProviderMessageId || findEmailLogByProviderMessageId;
  const updateLog = dependencies.updateEmailLog || updateEmailLog;
  const createActivity = dependencies.createActivityEvent || createActivityEvent;
  const env = dependencies.env || process.env;
  const now = dependencies.now || (() => Date.now());

  return async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
  }

  try {
    const rawBody = String(event.body || "");
    const verification = verifySvixSignature({
      payload: rawBody,
      headers: event.headers || {},
      secret: env.RESEND_WEBHOOK_SECRET,
      now: now(),
    });
    if (!verification.ok) {
      console.warn("Resend webhook verification rejected", { reason: verification.reason });
      return jsonResponse(verification.reason === "missing_secret" ? 503 : 401, {
        success: false,
        processed: false,
        error: verification.reason === "missing_secret" ? "Webhookverificatie is nog niet geconfigureerd." : "Webhookverificatie mislukt.",
      });
    }

    const payload = parsePayload(rawBody);
    const eventType = cleanText(payload.type || payload.event);
    const providerMessageId = extractProviderMessageId(payload);
    const requestedStatus = eventStatusMap[eventType] || normalizeEventStatus(eventType);

    if (!providerMessageId) {
      console.warn("Resend webhook received without message id", { type: eventType || "unknown" });
      return jsonResponse(202, { success: true, processed: false, reason: "missing_provider_message_id" });
    }

    const log = await findLog(providerMessageId);
    if (!log?.id) {
      console.warn("Resend webhook received for unknown message", { type: eventType || "unknown", providerMessageId });
      return jsonResponse(202, { success: true, processed: false, reason: "email_log_not_found" });
    }

    if (hasProcessedEvent(log.metadata, verification.eventId)) {
      return jsonResponse(200, { success: true, processed: false, duplicate: true });
    }

    const nextStatus = resolveNextStatus(log.status, requestedStatus);
    const statusChanged = nextStatus !== cleanText(log.status).toLowerCase();
    const metadata = mergeWebhookMetadata(log.metadata, sanitizeWebhookEvent(payload, verification.eventId));
    await updateLog(log.id, {
      status: nextStatus,
      metadata,
    });
    if (statusChanged) {
      await safeCreateActivity(webhookActivityEvent(log, payload, requestedStatus), createActivity);
    }

    return jsonResponse(200, { success: true, processed: true });
  } catch (error) {
    console.error("Resend webhook error", { message: error.message, status: error.status || 500 });
    return jsonResponse(200, { success: false, processed: false, error: "Webhook event kon niet worden verwerkt." });
  }
};
}

exports.handler = createHandler();

function extractProviderMessageId(payload = {}) {
  return cleanText(
    payload.data?.email_id
    || payload.data?.id
    || payload.email_id
    || payload.emailId
    || payload.message_id
    || payload.messageId
    || payload.id
  );
}

async function safeCreateActivity(input, createActivity = createActivityEvent) {
  if (!input) return null;
  try {
    return await createActivity(input);
  } catch (error) {
    console.error("Resend webhook activity event failed", { message: error.message, status: error.status || 0 });
    return null;
  }
}

function webhookActivityEvent(log = {}, payload = {}, status = "") {
  const normalizedStatus = cleanText(status || normalizeEventStatus(payload.type || payload.event));
  const eventMap = {
    delivered: { eventType: "email_delivered", title: "E-mail afgeleverd", severity: "success" },
    opened: { eventType: "email_opened", title: "E-mail geopend", severity: "info" },
    clicked: { eventType: "email_clicked", title: "E-mail link aangeklikt", severity: "success" },
    bounced: { eventType: "email_failed", title: "E-mail bounced", severity: "error" },
    complained: { eventType: "email_failed", title: "E-mail klacht ontvangen", severity: "warning" },
  };
  const config = eventMap[normalizedStatus];
  if (!config) return null;
  return {
    eventType: config.eventType,
    severity: config.severity,
    title: config.title,
    description: cleanText(log.subject) || "Resend webhook-event verwerkt.",
    customerId: log.customer_id,
    leadId: log.lead_id,
    invoiceId: log.invoice_id,
    emailLogId: log.id,
    module: "email",
    relatedType: "email_log",
    relatedId: log.id,
    referenceType: "email_log",
    referenceId: log.id,
    actorName: "Resend",
    icon: normalizedStatus === "clicked" ? "🖱" : "📧",
    metadata: {
      dedupeKey: `${config.eventType}:${log.id}:${cleanText(payload.created_at || payload.createdAt || Date.now())}`,
      providerMessageId: cleanText(log.provider_message_id),
      resendEventType: cleanText(payload.type || payload.event),
    },
  };
}

function mergeWebhookMetadata(existing, event) {
  const metadata = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  const events = Array.isArray(metadata.resendEvents) ? metadata.resendEvents.slice(-19) : [];
  const eventIds = Array.isArray(metadata.resendEventIds) ? metadata.resendEventIds.map(cleanText).filter(Boolean).slice(-99) : [];
  events.push(event);
  if (event.svixId && !eventIds.includes(event.svixId)) eventIds.push(event.svixId);
  return {
    ...metadata,
    resendEvents: events,
    resendEventIds: eventIds,
    lastResendEvent: event,
  };
}

function sanitizeWebhookEvent(payload = {}, eventId = "") {
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  return {
    type: cleanText(payload.type || payload.event),
    svixId: cleanText(eventId),
    receivedAt: new Date().toISOString(),
    providerMessageId: extractProviderMessageId(payload),
    createdAt: cleanText(payload.created_at || payload.createdAt || data.created_at || data.createdAt),
    to: cleanText(Array.isArray(data.to) ? data.to.join(", ") : data.to || payload.to),
    from: cleanText(data.from || payload.from),
    subject: cleanText(data.subject || payload.subject),
    clickUrl: cleanText(data.click?.url || data.url),
  };
}

function hasProcessedEvent(metadata, eventId) {
  if (!eventId) return false;
  if (Array.isArray(metadata?.resendEventIds) && metadata.resendEventIds.some((id) => cleanText(id) === eventId)) return true;
  const events = Array.isArray(metadata?.resendEvents) ? metadata.resendEvents : [];
  return events.some((event) => cleanText(event?.svixId) === eventId);
}

function resolveNextStatus(current, requested) {
  const existing = cleanText(current).toLowerCase() || "sent";
  const next = cleanText(requested).toLowerCase();
  if (!next) return existing;
  const terminal = new Set(["bounced", "complained"]);
  if (terminal.has(existing)) return existing;
  if (terminal.has(next)) return next;
  const rank = { pending: 0, sent: 1, delivered: 2, opened: 3, clicked: 4 };
  return (rank[next] ?? -1) >= (rank[existing] ?? -1) ? next : existing;
}

function verifySvixSignature({ payload, headers = {}, secret, now = Date.now(), toleranceSeconds = 300 }) {
  const configuredSecret = cleanText(secret);
  if (!configuredSecret) return { ok: false, reason: "missing_secret" };
  const eventId = header(headers, "svix-id");
  const timestamp = header(headers, "svix-timestamp");
  const signatureHeader = header(headers, "svix-signature");
  if (!eventId || !/^\d{10,13}$/.test(timestamp) || !signatureHeader) return { ok: false, reason: "missing_headers" };
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(now / 1000) - timestampSeconds) > toleranceSeconds) {
    return { ok: false, reason: "stale_timestamp" };
  }

  let key;
  try {
    const encoded = configuredSecret.startsWith("whsec_") ? configuredSecret.slice(6) : configuredSecret;
    key = Buffer.from(encoded, "base64");
  } catch {
    return { ok: false, reason: "invalid_secret" };
  }
  if (!key.length) return { ok: false, reason: "invalid_secret" };
  const expected = crypto.createHmac("sha256", key).update(`${eventId}.${timestamp}.${payload}`).digest();
  const signatures = signatureHeader.split(/\s+/).map((part) => part.split(",", 2)).filter(([version, value]) => version === "v1" && value);
  const valid = signatures.some(([, value]) => {
    try {
      const candidate = Buffer.from(value, "base64");
      return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
    } catch {
      return false;
    }
  });
  return valid ? { ok: true, eventId, timestamp: timestampSeconds } : { ok: false, reason: "invalid_signature" };
}

function header(headers, name) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === target) return cleanText(Array.isArray(value) ? value[0] : value);
  }
  return "";
}

function normalizeEventStatus(eventType) {
  const event = cleanText(eventType).toLowerCase();
  if (event.includes("delivered")) return "delivered";
  if (event.includes("bounce")) return "bounced";
  if (event.includes("complain")) return "complained";
  if (event.includes("open")) return "opened";
  if (event.includes("click")) return "clicked";
  if (event.includes("sent")) return "sent";
  return "";
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Ongeldige JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

function cleanText(value) {
  return String(value || "").trim();
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

exports._private = {
  createHandler,
  hasProcessedEvent,
  resolveNextStatus,
  sanitizeWebhookEvent,
  verifySvixSignature,
};
