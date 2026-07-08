const { findEmailLogByProviderMessageId, updateEmailLog } = require("./services/mailLogService");

const eventStatusMap = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "sent",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
  }

  try {
    const payload = parsePayload(event.body);
    const eventType = cleanText(payload.type || payload.event);
    const providerMessageId = extractProviderMessageId(payload);
    const nextStatus = eventStatusMap[eventType] || normalizeEventStatus(eventType);

    if (!providerMessageId) {
      console.warn("Resend webhook received without message id", { type: eventType || "unknown" });
      return jsonResponse(202, { success: true, processed: false, reason: "missing_provider_message_id" });
    }

    const log = await findEmailLogByProviderMessageId(providerMessageId);
    if (!log?.id) {
      console.warn("Resend webhook received for unknown message", { type: eventType || "unknown", providerMessageId });
      return jsonResponse(202, { success: true, processed: false, reason: "email_log_not_found" });
    }

    const metadata = mergeWebhookMetadata(log.metadata, sanitizeWebhookEvent(payload));
    await updateEmailLog(log.id, {
      status: nextStatus || log.status || "sent",
      metadata,
    });

    return jsonResponse(200, { success: true, processed: true });
  } catch (error) {
    console.error("Resend webhook error", { message: error.message, status: error.status || 500 });
    return jsonResponse(200, { success: false, processed: false, error: "Webhook event kon niet worden verwerkt." });
  }
};

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

function mergeWebhookMetadata(existing, event) {
  const metadata = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  const events = Array.isArray(metadata.resendEvents) ? metadata.resendEvents.slice(-19) : [];
  events.push(event);
  return {
    ...metadata,
    resendEvents: events,
    lastResendEvent: event,
  };
}

function sanitizeWebhookEvent(payload = {}) {
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  return {
    type: cleanText(payload.type || payload.event),
    receivedAt: new Date().toISOString(),
    providerMessageId: extractProviderMessageId(payload),
    createdAt: cleanText(payload.created_at || payload.createdAt || data.created_at || data.createdAt),
    to: cleanText(Array.isArray(data.to) ? data.to.join(", ") : data.to || payload.to),
    from: cleanText(data.from || payload.from),
    subject: cleanText(data.subject || payload.subject),
    clickUrl: cleanText(data.click?.url || data.url),
  };
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
