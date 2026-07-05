"use strict";

(() => {
  const STORAGE_KEY = "maxwebstudioBrandCenterLab";
  const LIBRARY_CONFIG = {
    logos: ["assetName", "type", "format", "status", "previewUrl", "promptUsed", "notes"],
    images: ["assetName", "category", "tags", "previewUrl", "promptUsed", "status", "notes"],
    contentBlocks: ["title", "contentType", "pageConnection", "versionName", "status", "textContent"],
    pages: ["pageName", "slug", "purpose", "seoTitle", "metaDescription", "connectedContentBlocks", "connectedImageAssets", "status"],
  };
  const PROFILE_FIELDS = [
    "businessName",
    "industry",
    "targetAudience",
    "toneOfVoice",
    "mainOffer",
    "usp",
    "primaryColor",
    "secondaryColor",
    "fontPreference",
    "notes",
  ];
  const emptyState = {
    brandProfile: {},
    logos: [],
    images: [],
    contentBlocks: [],
    pages: [],
  };

  let state = structuredCloneSafe(emptyState);

  const storage = {
    read() {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch (error) {
        return null;
      }
    },
    write(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        return true;
      } catch (error) {
        return false;
      }
    },
    remove() {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        return true;
      } catch (error) {
        return false;
      }
    },
  };

  function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function bySelector(selector) {
    return document.querySelector(selector);
  }

  function setText(selector, value) {
    const element = bySelector(selector);
    if (element) {
      element.textContent = value;
    }
  }

  function saveState() {
    const saved = storage.write(state);
    setText("#brand-lab-save-state", saved ? "Draft opgeslagen" : "LocalStorage niet beschikbaar");
  }

  function loadState() {
    const raw = storage.read();
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      state = {
        brandProfile: parsed.brandProfile && typeof parsed.brandProfile === "object" ? parsed.brandProfile : {},
        logos: Array.isArray(parsed.logos) ? parsed.logos : [],
        images: Array.isArray(parsed.images) ? parsed.images : [],
        contentBlocks: Array.isArray(parsed.contentBlocks) ? parsed.contentBlocks : [],
        pages: Array.isArray(parsed.pages) ? parsed.pages : [],
      };
      setText("#brand-lab-save-state", "Draft geladen");
    } catch (error) {
      state = structuredCloneSafe(emptyState);
      setText("#brand-lab-save-state", "Draft kon niet geladen worden");
    }
  }

  function formToObject(form, fields) {
    return fields.reduce((record, fieldName) => {
      const field = form.elements[fieldName];
      record[fieldName] = field ? normalizeText(field.value) : "";
      return record;
    }, {});
  }

  function fillForm(form, record, fields) {
    fields.forEach((fieldName) => {
      const field = form.elements[fieldName];
      if (field) {
        field.value = record[fieldName] || "";
      }
    });
  }

  function statusClass(status) {
    const safeStatus = normalizeText(status).toLowerCase();
    if (safeStatus === "approved") {
      return "brand-lab-status-approved";
    }
    if (safeStatus === "selected" || safeStatus === "ready") {
      return "brand-lab-status-selected";
    }
    return "brand-lab-status-draft";
  }

  function appendCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value || "-";
    row.appendChild(cell);
    return cell;
  }

  function appendStatusCell(row, value) {
    const cell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `brand-lab-status ${statusClass(value)}`;
    badge.textContent = value || "draft";
    cell.appendChild(badge);
    row.appendChild(cell);
  }

  function safePreviewUrl(url) {
    const trimmedUrl = normalizeText(url);
    if (!trimmedUrl) {
      return "";
    }

    try {
      const parsedUrl = new URL(trimmedUrl, window.location.origin);
      if (["http:", "https:"].includes(parsedUrl.protocol)) {
        return parsedUrl.href;
      }
    } catch (error) {
      return "";
    }

    return "";
  }

  function appendPreviewCell(row, url) {
    const cell = document.createElement("td");
    const previewUrl = safePreviewUrl(url);
    if (previewUrl) {
      const link = document.createElement("a");
      link.href = previewUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open";
      cell.appendChild(link);
    } else if (url) {
      cell.textContent = "Ongeldige URL";
    } else {
      cell.textContent = "-";
    }
    row.appendChild(cell);
  }

  function appendActions(row, libraryName, recordId) {
    const cell = document.createElement("td");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    editButton.className = "button secondary brand-lab-small-button";
    editButton.type = "button";
    editButton.textContent = "Bewerk";
    editButton.addEventListener("click", () => editRecord(libraryName, recordId));

    deleteButton.className = "button danger brand-lab-small-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Verwijder";
    deleteButton.addEventListener("click", () => deleteRecord(libraryName, recordId));

    cell.append(editButton, deleteButton);
    row.appendChild(cell);
  }

  function renderLogos(row, record) {
    appendCell(row, record.assetName);
    appendCell(row, record.type);
    appendCell(row, record.format);
    appendStatusCell(row, record.status);
    appendPreviewCell(row, record.previewUrl);
  }

  function renderImages(row, record) {
    appendCell(row, record.assetName);
    appendCell(row, record.category);
    appendCell(row, record.tags);
    appendStatusCell(row, record.status);
    appendPreviewCell(row, record.previewUrl);
  }

  function renderContentBlocks(row, record) {
    appendCell(row, record.title);
    appendCell(row, record.contentType);
    appendCell(row, record.pageConnection);
    appendCell(row, record.versionName);
    appendStatusCell(row, record.status);
  }

  function renderPages(row, record) {
    appendCell(row, record.pageName);
    appendCell(row, record.slug);
    appendCell(row, record.seoTitle ? "Ja" : "Nee");
    appendCell(row, record.metaDescription ? "Ja" : "Nee");
    appendStatusCell(row, record.status);
  }

  function renderLibrary(libraryName) {
    const table = bySelector(`[data-library-table="${libraryName}"]`);
    const empty = bySelector(`[data-library-empty="${libraryName}"]`);
    const records = state[libraryName] || [];

    if (!table || !empty) {
      return;
    }

    table.textContent = "";
    empty.hidden = records.length > 0;

    records.forEach((record) => {
      const row = document.createElement("tr");
      if (libraryName === "logos") {
        renderLogos(row, record);
      } else if (libraryName === "images") {
        renderImages(row, record);
      } else if (libraryName === "contentBlocks") {
        renderContentBlocks(row, record);
      } else if (libraryName === "pages") {
        renderPages(row, record);
      }
      appendActions(row, libraryName, record.id);
      table.appendChild(row);
    });
  }

  function renderProfileForm() {
    const form = bySelector("#brand-profile-form");
    if (form) {
      fillForm(form, state.brandProfile, PROFILE_FIELDS);
    }
  }

  function profileComplete() {
    return PROFILE_FIELDS.every((fieldName) => normalizeText(state.brandProfile[fieldName]));
  }

  function hasApprovedLogo() {
    return state.logos.some((logo) => logo.status === "approved");
  }

  function hasApprovedHeroImage() {
    return state.images.some((image) => image.category === "hero" && image.status === "approved");
  }

  function hasHomepageContentReady() {
    return state.contentBlocks.some((block) => block.contentType === "homepage hero" && ["selected", "approved"].includes(block.status));
  }

  function hasContactPagePlanned() {
    return state.pages.some((page) => {
      const name = `${page.pageName || ""} ${page.slug || ""}`.toLowerCase();
      return name.includes("contact") && ["planned", "ready", "approved"].includes(page.status);
    });
  }

  function hasSeoMeta() {
    return state.pages.some((page) => normalizeText(page.seoTitle) && normalizeText(page.metaDescription));
  }

  function getReadiness() {
    const checks = [
      { label: "Brand profile complete", done: profileComplete() },
      { label: "At least 1 approved logo", done: hasApprovedLogo() },
      { label: "At least 1 approved hero image", done: hasApprovedHeroImage() },
      { label: "Homepage content ready", done: hasHomepageContentReady() },
      { label: "Contact page planned", done: hasContactPagePlanned() },
      { label: "SEO title/meta available", done: hasSeoMeta() },
    ];
    const completed = checks.filter((check) => check.done).length;
    return {
      checks,
      percentage: Math.round((completed / checks.length) * 100),
    };
  }

  function renderReadiness() {
    const readiness = getReadiness();
    const checklist = bySelector("#brand-lab-checklist");
    const progressBar = bySelector("#brand-lab-progress-bar");

    setText("#brand-lab-score", `${readiness.percentage}%`);
    if (progressBar) {
      progressBar.style.width = `${readiness.percentage}%`;
    }
    if (!checklist) {
      return;
    }

    checklist.textContent = "";
    readiness.checks.forEach((check) => {
      const item = document.createElement("article");
      item.className = check.done ? "brand-lab-check is-done" : "brand-lab-check";

      const marker = document.createElement("span");
      marker.textContent = check.done ? "✓" : "•";

      const label = document.createElement("strong");
      label.textContent = check.label;

      item.append(marker, label);
      checklist.appendChild(item);
    });
  }

  function renderAll() {
    renderProfileForm();
    Object.keys(LIBRARY_CONFIG).forEach(renderLibrary);
    renderReadiness();
  }

  function upsertRecord(libraryName, form) {
    const fields = LIBRARY_CONFIG[libraryName];
    const id = normalizeText(form.elements.id.value) || createId(libraryName);
    const record = { id, ...formToObject(form, fields) };
    const records = state[libraryName];
    const existingIndex = records.findIndex((item) => item.id === id);

    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.unshift(record);
    }

    form.reset();
    form.elements.id.value = "";
    saveState();
    renderAll();
  }

  function editRecord(libraryName, recordId) {
    const form = bySelector(`[data-library-form="${libraryName}"]`);
    const fields = LIBRARY_CONFIG[libraryName];
    const record = state[libraryName].find((item) => item.id === recordId);

    if (!form || !record) {
      return;
    }

    form.elements.id.value = record.id;
    fillForm(form, record, fields);
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function deleteRecord(libraryName, recordId) {
    state[libraryName] = state[libraryName].filter((item) => item.id !== recordId);
    saveState();
    renderAll();
  }

  function exportPackage() {
    const readiness = getReadiness();
    const packageData = {
      brandProfile: state.brandProfile,
      logos: state.logos,
      images: state.images,
      contentBlocks: state.contentBlocks,
      pages: state.pages,
      readinessScore: readiness.percentage,
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(packageData, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const name = normalizeText(state.brandProfile.businessName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand-package";

    link.href = url;
    link.download = `${name}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    const profileForm = bySelector("#brand-profile-form");
    if (profileForm) {
      profileForm.addEventListener("submit", (event) => {
        event.preventDefault();
        state.brandProfile = formToObject(profileForm, PROFILE_FIELDS);
        saveState();
        renderReadiness();
      });
    }

    document.querySelectorAll("[data-library-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const libraryName = form.dataset.libraryForm;
        if (libraryName && LIBRARY_CONFIG[libraryName]) {
          upsertRecord(libraryName, form);
        }
      });
      form.addEventListener("reset", () => {
        window.setTimeout(() => {
          form.elements.id.value = "";
        }, 0);
      });
    });

    const exportButton = bySelector("#brand-lab-export");
    if (exportButton) {
      exportButton.addEventListener("click", exportPackage);
    }

    const clearButton = bySelector("#brand-lab-clear");
    if (clearButton) {
      clearButton.addEventListener("click", () => {
        state = structuredCloneSafe(emptyState);
        storage.remove();
        setText("#brand-lab-save-state", "Draft gewist");
        renderAll();
      });
    }
  }

  loadState();
  bindEvents();
  renderAll();
})();
