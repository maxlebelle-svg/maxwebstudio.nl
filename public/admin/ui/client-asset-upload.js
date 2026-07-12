(function initClientAssetUpload() {
  "use strict";

  const API_ENDPOINT = "/api/client-relationship-assets";
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const ASSET_UPDATED_EVENT = "relationship-assets:updated";
  const ASSET_REFRESH_EVENT = "relationship-assets:refresh-requested";
  const ALLOWED_FILES = Object.freeze({
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    png: ["image/png"],
    webp: ["image/webp"],
    svg: ["image/svg+xml"],
    pdf: ["application/pdf"],
    txt: ["text/plain"],
    doc: ["application/msword"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    mp4: ["video/mp4"],
    webm: ["video/webm"],
  });
  const ALLOWED_CATEGORIES = new Set(["logo", "photo", "team", "project", "product", "brand", "video", "document", "text", "social", "other"]);
  const PREVIEW_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

  const form = document.getElementById("relationship-asset-upload");
  if (!form) return;

  const input = document.getElementById("relationship-asset-files");
  const dropzone = document.getElementById("relationship-asset-dropzone");
  const chooseButton = document.getElementById("relationship-asset-choose");
  const selectedList = document.getElementById("relationship-asset-selected-list");
  const category = document.getElementById("relationship-asset-category");
  const description = document.getElementById("relationship-asset-description");
  const descriptionCount = document.getElementById("relationship-asset-description-count");
  const rights = document.getElementById("relationship-asset-rights");
  const submitButton = document.getElementById("relationship-asset-submit");
  const submitLabel = submitButton?.querySelector("[data-upload-submit-label]");
  const submitLoading = submitButton?.querySelector("[data-upload-submit-loading]");
  const statusCard = document.getElementById("relationship-asset-status");
  const statusIcon = statusCard?.querySelector("[data-upload-status-icon]");
  const statusTitle = statusCard?.querySelector("[data-upload-status-title]");
  const statusMessage = statusCard?.querySelector("[data-upload-status-message]");
  const progress = document.getElementById("relationship-asset-progress");
  const progressTrack = progress?.querySelector("[role='progressbar']");
  const progressBar = document.getElementById("relationship-asset-progress-bar");
  const progressLabel = document.getElementById("relationship-asset-progress-label");
  const requestPanel = document.getElementById("relationship-asset-request-panel");
  const requestList = document.getElementById("relationship-upload-list");
  const fileError = document.getElementById("relationship-asset-files-error");
  const categoryError = document.getElementById("relationship-asset-category-error");
  const descriptionError = document.getElementById("relationship-asset-description-error");
  const rightsError = document.getElementById("relationship-asset-rights-error");

  let selectedFiles = [];
  let isUploading = false;
  let dragDepth = 0;
  let loadSequence = 0;
  let previewUrls = new Map();
  const previewInflight = new Map();
  const previewWaiters = [];
  let activePreviewDownloads = 0;
  const MAX_CONCURRENT_PREVIEWS = 2;

  function storedToken() {
    for (const key of ["maxwebstudioSupabaseAuthSession", "mws_client_supabase_session"]) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        const token = value?.access_token || value?.accessToken || value?.session?.access_token || "";
        if (token) return token;
      } catch {
        // A malformed local cache never becomes an authorization source.
      }
    }
    return "";
  }

  function extensionOf(name = "") {
    const match = String(name).trim().toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] || "";
  }

  function effectiveMimeType(file = {}) {
    const provided = String(file.type || "").trim().toLowerCase();
    const extension = extensionOf(file.name);
    return (provided && provided !== "application/octet-stream") ? provided : ALLOWED_FILES[extension]?.[0] || "application/octet-stream";
  }

  function fileKey(file = {}) {
    return [file.name, file.size, file.lastModified, effectiveMimeType(file)].join("|");
  }

  function formatFileSize(bytes = 0) {
    const value = Number(bytes || 0);
    if (!value) return "0 B";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
    return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  function validationError(file = {}) {
    const name = String(file.name || "").normalize("NFC").trim();
    const extension = extensionOf(file.name);
    const allowedMimes = ALLOWED_FILES[extension];
    const providedMime = String(file.type || "").trim().toLowerCase();
    if (!name || name.length > 255 || /[\u0000-\u001f\u007f\\/]/.test(name) || name === "." || name === "..") {
      return { code: "INVALID_FILENAME", message: "De bestandsnaam is niet geldig. Geef het bestand een andere naam en probeer opnieuw." };
    }
    if (!allowedMimes || (providedMime && providedMime !== "application/octet-stream" && !allowedMimes.includes(providedMime))) {
      return { code: "UNSUPPORTED_FILE_TYPE", message: "Dit bestandstype wordt niet ondersteund." };
    }
    if (!Number(file.size || 0)) {
      return { code: "EMPTY_FILE", message: "Het bestand is leeg of beschadigd." };
    }
    if (Number(file.size) > MAX_FILE_BYTES) {
      return { code: "FILE_TOO_LARGE", message: "Het bestand is groter dan toegestaan. Kies een bestand van maximaal 8 MB." };
    }
    return null;
  }

  function setFieldError(element, message = "", target = null) {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
    target?.toggleAttribute("aria-invalid", Boolean(message));
  }

  function clearFieldErrors() {
    setFieldError(fileError, "", dropzone);
    setFieldError(categoryError, "", category);
    setFieldError(descriptionError, "", description);
    setFieldError(rightsError, "", rights);
  }

  function setProgress(percent = 0, label = "") {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent || 0))));
    if (progressBar) progressBar.style.width = `${value}%`;
    if (progressLabel) progressLabel.textContent = label || `${value}%`;
    if (progressTrack) progressTrack.setAttribute("aria-valuenow", String(value));
  }

  function setStatus(state, title, message, options = {}) {
    if (!statusCard) return;
    const icons = { info: "i", loading: "↑", success: "✓", error: "!" };
    statusCard.hidden = false;
    statusCard.dataset.state = state;
    if (statusIcon) statusIcon.textContent = icons[state] || "i";
    if (statusTitle) statusTitle.textContent = title;
    if (statusMessage) statusMessage.textContent = message;
    if (progress) progress.hidden = options.progress == null;
    if (options.progress != null) setProgress(options.progress, options.progressLabel);
  }

  function updateDescriptionCount() {
    if (descriptionCount) descriptionCount.textContent = String(description?.value.length || 0);
  }

  function selectedFileIcon(file = {}) {
    const extension = extensionOf(file.name);
    if (["jpg", "jpeg", "png", "webp"].includes(extension)) return "IMG";
    if (extension === "svg") return "SVG";
    if (extension === "pdf") return "PDF";
    if (["doc", "docx"].includes(extension)) return "DOC";
    if (["mp4", "webm"].includes(extension)) return "VID";
    if (extension === "txt") return "TXT";
    return "FILE";
  }

  function renderSelectedFiles() {
    selectedList?.replaceChildren();
    if (!selectedFiles.length) {
      const empty = document.createElement("p");
      empty.className = "customer-asset-selected-empty";
      empty.textContent = "Nog geen bestanden gekozen.";
      selectedList?.append(empty);
    } else {
      selectedFiles.forEach((file) => {
        const card = document.createElement("article");
        card.className = "customer-asset-selected-card";
        const icon = document.createElement("span");
        icon.className = "customer-asset-selected-icon";
        icon.textContent = selectedFileIcon(file);
        icon.setAttribute("aria-hidden", "true");
        const info = document.createElement("div");
        const name = document.createElement("strong");
        const meta = document.createElement("span");
        name.textContent = file.name;
        name.title = file.name;
        meta.textContent = `${effectiveMimeType(file)} · ${formatFileSize(file.size)}`;
        info.append(name, meta);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "customer-asset-remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Verwijder ${file.name}`);
        remove.disabled = isUploading;
        remove.addEventListener("click", () => {
          if (isUploading) return;
          selectedFiles = selectedFiles.filter((item) => fileKey(item) !== fileKey(file));
          renderSelectedFiles();
          setFieldError(fileError, "", dropzone);
          if (!selectedFiles.length && statusCard) statusCard.hidden = true;
          else setStatus("info", "Klaar om te uploaden", `${selectedFiles.length} ${selectedFiles.length === 1 ? "bestand is" : "bestanden zijn"} geselecteerd.`);
        });
        card.append(icon, info, remove);
        selectedList?.append(card);
      });
    }
    if (submitButton) submitButton.disabled = isUploading || !selectedFiles.length;
  }

  function addFiles(files = []) {
    if (isUploading) return;
    const known = new Set(selectedFiles.map(fileKey));
    const errors = [];
    let addedCount = 0;
    let duplicateCount = 0;
    [...files].forEach((file) => {
      const problem = validationError(file);
      if (problem) {
        errors.push(problem);
        return;
      }
      const key = fileKey(file);
      if (known.has(key)) {
        duplicateCount += 1;
        return;
      }
      known.add(key);
      selectedFiles.push(file);
      addedCount += 1;
    });
    renderSelectedFiles();
    if (errors.length) {
      setFieldError(fileError, errors[0].message, dropzone);
      setStatus("error", "Bestand niet toegevoegd", errors[0].message);
    } else {
      setFieldError(fileError, "", dropzone);
      if (addedCount) {
        setStatus("info", "Klaar om te uploaden", `${selectedFiles.length} ${selectedFiles.length === 1 ? "bestand is" : "bestanden zijn"} geselecteerd.`);
      } else if (duplicateCount) {
        setStatus("info", "Bestand al geselecteerd", "Dit bestand staat al klaar om te uploaden.");
      }
    }
    if (input) input.value = "";
  }

  function validateForm() {
    clearFieldErrors();
    if (!selectedFiles.length) {
      setFieldError(fileError, "Geen bestand geselecteerd.", dropzone);
      chooseButton?.focus();
      return false;
    }
    const invalid = selectedFiles.find(validationError);
    if (invalid) {
      setFieldError(fileError, validationError(invalid).message, dropzone);
      chooseButton?.focus();
      return false;
    }
    if (!ALLOWED_CATEGORIES.has(String(category?.value || ""))) {
      setFieldError(categoryError, "Kies een geldige categorie.", category);
      category?.focus();
      return false;
    }
    const descriptionValue = String(description?.value || "");
    if (descriptionValue.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(descriptionValue)) {
      setFieldError(descriptionError, "Pas de korte omschrijving aan en probeer opnieuw.", description);
      description?.focus();
      return false;
    }
    if (!rights?.checked) {
      setFieldError(rightsError, "Bevestig dat je deze bestanden mag aanleveren.", rights);
      rights?.focus();
      return false;
    }
    return true;
  }

  function setUploading(value) {
    isUploading = Boolean(value);
    form.setAttribute("aria-busy", String(isUploading));
    dropzone?.setAttribute("aria-disabled", String(isUploading));
    [input, chooseButton, category, description, rights].forEach((control) => {
      if (control) control.disabled = isUploading;
    });
    if (submitLabel) submitLabel.hidden = isUploading;
    if (submitLoading) submitLoading.hidden = !isUploading;
    renderSelectedFiles();
  }

  function technicalError(code, stage, message, extra = {}) {
    const error = new Error(message || code);
    error.code = code;
    error.stage = stage;
    Object.assign(error, extra);
    return error;
  }

  function customerMessage(error = {}) {
    const code = String(error.code || "").toUpperCase();
    if (["AUTH_REQUIRED", "FORBIDDEN"].includes(code) || error.status === 401 || error.status === 403) {
      return "Je sessie is verlopen. Log opnieuw in om bestanden aan te leveren.";
    }
    if (code === "NO_FILE") return "Geen bestand geselecteerd.";
    if (code === "INVALID_FILENAME") return "De bestandsnaam is niet geldig. Geef het bestand een andere naam en probeer opnieuw.";
    if (code === "INVALID_CATEGORY") return "Kies een geldige categorie.";
    if (code === "INVALID_DESCRIPTION") return "Pas de korte omschrijving aan en probeer opnieuw.";
    if (code === "UNSUPPORTED_FILE_TYPE") return "Dit bestandstype wordt niet ondersteund.";
    if (["INVALID_FILE", "MIME_MISMATCH"].includes(code)) return "Het bestand is leeg of beschadigd.";
    if (code === "INVALID_UPLOAD") return "De upload kon niet worden afgerond. Kies het bestand opnieuw.";
    if (code === "FILE_TOO_LARGE" || error.status === 413) return "Het bestand is groter dan toegestaan. Kies een bestand van maximaal 8 MB.";
    if (["EMPTY_FILE", "FILE_READ_FAILED", "FILE_SIZE_MISMATCH"].includes(code)) return "Het bestand is leeg of beschadigd.";
    if (code === "USAGE_RIGHTS_REQUIRED") return "Bevestig dat je deze bestanden mag aanleveren.";
    if (error.stage === "download") return "Het bestand kon tijdelijk niet worden geopend. Probeer het opnieuw.";
    return "Uploaden is tijdelijk niet gelukt. Probeer het opnieuw.";
  }

  function logTechnicalError(error = {}, file = null) {
    console.error("Customer asset upload failed", {
      stage: error.stage || "unknown",
      code: error.code || "UPLOAD_FAILED",
      status: error.status || 0,
      errorName: error.name || "Error",
      message: error.message || "Unknown upload error",
      file: file ? { name: file.name, type: effectiveMimeType(file), sizeBytes: Number(file.size || 0) } : null,
    });
  }

  async function requestJson(action, payload = {}) {
    const auth = storedToken();
    if (!auth) throw technicalError("AUTH_REQUIRED", action, "Missing customer bearer token", { status: 401 });
    let response;
    try {
      response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${auth}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ action, ...payload }),
      });
    } catch (error) {
      throw technicalError("NETWORK_ERROR", action, error.message || "Metadata request failed");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw technicalError(data.code || "API_ERROR", action, data.error || `Asset ${action} failed`, { status: response.status });
    }
    return data;
  }

  function signedUploadUrl(value = "") {
    try {
      const url = new URL(String(value));
      const isSupabaseStorage = url.protocol === "https:"
        && url.hostname.endsWith(".supabase.co")
        && url.pathname.startsWith("/storage/v1/object/upload/sign/relationship-assets/");
      const developmentHosts = new Set(["localhost", "127.0.0.1", "::1"]);
      const localDevelopment = developmentHosts.has(window.location.hostname)
        && developmentHosts.has(url.hostname)
        && ["http:", "https:"].includes(url.protocol)
        && url.pathname.startsWith("/storage/v1/object/upload/sign/relationship-assets/");
      if (!isSupabaseStorage && !localDevelopment) return "";
      if (url.username || url.password) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function uploadPreparedFile(file, prepared = {}, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      const uploadUrl = signedUploadUrl(prepared.uploadUrl);
      if (!uploadUrl) {
        reject(technicalError("INVALID_UPLOAD_TARGET", "upload", "Prepare response contained no safe signed upload URL"));
        return;
      }
      if (prepared.uploadMethod !== "PUT") {
        reject(technicalError("INVALID_UPLOAD_METHOD", "upload", "Prepare response contained an unsupported upload method"));
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      const safeHeaders = prepared.uploadHeaders && typeof prepared.uploadHeaders === "object" ? prepared.uploadHeaders : {};
      Object.entries(safeHeaders).forEach(([name, value]) => {
        if (["x-upsert", "cache-control"].includes(String(name).toLowerCase())) xhr.setRequestHeader(name, String(value));
      });
      xhr.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable) return;
        onProgress(Math.max(0, Math.min(1, event.loaded / event.total)));
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(1);
          resolve();
          return;
        }
        reject(technicalError("SIGNED_UPLOAD_FAILED", "upload", `Signed storage upload returned ${xhr.status}`, { status: xhr.status }));
      });
      xhr.addEventListener("error", () => reject(technicalError("SIGNED_UPLOAD_NETWORK_ERROR", "upload", "Signed storage upload network error")));
      xhr.addEventListener("abort", () => reject(technicalError("SIGNED_UPLOAD_ABORTED", "upload", "Signed storage upload was aborted")));
      xhr.addEventListener("timeout", () => reject(technicalError("SIGNED_UPLOAD_TIMEOUT", "upload", "Signed storage upload timed out")));
      xhr.timeout = 120000;
      const body = new FormData();
      const uploadMimeType = effectiveMimeType(file);
      const uploadFile = String(file.type || "").toLowerCase() === uploadMimeType
        ? file
        : new File([file], file.name, { type: uploadMimeType, lastModified: file.lastModified });
      body.append("cacheControl", "3600");
      body.append("", uploadFile);
      xhr.send(body);
    });
  }

  function normalizeAsset(asset = {}) {
    const id = String(asset.id || "");
    const name = String(asset.originalFilename || asset.original_filename || asset.name || "Bestand");
    const mimeType = String(asset.mimeType || asset.mime_type || "").toLowerCase();
    const previewUrl = String(asset.previewUrl || "");
    return {
      id,
      name,
      originalFilename: name,
      mimeType,
      sizeBytes: Number(asset.sizeBytes ?? asset.size_bytes ?? 0),
      category: String(asset.category || "other"),
      status: String(asset.status || "new"),
      source: String(asset.source || asset.uploadedByType || asset.uploaded_by_type || "customer"),
      uploadedByType: String(asset.uploadedByType || asset.uploaded_by_type || "customer"),
      description: String(asset.description || ""),
      createdAt: String(asset.createdAt || asset.created_at || ""),
      updatedAt: String(asset.updatedAt || asset.updated_at || asset.createdAt || asset.created_at || ""),
      downloadAvailable: asset.downloadAvailable === true,
      previewAvailable: asset.previewAvailable === true,
      previewUrl: previewUrl.startsWith(`blob:${window.location.origin}/`) ? previewUrl : "",
      isRelationshipAsset: true,
    };
  }

  function mergeAssets(primary = [], secondary = []) {
    const merged = new Map();
    [...secondary, ...primary].forEach((asset) => {
      const normalized = normalizeAsset(asset);
      const key = normalized.id || [normalized.name, normalized.sizeBytes, normalized.updatedAt].join("|");
      if (key) merged.set(key, normalized);
    });
    return [...merged.values()];
  }

  function publishAssets(assets = [], source = "metadata") {
    const safeAssets = assets.map(normalizeAsset);
    window.__MWS_RELATIONSHIP_ASSETS__ = safeAssets;
    window.dispatchEvent(new CustomEvent(ASSET_UPDATED_EVENT, {
      detail: { assets: safeAssets, source },
    }));
  }

  function renderRequests(requests = []) {
    requestList?.replaceChildren();
    if (!requestPanel || !requestList) return;
    requestPanel.hidden = !requests.length;
    requests.forEach((request) => {
      const card = document.createElement("article");
      card.className = "customer-asset-request-card";
      const title = document.createElement("strong");
      const instructions = document.createElement("p");
      const meta = document.createElement("small");
      title.textContent = String(request.title || "Bestanden gevraagd");
      instructions.textContent = String(request.instructions || "Lever de gevraagde bestanden aan via het formulier hierboven.");
      const count = Math.max(1, Number(request.minimumCount ?? request.minimum_count ?? 1));
      const deadline = request.deadline ? ` · voor ${new Date(request.deadline).toLocaleDateString("nl-NL")}` : "";
      meta.textContent = `${count} ${count === 1 ? "bestand" : "bestanden"} gevraagd${deadline}`;
      card.append(title, instructions, meta);
      requestList.append(card);
    });
  }

  async function fetchAssetBlob(assetId, auth) {
    let response;
    try {
      response = await fetch(`${API_ENDPOINT}?download=${encodeURIComponent(assetId)}`, {
        headers: { Accept: "*/*", Authorization: `Bearer ${auth}` },
        cache: "no-store",
        redirect: "follow",
      });
    } catch (error) {
      throw technicalError("DOWNLOAD_NETWORK_ERROR", "download", error.message || "Asset download failed");
    }
    if (!response.ok) throw technicalError("DOWNLOAD_FAILED", "download", `Asset download returned ${response.status}`, { status: response.status });
    const blob = await response.blob();
    const contentType = String(blob.type || response.headers.get("content-type") || "").toLowerCase();
    if (!blob.size || blob.size > MAX_FILE_BYTES || /^(?:text\/html|application\/(?:json|problem\+json))\b/.test(contentType)) {
      throw technicalError("INVALID_DOWNLOAD", "download", "Asset download response was empty, oversized or not a file");
    }
    return blob;
  }

  async function withPreviewSlot(task) {
    if (activePreviewDownloads >= MAX_CONCURRENT_PREVIEWS) {
      await new Promise((resolve) => previewWaiters.push(resolve));
    }
    activePreviewDownloads += 1;
    try {
      return await task();
    } finally {
      activePreviewDownloads = Math.max(0, activePreviewDownloads - 1);
      previewWaiters.shift()?.();
    }
  }

  window.getRelationshipAssetPreview = async function getRelationshipAssetPreview(assetId, updatedAt = "") {
    const id = String(assetId || "").trim();
    const version = String(updatedAt || "");
    const auth = storedToken();
    if (!id || !auth) return "";
    const existing = previewUrls.get(id);
    if (existing?.updatedAt === version) return existing.url;
    const inflightKey = `${id}|${version}`;
    if (previewInflight.has(inflightKey)) return previewInflight.get(inflightKey);
    const request = withPreviewSlot(async () => {
      try {
        const blob = await fetchAssetBlob(id, auth);
        if (!PREVIEW_MIME_TYPES.has(String(blob.type || "").toLowerCase())) return "";
        const url = URL.createObjectURL(blob);
        const previous = previewUrls.get(id);
        if (previous?.url && previous.url !== url) URL.revokeObjectURL(previous.url);
        previewUrls.set(id, { url, updatedAt: version });
        return url;
      } catch (error) {
        logTechnicalError(error);
        return "";
      } finally {
        previewInflight.delete(inflightKey);
      }
    });
    previewInflight.set(inflightKey, request);
    return request;
  }

  async function loadAssets(options = {}) {
    const auth = storedToken();
    if (!auth) return { ok: false, assets: [] };
    const sequence = ++loadSequence;
    try {
      const response = await fetch(API_ENDPOINT, {
        headers: { Authorization: `Bearer ${auth}`, Accept: "application/json" },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw technicalError(data.code || "ASSET_LIST_FAILED", "list", data.error || `Asset list returned ${response.status}`, { status: response.status });
      }
      if (sequence !== loadSequence) return { ok: false, stale: true, assets: [] };
      const assets = Array.isArray(data.assets) ? data.assets.map(normalizeAsset) : [];
      const requests = Array.isArray(data.requests) ? data.requests : [];
      const currentIds = new Set(assets.map((asset) => asset.id).filter(Boolean));
      previewUrls.forEach((entry, id) => {
        if (!currentIds.has(id)) {
          URL.revokeObjectURL(entry.url);
          previewUrls.delete(id);
        }
      });
      renderRequests(requests);
      publishAssets(assets, options.source || "refresh");
      return { ok: true, assets };
    } catch (error) {
      logTechnicalError(error);
      return { ok: false, assets: [] };
    }
  }

  window.openRelationshipAsset = async function openRelationshipAsset(assetId, fileName = "bestand") {
    const auth = storedToken();
    if (!auth) {
      const error = technicalError("AUTH_REQUIRED", "download", "Missing customer bearer token", { status: 401 });
      error.customerMessage = customerMessage(error);
      throw error;
    }
    try {
      const blob = await fetchAssetBlob(String(assetId || ""), auth);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = String(fileName || "bestand");
      link.rel = "noopener";
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      return true;
    } catch (error) {
      logTechnicalError(error);
      error.customerMessage = customerMessage(error);
      throw error;
    }
  };

  async function uploadFiles() {
    if (isUploading || !validateForm()) return;
    const queue = [...selectedFiles];
    const totalBytes = queue.reduce((sum, file) => sum + Number(file.size || 0), 0) || 1;
    const completedKeys = new Set();
    const completedAssets = [];
    let completedBytes = 0;
    setUploading(true);
    setStatus("loading", "Upload wordt voorbereid", `Bestand 1 van ${queue.length}`, { progress: 0, progressLabel: "0%" });
    try {
      for (const [index, file] of queue.entries()) {
        setStatus("loading", "Veilig uploaden", `${file.name} · ${index + 1} van ${queue.length}`, {
          progress: (completedBytes / totalBytes) * 100,
          progressLabel: `${Math.round((completedBytes / totalBytes) * 100)}%`,
        });
        const prepared = await requestJson("prepare", {
          name: file.name,
          mimeType: effectiveMimeType(file),
          sizeBytes: Number(file.size),
          category: category.value,
          description: description.value.trim(),
          usageRightsConfirmed: rights.checked,
        });
        if (!prepared.uploadId) throw technicalError("INVALID_PREPARE_RESPONSE", "prepare", "Prepare response contained no upload id");
        await uploadPreparedFile(file, prepared, (fileProgress) => {
          const uploadedBytes = completedBytes + (Number(file.size) * fileProgress);
          const percent = (uploadedBytes / totalBytes) * 100;
          setProgress(percent, `${Math.round(percent)}% · ${index + 1} van ${queue.length}`);
        });
        const finalized = await requestJson("finalize", { uploadId: prepared.uploadId });
        if (finalized.asset) completedAssets.push(normalizeAsset(finalized.asset));
        completedKeys.add(fileKey(file));
        completedBytes += Number(file.size || 0);
      }
      publishAssets(mergeAssets(completedAssets, window.__MWS_RELATIONSHIP_ASSETS__ || []), "upload-optimistic");
      form.reset();
      selectedFiles = [];
      updateDescriptionCount();
      renderSelectedFiles();
      const refresh = await loadAssets({ source: "upload" });
      const successMessage = refresh.ok
        ? `${queue.length} ${queue.length === 1 ? "bestand staat" : "bestanden staan"} veilig in je Asset Center.`
        : `${queue.length} ${queue.length === 1 ? "bestand is" : "bestanden zijn"} veilig opgeslagen. Vernieuw de pagina als de bibliotheek nog niet is bijgewerkt.`;
      setStatus("success", "Bestand succesvol toegevoegd", successMessage, {
        progress: 100,
        progressLabel: "100% voltooid",
      });
    } catch (error) {
      const activeFile = queue.find((file) => !completedKeys.has(fileKey(file))) || null;
      logTechnicalError(error, activeFile);
      if (error.code === "INVALID_CATEGORY") setFieldError(categoryError, customerMessage(error), category);
      if (error.code === "INVALID_DESCRIPTION") setFieldError(descriptionError, customerMessage(error), description);
      if (error.code === "USAGE_RIGHTS_REQUIRED") setFieldError(rightsError, customerMessage(error), rights);
      if (["NO_FILE", "INVALID_FILENAME", "INVALID_FILE", "UNSUPPORTED_FILE_TYPE", "MIME_MISMATCH", "FILE_TOO_LARGE", "EMPTY_FILE", "FILE_SIZE_MISMATCH"].includes(error.code)) {
        setFieldError(fileError, customerMessage(error), dropzone);
      }
      selectedFiles = selectedFiles.filter((file) => !completedKeys.has(fileKey(file)));
      renderSelectedFiles();
      setStatus("error", "Upload niet voltooid", customerMessage(error));
      if (completedKeys.size) {
        publishAssets(mergeAssets(completedAssets, window.__MWS_RELATIONSHIP_ASSETS__ || []), "partial-upload-optimistic");
        await loadAssets({ source: "partial-upload" });
      }
    } finally {
      setUploading(false);
    }
  }

  chooseButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!isUploading) input?.click();
  });
  input?.addEventListener("change", () => addFiles(input.files || []));
  description?.addEventListener("input", () => {
    updateDescriptionCount();
    setFieldError(descriptionError, "", description);
  });
  category?.addEventListener("change", () => setFieldError(categoryError, "", category));
  rights?.addEventListener("change", () => setFieldError(rightsError, "", rights));
  dropzone?.addEventListener("click", (event) => {
    if (isUploading || event.target.closest?.("button")) return;
    input?.click();
  });
  ["dragenter", "dragover"].forEach((eventName) => dropzone?.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (isUploading) return;
    if (eventName === "dragenter") dragDepth += 1;
    dropzone.classList.add("is-dragging");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }));
  dropzone?.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropzone.classList.remove("is-dragging");
  });
  dropzone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove("is-dragging");
    if (!isUploading) addFiles(event.dataTransfer?.files || []);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    uploadFiles();
  });
  window.addEventListener(ASSET_REFRESH_EVENT, () => loadAssets({ source: "portal-refresh" }));
  window.addEventListener("relationship-asset:action-status", (event) => {
    const state = ["info", "loading", "success", "error"].includes(event.detail?.state) ? event.detail.state : "info";
    setStatus(state, String(event.detail?.title || "Asset Center"), String(event.detail?.message || ""));
  });
  window.addEventListener("beforeunload", () => {
    previewUrls.forEach((entry) => URL.revokeObjectURL(entry.url));
    previewUrls.clear();
  });

  updateDescriptionCount();
  renderSelectedFiles();
  loadAssets({ source: "initial" });
})();
