(function initCentralAssetLibrary() {
  "use strict";

  const root = document.getElementById("central-asset-library");
  if (!root) return;
  const elements = {
    grid: document.getElementById("central-asset-grid"),
    message: document.getElementById("central-asset-message"),
    newCount: document.getElementById("central-assets-new-count"),
    search: document.getElementById("central-asset-search"),
    customer: document.getElementById("central-asset-customer"),
    category: document.getElementById("central-asset-category"),
    type: document.getElementById("central-asset-type"),
    status: document.getElementById("central-asset-status"),
  };
  let assets = [];
  let activeRelationship = null;
  let requestId = 0;
  const previewUrls = new Set();

  function token() {
    for (const key of ["maxwebstudioSupabaseAuthSession", "mws_admin_supabase_session"]) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        if (value?.access_token) return value.access_token;
        if (value?.accessToken) return value.accessToken;
      } catch {}
    }
    return "";
  }
  function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
  function labelStatus(value = "") { return ({ new: "Nieuw", uploaded: "Nieuw", reviewing: "Wordt gecontroleerd", in_review: "Wordt gecontroleerd", approved: "Goedgekeurd", rejected: "Afgekeurd", archived: "Gearchiveerd", replaced: "Vervangen" })[String(value).toLowerCase()] || "In behandeling"; }
  function labelCategory(value = "") { return ({ logo: "Logo", photo: "Foto", team: "Team", project: "Project", product: "Product", brand: "Huisstijl", video: "Video", document: "Document", text: "Tekst", social: "Social media", other: "Overig" })[String(value).toLowerCase()] || value || "Overig"; }
  function formatDate(value) { if (!value) return "Onbekend"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Onbekend" : new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(date); }
  function formatSize(value) { const bytes = Number(value || 0); if (!bytes) return "-"; return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
  function fillSelect(select, values, label) { const current = select.value; select.innerHTML = `<option value="">${label}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`; select.value = values.includes(current) ? current : ""; }

  function filteredAssets() {
    const query = elements.search.value.trim().toLowerCase();
    return assets.filter((asset) => {
      const haystack = [asset.name, asset.customerName, asset.description, asset.project?.name, asset.website?.name].join(" ").toLowerCase();
      return (!query || haystack.includes(query))
        && (!elements.customer.value || asset.customerName === elements.customer.value)
        && (!elements.category.value || asset.category === elements.category.value)
        && (!elements.type.value || asset.mimeType === elements.type.value)
        && (!elements.status.value || asset.status === elements.status.value);
    });
  }

  function render() {
    const visible = filteredAssets();
    const newAssets = assets.filter((asset) => ["new", "uploaded", "reviewing", "in_review"].includes(String(asset.status).toLowerCase()) && asset.uploadedByType === "customer");
    elements.newCount.textContent = newAssets.length ? `${newAssets.length} nieuwe bestanden` : "Alles bijgewerkt";
    elements.newCount.className = `status-badge ${newAssets.length ? "status-warning" : "status-active"}`;
    if (!visible.length) {
      elements.grid.innerHTML = '<div class="central-asset-empty"><strong>Geen klantbestanden gevonden</strong><p>Pas de filters aan of open een klantwerkruimte.</p></div>';
      return;
    }
    elements.grid.innerHTML = visible.map((asset) => {
      const context = [asset.project?.name, asset.website?.name].filter(Boolean).join(" · ") || "Nog niet aan een project gekoppeld";
      return `<article class="central-asset-card" data-central-asset-id="${escapeHtml(asset.id)}">
        <div class="central-asset-preview" data-central-preview="${asset.previewAvailable ? "pending" : "none"}">${asset.previewAvailable ? '<span>Laden…</span>' : `<strong>${escapeHtml((asset.mimeType || "FILE").split("/").pop().toUpperCase())}</strong>`}</div>
        <div class="central-asset-copy"><div class="central-asset-card-head"><span class="status-badge ${["new", "uploaded", "reviewing", "in_review"].includes(String(asset.status).toLowerCase()) ? "status-warning" : "status-active"}">${escapeHtml(labelStatus(asset.status))}</span><small>${escapeHtml(formatDate(asset.createdAt))}</small></div>
        <h3 title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</h3><p>${escapeHtml(asset.customerName || "Klant")} · ${escapeHtml(labelCategory(asset.category))} · ${escapeHtml(formatSize(asset.sizeBytes))}</p><p>${escapeHtml(asset.description || "Geen omschrijving toegevoegd.")}</p><small>${escapeHtml(context)}</small></div>
        <div class="central-asset-actions"><button type="button" data-central-action="open">Openen</button><button type="button" data-central-action="download">Downloaden</button><button type="button" data-central-action="branding">Gebruiken in branding</button><button type="button" data-central-action="website">Gebruiken voor website</button><a href="admin-relatie-workspace.html?entityType=customer&id=${encodeURIComponent(asset.customerId || "")}&module=overview">Klantdetail</a></div>
      </article>`;
    }).join("");
    visible.filter((asset) => asset.previewAvailable).forEach(loadPreview);
  }

  async function fetchAsset(asset) {
    const response = await fetch(asset.downloadUrl, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
    if (!response.ok) throw new Error("Bestand kon niet worden geopend.");
    return response.blob();
  }
  async function loadPreview(asset) {
    const card = elements.grid.querySelector(`[data-central-asset-id="${CSS.escape(asset.id)}"]`);
    const preview = card?.querySelector("[data-central-preview]");
    if (!preview) return;
    try {
      const blob = await fetchAsset(asset);
      const url = URL.createObjectURL(blob); previewUrls.add(url);
      const image = document.createElement("img"); image.src = url; image.alt = ""; image.loading = "lazy";
      image.addEventListener("error", () => { preview.innerHTML = "<strong>Preview niet beschikbaar</strong>"; }, { once: true });
      preview.replaceChildren(image);
    } catch { preview.innerHTML = "<strong>Preview niet beschikbaar</strong>"; }
  }
  async function act(asset, action, button) {
    button.disabled = true;
    try {
      if (["open", "download"].includes(action)) {
        const blob = await fetchAsset(asset); const url = URL.createObjectURL(blob); previewUrls.add(url);
        if (action === "open") window.open(url, "_blank", "noopener");
        else { const link = document.createElement("a"); link.href = url; link.download = asset.name; link.click(); }
      } else {
        const response = await fetch("/api/admin-relationship-assets", { method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ assetId: asset.id, action, relationshipType: activeRelationship.relationshipType, relationshipId: activeRelationship.relationshipId }) });
        const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Asset kon niet worden gekoppeld.");
        elements.message.textContent = action === "branding" ? "Asset is klaargezet voor Branding." : "Asset is klaargezet voor de website.";
        await load();
      }
    } catch (error) { elements.message.textContent = error.message || "Actie niet gelukt."; } finally { button.disabled = false; }
  }
  async function load() {
    const currentRequest = ++requestId;
    assets = []; render();
    if (!token()) { elements.message.textContent = "Log opnieuw in om klantuploads te bekijken."; return; }
    activeRelationship = window.ActiveRelationship?.getActiveRelationship?.() || await window.ActiveRelationship?.whenReady?.();
    if (!activeRelationship) { elements.message.textContent = "Selecteer eerst een actieve lead of klant."; return; }
    elements.message.textContent = "Klantuploads laden…";
    try {
      const relationshipType = activeRelationship.relationshipType || activeRelationship.entityType;
      const relationshipId = activeRelationship.relationshipId || (relationshipType === "lead" ? activeRelationship.leadId : activeRelationship.customerId);
      const endpoint = `/api/admin-relationship-assets?relationshipType=${encodeURIComponent(relationshipType)}&relationshipId=${encodeURIComponent(relationshipId)}`;
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token()}`, Accept: "application/json" }, cache: "no-store" });
      const data = await response.json().catch(() => ({})); if (!response.ok || !data.success) throw new Error(data.error || "Klantuploads konden niet worden geladen.");
      if (currentRequest !== requestId) return;
      assets = Array.isArray(data.assets) ? data.assets : [];
      fillSelect(elements.customer, data.filters?.customers || [], "Alle klanten"); fillSelect(elements.category, data.filters?.categories || [], "Alle categorieën"); fillSelect(elements.type, data.filters?.mimeTypes || [], "Alle bestandstypen"); fillSelect(elements.status, data.filters?.statuses || [], "Alle statussen");
      elements.message.textContent = `${assets.length} bestanden uit de centrale bibliotheek.`; render();
    } catch (error) { if (currentRequest !== requestId) return; elements.message.textContent = error.message; elements.grid.innerHTML = '<div class="central-asset-empty"><strong>Bibliotheek tijdelijk niet beschikbaar</strong></div>'; }
  }
  Object.values(elements).filter((element) => element?.matches?.("input,select")).forEach((element) => { element.addEventListener("input", render); element.addEventListener("change", render); });
  elements.grid.addEventListener("click", (event) => { const button = event.target.closest("[data-central-action]"); const card = event.target.closest("[data-central-asset-id]"); if (!button || !card) return; const asset = assets.find((item) => item.id === card.dataset.centralAssetId); if (asset) act(asset, button.dataset.centralAction, button); });
  window.addEventListener("beforeunload", () => previewUrls.forEach((url) => URL.revokeObjectURL(url)));
  window.ActiveRelationship?.subscribeToRelationshipChanges?.(() => load());
  load();
})();
