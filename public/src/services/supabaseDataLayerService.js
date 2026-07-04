import { CUSTOMER_DATA_MODES } from "../config/environment.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { getSafeSupabaseClientSummary } from "../providers/supabaseClient.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { CustomerRepository } from "../repositories/CustomerRepository.js";
import { WebsiteRepository } from "../repositories/WebsiteRepository.js";
import { ProjectRepository } from "../repositories/ProjectRepository.js";
import { QuoteRepository } from "../repositories/QuoteRepository.js";
import { InvoiceRepository } from "../repositories/InvoiceRepository.js";
import { SubscriptionRepository } from "../repositories/SubscriptionRepository.js";
import { normalizeLeadFinderLead, readAllLocalLeadSources } from "./leadFinderService.js";
import { normalizeCrmTask, readCrmTasks } from "./crmWorkflowService.js";

const MVP_MODULES = Object.freeze([
  "leads",
  "customers",
  "websites",
  "projects",
  "quotes",
  "quote_lines",
  "invoices",
  "invoice_lines",
  "subscriptions",
  "files",
  "change_requests",
  "client_portal_messages",
  "client_portal_notifications",
  "crm_tasks",
]);

const OPERATION_MODULES = Object.freeze([
  "files",
  "change_requests",
  "client_portal_messages",
  "client_portal_notifications",
  "crm_tasks",
]);

function normalizeMode(mode = CUSTOMER_DATA_MODES.HYBRID) {
  return Object.values(CUSTOMER_DATA_MODES).includes(mode) ? mode : CUSTOMER_DATA_MODES.HYBRID;
}

function moduleResult(module, result = {}, recordsKey) {
  const records = Array.isArray(result[recordsKey]) ? result[recordsKey] : [];
  return {
    module,
    mode: result.mode || CUSTOMER_DATA_MODES.LOCAL,
    records,
    count: records.length,
    counts: result.counts || {},
    duplicateMerges: result.duplicateMerges || [],
    fallbackUsed: Boolean(result.fallbackUsed),
    error: result.error || "",
    warning: result.warning || "",
    refreshedAt: result.refreshedAt || new Date().toISOString(),
  };
}

function lineModuleResult(module, parentResult = {}, parentRecordsKey, lineParentKey) {
  const parents = Array.isArray(parentResult[parentRecordsKey]) ? parentResult[parentRecordsKey] : [];
  const records = parents.flatMap((parent) => (Array.isArray(parent.lines) ? parent.lines : []).map((line, index) => ({
    ...line,
    [lineParentKey]: line[lineParentKey] || parent.id || "",
    parentNumber: parent.quoteNumber || parent.invoiceNumber || "",
    parentStatus: parent.status || "",
    parentSource: parent._source || parent.source || "",
    sortOrder: line.sortOrder ?? index,
  })));
  return {
    module,
    mode: parentResult.mode || CUSTOMER_DATA_MODES.LOCAL,
    records,
    count: records.length,
    counts: {
      ...(parentResult.counts || {}),
      parentCount: parents.length,
      lineCount: records.length,
    },
    duplicateMerges: parentResult.duplicateMerges || [],
    fallbackUsed: Boolean(parentResult.fallbackUsed),
    error: parentResult.error || "",
    refreshedAt: parentResult.refreshedAt || new Date().toISOString(),
  };
}

function mapLeadStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "new") return "nieuw";
  if (status === "qualified") return "interesse";
  if (status === "contacted") return "gebeld";
  if (status === "follow_up") return "opvolgen";
  if (status === "converted") return "geconverteerd";
  if (status === "lost") return "geen_interesse";
  return status || "nieuw";
}

function mapWebsiteStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "unknown") return "onbekend";
  if (status === "no_website") return "geen_website";
  if (status === "not_mobile_friendly") return "niet_mobielvriendelijk";
  if (status === "no_ssl") return "geen_ssl";
  return status || "onbekend";
}

function isMissingSupabaseTableError(error = {}) {
  const text = [
    error.message,
    error.details,
    error.hint,
    error.code,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return text.includes("public.leads")
    || text.includes("schema cache")
    || text.includes("could not find the table")
    || text.includes("pgrst205")
    || text.includes("42p01");
}

function mapLead(row = {}, source = "local") {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const normalized = normalizeLeadFinderLead({
    id: row.id,
    companyName: firstValue(row.companyName, row.company, row.businessName, row.name),
    contactName: firstValue(row.contactName, row.contact_name, row.contactPerson, row.contact_person, meta.contactName, meta.contact_name),
    industry: firstValue(row.industry, row.branch, row.branche),
    region: firstValue(row.region, row.city, row.plaats),
    phone: firstValue(row.phone),
    email: firstValue(row.email),
    websiteUrl: firstValue(row.websiteUrl, row.website_url, row.website),
    websiteStatus: mapWebsiteStatus(firstValue(row.websiteStatus, row.website_status)),
    leadScore: firstValue(row.leadScore, row.lead_score, row.score),
    callStatus: firstValue(row.callStatus, row.call_status, mapLeadStatus(row.status)),
    followUpDate: firstValue(row.followUpDate, row.follow_up_date),
    notes: firstValue(row.notes),
    source: firstValue(row.source, source),
    googlePlaceId: firstValue(row.googlePlaceId, row.google_place_id, row.place_id, meta.googlePlaceId, meta.google_place_id),
    googleMapsUrl: firstValue(row.googleMapsUrl, row.google_maps_url, row.maps_url, meta.googleMapsUrl, meta.google_maps_url),
    convertedCustomerId: firstValue(row.convertedCustomerId, row.converted_customer_id),
    ownerAuthUserId: firstValue(row.ownerAuthUserId, row.owner_auth_user_id, row.assignedAuthUserId, row.assigned_auth_user_id, row.created_by_auth_user_id, meta.ownerAuthUserId, meta.owner_auth_user_id, meta.createdBy),
    ownerProfileId: firstValue(row.ownerProfileId, row.owner_profile_id, row.assignedProfileId, row.assigned_profile_id, row.sales_partner_profile_id, meta.ownerProfileId, meta.owner_profile_id),
    ownerEmail: firstValue(row.ownerEmail, row.owner_email, row.assigned_user_email, row.sales_partner_email, meta.ownerEmail, meta.owner_email, meta.createdByEmail),
    ownerName: firstValue(row.ownerName, row.owner_name, row.assigned_user_name, row.sales_partner_name, meta.ownerName, meta.owner_name, meta.createdByName),
    assignedUserEmail: firstValue(row.assignedUserEmail, row.assigned_user_email, meta.assignedUserEmail, meta.assigned_user_email),
    assignedUserName: firstValue(row.assignedUserName, row.assigned_user_name, meta.assignedUserName, meta.assigned_user_name),
    salesPartnerEmail: firstValue(row.salesPartnerEmail, row.sales_partner_email, meta.salesPartnerEmail, meta.sales_partner_email),
    salesPartnerName: firstValue(row.salesPartnerName, row.sales_partner_name, meta.salesPartnerName, meta.sales_partner_name),
    createdBy: firstValue(row.createdBy, row.created_by, row.created_by_auth_user_id, meta.createdBy, meta.created_by),
    createdByEmail: firstValue(row.createdByEmail, row.created_by_email, meta.createdByEmail, meta.created_by_email),
    createdByName: firstValue(row.createdByName, row.created_by_name, meta.createdByName, meta.created_by_name),
    metadata: meta,
    isDemo: Boolean(row.isDemo || row.is_demo || meta.isDemo),
    environment: firstValue(row.environment, meta.environment, row.isDemo || row.is_demo ? "demo" : "local"),
    createdAt: firstValue(row.createdAt, row.created_at),
    updatedAt: firstValue(row.updatedAt, row.updated_at),
  });
  return {
    ...normalized,
    status: String(firstValue(row.status, normalized.callStatus)),
    metadata: meta,
    isDemo: Boolean(row.isDemo || row.is_demo || meta.isDemo),
    environment: String(firstValue(row.environment, meta.environment, row.isDemo || row.is_demo || meta.isDemo ? "demo" : "local")),
    convertedAt: String(firstValue(row.convertedAt, row.converted_at)),
    _source: source,
    _supabaseId: source === "supabase" ? String(row.id || "") : "",
    _localId: source === "local" ? String(row.id || "") : String(firstValue(row.external_id, meta.localStorageId)),
  };
}

async function readLeadModule(mode) {
  const local = readAllLocalLeadSources().map((lead) => mapLead(lead, lead._source || "local"));
  if (mode === CUSTOMER_DATA_MODES.LOCAL) {
    return moduleResult("leads", {
      mode: CUSTOMER_DATA_MODES.LOCAL,
      records: local,
      counts: { local: local.length, supabase: 0, hybrid: local.length },
    }, "records");
  }
  try {
    const rows = await supabaseProvider.getAll("leads", { limit: 100 });
    const remote = rows.map((row) => mapLead(row, "supabase"));
    const records = mode === CUSTOMER_DATA_MODES.HYBRID ? mergeOperationRecords(remote, local) : remote;
    return moduleResult("leads", {
      mode,
      records,
      counts: { local: local.length, supabase: remote.length, hybrid: records.length },
      fallbackUsed: false,
    }, "records");
  } catch (error) {
    const missingLeadsTable = isMissingSupabaseTableError(error);
    if (mode === CUSTOMER_DATA_MODES.HYBRID || missingLeadsTable) {
      return moduleResult("leads", {
        mode: CUSTOMER_DATA_MODES.LOCAL,
        records: local,
        counts: { local: local.length, supabase: 0, hybrid: local.length },
        fallbackUsed: true,
        error: missingLeadsTable ? "" : error.message || "Leads konden niet uit Supabase worden gelezen.",
        warning: missingLeadsTable ? "Productie heeft nog geen public.leads tabel. Leads worden tijdelijk uit bestaande lokale leadbronnen gelezen." : "",
      }, "records");
    }
    return moduleResult("leads", {
      mode,
      records: [],
      counts: { local: local.length, supabase: 0, hybrid: 0 },
      fallbackUsed: false,
      error: error.message || "Leads konden niet uit Supabase worden gelezen.",
    }, "records");
  }
}

function readStoredArray(key) {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function storageKeyForOperationModule(module) {
  if (module === "files") return STORAGE_KEYS.files;
  if (module === "change_requests") return STORAGE_KEYS.changeRequests;
  if (module === "client_portal_messages") return STORAGE_KEYS.clientPortalMessages;
  if (module === "client_portal_notifications") return STORAGE_KEYS.clientPortalNotifications;
  if (module === "crm_tasks") return STORAGE_KEYS.crmTasks;
  return "";
}

function tableForOperationModule(module) {
  return module;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function operationBase(row = {}, source = "local") {
  const createdAt = firstValue(row.createdAt, row.created_at, row.addedAt, new Date().toISOString());
  const updatedAt = firstValue(row.updatedAt, row.updated_at, createdAt);
  return {
    id: String(firstValue(row.id, row.external_id, row.metadata?.localStorageId)),
    customerId: String(firstValue(row.customerId, row.customer_id, row.profileId, row.profile_id)),
    profileId: String(firstValue(row.profileId, row.profile_id, row.customerId, row.customer_id)),
    websiteId: String(firstValue(row.websiteId, row.website_id)),
    projectId: String(firstValue(row.projectId, row.project_id)),
    status: String(firstValue(row.status, "active")),
    notes: String(firstValue(row.notes)),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    isDemo: Boolean(row.isDemo || row.is_demo),
    environment: String(firstValue(row.environment, row.isDemo || row.is_demo ? "demo" : "local")),
    createdAt: String(createdAt),
    updatedAt: String(updatedAt),
    _source: source,
    _supabaseId: source === "supabase" ? String(row.id || "") : String(firstValue(row._supabaseId, row.supabaseId)),
    _localId: source === "local" ? String(row.id || "") : String(firstValue(row.external_id, row.metadata?.localStorageId, row._localId)),
  };
}

function mapFile(row = {}, source = "local") {
  const base = operationBase(row, source);
  const location = String(firstValue(row.location, row.url, row.storage_path, row.fileUrl, row.file_url));
  return {
    ...base,
    name: String(firstValue(row.name, row.fileName, row.file_name, "Bestand")),
    type: String(firstValue(row.type, row.file_type)),
    fileType: String(firstValue(row.fileType, row.file_type, row.type)),
    category: String(firstValue(row.category, "Overig")),
    location,
    url: location,
    storagePath: String(firstValue(row.storagePath, row.storage_path)),
    isClientVisible: Boolean(row.isClientVisible ?? row.is_client_visible ?? false),
    addedAt: String(firstValue(row.addedAt, row.createdAt, row.created_at, base.createdAt)),
  };
}

function mapChangeRequest(row = {}, source = "local") {
  return {
    ...operationBase(row, source),
    authUserId: String(firstValue(row.authUserId, row.auth_user_id)),
    name: String(firstValue(row.name)),
    company: String(firstValue(row.company)),
    email: String(firstValue(row.email)),
    phone: String(firstValue(row.phone)),
    title: String(firstValue(row.title, "Wijzigingsverzoek")),
    description: String(firstValue(row.description, row.message, row.request)),
    category: String(firstValue(row.category, "Algemeen")),
    priority: String(firstValue(row.priority, "normal")),
    files: Array.isArray(row.files) ? row.files : [],
    source: String(firstValue(row.source, source)),
    completedAt: String(firstValue(row.completedAt, row.completed_at)),
    archivedAt: String(firstValue(row.archivedAt, row.archived_at)),
  };
}

function mapClientPortalMessage(row = {}, source = "local") {
  return {
    ...operationBase(row, source),
    senderProfileId: String(firstValue(row.senderProfileId, row.sender_profile_id)),
    senderType: String(firstValue(row.senderType, row.sender_type, row.sender, "admin")),
    subject: String(firstValue(row.subject, row.title, "Bericht")),
    title: String(firstValue(row.title, row.subject, "Bericht")),
    body: String(firstValue(row.body, row.message, row.text)),
    message: String(firstValue(row.message, row.body, row.text)),
    readAt: String(firstValue(row.readAt, row.read_at)),
  };
}

function mapClientPortalNotification(row = {}, source = "local") {
  return {
    ...operationBase(row, source),
    type: String(firstValue(row.type, "info")),
    title: String(firstValue(row.title, "Notificatie")),
    body: String(firstValue(row.body, row.message)),
    message: String(firstValue(row.message, row.body)),
    entityType: String(firstValue(row.entityType, row.entity_type)),
    entityId: String(firstValue(row.entityId, row.entity_id)),
    actionLabel: String(firstValue(row.actionLabel, row.action_label)),
    actionUrl: String(firstValue(row.actionUrl, row.action_url)),
    readAt: String(firstValue(row.readAt, row.read_at)),
  };
}

function mapCrmTaskStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "new") return "nieuw";
  if (status === "in_progress") return "in_behandeling";
  if (status === "waiting_customer") return "wacht_op_klant";
  if (status === "completed") return "afgerond";
  if (status === "archived") return "gearchiveerd";
  return status || "open";
}

function mapCrmTaskPriority(value) {
  const priority = String(value || "").trim().toLowerCase();
  if (priority === "low") return "laag";
  if (priority === "high" || priority === "urgent") return "hoog";
  return priority === "laag" || priority === "hoog" ? priority : "normaal";
}

function mapCrmTask(row = {}, source = "local") {
  const normalized = normalizeCrmTask({
    id: row.id,
    title: firstValue(row.title),
    type: firstValue(row.type, row.task_type, "general"),
    status: mapCrmTaskStatus(row.status),
    priority: mapCrmTaskPriority(row.priority),
    customerId: firstValue(row.customerId, row.customer_id),
    websiteId: firstValue(row.websiteId, row.website_id),
    projectId: firstValue(row.projectId, row.project_id),
    quoteId: firstValue(row.quoteId, row.quote_id),
    invoiceId: firstValue(row.invoiceId, row.invoice_id),
    subscriptionId: firstValue(row.subscriptionId, row.subscription_id),
    leadId: firstValue(row.leadId, row.lead_id),
    changeRequestId: firstValue(row.changeRequestId, row.change_request_id),
    dueDate: firstValue(row.dueDate, row.due_date),
    notes: firstValue(row.notes),
    source: firstValue(row.source, source),
    createdAt: firstValue(row.createdAt, row.created_at),
    updatedAt: firstValue(row.updatedAt, row.updated_at),
    completedAt: firstValue(row.completedAt, row.completed_at),
  });
  return {
    ...normalized,
    assignedProfileId: String(firstValue(row.assignedProfileId, row.assigned_profile_id)),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    isDemo: Boolean(row.isDemo || row.is_demo),
    environment: String(firstValue(row.environment, row.isDemo || row.is_demo ? "demo" : "local")),
    _source: source,
    _supabaseId: source === "supabase" ? String(row.id || "") : "",
    _localId: source === "local" ? String(row.id || "") : String(firstValue(row.external_id, row.metadata?.localStorageId)),
  };
}

function mapOperationRecord(module, row = {}, source = "local") {
  if (module === "files") return mapFile(row, source);
  if (module === "change_requests") return mapChangeRequest(row, source);
  if (module === "client_portal_messages") return mapClientPortalMessage(row, source);
  if (module === "client_portal_notifications") return mapClientPortalNotification(row, source);
  if (module === "crm_tasks") return mapCrmTask(row, source);
  return { ...operationBase(row, source), ...row };
}

function readLocalOperationRecords(module) {
  if (module === "crm_tasks") return readCrmTasks().map((task) => mapCrmTask(task, "local"));
  const key = storageKeyForOperationModule(module);
  return readStoredArray(key).map((row) => mapOperationRecord(module, row, "local"));
}

function mergeOperationRecords(remote = [], local = []) {
  const seen = new Set();
  return [...remote, ...local].filter((record) => {
    const key = String(record._supabaseId || record._localId || record.id || "");
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readRemoteOperationRecords(module) {
  const rows = await supabaseProvider.getAll(tableForOperationModule(module), { limit: 100 });
  return rows.map((row) => mapOperationRecord(module, row, "supabase"));
}

async function readOperationModule(module, mode) {
  const local = readLocalOperationRecords(module);
  if (mode === CUSTOMER_DATA_MODES.LOCAL) {
    return moduleResult(module, {
      mode: CUSTOMER_DATA_MODES.LOCAL,
      records: local,
      counts: { local: local.length, supabase: 0, hybrid: local.length },
    }, "records");
  }
  try {
    const remote = await readRemoteOperationRecords(module);
    const records = mode === CUSTOMER_DATA_MODES.HYBRID ? mergeOperationRecords(remote, local) : remote;
    return moduleResult(module, {
      mode,
      records,
      counts: { local: local.length, supabase: remote.length, hybrid: records.length },
      fallbackUsed: false,
    }, "records");
  } catch (error) {
    if (mode === CUSTOMER_DATA_MODES.HYBRID) {
      return moduleResult(module, {
        mode: CUSTOMER_DATA_MODES.LOCAL,
        records: local,
        counts: { local: local.length, supabase: 0, hybrid: local.length },
        fallbackUsed: true,
        error: error.message || `${module} kon niet uit Supabase worden gelezen.`,
      }, "records");
    }
    return moduleResult(module, {
      mode,
      records: [],
      counts: { local: local.length, supabase: 0, hybrid: 0 },
      fallbackUsed: false,
      error: error.message || `${module} kon niet uit Supabase worden gelezen.`,
    }, "records");
  }
}

async function readModule(module, mode) {
  if (module === "leads") {
    return readLeadModule(mode);
  }
  if (module === "customers") {
    return moduleResult(module, await CustomerRepository.listByDataMode(mode), "customers");
  }
  if (module === "websites") {
    return moduleResult(module, await WebsiteRepository.listByDataMode(mode), "websites");
  }
  if (module === "projects") {
    return moduleResult(module, await ProjectRepository.listByDataMode(mode), "projects");
  }
  if (module === "quotes") {
    return moduleResult(module, await QuoteRepository.listByDataMode(mode), "quotes");
  }
  if (module === "quote_lines") {
    return lineModuleResult(module, await QuoteRepository.listByDataMode(mode), "quotes", "quoteId");
  }
  if (module === "invoices") {
    return moduleResult(module, await InvoiceRepository.listByDataMode(mode), "invoices");
  }
  if (module === "invoice_lines") {
    return lineModuleResult(module, await InvoiceRepository.listByDataMode(mode), "invoices", "invoiceId");
  }
  if (module === "subscriptions") {
    return moduleResult(module, await SubscriptionRepository.listByDataMode(mode), "subscriptions");
  }
  if (OPERATION_MODULES.includes(module)) {
    return readOperationModule(module, mode);
  }
  throw new Error(`Onbekende Supabase Data Layer module: ${module}`);
}

export async function readSupabaseDataLayerModule(module, options = {}) {
  const mode = normalizeMode(options.mode || CUSTOMER_DATA_MODES.HYBRID);
  return readModule(module, mode);
}

export async function readSupabaseDataLayerMvp(options = {}) {
  const mode = normalizeMode(options.mode || CUSTOMER_DATA_MODES.HYBRID);
  const modules = Array.isArray(options.modules) && options.modules.length
    ? options.modules.filter((module) => MVP_MODULES.includes(module))
    : MVP_MODULES;
  const results = {};
  for (const module of modules) {
    results[module] = await readModule(module, mode);
  }
  const fallbackModules = Object.values(results).filter((result) => result.fallbackUsed).map((result) => result.module);
  const errors = Object.values(results).filter((result) => result.error).map((result) => ({
    module: result.module,
    error: result.error,
  }));
  return {
    mode,
    modules: results,
    fallbackUsed: fallbackModules.length > 0,
    fallbackModules,
    errors,
    writesEnabled: false,
    writePolicy: "MVP is read-only. Writes blijven local/demo of bestaande gated write-test flows.",
    refreshedAt: new Date().toISOString(),
  };
}

export function getSupabaseDataLayerMvpStatus() {
  const supabase = getSafeSupabaseClientSummary();
  return {
    phase: "34",
    name: "Supabase Data Layer MVP",
    modules: MVP_MODULES,
    defaultMode: CUSTOMER_DATA_MODES.HYBRID,
    supportedModes: [
      CUSTOMER_DATA_MODES.LOCAL,
      CUSTOMER_DATA_MODES.SUPABASE_READ,
      CUSTOMER_DATA_MODES.HYBRID,
    ],
    supabase,
    readsPrepared: true,
    writesEnabled: false,
    productionReady: false,
    reason: "Leadfinder, customers, websites, projects, finance en operationele modules hebben read-only Supabase services met localStorage fallback. Productie blijft uit tot expliciete releaseapproval.",
  };
}

export const SupabaseDataLayerService = {
  getStatus: getSupabaseDataLayerMvpStatus,
  readModule: readSupabaseDataLayerModule,
  readMvp: readSupabaseDataLayerMvp,
};
