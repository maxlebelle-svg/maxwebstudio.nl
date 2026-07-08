const { verifyAdmin } = require("./_admin-auth");
const { listEmailLogs, getEmailLog } = require("./services/mailLogService");
const { sendTrackedEmail } = require("./services/resendMailService");

exports.handler = async (event) => {
  try {
    const adminCheck = await verifyAdmin(event, jsonResponse, { module: "mail_center", action: "email_logs" });
    if (!adminCheck.success) return adminCheck.response;

    if (event.httpMethod === "GET") {
      const params = getQueryParams(event);
      const id = cleanText(params.get("id"));
      if (id) {
        const log = await getEmailLog(id);
        if (!log) return jsonResponse(404, { success: false, error: "Mail-log niet gevonden." });
        return jsonResponse(200, { success: true, emailLog: sanitizeEmailLog(log, { detail: true }) });
      }

      const logs = await listEmailLogs(Object.fromEntries(params.entries()));
      return jsonResponse(200, {
        success: true,
        emailLogs: logs.map((log) => sanitizeEmailLog(log)),
      });
    }

    if (event.httpMethod === "POST") {
      const payload = parsePayload(event.body);
      const action = cleanText(payload.action).toLowerCase();
      if (action !== "retry") return jsonResponse(400, { success: false, error: "Kies een geldige mailactie." });

      const log = await getEmailLog(payload.id || payload.emailLogId);
      if (!log) return jsonResponse(404, { success: false, error: "Mail-log niet gevonden." });
      if (!cleanText(log.to_email) || !cleanText(log.subject)) {
        return jsonResponse(400, { success: false, error: "Deze mail mist ontvanger of onderwerp en kan niet opnieuw worden verstuurd." });
      }

      const result = await sendTrackedEmail({
        to: log.to_email,
        from: formatFrom(log.from_name, log.from_email) || undefined,
        replyTo: log.reply_to || undefined,
        subject: log.subject,
        html: log.html_body || undefined,
        text: log.text_body || undefined,
        templateKey: log.template_key || "retry",
        templateName: log.template_name || "Opnieuw verzonden mail",
        customerId: log.customer_id,
        leadId: log.lead_id,
        invoiceId: log.invoice_id,
        projectId: log.project_id,
        triggeredBy: "admin_mail_center_retry",
        triggeredByUserId: adminCheck.admin?.id,
        metadata: {
          retryOfEmailLogId: log.id,
          retryOfProviderMessageId: log.provider_message_id || "",
          retriedBy: adminCheck.admin?.email || adminCheck.source || "admin",
        },
      });

      return jsonResponse(result.sent ? 200 : 502, {
        success: Boolean(result.sent),
        email: {
          requested: true,
          sent: Boolean(result.sent),
          id: cleanText(result.id),
          logId: cleanText(result.logId),
          warning: cleanText(result.warning),
        },
      });
    }

    return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });
  } catch (error) {
    console.error("Admin email logs error", { message: error.message, statusCode: error.statusCode || error.status || 500 });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Mail Center kon niet worden geladen.",
    });
  }
};

function sanitizeEmailLog(log = {}, options = {}) {
  const base = {
    id: cleanText(log.id),
    createdAt: cleanText(log.created_at),
    updatedAt: cleanText(log.updated_at),
    direction: cleanText(log.direction),
    status: cleanText(log.status),
    provider: cleanText(log.provider),
    providerMessageId: cleanText(log.provider_message_id),
    fromEmail: cleanText(log.from_email),
    fromName: cleanText(log.from_name),
    toEmail: cleanText(log.to_email),
    toName: cleanText(log.to_name),
    replyTo: cleanText(log.reply_to),
    subject: cleanText(log.subject),
    templateKey: cleanText(log.template_key),
    templateName: cleanText(log.template_name),
    customerId: cleanText(log.customer_id),
    leadId: cleanText(log.lead_id),
    invoiceId: cleanText(log.invoice_id),
    projectId: cleanText(log.project_id),
    triggeredBy: cleanText(log.triggered_by),
    triggeredByUserId: cleanText(log.triggered_by_user_id),
    errorMessage: cleanText(log.error_message),
    errorCode: cleanText(log.error_code),
    metadata: log.metadata && typeof log.metadata === "object" ? log.metadata : {},
  };
  if (!options.detail) return base;
  return {
    ...base,
    htmlBody: cleanText(log.html_body),
    textBody: cleanText(log.text_body),
  };
}

function formatFrom(name, email) {
  const cleanName = cleanText(name);
  const cleanEmail = cleanText(email);
  if (!cleanEmail) return "";
  return cleanName ? `${cleanName} <${cleanEmail}>` : cleanEmail;
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
