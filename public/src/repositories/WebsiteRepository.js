import { CUSTOMER_DATA_MODES, getCurrentProviderType, PROVIDERS } from "../config/environment.js";
import { PRIMARY_MODULE_KEYS, STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { logActivity, listActivitiesForEntity } from "../services/activityLogService.js";
import {
  normalizeWebsite,
  websiteIdentityKeys,
  supabaseWebsiteStatus,
  localWebsiteStatus,
} from "../utils/websiteNormalizer.js";
import { listLocalCustomers, getCustomerSource } from "./CustomerRepository.js";
import { createRepository } from "./createRepository.js";

const localWebsiteRepository = createRepository(PRIMARY_MODULE_KEYS.websites);

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

function websiteDataMode() {
  return readJson(STORAGE_KEYS.settings, {})?.websiteDataMode
    || localStorage.getItem(STORAGE_KEYS.websiteDataMode)
    || CUSTOMER_DATA_MODES.LOCAL;
}

function isSupabaseWebsite(website = {}) {
  return ["supabase", "hybrid"].includes(website._source) || Boolean(website._supabaseWebsiteId || website.supabaseWebsiteId);
}

function websiteWriteTarget(website = {}, options = {}) {
  if (options.target) return options.target;
  if (options.forceLocal || website.isDemo || website.environment === "demo") return "local";
  return isSupabaseWebsite(website) ? "supabase" : "local";
}

function localWebsitePayload(website = {}) {
  return normalizeWebsite({
    ...website,
    status: localWebsiteStatus(website.status),
  });
}

function sourceLabel(website = {}) {
  if (website.isDemo || website.isDemoJourney || website.environment === "demo") return "demo";
  return website._source || "local";
}

export function markWebsiteSource(website = {}, source = "local", extra = {}) {
  return {
    ...website,
    _source: sourceLabel({ ...website, _source: source }),
    _isMigrated: Boolean(website.supabaseWebsiteId || website.migratedToSupabaseAt || extra.supabaseWebsiteId),
    _supabaseWebsiteId: extra.supabaseWebsiteId || website.supabaseWebsiteId || website.id || "",
    _localWebsiteId: extra.localWebsiteId || website._localWebsiteId || website.metadata?.localStorageId || "",
    _customerSource: extra.customerSource || website._customerSource || "",
    _linkedCustomerStatus: extra.linkedCustomerStatus || website._linkedCustomerStatus || "",
    _sourceMeta: {
      ...(website._sourceMeta || {}),
      ...extra,
    },
  };
}

export function getWebsiteSource(website = {}) {
  return sourceLabel(website);
}

function localWebsitesFromStorage() {
  const sourceKeys = [STORAGE_KEYS.managedSites, STORAGE_KEYS.websites];
  const seen = new Set();
  return sourceKeys
    .flatMap((sourceKey) => readArray(sourceKey).map((website) => ({ ...website, _localSourceKey: sourceKey })))
    .map(normalizeWebsite)
    .filter((website) => {
      const keys = websiteIdentityKeys(website);
      const key = keys.id || keys.domain || keys.liveUrl;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function listLocalWebsites() {
  return localWebsitesFromStorage().map((website) => markWebsiteSource(website, website.isDemo || website.environment === "demo" ? "demo" : "local", {
    localWebsiteId: website.id,
    supabaseWebsiteId: website.supabaseWebsiteId || "",
  }));
}

export async function listSupabaseWebsites() {
  const rows = await supabaseProvider.getAll("websites", { limit: 100 });
  return rows.map((row) => markWebsiteSource(mapSupabaseWebsiteToLocal(row), "supabase", {
    supabaseWebsiteId: row.id,
    localWebsiteId: row.metadata?.localStorageId || row.external_id || "",
  }));
}

function mergeSupabaseWithLocal(localWebsite, supabaseWebsite, reason = "supabase_match") {
  return markWebsiteSource({
    ...localWebsite,
    ...supabaseWebsite,
    id: localWebsite.id || supabaseWebsite.id,
    profileId: localWebsite.profileId || supabaseWebsite.profileId,
    customerId: localWebsite.customerId || supabaseWebsite.customerId,
    createdAt: supabaseWebsite.createdAt || localWebsite.createdAt,
    updatedAt: supabaseWebsite.updatedAt || localWebsite.updatedAt,
  }, "hybrid", {
    reason,
    localWebsiteId: localWebsite.id || "",
    supabaseWebsiteId: supabaseWebsite.id || localWebsite.supabaseWebsiteId || "",
  });
}

export function mergeWebsiteSources(localWebsites = [], supabaseWebsites = []) {
  const merged = [];
  const duplicateMerges = [];
  const usedLocalIds = new Set();
  const localBySupabaseId = new Map();
  const localByDomain = new Map();
  localWebsites.forEach((website) => {
    const normalized = normalizeWebsite(website);
    const keys = websiteIdentityKeys(normalized);
    if (normalized.supabaseWebsiteId) localBySupabaseId.set(String(normalized.supabaseWebsiteId), normalized);
    if (keys.domain) localByDomain.set(keys.domain, normalized);
  });
  supabaseWebsites.forEach((website) => {
    const normalized = normalizeWebsite(website);
    const keys = websiteIdentityKeys(normalized);
    const localMatch = localBySupabaseId.get(String(normalized.id)) || (keys.domain ? localByDomain.get(keys.domain) : null);
    if (localMatch) {
      usedLocalIds.add(localMatch.id);
      const reason = localMatch.supabaseWebsiteId === normalized.id ? "supabaseWebsiteId" : "domain";
      duplicateMerges.push({ reason, localWebsiteId: localMatch.id, supabaseWebsiteId: normalized.id, domain: normalized.domain });
      merged.push(mergeSupabaseWithLocal(localMatch, normalized, reason));
      return;
    }
    merged.push(markWebsiteSource(normalized, "supabase", { supabaseWebsiteId: normalized.id }));
  });
  localWebsites.map(normalizeWebsite).forEach((website) => {
    if (usedLocalIds.has(website.id)) return;
    if (website.supabaseWebsiteId && !website.isDemo && website.environment !== "demo") return;
    merged.push(markWebsiteSource(website, website.isDemo || website.environment === "demo" ? "demo" : "local", {
      localWebsiteId: website.id,
      supabaseWebsiteId: website.supabaseWebsiteId || "",
    }));
  });
  return {
    websites: merged,
    duplicateMerges,
    counts: {
      local: localWebsites.length,
      supabase: supabaseWebsites.length,
      hybrid: merged.length,
      duplicateMerges: duplicateMerges.length,
      demo: merged.filter((website) => getWebsiteSource(website) === "demo").length,
      unmigratedLocal: merged.filter((website) => getWebsiteSource(website) === "local" && !website._isMigrated).length,
    },
  };
}

export async function listHybridWebsites() {
  const localWebsites = listLocalWebsites();
  const supabaseWebsites = await listSupabaseWebsites();
  return mergeWebsiteSources(localWebsites, supabaseWebsites);
}

export async function listByDataMode(mode = CUSTOMER_DATA_MODES.LOCAL) {
  if (mode === CUSTOMER_DATA_MODES.SUPABASE_READ) {
    const websites = await listSupabaseWebsites();
    return {
      mode,
      websites,
      counts: { local: listLocalWebsites().length, supabase: websites.length, hybrid: websites.length, duplicateMerges: 0, demo: 0, unmigratedLocal: 0 },
      fallbackUsed: false,
      error: "",
      refreshedAt: nowIso(),
    };
  }
  if (mode === CUSTOMER_DATA_MODES.HYBRID) {
    try {
      const merged = await listHybridWebsites();
      return { mode, ...merged, fallbackUsed: false, error: "", refreshedAt: nowIso() };
    } catch (error) {
      const websites = listLocalWebsites();
      return {
        mode,
        websites,
        counts: {
          local: websites.length,
          supabase: 0,
          hybrid: websites.length,
          duplicateMerges: 0,
          demo: websites.filter((website) => getWebsiteSource(website) === "demo").length,
          unmigratedLocal: websites.filter((website) => getWebsiteSource(website) === "local" && !website._isMigrated).length,
        },
        duplicateMerges: [],
        fallbackUsed: true,
        error: error.message || "Supabase websites konden niet worden gelezen.",
        refreshedAt: nowIso(),
      };
    }
  }
  const websites = listLocalWebsites();
  return {
    mode: CUSTOMER_DATA_MODES.LOCAL,
    websites,
    counts: {
      local: websites.length,
      supabase: 0,
      hybrid: websites.length,
      duplicateMerges: 0,
      demo: websites.filter((website) => getWebsiteSource(website) === "demo").length,
      unmigratedLocal: websites.filter((website) => getWebsiteSource(website) === "local" && !website._isMigrated).length,
    },
    duplicateMerges: [],
    fallbackUsed: false,
    error: "",
    refreshedAt: nowIso(),
  };
}

export function compareWebsiteChanges(oldWebsite = {}, newWebsite = {}) {
  const fields = ["profileId", "name", "domain", "liveUrl", "stagingUrl", "githubRepoUrl", "githubBranch", "netlifyProjectName", "netlifySiteId", "status", "hostingPackage", "carePackage", "sslStatus", "lastDeployAt", "lastUpdateAt", "openTasks", "notes"];
  const changedFields = [];
  const oldValues = {};
  const newValues = {};
  fields.forEach((field) => {
    const oldValue = oldWebsite[field] ?? "";
    const newValue = newWebsite[field] ?? "";
    if (String(oldValue) === String(newValue)) return;
    changedFields.push(field);
    oldValues[field] = oldValue;
    newValues[field] = newValue;
  });
  return { changedFields, oldValues, newValues };
}

function customerLookup() {
  const local = listLocalCustomers();
  const localById = new Map(local.map((customer) => [customer.id, customer]));
  const localBySupabaseId = new Map(local.filter((customer) => customer.supabaseCustomerId || customer._supabaseCustomerId).map((customer) => [customer.supabaseCustomerId || customer._supabaseCustomerId, customer]));
  return { local, localById, localBySupabaseId };
}

export function resolveWebsiteCustomerLink(website = {}, customers = null) {
  const normalized = normalizeWebsite(website);
  const lookup = customers || customerLookup();
  const localCustomer = lookup.localById?.get(normalized.customerId) || lookup.localById?.get(normalized.profileId) || null;
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
  if (!normalized.customerId && !normalized.profileId) {
    return { status: "missing_customer", localCustomer: null, localCustomerId: "", supabaseCustomerId: "", customerSource: "", message: "Website mist klantkoppeling." };
  }
  if (localCustomer) {
    return { status: "waiting_customer_migration", localCustomer, localCustomerId: localCustomer.id, supabaseCustomerId: "", customerSource: getCustomerSource(localCustomer), message: "Klant bestaat lokaal, maar heeft nog geen Supabase customer ID." };
  }
  return { status: "customer_not_found", localCustomer: null, localCustomerId: normalized.customerId || normalized.profileId, supabaseCustomerId: "", customerSource: "", message: "Gekoppelde klant niet gevonden." };
}

function mapWebsiteWritePayload(website = {}, options = {}) {
  const normalized = normalizeWebsite(website);
  const link = options.customerLink || resolveWebsiteCustomerLink(normalized);
  return {
    external_id: normalized.externalId || normalized._localWebsiteId || normalized.id || null,
    customer_id: link.supabaseCustomerId || normalized.supabaseCustomerId || null,
    customer_external_id: normalized.customerId || normalized.profileId || null,
    project_id: normalized.projectId || null,
    name: normalized.name || null,
    domain: normalized.domain || null,
    url: normalized.liveUrl || null,
    live_url: normalized.liveUrl || null,
    staging_url: normalized.stagingUrl || null,
    github_repo_url: normalized.githubRepoUrl || null,
    github_branch: normalized.githubBranch || "main",
    netlify_project_name: normalized.netlifyProjectName || null,
    netlify_site_id: normalized.netlifySiteId || null,
    status: supabaseWebsiteStatus(normalized.status),
    package_name: normalized.package || normalized.carePackage || null,
    maintenance_plan: normalized.maintenancePlan || normalized.carePackage || null,
    hosting_package: normalized.hostingPackage || null,
    hosting_status: normalized.hostingStatus || null,
    ssl_status: normalized.sslStatus || null,
    last_deploy_at: normalized.lastDeployAt || null,
    last_update_at: normalized.lastUpdateAt || null,
    notes: normalized.notes || null,
    is_demo: Boolean(normalized.isDemo),
    is_demo_journey: Boolean(normalized.isDemoJourney),
    environment: normalized.environment || (normalized.isDemo || normalized.isDemoJourney ? "demo" : "production"),
    demo_scenario_id: normalized.demoScenarioId || null,
    demo_journey_id: normalized.demoJourneyId || null,
    source: "crm",
    metadata: {
      ...(normalized.metadata || {}),
      localStorageId: normalized._localWebsiteId || normalized.id || normalized.metadata?.localStorageId || "",
      localCustomerId: normalized.customerId || normalized.profileId || "",
      customerLinkStatus: link.status,
      lastWebsiteWriteContext: "crm_website_write",
    },
  };
}

export function mapLocalWebsiteToSupabase(website = {}) {
  return mapWebsiteWritePayload(website);
}

export function mapSupabaseWebsiteToLocal(row = {}) {
  return normalizeWebsite({
    id: row.id,
    externalId: row.external_id,
    profileId: row.customer_external_id || row.metadata?.localCustomerId || "",
    customerId: row.customer_external_id || row.metadata?.localCustomerId || "",
    supabaseCustomerId: row.customer_id,
    projectId: row.project_id,
    name: row.name,
    domain: row.domain,
    liveUrl: row.live_url || row.url,
    stagingUrl: row.staging_url,
    githubRepoUrl: row.github_repo_url,
    githubBranch: row.github_branch,
    netlifyProjectName: row.netlify_project_name,
    netlifySiteId: row.netlify_site_id,
    status: row.status,
    package: row.package_name,
    maintenancePlan: row.maintenance_plan,
    hostingPackage: row.hosting_package,
    hostingStatus: row.hosting_status,
    sslStatus: row.ssl_status,
    lastDeployAt: row.last_deploy_at,
    lastUpdateAt: row.last_update_at,
    notes: row.notes,
    isDemo: row.is_demo,
    isDemoJourney: row.is_demo_journey,
    environment: row.environment,
    demoScenarioId: row.demo_scenario_id,
    demoJourneyId: row.demo_journey_id,
    supabaseWebsiteId: row.id,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function validateWebsiteForSupabase(website = {}, customers = null) {
  const normalized = normalizeWebsite(website);
  const warnings = [];
  const errors = [];
  if (!normalized.id) errors.push("Website mist id.");
  if (!normalized.name) errors.push("Website mist naam.");
  if (!normalized.customerId && !normalized.profileId) errors.push("Website mist klantkoppeling.");
  if (!normalized.domain && !normalized.liveUrl) errors.push("Website mist domein/live URL.");
  if (normalized.liveUrl && !/^https?:\/\//i.test(normalized.liveUrl)) errors.push("Live URL moet beginnen met http:// of https://.");
  if (!normalized.status) warnings.push("Website mist status.");
  if (!normalized.createdAt) warnings.push("Website mist createdAt.");
  if (!normalized.updatedAt) warnings.push("Website mist updatedAt.");
  if ((normalized.isDemo || normalized.isDemoJourney || normalized.environment === "demo") && !normalized.demoScenarioId && !normalized.demoJourneyId) warnings.push("Demo-website mist demoScenarioId/demoJourneyId.");
  const customerLink = resolveWebsiteCustomerLink(normalized, customers);
  if (["missing_customer", "customer_not_found"].includes(customerLink.status)) errors.push(customerLink.message);
  if (customerLink.status === "waiting_customer_migration") warnings.push(customerLink.message);
  return {
    id: normalized.id,
    ready: errors.length === 0 && customerLink.status === "linked",
    canDryRun: errors.length === 0,
    errors,
    warnings,
    customerLink,
    normalized,
  };
}

export function prepareWebsitesForMigration(websites = []) {
  const customers = customerLookup();
  const seenDomains = new Map();
  const unique = [];
  const duplicates = [];
  websites.forEach((website) => {
    const normalized = normalizeWebsite(website);
    const keys = websiteIdentityKeys(normalized);
    if (keys.domain && seenDomains.has(keys.domain)) {
      duplicates.push({ key: keys.domain, website: normalized, duplicateOf: seenDomains.get(keys.domain) });
      return;
    }
    if (keys.domain) seenDomains.set(keys.domain, normalized.id);
    unique.push(normalized);
  });
  const validation = unique.map((website) => validateWebsiteForSupabase(website, customers));
  return {
    total: websites.length,
    unique,
    duplicates,
    ready: validation.filter((item) => item.ready),
    waitingForCustomer: validation.filter((item) => item.customerLink.status === "waiting_customer_migration"),
    attention: validation.filter((item) => !item.ready || item.warnings.length),
    payload: unique.map((website) => mapWebsiteWritePayload(website, { customerLink: resolveWebsiteCustomerLink(website, customers) })),
    validation,
  };
}

function getSupabaseWriteTest() {
  const latest = readJson(STORAGE_KEYS.lastSupabaseWriteTest, null);
  const websiteLatest = readJson(STORAGE_KEYS.lastWebsiteWriteTest, null);
  const sessionLatest = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(`${STORAGE_KEYS.lastSupabaseWriteTest}:session`) || "null");
    } catch {
      return null;
    }
  })();
  return websiteLatest || sessionLatest || latest;
}

export function canWriteWebsite(website = {}, context = {}) {
  const mode = context.mode || websiteDataMode();
  const status = supabaseProvider.getStatus();
  const readOnly = readJson(STORAGE_KEYS.lastSupabaseReadOnlyTest, null);
  const writeTest = getSupabaseWriteTest();
  const customerLink = context.customerLink || resolveWebsiteCustomerLink(website);
  const source = getWebsiteSource(website);
  const missing = [];
  const target = context.target || (isSupabaseWebsite(website) ? "supabase" : "local");
  if (target === "local") return { allowed: true, target, mode, source, missing, reason: "Lokale website blijft localStorage.", customerLink };
  if ((website.isDemo || website.environment === "demo") && context.allowDemoSupabase !== true) missing.push("Demo-website mag niet naar Supabase zonder expliciete demo-Supabase context.");
  if (![CUSTOMER_DATA_MODES.SUPABASE_READ, CUSTOMER_DATA_MODES.HYBRID].includes(mode) && context.allowSupabaseInLocalMode !== true) missing.push("Website data mode is niet supabase-read of hybrid.");
  if (!status.hasUrl) missing.push("Supabase URL ontbreekt.");
  if (!status.hasAnonKey) missing.push("Supabase anon key ontbreekt.");
  if (!status.clientPackageAvailable) missing.push("Supabase client is niet geladen.");
  if (!readOnly?.success && !readOnly?.connected) missing.push("Read-only test is niet succesvol.");
  if (customerLink.status !== "linked" && context.allowOrphanWebsite !== true) missing.push(customerLink.message || "Website mist Supabase customer koppeling.");
  if (context.websiteWriteTest !== true && writeTest?.status !== "completed" && writeTest?.status !== "website_completed") missing.push("Supabase write-test is niet succesvol.");
  return { allowed: missing.length === 0, target, mode, source, missing, reason: missing.join(" "), supabase: status, readOnly, writeTest, customerLink };
}

function logWebsiteWrite(action, website, metadata = {}) {
  return logActivity("websites", website?.id || metadata.websiteId || "unknown", action, {
    websiteId: website?.id || metadata.websiteId || "",
    supabaseWebsiteId: website?._supabaseWebsiteId || website?.supabaseWebsiteId || metadata.supabaseWebsiteId || "",
    customerId: website?.customerId || website?.profileId || metadata.customerId || "",
    source: getWebsiteSource(website),
    performedBy: "local-admin",
    timestamp: nowIso(),
    ...metadata,
  });
}

export function getWebsiteHistory(id) {
  return listActivitiesForEntity("websites", id).filter((activity) => [
    "website_created",
    "website_updated",
    "website_archived",
    "website_reactivated",
    "website_write_failed",
    "website_dry_run",
    "website_source_mode_changed",
  ].includes(activity.action));
}

async function assertNoConflict(id, baseUpdatedAt, options = {}) {
  const remote = await supabaseProvider.getById("websites", id);
  if (!remote) throw new Error("Supabase website bestaat niet meer of is niet bereikbaar.");
  const remoteUpdated = remote.updated_at || remote.updatedAt || "";
  if (!remoteUpdated) {
    if (!options.confirmMissingUpdatedAt) {
      const error = new Error("Supabase website mist updated_at. Bevestig gecontroleerd opslaan eerst.");
      error.code = "WEBSITE_UPDATED_AT_MISSING";
      error.remote = remote;
      throw error;
    }
    return remote;
  }
  if (baseUpdatedAt && new Date(remoteUpdated).getTime() > new Date(baseUpdatedAt).getTime()) {
    const error = new Error("Supabase website is nieuwer dan de geopende detailversie. Ververs websitegegevens voordat je opslaat.");
    error.code = "WEBSITE_CONFLICT";
    error.remote = remote;
    throw error;
  }
  return remote;
}

function requireWebsiteWrite(website = {}, options = {}) {
  const readiness = canWriteWebsite(website, { ...options, target: "supabase" });
  if (!readiness.allowed) {
    const error = new Error(readiness.reason || "Website write naar Supabase is geblokkeerd.");
    error.code = "WEBSITE_WRITE_BLOCKED";
    error.readiness = readiness;
    throw error;
  }
  return readiness;
}

function supabaseWebsiteId(website = {}, fallbackId = "") {
  return website._supabaseWebsiteId || website.supabaseWebsiteId || website.id || fallbackId;
}

async function createWebsite(data = {}, options = {}) {
  const target = websiteWriteTarget(data, options);
  if (target === "local") {
    const created = localWebsiteRepository.create(localWebsitePayload(data));
    logWebsiteWrite("website_created", markWebsiteSource(created, getWebsiteSource(created)), { source: "local", changedFields: Object.keys(data).filter(Boolean), oldValues: {}, newValues: data });
    return markWebsiteSource(normalizeWebsite(created), created.isDemo || created.environment === "demo" ? "demo" : "local", { localWebsiteId: created.id });
  }
  try {
    const readiness = requireWebsiteWrite(data, options);
    const result = await supabaseProvider.createWebsite(mapWebsiteWritePayload(data, { customerLink: readiness.customerLink }), { websiteWrite: true });
    const created = markWebsiteSource(mapSupabaseWebsiteToLocal(result.data), "supabase", {
      supabaseWebsiteId: result.data.id,
      localWebsiteId: data.id || data._localWebsiteId || "",
      linkedCustomerStatus: readiness.customerLink.status,
      customerSource: readiness.customerLink.customerSource,
    });
    logWebsiteWrite("website_created", created, { source: "supabase", supabaseWebsiteId: result.data.id, changedFields: Object.keys(data).filter(Boolean), oldValues: {}, newValues: data });
    return created;
  } catch (error) {
    logWebsiteWrite("website_write_failed", data, { action: "create", source: "supabase", error: error.message || "Website aanmaken in Supabase mislukt." });
    throw error;
  }
}

async function updateWebsite(id, data = {}, options = {}) {
  const oldWebsite = options.oldWebsite || data || {};
  const target = websiteWriteTarget(oldWebsite, options);
  if (target === "local") {
    const updated = localWebsiteRepository.update(id, localWebsitePayload(data));
    if (!updated) throw new Error("Lokale website niet gevonden.");
    const changes = compareWebsiteChanges(oldWebsite, updated);
    logWebsiteWrite("website_updated", markWebsiteSource(updated, getWebsiteSource(updated)), { source: "local", changedFields: changes.changedFields, oldValues: changes.oldValues, newValues: changes.newValues });
    return markWebsiteSource(normalizeWebsite(updated), updated.isDemo || updated.environment === "demo" ? "demo" : "local", { localWebsiteId: updated.id });
  }
  try {
    const readiness = requireWebsiteWrite(oldWebsite, options);
    const remoteId = supabaseWebsiteId(oldWebsite, id);
    await assertNoConflict(remoteId, options.baseUpdatedAt || oldWebsite.updatedAt || oldWebsite.updated_at || "", options);
    const changes = compareWebsiteChanges(oldWebsite, data);
    const result = await supabaseProvider.updateWebsite(remoteId, mapWebsiteWritePayload({ ...oldWebsite, ...data, id: remoteId }, { customerLink: readiness.customerLink }), { websiteWrite: true });
    const updated = markWebsiteSource(mapSupabaseWebsiteToLocal(result.data), oldWebsite._source === "hybrid" ? "hybrid" : "supabase", {
      supabaseWebsiteId: result.data.id,
      localWebsiteId: oldWebsite._localWebsiteId || data.id || "",
      linkedCustomerStatus: readiness.customerLink.status,
      customerSource: readiness.customerLink.customerSource,
    });
    logWebsiteWrite("website_updated", updated, { websiteId: oldWebsite.id || updated.id, supabaseWebsiteId: remoteId, source: oldWebsite._source === "hybrid" ? "hybrid" : "supabase", changedFields: changes.changedFields, oldValues: changes.oldValues, newValues: changes.newValues });
    return updated;
  } catch (error) {
    logWebsiteWrite("website_write_failed", oldWebsite, { action: "update", source: "supabase", error: error.message || "Website bijwerken in Supabase mislukt.", supabaseWebsiteId: supabaseWebsiteId(oldWebsite, id) });
    throw error;
  }
}

async function archiveWebsite(id, options = {}) {
  const website = options.website || localWebsiteRepository.get(id) || {};
  const target = websiteWriteTarget(website, options);
  if (target === "local") {
    const updated = localWebsiteRepository.update(id, { status: "offline", archivedAt: nowIso() });
    if (!updated) throw new Error("Lokale website niet gevonden.");
    logWebsiteWrite("website_archived", updated, { source: "local" });
    return markWebsiteSource(normalizeWebsite(updated), getWebsiteSource(updated), { localWebsiteId: updated.id });
  }
  try {
    requireWebsiteWrite(website, options);
    const remoteId = supabaseWebsiteId(website, id);
    await assertNoConflict(remoteId, options.baseUpdatedAt || website.updatedAt || website.updated_at || "", options);
    const result = await supabaseProvider.archiveWebsite(remoteId, { websiteWrite: true });
    const archived = markWebsiteSource(mapSupabaseWebsiteToLocal(result.data), website._source === "hybrid" ? "hybrid" : "supabase", { supabaseWebsiteId: result.data.id, localWebsiteId: website._localWebsiteId || "" });
    logWebsiteWrite("website_archived", archived, { websiteId: website.id || archived.id, supabaseWebsiteId: remoteId, source: website._source === "hybrid" ? "hybrid" : "supabase" });
    return archived;
  } catch (error) {
    logWebsiteWrite("website_write_failed", website, { action: "archive", source: "supabase", error: error.message || "Website archiveren in Supabase mislukt.", supabaseWebsiteId: supabaseWebsiteId(website, id) });
    throw error;
  }
}

async function reactivateWebsite(id, options = {}) {
  const website = options.website || localWebsiteRepository.get(id) || {};
  const target = websiteWriteTarget(website, options);
  if (target === "local") {
    const updated = localWebsiteRepository.update(id, { status: "online", archivedAt: "", deletedAt: "" });
    if (!updated) throw new Error("Lokale website niet gevonden.");
    logWebsiteWrite("website_reactivated", updated, { source: "local" });
    return markWebsiteSource(normalizeWebsite(updated), getWebsiteSource(updated), { localWebsiteId: updated.id });
  }
  try {
    requireWebsiteWrite(website, options);
    const remoteId = supabaseWebsiteId(website, id);
    await assertNoConflict(remoteId, options.baseUpdatedAt || website.updatedAt || website.updated_at || "", options);
    const result = await supabaseProvider.reactivateWebsite(remoteId, { websiteWrite: true });
    const reactivated = markWebsiteSource(mapSupabaseWebsiteToLocal(result.data), website._source === "hybrid" ? "hybrid" : "supabase", { supabaseWebsiteId: result.data.id, localWebsiteId: website._localWebsiteId || "" });
    logWebsiteWrite("website_reactivated", reactivated, { websiteId: website.id || reactivated.id, supabaseWebsiteId: remoteId, source: website._source === "hybrid" ? "hybrid" : "supabase" });
    return reactivated;
  } catch (error) {
    logWebsiteWrite("website_write_failed", website, { action: "reactivate", source: "supabase", error: error.message || "Website reactiveren in Supabase mislukt.", supabaseWebsiteId: supabaseWebsiteId(website, id) });
    throw error;
  }
}

export const WebsiteRepository = {
  ...localWebsiteRepository,
  listByDataMode,
  listLocalWebsites,
  listSupabaseWebsites,
  listHybridWebsites,
  getWebsiteSource,
  mergeWebsiteSources,
  markWebsiteSource,
  createWebsite,
  updateWebsite,
  archiveWebsite,
  reactivateWebsite,
  getWebsiteHistory,
  compareWebsiteChanges,
  canWriteWebsite,
  list(options = {}) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) {
      return supabaseProvider.getAll("websites", { limit: options.limit || 10 }).then((rows) => rows.map(mapSupabaseWebsiteToLocal));
    }
    return localWebsiteRepository.list();
  },
  count() {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) return supabaseProvider.count("websites");
    return localWebsiteRepository.count();
  },
  create(data) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) throw new Error("Supabase writes zijn geblokkeerd in read-only mode.");
    return localWebsiteRepository.create(data);
  },
  update(id, data) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) throw new Error("Supabase writes zijn geblokkeerd in read-only mode.");
    return localWebsiteRepository.update(id, data);
  },
  remove(id) {
    if (getCurrentProviderType() === PROVIDERS.SUPABASE_READONLY) throw new Error("Supabase hard deletes zijn geblokkeerd.");
    return localWebsiteRepository.remove(id);
  },
};
