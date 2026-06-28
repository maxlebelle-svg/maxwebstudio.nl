const LOCAL_STATUS_BY_REMOTE = Object.freeze({
  draft: "concept",
  concept: "concept",
  sent: "verzonden",
  verzonden: "verzonden",
  accepted: "geaccepteerd",
  geaccepteerd: "geaccepteerd",
  rejected: "afgewezen",
  afgewezen: "afgewezen",
  expired: "verlopen",
  verlopen: "verlopen",
  canceled: "geannuleerd",
  cancelled: "geannuleerd",
  geannuleerd: "geannuleerd",
  archived: "gearchiveerd",
  gearchiveerd: "gearchiveerd",
  test: "test",
});

const REMOTE_STATUS_BY_LOCAL = Object.freeze({
  concept: "draft",
  draft: "draft",
  verzonden: "sent",
  sent: "sent",
  geaccepteerd: "accepted",
  accepted: "accepted",
  afgewezen: "rejected",
  rejected: "rejected",
  verlopen: "expired",
  expired: "expired",
  geannuleerd: "canceled",
  canceled: "canceled",
  cancelled: "canceled",
  gearchiveerd: "archived",
  archived: "archived",
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

function createId(prefix = "quote-line") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeQuoteStatus(value) {
  const key = normalizeKey(value);
  return LOCAL_STATUS_BY_REMOTE[key] || key || "concept";
}

export function localQuoteStatus(value) {
  return normalizeQuoteStatus(value);
}

export function supabaseQuoteStatus(value) {
  const key = normalizeKey(value);
  return REMOTE_STATUS_BY_LOCAL[key] || key || "draft";
}

export function normalizeQuoteLine(line = {}, index = 0) {
  const quantity = numeric(line.quantity ?? line.amount, 1);
  const unitPrice = numeric(line.unitPrice ?? line.unit_price ?? line.price, 0);
  const vatRate = numeric(line.vatRate ?? line.vat_rate ?? line.vatPercentage ?? line.vat_percentage, 21);
  const subtotal = roundCurrency(line.subtotal ?? line.lineSubtotal ?? line.line_subtotal ?? quantity * unitPrice);
  const vat = roundCurrency(line.vat ?? line.lineVat ?? line.line_vat ?? subtotal * (vatRate / 100));
  const total = roundCurrency(line.total ?? line.lineTotal ?? line.line_total ?? subtotal + vat);
  return {
    id: line.id || line.externalId || line.external_id || createId(),
    externalId: line.externalId || line.external_id || line.id || "",
    quoteId: line.quoteId || line.quote_id || "",
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

export function calculateQuoteTotals(lines = []) {
  const normalizedLines = lines.map(normalizeQuoteLine).filter((line) => line.description);
  return {
    subtotal: roundCurrency(normalizedLines.reduce((sum, line) => sum + numeric(line.subtotal), 0)),
    vat: roundCurrency(normalizedLines.reduce((sum, line) => sum + numeric(line.vat), 0)),
    total: roundCurrency(normalizedLines.reduce((sum, line) => sum + numeric(line.total), 0)),
  };
}

export function normalizeQuote(quote = {}) {
  const now = new Date().toISOString();
  const id = quote.id || quote.externalId || quote.external_id || createId("quote");
  const profileId = quote.profileId || quote.customerId || quote.customer_id || quote.customer_external_id || quote.metadata?.localCustomerId || "";
  const websiteId = quote.websiteId || quote.website_id || quote.website_external_id || quote.metadata?.localWebsiteId || "";
  const projectId = quote.projectId || quote.project_id || quote.project_external_id || quote.metadata?.localProjectId || "";
  const lines = Array.isArray(quote.lines) && quote.lines.length
    ? quote.lines.map((line, index) => normalizeQuoteLine({ ...line, quoteId: id }, index)).filter((line) => line.description)
    : [];
  const totals = calculateQuoteTotals(lines);
  const subtotal = roundCurrency(quote.subtotal ?? quote.amount_ex_vat ?? totals.subtotal);
  const vat = roundCurrency(quote.vat ?? quote.vat_amount ?? totals.vat);
  const total = roundCurrency(quote.total ?? quote.amount ?? quote.total_amount ?? totals.total);
  const createdAt = quote.createdAt || quote.created_at || now;
  return {
    id,
    externalId: quote.externalId || quote.external_id || quote.metadata?.localStorageId || "",
    supabaseQuoteId: quote.supabaseQuoteId || quote._supabaseQuoteId || quote.supabase_quote_id || "",
    quoteNumber: String(quote.quoteNumber || quote.quote_number || quote.number || "").trim(),
    profileId,
    customerId: profileId,
    supabaseCustomerId: quote.supabaseCustomerId || quote.customer_id || "",
    websiteId,
    supabaseWebsiteId: quote.supabaseWebsiteId || quote.website_id || "",
    projectId,
    supabaseProjectId: quote.supabaseProjectId || quote.project_id || "",
    customerName: quote.customerName || quote.customer_name || "",
    customerCompany: quote.customerCompany || quote.customer_company || quote.company_name || "",
    customerEmail: quote.customerEmail || quote.customer_email || "",
    customerPhone: quote.customerPhone || quote.customer_phone || "",
    websiteName: quote.websiteName || quote.website_name || "",
    websiteDomain: quote.websiteDomain || quote.website_domain || "",
    projectName: quote.projectName || quote.project_name || "",
    type: quote.type || quote.quoteType || quote.quote_type || "Website",
    title: String(quote.title || quote.subject || quote.quoteNumber || quote.quote_number || "Offerte").trim(),
    status: normalizeQuoteStatus(quote.status),
    quoteDate: quote.quoteDate || quote.quote_date || quote.createdAt?.slice?.(0, 10) || quote.created_at?.slice?.(0, 10) || now.slice(0, 10),
    validUntil: quote.validUntil || quote.valid_until || quote.expires_at?.slice?.(0, 10) || "",
    acceptedAt: quote.acceptedAt || quote.accepted_at || "",
    lines,
    subtotal,
    vat,
    total,
    amount: total,
    proposal: String(quote.proposal || quote.customerNote || quote.customer_note || quote.description || "").trim(),
    notes: String(quote.notes || quote.internal_notes || "").trim(),
    quoteLink: quote.quoteLink || quote.demoQuoteLink || quote.demo_quote_link || "",
    demoQuoteLink: quote.demoQuoteLink || quote.quoteLink || quote.demo_quote_link || "",
    convertedToInvoiceId: quote.convertedToInvoiceId || quote.converted_to_invoice_id || "",
    convertedAt: quote.convertedAt || quote.converted_at || "",
    isDemo: Boolean(quote.isDemo ?? quote.is_demo),
    isDemoJourney: Boolean(quote.isDemoJourney ?? quote.is_demo_journey),
    environment: quote.environment || (quote.isDemo || quote.is_demo ? "demo" : "production"),
    demoScenarioId: quote.demoScenarioId || quote.demo_scenario_id || "",
    demoJourneyId: quote.demoJourneyId || quote.demo_journey_id || "",
    isArchived: Boolean(quote.isArchived || quote.deleted_at),
    metadata: quote.metadata && typeof quote.metadata === "object" ? quote.metadata : {},
    createdAt,
    updatedAt: quote.updatedAt || quote.updated_at || createdAt,
  };
}

export function quoteIdentityKeys(quote = {}) {
  const normalized = normalizeQuote(quote);
  return {
    id: String(normalized.id || "").trim(),
    supabaseQuoteId: String(normalized.supabaseQuoteId || "").trim(),
    externalId: String(normalized.externalId || "").trim(),
    quoteNumber: normalized.quoteNumber.toLowerCase(),
  };
}
