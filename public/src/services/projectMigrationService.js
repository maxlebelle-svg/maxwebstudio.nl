import { STORAGE_KEYS } from "../config/storageKeys.js";
import {
  listLocalProjects,
  prepareProjectsForMigration,
  validateProjectForSupabase,
  mapLocalProjectToSupabase,
  resolveProjectCustomerLink,
  resolveProjectWebsiteLink,
} from "../repositories/ProjectRepository.js";
import { logActivity } from "./activityLogService.js";

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix = "project-migration") {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function analyzeProjectData() {
  const projects = listLocalProjects();
  const prepared = prepareProjectsForMigration(projects);
  const linkedCustomers = prepared.validation.filter((item) => item.customerLink.status === "linked").length;
  const linkedWebsites = prepared.validation.filter((item) => ["linked", "not_required"].includes(item.websiteLink.status)).length;
  const waitingForCustomer = prepared.validation.filter((item) => item.customerLink.status === "waiting_customer_migration").length;
  const waitingForWebsite = prepared.validation.filter((item) => item.websiteLink.status === "waiting_website_migration").length;
  const missingCustomer = prepared.validation.filter((item) => ["missing_customer", "customer_not_found"].includes(item.customerLink.status)).length;
  const missingWebsite = prepared.validation.filter((item) => ["missing_website", "website_not_found"].includes(item.websiteLink.status)).length;
  return {
    totalProjects: projects.length,
    uniqueProjects: prepared.unique.length,
    demoProjects: projects.filter((project) => project.isDemo || project.environment === "demo").length,
    productionProjects: projects.filter((project) => !project.isDemo && project.environment !== "demo").length,
    readyCount: prepared.ready.length,
    waitingForCustomer,
    waitingForWebsite,
    missingCustomer,
    missingWebsite,
    duplicateCount: prepared.duplicates.length,
    attentionCount: prepared.attention.length,
    linkedCustomerCount: linkedCustomers,
    linkedWebsiteCount: linkedWebsites,
    prepared,
  };
}

export function getProjectMigrationPreview() {
  const analysis = analyzeProjectData();
  return {
    summary: {
      totalProjects: analysis.totalProjects,
      uniqueProjects: analysis.uniqueProjects,
      readyCount: analysis.readyCount,
      waitingForCustomer: analysis.waitingForCustomer,
      waitingForWebsite: analysis.waitingForWebsite,
      missingCustomer: analysis.missingCustomer,
      missingWebsite: analysis.missingWebsite,
      duplicateCount: analysis.duplicateCount,
    },
    rows: analysis.prepared.validation.slice(0, 20).map((item) => ({
      localId: item.normalized.id,
      name: item.normalized.name,
      customerId: item.normalized.customerId,
      websiteId: item.normalized.websiteId,
      customerStatus: item.customerLink.status,
      websiteStatus: item.websiteLink.status,
      supabaseCustomerId: item.customerLink.supabaseCustomerId,
      supabaseWebsiteId: item.websiteLink.supabaseWebsiteId,
      ready: item.ready,
      errors: item.errors,
      warnings: item.warnings,
      payload: mapLocalProjectToSupabase(item.normalized),
    })),
  };
}

export function detectDuplicateProjects() {
  return analyzeProjectData().prepared.duplicates;
}

export function detectMissingProjectFields() {
  return analyzeProjectData().prepared.validation
    .filter((item) => item.errors.length || item.warnings.length)
    .map((item) => ({
      id: item.normalized.id,
      name: item.normalized.name,
      errors: item.errors,
      warnings: item.warnings,
      customerLink: item.customerLink,
      websiteLink: item.websiteLink,
    }));
}

export function detectMissingProjectLinks() {
  return analyzeProjectData().prepared.validation
    .filter((item) => item.customerLink.status !== "linked" || !["linked", "not_required"].includes(item.websiteLink.status))
    .map((item) => ({
      id: item.normalized.id,
      name: item.normalized.name,
      customerLink: item.customerLink,
      websiteLink: item.websiteLink,
      errors: item.errors,
      warnings: item.warnings,
    }));
}

export function prepareProjectMigrationPayload(options = {}) {
  const includeWaitingForCustomer = Boolean(options.includeWaitingForCustomer);
  const includeWaitingForWebsite = Boolean(options.includeWaitingForWebsite);
  const projects = listLocalProjects();
  const prepared = prepareProjectsForMigration(projects);
  const validation = prepared.validation.filter((item) => (
    item.ready
    || (includeWaitingForCustomer && item.customerLink.status === "waiting_customer_migration")
    || (includeWaitingForWebsite && item.websiteLink.status === "waiting_website_migration")
  ) && item.canDryRun);
  return {
    targetTable: "projects",
    total: projects.length,
    readyCount: prepared.ready.length,
    waitingForCustomerCount: prepared.waitingForCustomer.length,
    waitingForWebsiteCount: prepared.waitingForWebsite.length,
    skippedCount: prepared.validation.length - validation.length,
    payload: validation.map((item) => mapLocalProjectToSupabase(item.normalized)),
    validation,
  };
}

export function runProjectMigrationDryRun(options = {}) {
  const dryRun = {
    id: createId("project-dry-run"),
    type: "project_migration_dry_run",
    createdAt: new Date().toISOString(),
    options,
    analysis: analyzeProjectData(),
    preview: getProjectMigrationPreview(),
    duplicates: detectDuplicateProjects(),
    missingFields: detectMissingProjectFields(),
    missingLinks: detectMissingProjectLinks(),
    payloadSummary: prepareProjectMigrationPayload(options),
    status: "completed",
    liveWrite: false,
    message: "Dry-run voltooid. Er zijn geen projecten naar Supabase geschreven.",
  };
  writeJson(STORAGE_KEYS.lastProjectMigrationDryRun, dryRun);
  logActivity("projects", dryRun.id, "project_dry_run", {
    readyCount: dryRun.analysis.readyCount,
    waitingForCustomer: dryRun.analysis.waitingForCustomer,
    waitingForWebsite: dryRun.analysis.waitingForWebsite,
    duplicateCount: dryRun.analysis.duplicateCount,
    missingCustomer: dryRun.analysis.missingCustomer,
    missingWebsite: dryRun.analysis.missingWebsite,
  });
  return dryRun;
}

export function getProjectMigrationWritePreview(options = {}) {
  const payload = prepareProjectMigrationPayload(options);
  return {
    targetTable: "projects",
    writeEnabled: false,
    reason: "Live projectmigratie volgt later. Deze preview schrijft niets.",
    readyCount: payload.readyCount,
    waitingForCustomerCount: payload.waitingForCustomerCount,
    waitingForWebsiteCount: payload.waitingForWebsiteCount,
    skippedCount: payload.skippedCount,
    preview: payload.payload.slice(0, 12),
    lastDryRun: readJson(STORAGE_KEYS.lastProjectMigrationDryRun, null),
  };
}

export function getProjectReadinessSummary() {
  const analysis = analyzeProjectData();
  const lastDryRun = readJson(STORAGE_KEYS.lastProjectMigrationDryRun, null);
  return {
    ready: analysis.readyCount,
    waitingForCustomer: analysis.waitingForCustomer,
    waitingForWebsite: analysis.waitingForWebsite,
    missingCustomer: analysis.missingCustomer,
    missingWebsite: analysis.missingWebsite,
    duplicates: analysis.duplicateCount,
    missingFields: analysis.attentionCount,
    lastDryRun,
    validation: analysis.prepared.validation,
  };
}

export function inspectProjectLinks(project = {}) {
  const customerLink = resolveProjectCustomerLink(project);
  const websiteLink = resolveProjectWebsiteLink(project);
  const validation = validateProjectForSupabase(project);
  return { customerLink, websiteLink, validation };
}
