import { approveBranding, linkBrandingToFactory, loadBrandingState, saveBrandingState } from "./brand-assets-adapter.js";

const storageKey = "maxwebstudioBrandCenter";
const logoTypes = ["logo", "favicon", "icon", "wordmark", "monogram"];
const logoFormats = ["SVG", "PNG", "JPG", "WEBP"];
const logoStatuses = ["draft", "selected", "approved"];
const printTypes = ["business card", "flyer", "sticker", "clothing", "pen", "notebook", "vehicle lettering", "other"];
const printStatuses = ["idea", "draft", "selected", "approved"];
const profileFields = ["businessName", "industry", "targetAudience", "toneOfVoice", "mainOffer", "usp", "primaryColor", "secondaryColor", "accentColor", "fontPreference", "notes"];
const kitFields = ["colors", "fonts", "buttonStyle", "imageStyle", "toneRules", "dos", "donts"];

const state = loadState();
const elements = {
  metrics: document.getElementById("brand-center-metrics"),
  profileForm: document.getElementById("brand-profile-form"),
  logoForm: document.getElementById("logo-form"),
  logoList: document.getElementById("logo-list"),
  kitForm: document.getElementById("brand-kit-form"),
  printForm: document.getElementById("print-form"),
  printList: document.getElementById("print-list"),
  exportButton: document.getElementById("export-brand-package"),
};

init();

function init() {
  setupTabs();
  fillSelect(elements.logoForm.elements.logoType, logoTypes);
  fillSelect(elements.logoForm.elements.format, logoFormats);
  fillSelect(elements.logoForm.elements.status, logoStatuses);
  fillSelect(elements.printForm.elements.printType, printTypes);
  fillSelect(elements.printForm.elements.status, printStatuses);
  fillStaticForm(elements.profileForm, state.brandProfile);
  fillStaticForm(elements.kitForm, state.brandKit);
  elements.profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.brandProfile = readNamedFields(elements.profileForm, profileFields);
    saveState();
    render();
  });
  elements.kitForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.brandKit = readNamedFields(elements.kitForm, kitFields);
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

function setupTabs() {
  const tabs = [...document.querySelectorAll(".brand-center-tab")];
  const panels = [...document.querySelectorAll(".brand-center-panel")];
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
    });
  });
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
    const record = reader(form);
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
  renderMetrics();
  renderRecords(elements.logoList, state.logoAssets, {
    empty: "Nog geen logo assets.",
    title: "assetName",
    meta: "logoType",
    status: "status",
    detail: "format",
    edit: (record) => fillForm(elements.logoForm, record),
    remove: (record) => removeRecord("logoAssets", record.id),
  });
  renderRecords(elements.printList, state.printAssets, {
    empty: "Nog geen print assets.",
    title: "assetName",
    meta: "printType",
    status: "status",
    detail: "sizeOrFormat",
    edit: (record) => fillForm(elements.printForm, record),
    remove: (record) => removeRecord("printAssets", record.id),
  });
}

function renderMetrics() {
  const readinessScore = calculateReadiness();
  const metrics = [
    ["Profile completeness", `${profileCompleteness()}%`],
    ["Logo count", state.logoAssets.length],
    ["Approved logos", state.logoAssets.filter((item) => item.status === "approved").length],
    ["Print assets", state.printAssets.length],
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
    }
    row.append(actions);
    return row;
  }));
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
  const filled = profileFields.filter((field) => String(state.brandProfile[field] || "").trim()).length;
  return Math.round((filled / profileFields.length) * 100);
}

function kitCompleteness() {
  const filled = kitFields.filter((field) => String(state.brandKit[field] || "").trim()).length;
  return Math.round((filled / kitFields.length) * 100);
}

function calculateReadiness() {
  const logoReady = state.logoAssets.length ? state.logoAssets.filter((item) => ["selected", "approved"].includes(item.status)).length / state.logoAssets.length : 0;
  const printReady = state.printAssets.length ? state.printAssets.filter((item) => ["selected", "approved"].includes(item.status)).length / state.printAssets.length : 0;
  return Math.round((profileCompleteness() / 100 * 0.35 + kitCompleteness() / 100 * 0.25 + logoReady * 0.25 + printReady * 0.15) * 100);
}

function exportPackage() {
  const payload = {
    brandProfile: state.brandProfile,
    logoAssets: state.logoAssets,
    brandKit: state.brandKit,
    printAssets: state.printAssets,
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
    };
  } catch (error) {
    console.warn("Brand Center storage kon niet worden gelezen.", error);
    return { brandProfile: {}, logoAssets: [], brandKit: {}, printAssets: [], projects: [] };
  }
}

function saveState() {
  saveBrandingState(state);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
