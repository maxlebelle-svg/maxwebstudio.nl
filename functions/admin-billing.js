const PROFILE_FIELDS = ["id", "auth_user_id", "name", "company", "email", "package"].join(",");
const SUBSCRIPTION_FIELDS = [
  "id",
  "profile_id",
  "customer_auth_user_id",
  "package_name",
  "billing_cycle",
  "monthly_amount",
  "status",
  "start_date",
  "next_invoice_date",
  "mollie_customer_id",
  "mollie_subscription_id",
  "mollie_subscription_status",
  "mollie_mandate_id",
  "last_payment_at",
  "next_payment_at",
  "canceled_at",
  "paused_at",
  "notes",
  "created_at",
  "updated_at",
].join(",");
const LEGACY_SUBSCRIPTION_FIELDS = [
  "id",
  "profile_id",
  "customer_auth_user_id",
  "package_name",
  "billing_cycle",
  "monthly_amount",
  "status",
  "start_date",
  "next_invoice_date",
  "mollie_customer_id",
  "mollie_subscription_id",
  "notes",
  "created_at",
  "updated_at",
].join(",");
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
  "mollie_payment_id",
  "mollie_checkout_url",
  "mollie_payment_status",
  "mollie_payment_created_at",
  "mollie_payment_expires_at",
  "email_sent_at",
  "payment_reminder_sent_at",
  "paid_email_sent_at",
  "expired_email_sent_at",
  "email_last_error",
  "notes",
  "created_at",
  "updated_at",
].join(",");
const LEGACY_INVOICE_FIELDS = [
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
  "mollie_payment_id",
  "notes",
  "created_at",
  "updated_at",
].join(",");

const allowedSubscriptionStatuses = new Set(["active", "paused", "cancelled"]);
const allowedBillingCycles = new Set(["monthly", "quarterly", "yearly"]);
const allowedInvoiceStatuses = new Set(["draft", "sent", "paid", "expired", "canceled", "failed"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  try {
    if (!["GET", "POST"].includes(event.httpMethod)) {
      return jsonResponse(405, { success: false, error: "Alleen GET- en POST-verzoeken zijn toegestaan." });
    }

    const adminCheck = verifyAdmin(event);
    if (!adminCheck.success) return adminCheck.response;

    const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Admin billing missing Supabase configuration", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });

      return jsonResponse(500, { success: false, error: "Billing kon niet worden beheerd." });
    }

    if (event.httpMethod === "GET") {
      const [profiles, subscriptions, invoices] = await Promise.all([
        fetchProfiles(supabaseUrl, serviceRoleKey),
        fetchSubscriptions(supabaseUrl, serviceRoleKey),
        fetchInvoices(supabaseUrl, serviceRoleKey),
      ]);
      const normalizedProfiles = profiles.map(normalizeProfile);

      return jsonResponse(200, {
        success: true,
        subscriptions: enrichSubscriptions(subscriptions.map(normalizeSubscription), normalizedProfiles),
        invoices: enrichInvoices(invoices.map(normalizeInvoice), normalizedProfiles),
      });
    }

    const payload = parsePayload(event.body);
    const action = cleanText(payload.action || "");
    const profiles = (await fetchProfiles(supabaseUrl, serviceRoleKey)).map(normalizeProfile);

    if (action === "save_subscription") {
      const subscription = validateSubscriptionPayload(payload, profiles);
      const savedSubscription = await upsertSubscription(supabaseUrl, serviceRoleKey, subscription);
      return jsonResponse(200, { success: true, subscription: normalizeSubscription(savedSubscription) });
    }

    if (action === "set_subscription_status") {
      const id = validateUuid(payload.id, "Kies een geldig abonnement.");
      const status = cleanText(payload.status).toLowerCase();
      if (!allowedSubscriptionStatuses.has(status)) return jsonResponse(400, { success: false, error: "Kies een geldige abonnementsstatus." });
      const savedSubscription = await patchRecord(supabaseUrl, serviceRoleKey, "customer_subscriptions", id, {
        status,
        updated_at: new Date().toISOString(),
      });
      return jsonResponse(200, { success: true, subscription: normalizeSubscription(savedSubscription) });
    }

    if (action === "save_invoice") {
      const invoice = validateInvoicePayload(payload, profiles);
      const savedInvoice = await upsertInvoice(supabaseUrl, serviceRoleKey, invoice);
      return jsonResponse(200, { success: true, invoice: normalizeInvoice(savedInvoice) });
    }

    if (action === "set_invoice_status") {
      const id = validateUuid(payload.id, "Kies een geldige factuur.");
      const status = normalizeInvoiceStatus(payload.status);
      if (!allowedInvoiceStatuses.has(status)) return jsonResponse(400, { success: false, error: "Kies een geldige factuurstatus." });
      const savedInvoice = await patchRecord(supabaseUrl, serviceRoleKey, "customer_invoices", id, {
        status,
        paid_at: status === "paid" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      });
      return jsonResponse(200, { success: true, invoice: normalizeInvoice(savedInvoice) });
    }

    return jsonResponse(400, { success: false, error: "Onbekende billing-actie." });
  } catch (error) {
    console.error("Admin billing error", {
      message: error.message,
      statusCode: error.statusCode || error.status || 500,
    });

    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Billing kon niet worden beheerd.",
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

function parsePayload(body) {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    const parseError = new Error("Ongeldige JSON body.");
    parseError.statusCode = 400;
    throw parseError;
  }
}

async function fetchProfiles(supabaseUrl, serviceRoleKey) {
  try {
    return await supabaseFetch(`${supabaseUrl}/rest/v1/profiles?select=${PROFILE_FIELDS}&order=company.asc.nullslast`, {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    });
  } catch (error) {
    if (!isSchemaColumnError(error)) throw error;
    return supabaseFetch(`${supabaseUrl}/rest/v1/profiles?select=id,auth_user_id,name,company,package&order=company.asc.nullslast`, {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    });
  }
}

async function fetchSubscriptions(supabaseUrl, serviceRoleKey) {
  try {
    return await supabaseFetch(`${supabaseUrl}/rest/v1/customer_subscriptions?select=${SUBSCRIPTION_FIELDS}&order=updated_at.desc.nullslast&limit=300`, {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    });
  } catch (error) {
    if (!isSchemaColumnError(error)) throw error;
    return supabaseFetch(`${supabaseUrl}/rest/v1/customer_subscriptions?select=${LEGACY_SUBSCRIPTION_FIELDS}&order=updated_at.desc.nullslast&limit=300`, {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    });
  }
}

async function fetchInvoices(supabaseUrl, serviceRoleKey) {
  try {
    return await supabaseFetch(`${supabaseUrl}/rest/v1/customer_invoices?select=${INVOICE_FIELDS}&order=created_at.desc.nullslast&limit=300`, {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    });
  } catch (error) {
    if (!isSchemaColumnError(error)) throw error;
    return supabaseFetch(`${supabaseUrl}/rest/v1/customer_invoices?select=${LEGACY_INVOICE_FIELDS}&order=created_at.desc.nullslast&limit=300`, {
      method: "GET",
      headers: restHeaders(serviceRoleKey),
    });
  }
}

function validateSubscriptionPayload(payload, profiles) {
  const id = cleanText(payload.id);
  const profile = profileById(payload.profileId, profiles);
  const billingCycle = cleanText(payload.billingCycle || "monthly").toLowerCase();
  const status = cleanText(payload.status || "active").toLowerCase();

  if (id && !uuidPattern.test(id)) throwValidation("Kies een geldig abonnement.");
  if (!profile) throwValidation("Koppel het abonnement aan een geldige klant.");
  if (!allowedBillingCycles.has(billingCycle)) throwValidation("Kies een geldige facturatiecyclus.");
  if (!allowedSubscriptionStatuses.has(status)) throwValidation("Kies een geldige abonnementsstatus.");

  return {
    id,
    profile_id: profile.id,
    customer_auth_user_id: profile.authUserId || null,
    package_name: cleanText(payload.packageName || profile.package || "Plus"),
    billing_cycle: billingCycle,
    monthly_amount: nullableAmount(payload.monthlyAmount),
    status,
    start_date: cleanText(payload.startDate) || null,
    next_invoice_date: cleanText(payload.nextInvoiceDate) || null,
    mollie_customer_id: cleanText(payload.mollieCustomerId) || null,
    mollie_subscription_id: cleanText(payload.mollieSubscriptionId) || null,
    notes: cleanText(payload.notes),
    updated_at: new Date().toISOString(),
  };
}

function validateInvoicePayload(payload, profiles) {
  const id = cleanText(payload.id);
  const profile = profileById(payload.profileId, profiles);
  const status = normalizeInvoiceStatus(payload.status || "draft");

  if (id && !uuidPattern.test(id)) throwValidation("Kies een geldige factuur.");
  if (!profile) throwValidation("Koppel de factuur aan een geldige klant.");
  if (!allowedInvoiceStatuses.has(status)) throwValidation("Kies een geldige factuurstatus.");

  return {
    id,
    profile_id: profile.id,
    customer_auth_user_id: profile.authUserId || null,
    invoice_number: cleanText(payload.invoiceNumber),
    title: cleanText(payload.title || "Factuur"),
    amount: nullableAmount(payload.amount),
    status,
    due_date: cleanText(payload.dueDate) || null,
    paid_at: status === "paid" ? cleanText(payload.paidAt) || new Date().toISOString() : cleanText(payload.paidAt) || null,
    pdf_file_path: normalizeInvoicePdfPath(payload.pdfFilePath),
    mollie_payment_id: cleanText(payload.molliePaymentId) || null,
    notes: cleanText(payload.notes),
    updated_at: new Date().toISOString(),
  };
}

function profileById(id, profiles) {
  const profileId = cleanText(id);
  return profiles.find((profile) => profile.id === profileId) || null;
}

async function upsertSubscription(supabaseUrl, serviceRoleKey, subscription) {
  const record = { ...subscription };
  if (!record.id) delete record.id;
  return upsertRecord(supabaseUrl, serviceRoleKey, "customer_subscriptions", record);
}

async function upsertInvoice(supabaseUrl, serviceRoleKey, invoice) {
  const record = { ...invoice };
  if (!record.id) delete record.id;
  return upsertRecord(supabaseUrl, serviceRoleKey, "customer_invoices", record);
}

async function upsertRecord(supabaseUrl, serviceRoleKey, table, record) {
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(record),
  });
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) throw new Error("Supabase returned no record after upsert.");
  return saved;
}

async function patchRecord(supabaseUrl, serviceRoleKey, table, id, patch) {
  const data = await supabaseFetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...restHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) throw new Error("Supabase returned no record after update.");
  return saved;
}

function enrichSubscriptions(subscriptions, profiles) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  return subscriptions.map((subscription) => ({
    ...subscription,
    customerName: profileMap.get(subscription.profileId)?.name || "",
    customerCompany: profileMap.get(subscription.profileId)?.company || "",
    customerEmail: profileMap.get(subscription.profileId)?.email || "",
  }));
}

function enrichInvoices(invoices, profiles) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  return invoices.map((invoice) => ({
    ...invoice,
    customerName: profileMap.get(invoice.profileId)?.name || "",
    customerCompany: profileMap.get(invoice.profileId)?.company || "",
    customerEmail: profileMap.get(invoice.profileId)?.email || "",
  }));
}

function normalizeProfile(row) {
  return {
    id: cleanText(row.id),
    authUserId: cleanText(row.auth_user_id),
    name: cleanText(row.name),
    company: cleanText(row.company),
    email: cleanText(row.email),
    package: cleanText(row.package),
  };
}

function normalizeSubscription(row) {
  return {
    id: cleanText(row.id),
    profileId: cleanText(row.profile_id),
    customerAuthUserId: cleanText(row.customer_auth_user_id),
    packageName: cleanText(row.package_name),
    billingCycle: cleanText(row.billing_cycle || "monthly"),
    monthlyAmount: normalizeNullableNumber(row.monthly_amount),
    status: cleanText(row.status || "active"),
    startDate: cleanText(row.start_date),
    nextInvoiceDate: cleanText(row.next_invoice_date),
    mollieCustomerId: cleanText(row.mollie_customer_id),
    mollieSubscriptionId: cleanText(row.mollie_subscription_id),
    mollieSubscriptionStatus: cleanText(row.mollie_subscription_status),
    mollieMandateId: cleanText(row.mollie_mandate_id),
    lastPaymentAt: cleanText(row.last_payment_at),
    nextPaymentAt: cleanText(row.next_payment_at),
    canceledAt: cleanText(row.canceled_at),
    pausedAt: cleanText(row.paused_at),
    notes: cleanText(row.notes),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function normalizeInvoice(row) {
  return {
    id: cleanText(row.id),
    profileId: cleanText(row.profile_id),
    customerAuthUserId: cleanText(row.customer_auth_user_id),
    invoiceNumber: cleanText(row.invoice_number),
    title: cleanText(row.title),
    amount: normalizeNullableNumber(row.amount),
    status: normalizeInvoiceStatus(row.status || "draft"),
    dueDate: cleanText(row.due_date),
    paidAt: cleanText(row.paid_at),
    pdfFilePath: cleanText(row.pdf_file_path),
    molliePaymentId: cleanText(row.mollie_payment_id),
    mollieCheckoutUrl: cleanText(row.mollie_checkout_url),
    molliePaymentStatus: cleanText(row.mollie_payment_status),
    molliePaymentCreatedAt: cleanText(row.mollie_payment_created_at),
    molliePaymentExpiresAt: cleanText(row.mollie_payment_expires_at),
    emailSentAt: cleanText(row.email_sent_at),
    paymentReminderSentAt: cleanText(row.payment_reminder_sent_at),
    paidEmailSentAt: cleanText(row.paid_email_sent_at),
    expiredEmailSentAt: cleanText(row.expired_email_sent_at),
    emailLastError: cleanText(row.email_last_error),
    notes: cleanText(row.notes),
    createdAt: cleanText(row.created_at),
    updatedAt: cleanText(row.updated_at),
  };
}

function validateUuid(id, message) {
  const cleanId = cleanText(id);
  if (!uuidPattern.test(cleanId)) throwValidation(message);
  return cleanId;
}

function nullableAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throwValidation("Vul een geldig bedrag in.");
  return number;
}

function normalizeNullableNumber(value) {
  return value === null || value === undefined || value === "" ? null : Number(value);
}

function normalizeInvoicePdfPath(value) {
  const path = cleanText(value).replace(/^\/+/, "");
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) throwValidation("Gebruik alleen het private storage-pad, geen publieke URL.");
  return path.startsWith("invoice-pdfs/") ? path.slice("invoice-pdfs/".length) : path;
}

function normalizeInvoiceStatus(value) {
  const status = cleanText(value).toLowerCase();
  if (status === "overdue") return "expired";
  if (status === "cancelled") return "canceled";
  return status || "draft";
}

function throwValidation(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("Admin billing received non-JSON Supabase response", { status: response.status, bodyPreview: text.slice(0, 160) });
      throw new Error("Supabase gaf geen geldige JSON-response terug.");
    }
  }
  if (!response.ok) {
    console.error("Admin billing Supabase error", { status: response.status, message: data?.message || data?.error || "Unknown Supabase error" });
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.code = data?.code || "";
    error.details = data?.details || "";
    error.hint = data?.hint || "";
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

function cleanText(value) {
  return String(value || "").trim();
}

function isSchemaColumnError(error) {
  const message = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return error.code === "42703" || error.code === "PGRST204" || message.includes("column") || message.includes("schema cache");
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
