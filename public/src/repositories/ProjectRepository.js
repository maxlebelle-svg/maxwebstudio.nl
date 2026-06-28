import { CUSTOMER_DATA_MODES, getCurrentProviderType, PROVIDERS } from "../config/environment.js";
import { PRIMARY_MODULE_KEYS, STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { logActivity, listActivitiesForEntity } from "../services/activityLogService.js";
import {
  normalizeProject,
  projectIdentityKeys,
  supabaseProjectStatus,
  localProjectStatus,
} from "../utils/projectNormalizer.js";
import { listLocalCustomers, getCustomerSource } from "./CustomerRepository.js";
import { listLocalWebsites, getWebsiteSource } from "./WebsiteRepository.js";
import { createRepository } from "./createRepository.js";

const localProjectRepository = createRepository(PRIMARY_MODULE_KEYS.projects);

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function projectDataMode() {
  return readJson(STORAGE_KEYS.settings, {})?.projectDataMode
    || localStorage.getItem(STORAGE_KEYS.projectDataMode)
    || CUSTOMER_DATA_MODES.LOCAL;
}

function isSupabaseProject(project = {}) {
  return ["supabase", "hybrid"].includes(project._source) || Boolean(project._supabaseProjectId || project.supabaseProjectId);
}

function projectWriteTarget(project = {}, options = {}) {
  if (options.target) return options.target;
  if (options.forceLocal || project.isDemo || project.environment === "demo") return "local";
  return isSupabaseProject(project) ? "supabase" : "local";
}

function localProjectPayload(project = {}) {
  return normalizeProject({
    ...project,
    status: localProjectStatus(project.status),
  });
}

function sourceLabel(project = {}) {
  if (project.isDemo || project.isDemoJourney || project.environment === "demo") return "demo";
  return project._source || "local";
}

export function markProjectSource(project = {}, source = "local", extra = {}) {
  return {
    ...project,
    _source: sourceLabel({ ...project, _source: source }),
    _isMigrated: Boolean(project.supabaseProjectId || project.migratedToSupabaseAt || extra.supabaseProjectId),
    _supabaseProjectId: extra.supabaseProjectId || project.supabaseProjectId || project.id || "",
    _localProjectId: extra.localProjectId || project._localProjectId || project.metadata?.localStorageId || "",
    _customerSource: extra.customerSource || project._customerSource || "",
    _websiteSource: extra.websiteSource || project._websiteSource || "",
    _linkedCustomerStatus: extra.linkedCustomerStatus || project._linkedCustomerStatus || "",
    _linkedWebsiteStatus: extra.linkedWebsiteStatus || project._linkedWebsiteStatus || "",
    _sourceMeta: {
      ...(project._sourceMeta || {}),
      ...extra,
    },
  };
}

export function getProjectSource(project = {}) {
  return sourceLabel(project);
}

function localProjectsFromStorage() {
  const seen = new Set();
  return readArray(STORAGE_KEYS.projects)
    .map(normalizeProject)
    .filter((project) => {
      const keys = projectIdentityKeys(project);
      const key = keys.id || keys.customerWebsiteName || keys.customerName;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function listLocalProjects() {
  return localProjectsFromStorage().map((project) => markProjectSource(project, project.isDemo || project.environment === "demo" ? "demo" : "local", {
    localProjectId: project.id,
    supabaseProjectId: project.supabaseProjectId || "",
  }));
}

export async function listSupabaseProjects() {
  const rows = await supabaseProvider.getAll("projects", { limit: 100 });
  return rows.map((row) => markProjectSource(mapSupabaseProjectToLocal(row), "supabase", {
    supabaseProjectId: row.id,
    localProjectId: row.metadata?.localStorageId || row.external_id || "",
  }));
}

function mergeSupabaseWithLocal(localProject, supabaseProject, reason = "supabase_match") {
  return markProjectSource({
    ...localProject,
    ...supabaseProject,
    id: localProject.id || supabaseProject.id,
    customerId: localProject.customerId || supabaseProject.customerId,
    websiteId: localProject.websiteId || supabaseProject.websiteId,
    createdAt: supabaseProject.createdAt || localProject.createdAt,
    updatedAt: supabaseProject.updatedAt || localProject.updatedAt,
  }, "hybrid", {
    reason,
    localProjectId: localProject.id || "",
    supabaseProjectId: supabaseProject.id || localProject.supabaseProjectId || "",
  });
}

export function mergeProjectSources(localProjects = [], supabaseProjects = []) {
  const merged = [];
  const duplicateMerges = [];
  const usedLocalIds = new Set();
  const localBySupabaseId = new Map();
  const localByIdentity = new Map();
  localProjects.forEach((project) => {
    const normalized = normalizeProject(project);
    const keys = projectIdentityKeys(normalized);
    if (normalized.supabaseProjectId) localBySupabaseId.set(String(normalized.supabaseProjectId), normalized);
    if (keys.customerWebsiteName) localByIdentity.set(keys.customerWebsiteName, normalized);
    else if (keys.customerName) localByIdentity.set(keys.customerName, normalized);
  });
  supabaseProjects.forEach((project) => {
    const normalized = normalizeProject(project);
    const keys = projectIdentityKeys(normalized);
    const localMatch = localBySupabaseId.get(String(normalized.id))
      || (keys.customerWebsiteName ? localByIdentity.get(keys.customerWebsiteName) : null)
      || (keys.customerName ? localByIdentity.get(keys.customerName) : null);
    if (localMatch) {
      usedLocalIds.add(localMatch.id);
      const reason = localMatch.supabaseProjectId === normalized.id ? "supabaseProjectId" : "customer_website_name";
      duplicateMerges.push({ reason, localProjectId: localMatch.id, supabaseProjectId: normalized.id, name: normalized.name });
      merged.push(mergeSupabaseWithLocal(localMatch, normalized, reason));
      return;
    }
    merged.push(markProjectSource(normalized, "supabase", { supabaseProjectId: normalized.id }));
  });
  localProjects.map(normalizeProject).forEach((project) => {
    if (usedLocalIds.has(project.id)) return;
    if (project.supabaseProjectId && !project.isDemo && project.environment !== "demo") return;
    merged.push(markProjectSource(project, project.isDemo || project.environment === "demo" ? "demo" : "local", {
      localProjectId: project.id,
      supabaseProjectId: project.supabaseProjectId || "",
    }));
  });
  return {
    projects: merged,
    duplicateMerges,
    counts: {
      local: localProjects.length,
      supabase: supabaseProjects.length,
      hybrid: merged.length,
      duplicateMerges: duplicateMerges.length,
      demo: merged.filter((project) => getProjectSource(project) === "demo").length,
      unmigratedLocal: merged.filter((project) => getProjectSource(project) === "local" && !project._isMigrated).length,
    },
  };
}

export async function listHybridProjects() {
  const localProjects = listLocalProjects();
  const supabaseProjects = await listSupabaseProjects();
  return mergeProjectSources(localProjects, supabaseProjects);
}

export async function listByDataMode(mode = CUSTOMER_DATA_MODES.LOCAL) {
  if (mode === CUSTOMER_DATA_MODES.SUPABASE_READ) {
    const projects = await listSupabaseProjects();
    return {
      mode,
      projects,
      counts: { local: listLocalProjects().length, supabase: projects.length, hybrid: projects.length, duplicateMerges: 0, demo: 0, unmigratedLocal: 0 },
      fallbackUsed: false,
      error: "",
      refreshedAt: nowIso(),
    };
  }
  if (mode === CUSTOMER_DATA_MODES.HYBRID) {
    try {
      const merged = await listHybridProjects();
      return { mode, ...merged, fallbackUsed: false, error: "", refreshedAt: nowIso() };
    } catch (error) {
      const projects = listLocalProjects();
      return {
        mode,
        projects,
        counts: {
          local: projects.length,
          supabase: 0,
          hybrid: projects.length,
          duplicateMerges: 0,
          demo: projects.filter((project) => getProjectSource(project) === "demo").length,
          unmigratedLocal: projects.filter((project) => getProjectSource(project) === "local" && !project._isMigrated).length,
        },
        duplicateMerges: [],
        fallbackUsed: true,
        error: error.message || "Supabase projecten konden niet worden gelezen.",
        refreshedAt: nowIso(),
      };
    }
  }
  const projects = listLocalProjects();
  return {
    mode: CUSTOMER_DATA_MODES.LOCAL,
    projects,
    counts: {
      local: projects.length,
      supabase: 0,
      hybrid: projects.length,
      duplicateMerges: 0,
      demo: projects.filter((project) => getProjectSource(project) === "demo").length,
      unmigratedLocal: projects.filter((project) => getProjectSource(project) === "local" && !project._isMigrated).length,
    },
    duplicateMerges: [],
    fallbackUsed: false,
    error: "",
    refreshedAt: nowIso(),
  };
}

export function compareProjectChanges(oldProject = {}, newProject = {}) {
  const fields = ["customerId", "websiteId", "name", "type", "status", "phase", "startDate", "deadline", "expectedDeliveryDate", "completedAt", "priority", "budget", "package", "notes", "internalNotes", "clientVisibleNotes"];
  const changedFields = [];
  const oldValues = {};
  const newValues = {};
  fields.forEach((field) => {
    const oldValue = oldProject[field] ?? "";
    const newValue = newProject[field] ?? "";
    if (String(oldValue) === String(newValue)) return;
    changedFields.push(field);
    oldValues[field] = oldValue;
    newValues[field] = newValue;
  });
  return { changedFields, oldValues, newValues };
}

function relationLookup() {
  const customers = listLocalCustomers();
  const websites = listLocalWebsites();
  return {
    customers,
    websites,
    customersById: new Map(customers.map((customer) => [customer.id, customer])),
    websitesById: new Map(websites.map((website) => [website.id, website])),
    customersBySupabaseId: new Map(customers.filter((customer) => customer.supabaseCustomerId || customer._supabaseCustomerId).map((customer) => [customer.supabaseCustomerId || customer._supabaseCustomerId, customer])),
    websitesBySupabaseId: new Map(websites.filter((website) => website.supabaseWebsiteId || website._supabaseWebsiteId).map((website) => [website.supabaseWebsiteId || website._supabaseWebsiteId, website])),
  };
}

export function resolveProjectCustomerLink(project = {}, relations = null) {
  const normalized = normalizeProject(project);
  const lookup = relations || relationLookup();
  const localCustomer = lookup.customersById?.get(normalized.customerId) || null;
  const supabaseCustomerId = normalized.supabaseCustomerId || localCustomer?._supabaseCustomerId || localCustomer?.supabaseCustomerId || "";
  if (supabaseCustomerId) {
    return {
      status: "linked",
      localCustomer,
      localCustomerId: localCustomer?.id || normalized.customerId || "",
      supabaseCustomerId,
      customerSource: localCustomer ? getCustomerSource(localCustomer) : "supabase",
      message: "Gekoppelde Supabase customer gevonden.",
    };
  }
  if (!normalized.customerId) return { status: "missing_customer", localCustomer: null, localCustomerId: "", supabaseCustomerId: "", customerSource: "", message: "Project mist klantkoppeling." };
  if (localCustomer) return { status: "waiting_customer_migration", localCustomer, localCustomerId: localCustomer.id, supabaseCustomerId: "", customerSource: getCustomerSource(localCustomer), message: "Klant bestaat lokaal, maar heeft nog geen Supabase customer ID." };
  return { status: "customer_not_found", localCustomer: null, localCustomerId: normalized.customerId, supabaseCustomerId: "", customerSource: "", message: "Gekoppelde klant niet gevonden." };
}

function projectRequiresWebsite(project = {}) {
  const normalized = normalizeProject(project);
  const type = String(normalized.type || "").toLowerCase();
  if (normalized.metadata?.allowNoWebsite === true || normalized.allowNoWebsite === true) return false;
  return !["seo", "onderhoud"].includes(type);
}

export function resolveProjectWebsiteLink(project = {}, relations = null) {
  const normalized = normalizeProject(project);
  const lookup = relations || relationLookup();
  const localWebsite = lookup.websitesById?.get(normalized.websiteId) || null;
  const supabaseWebsiteId = normalized.supabaseWebsiteId || localWebsite?._supabaseWebsiteId || localWebsite?.supabaseWebsiteId || "";
  if (supabaseWebsiteId) {
    return {
      status: "linked",
      localWebsite,
      localWebsiteId: localWebsite?.id || normalized.websiteId || "",
      supabaseWebsiteId,
      websiteSource: localWebsite ? getWebsiteSource(localWebsite) : "supabase",
      message: "Gekoppelde Supabase website gevonden.",
    };
  }
  if (!normalized.websiteId) {
    if (!projectRequiresWebsite(normalized)) return { status: "not_required", localWebsite: null, localWebsiteId: "", supabaseWebsiteId: "", websiteSource: "", message: "Project mag zonder website worden gemigreerd." };
    return { status: "missing_website", localWebsite: null, localWebsiteId: "", supabaseWebsiteId: "", websiteSource: "", message: "Project mist websitekoppeling." };
  }
  if (localWebsite) return { status: "waiting_website_migration", localWebsite, localWebsiteId: localWebsite.id, supabaseWebsiteId: "", websiteSource: getWebsiteSource(localWebsite), message: "Website bestaat lokaal, maar heeft nog geen Supabase website ID." };
  return { status: "website_not_found", localWebsite: null, localWebsiteId: normalized.websiteId, supabaseWebsiteId: "", websiteSource: "", message: "Gekoppelde website niet gevonden." };
}

function mapProjectWritePayload(project = {}, options = {}) {
  const normalized = normalizeProject(project);
  const customerLink = options.customerLink || resolveProjectCustomerLink(normalized);
  const websiteLink = options.websiteLink || resolveProjectWebsiteLink(normalized);
  return {
    external_id: normalized.externalId || normalized._localProjectId || normalized.id || null,
    customer_id: customerLink.supabaseCustomerId || normalized.supabaseCustomerId || null,
    customer_external_id: normalized.customerId || null,
    website_id: websiteLink.supabaseWebsiteId || normalized.supabaseWebsiteId || null,
    website_external_id: normalized.websiteId || null,
    name: normalized.name || null,
    project_name: normalized.name || null,
    project_type: normalized.type || null,
    status: supabaseProjectStatus(normalized.status),
    phase: normalized.phase || null,
    progress: normalized.progress || 0,
    start_date: normalized.startDate || null,
    expected_delivery_date: normalized.expectedDeliveryDate || normalized.deadline || null,
    completed_at: normalized.completedAt || null,
    priority: normalized.priority || null,
    budget: normalized.budget || null,
    package_name: normalized.package || null,
    notes: normalized.notes || null,
    internal_notes: normalized.internalNotes || normalized.notes || null,
    client_visible_notes: normalized.clientVisibleNotes || null,
    is_demo: Boolean(normalized.isDemo),
    is_demo_journey: Boolean(normalized.isDemoJourney),
    environment: normalized.environment || (normalized.isDemo || normalized.isDemoJourney ? "demo" : "production"),
    demo_scenario_id: normalized.demoScenarioId || null,
    demo_journey_id: normalized.demoJourneyId || null,
    source: "crm",
    metadata: {
      ...(normalized.metadata || {}),
      localStorageId: normalized._localProjectId || normalized.id || normalized.metadata?.localStorageId || "",
      localCustomerId: normalized.customerId || "",
      localWebsiteId: normalized.websiteId || "",
      customerLinkStatus: customerLink.status,
      websiteLinkStatus: websiteLink.status,
      checklist: normalized.checklist,
      tasks: normalized.tasks,
      timeline: normalized.timeline,
      lastProjectWriteContext: "crm_project_write",
    },
  };
}

export function mapLocalProjectToSupabase(project = {}) {
  return mapProjectWritePayload(project);
}

export function mapSupabaseProjectToLocal(row = {}) {
  return normalizeProject({
    id: row.id,
    externalId: row.external_id,
    customerId: row.customer_external_id || row.metadata?.localCustomerId || "",
    profileId: row.customer_external_id || row.metadata?.localCustomerId || "",
    supabaseCustomerId: row.customer_id,
    websiteId: row.website_external_id || row.metadata?.localWebsiteId || "",
    supabaseWebsiteId: row.website_id,
    name: row.project_name || row.name,
    type: row.project_type,
    status: row.status,
    phase: row.phase,
    progress: row.progress,
    startDate: row.start_date,
    deadline: row.expected_delivery_date,
    expectedDeliveryDate: row.expected_delivery_date,
    completedAt: row.completed_at,
    priority: row.priority,
    budget: row.budget,
    package: row.package_name,
    notes: row.notes,
    internalNotes: row.internal_notes,
    clientVisibleNotes: row.client_visible_notes,
    checklist: row.metadata?.checklist || [],
    tasks: row.metadata?.tasks || [],
    timeline: row.metadata?.timeline || [],
    isDemo: row.is_demo,
    isDemoJourney: row.is_demo_journey,
    environment: row.environment,
    demoScenarioId: row.demo_scenario_id,
    demoJourneyId: row.demo_journey_id,
    supabaseProjectId: row.id,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUpdateAt: row.updated_at,
  });
}

export function validateProjectForSupabase(project = {}, relations = null) {
  const normalized = normalizeProject(project);
  const warnings = [];
  const errors = [];
  if (!normalized.id) errors.push("Project mist id.");
  if (!normalized.name) errors.push("Project mist projectnaam.");
  if (!normalized.customerId) errors.push("Project mist klantkoppeling.");
  if (!normalized.status) warnings.push("Project mist status.");
  if (!normalized.phase) warnings.push("Project mist fase.");
  if (!normalized.createdAt) warnings.push("Project mist createdAt.");
  if (!normalized.updatedAt) warnings.push("Project mist updatedAt.");
  if ((normalized.isDemo || normalized.isDemoJourney || normalized.environment === "demo") && !normalized.demoScenarioId && !normalized.demoJourneyId) warnings.push("Demo-project mist demoScenarioId/demoJourneyId.");
  const customerLink = resolveProjectCustomerLink(normalized, relations);
  const websiteLink = resolveProjectWebsiteLink(normalized, relations);
  if (["missing_customer", "customer_not_found"].includes(customerLink.status)) errors.push(customerLink.message);
  if (customerLink.status === "waiting_customer_migration") warnings.push(customerLink.message);
  if (["missing_website", "website_not_found"].includes(websiteLink.status)) errors.push(websiteLink.message);
  if (websiteLink.status === "waiting_website_migration") warnings.push(websiteLink.message);
  return {
    id: normalized.id,
    ready: errors.length === 0 && customerLink.status === "linked" && ["linked", "not_required"].includes(websiteLink.status),
    canDryRun: errors.length === 0,
    errors,
    warnings,
    customerLink,
    websiteLink,
    normalized,
  };
}

export function prepareProjectsForMigration(projects = []) {
  const relations = relationLookup();
  const seen = new Map();
  const unique = [];
  const duplicates = [];
  projects.forEach((project) => {
    const normalized = normalizeProject(project);
    const keys = projectIdentityKeys(normalized);
    const key = keys.customerWebsiteName || keys.customerName || normalized.id;
    if (key && seen.has(key)) {
      duplicates.push({ key, project: normalized, duplicateOf: seen.get(key) });
      return;
    }
    if (key) seen.set(key, normalized.id);
    unique.push(normalized);
  });
  const validation = unique.map((project) => validateProjectForSupabase(project, relations));
  return {
    total: projects.length,
    unique,
    duplicates,
    ready: validation.filter((item) => item.ready),
    waitingForCustomer: validation.filter((item) => item.customerLink.status === "waiting_customer_migration"),
    waitingForWebsite: validation.filter((item) => item.websiteLink.status === "waiting_website_migration"),
    attention: validation.filter((item) => !item.ready || item.warnings.length),
    payload: unique.map((project) => mapProjectWritePayload(project, {
      customerLink: resolveProjectCustomerLink(project, relations),
      websiteLink: resolveProjectWebsiteLink(project, relations),
    })),
    validation,
  };
}

function getSupabaseWriteTest() {
  const latest = readJson(STORAGE_KEYS.lastSupabaseWriteTest, null);
  const projectLatest = readJson(STORAGE_KEYS.lastProjectWriteTest, null);
  const sessionLatest = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(`${STORAGE_KEYS.lastSupabaseWriteTest}:session`) || "null");
    } catch {
      return null;
    }
  })();
  return projectLatest || sessionLatest || latest;
}

export function canWriteProject(project = {}, context = {}) {
  const mode = context.mode || projectDataMode();
  const status = supabaseProvider.getStatus();
  const readOnly = readJson(STORAGE_KEYS.lastSupabaseReadOnlyTest, null);
  const writeTest = getSupabaseWriteTest();
  const customerLink = context.customerLink || resolveProjectCustomerLink(project);
  const websiteLink = context.websiteLink || resolveProjectWebsiteLink(project);
  const source = getProjectSource(project);
  const missing = [];
  const target = context.target || (isSupabaseProject(project) ? "supabase" : "local");
  if (target === "local") return { allowed: true, target, mode, source, missing, reason: "Lokaal project blijft localStorage.", customerLink, websiteLink };
  if ((project.isDemo || project.environment === "demo") && context.allowDemoSupabase !== true) missing.push("Demo-project mag niet naar Supabase zonder expliciete demo-Supabase context.");
  if (![CUSTOMER_DATA_MODES.SUPABASE_READ, CUSTOMER_DATA_MODES.HYBRID].includes(mode) && context.allowSupabaseInLocalMode !== true) missing.push("Project data mode is niet supabase-read of hybrid.");
  if (!status.hasUrl) missing.push("Supabase URL ontbreekt.");
  if (!status.hasAnonKey) missing.push("Supabase anon key ontbreekt.");
  if (!status.clientPackageAvailable) missing.push("Supabase client is niet geladen.");
  if (!readOnly?.success && !readOnly?.connected) missing.push("Read-only test is niet succesvol.");
  if (customerLink.status !== "linked" && context.allowOrphanProject !== true) missing.push(customerLink.message || "Project mist Supabase customer koppeling.");
  if (!["linked", "not_required"].includes(websiteLink.status) && context.allowOrphanProject !== true) missing.push(websiteLink.message || "Project mist Supabase website koppeling.");
  if (context.projectWriteTest !== true && writeTest?.status !== "completed" && writeTest?.status !== "project_completed") missing.push("Supabase write-test is niet succesvol.");
  return { allowed: missing.length === 0, target, mode, source, missing, reason: missing.join(" "), supabase: status, readOnly, writeTest, customerLink, websiteLink };
}

function logProjectWrite(action, project, metadata = {}) {
  return logActivity("projects", project?.id || metadata.projectId || "unknown", action, {
    projectId: project?.id || metadata.projectId || "",
    supabaseProjectId: project?._supabaseProjectId || project?.supabaseProjectId || metadata.supabaseProjectId || "",
    customerId: project?.customerId || metadata.customerId || "",
    websiteId: project?.websiteId || metadata.websiteId || "",
    source: getProjectSource(project),
    performedBy: "local-admin",
    timestamp: nowIso(),
    ...metadata,
  });
}

export function getProjectHistory(id) {
  return listActivitiesForEntity("projects", id).filter((activity) => [
    "project_created",
    "project_updated",
    "project_archived",
    "project_reactivated",
    "project_write_failed",
    "project_dry_run",
    "project_source_mode_changed",
  ].includes(activity.action));
}

async function assertNoConflict(id, baseUpdatedAt, options = {}) {
  const remote = await supabaseProvider.getById("projects", id);
  if (!remote) throw new Error("Supabase project bestaat niet meer of is niet bereikbaar.");
  const remoteUpdated = remote.updated_at || remote.updatedAt || "";
  if (!remoteUpdated) {
    if (!options.confirmMissingUpdatedAt) {
      const error = new Error("Supabase project mist updated_at. Bevestig gecontroleerd opslaan eerst.");
      error.code = "PROJECT_UPDATED_AT_MISSING";
      error.remote = remote;
      throw error;
    }
    return remote;
  }
  if (baseUpdatedAt && new Date(remoteUpdated).getTime() > new Date(baseUpdatedAt).getTime()) {
    const error = new Error("Supabase project is nieuwer dan de geopende detailversie. Ververs projectgegevens voordat je opslaat.");
    error.code = "PROJECT_CONFLICT";
    error.remote = remote;
    throw error;
  }
  return remote;
}

function requireProjectWrite(project = {}, options = {}) {
  const readiness = canWriteProject(project, { ...options, target: "supabase" });
  if (!readiness.allowed) {
    const error = new Error(readiness.reason || "Project write naar Supabase is geblokkeerd.");
    error.code = "PROJECT_WRITE_BLOCKED";
    error.readiness = readiness;
    throw error;
  }
  return readiness;
}

function supabaseProjectId(project = {}, fallbackId = "") {
  return project._supabaseProjectId || project.supabaseProjectId || project.id || fallbackId;
}

async function createProject(data = {}, options = {}) {
  const target = projectWriteTarget(data, options);
  if (target === "local") {
    const created = localProjectRepository.create(localProjectPayload(data));
    logProjectWrite("project_created", markProjectSource(created, getProjectSource(created)), { source: "local", changedFields: Object.keys(data).filter(Boolean), oldValues: {}, newValues: data });
    return markProjectSource(normalizeProject(created), created.isDemo || created.environment === "demo" ? "demo" : "local", { localProjectId: created.id });
  }
  try {
    const readiness = requireProjectWrite(data, options);
    const result = await supabaseProvider.createProject(mapProjectWritePayload(data, { customerLink: readiness.customerLink, websiteLink: readiness.websiteLink }), { projectWrite: true });
    const created = markProjectSource(mapSupabaseProjectToLocal(result.data), "supabase", {
      supabaseProjectId: result.data.id,
      localProjectId: data.id || data._localProjectId || "",
      linkedCustomerStatus: readiness.customerLink.status,
      linkedWebsiteStatus: readiness.websiteLink.status,
      customerSource: readiness.customerLink.customerSource,
      websiteSource: readiness.websiteLink.websiteSource,
    });
    logProjectWrite("project_created", created, { source: "supabase", supabaseProjectId: result.data.id, changedFields: Object.keys(data).filter(Boolean), oldValues: {}, newValues: data });
    return created;
  } catch (error) {
    logProjectWrite("project_write_failed", data, { action: "create", source: "supabase", error: error.message || "Project aanmaken in Supabase mislukt." });
    throw error;
  }
}

async function updateProject(id, data = {}, options = {}) {
  const oldProject = options.oldProject || data || {};
  const target = projectWriteTarget(oldProject, options);
  if (target === "local") {
    const updated = localProjectRepository.update(id, localProjectPayload(data));
    if (!updated) throw new Error("Lokaal project niet gevonden.");
    const changes = compareProjectChanges(oldProject, updated);
    logProjectWrite("project_updated", markProjectSource(updated, getProjectSource(updated)), { source: "local", changedFields: changes.changedFields, oldValues: changes.oldValues, newValues: changes.newValues });
    return markProjectSource(normalizeProject(updated), updated.isDemo || updated.environment === "demo" ? "demo" : "local", { localProjectId: updated.id });
  }
  try {
    const readiness = requireProjectWrite(oldProject, options);
    const remoteId = supabaseProjectId(oldProject, id);
    await assertNoConflict(remoteId, options.baseUpdatedAt || oldProject.updatedAt || oldProject.updated_at || "", options);
    const changes = compareProjectChanges(oldProject, data);
    const result = await supabaseProvider.updateProject(remoteId, mapProjectWritePayload({ ...oldProject, ...data, id: remoteId }, { customerLink: readiness.customerLink, websiteLink: readiness.websiteLink }), { projectWrite: true });
    const updated = markProjectSource(mapSupabaseProjectToLocal(result.data), oldProject._source === "hybrid" ? "hybrid" : "supabase", {
      supabaseProjectId: result.data.id,
      localProjectId: oldProject._localProjectId || data.id || "",
      linkedCustomerStatus: readiness.customerLink.status,
      linkedWebsiteStatus: readiness.websiteLink.status,
      customerSource: readiness.customerLink.customerSource,
      websiteSource: readiness.websiteLink.websiteSource,
    });
    logProjectWrite("project_updated", updated, { projectId: oldProject.id || updated.id, supabaseProjectId: remoteId, source: oldProject._source === "hybrid" ? "hybrid" : "supabase", changedFields: changes.changedFields, oldValues: changes.oldValues, newValues: changes.newValues });
    return updated;
  } catch (error) {
    logProjectWrite("project_write_failed", oldProject, { action: "update", source: "supabase", error: error.message || "Project bijwerken in Supabase mislukt.", supabaseProjectId: supabaseProjectId(oldProject, id) });
    throw error;
  }
}

async function archiveProject(id, options = {}) {
  const project = options.project || localProjectRepository.get(id) || {};
  const target = projectWriteTarget(project, options);
  if (target === "local") {
    const updated = localProjectRepository.update(id, { status: "gearchiveerd", archivedAt: nowIso() });
    if (!updated) throw new Error("Lokaal project niet gevonden.");
    logProjectWrite("project_archived", updated, { source: "local" });
    return markProjectSource(normalizeProject(updated), getProjectSource(updated), { localProjectId: updated.id });
  }
  try {
    requireProjectWrite(project, options);
    const remoteId = supabaseProjectId(project, id);
    await assertNoConflict(remoteId, options.baseUpdatedAt || project.updatedAt || project.updated_at || "", options);
    const result = await supabaseProvider.archiveProject(remoteId, { projectWrite: true });
    const archived = markProjectSource(mapSupabaseProjectToLocal(result.data), project._source === "hybrid" ? "hybrid" : "supabase", { supabaseProjectId: result.data.id, localProjectId: project._localProjectId || "" });
    logProjectWrite("project_archived", archived, { projectId: project.id || archived.id, supabaseProjectId: remoteId, source: project._source === "hybrid" ? "hybrid" : "supabase" });
    return archived;
  } catch (error) {
    logProjectWrite("project_write_failed", project, { action: "archive", source: "supabase", error: error.message || "Project archiveren in Supabase mislukt.", supabaseProjectId: supabaseProjectId(project, id) });
    throw error;
  }
}

async function reactivateProject(id, options = {}) {
  const project = options.project || localProjectRepository.get(id) || {};
  const target = projectWriteTarget(project, options);
  if (target === "local") {
    const updated = localProjectRepository.update(id, { status: "nieuw", archivedAt: "", deletedAt: "" });
    if (!updated) throw new Error("Lokaal project niet gevonden.");
    logProjectWrite("project_reactivated", updated, { source: "local" });
    return markProjectSource(normalizeProject(updated), getProjectSource(updated), { localProjectId: updated.id });
  }
  try {
    requireProjectWrite(project, options);
    const remoteId = supabaseProjectId(project, id);
    await assertNoConflict(remoteId, options.baseUpdatedAt || project.updatedAt || project.updated_at || "", options);
    const result = await supabaseProvider.reactivateProject(remoteId, { projectWrite: true });
    const reactivated = markProjectSource(mapSupabaseProjectToLocal(result.data), project._source === "hybrid" ? "hybrid" : "supabase", { supabaseProjectId: result.data.id, localProjectId: project._localProjectId || "" });
    logProjectWrite("project_reactivated", reactivated, { projectId: project.id || reactivated.id, supabaseProjectId: remoteId, source: project._source === "hybrid" ? "hybrid" : "supabase" });
    return reactivated;
  } catch (error) {
    logProjectWrite("project_write_failed", project, { action: "reactivate", source: "supabase", error: error.message || "Project reactiveren in Supabase mislukt.", supabaseProjectId: supabaseProjectId(project, id) });
    throw error;
  }
}

export const ProjectRepository = {
  ...localProjectRepository,
  listByDataMode,
  listLocalProjects,
  listSupabaseProjects,
  listHybridProjects,
  getProjectSource,
  mergeProjectSources,
  markProjectSource,
  createProject,
  updateProject,
  archiveProject,
  reactivateProject,
  getProjectHistory,
  compareProjectChanges,
  canWriteProject,
  list(options = {}) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) {
      return supabaseProvider.getAll("projects", { limit: options.limit || 10 }).then((rows) => rows.map(mapSupabaseProjectToLocal));
    }
    return localProjectRepository.list();
  },
  count() {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) return supabaseProvider.count("projects");
    return localProjectRepository.count();
  },
  create(data) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) throw new Error("Supabase writes zijn geblokkeerd in read-only mode.");
    return localProjectRepository.create(data);
  },
  update(id, data) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) throw new Error("Supabase writes zijn geblokkeerd in read-only mode.");
    return localProjectRepository.update(id, data);
  },
  remove(id) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) throw new Error("Supabase hard deletes zijn geblokkeerd.");
    return localProjectRepository.remove(id);
  },
};
