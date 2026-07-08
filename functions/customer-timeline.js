const { verifyAdmin } = require("./_admin-auth");
const { listCustomerTimeline } = require("./services/timelineService");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
    }

    const adminCheck = await verifyAdmin(event, jsonResponse, {
      module: "timeline",
      action: "customer_timeline",
      allowedRoles: ["super_admin", "admin", "sales_manager", "sales_partner"],
    });
    if (!adminCheck.success) return adminCheck.response;

    const params = getQueryParams(event);
    const customerId = cleanText(params.get("customerId") || params.get("customer_id") || customerIdFromPath(event.path));
    if (!customerId) {
      return jsonResponse(400, { success: false, error: "customerId ontbreekt." });
    }

    const rows = await listCustomerTimeline(customerId, Object.fromEntries(params.entries()));
    return jsonResponse(200, {
      success: true,
      customerId,
      timelineEvents: rows.map(sanitizeTimelineEvent),
    });
  } catch (error) {
    console.error("Customer timeline error", { message: error.message, statusCode: error.statusCode || error.status || 500 });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Customer timeline kon niet worden geladen.",
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

function customerIdFromPath(path = "") {
  const parts = String(path || "").split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "");
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
