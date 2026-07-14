import { approveBranding, linkBrandingToFactory, loadBrandingState, prepareBrandingLibrary, preparePrintProposals, saveBrandingState, updatePrintStatus } from "./brand-assets-adapter.js";

const storageKey = "maxwebstudioBrandCenter";
const logoTypes = ["logo", "favicon", "icon", "wordmark", "monogram"];
const logoFormats = ["SVG", "PNG", "JPG", "WEBP"];
const logoStatuses = ["draft", "selected", "approved"];
const printTypes = ["Visitekaartjes", "Briefpapier", "Enveloppen", "Flyers", "Folders", "Brochures", "Roll-up banners", "Posters", "Stickers", "Kleding", "Voertuigbelettering", "Spandoeken", "Cadeaubonnen", "Cadeaukaarten", "Presentatiemappen", "Notitieblokken", "Offertemappen"];
const printStatuses = ["not_started", "designing", "ready", "approved", "ordered", "delivered"];
const profileFields = ["businessName", "industry", "targetAudience", "toneOfVoice", "mainOffer", "usp", "primaryColor", "secondaryColor", "accentColor", "fontPreference", "notes"];
const kitFields = ["colors", "fonts", "buttonStyle", "imageStyle", "toneRules", "dos", "donts"];

const state = loadState();
let activeRelationship = null;
const elements = {
  metrics: document.getElementById("brand-center-metrics"),
  profileForm: document.getElementById("brand-profile-form"),
  logoForm: document.getElementById("logo-form"),
  logoList: document.getElementById("logo-list"),
  kitForm: document.getElementById("brand-kit-form"),
  printForm: document.getElementById("print-form"),
  printList: document.getElementById("print-list"),
  colorSystemList: document.getElementById("color-system-list"),
  typographyList: document.getElementById("typography-list"),
  iconList: document.getElementById("icon-list"),
  downloadList: document.getElementById("download-list"),
  socialList: document.getElementById("social-list"),
  marketingList: document.getElementById("marketing-list"),
  statusList: document.getElementById("status-list"),
  versionList: document.getElementById("version-list"),
  exportButton: document.getElementById("export-brand-package"),
};

init();

async function init() {
  setupTabs();
  fillSelect(elements.logoForm.elements.logoType, logoTypes);
  fillSelect(elements.logoForm.elements.format, logoFormats);
  fillSelect(elements.logoForm.elements.status, logoStatuses);
  fillSelect(elements.printForm.elements.printType, printTypes);
  fillSelect(elements.printForm.elements.status, printStatuses);
  activeRelationship = await window.ActiveRelationship.whenReady();
  syncRelationshipView();
  window.ActiveRelationship.subscribeToRelationshipChanges((relationship) => {
    activeRelationship = relationship;
    syncRelationshipView();
  });
  elements.profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const project = ensureActiveProject();
    if (!project) return render();
    project.brandProfile = readNamedFields(elements.profileForm, profileFields);
    saveState();
    render();
  });
  elements.kitForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const project = ensureActiveProject();
    if (!project) return render();
    project.brandKit = readNamedFields(elements.kitForm, kitFields);
    saveState();
    render();
  });
  bindRecordForm(elements.logoForm, "logoAssets", readLogoForm);
  bindRecordForm(elements.printForm, "printAssets", readPrintForm);
  document.querySelectorAll("[data-reset-form]").forEach((button) => {
    button.addEventListener("click", () => resetForm(document.getElementById(button.dataset.resetForm)));
  });
  elements.exportButton.addEventListener("click", exportPackage);
  render();
}

function scopedState() {
  return window.MaxRelationshipScope.scopeBrandingState(state, activeRelationship);
}

function activeProject() {
  return scopedState().projects[0] || null;
}

function ensureActiveProject() {
  const existing = activeProject();
  if (existing) return existing;
  const relationship = window.MaxRelationshipScope.canonicalRelationship(activeRelationship);
  if (!relationship) return null;
  const id = `brand-${relationship.relationshipType}-${relationship.relationshipId}`;
  const project = {
    id, projectId: id,
    customerId: relationship.relationshipType === "customer" ? relationship.relationshipId : "",
    leadId: relationship.relationshipType === "lead" ? relationship.relationshipId : "",
    relationshipType: relationship.relationshipType,
    relationshipId: relationship.relationshipId,
    companyName: activeRelationship?.companyName || "Relatie",
    brandProfile: {}, brandKit: {}, status: "not_started",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  state.projects.unshift(project);
  return project;
}

function syncRelationshipView() {
  const scoped = scopedState();
  elements.profileForm.reset();
  elements.kitForm.reset();
  fillStaticForm(elements.profileForm, scoped.brandProfile);
  fillStaticForm(elements.kitForm, scoped.brandKit);
  document.querySelectorAll("#brand-profile-form :is(input,select,textarea,button),#logo-form :is(input,select,textarea,button),#brand-kit-form :is(input,select,textarea,button),#print-form :is(input,select,textarea,button),#export-brand-package").forEach((control) => {
    control.disabled = !activeRelationship;
  });
  render();
}

function setupTabs() {
  const tabs = [...document.querySelectorAll(".brand-center-tab")];
  const panels = [...document.querySelectorAll(".brand-center-panel")];
  const activate = (name) => {
    tabs.forEach((item) => item.classList.toggle("is-active", item.dataset.tab === name));
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== name;
    });
  };
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activate(tab.dataset.tab);
    });
  });
  const initial = window.location.hash.replace("#", "");
  if (initial && tabs.some((tab) => tab.dataset.tab === initial)) activate(initial);
}

function fillSelect(select, values) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function bindRecordForm(form, collectionName, reader) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!activeRelationship) return;
    const record = window.MaxRelationshipScope.attachRelationship(reader(form), activeRelationship);
    const collection = state[collectionName];
    const index = collection.findIndex((item) => item.id === record.id);
    if (index >= 0) collection[index] = record;
    else collection.unshift(record);
    saveState();
    resetForm(form);
    render();
  });
}

function readLogoForm(form) {
  return {
    id: form.elements.id.value || createId("logo"),
    assetName: form.elements.assetName.value.trim(),
    logoType: form.elements.logoType.value,
    format: form.elements.format.value,
    status: form.elements.status.value,
    previewUrl: form.elements.previewUrl.value.trim(),
    promptUsed: form.elements.promptUsed.value.trim(),
    notes: form.elements.notes.value.trim(),
  };
}

function readPrintForm(form) {
  return {
    id: form.elements.id.value || createId("print"),
    assetName: form.elements.assetName.value.trim(),
    printType: form.elements.printType.value,
    sizeOrFormat: form.elements.sizeOrFormat.value.trim(),
    status: form.elements.status.value,
    previewUrl: form.elements.previewUrl.value.trim(),
    supplierNotes: form.elements.supplierNotes.value.trim(),
  };
}

function render() {
  const view = scopedState();
  renderMetrics();
  renderRecords(elements.logoList, view.logoAssets, {
    empty: "Nog geen logo assets.",
    title: "assetName",
    meta: "logoType",
    status: "status",
    detail: "format",
    edit: (record) => fillForm(elements.logoForm, record),
    remove: (record) => removeRecord("logoAssets", record.id),
  });
  renderRecords(elements.printList, view.printAssets, {
    empty: "Nog geen print assets.",
    title: "assetName",
    meta: "printType",
    status: "status",
    detail: "sizeOrFormat",
    edit: (record) => fillForm(elements.printForm, record),
    remove: (record) => removeRecord("printAssets", record.id),
  });
  renderSimpleRows(elements.colorSystemList, colorSystemRows(), "Nog geen kleurensysteem.");
  renderSimpleRows(elements.typographyList, typographyRows(), "Nog geen typografie.");
  renderSimpleRows(elements.iconList, iconRows(), "Nog geen iconen.");
  renderAssetRows(elements.downloadList, view.downloadAssets, "Nog geen downloads.");
  renderAssetRows(elements.socialList, view.socialAssets, "Nog geen social assets.");
  renderAssetRows(elements.marketingList, [...view.marketingAssets, ...view.emailAssets], "Nog geen marketing assets.");
  renderSimpleRows(elements.statusList, statusRows(), "Nog geen statusdata.");
  renderSimpleRows(elements.versionList, versionRows(), "Nog geen versies.");
}

function renderMetrics() {
  const view = scopedState();
  const readinessScore = calculateReadiness();
  const metrics = [
    ["Profile completeness", `${profileCompleteness()}%`],
    ["Logo count", view.logoAssets.length],
    ["Approved logos", view.logoAssets.filter((item) => item.status === "approved").length],
    ["Downloads", view.downloadAssets.length],
    ["Social assets", view.socialAssets.length],
    ["Print assets", view.printAssets.length],
    ["Readiness", `${readinessScore}%`],
  ];
  elements.metrics.replaceChildren(...metrics.map(([label, value]) => metricCard(label, value)));
}

function metricCard(label, value) {
  const card = document.createElement("article");
  card.className = "admin-card metric-card";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.textContent = String(value);
  const small = document.createElement("small");
  small.textContent = "Branding workflow";
  card.append(labelEl, valueEl, small);
  return card;
}

function renderRecords(target, records, config) {
  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "workflow-empty-state";
    empty.textContent = config.empty;
    target.replaceChildren(empty);
    return;
  }
  target.replaceChildren(...records.map((record) => {
    const row = document.createElement("article");
    row.className = "brand-center-row";
    row.append(recordCell(record[config.title] || "Naamloos", record[config.detail] || "Geen detail"));
    row.append(recordCell(record[config.meta] || "Geen type", "Kenmerk"));
    row.append(statusBadge(record[config.status] || "draft"));
    const actions = document.createElement("div");
    actions.className = "brand-center-actions";
    actions.append(actionButton("Edit", () => config.edit(record)), actionButton("Delete", () => config.remove(record), "secondary"));
    if (record.projectId && config.title === "assetName") {
      actions.append(actionButton("Approve", () => {
        approveBranding(record.projectId);
        Object.assign(state, loadState());
        render();
      }, "secondary"));
      actions.append(actionButton("Factory", () => {
        linkBrandingToFactory(record.projectId);
        Object.assign(state, loadState());
        render();
      }, "secondary"));
      actions.append(actionButton("Assets", () => {
        prepareBrandingLibrary(record.projectId);
        preparePrintProposals(record.projectId);
        Object.assign(state, loadState());
        render();
      }, "secondary"));
    }
    if (record.id && config.meta === "printType") {
      actions.append(actionButton("Ordered", () => {
        updatePrintStatus(record.id, "ordered");
        Object.assign(state, loadState());
        render();
      }, "secondary"));
      actions.append(actionButton("Delivered", () => {
        updatePrintStatus(record.id, "delivered");
        Object.assign(state, loadState());
        render();
      }, "secondary"));
    }
    row.append(actions);
    return row;
  }));
}

function renderAssetRows(target, records, empty) {
  if (!target) return;
  if (!records.length) {
    target.replaceChildren(emptyRow(empty));
    return;
  }
  target.replaceChildren(...records.map((record) => {
    const row = document.createElement("article");
    row.className = "brand-center-row";
    row.append(recordCell(record.assetName || record.title || "Asset", record.category || record.type || "Asset"));
    row.append(recordCell(record.companyName || "Brand Center", `v${record.version || 1}`));
    row.append(statusBadge(record.status || "ready"));
    return row;
  }));
}

function renderSimpleRows(target, rows, empty) {
  if (!target) return;
  if (!rows.length) {
    target.replaceChildren(emptyRow(empty));
    return;
  }
  target.replaceChildren(...rows.map(([label, value, detail = ""]) => {
    const row = document.createElement("article");
    row.className = "brand-center-row";
    row.append(recordCell(label, detail), recordCell(value || "-", "Waarde"));
    return row;
  }));
}

function emptyRow(text) {
  const empty = document.createElement("div");
  empty.className = "workflow-empty-state";
  empty.textContent = text;
  return empty;
}

function recordCell(title, subtitle) {
  const cell = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = subtitle;
  cell.append(strong, small);
  return cell;
}

function statusBadge(status) {
  const badge = document.createElement("mark");
  badge.className = "status-badge status-prepared";
  badge.textContent = status;
  return badge;
}

function actionButton(label, handler, variant = "primary") {
  const button = document.createElement("button");
  button.className = `button ${variant}`;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function fillStaticForm(form, values) {
  Object.entries(values || {}).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
}

function fillForm(form, record) {
  Object.entries(record).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm(form) {
  form.reset();
  if (form.elements.id) form.elements.id.value = "";
}

function removeRecord(collectionName, id) {
  state[collectionName] = state[collectionName].filter((record) => record.id !== id);
  saveState();
  render();
}

function readNamedFields(form, fields) {
  return Object.fromEntries(fields.map((field) => [field, form.elements[field]?.value.trim() || ""]));
}

function profileCompleteness() {
  const profile = scopedState().brandProfile;
  const filled = profileFields.filter((field) => String(profile[field] || "").trim()).length;
  return Math.round((filled / profileFields.length) * 100);
}

function kitCompleteness() {
  const kit = scopedState().brandKit;
  const filled = kitFields.filter((field) => String(kit[field] || "").trim()).length;
  return Math.round((filled / kitFields.length) * 100);
}

function calculateReadiness() {
  const view = scopedState();
  const logoReady = view.logoAssets.length ? view.logoAssets.filter((item) => ["selected", "approved"].includes(item.status)).length / view.logoAssets.length : 0;
  const printReady = view.printAssets.length ? view.printAssets.filter((item) => ["selected", "approved"].includes(item.status)).length / view.printAssets.length : 0;
  return Math.round((profileCompleteness() / 100 * 0.35 + kitCompleteness() / 100 * 0.25 + logoReady * 0.25 + printReady * 0.15) * 100);
}

function colorSystemRows() {
  const view = scopedState();
  const profile = view.brandProfile || {};
  const colors = {
    Primary: profile.primaryColor || view.projects[0]?.colors?.[0] || "",
    Secondary: profile.secondaryColor || view.projects[0]?.colors?.[1] || "",
    Accent: profile.accentColor || view.projects[0]?.colors?.[2] || "",
    Background: "#ffffff",
    Success: "#22c55e",
    Warning: "#f59e0b",
    Error: "#ef4444",
    Neutrals: "#f8fafc / #64748b / #0f172a",
  };
  return Object.entries(colors).map(([label, value]) => [label, value, rgbDetail(value)]);
}

function typographyRows() {
  const view = scopedState();
  const profile = view.brandProfile || {};
  const kit = view.brandKit || {};
  const primary = profile.fontPreference || view.projects[0]?.typography || "Inter";
  return [
    ["Primary font", primary, "Hoofdlettertype"],
    ["Secondary font", kit.fonts || "System UI", "Ondersteunend"],
    ["Heading style", "Bold, compact, scanbaar", "H1-H3"],
    ["Body style", "Rustig, ruim leesbaar", "Tekst"],
    ["Knoppen", kit.buttonStyle || "Hoog contrast", "CTA"],
  ];
}

function iconRows() {
  const view = scopedState();
  return [
    ["Iconstijl", view.projects[0]?.iconStyle || "Lijniconen", "Website en social"],
    ["Status", view.socialAssets.length ? "Voorbereid" : "Nog te maken", "Brand Center"],
  ];
}

function statusRows() {
  const view = scopedState();
  return [
    ["Branding compleet", view.downloadAssets.length && view.socialAssets.length ? "Ja" : "Nee", "Downloads en social kit"],
    ["Print klaar", view.printAssets.filter((item) => ["ready", "approved"].includes(item.status)).length, "Ready/approved"],
    ["Website Factory", view.projects.filter((item) => item.status === "linked_to_factory").length, "Gekoppeld"],
  ];
}

function versionRows() {
  return scopedState().versions.map((item) => [item.label || item.id, item.status || "ready", formatDate(item.createdAt)]);
}

function rgbDetail(value = "") {
  const hex = String(value || "").trim();
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return "RGB n.v.t.";
  return `RGB ${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}`;
}

function formatDate(value = "") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function exportPackage() {
  const view = scopedState();
  const payload = {
    relationship: window.MaxRelationshipScope.canonicalRelationship(activeRelationship),
    brandProfile: view.brandProfile,
    logoAssets: view.logoAssets,
    brandKit: view.brandKit,
    printAssets: view.printAssets,
    downloadAssets: view.downloadAssets,
    socialAssets: view.socialAssets,
    marketingAssets: view.marketingAssets,
    emailAssets: view.emailAssets,
    readinessScore: calculateReadiness(),
    generatedAt: new Date().toISOString(),
  };
  downloadJson(payload, "maxwebstudio-brand-package.json");
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadState() {
  try {
    const parsed = loadBrandingState();
    return {
      brandProfile: parsed.brandProfile && typeof parsed.brandProfile === "object" ? parsed.brandProfile : {},
      logoAssets: Array.isArray(parsed.logoAssets) ? parsed.logoAssets : [],
      brandKit: parsed.brandKit && typeof parsed.brandKit === "object" ? parsed.brandKit : {},
      printAssets: Array.isArray(parsed.printAssets) ? parsed.printAssets : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      brandingAssets: Array.isArray(parsed.brandingAssets) ? parsed.brandingAssets : [],
      downloadAssets: Array.isArray(parsed.downloadAssets) ? parsed.downloadAssets : [],
      socialAssets: Array.isArray(parsed.socialAssets) ? parsed.socialAssets : [],
      marketingAssets: Array.isArray(parsed.marketingAssets) ? parsed.marketingAssets : [],
      emailAssets: Array.isArray(parsed.emailAssets) ? parsed.emailAssets : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
    };
  } catch (error) {
    console.warn("Brand Center storage kon niet worden gelezen.", error);
    return { brandProfile: {}, logoAssets: [], brandKit: {}, printAssets: [], projects: [], brandingAssets: [], downloadAssets: [], socialAssets: [], marketingAssets: [], emailAssets: [], versions: [] };
  }
}

function saveState() {
  saveBrandingState(state);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
