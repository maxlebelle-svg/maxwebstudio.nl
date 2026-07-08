const { verifyAdmin } = require("./_admin-auth");
const { sendEmail } = require("./email");
const { getCompanySettings, getMailtoLink } = require("./company-settings");
const { createTimelineEvent } = require("./services/timelineService");

const PROFILE_FIELDS = "id,auth_user_id,name,company,email";
const INVOICE_FIELDS = [
  "id",
  "profile_id",
  "customer_auth_user_id",
  "invoice_number",
  "title",
  "amount",
  "status",
  "due_date",
  "paid_at",
  "pdf_file_path",
  "mollie_checkout_url",
  "mollie_payment_status",
  "email_sent_at",
  "payment_reminder_sent_at",
  "paid_email_sent_at",
  "expired_email_sent_at",
  "email_last_error",
].join(",");

const emailTypes = {
  invoice_sent: {
    timestampField: "email_sent_at",
    label: "factuurmail",
  },
  payment_reminder: {
    timestampField: "payment_reminder_sent_at",
    label: "betalingsherinnering",
  },
  paid_confirmation: {
    timestampField: "paid_email_sent_at",
    label: "betaalbevestiging",
  },
  expired_notice: {
    timestampField: "expired_email_sent_at",
    label: "verlopenmelding",
  },
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
    }

    const adminCheck = await verifyAdmin(event, jsonResponse);
    if (!adminCheck.success) return adminCheck.response;

    const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Admin invoice email missing Supabase configuration", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
      return jsonResponse(500, { success: false, error: "Factuurmail kon niet worden voorbereid." });
    }

    const payload = parsePayload(event.body);
    const invoiceId = validateUuid(payload.invoice_id || payload.invoiceId, "Kies een geldige factuur.");
    const emailType = cleanText(payload.email_type || payload.emailType).toLowerCase();
    const config = emailTypes[emailType];

    if (!config) {
      return jsonResponse(400, { success: false, error: "Kies een geldig e-mailtype." });
    }

    const invoice = await fetchInvoice(supabaseUrl, serviceRoleKey, invoiceId);
    if (!invoice) return jsonResponse(404, { success: false, error: "Factuur niet gevonden." });

    const profile = await fetchProfile(supabaseUrl, serviceRoleKey, invoice.profile_id);
    const customerEmail = cleanEmail(profile?.email);
    if (!customerEmail) {
      await patchInvoiceEmailState(supabaseUrl, serviceRoleKey, invoice.id, { email_last_error: "Geen klant e-mailadres gevonden." });
      return jsonResponse(400, { success: false, error: "Geen klant e-mailadres gevonden." });
    }

    const message = buildInvoiceEmail(emailType, invoice, profile);
    const result = await sendEmail({
      to: customerEmail,
      bcc: cleanEmail(process.env.ADMIN_EMAIL) || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
      templateKey: emailType,
      templateName: config.label,
      invoiceId: invoice.id,
      triggeredBy: "admin_invoice_email",
      triggeredByUserId: adminCheck.admin?.id,
      suppressTimelineEvent: true,
      metadata: {
        invoiceNumber: cleanText(invoice.invoice_number),
        profileId: cleanText(invoice.profile_id),
      },
    });

    if (!result.sent) {
      const warning = result.warning || "E-mail kon niet worden verzonden.";
      await patchInvoiceEmailState(supabaseUrl, serviceRoleKey, invoice.id, { email_last_error: warning });
      return jsonResponse(502, { success: false, error: "E-mail kon niet worden verzonden.", warning });
    }

    await patchInvoiceEmailState(supabaseUrl, serviceRoleKey, invoice.id, {
      [config.timestampField]: new Date().toISOString(),
      email_last_error: null,
    });
    await safeCreateTimeline({
      eventType: "invoice_email_sent",
      title: `${config.label} verzonden`,
      description: `De ${config.label} voor ${cleanText(invoice.invoice_number) || "de factuur"} is verzonden.`,
      module: "invoice",
      referenceType: "invoice",
      referenceId: invoice.id,
      actorName: adminCheck.admin?.email || "Max CRM",
      actorRole: adminCheck.admin?.role || "admin",
      icon: "📧",
      severity: "success",
      metadata: {
        dedupeKey: `invoice_email:${invoice.id}:${emailType}:${new Date().toISOString().slice(0, 16)}`,
        profileId: invoice.profile_id,
        emailType,
        logId: result.logId || "",
      },
    });

    return jsonResponse(200, {
      success: true,
      emailType,
      message: `De ${config.label} is verzonden.`,
    });
  } catch (error) {
    console.error("Admin invoice email error", {
      message: error.message,
      statusCode: error.statusCode || error.status || 500,
    });

    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Factuurmail kon niet worden verzonden.",
    });
  }
};

async function safeCreateTimeline(input) {
  try {
    return await createTimelineEvent(input);
  } catch (error) {
    console.error("Invoice email timeline event failed", { message: error.message });
    return null;
  }
}

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    const parseError = new Error("Ongeldige JSON body.");
    parseError.statusCode = 400;
    throw parseError;
  }
}

async function fetchInvoice(supabaseUrl, serviceRoleKey, invoiceId) {
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/customer_invoices?select=${INVOICE_FIELDS}&id=eq.${encodeURIComponent(invoiceId)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return Array.isArray(data) ? data[0] : data;
}

async function fetchProfile(supabaseUrl, serviceRoleKey, profileId) {
  const cleanProfileId = cleanText(profileId);
  if (!cleanProfileId) return null;
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/profiles?select=${PROFILE_FIELDS}&id=eq.${encodeURIComponent(cleanProfileId)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  return Array.isArray(data) ? data[0] : data;
}

async function patchInvoiceEmailState(supabaseUrl, serviceRoleKey, invoiceId, patch) {
  return supabaseFetch(`${supabaseUrl}/rest/v1/customer_invoices?id=eq.${encodeURIComponent(invoiceId)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      ...patch,
      updated_at: new Date().toISOString(),
    }),
  });
}

function buildInvoiceEmail(emailType, invoice, profile) {
  const companySettings = getCompanySettings();
  const customerName = cleanText(profile?.name) || cleanText(profile?.company) || "beste klant";
  const invoiceNumber = cleanText(invoice.invoice_number) || "je factuur";
  const title = cleanText(invoice.title) || "Factuur";
  const amount = formatMoney(invoice.amount);
  const dueDate = formatDate(invoice.due_date);
  const portalUrl = absoluteUrl("/client-dashboard.html");
  const invoiceUrl = absoluteUrl(`/factuur.html?supabaseInvoiceId=${encodeURIComponent(invoice.id)}`);
  const payUrl = cleanText(invoice.mollie_checkout_url);
  const hasPdf = Boolean(cleanText(invoice.pdf_file_path));
  const footer = [
    "Met vriendelijke groet,",
    companySettings.companyName,
  ].join("\n");
  const contactLine = `Vragen? Mail naar ${companySettings.primaryEmail} of gebruik ${getMailtoLink(companySettings, `Vraag over factuur ${invoiceNumber}`)}.`;

  if (emailType === "payment_reminder") {
    const text = [
      `Hallo ${customerName},`,
      "",
      `Dit is een vriendelijke herinnering voor factuur ${invoiceNumber}: ${title}.`,
      `Bedrag: ${amount}.`,
      dueDate ? `Vervaldatum: ${dueDate}.` : "",
      `Bekijk de factuur hier: ${invoiceUrl}`,
      payUrl ? `Betaallink, indien van toepassing: ${payUrl}` : "",
      hasPdf ? `De PDF staat veilig klaar in je klantportaal: ${portalUrl}` : "",
      "",
      contactLine,
      "",
      "Heb je de betaling net voldaan? Dan mag je deze herinnering negeren.",
      "",
      footer,
    ].filter(Boolean).join("\n");
    return {
      subject: `Herinnering factuur ${invoiceNumber} - ${companySettings.companyName}`,
      text,
      html: renderEmailHtml("Betalingsherinnering", text, invoiceUrl),
    };
  }

  if (emailType === "paid_confirmation") {
    const text = [
      `Hallo ${customerName},`,
      "",
      `Bedankt, we hebben de betaling voor factuur ${invoiceNumber} ontvangen.`,
      `Factuur: ${title}.`,
      `Bedrag: ${amount}.`,
      hasPdf ? `De factuur-PDF blijft veilig beschikbaar in je klantportaal: ${portalUrl}` : "",
      "",
      contactLine,
      "",
      footer,
    ].filter(Boolean).join("\n");
    return {
      subject: `Betaling ontvangen voor factuur ${invoiceNumber}`,
      text,
      html: renderEmailHtml("Betaling ontvangen", text, invoiceUrl),
    };
  }

  if (emailType === "expired_notice") {
    const text = [
      `Hallo ${customerName},`,
      "",
      `Factuur ${invoiceNumber} staat als verlopen geregistreerd.`,
      `Factuur: ${title}.`,
      `Bedrag: ${amount}.`,
      `Bekijk de factuur hier: ${invoiceUrl}`,
      payUrl ? `Betaallink, indien van toepassing: ${payUrl}` : "",
      contactLine,
      "",
      footer,
    ].filter(Boolean).join("\n");
    return {
      subject: `Factuur ${invoiceNumber} is verlopen`,
      text,
      html: renderEmailHtml("Factuur verlopen", text, invoiceUrl),
    };
  }

  const text = [
    `Hallo ${customerName},`,
    "",
    `Er staat een nieuwe factuur voor je klaar: ${invoiceNumber}.`,
    `Factuur: ${title}.`,
    `Bedrag: ${amount}.`,
    dueDate ? `Vervaldatum: ${dueDate}.` : "",
    `Bekijk de factuur hier: ${invoiceUrl}`,
    payUrl ? `Betaallink, indien van toepassing: ${payUrl}` : "",
    hasPdf ? `De factuur-PDF staat veilig klaar in je klantportaal: ${portalUrl}` : "",
    "",
    contactLine,
    "",
    footer,
  ].filter(Boolean).join("\n");

  return {
    subject: `Factuur ${invoiceNumber} van ${companySettings.companyName}`,
    text,
    html: renderEmailHtml("Nieuwe factuur", text, invoiceUrl),
  };
}

function renderEmailHtml(heading, text, actionUrl) {
  const companySettings = getCompanySettings();
  const paragraphs = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const actionLabel = "Bekijk factuur";

  return `
    <div style="margin:0;padding:0;background:#07111f;color:#eaf1ff;font-family:Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
        <div style="border:1px solid rgba(255,255,255,0.12);border-radius:18px;background:#0b1728;padding:28px;">
          <p style="margin:0 0 10px;color:#7db7ff;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">${escapeHtml(companySettings.companyName)}</p>
          <h1 style="margin:0 0 20px;color:#ffffff;font-size:28px;line-height:1.2;">${escapeHtml(heading)}</h1>
          ${paragraphs.map((line) => `<p style="margin:0 0 14px;color:#d7e3f7;font-size:15px;line-height:1.7;">${linkify(escapeHtml(line))}</p>`).join("")}
          <p style="margin:24px 0 0;">
            <a href="${escapeAttribute(actionUrl)}" style="display:inline-block;background:#2f8cff;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700;">${escapeHtml(actionLabel)}</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

function linkify(value) {
  return value.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${escapeAttribute(url)}" style="color:#7db7ff;">${url}</a>`);
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("Admin invoice email received non-JSON Supabase response", { status: response.status, bodyPreview: text.slice(0, 160) });
      throw new Error("Supabase gaf geen geldige JSON-response terug.");
    }
  }
  if (!response.ok) {
    console.error("Admin invoice email Supabase error", { status: response.status, message: data?.message || data?.error || "Unknown Supabase error" });
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
  };
}

function absoluteUrl(path) {
  const siteUrl = cleanText(process.env.SITE_URL || getCompanySettings().websiteUrl).replace(/\/$/, "");
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(number);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(date);
}

function validateUuid(id, message) {
  const cleanId = cleanText(id);
  if (!uuidPattern.test(cleanId)) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return cleanId;
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
