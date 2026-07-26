const COMPLETE_STATUSES = new Set(["afgerond", "gereed", "done", "closed", "betaald", "paid", "gelezen", "read"]);
const ACTIVE_WEBSITE_STATUSES = new Set(["online", "live", "actief", "active"]);

function text(value = "") {
  return String(value || "").trim();
}

function normalize(value = "") {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function firstName(customer = {}) {
  return text(customer.name || customer.contactName || customer.company).split(/\s+/)[0] || "";
}

function explicitProgress(project = {}) {
  if (project.progress === null || project.progress === undefined || project.progress === "") {
    return { available: false, value: null, label: "Nog niet beschikbaar" };
  }
  const value = Number(project.progress);
  if (!Number.isFinite(value)) return { available: false, value: null, label: "Nog niet beschikbaar" };
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return { available: true, value: bounded, label: `${bounded}%` };
}

function openRows(rows = []) {
  return rows.filter((row) => !COMPLETE_STATUSES.has(normalize(row.status)));
}

function moduleState({ key, label, description, value, status, tone = "neutral", href = "", actionLabel = "", available = false }) {
  return Object.freeze({ key, label, description, value, status, tone, href, actionLabel, available });
}

function safeDomainLabel(website = {}) {
  const raw = text(website.domain || website.liveUrl);
  if (!raw) return "Nog niet gekoppeld";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "Nog niet gekoppeld";
  }
}

export const CX2_DASHBOARD_MODULE_ORDER = Object.freeze([
  "website",
  "feedback",
  "messages",
  "files",
  "invoices",
  "domain",
  "business_email",
]);

export function buildCustomerDashboardViewModel(input = {}) {
  const customer = input.customer || {};
  const projects = Array.isArray(input.projects) ? input.projects : [];
  const websites = Array.isArray(input.websites) ? input.websites : [];
  const previewVersions = Array.isArray(input.previewVersions) ? input.previewVersions : [];
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const files = Array.isArray(input.files) ? input.files : [];
  const invoices = Array.isArray(input.invoices) ? input.invoices : [];
  const project = projects[0] || {};
  const website = websites[0] || {};
  const preview = previewVersions[0] || null;
  const progress = explicitProgress(project);
  const openMessages = messages.filter((message) => !message.readAt && !COMPLETE_STATUSES.has(normalize(message.status)));
  const openInvoices = openRows(invoices);
  const feedbackCount = Number(preview?.feedbackCount || 0);
  const websiteAvailable = Boolean(preview?.safePreviewPath || website.liveUrl || website.domain);
  const feedbackAvailable = Boolean(preview);
  const domainLabel = safeDomainLabel(website);
  const businessEmailStatus = text(website.businessEmailStatus || website.domainEmailStatus || customer.businessEmailStatus);

  const modules = [
    moduleState({
      key: "website",
      label: "Website",
      value: preview ? `Versie ${preview.version || 1}` : website.name || domainLabel,
      description: preview ? "Je actuele ontwerp staat veilig voor je klaar." : websiteAvailable ? "Open je gekoppelde website." : "Je website verschijnt zodra deze beschikbaar is.",
      status: preview ? text(preview.status) || "Klaar voor review" : ACTIVE_WEBSITE_STATUSES.has(normalize(website.status)) ? "Online" : websiteAvailable ? "Beschikbaar" : "Wordt voorbereid",
      tone: preview?.approvedAt || ACTIVE_WEBSITE_STATUSES.has(normalize(website.status)) ? "success" : websiteAvailable ? "active" : "pending",
      href: preview?.safePreviewPath || (websiteAvailable ? "#website" : ""),
      actionLabel: preview ? "Bekijk ontwerp" : "Bekijk website",
      available: websiteAvailable,
    }),
    moduleState({
      key: "feedback",
      label: "Feedback",
      value: feedbackAvailable ? `${feedbackCount} ${feedbackCount === 1 ? "punt" : "punten"}` : "Nog niet gestart",
      description: feedbackAvailable ? "Bekijk de reviewstatus van je huidige ontwerp." : "Feedback wordt beschikbaar bij een klantzichtbare ontwerpversie.",
      status: preview?.approvedAt ? "Afgerond" : feedbackAvailable ? "Review beschikbaar" : "Volgt later",
      tone: preview?.approvedAt ? "success" : feedbackAvailable ? "active" : "pending",
      href: feedbackAvailable ? "#website-review" : "",
      actionLabel: "Open feedback",
      available: feedbackAvailable,
    }),
    moduleState({
      key: "messages",
      label: "Berichten",
      value: openMessages.length ? `${openMessages.length} nieuw` : "Geen nieuwe berichten",
      description: "Alle communicatie over je project op één plek.",
      status: openMessages.length ? "Actie mogelijk" : "Bijgewerkt",
      tone: openMessages.length ? "attention" : "success",
      href: "#berichten",
      actionLabel: "Open berichten",
      available: true,
    }),
    moduleState({
      key: "files",
      label: "Bestanden",
      value: files.length ? `${files.length} ${files.length === 1 ? "bestand" : "bestanden"}` : "Nog geen bestanden",
      description: "Je projectbestanden en aangeleverde assets.",
      status: files.length ? "Beschikbaar" : "Lege staat",
      tone: files.length ? "active" : "neutral",
      href: "#bestanden",
      actionLabel: "Open bestanden",
      available: true,
    }),
    moduleState({
      key: "invoices",
      label: "Facturen",
      value: openInvoices.length ? `${openInvoices.length} open` : invoices.length ? "Alles bijgewerkt" : "Nog geen facturen",
      description: openInvoices.length ? "Bekijk de actuele betaalstatus." : "Facturen verschijnen hier zodra ze beschikbaar zijn.",
      status: openInvoices.length ? "Aandacht" : invoices.length ? "Bijgewerkt" : "Lege staat",
      tone: openInvoices.length ? "attention" : invoices.length ? "success" : "neutral",
      href: "#facturen",
      actionLabel: "Open facturen",
      available: true,
    }),
    moduleState({
      key: "domain",
      label: "Domein",
      value: domainLabel,
      description: domainLabel === "Nog niet gekoppeld" ? "Je domeinstatus volgt zodra deze bekend is." : "Het webadres dat bij je website hoort.",
      status: domainLabel === "Nog niet gekoppeld" ? "Volgt later" : "Gekoppeld",
      tone: domainLabel === "Nog niet gekoppeld" ? "pending" : "success",
      href: domainLabel === "Nog niet gekoppeld" ? "" : "#website",
      actionLabel: "Bekijk domein",
      available: domainLabel !== "Nog niet gekoppeld",
    }),
    moduleState({
      key: "business_email",
      label: "Zakelijke e-mail",
      value: businessEmailStatus || "Nog niet beschikbaar",
      description: businessEmailStatus ? "De bekende status van je zakelijke e-mail." : "Zakelijke e-mail wordt in een latere fase beschikbaar.",
      status: businessEmailStatus ? "Status bekend" : "Volgt later",
      tone: businessEmailStatus ? "active" : "pending",
      href: businessEmailStatus ? "#account" : "",
      actionLabel: "Bekijk account",
      available: Boolean(businessEmailStatus),
    }),
  ];

  const customerFirstName = firstName(customer);

  return Object.freeze({
    greeting: customerFirstName ? `Welkom terug, ${customerFirstName} 👋` : "Welkom terug 👋",
    context: text(customer.company) || "Jouw project",
    project: Object.freeze({
      title: text(project.name || project.projectName) || "Websiteproject",
      phase: text(project.phase || project.status) || "Nog niet beschikbaar",
      progress,
      deadline: text(project.deadline || project.deliveryDate),
    }),
    nextStep: input.nextStep || null,
    modules: Object.freeze(modules),
  });
}

export const _private = Object.freeze({ explicitProgress, safeDomainLabel });
