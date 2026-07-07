import { listDemoImageGroups } from "./config/demoImageAssets.js";

const storageKey = "maxwebstudioAiContentLibrary";
const contentTypes = ["homepage hero", "about", "service", "CTA", "SEO", "social post", "email", "FAQ", "blog", "review", "USP", "other"];
const textStatuses = ["draft", "selected", "approved"];
const pageStatuses = ["planned", "ready", "approved"];
const imageRoles = ["hero", "service", "team", "project", "contact", "service-alt", "project-alt", "detail", "review", "background"];
const allStatuses = ["Alles", ...new Set([...textStatuses, ...pageStatuses])];
const imageRoleLabels = {
  hero: "Hero beeld",
  service: "Dienstfoto",
  team: "Team en werkwijze",
  project: "Projectfoto",
  contact: "Contactbeeld",
  "service-alt": "Extra dienst",
  "project-alt": "Extra project",
  detail: "Detailfoto",
  review: "Review beeld",
  background: "Achtergrond",
};
const imageFolderLabels = {
  bouwbedrijf: "Bouwbedrijven",
  quantumbouw: "Quantumbouw.nl",
  kapsalon: "Kappers en kapsalons",
  installatiebedrijf: "Installatiebedrijven",
  schoonheidssalon: "Schoonheidssalons",
  schoonmaakbedrijf: "Schoonmaakbedrijven",
  autobedrijf: "Autobedrijven",
};
const downloadSizes = [
  { key: "original", label: "Origineel", width: null },
  { key: "small", label: "Klein", width: 640 },
  { key: "medium", label: "Middel", width: 1280 },
  { key: "large", label: "Groot", width: 1920 },
];

const imageGroups = listDemoImageGroups();
const state = loadState();
const filters = {
  query: "",
  status: "Alles",
  type: "Alles",
};

const elements = {
  heroReadiness: document.getElementById("ai-content-hero-readiness"),
  metrics: document.getElementById("ai-content-metrics"),
  checklist: document.getElementById("ai-content-checklist"),
  recentList: document.getElementById("ai-content-recent-list"),
  search: document.getElementById("ai-content-search"),
  statusFilter: document.getElementById("ai-content-status-filter"),
  typeFilter: document.getElementById("ai-content-type-filter"),
  message: document.getElementById("ai-content-message"),
  loadSampleButton: document.getElementById("load-sample-package"),
  importButton: document.getElementById("import-content-package"),
  importFile: document.getElementById("content-package-file"),
  exportTopButton: document.getElementById("export-content-package-top"),
  clearButton: document.getElementById("clear-content-package"),
  blockForm: document.getElementById("content-block-form"),
  blockList: document.getElementById("content-block-list"),
  copyBlockButton: document.getElementById("copy-content-block"),
  pageForm: document.getElementById("page-form"),
  pageList: document.getElementById("page-list"),
  createSeoButton: document.getElementById("create-page-seo"),
  seoForm: document.getElementById("seo-form"),
  seoList: document.getElementById("seo-list"),
  branchSelector: document.getElementById("branch-selector"),
  imageFolderList: document.getElementById("image-folder-list"),
  imageFolderSummary: document.getElementById("image-folder-summary"),
  selectedImageList: document.getElementById("selected-image-list"),
  clearImagesButton: document.getElementById("clear-selected-images"),
  imageGrid: document.getElementById("image-grid"),
  exportButton: document.getElementById("export-content-package"),
  copyPackageButton: document.getElementById("copy-content-package"),
  packagePreview: document.getElementById("content-package-preview"),
};

init();

function init() {
  setupTabs();
  fillSelect(elements.blockForm.elements.contentType, contentTypes);
  fillSelect(elements.blockForm.elements.status, textStatuses);
  fillSelect(elements.pageForm.elements.status, pageStatuses);
  fillSelect(elements.seoForm.elements.status, textStatuses);
  fillSelect(elements.statusFilter, allStatuses);
  fillSelect(elements.typeFilter, ["Alles", ...contentTypes, "page", "SEO", "image"]);
  fillBranchSelector();
  bindRecordForm(elements.blockForm, "contentBlocks", readContentBlockForm, "Content block opgeslagen.");
  bindRecordForm(elements.pageForm, "pages", readPageForm, "Pagina opgeslagen.");
  bindRecordForm(elements.seoForm, "seoRecords", readSeoForm, "SEO record opgeslagen.");
  bindEvents();
  render();
}

function bindEvents() {
  document.querySelectorAll("[data-reset-form]").forEach((button) => {
    button.addEventListener("click", () => {
      resetForm(document.getElementById(button.dataset.resetForm));
      setMessage("Formulier leeggemaakt.", "success");
    });
  });

  elements.search.addEventListener("input", () => {
    filters.query = elements.search.value.trim().toLowerCase();
    render();
  });
  elements.statusFilter.addEventListener("change", () => {
    filters.status = elements.statusFilter.value;
    render();
  });
  elements.typeFilter.addEventListener("change", () => {
    filters.type = elements.typeFilter.value;
    render();
  });
  elements.branchSelector.addEventListener("change", () => {
    state.selectedBranch = elements.branchSelector.value;
    state.selectedImageFolder = elements.branchSelector.value;
    touchState("Afbeelding map bijgewerkt.");
  });

  elements.loadSampleButton.addEventListener("click", loadSamplePackage);
  elements.importButton.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", importPackage);
  elements.exportTopButton.addEventListener("click", exportPackage);
  elements.exportButton.addEventListener("click", exportPackage);
  elements.copyPackageButton.addEventListener("click", copyPackageJson);
  elements.clearButton.addEventListener("click", clearPackage);
  elements.clearImagesButton.addEventListener("click", clearSelectedImages);
  elements.copyBlockButton.addEventListener("click", copyCurrentContentBlock);
  elements.createSeoButton.addEventListener("click", createSeoFromPageForm);
}

function setupTabs() {
  const tabs = [...document.querySelectorAll(".ai-content-tab")];
  const panels = [...document.querySelectorAll(".ai-content-panel")];
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => {
        const isActive = item === tab;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
      render();
    });
  });
}

function fillSelect(select, values) {
  select.replaceChildren();
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function fillBranchSelector() {
  fillSelect(elements.branchSelector, imageGroups.map((group) => group.slug));
  [...elements.branchSelector.options].forEach((option) => {
    const group = imageGroups.find((item) => item.slug === option.value);
    option.textContent = imageFolderName(group) || option.value;
  });
  if (!imageGroups.some((group) => group.slug === state.selectedBranch)) {
    state.selectedBranch = imageGroups[0]?.slug || "";
  }
  if (!imageGroups.some((group) => group.slug === state.selectedImageFolder)) {
    state.selectedImageFolder = state.selectedBranch || imageGroups[0]?.slug || "";
  }
  state.selectedBranch = state.selectedImageFolder || state.selectedBranch;
  elements.branchSelector.value = state.selectedBranch;
}

function bindRecordForm(form, collectionName, reader, successMessage) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const record = reader(form);
    const collection = state[collectionName];
    const index = collection.findIndex((item) => item.id === record.id);
    const timestamp = new Date().toISOString();
    record.updatedAt = timestamp;
    if (!record.createdAt) record.createdAt = collection[index]?.createdAt || timestamp;
    if (index >= 0) collection[index] = record;
    else collection.unshift(record);
    saveState();
    resetForm(form);
    setMessage(successMessage, "success");
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
    slug: normalizeSlug(form.elements.slug.value || form.elements.pageName.value),
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
  const packagePayload = buildPackagePayload();
  const readinessScore = packagePayload.readinessScore;
  elements.heroReadiness.textContent = `${readinessScore}% klaar`;
  renderMetrics(readinessScore);
  renderChecklist();
  renderRecentItems();
  renderRecords(elements.blockList, filteredRecords(state.contentBlocks, "contentBlocks"), {
    empty: "Nog geen content blocks. Maak tekstvarianten of laad het voorbeeldpakket.",
    title: "title",
    meta: "contentType",
    status: "status",
    detail: "connectedPage",
    copyValue: (record) => record.textContent,
    edit: (record) => fillForm(elements.blockForm, record),
    duplicate: (record) => duplicateRecord("contentBlocks", record, "title"),
    remove: (record) => removeRecord("contentBlocks", record.id),
  });
  renderRecords(elements.pageList, filteredRecords(state.pages, "pages"), {
    empty: "Nog geen pagina's. Voeg pagina's toe om de contentstructuur te bouwen.",
    title: "pageName",
    meta: "slug",
    status: "status",
    detail: "seoTitle",
    copyValue: pageCopyText,
    edit: (record) => fillForm(elements.pageForm, record),
    duplicate: (record) => duplicateRecord("pages", record, "pageName"),
    remove: (record) => removeRecord("pages", record.id),
  });
  renderRecords(elements.seoList, filteredRecords(state.seoRecords, "seoRecords"), {
    empty: "Nog geen SEO records. Maak metadata per pagina of gebruik de pagina-actie.",
    title: "page",
    meta: "focusKeyword",
    status: "status",
    detail: "seoTitle",
    copyValue: seoCopyText,
    edit: (record) => fillForm(elements.seoForm, record),
    duplicate: (record) => duplicateRecord("seoRecords", record, "page"),
    remove: (record) => removeRecord("seoRecords", record.id),
  });
  renderSelectedImages();
  renderImageFolders();
  renderImages();
  elements.packagePreview.textContent = JSON.stringify(packagePayload, null, 2);
}

function renderMetrics(readinessScore) {
  const metrics = [
    ["Content blocks", state.contentBlocks.length, `${state.contentBlocks.filter((item) => item.status === "approved").length} approved`],
    ["Pages", state.pages.length, `${state.pages.filter((item) => item.status === "ready" || item.status === "approved").length} ready`],
    ["SEO records", state.seoRecords.length, `${state.seoRecords.filter((item) => item.status === "approved").length} approved`],
    ["Selected images", Object.keys(state.selectedImages).length, `${imageRoles.length} rollen`],
    ["Readiness", `${readinessScore}%`, "Lokale workspace"],
  ];
  elements.metrics.replaceChildren(...metrics.map(([label, value, detail]) => metricCard(label, value, detail)));
}

function metricCard(label, value, detail) {
  const card = document.createElement("article");
  card.className = "admin-card metric-card";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.textContent = String(value);
  const small = document.createElement("small");
  small.textContent = detail;
  card.append(labelEl, valueEl, small);
  return card;
}

function renderChecklist() {
  const checks = [
    ["Content blocks", state.contentBlocks.length > 0, "Voeg minimaal één tekstblok toe."],
    ["Pagina's", state.pages.length > 0, "Leg de pagina's van het contentpakket vast."],
    ["SEO metadata", state.seoRecords.length > 0, "Maak SEO records voor focus keywords en metadata."],
    ["Beelden", Object.keys(state.selectedImages).length >= 3, "Selecteer minimaal hero, service en contactbeeld."],
    ["Goedkeuring", state.contentBlocks.some((item) => item.status === "approved") || state.pages.some((item) => item.status === "approved"), "Zet gekozen content op approved."],
  ];
  elements.checklist.replaceChildren(...checks.map(([title, done, detail]) => {
    const item = document.createElement("article");
    item.className = `ai-content-check-item${done ? " is-done" : ""}`;
    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = title;
    span.textContent = detail;
    copy.append(strong, span);
    item.append(copy);
    return item;
  }));
}

function renderRecentItems() {
  const recent = [
    ...state.contentBlocks.map((record) => ({ kind: "Content", title: record.title, detail: record.contentType, date: record.updatedAt || record.createdAt })),
    ...state.pages.map((record) => ({ kind: "Page", title: record.pageName, detail: record.slug, date: record.updatedAt || record.createdAt })),
    ...state.seoRecords.map((record) => ({ kind: "SEO", title: record.page, detail: record.focusKeyword, date: record.updatedAt || record.createdAt })),
  ].sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0)).slice(0, 6);

  if (!recent.length) {
    elements.recentList.replaceChildren(emptyState("Nog geen recente items. Laad het voorbeeldpakket of maak je eerste contentblok."));
    return;
  }

  elements.recentList.replaceChildren(...recent.map((record) => {
    const item = document.createElement("article");
    item.className = "ai-content-recent-item";
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = record.title || "Naamloos";
    span.textContent = `${record.kind} · ${record.detail || "Geen detail"} · ${formatDate(record.date)}`;
    item.append(strong, span);
    return item;
  }));
}

function renderRecords(target, records, config) {
  if (!records.length) {
    target.replaceChildren(emptyState(config.empty));
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
    actions.append(
      actionButton("Edit", () => config.edit(record)),
      actionButton("Duplicate", () => config.duplicate(record), "secondary"),
      actionButton("Copy", () => copyText(typeof config.copyValue === "function" ? config.copyValue(record) : "", "Item gekopieerd."), "secondary"),
      actionButton("Delete", () => config.remove(record), "secondary"),
    );
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
  badge.className = `status-badge ${status === "approved" ? "status-active" : "status-prepared"}`;
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

function renderSelectedImages() {
  const selected = Object.values(state.selectedImages);
  if (!selected.length) {
    elements.selectedImageList.replaceChildren(emptyState("Nog geen beelden geselecteerd."));
    return;
  }
  elements.selectedImageList.replaceChildren(...selected.map((asset) => {
    const item = document.createElement("article");
    item.className = "ai-content-selected-image";
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = asset.role;
    span.textContent = `${asset.branch} · ${asset.alt}`;
    item.append(strong, span);
    return item;
  }));
}

function renderImageFolders() {
  const query = filters.query;
  const folders = imageGroups.map((group) => {
    const assets = imageAssetsForGroup(group);
    const visibleAssets = filterImageAssets(assets, group, query);
    return { group, assets, visibleAssets };
  });

  elements.imageFolderList.replaceChildren(...folders.map(({ group, assets, visibleAssets }) => {
    const button = document.createElement("button");
    button.className = `ai-content-folder-button${state.selectedImageFolder === group.slug ? " is-active" : ""}`;
    button.type = "button";
    button.addEventListener("click", () => {
      state.selectedImageFolder = group.slug;
      state.selectedBranch = group.slug;
      touchState(`${imageFolderName(group)} geopend.`);
    });

    const copy = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    title.textContent = imageFolderName(group);
    meta.textContent = query ? `${visibleAssets.length} van ${assets.length} foto's` : `${assets.length} foto's`;
    copy.append(title, meta);

    const count = document.createElement("b");
    count.textContent = String(visibleAssets.length);
    button.append(copy, count);
    return button;
  }));
}

function renderImages() {
  const group = imageGroups.find((item) => item.slug === state.selectedImageFolder) || imageGroups.find((item) => item.slug === state.selectedBranch) || imageGroups[0];
  if (!group) {
    elements.imageFolderSummary.replaceChildren();
    elements.imageGrid.replaceChildren();
    return;
  }
  state.selectedImageFolder = group.slug;
  state.selectedBranch = group.slug;
  elements.branchSelector.value = group.slug;

  const assets = filterImageAssets(imageAssetsForGroup(group), group, filters.query);
  renderImageFolderSummary(group, assets);

  if (!assets.length) {
    elements.imageGrid.replaceChildren(emptyState("Geen afbeeldingen gevonden in deze map met de huidige zoekterm."));
    return;
  }

  elements.imageGrid.replaceChildren(...assets.map((asset) => {
    const role = asset.role;
    const selected = state.selectedImages[role]?.src === asset.src;
    const card = document.createElement("article");
    card.className = `ai-content-image-card${selected ? " is-selected" : ""}`;
    const img = document.createElement("img");
    img.src = asset.src;
    img.alt = asset.alt;
    img.loading = "lazy";
    const title = document.createElement("strong");
    title.textContent = imageRoleLabels[role] || role;
    const meta = document.createElement("small");
    meta.textContent = `${imageFolderName(group)} · ${asset.type || role}`;
    const button = actionButton(selected ? "Geselecteerd" : "Gebruik beeld", () => {
      state.selectedImages[role] = {
        role,
        branch: group.slug,
        src: asset.src,
        alt: asset.alt,
      };
      touchState("Beeld geselecteerd.");
    }, selected ? "primary" : "secondary");
    const downloads = document.createElement("div");
    downloads.className = "ai-content-downloads";
    downloadSizes.forEach((size) => {
      downloads.append(actionButton(size.label, () => downloadImageVariant(asset, group, size), "secondary"));
    });
    card.append(img, title, meta, button, downloads);
    return card;
  }));
}

function renderImageFolderSummary(group, assets) {
  const summary = document.createElement("article");
  summary.className = "admin-card ai-content-folder-summary-card";
  const copy = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "section-kicker";
  kicker.textContent = "Geselecteerde map";
  const title = document.createElement("h2");
  title.textContent = imageFolderName(group);
  const detail = document.createElement("p");
  detail.textContent = `${assets.length} afbeeldingen beschikbaar voor website hero's, diensten, projecten, contact en achtergronden.`;
  copy.append(kicker, title, detail);

  const actions = document.createElement("div");
  actions.className = "ai-content-folder-actions";
  actions.append(
    actionButton("Download map-index", () => downloadJson(buildImageFolderPayload(group), `maxwebstudio-${group.slug}-afbeeldingen.json`), "secondary"),
  );
  summary.append(copy, actions);
  elements.imageFolderSummary.replaceChildren(summary);
}

function imageAssetsForGroup(group) {
  const ordered = imageRoles.map((role) => group.assets?.[role]).filter(Boolean);
  const extra = Object.values(group.assets || {}).filter((asset) => !ordered.some((item) => item.slug === asset.slug));
  return [...ordered, ...extra];
}

function filterImageAssets(assets, group, query) {
  if (!query) return assets;
  return assets.filter((asset) => [
    imageFolderName(group),
    group.label,
    group.slug,
    asset.role,
    imageRoleLabels[asset.role],
    asset.type,
    asset.alt,
    ...(group.keywords || []),
  ].filter(Boolean).join(" ").toLowerCase().includes(query));
}

function imageFolderName(group) {
  if (!group) return "";
  return imageFolderLabels[group.slug] || group.label || group.slug;
}

function buildImageFolderPayload(group) {
  return {
    folder: group.slug,
    label: imageFolderName(group),
    keywords: group.keywords || [],
    images: imageAssetsForGroup(group).map((asset) => ({
      role: asset.role,
      label: imageRoleLabels[asset.role] || asset.role,
      src: asset.src,
      alt: asset.alt,
      downloads: downloadSizes.map((size) => ({
        size: size.key,
        label: size.label,
        width: size.width || "original",
      })),
    })),
    generatedAt: new Date().toISOString(),
  };
}

async function downloadImageVariant(asset, group, size) {
  const filename = imageDownloadFilename(asset, group, size);
  if (!size.width) {
    downloadFile(asset.src, filename);
    setMessage("Originele afbeelding downloaden gestart.", "success");
    return;
  }

  try {
    const image = await loadImage(asset.src);
    const scale = Math.min(size.width / image.naturalWidth, 1);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
    if (!blob) throw new Error("Canvas export gaf geen bestand terug.");
    const url = URL.createObjectURL(blob);
    downloadFile(url, filename);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage(`${size.label} afbeelding downloaden gestart.`, "success");
  } catch (error) {
    console.warn("Afbeelding downloaden mislukt.", error);
    downloadFile(asset.src, filename);
    setMessage("Download gestart met het originele bestand.", "success");
  }
}

function imageDownloadFilename(asset, group, size) {
  const extension = size.width ? "png" : (asset.src.split(".").pop() || "png").split("?")[0];
  return `maxwebstudio-${group.slug}-${asset.role}-${size.key}.${extension}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function downloadFile(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function filteredRecords(records, collectionName) {
  return records.filter((record) => {
    const haystack = JSON.stringify(record).toLowerCase();
    const status = record.status || "";
    const type = collectionName === "pages" ? "page" : record.contentType || "SEO";
    const matchesQuery = !filters.query || haystack.includes(filters.query);
    const matchesStatus = filters.status === "Alles" || status === filters.status;
    const matchesType = filters.type === "Alles" || type === filters.type;
    return matchesQuery && matchesStatus && matchesType;
  });
}

function fillForm(form, record) {
  Object.entries(record).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  setMessage("Item geopend om te bewerken.", "success");
}

function resetForm(form) {
  form.reset();
  if (form.elements.id) form.elements.id.value = "";
}

function removeRecord(collectionName, id) {
  state[collectionName] = state[collectionName].filter((record) => record.id !== id);
  touchState("Item verwijderd.");
}

function duplicateRecord(collectionName, record, titleKey) {
  const copy = {
    ...record,
    id: createId(collectionName.slice(0, -1)),
    [titleKey]: `${record[titleKey] || "Item"} copy`,
    status: record.status === "approved" ? "selected" : record.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state[collectionName].unshift(copy);
  touchState("Item gedupliceerd.");
}

function copyCurrentContentBlock() {
  const text = elements.blockForm.elements.textContent.value.trim();
  if (!text) {
    setMessage("Geen contenttekst om te kopiëren.", "error");
    return;
  }
  copyText(text, "Contenttekst gekopieerd.");
}

function createSeoFromPageForm() {
  const page = readPageForm(elements.pageForm);
  if (!page.pageName && !page.slug) {
    setMessage("Vul eerst een paginanaam of slug in.", "error");
    return;
  }
  const seoRecord = {
    id: createId("seo"),
    page: page.pageName || page.slug,
    seoTitle: page.seoTitle,
    metaDescription: page.metaDescription,
    focusKeyword: page.pageName,
    secondaryKeywords: "",
    searchIntent: page.purpose,
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.seoRecords.unshift(seoRecord);
  touchState("SEO record aangemaakt op basis van de pagina.");
}

function clearSelectedImages() {
  state.selectedImages = {};
  touchState("Beeldselectie gewist.");
}

function clearPackage() {
  const confirmed = window.confirm("Weet je zeker dat je de lokale AI Content Library wilt leegmaken?");
  if (!confirmed) return;
  state.contentBlocks = [];
  state.pages = [];
  state.seoRecords = [];
  state.selectedImages = {};
  touchState("Lokale workspace leeggemaakt.");
}

function loadSamplePackage() {
  Object.assign(state, createDefaultPackage(state.selectedBranch || "installatiebedrijf"));
  touchState("Voorbeeldpakket geladen.");
}

function createDefaultPackage(preferredBranch = "installatiebedrijf") {
  const timestamp = new Date().toISOString();
  const group = imageGroups.find((item) => item.slug === preferredBranch) || imageGroups[0];
  const selectedRoles = ["hero", "service", "team", "project", "contact", "detail", "review", "background"];
  const selectedImages = Object.fromEntries(selectedRoles.map((role) => {
    const asset = group.assets[role];
    if (!asset) return null;
    return [role, { role, branch: group.slug, src: asset.src, alt: asset.alt }];
  }).filter(Boolean));

  return {
    contentBlocks: [
    {
      id: createId("block"),
      title: "Homepage hero - premium lokaal bedrijf",
      contentType: "homepage hero",
      connectedPage: "Home",
      versionName: "v2 conversie",
      textContent: "Een professionele website die vertrouwen wekt en aanvragen oplevert. Max Webstudio combineert strategie, design, teksten, SEO en onderhoud in één helder traject voor lokale ondernemers.",
      status: "approved",
      notes: "Hoofdvariant voor demo's en salesgesprekken.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("block"),
      title: "Serviceblok - website laten maken",
      contentType: "service",
      connectedPage: "Diensten",
      versionName: "v1",
      textContent: "Van strategie en design tot techniek en onderhoud: alles wordt voorbereid om bezoekers sneller richting contact te brengen.",
      status: "approved",
      notes: "Te gebruiken op dienstenpagina.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("block"),
      title: "USP blok - waarom Max Webstudio",
      contentType: "USP",
      connectedPage: "Home",
      versionName: "v1 trust",
      textContent: "Eén aanspreekpunt, duidelijke planning, sterke visuals en een website die later makkelijk uitgebreid kan worden met SEO, content en klantportaalfuncties.",
      status: "selected",
      notes: "Geschikt voor homepage of offerte.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("block"),
      title: "About blok - persoonlijke aanpak",
      contentType: "about",
      connectedPage: "Over ons",
      versionName: "v1 warm",
      textContent: "We bouwen websites alsof ze iedere dag door echte klanten beoordeeld worden: helder, snel, rustig vormgegeven en afgestemd op hoe mensen zoeken, vergelijken en contact opnemen.",
      status: "selected",
      notes: "Kan per branche persoonlijker gemaakt worden.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("block"),
      title: "CTA blok - gratis website scan",
      contentType: "CTA",
      connectedPage: "Contact",
      versionName: "v1 lead",
      textContent: "Wil je weten waar je huidige website aanvragen laat liggen? Vraag een gratis websitescan aan en ontvang concrete verbeterpunten voor vindbaarheid, uitstraling en conversie.",
      status: "approved",
      notes: "Primaire lead CTA.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("block"),
      title: "SEO intro - website laten maken",
      contentType: "SEO",
      connectedPage: "Website laten maken",
      versionName: "v1 longform",
      textContent: "Een website laten maken draait niet alleen om een mooi ontwerp. Je wilt een site die snel laadt, vertrouwen geeft, logisch is opgebouwd en gevonden wordt door klanten die klaar zijn om contact op te nemen.",
      status: "approved",
      notes: "Basis voor SEO-landingspagina.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("block"),
      title: "Blog outline - betere lokale vindbaarheid",
      contentType: "blog",
      connectedPage: "Blog",
      versionName: "v1 outline",
      textContent: "Onderwerpen: Google bedrijfsprofiel, lokale zoekwoorden, duidelijke dienstenpagina's, reviews, snelheid, interne links en meetbare contactmomenten.",
      status: "draft",
      notes: "Nog uitwerken naar artikel.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("block"),
      title: "Social post - nieuwe website live",
      contentType: "social post",
      connectedPage: "Social",
      versionName: "LinkedIn",
      textContent: "Onze nieuwe website staat live. Strakker, sneller en duidelijker voor iedereen die online wil zien wat we doen, hoe we werken en hoe je direct contact opneemt.",
      status: "selected",
      notes: "Aanpassen per klant/branche.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("block"),
      title: "E-mail follow-up - na intake",
      contentType: "email",
      connectedPage: "Sales follow-up",
      versionName: "v1",
      textContent: "Bedankt voor het prettige gesprek. Ik heb de belangrijkste wensen samengevat en werk de volgende stap uit: een duidelijke websitestructuur, passende contentblokken en een voorstel voor planning.",
      status: "selected",
      notes: "Voor klantopvolging na intake.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("block"),
      title: "FAQ - doorlooptijd",
      contentType: "FAQ",
      connectedPage: "Veelgestelde vragen",
      versionName: "v1",
      textContent: "Een standaard website staat meestal binnen twee tot vier weken klaar, afhankelijk van content, feedback en gewenste functies.",
      status: "draft",
      notes: "Nog afstemmen op pakket.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("block"),
      title: "Rijschool template - pakkettenblok",
      contentType: "service",
      connectedPage: "Rijlessen",
      versionName: "branche template",
      textContent: "Van proefles tot examenvoorbereiding: toon pakketten, slagingsgerichte begeleiding, flexibele lestijden en de mogelijkheid om eenvoudig een intake of proefles aan te vragen.",
      status: "draft",
      notes: "Voor toekomstige rijschoolbeelden en demo-sites.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
    pages: [
    {
      id: createId("page"),
      pageName: "Home",
      slug: "home",
      purpose: "Heldere eerste indruk, vertrouwen opbouwen en bezoekers naar aanvraag sturen.",
      seoTitle: "Website laten maken voor lokale ondernemers | Max Webstudio",
      metaDescription: "Laat een snelle, professionele website maken die vertrouwen wekt en meer aanvragen oplevert.",
      connectedContentBlocks: "Homepage hero - premium lokaal bedrijf, Serviceblok - website laten maken",
      connectedImageRole: "hero",
      status: "approved",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("page"),
      pageName: "Diensten",
      slug: "diensten",
      purpose: "Pakketten en werkwijze uitleggen.",
      seoTitle: "Webdesign, SEO en onderhoud | Max Webstudio",
      metaDescription: "Ontdek hoe Max Webstudio websites, SEO en onderhoud combineert voor groei.",
      connectedContentBlocks: "Serviceblok - website laten maken",
      connectedImageRole: "service",
      status: "ready",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("page"),
      pageName: "Website laten maken",
      slug: "website-laten-maken",
      purpose: "SEO-landingspagina voor ondernemers die actief zoeken naar een nieuwe website.",
      seoTitle: "Website laten maken die aanvragen oplevert | Max Webstudio",
      metaDescription: "Laat een professionele website maken met sterke teksten, snelle techniek en een duidelijke route naar contact.",
      connectedContentBlocks: "SEO intro - website laten maken, CTA blok - gratis website scan",
      connectedImageRole: "detail",
      status: "approved",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("page"),
      pageName: "Over ons",
      slug: "over-ons",
      purpose: "Vertrouwen opbouwen met werkwijze, persoonlijke aanpak en kwaliteitssignalen.",
      seoTitle: "Over Max Webstudio | Strategie, design en onderhoud",
      metaDescription: "Leer hoe Max Webstudio websites bouwt voor ondernemers die professioneel online willen groeien.",
      connectedContentBlocks: "About blok - persoonlijke aanpak, USP blok - waarom Max Webstudio",
      connectedImageRole: "team",
      status: "ready",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("page"),
      pageName: "Portfolio",
      slug: "portfolio",
      purpose: "Cases en voorbeeldbranches tonen voor vertrouwen en herkenning.",
      seoTitle: "Website voorbeelden en branches | Max Webstudio",
      metaDescription: "Bekijk voorbeelden van websites en branches waarvoor Max Webstudio content, design en structuur voorbereidt.",
      connectedContentBlocks: "USP blok - waarom Max Webstudio",
      connectedImageRole: "project",
      status: "ready",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("page"),
      pageName: "Contact",
      slug: "contact",
      purpose: "Bezoekers laten bellen, mailen of een intake aanvragen.",
      seoTitle: "Contact met Max Webstudio | Vraag je websitescan aan",
      metaDescription: "Neem contact op met Max Webstudio voor een professionele website, SEO-content of een gratis websitescan.",
      connectedContentBlocks: "CTA blok - gratis website scan, E-mail follow-up - na intake",
      connectedImageRole: "contact",
      status: "approved",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("page"),
      pageName: "Rijschool demo",
      slug: "rijschool-website-laten-maken",
      purpose: "Voorbereide branchepagina voor rijscholen zodra de beeldset beschikbaar is.",
      seoTitle: "Website laten maken voor rijscholen | Max Webstudio",
      metaDescription: "Laat een rijschoolwebsite maken met pakketten, proeflesaanvragen, lokale SEO en duidelijke contactmomenten.",
      connectedContentBlocks: "Rijschool template - pakkettenblok",
      connectedImageRole: "hero",
      status: "planned",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
    seoRecords: [
    {
      id: createId("seo"),
      page: "Home",
      seoTitle: "Website laten maken voor lokale ondernemers | Max Webstudio",
      metaDescription: "Laat een snelle, professionele website maken die vertrouwen wekt en meer aanvragen oplevert.",
      focusKeyword: "website laten maken",
      secondaryKeywords: "webdesign bureau, website voor ondernemers",
      searchIntent: "Commercieel en lokaal",
      status: "approved",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("seo"),
      page: "Diensten",
      seoTitle: "Webdesign, SEO en onderhoud voor ondernemers | Max Webstudio",
      metaDescription: "Alles voor een professionele website: strategie, design, technische bouw, SEO-content en onderhoud.",
      focusKeyword: "webdesign en onderhoud",
      secondaryKeywords: "website onderhoud, SEO teksten, professionele website",
      searchIntent: "Commercieel vergelijkend",
      status: "approved",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("seo"),
      page: "Website laten maken",
      seoTitle: "Website laten maken die klanten overtuigt | Max Webstudio",
      metaDescription: "Laat een snelle website maken met professionele uitstraling, sterke content en een duidelijke conversieroute.",
      focusKeyword: "website laten maken",
      secondaryKeywords: "professionele website laten maken, website bureau, website laten bouwen",
      searchIntent: "Commercieel",
      status: "approved",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("seo"),
      page: "Over ons",
      seoTitle: "Over Max Webstudio | Websites voor lokale ondernemers",
      metaDescription: "Maak kennis met de aanpak van Max Webstudio: rustig proces, sterke content en websites die klaar zijn om te groeien.",
      focusKeyword: "webdesign bureau",
      secondaryKeywords: "Max Webstudio, website partner, lokale ondernemers",
      searchIntent: "Vertrouwen en oriëntatie",
      status: "selected",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("seo"),
      page: "Portfolio",
      seoTitle: "Website voorbeelden voor verschillende branches | Max Webstudio",
      metaDescription: "Bekijk hoe Max Webstudio websitestructuren, content en beelden voorbereidt voor uiteenlopende lokale branches.",
      focusKeyword: "website voorbeelden",
      secondaryKeywords: "portfolio webdesign, branche websites, demo websites",
      searchIntent: "Oriëntatie",
      status: "selected",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("seo"),
      page: "Contact",
      seoTitle: "Website scan aanvragen | Contact met Max Webstudio",
      metaDescription: "Vraag een gratis websitescan aan of bespreek je nieuwe website met Max Webstudio.",
      focusKeyword: "website scan aanvragen",
      secondaryKeywords: "contact webdesign bureau, website advies, nieuwe website offerte",
      searchIntent: "Actiegericht",
      status: "approved",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("seo"),
      page: "Rijschool demo",
      seoTitle: "Website laten maken voor rijscholen | Proefles en lokale SEO",
      metaDescription: "Een rijschoolwebsite met duidelijke pakketten, proeflesaanvragen, lokale vindbaarheid en professionele uitstraling.",
      focusKeyword: "website laten maken rijschool",
      secondaryKeywords: "rijschool website, proefles aanvragen, rijschool SEO",
      searchIntent: "Branchegericht commercieel",
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
    selectedBranch: group.slug,
    selectedImageFolder: group.slug,
    selectedImages,
    updatedAt: timestamp,
  };
}

function importPackage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      state.contentBlocks = Array.isArray(parsed.contentBlocks) ? parsed.contentBlocks : [];
      state.pages = Array.isArray(parsed.pages) ? parsed.pages : [];
      state.seoRecords = Array.isArray(parsed.seoRecords) ? parsed.seoRecords : [];
      state.selectedBranch = parsed.selectedBranch || state.selectedBranch;
      state.selectedImageFolder = parsed.selectedImageFolder || parsed.selectedBranch || state.selectedImageFolder;
      state.selectedImages = parsed.selectedImages && typeof parsed.selectedImages === "object" ? parsed.selectedImages : {};
      state.selectedBranch = state.selectedImageFolder;
      elements.branchSelector.value = state.selectedImageFolder;
      touchState("Contentpakket geïmporteerd.");
    } catch (error) {
      console.warn("Import mislukt.", error);
      setMessage("JSON import kon niet worden gelezen.", "error");
    } finally {
      event.target.value = "";
    }
  });
  reader.readAsText(file);
}

function exportPackage() {
  downloadJson(buildPackagePayload(), "maxwebstudio-ai-content-package.json");
  setMessage("Contentpakket geëxporteerd.", "success");
}

function copyPackageJson() {
  copyText(JSON.stringify(buildPackagePayload(), null, 2), "Contentpakket JSON gekopieerd.");
}

function pageCopyText(record) {
  return [record.pageName, record.slug, record.purpose, record.seoTitle, record.metaDescription].filter(Boolean).join("\n\n");
}

function seoCopyText(record) {
  return [
    `Pagina: ${record.page}`,
    `Focus keyword: ${record.focusKeyword}`,
    `SEO title: ${record.seoTitle}`,
    `Meta description: ${record.metaDescription}`,
    `Zoekintentie: ${record.searchIntent}`,
  ].filter(Boolean).join("\n");
}

function buildPackagePayload() {
  return {
    contentBlocks: state.contentBlocks,
    pages: state.pages,
    seoRecords: state.seoRecords,
    selectedBranch: state.selectedBranch,
    selectedImageFolder: state.selectedImageFolder,
    selectedImages: state.selectedImages,
    imageFolders: imageGroups.map(buildImageFolderPayload),
    readinessScore: calculateReadiness(),
    updatedAt: state.updatedAt || null,
    generatedAt: new Date().toISOString(),
  };
}

function calculateReadiness() {
  const contentReady = state.contentBlocks.length ? state.contentBlocks.filter((item) => ["selected", "approved"].includes(item.status)).length / state.contentBlocks.length : 0;
  const pageReady = state.pages.length ? state.pages.filter((item) => ["ready", "approved"].includes(item.status)).length / state.pages.length : 0;
  const seoReady = state.seoRecords.length ? state.seoRecords.filter((item) => ["selected", "approved"].includes(item.status)).length / state.seoRecords.length : 0;
  const imageReady = Math.min(Object.keys(state.selectedImages).length / 3, 1);
  return Math.round(((contentReady + pageReady + seoReady + imageReady) / 4) * 100);
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

async function copyText(text, successMessage) {
  if (!text) {
    setMessage("Geen tekst om te kopiëren.", "error");
    return;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setMessage(successMessage, "success");
  } catch (error) {
    console.warn("Kopiëren mislukt.", error);
    setMessage("Kopiëren is niet gelukt.", "error");
  }
}

function touchState(message) {
  state.updatedAt = new Date().toISOString();
  saveState();
  setMessage(message, "success");
  render();
}

function setMessage(message, type = "") {
  elements.message.textContent = message;
  elements.message.className = `admin-form-message ai-content-message ${type}`.trim();
}

function emptyState(message) {
  const empty = document.createElement("div");
  empty.className = "workflow-empty-state";
  empty.textContent = message;
  return empty;
}

function formatDate(date) {
  if (!date) return "geen datum";
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const stateFromStorage = {
      contentBlocks: Array.isArray(parsed.contentBlocks) ? parsed.contentBlocks : [],
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
      seoRecords: Array.isArray(parsed.seoRecords) ? parsed.seoRecords : [],
      selectedBranch: parsed.selectedBranch || "installatiebedrijf",
      selectedImageFolder: parsed.selectedImageFolder || parsed.selectedBranch || "installatiebedrijf",
      selectedImages: parsed.selectedImages && typeof parsed.selectedImages === "object" ? parsed.selectedImages : {},
      updatedAt: parsed.updatedAt || null,
    };
    const hasWorkspaceData = stateFromStorage.contentBlocks.length || stateFromStorage.pages.length || stateFromStorage.seoRecords.length || Object.keys(stateFromStorage.selectedImages).length;
    return hasWorkspaceData ? stateFromStorage : createDefaultPackage(stateFromStorage.selectedBranch);
  } catch (error) {
    console.warn("AI Content Library storage kon niet worden gelezen.", error);
    return createDefaultPackage("installatiebedrijf");
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
