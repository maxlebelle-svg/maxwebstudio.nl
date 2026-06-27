const { getMollieApiKey } = require("./mollie-products");

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
  if (!invoice) return;

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
}

async function fetchInvoiceByPaymentId(supabaseUrl, serviceRoleKey, paymentId) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/customer_invoices?select=id,status,paid_at&mollie_payment_id=eq.${encodeURIComponent(paymentId)}&limit=1`,
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
    return null;
  }

  return Array.isArray(data) ? data[0] : data;
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
  if (status === "canceled") return "cancelled";
  if (status === "expired") return "overdue";
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
