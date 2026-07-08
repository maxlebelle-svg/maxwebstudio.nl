export const MAX_BRAIN_CACHE_KEY = "maxwebstudioMaxBrainCache";
export const MAX_BRAIN_CACHE_TTL_MS = 5 * 60 * 1000;

const STORAGE_KEYS = Object.freeze({
  customers: ["maxwebstudioCrmCustomers", "maxwebstudioCustomers", "maxwebstudioProfiles"],
  leads: ["maxwebstudioLeads", "maxwebstudioLeadRequests", "maxwebstudioLeadFinderLeads"],
  invoices: ["maxwebstudioInvoices"],
  emails: ["maxwebstudioMailLogs", "maxwebstudioDemoEmails", "maxwebstudioEmailTemplates"],
  notifications: ["maxwebstudioClientPortalNotifications", "maxwebstudioActivityLog"],
  timeline: ["maxwebstudioActivityLog", "maxwebstudioCustomerTimelineEvents"],
  websites: ["maxwebstudioManagedSites", "maxwebstudioWebsites"],
  assets: ["maxwebstudioFiles", "maxwebstudioBrandAssets", "maxwebstudioLogoProjects"],
  automations: ["maxwebstudioAutomationWorkflows", "maxwebstudioAutomationExecutions"],
});

export function buildMaxBrainContext(query = {}, options = {}) {
  const data = options.data || collectBrainData();
  const entity = findEntity(query, data);
  const customer = entity.customer || resolveCustomer(entity, data);
  const lead = entity.lead || null;
  const invoice = entity.invoice || null;
  const email = entity.email || latestForCustomer(data.emails, customer);
  const relatedInvoices = customer ? data.invoices.filter((item) => relatesToCustomer(item, customer)) : invoice ? [invoice] : [];
  const relatedWebsites = customer ? data.websites.filter((item) => relatesToCustomer(item, customer)) : [];
  const relatedTimeline = filterRelated(data.timeline, { customer, lead, invoice, email }).slice(0, 12);
  const relatedNotifications = filterRelated(data.notifications, { customer, lead, invoice, email }).slice(0, 8);
  const automationState = summarizeAutomations(data.automations, { customer, lead, invoice });
  const openInvoices = relatedInvoices.filter(isOpenInvoice);
  const websiteStatus = summarizeWebsiteStatus(relatedWebsites);
  const timelineSummary = summarizeTimeline(relatedTimeline);
  const lastContact = latestDate([
    customer?.lastContactAt,
    customer?.updatedAt,
    customer?.createdAt,
    lead?.updatedAt,
    lead?.createdAt,
    email?.createdAt,
    email?.sentAt,
    relatedTimeline[0]?.createdAt,
    relatedTimeline[0]?.timestamp,
  ]);
  const risk = calculateRisk({ customer, lead, invoice, email, openInvoices, websiteStatus, relatedNotifications, relatedTimeline, lastContact });
  const opportunity = calculateOpportunity({ customer, lead, invoice, openInvoices, websiteStatus, automationState });
  const recommendations = recommendActions({ customer, lead, invoice, email, openInvoices, websiteStatus, automationState, risk, opportunity });

  return {
    generatedAt: new Date().toISOString(),
    source: options.source || "local-storage",
    query: normalizeQuery(query),
    entity: entity.type ? { type: entity.type, id: entity.id, label: entity.label } : null,
    customer: customer ? compactCustomer(customer) : null,
    lead: lead ? compactLead(lead) : null,
    invoice: invoice ? compactInvoice(invoice) : null,
    email: email ? compactEmail(email) : null,
    recentActivity: relatedTimeline.slice(0, 5).map(compactActivity),
    openInvoices: openInvoices.map(compactInvoice),
    websiteStatus,
    latestEmail: email ? compactEmail(email) : null,
    timelineSummary,
    automationState,
    notifications: relatedNotifications.map(compactNotification),
    assignedSalesperson: customer?.ownerName || customer?.salesOwner || customer?.assignedSales || lead?.ownerName || lead?.assignedTo || "",
    riskScore: risk.score,
    riskLevel: risk.level,
    riskReasons: risk.reasons,
    opportunityScore: opportunity.score,
    opportunityLevel: opportunity.level,
    opportunityReasons: opportunity.reasons,
    lastContact,
    nextRecommendedAction: recommendations[0]?.label || "",
    recommendations,
    cache: {
      key: MAX_BRAIN_CACHE_KEY,
      ttlMs: MAX_BRAIN_CACHE_TTL_MS,
      prepared: true,
    },
  };
}

export function getMaxBrainDiagnostics(options = {}) {
  const data = options.data || collectBrainData();
  const customerContexts = data.customers.map((customer) => buildMaxBrainContext({ customerId: idOf(customer) }, { data, source: "diagnostics" }));
  const highRisks = customerContexts.filter((item) => item.riskLevel === "High");
  const mediumRisks = customerContexts.filter((item) => item.riskLevel === "Medium");
  const recommendations = customerContexts.flatMap((context) => context.recommendations.map((recommendation) => ({
    ...recommendation,
    customer: context.customer?.company || context.customer?.name || context.entity?.label || "",
    riskLevel: context.riskLevel,
  })));
  const cache = writeBrainCache({
    generatedAt: new Date().toISOString(),
    customersAnalyzed: customerContexts.length,
    risks: { high: highRisks.length, medium: mediumRisks.length },
    recommendations: recommendations.slice(0, 24),
    contexts: customerContexts.slice(0, 20),
  });

  return {
    generatedAt: cache.generatedAt,
    customersAnalyzed: customerContexts.length,
    risks: { high: highRisks.length, medium: mediumRisks.length, total: highRisks.length + mediumRisks.length },
    recommendations,
    dailyFocus: buildDailyFocus({ data, customerContexts, recommendations }),
    contextCache: {
      status: cache.generatedAt ? "ready" : "unavailable",
      key: MAX_BRAIN_CACHE_KEY,
      contexts: cache.contexts?.length || 0,
      ttlMs: MAX_BRAIN_CACHE_TTL_MS,
    },
    eventsProcessed: data.timeline.length + data.notifications.length,
    automationStatus: summarizeAutomations(data.automations, {}),
    datasets: Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length])),
  };
}

export function collectBrainData() {
  return Object.fromEntries(Object.entries(STORAGE_KEYS).map(([key, keys]) => [key, uniqueRows(keys.flatMap(readArray))]));
}

export function readBrainCache() {
  return readJson(MAX_BRAIN_CACHE_KEY, null);
}

function writeBrainCache(value) {
  try {
    localStorage.setItem(MAX_BRAIN_CACHE_KEY, JSON.stringify(value));
  } catch {
    // Cache is helpful for Max Command and CEO Mode, but the engine must work without it.
  }
  return value;
}

function findEntity(query, data) {
  const normalized = normalizeQuery(query);
  const customer = findById(data.customers, normalized.customerId) || findByText(data.customers, normalized.search);
  const lead = findById(data.leads, normalized.leadId) || (!customer ? findByText(data.leads, normalized.search) : null);
  const invoice = findById(data.invoices, normalized.invoiceId) || (!customer && !lead ? findByText(data.invoices, normalized.search) : null);
  const email = findById(data.emails, normalized.emailId) || null;
  const selectedCustomer = customer || resolveCustomer({ lead, invoice, email }, data);
  if (selectedCustomer) return { type: "Customer", id: idOf(selectedCustomer), label: labelOf(selectedCustomer), customer: selectedCustomer, lead, invoice, email };
  if (lead) return { type: "Lead", id: idOf(lead), label: labelOf(lead), lead };
  if (invoice) return { type: "Invoice", id: idOf(invoice), label: labelOf(invoice), invoice };
  if (email) return { type: "Email", id: idOf(email), label: labelOf(email), email };
  return {};
}

function resolveCustomer(entity, data) {
  const candidate = entity.customer || entity.invoice || entity.lead || entity.email || {};
  return data.customers.find((customer) => relatesToCustomer(candidate, customer)) || null;
}

function calculateRisk(context) {
  const reasons = [];
  const inactiveDays = daysSince(context.lastContact);
  if (context.openInvoices.some(isOverdueInvoice)) reasons.push({ weight: 40, label: "Open factuur is verlopen" });
  if (inactiveDays >= 30) reasons.push({ weight: 28, label: "Geen recente klantactiviteit" });
  if (context.websiteStatus.waiting > 0) reasons.push({ weight: 22, label: "Website wacht op akkoord of input" });
  if (context.lead && daysSince(context.lead.createdAt || context.lead.created_at) >= 14 && isOpenLead(context.lead)) reasons.push({ weight: 20, label: "Lead staat langer dan 14 dagen open" });
  if (context.relatedNotifications.some((item) => ["warning", "error", "high"].includes(statusKey(item.severity || item.status)))) reasons.push({ weight: 18, label: "Recente waarschuwing of supportactiviteit" });
  const score = Math.min(100, reasons.reduce((sum, item) => sum + item.weight, 0));
  return { score, level: score >= 60 ? "High" : score >= 25 ? "Medium" : "Low", reasons: reasons.map((item) => item.label) };
}

function calculateOpportunity(context) {
  const reasons = [];
  const packageText = statusKey([context.customer?.package, context.customer?.plan, context.invoice?.type].join(" "));
  if (context.websiteStatus.live > 0 && !packageText.includes("seo")) reasons.push({ weight: 28, label: "Live website zonder zichtbare SEO-upsell" });
  if (context.websiteStatus.live > 0 && !packageText.includes("ads")) reasons.push({ weight: 18, label: "Advertentiecampagne kan logisch aansluiten" });
  if (context.lead && isOpenLead(context.lead)) reasons.push({ weight: 24, label: "Open lead met conversiekans" });
  if (context.invoice && isPaidInvoice(context.invoice)) reasons.push({ weight: 16, label: "Betaalde klant is klaar voor vervolgstap" });
  if (!context.automationState.active) reasons.push({ weight: 12, label: "Nog geen actieve workflow gekoppeld" });
  const score = Math.min(100, reasons.reduce((sum, item) => sum + item.weight, 0));
  return { score, level: score >= 60 ? "High" : score >= 25 ? "Medium" : "Low", reasons: reasons.map((item) => item.label) };
}

function recommendActions(context) {
  const actions = [];
  if (context.risk.level === "High") actions.push(action("call-customer", "Bel klant", "Risk", "Neem persoonlijk contact op en voorkom stilstand."));
  if (context.openInvoices.some(isOverdueInvoice)) actions.push(action("send-reminder", "Stuur betaalherinnering", "Finance", "Open verlopen factuur opvolgen."));
  if (context.openInvoices.length && !context.openInvoices.some(isOverdueInvoice)) actions.push(action("review-invoices", "Controleer open facturen", "Finance", "Bewaak cashflow zonder harde reminder."));
  if (context.websiteStatus.waiting) actions.push(action("finish-website", "Rond website op", "Production", "Vraag akkoord, content of feedback uit."));
  if (context.websiteStatus.live && context.opportunity.reasons.some((item) => item.includes("SEO"))) actions.push(action("upsell-seo", "Upsell SEO", "Growth", "Live website kan door naar vindbaarheid."));
  if (context.websiteStatus.live && context.opportunity.reasons.some((item) => item.includes("Advertentie"))) actions.push(action("upsell-ads", "Upsell Ads", "Growth", "Campagnevoorstel voorbereiden."));
  if (context.lead && isOpenLead(context.lead)) actions.push(action("start-onboarding", "Start onboarding", "Sales", "Zet lead door naar klantflow zodra akkoord er is."));
  if (!actions.length) actions.push(action("add-note", "Voeg notitie toe", "CRM", "Leg de volgende stap vast in de timeline."));
  return actions.slice(0, 6);
}

function buildDailyFocus({ data, customerContexts, recommendations }) {
  const riskyCustomers = customerContexts
    .filter((context) => ["High", "Medium"].includes(context.riskLevel))
    .map((context) => ({
      label: context.customer?.company || context.customer?.name || context.entity?.label || "Klant",
      level: context.riskLevel,
      reason: context.riskReasons[0] || "Aandacht nodig",
    }))
    .slice(0, 8);
  const openPayments = data.invoices
    .filter(isOpenInvoice)
    .map((invoice) => ({
      label: invoice.invoiceNumber || invoice.invoice_number || invoice.number || invoice.title || "Factuur",
      status: invoice.status || invoice.paymentStatus || invoice.payment_status || "open",
      dueDate: invoice.dueDate || invoice.due_date || "",
    }))
    .slice(0, 8);
  const failingAutomations = data.automations
    .filter((item) => ["failed", "error", "attention"].includes(statusKey(item.status || item.result || item.state)))
    .map((item) => ({ label: item.name || item.workflowName || "Automation", status: item.status || item.result || "failed" }))
    .slice(0, 8);
  const mailAttention = data.emails
    .filter((item) => ["failed", "bounced", "complained"].includes(statusKey(item.status || item.deliveryStatus)))
    .map((item) => ({ label: item.subject || item.templateName || "E-mail", status: item.status || item.deliveryStatus || "failed" }))
    .slice(0, 8);
  const delayedProjects = [...data.websites, ...data.timeline]
    .filter((item) => /delay|vertraag|blocked|wacht|waiting|approval|akkoord|feedback/.test(statusKey([item.status, item.phase, item.title, item.description, item.notes].join(" "))))
    .map((item) => ({ label: item.name || item.title || item.domain || "Project", status: item.status || item.phase || item.severity || "attention" }))
    .slice(0, 8);
  const attention = [
    ...recommendations.slice(0, 4).map((item) => ({ label: item.label, reason: item.reason || item.category || "" })),
    ...data.notifications
      .filter((item) => ["warning", "error", "high"].includes(statusKey(item.severity || item.status)))
      .slice(0, 4)
      .map((item) => ({ label: item.title || item.action || "Melding", reason: item.description || item.message || item.status || "" })),
  ].slice(0, 8);
  return {
    attention,
    riskyCustomers,
    openPayments,
    failingAutomations,
    mailAttention,
    delayedProjects,
  };
}

function action(id, label, category, reason) {
  return { id, label, category, reason };
}

function summarizeAutomations(rows, context) {
  const related = context.customer || context.lead || context.invoice ? rows.filter((item) => filterRelated([item], context).length) : rows;
  const active = related.filter((item) => ["active", "enabled", "running"].includes(statusKey(item.status))).length;
  const failed = related.filter((item) => ["failed", "error"].includes(statusKey(item.status))).length;
  return {
    total: related.length,
    active,
    failed,
    status: failed ? "attention" : active ? "active" : related.length ? "prepared" : "empty",
  };
}

function summarizeWebsiteStatus(rows) {
  const live = rows.filter((item) => ["online", "live", "active"].includes(statusKey(item.status))).length;
  const waiting = rows.filter((item) => /approval|akkoord|feedback|review|wacht|waiting/.test(statusKey([item.status, item.phase, item.approvalStatus, item.clientStatus, item.notes].join(" ")))).length;
  return { total: rows.length, live, waiting, latest: rows[0] ? { id: idOf(rows[0]), label: labelOf(rows[0]), status: rows[0].status || rows[0].phase || "" } : null };
}

function summarizeTimeline(rows) {
  if (!rows.length) return "Nog geen timeline-events gevonden.";
  const modules = [...new Set(rows.map((item) => item.module || item.eventType || item.action).filter(Boolean))].slice(0, 3);
  return `${rows.length} recente events${modules.length ? ` vanuit ${modules.join(", ")}` : ""}.`;
}

function latestForCustomer(rows, customer) {
  if (!customer) return null;
  return rows.filter((item) => relatesToCustomer(item, customer)).sort(compareNewest)[0] || null;
}

function filterRelated(rows, context) {
  return rows.filter((item) => {
    if (context.customer && relatesToCustomer(item, context.customer)) return true;
    if (context.lead && relatesByAnyId(item, context.lead, ["leadId", "lead_id", "id"])) return true;
    if (context.invoice && relatesByAnyId(item, context.invoice, ["invoiceId", "invoice_id", "id"])) return true;
    if (context.email && relatesByAnyId(item, context.email, ["emailId", "email_id", "emailLogId", "email_log_id", "id"])) return true;
    return false;
  }).sort(compareNewest);
}

function relatesToCustomer(item = {}, customer = {}) {
  const ids = [customer.id, customer.profileId, customer.customerId, customer.authUserId, customer.auth_user_id].filter(Boolean).map(String);
  const itemIds = [item.customerId, item.customer_id, item.profileId, item.profile_id, item.customer_auth_user_id, item.authUserId, item.userId].filter(Boolean).map(String);
  if (ids.some((id) => itemIds.includes(id))) return true;
  const haystack = statusKey([item.company, item.companyName, item.customerCompany, item.customerName, item.name, item.email, item.description, item.title].join(" "));
  return [customer.company, customer.name, customer.email].filter(Boolean).some((value) => haystack.includes(statusKey(value)));
}

function relatesByAnyId(item = {}, target = {}, keys = []) {
  const ids = [target.id, ...keys.map((key) => target[key])].filter(Boolean).map(String);
  return keys.some((key) => ids.includes(String(item[key] || ""))) || ids.includes(String(item.referenceId || item.relatedId || ""));
}

function compactCustomer(item) {
  return { id: idOf(item), name: item.name || "", company: item.company || item.companyName || "", email: item.email || "", status: item.status || item.portalStatus || "", package: item.package || item.plan || "", website: item.website || item.domain || "", updatedAt: item.updatedAt || item.updated_at || item.createdAt || item.created_at || "" };
}

function compactLead(item) {
  return { id: idOf(item), name: item.name || item.contactName || "", company: item.company || item.companyName || "", email: item.email || "", status: item.status || item.callStatus || "", createdAt: item.createdAt || item.created_at || "" };
}

function compactInvoice(item) {
  return { id: idOf(item), number: item.invoiceNumber || item.invoice_number || item.number || "", title: item.title || "", status: item.status || item.paymentStatus || item.payment_status || "", total: Number(item.total || item.amount || item.totalInclVat || 0), dueDate: item.dueDate || item.due_date || "" };
}

function compactEmail(item) {
  return { id: idOf(item), subject: item.subject || item.title || item.templateName || "", status: item.status || item.deliveryStatus || "", sentAt: item.sentAt || item.createdAt || item.created_at || "" };
}

function compactActivity(item) {
  return { id: idOf(item), title: item.title || item.action || item.eventType || "Activiteit", module: item.module || "", severity: item.severity || item.status || "info", createdAt: item.createdAt || item.created_at || item.timestamp || "" };
}

function compactNotification(item) {
  return { id: idOf(item), title: item.title || item.action || "Melding", status: item.status || item.severity || "", createdAt: item.createdAt || item.created_at || item.timestamp || "" };
}

function isOpenInvoice(invoice = {}) {
  return !["paid", "betaald", "cancelled", "geannuleerd"].includes(statusKey(invoice.status || invoice.paymentStatus || invoice.payment_status));
}

function isPaidInvoice(invoice = {}) {
  return ["paid", "betaald"].includes(statusKey(invoice.status || invoice.paymentStatus || invoice.payment_status));
}

function isOverdueInvoice(invoice = {}) {
  const due = dateValue(invoice.dueDate || invoice.due_date || invoice.expiresAt);
  return isOpenInvoice(invoice) && (statusKey(invoice.status).includes("verlopen") || statusKey(invoice.status).includes("overdue") || (due && due < startOfToday()));
}

function isOpenLead(lead = {}) {
  return !["won", "geconverteerd", "customer_active", "lost", "geen_interesse", "afgewezen"].includes(statusKey(lead.status || lead.callStatus));
}

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const key = `${idOf(row)}:${labelOf(row)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort(compareNewest);
}

function findById(rows, id) {
  if (!id) return null;
  return rows.find((row) => [row.id, row.profileId, row.customerId, row.leadId, row.invoiceId, row.emailId].filter(Boolean).map(String).includes(String(id))) || null;
}

function findByText(rows, search) {
  if (!search) return null;
  return rows.find((row) => statusKey([labelOf(row), row.email, row.website, row.domain, row.invoiceNumber, row.subject].join(" ")).includes(statusKey(search))) || null;
}

function normalizeQuery(query = {}) {
  return {
    customerId: String(query.customerId || query.customer_id || "").trim(),
    leadId: String(query.leadId || query.lead_id || "").trim(),
    invoiceId: String(query.invoiceId || query.invoice_id || "").trim(),
    emailId: String(query.emailId || query.email_id || query.emailLogId || "").trim(),
    search: String(query.search || query.q || "").trim(),
  };
}

function idOf(item = {}) {
  return String(item.id || item.profileId || item.customerId || item.leadId || item.invoiceId || item.emailId || item.email || labelOf(item) || "").trim();
}

function labelOf(item = {}) {
  return String(item.company || item.companyName || item.name || item.title || item.subject || item.invoiceNumber || item.email || "Context").trim();
}

function compareNewest(a = {}, b = {}) {
  return Number(dateValue(b.updatedAt || b.updated_at || b.createdAt || b.created_at || b.timestamp)) - Number(dateValue(a.updatedAt || a.updated_at || a.createdAt || a.created_at || a.timestamp));
}

function latestDate(values = []) {
  const dates = values.map(dateValue).filter(Boolean).sort((a, b) => b - a);
  return dates[0] ? dates[0].toISOString() : "";
}

function daysSince(value) {
  const date = dateValue(value);
  if (!date) return 0;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function statusKey(value = "") {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
