const storageBucket = "invoice-pdfs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
    }

    const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Invoice download missing Supabase configuration", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
      return jsonResponse(500, { success: false, error: "Factuur kon niet worden geopend." });
    }

    const authHeader = event.headers.authorization || event.headers.Authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return jsonResponse(401, { success: false, error: "Niet ingelogd." });

    const invoiceId = cleanText((event.queryStringParameters || {}).invoice_id);
    if (!uuidPattern.test(invoiceId)) {
      return jsonResponse(400, { success: false, error: "Ongeldig factuur ID." });
    }

    const user = await fetchAuthenticatedUser(supabaseUrl, serviceRoleKey, token);
    if (!user?.id) return jsonResponse(401, { success: false, error: "Niet ingelogd." });

    const invoice = await fetchInvoice(supabaseUrl, serviceRoleKey, invoiceId);
    if (!invoice || invoice.customer_auth_user_id !== user.id) {
      return jsonResponse(404, { success: false, error: "Factuur niet gevonden." });
    }

    const storagePath = normalizeStoragePath(invoice.pdf_file_path);
    if (!storagePath) {
      return jsonResponse(404, { success: false, error: "Voor deze factuur is nog geen PDF beschikbaar." });
    }

    const signedUrl = await createSignedUrl(supabaseUrl, serviceRoleKey, storagePath);
    return jsonResponse(200, {
      success: true,
      signedUrl,
      invoiceNumber: cleanText(invoice.invoice_number),
      title: cleanText(invoice.title),
    });
  } catch (error) {
    console.error("Invoice download error", {
      message: error.message,
      statusCode: error.statusCode || error.status || 500,
    });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Factuur kon niet worden geopend.",
    });
  }
};

async function fetchAuthenticatedUser(supabaseUrl, serviceRoleKey, token) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.id) {
    console.error("Invoice download auth lookup failed", {
      status: response.status,
      message: data.message || data.error || "Unknown Supabase Auth error",
    });
    return null;
  }

  return data;
}

async function fetchInvoice(supabaseUrl, serviceRoleKey, invoiceId) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/customer_invoices?select=id,customer_auth_user_id,invoice_number,title,pdf_file_path&id=eq.${encodeURIComponent(invoiceId)}&limit=1`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
        "Accept-Profile": "public",
      },
    }
  );
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    console.error("Invoice download lookup failed", {
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
    const error = new Error("Factuur kon niet worden opgehaald.");
    error.statusCode = 500;
    throw error;
  }

  return Array.isArray(data) ? data[0] : data;
}

async function createSignedUrl(supabaseUrl, serviceRoleKey, storagePath) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/${storageBucket}/${encodeStoragePath(storagePath)}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.signedURL) {
    console.error("Invoice download signed URL failed", {
      status: response.status,
      storagePath,
      message: data.message || data.error || "Unknown Supabase Storage error",
    });
    const error = new Error("Factuur-PDF kon niet worden geopend.");
    error.statusCode = 500;
    throw error;
  }

  return toAbsoluteSignedUrl(supabaseUrl, data.signedURL);
}

function normalizeStoragePath(path) {
  const cleanPath = cleanText(path).replace(/^\/+/, "");
  return cleanPath.startsWith(`${storageBucket}/`)
    ? cleanPath.slice(storageBucket.length + 1)
    : cleanPath;
}

function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function toAbsoluteSignedUrl(supabaseUrl, signedUrl) {
  if (signedUrl.startsWith("http")) return signedUrl;
  if (signedUrl.startsWith("/storage/v1/")) return `${supabaseUrl}${signedUrl}`;
  if (signedUrl.startsWith("/object/")) return `${supabaseUrl}/storage/v1${signedUrl}`;
  if (signedUrl.startsWith("object/")) return `${supabaseUrl}/storage/v1/${signedUrl}`;
  return `${supabaseUrl}/storage/v1/${signedUrl.replace(/^\/+/, "")}`;
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
