exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { success: false, message: "Method not allowed" });
  }

  const config = readConfig();
  if (!config.success) {
    return jsonResponse(200, publicStatus());
  }

  const params = event.queryStringParameters || {};
  const invoiceId = cleanText(params.invoice);
  const orderId = cleanText(params.order);

  if (!invoiceId && !orderId) {
    return jsonResponse(200, publicStatus());
  }

  try {
    const invoice = (invoiceId ? await fetchInvoiceById(config, invoiceId) : null) || (orderId ? await fetchInvoiceByOrder(config, orderId) : null);
    if (!invoice?.id) {
      return jsonResponse(200, publicStatus({ message: "We zoeken je betaling nog op." }));
    }

    const context = parseInvoiceContext(invoice.notes);
    const profile = invoice.profile_id ? await fetchProfile(config, invoice.profile_id) : null;
    const status = mapPublicStatus(invoice);
    const portalReady = Boolean(profile?.auth_user_id || invoice.customer_auth_user_id);
    const emailSent = Boolean(invoice.paid_email_sent_at || context.commercialOrderCompletedAt || context.portalStatus === "completed");

    return jsonResponse(200, publicStatus({
      status,
      invoiceNumber: cleanText(invoice.invoice_number),
      invoiceTitle: "",
      customerName: "",
      packageLabel: cleanText(context.packageLabel),
      paymentChoice: cleanText(context.paymentChoice),
      orderId: cleanText(context.orderId || orderId),
      invoiceId: cleanText(invoice.id),
      isTestOrder: Boolean(context.testOrder || cleanText(invoice.title).toLowerCase().startsWith("test -")),
      portalReady,
      emailSent,
      message: status === "paid" ? "Je betaling is ontvangen." : status === "action_needed" ? "De betaling is niet afgerond." : "We verwerken je betaling nog.",
    }));
  } catch (error) {
    console.error("Order status lookup failed", { message: error.message });
    return jsonResponse(200, publicStatus({ message: "We verwerken je betaling nog." }));
  }
};

function readConfig() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    success: Boolean(supabaseUrl && serviceRoleKey),
    supabaseUrl,
    serviceRoleKey,
  };
}

async function fetchInvoiceById(config, invoiceId) {
  if (!/^[0-9a-f-]{32,40}$/i.test(invoiceId)) return null;
  const filter = `id=eq.${encodeURIComponent(invoiceId)}`;
  return fetchInvoice(config, filter);
}

async function fetchInvoiceByOrder(config, orderId) {
  const safeOrderId = cleanText(orderId).replace(/[^a-z0-9_-]/gi, "").slice(0, 90);
  if (safeOrderId.length < 12) return null;
  const filter = `notes=ilike.*${encodeURIComponent(safeOrderId)}*`;
  return fetchInvoice(config, filter);
}

async function fetchInvoice(config, filter) {
  const fields = [
    "id",
    "profile_id",
    "customer_auth_user_id",
    "invoice_number",
    "title",
    "amount",
    "status",
    "paid_at",
    "paid_email_sent_at",
    "email_last_error",
    "notes",
    "mollie_payment_id",
    "mollie_payment_status",
  ].join(",");
  const fallbackFields = fields.replace(",paid_email_sent_at,email_last_error", "");
  const response = await supabaseFetch(config, `/rest/v1/customer_invoices?select=${encodeURIComponent(fields)}&${filter}&limit=1`);
  if (response.ok) return firstRow(response.data);
  if (!isSchemaColumnError(response.data)) throw new Error(response.data?.message || "Invoice lookup failed");

  const fallback = await supabaseFetch(config, `/rest/v1/customer_invoices?select=${encodeURIComponent(fallbackFields)}&${filter}&limit=1`);
  if (!fallback.ok) throw new Error(fallback.data?.message || "Invoice lookup failed");
  return firstRow(fallback.data);
}

async function fetchProfile(config, profileId) {
  const fields = "id,auth_user_id,status,metadata";
  const response = await supabaseFetch(config, `/rest/v1/profiles?select=${encodeURIComponent(fields)}&id=eq.${encodeURIComponent(profileId)}&limit=1`);
  if (response.ok) return firstRow(response.data);
  return null;
}

async function supabaseFetch(config, path) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method: "GET",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: "application/json",
      "Accept-Profile": "public",
    },
  });
  const data = await response.json().catch(() => []);
  return { ok: response.ok, status: response.status, data };
}

function mapPublicStatus(invoice) {
  const status = cleanText(invoice.status).toLowerCase();
  const mollieStatus = cleanText(invoice.mollie_payment_status).toLowerCase();
  if (status === "paid" || mollieStatus === "paid" || cleanText(invoice.paid_at)) return "paid";
  if (["failed", "canceled", "cancelled", "expired"].includes(status) || ["failed", "canceled", "cancelled", "expired"].includes(mollieStatus)) {
    return "action_needed";
  }
  return "processing";
}

function parseInvoiceContext(notes = "") {
  const marker = "Factuurregels:";
  const text = cleanText(notes);
  const index = text.lastIndexOf(marker);
  if (index < 0) return {};
  try {
    const parsed = JSON.parse(text.slice(index + marker.length).trim());
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function publicStatus(overrides = {}) {
  return {
    success: true,
    status: "processing",
    invoiceNumber: "",
    invoiceTitle: "",
    customerName: "",
    packageLabel: "",
    paymentChoice: "",
    orderId: "",
    invoiceId: "",
    isTestOrder: false,
    portalReady: false,
    emailSent: false,
    message: "We verwerken je betaling nog.",
    ...overrides,
  };
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : data;
}

function isSchemaColumnError(data) {
  const message = `${data?.code || ""} ${data?.message || ""} ${data?.details || ""} ${data?.hint || ""}`.toLowerCase();
  return message.includes("42703") || message.includes("pgrst204") || message.includes("column") || message.includes("schema cache");
}

function cleanText(value) {
  return String(value || "").trim();
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
