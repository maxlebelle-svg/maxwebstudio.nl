import { getSupabaseConfig } from "../config/supabaseConfig.js";
import { getSession } from "./supabaseAuthProvider.js";

const AUTH_CONFIG_ENDPOINT = "/.netlify/functions/client-auth-config";

const WEBSITE_PROJECT_STATES = Object.freeze({
  LOADING: "loading",
  FOUND: "found",
  MISSING: "missing",
  ERROR: "error",
});

function safeString(value = "") {
  return String(value || "").trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && safeString(value) !== "") || "";
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePublicConfig(config = {}) {
  return {
    url: safeString(config.supabaseUrl || config.SUPABASE_URL || config.url).replace(/\/$/, ""),
    anonKey: safeString(config.supabaseAnonKey || config.SUPABASE_ANON_KEY || config.anonKey),
  };
}

function isSafeSupabaseUrl(value = "") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function publicConfigReady(config = {}) {
  return Boolean(isSafeSupabaseUrl(config.url) && config.anonKey);
}

function sanitizeMessage(value = "") {
  return safeString(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/apikey['":\s]+[A-Za-z0-9._-]+/gi, "apikey [redacted]");
}

async function getRuntimePublicConfig() {
  let endpointConfig = {};
  try {
    const response = await fetch(AUTH_CONFIG_ENDPOINT, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) endpointConfig = await response.json();
  } catch {
    endpointConfig = {};
  }

  return normalizePublicConfig({
    ...getSupabaseConfig(),
    ...(window.__MAXWEBSTUDIO_SUPABASE_CONFIG__ || {}),
    ...endpointConfig,
  });
}

async function supabaseRestGet(config, session, table, query) {
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || `${table} kon niet worden gelezen.`);
    error.status = response.status;
    error.table = table;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

function mapWebsite(row = {}) {
  const status = firstValue(row.status, row.publish_status, "online");
  const maintenancePlan = firstValue(row.maintenance_plan, row.maintenanceStatus, row.maintenance_status, row.care_package, row.hosting_package);
  return {
    id: safeString(row.id),
    customerId: safeString(firstValue(row.customer_id, row.customerId, row.profile_id)),
    projectId: safeString(firstValue(row.project_id, row.projectId)),
    name: firstValue(row.name, row.title, row.domain, "Mijn website"),
    domain: firstValue(row.domain, row.website_url, row.url, row.live_url),
    liveUrl: firstValue(row.live_url, row.url, row.domain),
    status,
    hostingPackage: firstValue(row.hosting_package, row.hostingPackage, maintenancePlan),
    carePackage: firstValue(row.care_package, row.carePackage, maintenancePlan),
    maintenanceStatus: firstValue(row.maintenance_status, row.maintenanceStatus, maintenancePlan ? "actief" : ""),
    maintenancePlan,
    publishStatus: firstValue(row.publish_status, row.publishStatus, status),
    sslStatus: firstValue(row.ssl_status, row.sslStatus, row.security_status, "actief"),
    safetyStatus: firstValue(row.safety_status, row.security_status, row.ssl_status, "actief"),
    backupStatus: firstValue(row.backup_status, row.backupStatus, row.last_backup_at ? "actief" : ""),
    lastBackupAt: firstValue(row.last_backup_at, row.lastBackupAt),
    lastCheckedAt: firstValue(row.last_checked_at, row.lastCheckedAt),
    lastDeployAt: firstValue(row.last_deploy_at, row.lastDeployAt),
    updatedAt: firstValue(row.updated_at, row.updatedAt, row.last_checked_at, row.last_deploy_at),
    previewImage: firstValue(row.preview_image, row.previewImage, row.screenshot_url, row.thumbnail_url, row.image_url),
    screenshotUrl: firstValue(row.screenshot_url, row.screenshotUrl, row.preview_image),
    thumbnailUrl: firstValue(row.thumbnail_url, row.thumbnailUrl, row.preview_image),
    heroTitle: firstValue(row.hero_title, row.heroTitle, row.title),
    description: firstValue(row.description, row.public_description, row.notes),
    category: firstValue(row.category, row.industry, row.sector),
    seoNotes: firstValue(row.seo_notes, row.seoNotes, row.notes),
    seoScore: numberValue(firstValue(row.seo_score, row.seoScore), 0),
    performanceScore: numberValue(firstValue(row.performance_score, row.performanceScore, row.speed_score), 0),
    source: "supabase-website-project",
  };
}

function mapProject(row = {}) {
  return {
    id: safeString(row.id),
    customerId: safeString(firstValue(row.customer_id, row.customerId, row.profile_id)),
    websiteId: safeString(firstValue(row.website_id, row.websiteId)),
    name: firstValue(row.name, row.project_name, row.title, "Website project"),
    projectName: firstValue(row.project_name, row.name, row.title, "Website project"),
    status: firstValue(row.status, "in_ontwikkeling"),
    phase: firstValue(row.phase, row.current_phase, row.stage),
    progress: numberValue(firstValue(row.progress, row.progress_percent), 0),
    startDate: firstValue(row.start_date, row.startDate),
    deadline: firstValue(row.deadline, row.due_date),
    publicNotes: firstValue(row.public_notes, row.client_visible_notes, row.notes),
    updatedAt: firstValue(row.updated_at, row.updatedAt),
    source: "supabase-website-project",
  };
}

function result(state, overrides = {}) {
  return {
    state,
    loading: state === WEBSITE_PROJECT_STATES.LOADING,
    found: state === WEBSITE_PROJECT_STATES.FOUND,
    fallbackAllowed: state !== WEBSITE_PROJECT_STATES.FOUND,
    websites: [],
    projects: [],
    source: "supabase-website-project-context",
    message: "",
    error: "",
    ...overrides,
  };
}

export async function getClientWebsiteProjectContext(customerContext = {}) {
  try {
    const customerId = safeString(customerContext.supabaseCustomerId || customerContext.customerId || customerContext.customer?.id);
    if (!customerId) {
      return result(WEBSITE_PROJECT_STATES.MISSING, {
        message: "Geen customer_id beschikbaar voor website/project data.",
      });
    }

    const sessionResult = await getSession();
    const session = sessionResult?.session;
    if (!session?.access_token) {
      return result(WEBSITE_PROJECT_STATES.MISSING, {
        message: "Geen actieve Supabase Auth-sessie gevonden.",
      });
    }

    const config = await getRuntimePublicConfig();
    if (!publicConfigReady(config)) {
      return result(WEBSITE_PROJECT_STATES.MISSING, {
        message: "Publieke Supabase website/projectconfiguratie is nog niet beschikbaar.",
      });
    }

    const websiteQuery = new URLSearchParams({
      customer_id: `eq.${customerId}`,
      select: "*",
      order: "updated_at.desc",
      limit: "10",
    });
    const projectQuery = new URLSearchParams({
      customer_id: `eq.${customerId}`,
      select: "*",
      order: "updated_at.desc",
      limit: "10",
    });

    const [websiteRows, projectRows] = await Promise.all([
      supabaseRestGet(config, session, "websites", websiteQuery.toString()),
      supabaseRestGet(config, session, "projects", projectQuery.toString()),
    ]);

    const websites = websiteRows.map(mapWebsite);
    const projects = projectRows.map(mapProject);
    if (!websites.length && !projects.length) {
      return result(WEBSITE_PROJECT_STATES.MISSING, {
        message: "Geen websites of projecten gevonden voor deze klant.",
      });
    }

    return result(WEBSITE_PROJECT_STATES.FOUND, {
      websites,
      projects,
      message: "Website- en projectgegevens gevonden via Supabase.",
    });
  } catch (error) {
    return result(WEBSITE_PROJECT_STATES.ERROR, {
      message: "Website- en projectgegevens konden niet veilig worden opgehaald.",
      error: sanitizeMessage(error?.message || "Onbekende fout."),
    });
  }
}

export function getClientWebsiteProjectContextStates() {
  return WEBSITE_PROJECT_STATES;
}

export const clientWebsiteProjectContextService = {
  getClientWebsiteProjectContext,
  getClientWebsiteProjectContextStates,
};
