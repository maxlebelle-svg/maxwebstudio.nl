const { verifyAdmin } = require("./_admin-auth");
const {
  archiveTimelineEvent,
  createActivityEvent,
  listTimelineEvents,
  markAllTimelineEventsRead,
  markTimelineEventRead,
} = require("./services/timelineService");

exports.handler = async (event) => {
  try {
    const adminCheck = await verifyAdmin(event, jsonResponse, {
      module: "notification_center",
      action: "activity_events",
      allowedRoles: ["super_admin", "admin", "sales_manager", "sales_partner"],
    });
    if (!adminCheck.success) return adminCheck.response;

    if (event.httpMethod === "GET") {
      const params = getQueryParams(event);
      const rows = await listTimelineEvents({
        ...Object.fromEntries(params.entries()),
        global: params.get("global") || "true",
      });
      return jsonResponse(200, {
        success: true,
        activityEvents: rows.map(sanitizeActivityEvent),
      });
    }

    if (event.httpMethod === "POST") {
      const payload = parsePayload(event.body);
      const action = cleanText(payload.action).toLowerCase();

      if (action === "read") {
        const updated = await markTimelineEventRead(payload.id || payload.eventId);
        return jsonResponse(200, { success: true, activityEvent: sanitizeActivityEvent(updated) });
      }

      if (action === "read_all") {
        const updated = await markAllTimelineEventsRead({ global: "true" });
        return jsonResponse(200, { success: true, updatedCount: updated.length });
      }

      if (action === "archive") {
        const updated = await archiveTimelineEvent(payload.id || payload.eventId);
        return jsonResponse(200, { success: true, activityEvent: sanitizeActivityEvent(updated) });
      }

      const created = await createActivityEvent({
        ...payload,
        actorName: payload.actorName || payload.actor?.name || adminCheck.admin?.email || "Max CRM",
        actorRole: payload.actorRole || payload.actor?.role || adminCheck.admin?.role || "",
        userId: payload.userId || adminCheck.admin?.id,
        isGlobal: payload.isGlobal ?? true,
      });
      if (created?.skipped) {
        return jsonResponse(202, { success: true, skipped: true, reason: created.reason });
      }
      return jsonResponse(201, { success: true, activityEvent: sanitizeActivityEvent(created) });
    }

    return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });
  } catch (error) {
    console.error("Admin activity events error", {
      message: error.message,
      statusCode: error.statusCode || error.status || 500,
    });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Notification Center kon niet worden geladen.",
    });
  }
};

function sanitizeActivityEvent(event = {}) {
  return {
    id: cleanText(event.id),
    createdAt: cleanText(event.created_at),
    updatedAt: cleanText(event.updated_at),
    eventType: cleanText(event.event_type),
    severity: cleanText(event.severity) || "info",
    title: cleanText(event.title),
    description: cleanText(event.description),
    actorId: cleanText(event.user_id),
    actorName: cleanText(event.actor_name),
    actorRole: cleanText(event.actor_role),
    customerId: cleanText(event.customer_id),
    leadId: cleanText(event.lead_id),
    invoiceId: cleanText(event.invoice_id),
    emailLogId: cleanText(event.email_log_id),
    relatedType: cleanText(event.related_type || event.reference_type),
    relatedId: cleanText(event.related_id || event.reference_id),
    module: cleanText(event.module),
    referenceType: cleanText(event.reference_type),
    referenceId: cleanText(event.reference_id),
    icon: cleanText(event.icon),
    isGlobal: Boolean(event.is_global),
    isRead: Boolean(event.is_read),
    readAt: cleanText(event.read_at),
    archivedAt: cleanText(event.archived_at),
    metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : {},
  };
}

function getQueryParams(event) {
  if (event.rawQuery) return new URLSearchParams(event.rawQuery);
  const params = new URLSearchParams();
  Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, value);
  });
  return params;
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
