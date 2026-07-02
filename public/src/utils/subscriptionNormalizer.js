const LOCAL_STATUS_BY_REMOTE = Object.freeze({
  active: "actief",
  actief: "actief",
  planned: "gepland",
  gepland: "gepland",
  draft: "concept",
  concept: "concept",
  paused: "gepauzeerd",
  gepauzeerd: "gepauzeerd",
  suspended: "gepauzeerd",
  cancelled: "opgezegd",
  canceled: "opgezegd",
  opgezegd: "opgezegd",
  expired: "verlopen",
  verlopen: "verlopen",
  archived: "gearchiveerd",
  gearchiveerd: "gearchiveerd",
  test: "test",
});

const REMOTE_STATUS_BY_LOCAL = Object.freeze({
  actief: "active",
  active: "active",
  gepland: "planned",
  planned: "planned",
  concept: "draft",
  draft: "draft",
  gepauzeerd: "paused",
  paused: "paused",
  opgezegd: "cancelled",
  canceled: "cancelled",
  cancelled: "cancelled",
  verlopen: "expired",
  expired: "expired",
  gearchiveerd: "archived",
  archived: "archived",
  test: "test",
});

const FREQUENCY_BY_REMOTE = Object.freeze({
  monthly: "monthly",
  maand: "monthly",
  maandelijks: "monthly",
  quarterly: "quarterly",
  kwartaal: "quarterly",
  "per_kwartaal": "quarterly",
  yearly: "yearly",
  annual: "yearly",
  jaar: "yearly",
  jaarlijks: "yearly",
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

function createId(prefix = "subscription") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeSubscriptionStatus(value) {
  const key = normalizeKey(value);
  return LOCAL_STATUS_BY_REMOTE[key] || key || "concept";
}

export function supabaseSubscriptionStatus(value) {
  const key = normalizeKey(value);
  return REMOTE_STATUS_BY_LOCAL[key] || key || "draft";
}

export function normalizeSubscriptionFrequency(value) {
  const key = normalizeKey(value);
  return FREQUENCY_BY_REMOTE[key] || key || "monthly";
}

export function subscriptionFrequencyFactor(value) {
  const frequency = normalizeSubscriptionFrequency(value);
  if (frequency === "yearly") return 1 / 12;
  if (frequency === "quarterly") return 1 / 3;
  return 1;
}

export function calculateSubscriptionTotals(subscription = {}) {
  const priceExVat = roundCurrency(subscription.priceExVat ?? subscription.monthlyAmount ?? subscription.monthly_amount ?? 0);
  const vatPercentage = numeric(subscription.vatPercentage ?? subscription.vatRate ?? subscription.vat_percentage, 21);
  const totalInclVat = roundCurrency(subscription.totalInclVat ?? subscription.total_incl_vat ?? priceExVat * (1 + vatPercentage / 100));
  const factor = subscriptionFrequencyFactor(subscription.invoiceFrequency || subscription.billingCycle || subscription.billing_cycle);
  const mrrExVat = roundCurrency(priceExVat * factor);
  const mrrInclVat = roundCurrency(totalInclVat * factor);
  return {
    priceExVat,
    vatPercentage,
    totalInclVat,
    mrrExVat,
    mrrInclVat,
    arrExVat: roundCurrency(mrrExVat * 12),
    arrInclVat: roundCurrency(mrrInclVat * 12),
  };
}

export function normalizeSubscription(subscription = {}) {
  const now = new Date().toISOString();
  const id = subscription.id || subscription.externalId || subscription.external_id || createId();
  const customerId = subscription.customerId || subscription.profileId || subscription.customer_id || subscription.metadata?.localCustomerId || "";
  const websiteId = subscription.websiteId || subscription.website_id || subscription.metadata?.localWebsiteId || "";
  const projectId = subscription.projectId || subscription.project_id || subscription.metadata?.localProjectId || "";
  const lastInvoiceId = subscription.lastInvoiceId || subscription.last_invoice_id || subscription.metadata?.localLastInvoiceId || "";
  const plan = String(subscription.plan || subscription.packageName || subscription.package_name || subscription.name || "").trim() || "Care Basic";
  const invoiceFrequency = normalizeSubscriptionFrequency(subscription.invoiceFrequency || subscription.billingCycle || subscription.billing_cycle);
  const totals = calculateSubscriptionTotals({ ...subscription, invoiceFrequency });
  const status = normalizeSubscriptionStatus(subscription.status);
  const createdAt = subscription.createdAt || subscription.created_at || now;
  return {
    id,
    externalId: subscription.externalId || subscription.external_id || subscription.metadata?.localStorageId || "",
    supabaseSubscriptionId: subscription.supabaseSubscriptionId || subscription._supabaseSubscriptionId || subscription.supabase_subscription_id || "",
    profileId: customerId,
    customerId,
    supabaseCustomerId: subscription.supabaseCustomerId || subscription.customer_id || "",
    websiteId,
    supabaseWebsiteId: subscription.supabaseWebsiteId || subscription.website_id || "",
    projectId,
    supabaseProjectId: subscription.supabaseProjectId || subscription.project_id || "",
    lastInvoiceId,
    supabaseLastInvoiceId: subscription.supabaseLastInvoiceId || subscription.last_invoice_id || "",
    customerName: subscription.customerName || subscription.customer_name || "",
    customerCompany: subscription.customerCompany || subscription.customer_company || "",
    customerEmail: subscription.customerEmail || subscription.customer_email || "",
    websiteName: subscription.websiteName || subscription.website_name || "",
    websiteDomain: subscription.websiteDomain || subscription.website_domain || "",
    projectName: subscription.projectName || subscription.project_name || "",
    plan,
    packageName: plan,
    status,
    startDate: subscription.startDate || subscription.start_date || now.slice(0, 10),
    endDate: subscription.endDate || subscription.end_date || "",
    nextInvoiceDate: subscription.nextInvoiceDate || subscription.next_invoice_date || "",
    lastInvoiceDate: subscription.lastInvoiceDate || subscription.last_invoice_date || "",
    invoiceFrequency,
    billingCycle: invoiceFrequency,
    priceExVat: totals.priceExVat,
    monthlyAmount: totals.priceExVat,
    vatPercentage: totals.vatPercentage,
    vatRate: totals.vatPercentage,
    totalInclVat: totals.totalInclVat,
    mrrExVat: totals.mrrExVat,
    mrrInclVat: totals.mrrInclVat,
    arrExVat: totals.arrExVat,
    arrInclVat: totals.arrInclVat,
    autoInvoiceEnabled: Boolean(subscription.autoInvoiceEnabled ?? subscription.auto_invoice_enabled),
    paymentStatus: subscription.paymentStatus || subscription.payment_status || "demo",
    paymentProviderCustomerId: subscription.paymentProviderCustomerId || subscription.payment_provider_customer_id || subscription.mollieCustomerId || subscription.mollie_customer_id || "",
    paymentMandateId: subscription.paymentMandateId || subscription.payment_mandate_id || subscription.mollieMandateId || subscription.mollie_mandate_id || "",
    mollieCustomerId: subscription.mollieCustomerId || subscription.mollie_customer_id || subscription.paymentProviderCustomerId || "",
    mollieSubscriptionId: subscription.mollieSubscriptionId || subscription.mollie_subscription_id || "",
    mollieSubscriptionStatus: subscription.mollieSubscriptionStatus || subscription.mollie_subscription_status || "",
    subscriptionInvoiceSequence: Number(subscription.subscriptionInvoiceSequence ?? subscription.subscription_invoice_sequence ?? 0),
    nextAutoInvoiceRun: subscription.nextAutoInvoiceRun || subscription.next_auto_invoice_run || subscription.nextInvoiceDate || "",
    invoiceGenerationLog: Array.isArray(subscription.invoiceGenerationLog) ? subscription.invoiceGenerationLog : Array.isArray(subscription.invoice_generation_log) ? subscription.invoice_generation_log : [],
    internalNotes: String(subscription.internalNotes || subscription.internal_notes || subscription.notes || "").trim(),
    notes: String(subscription.notes || subscription.internalNotes || subscription.internal_notes || "").trim(),
    isDemo: Boolean(subscription.isDemo ?? subscription.is_demo),
    isDemoJourney: Boolean(subscription.isDemoJourney ?? subscription.is_demo_journey),
    environment: subscription.environment || (subscription.isDemo || subscription.is_demo ? "demo" : "production"),
    demoScenarioId: subscription.demoScenarioId || subscription.demo_scenario_id || "",
    demoJourneyId: subscription.demoJourneyId || subscription.demo_journey_id || "",
    isArchived: Boolean(subscription.isArchived || subscription.deleted_at),
    metadata: subscription.metadata && typeof subscription.metadata === "object" ? subscription.metadata : {},
    createdAt,
    updatedAt: subscription.updatedAt || subscription.updated_at || createdAt,
  };
}

export function subscriptionIdentityKeys(subscription = {}) {
  const normalized = normalizeSubscription(subscription);
  return {
    id: String(normalized.id || "").trim(),
    supabaseSubscriptionId: String(normalized.supabaseSubscriptionId || "").trim(),
    externalId: String(normalized.externalId || "").trim(),
    customerWebsitePlan: [normalized.customerId, normalized.websiteId, normalized.plan].map((value) => String(value || "").trim().toLowerCase()).join("|"),
  };
}
