const { getMollieApiKey } = require("./mollie-products");
const { sendEmail } = require("./email");

const knownStatuses = new Set([
  "paid",
  "open",
  "pending",
  "failed",
  "canceled",
  "expired",
  "refunded",
  "charged_back",
]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return textResponse(405, "Method not allowed");
  }

  const paymentId = getPaymentId(event);

  if (!paymentId) {
    console.warn("Mollie webhook without payment id");
    return textResponse(400, "Missing payment id");
  }

  const apiKey = process.env.MOLLIE_API_KEY || getMollieApiKey();

  if (!apiKey) {
    console.error("Mollie webhook missing API key configuration");
    return textResponse(500, "Payment configuration missing");
  }

  try {
    const mollieResponse = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const payment = await mollieResponse.json();

    if (!mollieResponse.ok) {
      console.error("Mollie webhook fetch failed", {
        paymentId,
        status: mollieResponse.status,
        title: payment.title,
      });

      return textResponse(200, "Webhook received");
    }

    const status = payment.status;
    const safeStatus = knownStatuses.has(status) ? status : "unknown";

    console.log("Mollie payment status", {
      paymentId: payment.id,
      status: safeStatus,
      websitePackage: payment.metadata?.websitePackage,
      websitePackageName: payment.metadata?.websitePackageName,
      carePackage: payment.metadata?.carePackage,
      carePackageName: payment.metadata?.carePackageName,
      customerEmail: payment.metadata?.customerEmail,
      depositAmountInclVat: payment.metadata?.depositAmountInclVat,
    });

    if (status === "paid") {
      console.log("Max Webstudio payment received", {
        paymentId: payment.id,
        metadata: payment.metadata || {},
      });
    }

    await updateInvoicePaymentIfPresent(payment);

    return textResponse(200, "Webhook processed");
  } catch (error) {
    console.error("Mollie webhook error", {
      paymentId,
      message: error.message,
    });

    return textResponse(200, "Webhook received");
  }
};

async function updateInvoicePaymentIfPresent(payment) {
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("Mollie webhook invoice update skipped: missing Supabase configuration", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return;
  }

  const invoice = await fetchInvoiceByPaymentId(supabaseUrl, serviceRoleKey, payment.id);
  if (!invoice) {
    console.warn("Mollie webhook invoice not found for payment id", { paymentId: payment.id });
    return;
  }

  const mappedStatus = mapMollieStatusToInvoiceStatus(payment.status);
  const patch = {
    mollie_payment_status: payment.status || "unknown",
    status: mappedStatus,
    paid_at: payment.status === "paid" ? new Date().toISOString() : invoice.paid_at || null,
    updated_at: new Date().toISOString(),
  };

  await patchInvoice(supabaseUrl, serviceRoleKey, invoice.id, patch);
  console.log("Invoice payment status updated", {
    paymentId: payment.id,
    invoiceId: invoice.id,
    mollieStatus: payment.status,
    invoiceStatus: mappedStatus,
  });

  if (payment.status === "paid" && !invoice.paid_email_sent_at) {
    await sendPaidConfirmationEmail(supabaseUrl, serviceRoleKey, invoice);
  }
}

async function fetchInvoiceByPaymentId(supabaseUrl, serviceRoleKey, paymentId) {
  const invoice = await fetchInvoiceByPaymentIdWithFields(
    supabaseUrl,
    serviceRoleKey,
    paymentId,
    "id,profile_id,invoice_number,title,amount,status,paid_at,pdf_file_path,paid_email_sent_at,email_last_error"
  );
  if (invoice !== false) return invoice;

  return fetchInvoiceByPaymentIdWithFields(
    supabaseUrl,
    serviceRoleKey,
    paymentId,
    "id,profile_id,invoice_number,title,amount,status,paid_at,pdf_file_path"
  );
}

async function fetchInvoiceByPaymentIdWithFields(supabaseUrl, serviceRoleKey, paymentId, fields) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/customer_invoices?select=${fields}&mollie_payment_id=eq.${encodeURIComponent(paymentId)}&limit=1`,
    {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    }
  );
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    console.error("Mollie webhook invoice lookup failed", {
      paymentId,
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
    if (isSchemaColumnError(data)) return false;
    return null;
  }

  return Array.isArray(data) ? data[0] : data;
}

async function sendPaidConfirmationEmail(supabaseUrl, serviceRoleKey, invoice) {
  try {
    const profile = await fetchInvoiceProfile(supabaseUrl, serviceRoleKey, invoice.profile_id);
    const customerEmail = cleanEmail(profile?.email);

    if (!customerEmail) {
      console.warn("Mollie webhook paid email skipped: missing customer email", { invoiceId: invoice.id });
      await patchInvoice(supabaseUrl, serviceRoleKey, invoice.id, { email_last_error: "Geen klant e-mailadres gevonden." });
      return;
    }

    const message = buildPaidConfirmationEmail(invoice, profile);
    const result = await sendEmail({
      to: customerEmail,
      bcc: cleanEmail(process.env.ADMIN_EMAIL) || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (!result.sent) {
      console.warn("Mollie webhook paid email skipped", { invoiceId: invoice.id, warning: result.warning || "Unknown email warning" });
      await patchInvoice(supabaseUrl, serviceRoleKey, invoice.id, { email_last_error: result.warning || "Betaalbevestiging kon niet worden verzonden." });
      return;
    }

    await patchInvoice(supabaseUrl, serviceRoleKey, invoice.id, {
      paid_email_sent_at: new Date().toISOString(),
      email_last_error: null,
    });
    console.log("Mollie webhook paid email sent", { invoiceId: invoice.id });
  } catch (error) {
    console.error("Mollie webhook paid email failed", {
      invoiceId: invoice.id,
      message: error.message,
    });
  }
}

async function fetchInvoiceProfile(supabaseUrl, serviceRoleKey, profileId) {
  if (!profileId) return null;
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,name,company,email&id=eq.${encodeURIComponent(profileId)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    console.error("Mollie webhook profile lookup failed", {
      profileId,
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
    return null;
  }

  return Array.isArray(data) ? data[0] : data;
}

function buildPaidConfirmationEmail(invoice, profile) {
  const customerName = cleanText(profile?.name) || cleanText(profile?.company) || "beste klant";
  const invoiceNumber = cleanText(invoice.invoice_number) || "je factuur";
  const title = cleanText(invoice.title) || "Factuur";
  const portalUrl = absoluteUrl("/client-dashboard.html");
  const text = [
    `Hallo ${customerName},`,
    "",
    `Bedankt, we hebben de betaling voor factuur ${invoiceNumber} ontvangen.`,
    `Factuur: ${title}.`,
    `Bedrag: ${formatMoney(invoice.amount)}.`,
    cleanText(invoice.pdf_file_path) ? `De factuur-PDF blijft veilig beschikbaar in je klantportaal: ${portalUrl}` : "",
    "",
    "Met vriendelijke groet,",
    "Max Web Studio",
  ].filter(Boolean).join("\n");

  return {
    subject: `Betaling ontvangen voor factuur ${invoiceNumber}`,
    text,
    html: renderEmailHtml("Betaling ontvangen", text, portalUrl),
  };
}

function renderEmailHtml(heading, text, portalUrl) {
  const paragraphs = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return `
    <div style="margin:0;padding:0;background:#07111f;color:#eaf1ff;font-family:Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
        <div style="border:1px solid rgba(255,255,255,0.12);border-radius:18px;background:#0b1728;padding:28px;">
          <p style="margin:0 0 10px;color:#7db7ff;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">Max Web Studio</p>
          <h1 style="margin:0 0 20px;color:#ffffff;font-size:28px;line-height:1.2;">${escapeHtml(heading)}</h1>
          ${paragraphs.map((line) => `<p style="margin:0 0 14px;color:#d7e3f7;font-size:15px;line-height:1.7;">${linkify(escapeHtml(line))}</p>`).join("")}
          <p style="margin:24px 0 0;">
            <a href="${escapeAttribute(portalUrl)}" style="display:inline-block;background:#2f8cff;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700;">Open klantportaal</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

async function patchInvoice(supabaseUrl, serviceRoleKey, invoiceId, patch) {
  const response = await fetch(`${supabaseUrl}/rest/v1/customer_invoices?id=eq.${encodeURIComponent(invoiceId)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Mollie webhook invoice update failed", {
      invoiceId,
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
  }
}

function mapMollieStatusToInvoiceStatus(status) {
  if (status === "paid") return "paid";
  if (status === "canceled") return "canceled";
  if (status === "expired") return "expired";
  if (status === "failed") return "failed";
  return "sent";
}

function getPaymentId(event) {
  const body = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  const contentType = event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";

  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(body);
      return payload.id || payload.paymentId || "";
    } catch (error) {
      return "";
    }
  }

  const params = new URLSearchParams(body);
  return params.get("id") || "";
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
  };
}

function isSchemaColumnError(data) {
  const message = `${data?.code || ""} ${data?.message || ""} ${data?.details || ""} ${data?.hint || ""}`.toLowerCase();
  return message.includes("42703") || message.includes("pgrst204") || message.includes("column") || message.includes("schema cache");
}

function absoluteUrl(path) {
  const siteUrl = cleanText(process.env.SITE_URL || "https://maxwebstudio.nl").replace(/\/$/, "");
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(number);
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanText(value) {
  return String(value || "").trim();
}

function linkify(value) {
  return value.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${escapeAttribute(url)}" style="color:#7db7ff;">${url}</a>`);
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

function textResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body,
  };
}
