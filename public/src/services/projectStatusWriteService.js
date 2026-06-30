import { ENVIRONMENTS, PROVIDERS, getCurrentEnvironment, getCurrentProviderType } from "../config/environment.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { supabaseProvider } from "../providers/supabaseProvider.js";
import { normalizeProject } from "../utils/projectNormalizer.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_TO_SUPABASE_STATUS = Object.freeze({
  nieuw: "new",
  onboarding: "onboarding",
  in_ontwerp: "design",
  in_ontwikkeling: "development",
  feedback: "feedback",
  testen: "testing",
  live: "live",
  onderhoud: "maintenance",
  gepauzeerd: "paused",
  gearchiveerd: "archived",
});
const SUPABASE_TO_LOCAL_STATUS = Object.freeze({
  new: "nieuw",
  onboarding: "onboarding",
  design: "in_ontwerp",
  development: "in_ontwikkeling",
  feedback: "feedback",
  testing: "testen",
  live: "live",
  maintenance: "onderhoud",
  paused: "gepauzeerd",
  archived: "gearchiveerd",
});
const ALLOWED_UPDATE_KEYS = new Set(["status", "phase", "progress"]);

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

function readArray(key) {
  if (!storageAvailable()) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeArray(key, value = []) {
  if (!storageAvailable()) return value;
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function writeStatus(status = {}) {
  if (!storageAvailable()) return status;
  const payload = {
    ...status,
    checkedAt: status.checkedAt || nowIso(),
  };
  localStorage.setItem(STORAGE_KEYS.lastProjectStatusWriteStatus, JSON.stringify(payload));
  return payload;
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

function remoteProjectId(project = {}) {
  const id = String(project._supabaseProjectId || project.supabaseProjectId || project._supabaseId || project.id || "").trim();
  return isUuid(id) ? id : "";
}

function localProjectId(project = {}) {
  return String(project._localProjectId || project.metadata?.localStorageId || project.externalId || project.id || "").trim();
}

function normalizeProgress(value) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function normalizeStatus(value = "") {
  const normalized = normalizeProject({ status: value }).status;
  return LOCAL_TO_SUPABASE_STATUS[normalized] ? normalized : "";
}

function blockedUpdateKeys(updates = {}) {
  return Object.keys(updates).filter((key) => !ALLOWED_UPDATE_KEYS.has(key));
}

function saveProjectStatusLocally(project = {}, updates = {}) {
  const normalized = normalizeProject(project);
  const localId = localProjectId(normalized);
  const records = readArray(STORAGE_KEYS.projects);
  const nextProject = normalizeProject({
    ...normalized,
    ...updates,
    status: normalizeStatus(updates.status || normalized.status) || normalized.status,
    progress: normalizeProgress(updates.progress ?? normalized.progress),
    updatedAt: nowIso(),
    lastUpdateAt: nowIso(),
    metadata: {
      ...(normalized.metadata || {}),
      projectStatusWriteFallbackAt: nowIso(),
    },
  });
  const next = records.map((item) => String(item.id) === String(localId || normalized.id) ? nextProject : item);
  if (!next.some((item) => String(item.id) === String(nextProject.id))) next.unshift(nextProject);
  writeArray(STORAGE_KEYS.projects, next);
  return nextProject;
}

function mapSupabaseRecordToLocalProject(record = {}, fallback = {}) {
  return normalizeProject({
    ...fallback,
    id: record.id || fallback.id,
    status: SUPABASE_TO_LOCAL_STATUS[record.status] || record.status || fallback.status,
    phase: record.phase || fallback.phase,
    progress: record.progress ?? fallback.progress,
    updatedAt: record.updated_at || fallback.updatedAt,
    lastUpdateAt: record.updated_at || fallback.lastUpdateAt,
    metadata: record.metadata && typeof record.metadata === "object" ? record.metadata : fallback.metadata,
    _source: fallback._source === "hybrid" ? "hybrid" : "supabase",
    _supabaseProjectId: record.id || fallback._supabaseProjectId || fallback.supabaseProjectId,
    _localProjectId: fallback._localProjectId || fallback.metadata?.localStorageId || "",
  });
}

export function getProjectStatusWriteReadiness() {
  const providerMode = getCurrentProviderType();
  const environment = getCurrentEnvironment();
  const browserFlag = typeof window !== "undefined" && window.__MAXWEBSTUDIO_PROJECT_STATUS_WRITE__ === true;
  const flagEnabled = readFlag(STORAGE_KEYS.projectStatusWriteEnabled) || browserFlag;
  const supabaseStatus = supabaseProvider.getStatus();
  const missing = [];
  if (providerMode !== PROVIDERS.SUPABASE_WRITE_TEST) missing.push("Provider mode moet supabase-write-test zijn.");
  if (!flagEnabled) missing.push(`${STORAGE_KEYS.projectStatusWriteEnabled}=true ontbreekt.`);
  if (environment === ENVIRONMENTS.PRODUCTION) missing.push("Productieomgeving blokkeert project status write MVP.");
  if (!supabaseStatus.configured) missing.push("Supabase URL/anon key ontbreekt in runtime-config.");

  const allowed = missing.length === 0;
  return {
    allowed,
    missing,
    providerMode,
    environment,
    flagEnabled,
    supabaseConfigured: Boolean(supabaseStatus.configured),
    mode: "project_status_update_only",
    writesEnabled: allowed,
    table: "projects",
    restrictions: [
      "status/phase/progress only",
      "geen create/delete/archive",
      "geen ownership/customer_id updates",
      "local fallback actief",
    ],
  };
}

export function validateProjectStatusWritePayload(project = {}, updates = {}) {
  const normalized = normalizeProject(project);
  const blocked = blockedUpdateKeys(updates);
  const status = normalizeStatus(updates.status ?? normalized.status);
  const phase = String(updates.phase ?? normalized.phase ?? "").trim().slice(0, 120);
  const progress = normalizeProgress(updates.progress ?? normalized.progress);
  const errors = [];
  if (!normalized.id) errors.push("Project id ontbreekt.");
  if (blocked.length) errors.push(`Projectstatus write accepteert alleen status, phase en progress. Geblokkeerd: ${blocked.join(", ")}.`);
  if (!status) errors.push("Projectstatus is ongeldig.");
  if (!phase || phase.length < 2) errors.push("Projectfase is verplicht en moet minimaal 2 tekens bevatten.");
  return {
    valid: errors.length === 0,
    errors,
    project: normalized,
    updates: { status, phase, progress },
  };
}

export function mapProjectStatusToSupabasePayload(updates = {}, project = {}) {
  const existingMetadata = project.metadata && typeof project.metadata === "object" ? project.metadata : {};
  return {
    status: LOCAL_TO_SUPABASE_STATUS[updates.status],
    phase: updates.phase,
    progress: updates.progress,
    updated_at: nowIso(),
    metadata: {
      ...existingMetadata,
      updatedBy: "project-status-write-mvp",
      safeToArchive: true,
      clientWritePhase: "35-2A",
      localProjectId: localProjectId(project),
      lastProjectStatusWriteAt: nowIso(),
    },
  };
}

export async function saveProjectStatusWithWriteFallback(project = {}, updates = {}) {
  const validation = validateProjectStatusWritePayload(project, updates);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(" "));
    error.validationErrors = validation.errors;
    throw error;
  }

  const readiness = getProjectStatusWriteReadiness();
  const projectId = remoteProjectId(validation.project);
  if (!readiness.allowed || !projectId) {
    const localProject = saveProjectStatusLocally(validation.project, validation.updates);
    writeStatus({
      status: "fallback_local",
      fallbackUsed: true,
      reason: !projectId ? "Remote project id ontbreekt of is geen UUID." : readiness.missing.join(" "),
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      projectId: localProject.id,
    });
    return { project: localProject, fallbackUsed: true, status: "fallback_local", readiness };
  }

  try {
    const payload = mapProjectStatusToSupabasePayload(validation.updates, validation.project);
    const result = await supabaseProvider.updateProjectStatus(projectId, payload, { projectWrite: true });
    const localMirror = mapSupabaseRecordToLocalProject(result.data, validation.project);
    writeStatus({
      status: "supabase_updated",
      fallbackUsed: false,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      projectId: localMirror.id,
      supabaseProjectId: result.data?.id || "",
    });
    return { project: localMirror, fallbackUsed: false, status: "supabase_updated", readiness, result };
  } catch (error) {
    const localProject = saveProjectStatusLocally(validation.project, validation.updates);
    writeStatus({
      status: "fallback_after_supabase_error",
      fallbackUsed: true,
      providerMode: readiness.providerMode,
      environment: readiness.environment,
      projectId: localProject.id,
      error: error.message || "Supabase projectstatus write is mislukt.",
    });
    return { project: localProject, fallbackUsed: true, status: "fallback_after_supabase_error", readiness, error };
  }
}
