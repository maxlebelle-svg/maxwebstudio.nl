import { STORAGE_KEYS } from "../config/storageKeys.js";

export const CRM_TASK_TYPES = Object.freeze([
  { value: "lead", label: "Lead" },
  { value: "customer", label: "Klant" },
  { value: "website", label: "Website" },
  { value: "project", label: "Project" },
  { value: "quote", label: "Offerte" },
  { value: "invoice", label: "Factuur" },
  { value: "subscription", label: "Abonnement" },
  { value: "file", label: "Bestand" },
  { value: "change_request", label: "Wijzigingsverzoek" },
  { value: "general", label: "Algemeen" },
]);

export const CRM_TASK_STATUSES = Object.freeze([
  { value: "nieuw", label: "Nieuw" },
  { value: "open", label: "Open" },
  { value: "in_behandeling", label: "In behandeling" },
  { value: "wacht_op_klant", label: "Wacht op klant" },
  { value: "afgerond", label: "Afgerond" },
  { value: "gearchiveerd", label: "Gearchiveerd" },
]);

export const CRM_TASK_PRIORITIES = Object.freeze([
  { value: "laag", label: "Laag" },
  { value: "normaal", label: "Normaal" },
  { value: "hoog", label: "Hoog" },
]);

const CLOSED_STATUSES = new Set(["afgerond", "gearchiveerd"]);
const TASK_TYPE_VALUES = new Set(CRM_TASK_TYPES.map((item) => item.value));
const TASK_STATUS_VALUES = new Set(CRM_TASK_STATUSES.map((item) => item.value));
const TASK_PRIORITY_VALUES = new Set(CRM_TASK_PRIORITIES.map((item) => item.value));

function createId(prefix = "crm-task") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(key, fallback = []) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.warn(`Kon ${key} niet lezen`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function sanitizeString(value) {
  return String(value || "").trim();
}

function normalizeDate(value) {
  const cleaned = sanitizeString(value);
  return cleaned || "";
}

export function normalizeCrmTask(task = {}) {
  const createdAt = sanitizeString(task.createdAt) || nowIso();
  const status = TASK_STATUS_VALUES.has(task.status) ? task.status : "open";
  const priority = TASK_PRIORITY_VALUES.has(task.priority) ? task.priority : "normaal";
  const type = TASK_TYPE_VALUES.has(task.type) ? task.type : "general";

  return {
    id: sanitizeString(task.id) || createId(),
    title: sanitizeString(task.title) || "Nieuwe opvolgactie",
    type,
    status,
    priority,
    customerId: sanitizeString(task.customerId),
    websiteId: sanitizeString(task.websiteId),
    projectId: sanitizeString(task.projectId),
    quoteId: sanitizeString(task.quoteId),
    invoiceId: sanitizeString(task.invoiceId),
    subscriptionId: sanitizeString(task.subscriptionId),
    leadId: sanitizeString(task.leadId),
    changeRequestId: sanitizeString(task.changeRequestId),
    dueDate: normalizeDate(task.dueDate),
    notes: sanitizeString(task.notes),
    source: sanitizeString(task.source) || "admin_crm",
    createdAt,
    updatedAt: sanitizeString(task.updatedAt) || createdAt,
    completedAt: CLOSED_STATUSES.has(status) ? sanitizeString(task.completedAt) || nowIso() : "",
  };
}

export function readCrmTasks() {
  return readJson(STORAGE_KEYS.crmTasks).map(normalizeCrmTask);
}

export function writeCrmTasks(tasks = []) {
  const normalized = tasks.map(normalizeCrmTask).sort((a, b) => {
    const aClosed = CLOSED_STATUSES.has(a.status) ? 1 : 0;
    const bClosed = CLOSED_STATUSES.has(b.status) ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  writeJson(STORAGE_KEYS.crmTasks, normalized);
  return normalized;
}

export function saveCrmTaskLocally(task = {}) {
  const tasks = readCrmTasks();
  const normalized = normalizeCrmTask({ ...task, updatedAt: nowIso() });
  const index = tasks.findIndex((item) => item.id === normalized.id);
  if (index >= 0) tasks[index] = normalized;
  else tasks.unshift(normalized);
  writeCrmTasks(tasks);
  return normalized;
}

export function updateCrmTaskLocally(taskId, updates = {}) {
  const tasks = readCrmTasks();
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index < 0) return null;
  const updated = normalizeCrmTask({
    ...tasks[index],
    ...updates,
    updatedAt: nowIso(),
    completedAt: CLOSED_STATUSES.has(updates.status || tasks[index].status) ? updates.completedAt || tasks[index].completedAt || nowIso() : "",
  });
  tasks[index] = updated;
  writeCrmTasks(tasks);
  return updated;
}

export function completeCrmTaskLocally(taskId) {
  return updateCrmTaskLocally(taskId, { status: "afgerond", completedAt: nowIso() });
}

export function archiveCrmTaskLocally(taskId) {
  return updateCrmTaskLocally(taskId, { status: "gearchiveerd", completedAt: nowIso() });
}

export function deleteCrmTaskLocally(taskId) {
  const remaining = readCrmTasks().filter((task) => task.id !== taskId);
  writeCrmTasks(remaining);
  return remaining;
}

export function getCrmWorkflowSummary(tasks = readCrmTasks()) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(today.getDate() + 7);

  return tasks.reduce((summary, task) => {
    const isClosed = CLOSED_STATUSES.has(task.status);
    if (!isClosed) summary.open += 1;
    if (!isClosed && task.priority === "hoog") summary.highPriority += 1;
    if (!isClosed && task.status === "wacht_op_klant") summary.waitingCustomer += 1;

    if (!isClosed && task.dueDate) {
      const due = new Date(`${task.dueDate}T00:00:00`);
      if (due < today) summary.overdue += 1;
      if (due >= today && due <= weekFromNow) summary.nextSevenDays += 1;
    }

    return summary;
  }, {
    total: tasks.length,
    open: 0,
    highPriority: 0,
    waitingCustomer: 0,
    overdue: 0,
    nextSevenDays: 0,
  });
}

export function getCanonicalCrmRelationships() {
  return [
    { table: "profiles", source: "Supabase Auth/Profile foundation", readiness: "voorbereid", note: "Identiteit en rollen; geen lokale productiewrites." },
    { table: "customers", source: STORAGE_KEYS.crmCustomers, readiness: "hybrid voorbereid", note: "Primaire CRM-klantdata, later leidend in Supabase." },
    { table: "websites", source: STORAGE_KEYS.managedSites, readiness: "hybrid voorbereid", note: "Websitebeheer gekoppeld aan customerId." },
    { table: "projects", source: STORAGE_KEYS.projects, readiness: "hybrid voorbereid", note: "Projecten koppelen customerId en optioneel websiteId." },
    { table: "quotes + quote_lines", source: STORAGE_KEYS.quotes, readiness: "hybrid voorbereid", note: "Offertes blijven lokaal/demo totdat Supabase-write live mag." },
    { table: "invoices + invoice_lines", source: STORAGE_KEYS.invoices, readiness: "hybrid voorbereid", note: "Facturen en demo-betaalflow zonder live Mollie-writes." },
    { table: "subscriptions", source: STORAGE_KEYS.subscriptions, readiness: "hybrid voorbereid", note: "Onderhoud en MRR, nog zonder live incasso." },
    { table: "files", source: STORAGE_KEYS.files, readiness: "metadata voorbereid", note: "Bestandsregistratie; echte storage volgt apart." },
    { table: "change_requests", source: STORAGE_KEYS.changeRequests, readiness: "supporting canonical", note: "Klantveilig zichtbaar, later server-side gekoppeld." },
    { table: "crm_tasks", source: STORAGE_KEYS.crmTasks, readiness: "nieuw local/demo", note: "Interne opvolging; toekomstige productie-activity/takenlaag." },
  ];
}

export function getCrmTaskOptionLabel(options, value, fallback = "Onbekend") {
  return options.find((item) => item.value === value)?.label || fallback;
}
