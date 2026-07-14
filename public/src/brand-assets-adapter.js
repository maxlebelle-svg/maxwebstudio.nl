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
  brandingAssetCreated: "branding_asset_created",
  brandingAssetUpdated: "branding_asset_updated",
  printRequested: "print_requested",
  printReady: "print_ready",
  printOrdered: "print_ordered",
  printDelivered: "print_delivered",
};

const assetVariants = [
  ["svg", "SVG"],
  ["png", "PNG"],
  ["pdf", "PDF"],
  ["transparent", "Transparant"],
  ["black", "Zwart"],
  ["white", "Wit"],
  ["monochrome", "Monochroom"],
  ["favicon", "Favicon"],
  ["apple-touch-icon", "Apple Touch Icon"],
  ["social-avatar", "Social avatar"],
];

const socialAssets = [
  ["instagram-profile", "Instagram profielfoto"],
  ["facebook-profile", "Facebook profielfoto"],
  ["linkedin-profile", "LinkedIn profielfoto"],
  ["x-profile", "X profiel"],
  ["youtube-profile", "YouTube profiel"],
  ["tiktok-profile", "TikTok profiel"],
  ["linkedin-banner", "LinkedIn banner"],
  ["facebook-cover", "Facebook cover"],
  ["youtube-banner", "YouTube banner"],
  ["instagram-highlight-covers", "Instagram highlight covers"],
];

const printCategories = [
  "Visitekaartjes",
  "Briefpapier",
  "Enveloppen",
  "Flyers",
  "Folders",
  "Brochures",
  "Roll-up banners",
  "Posters",
  "Stickers",
  "Kleding",
  "Voertuigbelettering",
  "Spandoeken",
  "Cadeaubonnen",
  "Cadeaukaarten",
  "Presentatiemappen",
  "Notitieblokken",
  "Offertemappen",
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
  prepareBrandingLibrary(projectId);
  preparePrintProposals(projectId);
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
      socialAssets: socialAssets.map(([key, label]) => ({ key, label, prepared: true })),
      downloads: buildDownloadAssets(project, logo),
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

export function prepareBrandingLibrary(projectId) {
  const state = loadBrandingState();
  const project = state.projects.find((item) => item.id === projectId) || {};
  const logo = state.logoAssets.find((asset) => asset.projectId === projectId && ["approved", "selected"].includes(asset.status)) || state.logoAssets.find((asset) => asset.projectId === projectId);
  const downloadAssets = buildDownloadAssets(project, logo);
  const socialKit = socialAssets.map(([key, label]) => assetRecord({ project, key, label, type: "social", category: "Social Media", status: "ready" }));
  const marketingKit = [
    ["brand-guide", "Branding handleiding"],
    ["email-header", "E-mail header"],
    ["email-footer", "E-mail footer"],
    ["button-style", "Button stijl"],
    ["marketing-cover", "Marketing cover"],
  ].map(([key, label]) => assetRecord({ project, key, label, type: "marketing", category: "Marketing", status: "ready" }));
  const emailBranding = [
    ["email-signature", "E-mailhandtekening"],
    ["email-logo", "E-mail logo"],
    ["email-colors", "E-mail kleuren"],
  ].map(([key, label]) => assetRecord({ project, key, label, type: "email", category: "E-mail", status: "ready" }));
  const merged = mergeAssets(state.brandingAssets, [...downloadAssets, ...socialKit, ...marketingKit, ...emailBranding]);
  state.brandingAssets = merged;
  state.downloadAssets = mergeAssets(state.downloadAssets, downloadAssets);
  state.socialAssets = mergeAssets(state.socialAssets, socialKit);
  state.marketingAssets = mergeAssets(state.marketingAssets, marketingKit);
  state.emailAssets = mergeAssets(state.emailAssets, emailBranding);
  state.versions = [
    { id: `version-${projectId}-${Date.now()}`, projectId, label: `${project.companyName || "Branding"} v${project.version || 1}`, status: "ready", createdAt: new Date().toISOString() },
    ...state.versions,
  ].slice(0, 50);
  saveBrandingState(state);
  recordBrandingActivity(BRANDING_EVENTS.brandingAssetCreated, project, "Branding assets gemaakt", "Download-, social-, e-mail- en marketingassets zijn voorbereid.", "success");
  recordBrandingNotification("Nieuwe branding assets", `${project.companyName || "Klant"} heeft nieuwe brandingassets.`, "success");
  recordBrandingNotification("Nieuwe downloads beschikbaar", `${project.companyName || "Klant"} kan het brandingpakket downloaden.`, "info");
  return { downloadAssets, socialKit, marketingKit, emailBranding };
}

export function preparePrintProposals(projectId) {
  const state = loadBrandingState();
  const project = state.projects.find((item) => item.id === projectId) || {};
  const rows = printCategories.map((category, index) => ({
    id: `${projectId}-print-${slug(category)}`,
    projectId,
    customerId: project.customerId || "",
    assetName: category,
    printType: category,
    category: "Print",
    status: index < 4 ? "ready" : "not_started",
    sizeOrFormat: printFormatFor(category),
    supplierNotes: "Voorbereid op basis van goedgekeurde branding.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  state.printAssets = mergeAssets(state.printAssets, rows);
  saveBrandingState(state);
  recordBrandingActivity(BRANDING_EVENTS.printRequested, project, "Printvoorstellen voorbereid", "Printcategorieen zijn klaargezet in Brand Center.", "info");
  recordBrandingActivity(BRANDING_EVENTS.printReady, project, "Printpakket gereed", "De eerste printvoorstellen staan klaar.", "success");
  recordBrandingNotification("Nieuwe printvoorstellen", `${project.companyName || "Klant"} heeft printvoorstellen klaarstaan.`, "info");
  recordBrandingNotification("Print klaar", `Printpakket voor ${project.companyName || "klant"} is voorbereid.`, "success");
  return rows;
}

export function updatePrintStatus(printId, status) {
  const state = loadBrandingState();
  const row = state.printAssets.find((asset) => asset.id === printId);
  state.printAssets = state.printAssets.map((asset) => asset.id === printId ? { ...asset, status, updatedAt: new Date().toISOString() } : asset);
  saveBrandingState(state);
  const eventType = status === "ordered" ? BRANDING_EVENTS.printOrdered : status === "delivered" ? BRANDING_EVENTS.printDelivered : BRANDING_EVENTS.brandingAssetUpdated;
  recordBrandingActivity(eventType, { id: row?.projectId || "", customerId: row?.customerId || "", companyName: row?.companyName || "" }, `Print ${status}`, `${row?.assetName || "Printitem"} is bijgewerkt naar ${status}.`, status === "delivered" ? "success" : "info");
  if (status === "ordered") recordBrandingNotification("Print besteld", `${row?.assetName || "Printitem"} is besteld.`, "info");
  if (status === "delivered") recordBrandingNotification("Print geleverd", `${row?.assetName || "Printitem"} is geleverd.`, "success");
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
  const project = clientId ? state.projects.find((item) => [item.id, item.customerId, item.projectId].includes(clientId)) : null;
  return Promise.resolve({
    success: true,
    clientId,
    brandAssets: {
      logo: project ? state.logoAssets.find((asset) => asset.projectId === project.id && ["approved", "selected"].includes(asset.status)) || state.logoAssets.find((asset) => asset.projectId === project.id) || null : null,
      colors: project?.colors || [],
      fonts: [project?.typography || "Inter"].filter(Boolean),
      images: project ? state.logoAssets.filter((asset) => asset.projectId === project.id) : [],
      copy: [],
      slogans: [project?.briefing?.slogan].filter(Boolean),
      brandGuidelines: project || null,
      downloads: project ? state.downloadAssets.filter((asset) => asset.projectId === project.id) : [],
      socialAssets: project ? state.socialAssets.filter((asset) => asset.projectId === project.id) : [],
      printAssets: project ? state.printAssets.filter((asset) => asset.projectId === project.id) : [],
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
  const withoutAssets = state.projects.filter((item) => !state.downloadAssets.some((asset) => asset.projectId === item.id));
  const withoutPrint = state.projects.filter((item) => !state.printAssets.some((asset) => asset.projectId === item.id));
  const brandingComplete = state.projects.filter((item) => state.downloadAssets.some((asset) => asset.projectId === item.id) && state.printAssets.some((asset) => asset.projectId === item.id));
  const printOpportunities = state.printAssets.filter((asset) => ["ready", "approved"].includes(asset.status));
  return { withoutBranding, withoutLogo, waitingReview, readyForFactory, withoutAssets, withoutPrint, brandingComplete, printOpportunities, generatedToday: state.logoAssets.filter(isToday).length, approvalsToday: state.projects.filter((item) => isToday(item.approvedAt)).length };
}

function normalizeBrandingState(value = {}) {
  return {
    brandProfile: value.brandProfile && typeof value.brandProfile === "object" ? value.brandProfile : {},
    logoAssets: Array.isArray(value.logoAssets) ? value.logoAssets : [],
    brandKit: value.brandKit && typeof value.brandKit === "object" ? value.brandKit : {},
    printAssets: Array.isArray(value.printAssets) ? value.printAssets : [],
    projects: Array.isArray(value.projects) ? value.projects : [],
    brandingAssets: Array.isArray(value.brandingAssets) ? value.brandingAssets : [],
    downloadAssets: Array.isArray(value.downloadAssets) ? value.downloadAssets : [],
    socialAssets: Array.isArray(value.socialAssets) ? value.socialAssets : [],
    marketingAssets: Array.isArray(value.marketingAssets) ? value.marketingAssets : [],
    emailAssets: Array.isArray(value.emailAssets) ? value.emailAssets : [],
    versions: Array.isArray(value.versions) ? value.versions : [],
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

function buildDownloadAssets(project = {}, logo = null) {
  const logoRows = assetVariants.map(([key, label]) => assetRecord({ project, key: `logo-${key}`, label: logo ? `${logo.assetName || "Logo"} ${label}` : `Logo ${label}`, type: "download", category: "Logo", status: logo ? "ready" : "not_started" }));
  const systemRows = [
    ["colors", "Kleuren"],
    ["fonts", "Lettertypes"],
    ["brand-guide", "Branding handleiding"],
    ["email-assets", "E-mail assets"],
    ["social-assets", "Social assets"],
    ["print-assets", "Print assets"],
  ].map(([key, label]) => assetRecord({ project, key, label, type: "download", category: "Downloads", status: "ready" }));
  return [...logoRows, ...systemRows];
}

function assetRecord({ project = {}, key, label, type, category, status }) {
  return {
    id: `${project.id || "branding"}-${key}`,
    projectId: project.id || "",
    customerId: project.customerId || "",
    companyName: project.companyName || "",
    type,
    category,
    assetName: label,
    title: label,
    status,
    version: project.version || 1,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function mergeAssets(existing = [], incoming = []) {
  const map = new Map(existing.map((asset) => [asset.id, asset]));
  incoming.forEach((asset) => map.set(asset.id, { ...(map.get(asset.id) || {}), ...asset, updatedAt: new Date().toISOString() }));
  return [...map.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function printFormatFor(category = "") {
  const text = clean(category).toLowerCase();
  if (text.includes("visite")) return "85 x 55 mm";
  if (text.includes("brief")) return "A4";
  if (text.includes("banner")) return "85 x 200 cm";
  if (text.includes("poster")) return "A2";
  if (text.includes("voertuig")) return "Op maat";
  return "Standaard formaat";
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
