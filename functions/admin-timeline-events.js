const { verifyAdmin } = require("./_admin-auth");
const { listCustomerTimeline, listActivityFeed } = require("./services/timelineService");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
    }

    const adminCheck = await verifyAdmin(event, jsonResponse, {
      module: "timeline",
      action: "timeline_events",
      allowedRoles: ["super_admin", "admin", "sales_manager"],
    });
    if (!adminCheck.success) return adminCheck.response;

    const params = getQueryParams(event);
    const filters = Object.fromEntries(params.entries());
    const customerId = cleanText(params.get("customerId") || params.get("customer_id"));
    const global = cleanText(params.get("global") || params.get("isGlobal") || params.get("is_global")).toLowerCase();
    const rows = customerId
      ? await listCustomerTimeline(customerId, filters)
      : await listActivityFeed({ ...filters, global: global || "true" });

    return jsonResponse(200, {
      success: true,
      timelineEvents: rows.map(sanitizeTimelineEvent),
    });
  } catch (error) {
    console.error("Admin timeline events error", { message: error.message, statusCode: error.statusCode || error.status || 500 });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Timeline kon niet worden geladen.",
    });
  }
};

function sanitizeTimelineEvent(event = {}) {
  return {
    id: cleanText(event.id),
    createdAt: cleanText(event.created_at),
    updatedAt: cleanText(event.updated_at),
    customerId: cleanText(event.customer_id),
    leadId: cleanText(event.lead_id),
    userId: cleanText(event.user_id),
    eventType: cleanText(event.event_type),
    title: cleanText(event.title),
    description: cleanText(event.description),
    module: cleanText(event.module),
    referenceType: cleanText(event.reference_type),
    referenceId: cleanText(event.reference_id),
    invoiceId: cleanText(event.invoice_id),
    emailLogId: cleanText(event.email_log_id),
    relatedType: cleanText(event.related_type),
    relatedId: cleanText(event.related_id),
    actorName: cleanText(event.actor_name),
    actorRole: cleanText(event.actor_role),
    icon: cleanText(event.icon),
    severity: cleanText(event.severity),
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
