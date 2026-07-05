import { listDemoImageGroups } from "./config/demoImageAssets.js";

const storageKey = "maxwebstudioAiContentLibrary";
const contentTypes = ["homepage hero", "about", "service", "CTA", "SEO", "social post", "email", "FAQ", "blog", "other"];
const textStatuses = ["draft", "selected", "approved"];
const pageStatuses = ["planned", "ready", "approved"];
const imageRoles = ["hero", "service", "team", "project", "contact"];

const state = loadState();
const imageGroups = listDemoImageGroups();

const elements = {
  metrics: document.getElementById("ai-content-metrics"),
  blockForm: document.getElementById("content-block-form"),
  blockList: document.getElementById("content-block-list"),
  pageForm: document.getElementById("page-form"),
  pageList: document.getElementById("page-list"),
  seoForm: document.getElementById("seo-form"),
  seoList: document.getElementById("seo-list"),
  branchSelector: document.getElementById("branch-selector"),
  imageGrid: document.getElementById("image-grid"),
  exportButton: document.getElementById("export-content-package"),
};

init();

function init() {
  setupTabs();
  fillSelect(elements.blockForm.elements.contentType, contentTypes);
  fillSelect(elements.blockForm.elements.status, textStatuses);
  fillSelect(elements.pageForm.elements.status, pageStatuses);
  fillSelect(elements.seoForm.elements.status, textStatuses);
  fillBranchSelector();
  bindRecordForm(elements.blockForm, "contentBlocks", readContentBlockForm);
  bindRecordForm(elements.pageForm, "pages", readPageForm);
  bindRecordForm(elements.seoForm, "seoRecords", readSeoForm);
  document.querySelectorAll("[data-reset-form]").forEach((button) => {
    button.addEventListener("click", () => resetForm(document.getElementById(button.dataset.resetForm)));
  });
  elements.branchSelector.addEventListener("change", () => {
    state.selectedBranch = elements.branchSelector.value;
    saveState();
    render();
  });
  elements.exportButton.addEventListener("click", exportPackage);
  render();
}

function setupTabs() {
  const tabs = [...document.querySelectorAll(".ai-content-tab")];
  const panels = [...document.querySelectorAll(".ai-content-panel")];
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

function fillBranchSelector() {
  imageGroups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.slug;
    option.textContent = group.label;
    elements.branchSelector.append(option);
  });
  if (!imageGroups.some((group) => group.slug === state.selectedBranch)) {
    state.selectedBranch = imageGroups[0]?.slug || "";
  }
  elements.branchSelector.value = state.selectedBranch;
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

function readContentBlockForm(form) {
  return {
    id: form.elements.id.value || createId("block"),
    title: form.elements.title.value.trim(),
    contentType: form.elements.contentType.value,
    connectedPage: form.elements.connectedPage.value.trim(),
    versionName: form.elements.versionName.value.trim(),
    textContent: form.elements.textContent.value.trim(),
    status: form.elements.status.value,
    notes: form.elements.notes.value.trim(),
  };
}

function readPageForm(form) {
  return {
    id: form.elements.id.value || createId("page"),
    pageName: form.elements.pageName.value.trim(),
    slug: form.elements.slug.value.trim(),
    purpose: form.elements.purpose.value.trim(),
    seoTitle: form.elements.seoTitle.value.trim(),
    metaDescription: form.elements.metaDescription.value.trim(),
    connectedContentBlocks: form.elements.connectedContentBlocks.value.trim(),
    connectedImageRole: form.elements.connectedImageRole.value.trim(),
    status: form.elements.status.value,
  };
}

function readSeoForm(form) {
  return {
    id: form.elements.id.value || createId("seo"),
    page: form.elements.page.value.trim(),
    seoTitle: form.elements.seoTitle.value.trim(),
    metaDescription: form.elements.metaDescription.value.trim(),
    focusKeyword: form.elements.focusKeyword.value.trim(),
    secondaryKeywords: form.elements.secondaryKeywords.value.trim(),
    searchIntent: form.elements.searchIntent.value.trim(),
    status: form.elements.status.value,
  };
}

function render() {
  renderMetrics();
  renderRecords(elements.blockList, state.contentBlocks, {
    empty: "Nog geen content blocks.",
    title: "title",
    meta: "contentType",
    status: "status",
    detail: "connectedPage",
    edit: (record) => fillForm(elements.blockForm, record),
    remove: (record) => removeRecord("contentBlocks", record.id),
  });
  renderRecords(elements.pageList, state.pages, {
    empty: "Nog geen geplande pagina's.",
    title: "pageName",
    meta: "slug",
    status: "status",
    detail: "seoTitle",
    edit: (record) => fillForm(elements.pageForm, record),
    remove: (record) => removeRecord("pages", record.id),
  });
  renderRecords(elements.seoList, state.seoRecords, {
    empty: "Nog geen SEO records.",
    title: "page",
    meta: "focusKeyword",
    status: "status",
    detail: "seoTitle",
    edit: (record) => fillForm(elements.seoForm, record),
    remove: (record) => removeRecord("seoRecords", record.id),
  });
  renderImages();
}

function renderMetrics() {
  const readinessScore = calculateReadiness();
  const metrics = [
    ["Content blocks", state.contentBlocks.length],
    ["Pages", state.pages.length],
    ["Approved texts", state.contentBlocks.filter((item) => item.status === "approved").length],
    ["Selected images", Object.keys(state.selectedImages).length],
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
  small.textContent = "Lokale workspace";
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
    row.className = "ai-content-row";
    row.append(recordCell(record[config.title] || "Naamloos", record[config.detail] || "Geen detail"));
    row.append(recordCell(record[config.meta] || "Geen type", "Kenmerk"));
    row.append(statusBadge(record[config.status] || "draft"));
    const actions = document.createElement("div");
    actions.className = "ai-content-actions";
    actions.append(actionButton("Edit", () => config.edit(record)), actionButton("Delete", () => config.remove(record), "secondary"));
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

function renderImages() {
  const group = imageGroups.find((item) => item.slug === state.selectedBranch) || imageGroups[0];
  if (!group) {
    elements.imageGrid.replaceChildren();
    return;
  }
  elements.branchSelector.value = group.slug;
  elements.imageGrid.replaceChildren(...imageRoles.map((role) => {
    const asset = group.assets[role];
    const selected = state.selectedImages[role]?.src === asset.src;
    const card = document.createElement("article");
    card.className = `ai-content-image-card${selected ? " is-selected" : ""}`;
    const img = document.createElement("img");
    img.src = asset.src;
    img.alt = asset.alt;
    const title = document.createElement("strong");
    title.textContent = role;
    const button = actionButton(selected ? "Selected" : "Use this image", () => {
      state.selectedImages[role] = {
        role,
        branch: group.slug,
        src: asset.src,
        alt: asset.alt,
      };
      saveState();
      render();
    });
    card.append(img, title, button);
    return card;
  }));
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

function calculateReadiness() {
  const contentReady = state.contentBlocks.length ? state.contentBlocks.filter((item) => ["selected", "approved"].includes(item.status)).length / state.contentBlocks.length : 0;
  const pageReady = state.pages.length ? state.pages.filter((item) => ["ready", "approved"].includes(item.status)).length / state.pages.length : 0;
  const seoReady = state.seoRecords.length ? state.seoRecords.filter((item) => ["selected", "approved"].includes(item.status)).length / state.seoRecords.length : 0;
  const imageReady = Math.min(Object.keys(state.selectedImages).length / imageRoles.length, 1);
  return Math.round(((contentReady + pageReady + seoReady + imageReady) / 4) * 100);
}

function exportPackage() {
  const payload = {
    contentBlocks: state.contentBlocks,
    pages: state.pages,
    seoRecords: state.seoRecords,
    selectedBranch: state.selectedBranch,
    selectedImages: state.selectedImages,
    readinessScore: calculateReadiness(),
    generatedAt: new Date().toISOString(),
  };
  downloadJson(payload, "maxwebstudio-ai-content-package.json");
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
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return {
      contentBlocks: Array.isArray(parsed.contentBlocks) ? parsed.contentBlocks : [],
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
      seoRecords: Array.isArray(parsed.seoRecords) ? parsed.seoRecords : [],
      selectedBranch: parsed.selectedBranch || "installatiebedrijf",
      selectedImages: parsed.selectedImages && typeof parsed.selectedImages === "object" ? parsed.selectedImages : {},
    };
  } catch (error) {
    console.warn("AI Content Library storage kon niet worden gelezen.", error);
    return { contentBlocks: [], pages: [], seoRecords: [], selectedBranch: "installatiebedrijf", selectedImages: {} };
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
