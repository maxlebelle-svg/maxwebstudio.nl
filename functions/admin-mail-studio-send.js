const { verifyAdmin } = require("./_admin-auth");
const { sendTrackedEmail } = require("./services/resendMailService");

exports.handler = async (event) => {
  try {
    const adminCheck = await verifyAdmin(event, jsonResponse, {
      module: "mail_studio",
      action: "send_email",
      allowedRoles: ["super_admin", "admin", "developer"],
    });
    if (!adminCheck.success) return adminCheck.response;

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });
    }

    const payload = parsePayload(event.body);
    const validation = validateMailStudioPayload(payload);
    if (!validation.valid) {
      return jsonResponse(400, { success: false, error: validation.error });
    }

    const result = await sendTrackedEmail({
      to: payload.to,
      bcc: payload.bcc,
      replyTo: payload.replyTo,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      templateKey: payload.templateKey || "mail_studio",
      templateName: payload.templateName || "Mail Studio template",
      customerId: payload.customerId,
      leadId: payload.leadId,
      invoiceId: payload.invoiceId,
      projectId: payload.projectId,
      triggeredBy: "mail_studio",
      triggeredByUserId: adminCheck.admin?.id,
      metadata: {
        ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
        source: "mail_studio",
        htmlSource: "getResendPayload.html",
        preheader: cleanText(payload.preheader),
        sentBy: adminCheck.admin?.email || adminCheck.source || "admin",
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
  } catch (error) {
    console.error("Admin Mail Studio send error", { message: error.message, statusCode: error.statusCode || error.status || 500 });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Mail Studio kon de e-mail niet verzenden.",
    });
  }
};

function validateMailStudioPayload(payload = {}) {
  if (!isEmail(payload.to)) return { valid: false, error: "Vul een geldige ontvanger in." };
  if (!cleanText(payload.subject)) return { valid: false, error: "Onderwerp ontbreekt." };
  if (!cleanText(payload.html)) return { valid: false, error: "E-mail HTML ontbreekt." };

  const html = String(payload.html || "");
  const checks = [
    ["<!doctype html", "De volledige HTML-template ontbreekt."],
    ["max-webstudio-logo-mark.svg", "Het Max Webstudio-logo ontbreekt in de verzend-HTML."],
    ["class=\"mws-cta\"", "De CTA ontbreekt in de verzend-HTML."],
    ["info@maxwebstudio.nl", "De footer/contactregel ontbreekt in de verzend-HTML."],
    ["wa.me/31851302326", "De WhatsApp-knop ontbreekt in de verzend-HTML."],
    ["instagram.com/maxwebstudio.nl", "De social footer ontbreekt in de verzend-HTML."],
    ["linkedin.com/company/130444905", "De social footer ontbreekt in de verzend-HTML."],
    ["@media (max-width: 620px)", "Responsive e-mail CSS ontbreekt."],
    ["supported-color-schemes", "Dark-mode ondersteuning ontbreekt."],
  ];
  const missing = checks.find(([needle]) => !html.toLowerCase().includes(needle.toLowerCase()));
  if (missing) return { valid: false, error: missing[1] };

  return { valid: true, error: "" };
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

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function isEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanText(value));
}

function cleanText(value) {
  return String(value || "").trim();
}
