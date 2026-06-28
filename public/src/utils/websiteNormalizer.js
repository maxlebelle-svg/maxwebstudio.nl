function trim(value) {
  return String(value || "").trim();
}

function lower(value) {
  return trim(value).toLowerCase();
}

function normalizeTimestamp(value, fallback = "") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function normalizeDomain(value = "") {
  return lower(value)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export function normalizeWebsiteUrl(value = "", domain = "") {
  const url = trim(value);
  if (url) return url;
  return domain ? `https://${domain}` : "";
}

export function normalizeWebsiteStatus(value = "") {
  const status = lower(value).replace(/\s+/g, "_");
  if (!status) return "online";
  if (["active", "live"].includes(status)) return "online";
  if (["development", "staging", "in_ontwikkeling"].includes(status)) return "development";
  if (["maintenance", "onderhoud"].includes(status)) return "maintenance";
  if (["waiting_client", "wacht_op_klant"].includes(status)) return "waiting_client";
  if (["archived", "archive", "gearchiveerd", "inactive"].includes(status)) return "offline";
  return status;
}

export function supabaseWebsiteStatus(value = "") {
  const status = normalizeWebsiteStatus(value);
  if (status === "online") return "active";
  if (status === "offline") return "archived";
  return status;
}

export function localWebsiteStatus(value = "") {
  const status = lower(value);
  if (status === "active") return "online";
  if (status === "archived") return "offline";
  return normalizeWebsiteStatus(value);
}

export function normalizeWebsite(website = {}) {
  const now = new Date().toISOString();
  const createdAt = normalizeTimestamp(website.createdAt || website.created_at, now);
  const updatedAt = normalizeTimestamp(website.updatedAt || website.updated_at || website.lastUpdateAt || website.last_update_at, createdAt);
  const customerId = trim(website.customerId || website.profileId || website.customer_id || website.profile_id || website.customer_external_id);
  const domain = normalizeDomain(website.domain || website.domainName || website.hostname || website.url || website.liveUrl || website.live_url);
  const liveUrl = normalizeWebsiteUrl(website.liveUrl || website.live_url || website.url, domain);
  const carePackage = trim(website.carePackage || website.maintenancePackage || website.maintenancePlan || website.maintenance_plan || website.package || website.package_name);
  return {
    ...website,
    id: trim(website.id),
    externalId: trim(website.externalId || website.external_id || website.metadata?.localStorageId),
    profileId: customerId,
    customerId,
    supabaseCustomerId: trim(website.supabaseCustomerId || website.customer_id || website._supabaseCustomerId),
    projectId: trim(website.projectId || website.project_id),
    name: trim(website.name || website.title || domain || "Website"),
    domain,
    url: liveUrl,
    liveUrl,
    stagingUrl: trim(website.stagingUrl || website.staging_url),
    githubRepoUrl: trim(website.githubRepoUrl || website.github_repo_url),
    githubBranch: trim(website.githubBranch || website.github_branch || "main"),
    netlifyProjectName: trim(website.netlifyProjectName || website.netlify_project_name),
    netlifySiteId: trim(website.netlifySiteId || website.netlify_site_id),
    status: localWebsiteStatus(website.status),
    package: trim(website.package || website.packageName || website.package_name || carePackage),
    hostingPackage: trim(website.hostingPackage || website.hosting_package || website.hostingStatus || "Plus"),
    carePackage: carePackage || "Plus",
    maintenancePlan: carePackage || "Plus",
    hostingStatus: trim(website.hostingStatus || website.hosting_status || "active"),
    sslStatus: trim(website.sslStatus || website.ssl_status || "unknown"),
    lastDeployAt: normalizeTimestamp(website.lastDeployAt || website.last_deploy_at, ""),
    lastUpdateAt: normalizeTimestamp(website.lastUpdateAt || website.last_update_at, updatedAt),
    lastCheckedAt: normalizeTimestamp(website.lastCheckedAt || website.last_checked_at, ""),
    openTasks: Number.isFinite(Number(website.openTasks)) ? Math.max(0, Number(website.openTasks)) : 0,
    notes: trim(website.notes),
    customerName: trim(website.customerName),
    customerCompany: trim(website.customerCompany),
    customerEmail: lower(website.customerEmail),
    customerPhone: trim(website.customerPhone),
    isDemo: Boolean(website.isDemo || website.is_demo),
    isDemoJourney: Boolean(website.isDemoJourney || website.is_demo_journey),
    environment: trim(website.environment) || (website.isDemo || website.is_demo || website.isDemoJourney || website.is_demo_journey ? "demo" : "production"),
    demoScenarioId: trim(website.demoScenarioId || website.demo_scenario_id),
    demoJourneyId: trim(website.demoJourneyId || website.demo_journey_id),
    metadata: website.metadata && typeof website.metadata === "object" ? website.metadata : {},
    createdAt,
    updatedAt,
  };
}

export function websiteIdentityKeys(website = {}) {
  const normalized = normalizeWebsite(website);
  return {
    id: normalized.id,
    supabaseWebsiteId: normalized.supabaseWebsiteId || normalized._supabaseWebsiteId,
    externalId: normalized.externalId,
    domain: normalized.domain,
    liveUrl: lower(normalized.liveUrl),
    customerDomain: [normalized.supabaseCustomerId || normalized.customerId, normalized.domain].filter(Boolean).join("|"),
  };
}
