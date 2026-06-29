import { ENVIRONMENTS, PROVIDERS, getCurrentEnvironment, getCurrentProviderType } from "../config/environment.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import {
  CRM_TASK_PRIORITIES,
  CRM_TASK_STATUSES,
  CRM_TASK_TYPES,
  normalizeCrmTask,
  saveCrmTaskLocally,
} from "./crmWorkflowService.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_TO_SUPABASE = Object.freeze({
  nieuw: "new",
  open: "open",
  in_behandeling: "in_progress",
  wacht_op_klant: "waiting_customer",
  afgerond: "completed",
  gearchiveerd: "archived",
});
const PRIORITY_TO_SUPABASE = Object.freeze({
  laag: "low",
  normaal: "normal",
  hoog: "high",
});
const TYPE_VALUES = new Set(CRM_TASK_TYPES.map((item) => item.value));
const STATUS_VALUES = new Set(CRM_TASK_STATUSES.map((item) => item.value));
const PRIORITY_VALUES = new Set(CRM_TASK_PRIORITIES.map((item) => item.value));

function storageAvailable() {
  return typeof localStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function readFlag(key) {
  if (!storageAvailable()) return false;
  return ["true", "1", "yes", "ja", "enabled"].includes(String(localStorage.getItem(key) || "").toLowerCase());
}

function writeStatus(status = {}) {
  if (!storageAvailable()) return status;
  const payload = {
    ...status,
    checkedAt: status.checkedAt || nowIso(),
  };
  localStorage.setItem(STORAGE_KEYS.lastCrmTaskWriteStatus, JSON.stringify(payload));
  return payload;
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

function keepUuid(value) {
  return isUuid(value) ? String(value) : null;
}

function buildLocalLinks(task = {}) {
  return {
    customerId: task.customerId || "",
    websiteId: task.websiteId || "",
    projectId: task.projectId || "",
    quoteId: task.quoteId || "",
    invoiceId: task.invoiceId || "",
    subscriptionId: task.subscriptionId || "",
    leadId: task.leadId || "",
    changeRequestId: task.changeRequestId || "",
  };
}

export function getCrmTaskWriteReadiness() {
  const providerMode = getCurrentProviderType();
  const environment = getCurrentEnvironment();
  const browserFlag = typeof window !== "undefined" && window.__MAXWEBSTUDIO_CRM_TASK_WRITE__ === true;
  const flagEnabled = readFlag(STORAGE_KEYS.crmTaskWriteEnabled) || browserFlag;
  const supabaseStatus = supabaseProvider.getStatus();
  const missing = [];
  if (providerMode !== PROVIDERS.SUPABASE_WRITE_TEST) missing.push("Provider mode moet supabase-write-test zijn.");
  if (!flagEnabled) missing.push(`${STORAGE_KEYS.crmTaskWriteEnabled}=true ontbreekt.`);
  if (environment === ENVIRONMENTS.PRODUCTION) missing.push("Productieomgeving blokkeert CRM task write MVP.");
  if (!supabaseStatus.configured) missing.push("Supabase URL/anon key ontbreekt in runtime-config.");

  const allowed = missing.length === 0;
  return {
    allowed,
    missing,
    providerMode,
    environment,
    flagEnabled,
    supabaseConfigured: Boolean(supabaseStatus.configured),
    mode: "crm_tasks_create_only",
    writesEnabled: allowed,
    table: "crm_tasks",
    restrictions: [
      "create-only",
      "test metadata verplicht",
      "geen update/delete",
      "local fallback actief",
    ],
  };
}

export function validateCrmTaskWritePayload(task = {}) {
  const normalized = normalizeCrmTask(task);
  const errors = [];
  if (!normalized.title || normalized.title.length < 3) errors.push("Titel is verplicht en moet minimaal 3 tekens bevatten.");
  if (normalized.title.length > 160) errors.push("Titel mag maximaal 160 tekens bevatten.");
  if (!TYPE_VALUES.has(normalized.type)) errors.push("Taaktype is ongeldig.");
  if (!STATUS_VALUES.has(normalized.status)) errors.push("Taakstatus is ongeldig.");
  if (!PRIORITY_VALUES.has(normalized.priority)) errors.push("Prioriteit is ongeldig.");
  if (normalized.notes.length > 2000) errors.push("Notities mogen maximaal 2000 tekens bevatten.");
  return { valid: errors.length === 0, errors, task: normalized };
}

export function mapCrmTaskToSupabasePayload(task = {}) {
  const normalized = normalizeCrmTask(task);
  const localLinks = buildLocalLinks(normalized);
  const metadata = {
    createdBy: "crm-task-write-mvp",
    safeToArchive: true,
    localTaskId: normalized.id,
    localLinks,
    source: normalized.source || "admin_crm",
    clientWritePhase: "35A",
  };

  return {
    title: normalized.title,
    status: STATUS_TO_SUPABASE[normalized.status] || "open",
    priority: PRIORITY_TO_SUPABASE[normalized.priority] || "normal",
    customer_id: keepUuid(normalized.customerId),
    website_id: keepUuid(normalized.websiteId),
    project_id: keepUuid(normalized.projectId),
    quote_id: keepUuid(normalized.quoteId),
    invoice_id: keepUuid(normalized.invoiceId),
    subscription_id: keepUuid(normalized.subscriptionId),
    lead_id: keepUuid(normalized.leadId),
    due_date: normalized.dueDate || null,
    notes: normalized.notes || null,
    is_demo: true,
    environment: "test",
    metadata,
    completed_at: normalized.completedAt || null,
  };
}

function mapSupabaseRecordToLocalTask(record = {}, fallback = {}) {
  const metadata = record.metadata || {};
  const localLinks = metadata.localLinks || {};
  const reverseStatus = Object.entries(STATUS_TO_SUPABASE).find(([, value]) => value === record.status)?.[0] || fallback.status || "open";
  const reversePriority = Object.entries(PRIORITY_TO_SUPABASE).find(([, value]) => value === record.priority)?.[0] || fallback.priority || "normaal";
  return normalizeCrmTask({
    ...fallback,
    id: record.id || fallback.id,
    title: record.title || fallback.title,
    status: reverseStatus,
    priority: reversePriority,
    customerId: localLinks.customerId || record.customer_id || fallback.customerId,
    websiteId: localLinks.websiteId || record.website_id || fallback.websiteId,
    projectId: localLinks.projectId || record.project_id || fallback.projectId,
    quoteId: localLinks.quoteId || record.quote_id || fallback.quoteId,
    invoiceId: localLinks.invoiceId || record.invoice_id || fallback.invoiceId,
    subscriptionId: localLinks.subscriptionId || record.subscription_id || fallback.subscriptionId,
    leadId: localLinks.leadId || record.lead_id || fallback.leadId,
    changeRequestId: localLinks.changeRequestId || fallback.changeRequestId,
    dueDate: record.due_date || fallback.dueDate,
    notes: record.notes || fallback.notes,
    source: "supabase_crm_task_write_mvp",
    createdAt: record.created_at || fallback.createdAt,
    updatedAt: record.updated_at || fallback.updatedAt,
    completedAt: record.completed_at || fallback.completedAt,
  });
}

export async function saveCrmTaskWithWriteFallback(task = {}) {
  const validation = validateCrmTaskWritePayload(task);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(" "));
    error.validationErrors = validation.errors;
    throw error;
  }

  const readiness = getCrmTaskWriteReadiness();
  if (!readiness.allowed) {
    const localTask = saveCrmTaskLocally(validation.task);
    writeStatus({
      status: "fallback_local",
      fallbackUsed: true,
      reason: readiness.missing.join(" "),
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      taskId: localTask.id,
    });
    return { task: localTask, fallbackUsed: true, status: "fallback_local", readiness };
  }

  try {
    const payload = mapCrmTaskToSupabasePayload(validation.task);
    const result = await supabaseProvider.createCrmTask(payload, { crmTaskWrite: true });
    const localMirror = saveCrmTaskLocally(mapSupabaseRecordToLocalTask(result.data, validation.task));
    writeStatus({
      status: "supabase_created",
      fallbackUsed: false,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      taskId: localMirror.id,
      supabaseTaskId: result.data?.id || "",
    });
    return { task: localMirror, fallbackUsed: false, status: "supabase_created", readiness, result };
  } catch (error) {
    const localTask = saveCrmTaskLocally(validation.task);
    writeStatus({
      status: "fallback_after_supabase_error",
      fallbackUsed: true,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      taskId: localTask.id,
      error: error.message || "Supabase CRM task write is mislukt.",
    });
    return { task: localTask, fallbackUsed: true, status: "fallback_after_supabase_error", readiness, error };
  }
}
