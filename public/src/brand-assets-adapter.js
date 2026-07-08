"use strict";

const BRANDING_KEY = "maxwebstudioBrandCenter";
const ACTIVITY_KEY = "maxwebstudioActivityLog";
const NOTIFICATION_KEY = "maxwebstudioClientPortalNotifications";
const FACTORY_BRANDING_KEY = "maxwebstudioWebsiteFactoryBrandingQueue";

export const LOGO_WORKFLOW_STATUSES = ["not_started", "generating", "generated", "customer_review", "approved", "rejected", "linked_to_factory"];

export const BRANDING_EVENTS = {
  logoRequested: "logo_requested",
  logoGenerated: "logo_generated",
  logoSelected: "logo_selected",
  logoUploaded: "logo_uploaded",
  brandingUpdated: "branding_updated",
  brandingApproved: "branding_approved",
  brandingSentToFactory: "branding_sent_to_factory",
};

const assetVariants = [
  ["svg", "SVG"],
  ["png", "PNG"],
  ["transparent", "Transparant"],
  ["dark", "Donkere versie"],
  ["light", "Lichte versie"],
  ["favicon", "Favicon"],
  ["social-avatar", "Social avatar"],
  ["monochrome", "Monochroom"],
];

export function loadBrandingState() {
  const parsed = readJson(BRANDING_KEY, {});
  return normalizeBrandingState(parsed);
}

export function saveBrandingState(state) {
  const normalized = normalizeBrandingState(state);
  writeJson(BRANDING_KEY, normalized);
  return normalized;
}

export function buildBrandingBriefing(input = {}) {
  const onboarding = input.onboarding?.answers || input.onboarding || {};
  const company = onboarding.company || {};
  const branding = onboarding.branding || input.branding || {};
  return {
    companyName: clean(input.companyName || company.companyName || input.businessName || input.company || ""),
    industry: clean(input.industry || company.industry || onboarding.industry || ""),
    audience: clean(input.audience || branding.targetAudience || onboarding.targetAudience || ""),
    toneOfVoice: clean(input.toneOfVoice || branding.toneOfVoice || onboarding.toneOfVoice || ""),
    desiredStyle: clean(input.desiredStyle || input.styleChoice || branding.lookAndFeel || branding.desiredStyle || "premium"),
    colors: clean(input.colors || input.colorChoice || branding.colors || ""),
    examples: clean(input.examples || branding.exampleWebsites || ""),
    slogan: clean(input.slogan || branding.slogan || ""),
    source: clean(input.source || "Logo Studio"),
  };
}

export function upsertBrandingProject(input = {}) {
  const state = loadBrandingState();
  const briefing = buildBrandingBriefing(input);
  const id = clean(input.id || input.projectId || input.customerId || slug(briefing.companyName) || `branding-${Date.now()}`);
  const existing = state.projects.find((project) => project.id === id) || {};
  const project = {
    ...existing,
    id,
    customerId: clean(input.customerId || existing.customerId),
    projectId: clean(input.projectId || existing.projectId || id),
    companyName: briefing.companyName || existing.companyName || "Klant",
    briefing: { ...(existing.briefing || {}), ...briefing },
    status: clean(input.status || existing.status || "not_started"),
    colors: normalizeColors(input.colors || existing.colors || briefing.colors),
    typography: clean(input.typography || existing.typography || input.fontPreference || ""),
    iconStyle: clean(input.iconStyle || existing.iconStyle || "lijniconen"),
    version: Number(existing.version || 0) + 1,
    updatedAt: new Date().toISOString(),
    createdAt: existing.createdAt || new Date().toISOString(),
  };
  state.projects = [project, ...state.projects.filter((item) => item.id !== id)];
  saveBrandingState(state);
  recordBrandingActivity(BRANDING_EVENTS.brandingUpdated, project, "Branding bijgewerkt", "De brandinggegevens zijn bijgewerkt.", "info");
  return project;
}

export function registerLogoConcepts({ project, concepts = [] } = {}) {
  const target = upsertBrandingProject({ ...(project || {}), status: "generated" });
  const state = loadBrandingState();
  const rows = concepts.map((concept, index) => normalizeLogoAsset(concept, target, index));
  state.logoAssets = [...rows, ...state.logoAssets.filter((asset) => asset.projectId !== target.id || !rows.some((row) => row.id === asset.id))];
  state.projects = state.projects.map((item) => item.id === target.id ? { ...item, status: "customer_review", logoWorkflowStatus: "customer_review", updatedAt: new Date().toISOString() } : item);
  saveBrandingState(state);
  recordBrandingActivity(BRANDING_EVENTS.logoRequested, target, "Logo aangevraagd", "Er is een briefing klaargezet voor logo-concepten.", "info");
  recordBrandingActivity(BRANDING_EVENTS.logoGenerated, target, "Logo gereed", "Er staan logo-concepten klaar voor review.", "success");
  recordBrandingNotification("Logo gereed", `${target.companyName} kan logo-concepten reviewen.`, "success");
  recordBrandingNotification("Branding wacht op review", `${target.companyName} heeft branding klaarstaan.`, "warning");
  return rows;
}

export function selectLogoConcept(projectId, conceptId) {
  const state = loadBrandingState();
  const project = state.projects.find((item) => item.id === projectId) || {};
  state.logoAssets = state.logoAssets.map((asset) => asset.projectId === projectId ? { ...asset, status: asset.id === conceptId ? "selected" : asset.status === "selected" ? "generated" : asset.status } : asset);
  state.projects = state.projects.map((item) => item.id === projectId ? { ...item, selectedLogoId: conceptId, status: "customer_review", logoWorkflowStatus: "customer_review", updatedAt: new Date().toISOString() } : item);
  saveBrandingState(state);
  recordBrandingActivity(BRANDING_EVENTS.logoSelected, { ...project, id: projectId }, "Logo gekozen", "Een logo-concept is als favoriet gemarkeerd.", "info");
}

export function approveBranding(projectId) {
  const state = loadBrandingState();
  const project = state.projects.find((item) => item.id === projectId) || {};
  const selectedLogo = state.logoAssets.find((asset) => asset.projectId === projectId && ["selected", "approved"].includes(asset.status)) || state.logoAssets.find((asset) => asset.projectId === projectId);
  const now = new Date().toISOString();
  state.logoAssets = state.logoAssets.map((asset) => asset.projectId === projectId && asset.id === selectedLogo?.id ? { ...asset, status: "approved", approvedAt: now } : asset);
  state.projects = state.projects.map((item) => item.id === projectId ? { ...item, status: "approved", logoWorkflowStatus: "approved", approvedAt: now, updatedAt: now } : item);
  saveBrandingState(state);
  recordBrandingActivity(BRANDING_EVENTS.brandingApproved, project, "Branding goedgekeurd", "De branding is goedgekeurd en klaar voor Website Factory.", "success");
  recordBrandingNotification("Branding goedgekeurd", `${project.companyName || "Klant"} is klaar voor Website Factory.`, "success");
  return linkBrandingToFactory(projectId);
}

export function linkBrandingToFactory(projectId) {
  const state = loadBrandingState();
  const project = state.projects.find((item) => item.id === projectId) || {};
  const logo = state.logoAssets.find((asset) => asset.projectId === projectId && asset.status === "approved") || state.logoAssets.find((asset) => asset.projectId === projectId);
  const payload = {
    projectId,
    customerId: project.customerId || "",
    companyName: project.companyName || "",
    primaryColor: project.colors[0] || project.briefing?.colors || "",
    secondaryColor: project.colors[1] || "",
    accentColor: project.colors[2] || "",
    typography: project.typography || project.briefing?.fontPreference || "Inter",
    iconStyle: project.iconStyle || "lijniconen",
    logo,
    metadata: {
      brandingStatus: "linked_to_factory",
      approvedAt: project.approvedAt || new Date().toISOString(),
      variants: assetVariants.map(([key, label]) => ({ key, label, prepared: Boolean(logo) })),
    },
    linkedAt: new Date().toISOString(),
  };
  const queue = readArray(FACTORY_BRANDING_KEY);
  writeJson(FACTORY_BRANDING_KEY, [payload, ...queue.filter((item) => item.projectId !== projectId)]);
  state.projects = state.projects.map((item) => item.id === projectId ? { ...item, status: "linked_to_factory", logoWorkflowStatus: "linked_to_factory", factoryLinkedAt: payload.linkedAt, updatedAt: payload.linkedAt } : item);
  saveBrandingState(state);
  recordBrandingActivity(BRANDING_EVENTS.brandingSentToFactory, project, "Branding gekoppeld aan Website Factory", "Kleuren, typografie, iconstijl en logo zijn doorgezet.", "success");
  recordBrandingNotification("Branding gekoppeld aan Website Factory", `${project.companyName || "Klant"} is doorgestuurd naar Website Factory.`, "success");
  return payload;
}

export function registerUploadedLogo(fileLike = {}, projectInput = {}) {
  const project = upsertBrandingProject({ ...projectInput, status: "customer_review" });
  const asset = normalizeLogoAsset({
    id: fileLike.id || `logo-upload-${Date.now()}`,
    label: fileLike.name || "Geupload logo",
    companyName: project.companyName,
    previewUrl: fileLike.previewUrl || fileLike.url || "",
    format: (fileLike.type || fileLike.name || "upload").split(".").pop(),
    status: "selected",
  }, project, 0);
  const state = loadBrandingState();
  state.logoAssets = [asset, ...state.logoAssets.filter((item) => item.id !== asset.id)];
  saveBrandingState(state);
  recordBrandingActivity(BRANDING_EVENTS.logoUploaded, project, "Logo geupload", "Er is een logo toegevoegd aan de brandingomgeving.", "success");
  return asset;
}

export function getBrandAssets(clientId = "") {
  const state = loadBrandingState();
  const project = clientId ? state.projects.find((item) => [item.id, item.customerId, item.projectId].includes(clientId)) : state.projects[0];
  return Promise.resolve({
    success: true,
    clientId,
    brandAssets: {
      logo: state.logoAssets.find((asset) => asset.projectId === project?.id && ["approved", "selected"].includes(asset.status)) || state.logoAssets[0] || null,
      colors: project?.colors || [],
      fonts: [project?.typography || "Inter"].filter(Boolean),
      images: state.logoAssets.filter((asset) => asset.projectId === project?.id),
      copy: [],
      slogans: [project?.briefing?.slogan].filter(Boolean),
      brandGuidelines: project || null,
    },
  });
}

export function listAssets(type = "all") {
  const state = loadBrandingState();
  const assets = type === "all" ? state.logoAssets : state.logoAssets.filter((asset) => asset.type === type || asset.logoType === type);
  return Promise.resolve({ success: true, type, assets });
}

export function saveAsset(asset) {
  const state = loadBrandingState();
  const row = { id: asset?.id || `asset-${Date.now()}`, updatedAt: new Date().toISOString(), ...asset };
  state.logoAssets = [row, ...state.logoAssets.filter((item) => item.id !== row.id)];
  saveBrandingState(state);
  return Promise.resolve({ success: true, asset: row });
}

export function markAssetAsApproved(assetId) {
  const state = loadBrandingState();
  state.logoAssets = state.logoAssets.map((asset) => asset.id === assetId ? { ...asset, status: "approved", approvedAt: new Date().toISOString() } : asset);
  saveBrandingState(state);
  return Promise.resolve({ success: true, assetId, status: "Goedgekeurd" });
}

export function linkAssetToProduct(assetId, productId) {
  const state = loadBrandingState();
  const asset = state.logoAssets.find((item) => item.id === assetId);
  const payload = linkBrandingToFactory(productId || asset?.projectId || "");
  return Promise.resolve({ success: true, assetId, productId, payload });
}

export function getBrandingInsights() {
  const state = loadBrandingState();
  const withoutBranding = state.projects.filter((item) => ["not_started", "rejected"].includes(item.status));
  const withoutLogo = state.projects.filter((item) => !state.logoAssets.some((asset) => asset.projectId === item.id));
  const waitingReview = state.projects.filter((item) => item.status === "customer_review");
  const readyForFactory = state.projects.filter((item) => item.status === "approved");
  return { withoutBranding, withoutLogo, waitingReview, readyForFactory, generatedToday: state.logoAssets.filter(isToday).length, approvalsToday: state.projects.filter((item) => isToday(item.approvedAt)).length };
}

function normalizeBrandingState(value = {}) {
  return {
    brandProfile: value.brandProfile && typeof value.brandProfile === "object" ? value.brandProfile : {},
    logoAssets: Array.isArray(value.logoAssets) ? value.logoAssets : [],
    brandKit: value.brandKit && typeof value.brandKit === "object" ? value.brandKit : {},
    printAssets: Array.isArray(value.printAssets) ? value.printAssets : [],
    projects: Array.isArray(value.projects) ? value.projects : [],
  };
}

function normalizeLogoAsset(concept = {}, project = {}, index = 0) {
  const id = clean(concept.id || `${project.id || "branding"}-logo-${index + 1}`);
  const palette = Array.isArray(concept.palette) ? concept.palette : normalizeColors(project.colors);
  return {
    id,
    projectId: project.id,
    customerId: project.customerId || "",
    type: "logo",
    logoType: concept.logoType || "logo",
    assetName: concept.label || concept.assetName || `Logo concept ${index + 1}`,
    title: concept.label || concept.assetName || `Logo concept ${index + 1}`,
    companyName: project.companyName || concept.companyName || "",
    status: concept.status || "generated",
    format: String(concept.format || "SVG").toUpperCase(),
    previewUrl: concept.previewUrl || "",
    palette,
    variants: assetVariants.map(([key, label]) => ({ key, label, prepared: true })),
    briefing: project.briefing || {},
    updatedAt: new Date().toISOString(),
    createdAt: concept.createdAt || new Date().toISOString(),
  };
}

function recordBrandingActivity(eventType, project = {}, title, description, severity = "info") {
  const event = {
    id: `${eventType}-${Date.now()}`,
    eventType,
    event_type: eventType,
    module: "branding",
    severity,
    title,
    description,
    customerId: project.customerId || "",
    projectId: project.projectId || project.id || "",
    isGlobal: true,
    createdAt: new Date().toISOString(),
    metadata: { projectId: project.id || "", companyName: project.companyName || "" },
  };
  writeJson(ACTIVITY_KEY, [event, ...readArray(ACTIVITY_KEY)].slice(0, 200));
  return event;
}

function recordBrandingNotification(title, message, severity = "info") {
  const notification = {
    id: `branding-notification-${Date.now()}`,
    title,
    message,
    description: message,
    severity,
    status: "unread",
    module: "branding",
    createdAt: new Date().toISOString(),
  };
  writeJson(NOTIFICATION_KEY, [notification, ...readArray(NOTIFICATION_KEY)].slice(0, 200));
  return notification;
}

function normalizeColors(value) {
  if (Array.isArray(value)) return value.filter(Boolean).slice(0, 5);
  return String(value || "").split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
}

function readArray(key) {
  const value = readJson(key, []);
  return Array.isArray(value) ? value : [];
}

function readJson(key, fallback) {
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

function isToday(item = {}) {
  const value = typeof item === "string" ? item : item.updatedAt || item.createdAt || "";
  return value && new Date(value).toDateString() === new Date().toDateString();
}

function slug(value = "") {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function clean(value = "") {
  return String(value || "").trim();
}
