const INVOICE_FIELDS = [
  "id",
  "invoice_number",
  "title",
  "amount",
  "status",
  "mollie_payment_id",
  "mollie_checkout_url",
  "customer_auth_user_id",
].join(",");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { success: false, error: "Alleen POST-verzoeken zijn toegestaan." });
    }

    const adminCheck = verifyAdmin(event);
    if (!adminCheck.success) return adminCheck.response;

    const config = readConfig();
    if (!config.success) return config.response;

    const payload = parsePayload(event.body);
    const invoiceId = cleanText(payload.invoice_id || payload.invoiceId);
    if (!uuidPattern.test(invoiceId)) {
      return jsonResponse(400, { success: false, error: "Ongeldig factuur ID." });
    }

    const invoice = await fetchInvoice(config.supabaseUrl, config.serviceRoleKey, invoiceId);
    if (!invoice) return jsonResponse(404, { success: false, error: "Factuur niet gevonden." });

    const amount = Number(invoice.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse(400, { success: false, error: "Factuurbedrag moet groter zijn dan 0." });
    }

    const payment = await createMolliePayment(config, invoice, amount);
    const checkoutUrl = payment?._links?.checkout?.href || "";
    if (!payment.id || !checkoutUrl) {
      console.error("Mollie invoice payment missing expected fields", {
        hasPaymentId: Boolean(payment.id),
        hasCheckoutUrl: Boolean(checkoutUrl),
      });
      return jsonResponse(502, { success: false, error: "Mollie gaf geen geldige betaallink terug." });
    }

    const updatedInvoice = await updateInvoice(config.supabaseUrl, config.serviceRoleKey, invoice.id, {
      mollie_payment_id: payment.id,
      mollie_checkout_url: checkoutUrl,
      mollie_payment_status: cleanText(payment.status || "open"),
      mollie_payment_created_at: cleanText(payment.createdAt) || new Date().toISOString(),
      mollie_payment_expires_at: cleanText(payment.expiresAt) || null,
      status: "sent",
      updated_at: new Date().toISOString(),
    });

    return jsonResponse(200, {
      success: true,
      checkoutUrl,
      paymentId: payment.id,
      invoice: normalizeInvoice(updatedInvoice),
    });
  } catch (error) {
    console.error("Admin Mollie payment error", {
      message: error.message,
      statusCode: error.statusCode || error.status || 500,
    });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Betaalverzoek kon niet worden aangemaakt.",
    });
  }
};

function verifyAdmin(event) {
  const expectedToken = process.env.ADMIN_TOKEN;
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return { success: false, response: jsonResponse(401, { success: false, error: "Niet geautoriseerd." }) };
  }
  return { success: true };
}

function readConfig() {
  const mollieApiKey = process.env.MOLLIE_API_KEY;
  const siteUrl = (process.env.SITE_URL || process.env.BASE_URL || "https://maxwebstudio.nl").replace(/\/$/, "");
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!mollieApiKey || !supabaseUrl || !serviceRoleKey) {
    console.error("Admin Mollie payment missing configuration", {
      hasMollieApiKey: Boolean(mollieApiKey),
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return {
      success: false,
      response: jsonResponse(500, { success: false, error: "Mollie- of Supabase-configuratie ontbreekt." }),
    };
  }

  return { success: true, mollieApiKey, siteUrl, supabaseUrl, serviceRoleKey };
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
  const data = await supabaseFetch(
    `${supabaseUrl}/rest/v1/customer_invoices?select=${INVOICE_FIELDS}&id=eq.${encodeURIComponent(invoiceId)}&limit=1`,
    {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    }
  );
  return Array.isArray(data) ? data[0] : data;
}

async function createMolliePayment(config, invoice, amount) {
  const invoiceNumber = cleanText(invoice.invoice_number) || "zonder nummer";
  const title = cleanText(invoice.title) || "Factuur";
  const response = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.mollieApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amount: {
        currency: "EUR",
        value: amount.toFixed(2),
      },
      description: `Factuur ${invoiceNumber} - ${title}`.slice(0, 255),
      redirectUrl: `${config.siteUrl}/client-dashboard.html`,
      webhookUrl: `${config.siteUrl}/.netlify/functions/mollie-webhook`,
      metadata: {
        source: "admin_crm_invoice",
        invoiceId: invoice.id,
        invoiceNumber,
      },
    }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Mollie invoice payment creation failed", {
      status: response.status,
      title: data.title,
      detail: data.detail,
    });
    const error = new Error(data.detail || data.title || "Mollie kon de betaling niet aanmaken.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  return data;
}

async function updateInvoice(supabaseUrl, serviceRoleKey, invoiceId, patch) {
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/customer_invoices?id=eq.${encodeURIComponent(invoiceId)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) throw new Error("Supabase returned no invoice after update.");
  return saved;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("Admin Mollie received non-JSON Supabase response", { status: response.status });
      throw new Error("Supabase gaf geen geldige JSON-response terug.");
    }
  }
  if (!response.ok) {
    console.error("Admin Mollie Supabase error", { status: response.status, message: data?.message || data?.error || "Unknown Supabase error" });
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function normalizeInvoice(row) {
  return {
    id: cleanText(row.id),
    invoiceNumber: cleanText(row.invoice_number),
    title: cleanText(row.title),
    amount: Number(row.amount) || 0,
    status: cleanText(row.status),
    molliePaymentId: cleanText(row.mollie_payment_id),
    mollieCheckoutUrl: cleanText(row.mollie_checkout_url),
    molliePaymentStatus: cleanText(row.mollie_payment_status),
  };
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
  };
}

function cleanText(value) {
  return String(value || "").trim();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
