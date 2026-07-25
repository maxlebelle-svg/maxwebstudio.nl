const INVOICE_TABLE = "invoices";
const SUBSCRIPTION_TABLE = "subscriptions";

const INVOICE_FIELDS = [
  "id", "customer_id", "website_id", "project_id", "source_quote_id", "subscription_id",
  "invoice_number", "type", "title", "status", "invoice_date", "due_date", "paid_at",
  "subtotal", "vat", "total", "payment_link", "pdf_file_path", "mollie_payment_id",
  "mollie_checkout_url", "mollie_payment_status", "mollie_payment_created_at",
  "mollie_payment_expires_at", "email_sent_at", "payment_reminder_sent_at",
  "paid_email_sent_at", "expired_email_sent_at", "email_last_error", "notes", "is_demo",
  "environment", "metadata", "archived_at", "deleted_at", "created_at", "updated_at",
].join(",");

const SUBSCRIPTION_FIELDS = [
  "id", "customer_id", "website_id", "project_id", "plan", "status", "billing_cycle",
  "price_ex_vat", "vat_rate", "total_incl_vat", "start_date", "next_invoice_date",
  "last_invoice_id", "last_invoice_date", "auto_invoice_enabled", "mollie_customer_id",
  "mollie_subscription_id", "mollie_mandate_id", "mandate_status", "mandate_checkout_url",
  "retry_status", "subscription_risk_level", "internal_notes", "last_payment_at",
  "next_payment_at", "canceled_at", "paused_at", "resumed_at", "is_demo", "environment",
  "metadata", "archived_at", "created_at", "updated_at",
].join(",");

const invoiceColumns = new Set(INVOICE_FIELDS.split(","));
const subscriptionColumns = new Set(SUBSCRIPTION_FIELDS.split(","));
const ignoredIdentityFields = new Set(["profile_id", "customer_auth_user_id"]);

function cleanText(value = "") {
  return String(value || "").trim();
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundCurrency(value) {
  return Math.round((finiteNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizeInvoiceStatus(value = "draft") {
  const status = cleanText(value).toLowerCase();
  if (status === "concept") return "draft";
  if (status === "verzonden") return "sent";
  if (status === "betaald") return "paid";
  if (status === "verlopen" || status === "overdue") return "expired";
  if (status === "geannuleerd" || status === "cancelled") return "canceled";
  if (status === "mislukt") return "failed";
  return status || "draft";
}

function normalizeSubscriptionStatus(value = "active") {
  const status = cleanText(value).toLowerCase();
  if (status === "planned" || status === "gepland" || status === "scheduled") return "pending_mandate";
  if (status === "actief") return "active";
  if (status === "gepauzeerd") return "paused";
  if (status === "opgezegd" || status === "cancelled") return "canceled";
  return status || "active";
}

function canonicalInvoicePatch(input = {}) {
  const patch = {};
  const customerId = cleanText(input.customer_id || input.customerId || input.profile_id || input.profileId);
  if (customerId) patch.customer_id = customerId;

  Object.entries(input).forEach(([key, value]) => {
    if (ignoredIdentityFields.has(key) || key === "amount") return;
    if (invoiceColumns.has(key)) patch[key] = value;
  });

  if (Object.prototype.hasOwnProperty.call(input, "amount") && !Object.prototype.hasOwnProperty.call(input, "total")) {
    patch.total = finiteNumber(input.amount);
  }
  if (Object.prototype.hasOwnProperty.call(input, "total")) patch.total = finiteNumber(input.total);
  if (Object.prototype.hasOwnProperty.call(input, "subtotal")) patch.subtotal = finiteNumber(input.subtotal);
  if (Object.prototype.hasOwnProperty.call(input, "vat")) patch.vat = finiteNumber(input.vat);
  if (Object.prototype.hasOwnProperty.call(input, "status")) patch.status = normalizeInvoiceStatus(input.status);
  return patch;
}

function canonicalInvoiceRecord(input = {}) {
  const record = canonicalInvoicePatch(input);
  const total = finiteNumber(record.total);
  if (!Object.prototype.hasOwnProperty.call(record, "subtotal")) record.subtotal = total;
  if (!Object.prototype.hasOwnProperty.call(record, "vat")) record.vat = 0;
  if (!record.status) record.status = "draft";
  return record;
}

function invoiceView(row = {}) {
  return {
    ...row,
    amount: finiteNumber(row.total),
    payment_url: cleanText(row.payment_link || row.mollie_checkout_url),
  };
}

function canonicalSubscriptionPatch(input = {}, currentMetadata = {}) {
  const patch = {};
  const customerId = cleanText(input.customer_id || input.customerId || input.profile_id || input.profileId);
  if (customerId) patch.customer_id = customerId;

  const operational = { ...((currentMetadata && currentMetadata.financeOperations) || {}) };
  Object.entries(input).forEach(([key, value]) => {
    if (ignoredIdentityFields.has(key) || ["package_name", "monthly_amount", "notes"].includes(key)) return;
    if (subscriptionColumns.has(key)) patch[key] = value;
    else if (!["id"].includes(key)) operational[key] = value;
  });

  if (Object.prototype.hasOwnProperty.call(input, "package_name") && !Object.prototype.hasOwnProperty.call(input, "plan")) {
    patch.plan = cleanText(input.package_name);
  }
  if (Object.prototype.hasOwnProperty.call(input, "monthly_amount") && !Object.prototype.hasOwnProperty.call(input, "total_incl_vat")) {
    patch.total_incl_vat = finiteNumber(input.monthly_amount);
  }
  if (Object.prototype.hasOwnProperty.call(input, "notes") && !Object.prototype.hasOwnProperty.call(input, "internal_notes")) {
    patch.internal_notes = cleanText(input.notes);
  }
  if (Object.prototype.hasOwnProperty.call(input, "status")) patch.status = normalizeSubscriptionStatus(input.status);
  if (Object.prototype.hasOwnProperty.call(patch, "total_incl_vat") && !Object.prototype.hasOwnProperty.call(input, "price_ex_vat")) {
    const vatRate = finiteNumber(input.vat_rate, 21);
    patch.vat_rate = vatRate;
    patch.price_ex_vat = roundCurrency(patch.total_incl_vat / (1 + vatRate / 100));
  }
  if (Object.keys(operational).length) {
    patch.metadata = { ...(currentMetadata || {}), financeOperations: operational };
  }
  return patch;
}

function canonicalSubscriptionRecord(input = {}) {
  const record = canonicalSubscriptionPatch(input, input.metadata || {});
  if (!record.status) record.status = "active";
  if (!record.billing_cycle) record.billing_cycle = "monthly";
  if (!Object.prototype.hasOwnProperty.call(record, "vat_rate")) record.vat_rate = 21;
  if (!Object.prototype.hasOwnProperty.call(record, "price_ex_vat")) record.price_ex_vat = 0;
  if (!Object.prototype.hasOwnProperty.call(record, "total_incl_vat")) record.total_incl_vat = 0;
  return record;
}

function subscriptionView(row = {}) {
  const operations = row?.metadata?.financeOperations || {};
  return {
    ...operations,
    ...row,
    package_name: cleanText(row.plan),
    monthly_amount: finiteNumber(row.total_incl_vat),
    notes: cleanText(row.internal_notes),
    mollie_subscription_status: cleanText(operations.mollie_subscription_status || row.status),
  };
}

module.exports = {
  INVOICE_TABLE,
  SUBSCRIPTION_TABLE,
  INVOICE_FIELDS,
  SUBSCRIPTION_FIELDS,
  canonicalInvoicePatch,
  canonicalInvoiceRecord,
  canonicalSubscriptionPatch,
  canonicalSubscriptionRecord,
  invoiceView,
  subscriptionView,
  normalizeInvoiceStatus,
  normalizeSubscriptionStatus,
};
