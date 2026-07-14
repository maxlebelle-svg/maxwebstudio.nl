const { verifyAdmin } = require("./_admin-auth");
const { sendTrackedEmail } = require("./services/resendMailService");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createHandler({ sendEmail = sendTrackedEmail, fetchImpl = (...args) => fetch(...args) } = {}) {
  return async (event) => {
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
    const recipient = await resolveRecipient(payload, fetchImpl);

    const result = await sendEmail({
      to: recipient.email,
      bcc: payload.bcc,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      templateKey: payload.templateKey || "mail_studio",
      templateName: payload.templateName || "Mail Studio template",
      customerId: recipient.relationshipType === "customer" ? recipient.relationshipId : null,
      leadId: recipient.relationshipType === "lead" ? recipient.relationshipId : null,
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
        relationshipType: recipient.relationshipType,
        relationshipId: recipient.relationshipId,
      },
      idempotencyKey: cleanText(payload.idempotencyKey).slice(0, 180) || undefined,
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
      recipient,
    });
  } catch (error) {
    console.error("Admin Mail Studio send error", { message: error.message, statusCode: error.statusCode || error.status || 500 });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Mail Studio kon de e-mail niet verzenden.",
    });
  }
  };
}

exports.handler = createHandler();

function validateMailStudioPayload(payload = {}) {
  if (!["lead", "customer"].includes(cleanText(payload.relationshipType).toLowerCase())) return { valid: false, error: "Kies een geldige lead of klant." };
  if (!UUID.test(cleanText(payload.relationshipId))) return { valid: false, error: "Kies een geldige ontvanger." };
  if (!cleanText(payload.subject)) return { valid: false, error: "Onderwerp ontbreekt." };
  if (!cleanText(payload.html)) return { valid: false, error: "E-mail HTML ontbreekt." };
  if (!cleanText(payload.text)) return { valid: false, error: "E-mail platte tekst ontbreekt." };

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

async function resolveRecipient(payload = {}, fetchImpl = (...args) => fetch(...args)) {
  const relationshipType = cleanText(payload.relationshipType).toLowerCase();
  const relationshipId = cleanText(payload.relationshipId);
  const url = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const key = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw httpError(503, "Ontvangercontrole is tijdelijk niet beschikbaar.");
  const table = relationshipType === "lead" ? "leads" : "customers";
  const params = new URLSearchParams({ select: "*", id: `eq.${relationshipId}`, limit: "1" });
  const response = await fetchImpl(`${url}/rest/v1/${table}?${params.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : 400, "De ontvanger kon niet veilig worden gecontroleerd.");
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || isUnavailable(row)) throw httpError(404, "Deze relatie bestaat niet meer of is niet mailbaar.");
  const email = cleanText(row.email).toLowerCase();
  if (!isEmail(email)) throw httpError(422, "Deze relatie heeft geen geldig e-mailadres.");
  return {
    relationshipType,
    relationshipId,
    companyName: cleanText(row.company_name || row.company || row.name),
    contactName: cleanText(row.contact_name || row.name),
    email,
  };
}

function isUnavailable(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const status = cleanText(row.status || row.portal_status).toLowerCase();
  const environment = cleanText(row.environment || metadata.environment).toLowerCase();
  return Boolean(row.archived_at || row.deleted_at || row.is_demo || row.is_test || metadata.archivedAt || metadata.archived_at || metadata.deletedAt || metadata.deleted_at || metadata.isDemo || metadata.is_demo || metadata.isTest || metadata.is_test)
    || ["archived", "gearchiveerd", "deleted", "inactive"].includes(status)
    || ["demo", "test", "testing"].includes(environment);
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
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

exports._test = { createHandler, isUnavailable, resolveRecipient, validateMailStudioPayload };
