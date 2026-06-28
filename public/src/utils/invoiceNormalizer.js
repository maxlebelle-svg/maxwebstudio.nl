const LOCAL_STATUS_BY_REMOTE = Object.freeze({
  draft: "concept",
  concept: "concept",
  sent: "verzonden",
  verzonden: "verzonden",
  paid: "betaald",
  betaald: "betaald",
  expired: "verlopen",
  overdue: "verlopen",
  verlopen: "verlopen",
  canceled: "geannuleerd",
  cancelled: "geannuleerd",
  geannuleerd: "geannuleerd",
  archived: "gearchiveerd",
  gearchiveerd: "gearchiveerd",
  failed: "mislukt",
  mislukt: "mislukt",
  test: "test",
});

const REMOTE_STATUS_BY_LOCAL = Object.freeze({
  concept: "draft",
  draft: "draft",
  verzonden: "sent",
  sent: "sent",
  betaald: "paid",
  paid: "paid",
  verlopen: "expired",
  expired: "expired",
  overdue: "expired",
  geannuleerd: "canceled",
  canceled: "canceled",
  cancelled: "canceled",
  gearchiveerd: "archived",
  archived: "archived",
  mislukt: "failed",
  failed: "failed",
  test: "test",
});

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundCurrency(value) {
  return Math.round((numeric(value) + Number.EPSILON) * 100) / 100;
}

function createId(prefix = "invoice-line") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeInvoiceStatus(value) {
  const key = normalizeKey(value);
  return LOCAL_STATUS_BY_REMOTE[key] || key || "concept";
}

export function normalizePaymentStatus(value, fallbackStatus = "") {
  const key = normalizeKey(value || fallbackStatus);
  return LOCAL_STATUS_BY_REMOTE[key] || key || normalizeInvoiceStatus(fallbackStatus || "concept");
}

export function localInvoiceStatus(value) {
  return normalizeInvoiceStatus(value);
}

export function supabaseInvoiceStatus(value) {
  const key = normalizeKey(value);
  return REMOTE_STATUS_BY_LOCAL[key] || key || "draft";
}

export function supabasePaymentStatus(value) {
  const key = normalizeKey(value);
  return REMOTE_STATUS_BY_LOCAL[key] || key || "draft";
}

export function normalizeInvoiceLine(line = {}, index = 0) {
  const quantity = numeric(line.quantity ?? line.amount, 1);
  const unitPrice = numeric(line.unitPrice ?? line.unit_price ?? line.price, 0);
  const vatRate = numeric(line.vatRate ?? line.vat_rate ?? line.vatPercentage ?? line.vat_percentage, 21);
  const subtotal = roundCurrency(line.subtotal ?? line.lineSubtotal ?? line.line_subtotal ?? quantity * unitPrice);
  const vat = roundCurrency(line.vat ?? line.lineVat ?? line.line_vat ?? line.vatAmount ?? subtotal * (vatRate / 100));
  const total = roundCurrency(line.total ?? line.lineTotal ?? line.line_total ?? subtotal + vat);
  return {
    id: line.id || line.externalId || line.external_id || createId(),
    externalId: line.externalId || line.external_id || line.id || "",
    invoiceId: line.invoiceId || line.invoice_id || "",
    description: String(line.description || line.name || line.title || "").trim(),
    quantity,
    unitPrice,
    vatRate,
    subtotal,
    vat,
    total,
    sortOrder: Number.isFinite(Number(line.sortOrder ?? line.sort_order)) ? Number(line.sortOrder ?? line.sort_order) : index,
    metadata: line.metadata && typeof line.metadata === "object" ? line.metadata : {},
  };
}

export function calculateInvoiceTotals(lines = []) {
  const normalizedLines = lines.map(normalizeInvoiceLine).filter((line) => line.description);
  return {
    subtotal: roundCurrency(normalizedLines.reduce((sum, line) => sum + numeric(line.subtotal), 0)),
    vat: roundCurrency(normalizedLines.reduce((sum, line) => sum + numeric(line.vat), 0)),
    total: roundCurrency(normalizedLines.reduce((sum, line) => sum + numeric(line.total), 0)),
  };
}

export function normalizeInvoice(invoice = {}) {
  const now = new Date().toISOString();
  const id = invoice.id || invoice.externalId || invoice.external_id || createId("invoice");
  const profileId = invoice.profileId || invoice.customerId || invoice.customer_id || invoice.customer_external_id || invoice.metadata?.localCustomerId || "";
  const websiteId = invoice.websiteId || invoice.website_id || invoice.website_external_id || invoice.metadata?.localWebsiteId || "";
  const projectId = invoice.projectId || invoice.project_id || invoice.project_external_id || invoice.metadata?.localProjectId || "";
  const sourceQuoteId = invoice.sourceQuoteId || invoice.quoteId || invoice.quote_id || invoice.metadata?.localQuoteId || "";
  const subscriptionId = invoice.subscriptionId || invoice.subscription_id || invoice.metadata?.localSubscriptionId || "";
  const lines = Array.isArray(invoice.lines) && invoice.lines.length
    ? invoice.lines.map((line, index) => normalizeInvoiceLine({ ...line, invoiceId: id }, index)).filter((line) => line.description)
    : [];
  const totals = calculateInvoiceTotals(lines);
  const subtotal = roundCurrency(invoice.subtotal ?? invoice.amount_ex_vat ?? invoice.subtotal_amount ?? totals.subtotal);
  const vat = roundCurrency(invoice.vat ?? invoice.vatAmount ?? invoice.vat_amount ?? totals.vat);
  const total = roundCurrency(invoice.total ?? invoice.amount ?? invoice.total_amount ?? totals.total);
  const status = normalizeInvoiceStatus(invoice.status);
  const createdAt = invoice.createdAt || invoice.created_at || now;
  return {
    id,
    externalId: invoice.externalId || invoice.external_id || invoice.metadata?.localStorageId || "",
    supabaseInvoiceId: invoice.supabaseInvoiceId || invoice._supabaseInvoiceId || invoice.supabase_invoice_id || "",
    invoiceNumber: String(invoice.invoiceNumber || invoice.invoice_number || invoice.number || "").trim(),
    profileId,
    customerId: profileId,
    supabaseCustomerId: invoice.supabaseCustomerId || invoice.customer_id || "",
    websiteId,
    supabaseWebsiteId: invoice.supabaseWebsiteId || invoice.website_id || "",
    projectId,
    supabaseProjectId: invoice.supabaseProjectId || invoice.project_id || "",
    sourceQuoteId,
    supabaseQuoteId: invoice.supabaseQuoteId || invoice.quote_id || "",
    subscriptionId,
    supabaseSubscriptionId: invoice.supabaseSubscriptionId || invoice.subscription_id || "",
    customerName: invoice.customerName || invoice.customer_name || "",
    customerCompany: invoice.customerCompany || invoice.customer_company || invoice.company_name || "",
    customerEmail: invoice.customerEmail || invoice.customer_email || "",
    customerPhone: invoice.customerPhone || invoice.customer_phone || "",
    websiteName: invoice.websiteName || invoice.website_name || "",
    websiteDomain: invoice.websiteDomain || invoice.website_domain || "",
    projectName: invoice.projectName || invoice.project_name || "",
    type: invoice.type || invoice.invoiceType || invoice.invoice_type || "Website",
    title: String(invoice.title || invoice.subject || invoice.invoiceNumber || invoice.invoice_number || "Factuur").trim(),
    status,
    paymentStatus: normalizePaymentStatus(invoice.paymentStatus || invoice.payment_status || invoice.molliePaymentStatus || invoice.mollie_payment_status, status),
    invoiceDate: invoice.invoiceDate || invoice.invoice_date || invoice.createdAt?.slice?.(0, 10) || invoice.created_at?.slice?.(0, 10) || now.slice(0, 10),
    dueDate: invoice.dueDate || invoice.due_date || "",
    paidAt: invoice.paidAt || invoice.paid_at || invoice.paidDate || invoice.paid_date || "",
    lines,
    subtotal,
    vat,
    vatAmount: vat,
    total,
    amount: total,
    paymentLink: invoice.paymentLink || invoice.payment_link || invoice.mollieCheckoutUrl || invoice.mollie_checkout_url || invoice.demoPaymentLink || "",
    demoPaymentLink: invoice.demoPaymentLink || invoice.demo_payment_link || invoice.paymentLink || "",
    mollieCheckoutUrl: invoice.mollieCheckoutUrl || invoice.mollie_checkout_url || invoice.paymentLink || "",
    molliePaymentId: invoice.molliePaymentId || invoice.mollie_payment_id || "",
    pdfFilePath: invoice.pdfFilePath || invoice.pdf_file_path || "",
    notes: String(invoice.notes || invoice.internalNotes || invoice.internal_notes || "").trim(),
    internalNotes: String(invoice.internalNotes || invoice.internal_notes || invoice.notes || "").trim(),
    sourceQuoteNumber: invoice.sourceQuoteNumber || invoice.source_quote_number || "",
    subscriptionPlan: invoice.subscriptionPlan || invoice.subscription_plan || "",
    subscriptionBillingCycle: invoice.subscriptionBillingCycle || invoice.subscription_billing_cycle || "",
    subscriptionInvoicePeriod: invoice.subscriptionInvoicePeriod || invoice.subscription_invoice_period || "",
    isDemo: Boolean(invoice.isDemo ?? invoice.is_demo),
    isDemoJourney: Boolean(invoice.isDemoJourney ?? invoice.is_demo_journey),
    environment: invoice.environment || (invoice.isDemo || invoice.is_demo ? "demo" : "production"),
    demoScenarioId: invoice.demoScenarioId || invoice.demo_scenario_id || "",
    demoJourneyId: invoice.demoJourneyId || invoice.demo_journey_id || "",
    isArchived: Boolean(invoice.isArchived || invoice.deleted_at),
    metadata: invoice.metadata && typeof invoice.metadata === "object" ? invoice.metadata : {},
    createdAt,
    updatedAt: invoice.updatedAt || invoice.updated_at || createdAt,
  };
}

export function invoiceIdentityKeys(invoice = {}) {
  const normalized = normalizeInvoice(invoice);
  return {
    id: String(normalized.id || "").trim(),
    supabaseInvoiceId: String(normalized.supabaseInvoiceId || "").trim(),
    externalId: String(normalized.externalId || "").trim(),
    invoiceNumber: normalized.invoiceNumber.toLowerCase(),
  };
}
