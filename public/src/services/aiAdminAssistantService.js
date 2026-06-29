import { STORAGE_KEYS } from "../config/storageKeys.js";

export const AI_ADMIN_ASSISTANT_ACTIONS = Object.freeze([
  { value: "customer_summary", label: "Klant samenvatten", module: "customers" },
  { value: "project_summary", label: "Project samenvatten", module: "projects" },
  { value: "lead_analysis", label: "Lead analyseren", module: "leadfinder" },
  { value: "followup_advice", label: "Opvolgadvies maken", module: "workflow" },
  { value: "quote_intro", label: "Offerte-intro schrijven", module: "quotes" },
  { value: "seo_improvements", label: "SEO verbeterpunten maken", module: "websites" },
  { value: "client_message", label: "Klantbericht concept maken", module: "customers" },
  { value: "change_request_summary", label: "Wijzigingsverzoek samenvatten", module: "change_requests" },
]);

const READINESS_ITEMS = Object.freeze([
  { label: "Auth/RLS", status: "blocked", note: "Nodig voordat echte klantdata naar AI-context mag." },
  { label: "Server-side adapter", status: "blocked", note: "AI-calls moeten later via Netlify Function/backend lopen." },
  { label: "Secrets/env", status: "blocked", note: "Geen API keys in frontend; env vars alleen server-side." },
  { label: "Logging", status: "pending", note: "Prompt/output logging en audit trail nog ontwerpen." },
  { label: "Rate limiting", status: "pending", note: "Nodig voor kostenbeheersing en misbruikpreventie." },
  { label: "Consent/privacy", status: "blocked", note: "Bepaal welke klantdata gebruikt mag worden en leg toestemming vast." },
]);

function safeStorage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    return null;
  }
  return null;
}

function readArray(key) {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`Kon ${key} niet lezen voor AI Admin Assistant`, error);
    return [];
  }
}

function writeArray(key, value = []) {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

function createId(prefix = "ai-admin") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function text(value, fallback = "-") {
  return String(value || "").trim() || fallback;
}

function firstWords(value, max = 28) {
  const words = text(value, "").split(/\s+/).filter(Boolean);
  return words.length > max ? `${words.slice(0, max).join(" ")}...` : words.join(" ");
}

function customerLabel(customer = {}, index = 0) {
  return text(customer.company || customer.companyName || customer.name || customer.email, `Klant ${index + 1}`);
}

function websiteLabel(website = {}, index = 0) {
  return text(website.name || website.websiteName || website.domain || website.liveUrl || website.website, `Website ${index + 1}`);
}

function projectLabel(project = {}, index = 0) {
  return text(project.projectName || project.name || project.title, `Project ${index + 1}`);
}

function quoteLabel(quote = {}, index = 0) {
  return text(quote.quoteNumber || quote.number || quote.title, `Offerte ${index + 1}`);
}

function leadLabel(lead = {}, index = 0) {
  return text(lead.companyName || lead.company || lead.businessName, `Lead ${index + 1}`);
}

function changeRequestLabel(request = {}, index = 0) {
  return text(request.title || request.subject || request.company_name || request.companyName, `Wijzigingsverzoek ${index + 1}`);
}

function getData() {
  const customers = [...readArray(STORAGE_KEYS.crmCustomers), ...readArray(STORAGE_KEYS.customers)];
  return {
    customers,
    websites: [...readArray(STORAGE_KEYS.managedSites), ...readArray(STORAGE_KEYS.websites)],
    projects: readArray(STORAGE_KEYS.projects),
    quotes: readArray(STORAGE_KEYS.quotes),
    invoices: readArray(STORAGE_KEYS.invoices),
    subscriptions: readArray(STORAGE_KEYS.subscriptions),
    leadfinder: readArray(STORAGE_KEYS.leadFinderLeads),
    workflow: readArray(STORAGE_KEYS.crmTasks),
    changeRequests: readArray(STORAGE_KEYS.changeRequests),
  };
}

function toOptions(items, labeler) {
  return items
    .map((item, index) => ({
      value: String(item.id || item.customerId || item.profileId || item.quoteId || item.invoiceId || item.requestId || ""),
      label: labeler(item, index),
    }))
    .filter((option) => option.value);
}

function findById(items, id) {
  return items.find((item) => String(item.id || item.customerId || item.profileId || item.quoteId || item.invoiceId || item.requestId) === String(id)) || items[0] || {};
}

export function getAiAdminAssistantActions() {
  return [...AI_ADMIN_ASSISTANT_ACTIONS];
}

export function getAiAdminAssistantReadiness() {
  return {
    status: "mock_only",
    aiCalls: "disabled",
    storageKey: STORAGE_KEYS.aiAdminAssistantDrafts,
    items: [...READINESS_ITEMS],
    futureAdapter: "server-side provider adapter required",
  };
}

export function getAiAdminAssistantContextOptions(actionId) {
  const data = getData();
  switch (actionId) {
    case "customer_summary":
    case "client_message":
      return toOptions(data.customers, customerLabel);
    case "project_summary":
      return toOptions(data.projects, projectLabel);
    case "lead_analysis":
      return toOptions(data.leadfinder, leadLabel);
    case "followup_advice":
      return toOptions(data.workflow, (task, index) => text(task.title, `Opvolgactie ${index + 1}`));
    case "quote_intro":
      return toOptions(data.quotes, quoteLabel);
    case "seo_improvements":
      return toOptions(data.websites, websiteLabel);
    case "change_request_summary":
      return toOptions(data.changeRequests, changeRequestLabel);
    default:
      return [];
  }
}

function buildCustomerSummary(customer = {}) {
  return {
    title: `Klantbeeld: ${customerLabel(customer)}`,
    body: `${customerLabel(customer)} staat in het CRM met status ${text(customer.status, "onbekend")} en pakket ${text(customer.package || customer.carePlan, "nog te bepalen")}. Belangrijkste vervolgstap: controleer website, lopend project en open facturen voordat je contact opneemt.`,
    bullets: [
      `Contact: ${text(customer.email)} / ${text(customer.phone)}`,
      `Website: ${text(customer.website || customer.websiteUrl)}`,
      `Klant sinds: ${text(customer.customerSince || customer.customer_since)}`,
    ],
  };
}

function buildProjectSummary(project = {}) {
  return {
    title: `Projectstatus: ${projectLabel(project)}`,
    body: `Dit project staat op ${text(project.status, "onbekend")} in fase ${text(project.phase, "niet ingevuld")}. De lokale voortgang is ${text(project.progress, "0")}%. Houd deadline en klantfeedback actief in de gaten.`,
    bullets: [
      `Type: ${text(project.projectType || project.type)}`,
      `Deadline: ${text(project.deadline)}`,
      `Notities: ${firstWords(project.notes, 22) || "-"}`,
    ],
  };
}

function buildLeadAnalysis(lead = {}) {
  const score = Number(lead.leadScore || lead.score || 0);
  const urgency = score >= 80 ? "hoog" : score >= 60 ? "normaal" : "laag";
  return {
    title: `Leadanalyse: ${leadLabel(lead)}`,
    body: `${leadLabel(lead)} lijkt een ${urgency} kans. Website-status: ${text(lead.websiteStatus, "onbekend")}. Advies: benader met een concreet voorbeeld op basis van branche ${text(lead.industry)} en regio ${text(lead.region)}.`,
    bullets: [
      `Leadscore: ${score}/100`,
      `Belstatus: ${text(lead.callStatus)}`,
      `Pitchhoek: verbeter vertrouwen, mobiele ervaring en aanvraagflow.`,
    ],
  };
}

function buildFollowupAdvice(task = {}) {
  return {
    title: `Opvolgadvies: ${text(task.title, "CRM taak")}`,
    body: `Pak deze opvolging kort en concreet aan. Verwijs naar de laatste afspraak, benoem de volgende stap en sluit af met één duidelijke keuze voor de klant.`,
    bullets: [
      `Prioriteit: ${text(task.priority, "normaal")}`,
      `Deadline: ${text(task.dueDate)}`,
      `Conceptvolgende stap: plan belmoment of stuur korte samenvatting per e-mail.`,
    ],
  };
}

function buildQuoteIntro(quote = {}) {
  return {
    title: `Offerte-intro: ${quoteLabel(quote)}`,
    body: `Bedankt voor je interesse in Max Webstudio. Op basis van je wensen heb ik een voorstel uitgewerkt dat focust op vertrouwen, snelheid en meer aanvragen via je website.`,
    bullets: [
      `Status: ${text(quote.status)}`,
      `Totaal: ${text(quote.total || quote.totalInclVat || quote.amount)}`,
      `Let op: dit is een lokaal concept, nog geen verzonden klantmail.`,
    ],
  };
}

function buildSeoImprovements(website = {}) {
  return {
    title: `SEO verbeterpunten: ${websiteLabel(website)}`,
    body: `Start met lokale vindbaarheid, duidelijke dienstpagina's en betere conversieblokken. Gebruik de homepage om branche, regio en primaire dienst direct helder te maken.`,
    bullets: [
      "Maak title/meta description specifiek per dienst en regio.",
      "Voeg FAQ's toe rond offerte, werkwijze en levertijd.",
      "Controleer mobiele CTA's, laadsnelheid en interne links.",
    ],
  };
}

function buildClientMessage(customer = {}) {
  return {
    title: `Klantbericht concept: ${customerLabel(customer)}`,
    body: `Hi ${text(customer.name || customer.company, "daar")}, ik heb je gegevens bekeken en zet de volgende stap voor je website klaar. Ik stuur je kort de belangrijkste punten en laat weten welke input ik nog nodig heb.`,
    bullets: [
      "Vraag om ontbrekende teksten, beelden of akkoord.",
      "Benoem verwachte volgende stap.",
      "Houd toon persoonlijk en duidelijk.",
    ],
  };
}

function buildChangeRequestSummary(request = {}) {
  return {
    title: `Samenvatting wijzigingsverzoek: ${changeRequestLabel(request)}`,
    body: `De klant vraagt om ${text(request.change_category || request.changeCategory || request.category, "een wijziging")} met prioriteit ${text(request.priority, "normaal")}. Controleer of dit binnen onderhoud valt of als offerte moet worden beoordeeld.`,
    bullets: [
      `Klant: ${text(request.company_name || request.companyName || request.email)}`,
      `Status: ${text(request.status)}`,
      `Omschrijving: ${firstWords(request.description, 24) || "-"}`,
    ],
  };
}

export function generateAiAdminAssistantPreview({ actionId, targetId } = {}) {
  const data = getData();
  const action = AI_ADMIN_ASSISTANT_ACTIONS.find((item) => item.value === actionId) || AI_ADMIN_ASSISTANT_ACTIONS[0];
  let output;

  switch (action.value) {
    case "customer_summary":
      output = buildCustomerSummary(findById(data.customers, targetId));
      break;
    case "project_summary":
      output = buildProjectSummary(findById(data.projects, targetId));
      break;
    case "lead_analysis":
      output = buildLeadAnalysis(findById(data.leadfinder, targetId));
      break;
    case "followup_advice":
      output = buildFollowupAdvice(findById(data.workflow, targetId));
      break;
    case "quote_intro":
      output = buildQuoteIntro(findById(data.quotes, targetId));
      break;
    case "seo_improvements":
      output = buildSeoImprovements(findById(data.websites, targetId));
      break;
    case "client_message":
      output = buildClientMessage(findById(data.customers, targetId));
      break;
    case "change_request_summary":
      output = buildChangeRequestSummary(findById(data.changeRequests, targetId));
      break;
    default:
      output = buildCustomerSummary(findById(data.customers, targetId));
  }

  return {
    id: createId(),
    actionId: action.value,
    actionLabel: action.label,
    targetId: text(targetId, ""),
    generatedAt: new Date().toISOString(),
    generator: "local_template_mock",
    dataPolicy: "local_demo_only",
    futureProviderPayload: {
      action: action.value,
      module: action.module,
      targetId: text(targetId, ""),
      note: "Later alleen server-side versturen na Auth/RLS, consent, logging en rate limiting.",
    },
    output,
  };
}

export function generateAndSaveAiAdminAssistantPreview(input = {}) {
  const preview = generateAiAdminAssistantPreview(input);
  const history = readArray(STORAGE_KEYS.aiAdminAssistantDrafts);
  writeArray(STORAGE_KEYS.aiAdminAssistantDrafts, [preview, ...history].slice(0, 25));
  return preview;
}

export function listAiAdminAssistantDrafts() {
  return readArray(STORAGE_KEYS.aiAdminAssistantDrafts);
}

export function getAiAdminAssistantSummary() {
  const data = getData();
  return {
    readiness: getAiAdminAssistantReadiness(),
    actionCount: AI_ADMIN_ASSISTANT_ACTIONS.length,
    draftCount: listAiAdminAssistantDrafts().length,
    localDataCounts: {
      customers: data.customers.length,
      projects: data.projects.length,
      leadfinder: data.leadfinder.length,
      workflow: data.workflow.length,
      quotes: data.quotes.length,
      websites: data.websites.length,
      changeRequests: data.changeRequests.length,
    },
  };
}
