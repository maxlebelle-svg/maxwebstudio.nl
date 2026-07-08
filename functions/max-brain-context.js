const { verifyAdmin } = require("./_admin-auth");
const { listTimelineEvents } = require("./services/timelineService");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return jsonResponse(405, { success: false, error: "Alleen GET-verzoeken zijn toegestaan." });
    }

    const adminCheck = await verifyAdmin(event, jsonResponse, {
      module: "max-brain",
      action: "context",
      allowedRoles: ["super_admin", "admin", "developer", "sales_manager", "support"],
    });
    if (!adminCheck.success) return adminCheck.response;

    const params = getQueryParams(event);
    const context = await buildServerContext({
      customerId: cleanText(params.get("customerId") || params.get("customer_id")),
      leadId: cleanText(params.get("leadId") || params.get("lead_id")),
      invoiceId: cleanText(params.get("invoiceId") || params.get("invoice_id")),
      emailId: cleanText(params.get("emailId") || params.get("email_id") || params.get("emailLogId")),
    });

    return jsonResponse(200, {
      success: true,
      context,
      cache: {
        strategy: "request",
        ttlSeconds: 300,
        preparedForPersistentCache: true,
      },
    });
  } catch (error) {
    console.error("Max Brain context error", { message: error.message, statusCode: error.statusCode || error.status || 500 });
    return jsonResponse(error.statusCode || error.status || 500, {
      success: false,
      error: error.statusCode || error.status ? error.message : "Max Brain context kon niet worden opgebouwd.",
    });
  }
};

async function buildServerContext(input = {}) {
  const timeline = await readTimeline(input);
  const risk = calculateRisk(timeline, input);
  const opportunity = calculateOpportunity(timeline, input);
  const recommendations = recommendActions({ risk, opportunity, timeline, input });
  const entity = entityFromInput(input);
  return {
    generatedAt: new Date().toISOString(),
    source: "supabase-timeline",
    entity,
    customer: input.customerId ? { id: input.customerId } : null,
    lead: input.leadId ? { id: input.leadId } : null,
    invoice: input.invoiceId ? { id: input.invoiceId } : null,
    email: input.emailId ? { id: input.emailId } : null,
    recentActivity: timeline.slice(0, 12).map(sanitizeTimelineEvent),
    openInvoices: timeline.filter((event) => /invoice|factuur/.test(normalize([event.event_type, event.title, event.description].join(" "))) && !/paid|betaald/.test(normalize([event.event_type, event.title, event.description].join(" ")))).map(sanitizeTimelineEvent),
    websiteStatus: summarizeWebsiteStatus(timeline),
    latestEmail: latestByKeyword(timeline, "email"),
    timelineSummary: summarizeTimeline(timeline),
    automationState: summarizeAutomationState(timeline),
    notifications: timeline.filter((event) => Boolean(event.is_global) || ["warning", "error"].includes(normalize(event.severity))).slice(0, 8).map(sanitizeTimelineEvent),
    assignedSalesperson: "",
    riskScore: risk.score,
    riskLevel: risk.level,
    riskReasons: risk.reasons,
    opportunityScore: opportunity.score,
    opportunityLevel: opportunity.level,
    opportunityReasons: opportunity.reasons,
    lastContact: timeline[0]?.created_at || "",
    nextRecommendedAction: recommendations[0]?.label || "",
    recommendations,
  };
}

async function readTimeline(input) {
  const filters = {
    customerId: input.customerId,
    leadId: input.leadId,
    invoiceId: input.invoiceId,
    emailLogId: input.emailId,
    limit: 100,
  };
  return listTimelineEvents(filters);
}

function calculateRisk(timeline = [], input = {}) {
  const reasons = [];
  const hasOverdue = timeline.some((event) => /overdue|verlopen|reminder|herinnering/.test(normalize([event.event_type, event.title, event.description].join(" "))));
  const hasWaitingWebsite = timeline.some((event) => /website|preview/.test(normalize([event.module, event.event_type].join(" "))) && /wait|wacht|review|feedback|approval|akkoord/.test(normalize([event.title, event.description].join(" "))));
  const hasError = timeline.some((event) => ["error", "warning"].includes(normalize(event.severity)));
  const lastDate = timeline[0]?.created_at ? new Date(timeline[0].created_at) : null;
  if (hasOverdue) reasons.push({ weight: 40, label: "Verlopen factuur of reminder-signaal in timeline" });
  if (hasWaitingWebsite) reasons.push({ weight: 24, label: "Website wacht op input of akkoord" });
  if (hasError) reasons.push({ weight: 24, label: "Warning/error activity event gevonden" });
  if (lastDate && (Date.now() - lastDate.getTime()) / 86400000 > 30) reasons.push({ weight: 20, label: "Geen recente activiteit in timeline" });
  if (input.leadId && !timeline.length) reasons.push({ weight: 16, label: "Lead heeft nog geen timelinecontext" });
  const score = Math.min(100, reasons.reduce((sum, item) => sum + item.weight, 0));
  return { score, level: score >= 60 ? "High" : score >= 25 ? "Medium" : "Low", reasons: reasons.map((item) => item.label) };
}

function calculateOpportunity(timeline = [], input = {}) {
  const reasons = [];
  const text = normalize(timeline.map((event) => [event.module, event.event_type, event.title, event.description].join(" ")).join(" "));
  if (/website|preview|live/.test(text) && !/seo/.test(text)) reasons.push({ weight: 26, label: "Websitecontext zonder SEO-signaal" });
  if (/paid|betaald|invoice_paid/.test(text)) reasons.push({ weight: 18, label: "Betaalde klant kan door naar volgende stap" });
  if (input.leadId) reasons.push({ weight: 20, label: "Leadcontext beschikbaar voor follow-up" });
  if (/logo|brand/.test(text)) reasons.push({ weight: 12, label: "Brandingcontext kan assets of website versnellen" });
  const score = Math.min(100, reasons.reduce((sum, item) => sum + item.weight, 0));
  return { score, level: score >= 60 ? "High" : score >= 25 ? "Medium" : "Low", reasons: reasons.map((item) => item.label) };
}

function recommendActions({ risk, opportunity, timeline, input }) {
  const actions = [];
  if (risk.level === "High") actions.push(action("call-customer", "Bel klant", "Risk", "Pak de blokkade persoonlijk op."));
  if (risk.reasons.some((reason) => reason.includes("factuur"))) actions.push(action("send-reminder", "Stuur reminder", "Finance", "Volg verlopen factuur op."));
  if (risk.reasons.some((reason) => reason.includes("Website"))) actions.push(action("finish-website", "Rond website op", "Production", "Vraag feedback of akkoord uit."));
  if (opportunity.reasons.some((reason) => reason.includes("SEO"))) actions.push(action("upsell-seo", "Upsell SEO", "Growth", "Maak een logisch vervolgvoorstel."));
  if (input.leadId) actions.push(action("follow-up-lead", "Volg lead op", "Sales", "Zet conversieprioriteit vast."));
  if (!timeline.length) actions.push(action("add-note", "Voeg notitie toe", "CRM", "Start contextopbouw via timeline."));
  return actions.slice(0, 6);
}

function summarizeWebsiteStatus(timeline = []) {
  const websiteEvents = timeline.filter((event) => /website|preview|factory/.test(normalize([event.module, event.event_type, event.title].join(" "))));
  const waiting = websiteEvents.filter((event) => /wait|wacht|review|feedback|approval|akkoord/.test(normalize([event.title, event.description].join(" ")))).length;
  const live = websiteEvents.filter((event) => /live|published|online/.test(normalize([event.event_type, event.title, event.description].join(" ")))).length;
  return { total: websiteEvents.length, waiting, live };
}

function summarizeAutomationState(timeline = []) {
  const rows = timeline.filter((event) => /automation|workflow/.test(normalize([event.module, event.event_type, event.title].join(" "))));
  const failed = rows.filter((event) => ["error", "warning"].includes(normalize(event.severity))).length;
  return { total: rows.length, active: rows.length - failed, failed, status: failed ? "attention" : rows.length ? "active" : "empty" };
}

function summarizeTimeline(timeline = []) {
  if (!timeline.length) return "Geen timeline-events gevonden voor deze context.";
  const modules = [...new Set(timeline.map((event) => cleanText(event.module)).filter(Boolean))].slice(0, 4);
  return `${timeline.length} timeline-events${modules.length ? ` uit ${modules.join(", ")}` : ""}.`;
}

function latestByKeyword(timeline = [], keyword) {
  const item = timeline.find((event) => normalize([event.module, event.event_type, event.title].join(" ")).includes(keyword));
  return item ? sanitizeTimelineEvent(item) : null;
}

function entityFromInput(input = {}) {
  if (input.customerId) return { type: "Customer", id: input.customerId };
  if (input.leadId) return { type: "Lead", id: input.leadId };
  if (input.invoiceId) return { type: "Invoice", id: input.invoiceId };
  if (input.emailId) return { type: "Email", id: input.emailId };
  return { type: "Global", id: "max-brain" };
}

function action(id, label, category, reason) {
  return { id, label, category, reason };
}

function sanitizeTimelineEvent(event = {}) {
  return {
    id: cleanText(event.id),
    createdAt: cleanText(event.created_at),
    customerId: cleanText(event.customer_id),
    leadId: cleanText(event.lead_id),
    eventType: cleanText(event.event_type),
    title: cleanText(event.title),
    description: cleanText(event.description),
    module: cleanText(event.module),
    invoiceId: cleanText(event.invoice_id),
    emailLogId: cleanText(event.email_log_id),
    severity: cleanText(event.severity || "info"),
    isGlobal: Boolean(event.is_global),
    metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : {},
  };
}

function getQueryParams(event) {
  if (event.rawQuery) return new URLSearchParams(event.rawQuery);
  const params = new URLSearchParams();
  Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, value);
  });
  return params;
}

function normalize(value = "") {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
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
