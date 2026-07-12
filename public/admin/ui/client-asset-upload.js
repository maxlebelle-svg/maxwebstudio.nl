(function initClientAssetUpload() {
  const form = document.getElementById("relationship-asset-upload");
  if (!form) return;

  const endpoint = "/api/client-relationship-assets";
  const maxBytes = 8 * 1024 * 1024;
  const allowedExtensions = new Map([
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
    ["svg", "image/svg+xml"],
    ["mp4", "video/mp4"],
    ["webm", "video/webm"],
    ["pdf", "application/pdf"],
    ["txt", "text/plain"],
    ["doc", "application/msword"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ]);
  const input = document.getElementById("relationship-asset-files");
  const dropzone = document.getElementById("relationship-asset-dropzone");
  const chooseButton = document.getElementById("relationship-asset-choose");
  const selection = document.getElementById("relationship-asset-selection");
  const status = document.getElementById("relationship-asset-status");
  const list = document.getElementById("relationship-upload-list");
  const submitButton = document.getElementById("relationship-asset-submit") || form.querySelector("button[type='submit']");
  let selectedFiles = [];
  let uploading = false;

  function sessionToken() {
    for (const key of ["maxwebstudioSupabaseAuthSession", "mws_client_supabase_session"]) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        if (value?.access_token) return value.access_token;
        if (value?.accessToken) return value.accessToken;
      } catch {
        // Continue with the next supported session key.
      }
    }
    return "";
  }

  function extensionFor(name) {
    const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function mimeTypeFor(file) {
    const declared = String(file.type || "").toLowerCase().split(";")[0];
    if (declared === "image/jpg") return "image/jpeg";
    if (declared && declared !== "application/octet-stream") return declared;
    return allowedExtensions.get(extensionFor(file.name)) || "";
  }

  function validateFile(file) {
    const extension = extensionFor(file.name);
    const expectedMimeType = allowedExtensions.get(extension) || "";
    const mimeType = mimeTypeFor(file);
    if (!extension || !expectedMimeType || mimeType !== expectedMimeType) {
      return "Dit bestandstype kan niet worden geüpload.";
    }
    if (!Number.isFinite(file.size) || file.size <= 0) return "Dit bestand is leeg of niet leesbaar.";
    if (file.size > maxBytes) return "Een bestand mag maximaal 8 MB zijn.";
    return "";
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function typeLabel(file) {
    const mimeType = mimeTypeFor(file);
    if (mimeType.startsWith("image/")) return mimeType === "image/svg+xml" ? "SVG" : "Afbeelding";
    if (mimeType.startsWith("video/")) return "Video";
    if (mimeType === "application/pdf") return "PDF";
    if (mimeType.includes("wordprocessingml") || mimeType === "application/msword") return "Word-document";
    if (mimeType === "text/plain") return "Tekstbestand";
    return "Bestand";
  }

  function setStatus(message = "", type = "") {
    status.textContent = message;
    status.className = `form-helper portal-asset-upload-status${type ? ` ${type}` : ""}`;
  }

  function renderSelection() {
    selection.replaceChildren();
    if (!selectedFiles.length) {
      const empty = document.createElement("p");
      empty.className = "portal-asset-selection-empty";
      empty.textContent = "Nog geen bestanden gekozen.";
      selection.append(empty);
      return;
    }

    selectedFiles.forEach((file) => {
      const error = validateFile(file);
      const row = document.createElement("article");
      row.className = `portal-asset-selected-file${error ? " is-invalid" : ""}`;
      const icon = document.createElement("span");
      icon.className = "portal-asset-file-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = mimeTypeFor(file).startsWith("image/") ? "IMG" : "FILE";
      const details = document.createElement("div");
      const name = document.createElement("strong");
      const meta = document.createElement("small");
      name.textContent = file.name;
      meta.textContent = error || `${typeLabel(file)} · ${mimeTypeFor(file)} · ${formatBytes(file.size)}`;
      details.append(name, meta);
      row.append(icon, details);
      selection.append(row);
    });
  }

  function selectFiles(files) {
    if (uploading) return;
    selectedFiles = Array.from(files || []).filter((file) => file && typeof file.name === "string");
    renderSelection();
    setStatus("");
  }

  function publishAssets(assets) {
    const safeAssets = Array.isArray(assets) ? assets : [];
    window.__relationshipAssetFiles = safeAssets;
    window.dispatchEvent(new CustomEvent("relationship-assets:loaded", { detail: { assets: safeAssets } }));
  }

  function mergeAssets(primary, secondary) {
    const assets = [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])];
    const seen = new Set();
    return assets.filter((asset) => {
      const key = String(asset?.id || `${asset?.name || ""}:${asset?.sizeBytes || ""}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function load() {
    const auth = sessionToken();
    if (!auth) return;
    try {
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${auth}`, Accept: "application/json" },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return false;
      renderRequests(data.requests || []);
      publishAssets(data.assets || []);
      return true;
    } catch (error) {
      console.error("Customer asset list failed", { name: error.name, message: error.message });
      return false;
    }
  }

  function renderRequests(requests) {
    list.replaceChildren();
    if (!requests.length) return;
    const heading = document.createElement("div");
    heading.className = "portal-upload-request-heading";
    heading.innerHTML = "<span>Openstaande aanvraag</span><strong>Bestanden die we nog van je nodig hebben</strong>";
    list.append(heading);
    requests.forEach((request) => {
      const card = document.createElement("article");
      card.className = "portal-upload-request mw-card";
      const title = document.createElement("strong");
      const instructions = document.createElement("p");
      const meta = document.createElement("small");
      title.textContent = request.title || "Bestandsaanvraag";
      instructions.textContent = request.instructions || "Lever de gevraagde bestanden hierboven aan.";
      meta.textContent = `${request.minimumCount || 1} bestand(en) gevraagd`;
      card.append(title, instructions, meta);
      list.append(card);
    });
  }

  async function apiRequest(auth, payload) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Customer asset API request failed", {
        action: payload.action || "unknown",
        name: error.name,
        message: error.message,
      });
      const requestError = new Error("De verbinding werd onderbroken. Controleer je verbinding en probeer het opnieuw.");
      requestError.code = "UPLOAD_NETWORK_ERROR";
      requestError.stage = "api";
      throw requestError;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      const error = new Error(data.error || "Uploaden is niet gelukt.");
      error.code = data.code || "UPLOAD_FAILED";
      error.stage = "api";
      throw error;
    }
    return data;
  }

  function metadataFor(file) {
    return {
      name: file.name,
      mimeType: mimeTypeFor(file),
      size: file.size,
      category: form.elements.category.value,
      description: form.elements.description.value,
      usageRightsConfirmed: form.elements.usageRightsConfirmed.checked,
    };
  }

  async function cancelPreparedUpload(auth, uploadId, metadata) {
    if (!uploadId) return;
    await apiRequest(auth, { action: "cancel", uploadId, ...metadata }).catch(() => null);
  }

  async function uploadFile(auth, file) {
    const metadata = metadataFor(file);
    const prepared = await apiRequest(auth, { action: "prepare", ...metadata });
    const uploadId = prepared.upload?.id || "";
    const uploadUrl = prepared.upload?.url || "";
    if (!uploadId || !uploadUrl) throw new Error("Uploaden is tijdelijk niet beschikbaar.");

    let completionStarted = false;
    try {
      const body = new FormData();
      const binaryFile = String(file.type || "").toLowerCase() === metadata.mimeType
        ? file
        : new File([file], file.name, { type: metadata.mimeType, lastModified: file.lastModified });
      body.append("cacheControl", "3600");
      body.append("", binaryFile, file.name);
      let storageResponse;
      try {
        storageResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "x-upsert": "false" },
          body,
        });
      } catch (error) {
        console.error("Customer asset binary upload failed", {
          stage: "storage_upload",
          name: error.name,
          message: error.message,
          fileName: file.name,
          fileType: mimeTypeFor(file),
          fileSize: file.size,
        });
        const uploadError = new Error("Het bestand kon niet vanaf je apparaat worden geopend. Open of download het bestand eerst en probeer opnieuw.");
        uploadError.code = "LOCAL_FILE_UNREADABLE";
        uploadError.stage = "storage";
        throw uploadError;
      }
      if (!storageResponse.ok) {
        console.error("Customer asset storage rejected upload", { stage: "storage_upload", status: storageResponse.status });
        const uploadError = new Error("Het bestand kon niet veilig worden opgeslagen. Probeer het opnieuw.");
        uploadError.code = "STORAGE_UPLOAD_FAILED";
        uploadError.stage = "storage";
        throw uploadError;
      }
      completionStarted = true;
      return await apiRequest(auth, { action: "complete", uploadId, ...metadata });
    } catch (error) {
      if (!completionStarted) await cancelPreparedUpload(auth, uploadId, metadata);
      throw error;
    }
  }

  function setUploading(value) {
    uploading = value;
    submitButton.disabled = value;
    chooseButton.disabled = value;
    input.disabled = value;
    form.setAttribute("aria-busy", String(value));
    submitButton.textContent = value ? "Bezig met uploaden…" : "Bestanden uploaden";
  }

  input.addEventListener("change", () => selectFiles(input.files));
  chooseButton.addEventListener("click", () => {
    if (!uploading) input.click();
  });
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (!uploading) dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });
  dropzone.addEventListener("drop", (event) => {
    if (!uploading) selectFiles(event.dataTransfer?.files || []);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (uploading) return;
    const files = selectedFiles.slice();
    if (!files.length) {
      setStatus("Kies eerst één of meer bestanden.", "error");
      return;
    }
    const invalid = files.map((file) => ({ file, error: validateFile(file) })).find((entry) => entry.error);
    if (invalid) {
      setStatus(`${invalid.file.name}: ${invalid.error}`, "error");
      return;
    }
    if (!form.elements.usageRightsConfirmed.checked) {
      setStatus("Bevestig dat je deze bestanden mag aanleveren.", "error");
      return;
    }
    const auth = sessionToken();
    if (!auth) {
      setStatus("Log opnieuw in om bestanden aan te leveren.", "error");
      return;
    }

    setUploading(true);
    let completed = 0;
    const uploadedAssets = [];
    try {
      for (const file of files) {
        setStatus(`Uploaden ${completed + 1} van ${files.length}…`);
        const result = await uploadFile(auth, file);
        if (result?.asset) uploadedAssets.push(result.asset);
        completed += 1;
      }
      publishAssets(mergeAssets(uploadedAssets, window.__relationshipAssetFiles));
      form.reset();
      selectedFiles = [];
      renderSelection();
      await load();
      setStatus(`${completed} bestand(en) veilig aangeleverd. Je ziet ze direct in je bibliotheek.`, "success");
    } catch (error) {
      console.error("Customer asset upload stopped", { code: error.code || "UPLOAD_FAILED", stage: error.stage || "unknown" });
      setStatus(error.message || "Uploaden is niet gelukt. Probeer het opnieuw.", "error");
    } finally {
      setUploading(false);
    }
  });

  renderSelection();
  load();
})();
