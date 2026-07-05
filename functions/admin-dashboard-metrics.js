const { verifyAdmin } = require("./_admin-auth");
const CUSTOMER_FIELDS = "id,auth_user_id,profile_id,name,company,email,website,status,portal_status,package,customer_since,is_demo,environment,created_at,updated_at";
const LEAD_FIELDS = "id,company_name,email,status,created_at,updated_at";
const WEBSITE_FIELDS = "id,customer_id,profile_id,name,domain,live_url,status,hosting_status,ssl_status,created_at,updated_at";
const PROJECT_FIELDS = "id,customer_id,website_id,name,type,status,phase,progress,created_at,updated_at";
const SUBSCRIPTION_FIELDS = [
  "id",
  "profile_id",
  "customer_auth_user_id",
  "package_name",
  "billing_cycle",
  "monthly_amount",
  "status",
  "mollie_subscription_status",
  "mandate_status",
  "mandate_checkout_url",
  "last_payment_at",
  "next_payment_at",
  "canceled_at",
  "paused_at",
  "created_at",
  "updated_at",
  "retry_status",
  "retry_next_action_at",
  "subscription_risk_level",
  "last_failed_payment_at",
  "failed_payment_count",
].join(",");
const QUOTE_FIELDS = "id,customer_id,website_id,project_id,quote_number,title,amount,currency,status,accepted_at,created_at,updated_at";
const BILLING_INVOICE_FIELDS = "id,profile_id,customer_auth_user_id,invoice_number,title,amount,status,due_date,paid_at,mollie_payment_id,mollie_payment_status,created_at,updated_at";

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
    }

    const adminCheck = await verifyAdmin(event, jsonResponse);
    if (!adminCheck.success) return adminCheck.response;

    const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Admin dashboard metrics missing Supabase configuration", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
      return jsonResponse(500, { success: false, error: "Dashboardmetrics konden niet worden geladen." });
    }

    const period = normalizePeriod(new URLSearchParams(event.queryStringParameters || {}).get("period"));
    const range = periodRange(period);
    const [customers, leads, websites, projects, quotes, subscriptions, invoices] = await Promise.all([
      fetchRows(supabaseUrl, serviceRoleKey, "customers", CUSTOMER_FIELDS, "updated_at.desc", 1000),
      fetchRows(supabaseUrl, serviceRoleKey, "leads", LEAD_FIELDS, "updated_at.desc", 1000),
      fetchRows(supabaseUrl, serviceRoleKey, "websites", WEBSITE_FIELDS, "updated_at.desc", 1000),
      fetchRows(supabaseUrl, serviceRoleKey, "projects", PROJECT_FIELDS, "updated_at.desc", 1000),
      fetchRows(supabaseUrl, serviceRoleKey, "quotes", QUOTE_FIELDS, "updated_at.desc", 1000),
      fetchRows(supabaseUrl, serviceRoleKey, "customer_subscriptions", SUBSCRIPTION_FIELDS, "updated_at.desc", 1000),
      fetchInvoices(supabaseUrl, serviceRoleKey),
    ]);

    const metrics = buildMetrics({ customers, leads, websites, projects, quotes, subscriptions, invoices, period, range });
    return jsonResponse(200, {
      success: true,
      period,
      generatedAt: new Date().toISOString(),
      metrics,
    });
  } catch (error) {
    console.error("Admin dashboard metrics error", {
      message: error.message,
      statusCode: error.statusCode || error.status || 500,
    });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Dashboardmetrics konden niet worden geladen.",
    });
  }
};

function buildMetrics({ customers, leads, websites, projects, quotes, subscriptions, invoices, period, range }) {
  const customerMap = new Map(customers.map((customer) => [cleanText(customer.id), customer]));
  const websitesByCustomer = new Map();
  websites.forEach((website) => {
    const customerId = cleanText(website.customer_id || website.profile_id);
    if (!customerId) return;
    if (!websitesByCustomer.has(customerId)) websitesByCustomer.set(customerId, []);
    websitesByCustomer.get(customerId).push(website);
  });

  const activeSubscriptions = subscriptions.filter(isActiveSubscription);
  const periodInvoices = invoices.filter((invoice) => inRange(invoice.paid_at || invoice.created_at || invoice.updated_at, range));
  const periodPaidInvoices = periodInvoices.filter(isPaidInvoice);
  const openInvoices = invoices.filter((invoice) => ["concept", "draft", "sent", "verzonden", "open", "pending", "verlopen", "overdue"].includes(normalize(invoice.status)));
  const paidInvoices = invoices.filter(isPaidInvoice);
  const expiredInvoices = invoices.filter((invoice) => normalize(invoice.status) === "expired" || normalize(invoice.status) === "overdue");
  const openLeads = leads.filter(isOpenLead);
  const soldLeads = leads.filter(isSoldLead);
  const periodLeads = leads.filter((lead) => inRange(lead.created_at || lead.updated_at, range));
  const periodSoldLeads = leads.filter((lead) => isSoldLead(lead) && inRange(lead.updated_at || lead.created_at, range));
  const activeProjects = projects.filter(isActiveProject);
  const liveWebsites = websites.filter(isLiveWebsite);
  const openQuotes = quotes.filter((quote) => ["concept", "draft", "sent", "verzonden", "bekeken", "viewed", "open", "pending"].includes(normalize(quote.status)));
  const retryNeeded = subscriptions.filter((subscription) => ["payment failed", "retry needed", "action required"].includes(normalize(subscription.retry_status)));
  const waitingMandates = subscriptions.filter((subscription) => cleanText(subscription.mandate_checkout_url) && normalize(subscription.mandate_status) !== "valid");
  const highRiskSubscriptions = subscriptions.filter((subscription) => normalize(subscription.subscription_risk_level) === "high");
  const attentionSubscriptions = subscriptions.filter((subscription) => normalize(subscription.subscription_risk_level) === "attention");
  const normalSubscriptions = subscriptions.filter((subscription) => !["attention", "high"].includes(normalize(subscription.subscription_risk_level)));
  const pausedSubscriptions = subscriptions.filter((subscription) => ["paused", "suspended"].includes(normalize(subscription.status)) || normalize(subscription.mollie_subscription_status) === "suspended");
  const canceledSubscriptions = subscriptions.filter((subscription) => ["canceled", "cancelled"].includes(normalize(subscription.status)) || ["canceled", "cancelled"].includes(normalize(subscription.mollie_subscription_status)));
  const mrr = activeSubscriptions.reduce((sum, subscription) => sum + monthlyValue(subscription), 0);

  return {
    subscriptions: {
      active: activeSubscriptions.length,
      waitingMandate: waitingMandates.length,
      paused: pausedSubscriptions.length,
      canceled: canceledSubscriptions.length,
      highRisk: highRiskSubscriptions.length,
      attention: attentionSubscriptions.length,
      normal: normalSubscriptions.length,
    },
    finance: {
      mrr,
      arr: mrr * 12,
      openInvoices: openInvoices.length,
      paidInvoices: paidInvoices.length,
      expiredInvoices: expiredInvoices.length,
      openQuotes: openQuotes.length,
      openValue: sumAmounts(openInvoices),
      paidRevenue: sumAmounts(periodPaidInvoices),
      totalPaidRevenue: sumAmounts(paidInvoices),
    },
    customers: {
      total: customers.length,
      active: customers.filter(isActiveCustomer).length,
      withoutWebsite: customers.filter((customer) => !hasWebsite(customer, websitesByCustomer)).length,
      withWebsite: customers.filter((customer) => hasWebsite(customer, websitesByCustomer)).length,
    },
    leads: {
      total: leads.length,
      open: openLeads.length,
      period: periodLeads.length,
      sold: soldLeads.length,
      soldInPeriod: periodSoldLeads.length,
      conversionRate: periodLeads.length ? Math.round((periodSoldLeads.length / periodLeads.length) * 100) : 0,
    },
    websites: {
      total: websites.length,
      active: liveWebsites.length,
    },
    projects: {
      total: projects.length,
      active: activeProjects.length,
    },
    operations: {
      openChangeRequests: openLeads.length,
      retryActionsNeeded: retryNeeded.length,
      waitingMandates: waitingMandates.length,
    },
    charts: {
      revenueByMonth: revenueByMonth(invoices, range, period),
      subscriptionGrowth: subscriptionGrowth(subscriptions, range, period),
      invoiceStatusDistribution: distribution(invoices, "status"),
      subscriptionStatusDistribution: subscriptionDistribution(subscriptions),
    },
    actionItems: actionItems({ invoices, subscriptions, customers: customerMap, leads: openLeads }),
  };
}

function actionItems({ invoices, subscriptions, customers, leads }) {
  const items = [];
  invoices
    .filter((invoice) => ["expired", "overdue"].includes(normalize(invoice.status)))
    .slice(0, 8)
    .forEach((invoice) => items.push({
      type: "invoice_expired",
      label: "Verlopen factuur",
      title: cleanText(invoice.invoice_number || invoice.title) || "Factuur",
      customer: customerLabel(customers.get(cleanText(invoice.customer_id || invoice.profile_id))),
      profileId: cleanText(invoice.customer_id || invoice.profile_id),
      severity: "attention",
      date: cleanText(invoice.due_date || invoice.updated_at || invoice.created_at),
    }));

  subscriptions
    .filter((subscription) => ["payment failed", "retry needed", "action required"].includes(normalize(subscription.retry_status)))
    .slice(0, 8)
    .forEach((subscription) => items.push({
      type: "retry_needed",
      label: "Mislukte incasso",
      title: cleanText(subscription.package_name) || "Onderhoudsabonnement",
      customer: customerLabel(customers.get(cleanText(subscription.customer_id || subscription.profile_id))),
      profileId: cleanText(subscription.customer_id || subscription.profile_id),
      severity: normalize(subscription.subscription_risk_level) === "high" ? "high" : "attention",
      date: cleanText(subscription.last_failed_payment_at || subscription.retry_next_action_at || subscription.updated_at),
    }));

  subscriptions
    .filter((subscription) => cleanText(subscription.mandate_checkout_url) && normalize(subscription.mandate_status) !== "valid")
    .slice(0, 8)
    .forEach((subscription) => items.push({
      type: "mandate_waiting",
      label: "Mandate wacht",
      title: cleanText(subscription.package_name) || "Onderhoudsabonnement",
      customer: customerLabel(customers.get(cleanText(subscription.customer_id || subscription.profile_id))),
      profileId: cleanText(subscription.customer_id || subscription.profile_id),
      severity: "planned",
      date: cleanText(subscription.updated_at || subscription.created_at),
    }));

  subscriptions
    .filter((subscription) => normalize(subscription.subscription_risk_level) === "high")
    .slice(0, 8)
    .forEach((subscription) => items.push({
      type: "high_risk",
      label: "Hoog risico",
      title: cleanText(subscription.package_name) || "Onderhoudsabonnement",
      customer: customerLabel(customers.get(cleanText(subscription.customer_id || subscription.profile_id))),
      profileId: cleanText(subscription.customer_id || subscription.profile_id),
      severity: "high",
      date: cleanText(subscription.last_failed_payment_at || subscription.updated_at),
    }));

  leads
    .slice(0, 6)
    .forEach((lead) => items.push({
      type: "lead_open",
      label: "Open lead",
      title: cleanText(lead.company_name || lead.email) || "Lead",
      customer: cleanText(lead.company_name || lead.email) || "Lead",
      profileId: "",
      severity: "planned",
      date: cleanText(lead.updated_at || lead.created_at),
    }));

  return items
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity) || dateMs(b.date) - dateMs(a.date))
    .slice(0, 20);
}

function revenueByMonth(invoices, range, period) {
  const months = monthBuckets(range, period);
  const values = new Map(months.map((month) => [month.key, { label: month.label, value: 0 }]));
  invoices.forEach((invoice) => {
    if (normalize(invoice.status) !== "paid") return;
    const paidAt = invoice.paid_at || invoice.updated_at || invoice.created_at;
    if (!inRange(paidAt, range)) return;
    const key = monthKey(paidAt);
    if (!values.has(key)) values.set(key, { label: key, value: 0 });
    values.get(key).value += amount(invoice.amount);
  });
  return [...values.values()];
}

function subscriptionGrowth(subscriptions, range, period) {
  const months = monthBuckets(range, period);
  return months.map((month) => ({
    label: month.label,
    value: subscriptions.filter((subscription) => dateMs(subscription.created_at) <= month.end.getTime()).length,
  }));
}

function distribution(rows, field) {
  const result = new Map();
  rows.forEach((row) => {
    const key = normalize(row[field]) || "unknown";
    result.set(key, (result.get(key) || 0) + 1);
  });
  return [...result.entries()].map(([label, value]) => ({ label, value }));
}

function subscriptionDistribution(subscriptions) {
  const result = new Map();
  subscriptions.forEach((subscription) => {
    const status = normalize(subscription.status || subscription.mollie_subscription_status) || "unknown";
    result.set(status, (result.get(status) || 0) + 1);
  });
  return [...result.entries()].map(([label, value]) => ({ label, value }));
}

function monthBuckets(range, period) {
  const now = new Date();
  const start = range?.start ? new Date(range.start) : new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = range?.end ? new Date(range.end) : now;
  if (period === "today") {
    return [{ key: monthKey(now), label: "Vandaag", end }];
  }
  const buckets = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end && buckets.length < 18) {
    const bucketEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59));
    buckets.push({
      key: monthKey(cursor),
      label: new Intl.DateTimeFormat("nl-NL", { month: "short" }).format(cursor),
      end: bucketEnd,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return buckets;
}

async function fetchRows(supabaseUrl, serviceRoleKey, table, fields, order, limit) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(fields)}&order=${encodeURIComponent(order)}&limit=${limit}`;
  const response = await fetch(url, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) {
    console.error("Dashboard metrics Supabase fetch failed", {
      table,
      status: response.status,
      message: data.message || data.error || "Unknown Supabase error",
    });
    if (response.status === 404 || isSchemaError(data)) return [];
    const error = new Error(data.message || data.error || `${table} kon niet worden geladen.`);
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

async function fetchInvoices(supabaseUrl, serviceRoleKey) {
  const billingInvoices = await fetchRows(supabaseUrl, serviceRoleKey, "customer_invoices", BILLING_INVOICE_FIELDS, "created_at.desc.nullslast", 1000);
  return mergeInvoices(billingInvoices.map((invoice) => normalizeBillingInvoice(invoice)));
}

function mergeInvoices(invoices) {
  const result = [];
  const seen = new Set();
  invoices.forEach((invoice) => {
    const key = cleanText(invoice.id) || cleanText(invoice.invoice_number).toLowerCase();
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    result.push(invoice);
  });
  return result;
}

function normalizeBillingInvoice(invoice) {
  return {
    ...invoice,
    customer_id: cleanText(invoice.customer_id || invoice.profile_id),
    amount: amount(invoice.amount),
    revenue_source: "customer_invoices",
  };
}

function periodRange(period) {
  if (period === "all") return null;
  const now = new Date();
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (period === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return { start: new Date(now.getFullYear(), quarterStartMonth, 1), end: now };
  }
  if (period === "year") return { start: new Date(now.getFullYear(), 0, 1), end: now };
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
}

function normalizePeriod(value) {
  return ["today", "month", "quarter", "year", "all"].includes(value) ? value : "month";
}

function isActiveSubscription(subscription) {
  const localStatus = normalize(subscription.status);
  const mollieStatus = normalize(subscription.mollie_subscription_status);
  return localStatus === "active" || mollieStatus === "active";
}

function isActiveCustomer(customer) {
  const status = normalize(customer.status || "actief");
  return !["archived", "gearchiveerd", "disabled", "inactive"].includes(status);
}

function isLiveWebsite(website) {
  return ["online", "live", "active", "actief"].includes(normalize(website.status));
}

function isActiveProject(project) {
  return !["live", "completed", "done", "afgerond", "onderhoud", "maintenance", "gepauzeerd", "paused", "gearchiveerd", "archived"].includes(normalize(project.status));
}

function isOpenLead(lead) {
  return !["won", "verkocht", "customer active", "customer_active", "lost", "geen interesse", "gearchiveerd", "archived", "converted", "geconverteerd"].includes(normalize(lead.status));
}

function isSoldLead(lead) {
  return ["won", "verkocht", "customer active", "customer_active", "converted", "geconverteerd"].includes(normalize(lead.status));
}

function monthlyValue(subscription) {
  const value = amount(subscription.monthly_amount);
  const cycle = normalize(subscription.billing_cycle || "monthly");
  if (cycle === "quarterly") return value;
  if (cycle === "yearly") return value;
  return value;
}

function sumAmounts(rows) {
  return rows.reduce((sum, row) => sum + invoiceAmount(row), 0);
}

function invoiceAmount(invoice = {}) {
  const directAmount = amount(invoice.amount);
  if (directAmount) return directAmount;
  const total = amount(invoice.total);
  if (total) return total;
  return amount(invoice.subtotal) + amount(invoice.vat);
}

function isPaidInvoice(invoice = {}) {
  return ["paid", "betaald"].includes(normalize(invoice.status))
    || ["paid", "betaald"].includes(normalize(invoice.mollie_payment_status));
}

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hasWebsite(profile, websitesByProfile) {
  if (websitesByProfile.has(cleanText(profile.id))) return true;
  return Boolean(cleanText(profile.website));
}

function customerLabel(profile) {
  return cleanText(profile?.company || profile?.name || profile?.email) || "Klant";
}

function inRange(value, range) {
  if (!range) return true;
  const time = dateMs(value);
  return time >= range.start.getTime() && time <= range.end.getTime();
}

function monthKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateMs(value) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function severityWeight(value) {
  return { high: 3, attention: 2, planned: 1 }[value] || 0;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function isSchemaError(data) {
  const text = `${data?.code || ""} ${data?.message || ""} ${data?.details || ""}`.toLowerCase();
  return text.includes("schema") || text.includes("column") || text.includes("relation");
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
  };
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}
