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

function normalizeDate(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return trim(value);
  return date.toISOString().slice(0, 10);
}

export function normalizeProjectStatus(value = "") {
  const status = lower(value).replace(/\s+/g, "_");
  if (!status) return "nieuw";
  if (["new"].includes(status)) return "nieuw";
  if (["design", "ontwerp"].includes(status)) return "in_ontwerp";
  if (["development", "in_development"].includes(status)) return "in_ontwikkeling";
  if (["testing", "test"].includes(status)) return "testen";
  if (["active"].includes(status)) return "onboarding";
  if (["maintenance"].includes(status)) return "onderhoud";
  if (["paused"].includes(status)) return "gepauzeerd";
  if (["archived", "archive", "gearchiveerd", "inactive"].includes(status)) return "gearchiveerd";
  return status;
}

export function supabaseProjectStatus(value = "") {
  const status = normalizeProjectStatus(value);
  if (status === "gearchiveerd") return "archived";
  if (status === "nieuw") return "new";
  return status;
}

export function localProjectStatus(value = "") {
  const status = lower(value);
  if (status === "archived") return "gearchiveerd";
  if (status === "new") return "nieuw";
  if (status === "active") return "onboarding";
  return normalizeProjectStatus(value);
}

export function normalizeProject(project = {}) {
  const now = new Date().toISOString();
  const createdAt = normalizeTimestamp(project.createdAt || project.created_at, now);
  const updatedAt = normalizeTimestamp(project.updatedAt || project.updated_at || project.lastUpdateAt || project.last_update_at, createdAt);
  const customerId = trim(project.customerId || project.profileId || project.customer_id || project.profile_id || project.customer_external_id);
  const websiteId = trim(project.websiteId || project.website_id || project.website_external_id);
  const name = trim(project.name || project.projectName || project.project_name || project.title);
  const type = trim(project.type || project.projectType || project.project_type || project.category);
  const budgetValue = project.budget ?? project.budgetAmount ?? project.budget_amount ?? "";
  return {
    ...project,
    id: trim(project.id),
    externalId: trim(project.externalId || project.external_id || project.metadata?.localStorageId),
    profileId: customerId,
    customerId,
    supabaseCustomerId: trim(project.supabaseCustomerId || project.customer_id || project._supabaseCustomerId),
    websiteId,
    supabaseWebsiteId: trim(project.supabaseWebsiteId || project.website_id || project._supabaseWebsiteId),
    name: name || "Project",
    projectName: name || "Project",
    type: type || "Nieuwe website",
    projectType: type || "Nieuwe website",
    status: localProjectStatus(project.status),
    phase: trim(project.phase || project.fase || project.current_phase || "Intake"),
    progress: Number.isFinite(Number(project.progress)) ? Math.max(0, Math.min(100, Number(project.progress))) : 0,
    startDate: normalizeDate(project.startDate || project.start_date),
    deadline: normalizeDate(project.deadline || project.expectedDeliveryDate || project.expected_delivery_date),
    expectedDeliveryDate: normalizeDate(project.expectedDeliveryDate || project.expected_delivery_date || project.deadline),
    completedAt: normalizeTimestamp(project.completedAt || project.completed_at, ""),
    priority: trim(project.priority || "normaal"),
    budget: Number.isFinite(Number(budgetValue)) ? Number(budgetValue) : 0,
    package: trim(project.package || project.packageName || project.package_name),
    notes: trim(project.notes),
    internalNotes: trim(project.internalNotes || project.internal_notes || project.notes),
    clientVisibleNotes: trim(project.clientVisibleNotes || project.client_visible_notes),
    checklist: Array.isArray(project.checklist) ? project.checklist : [],
    tasks: Array.isArray(project.tasks) ? project.tasks : [],
    timeline: Array.isArray(project.timeline) ? project.timeline : [],
    customerName: trim(project.customerName),
    customerCompany: trim(project.customerCompany),
    customerEmail: lower(project.customerEmail),
    customerPhone: trim(project.customerPhone),
    websiteName: trim(project.websiteName),
    websiteDomain: trim(project.websiteDomain),
    isDemo: Boolean(project.isDemo || project.is_demo),
    isDemoJourney: Boolean(project.isDemoJourney || project.is_demo_journey),
    environment: trim(project.environment) || (project.isDemo || project.is_demo || project.isDemoJourney || project.is_demo_journey ? "demo" : "production"),
    demoScenarioId: trim(project.demoScenarioId || project.demo_scenario_id),
    demoJourneyId: trim(project.demoJourneyId || project.demo_journey_id),
    metadata: project.metadata && typeof project.metadata === "object" ? project.metadata : {},
    createdAt,
    updatedAt,
    lastUpdateAt: normalizeTimestamp(project.lastUpdateAt || project.last_update_at, updatedAt),
  };
}

export function projectIdentityKeys(project = {}) {
  const normalized = normalizeProject(project);
  const projectName = lower(normalized.name);
  return {
    id: normalized.id,
    supabaseProjectId: normalized.supabaseProjectId || normalized._supabaseProjectId,
    externalId: normalized.externalId,
    customerWebsiteName: [normalized.supabaseCustomerId || normalized.customerId, normalized.supabaseWebsiteId || normalized.websiteId, projectName].filter(Boolean).join("|"),
    customerName: [normalized.supabaseCustomerId || normalized.customerId, projectName].filter(Boolean).join("|"),
  };
}
