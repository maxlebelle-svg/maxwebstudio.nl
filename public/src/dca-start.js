(() => {
  "use strict";
  const contextEndpoint = "/.netlify/functions/client-activation-start";
  const exchangeEndpoint = "/.netlify/functions/client-activation-exchange";
  const byId = (id) => document.getElementById(id);
  const CX2_STEPS = Object.freeze(["website_bekijken", "feedback_geven", "omgeving_activeren", "oplevering"]);
  let previewHtml = "";
  let previewVersion = 1;
  let previewTrigger = null;

  async function requestContext(action) {
    const response = await fetch(contextEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action }),
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Deze persoonlijke link is niet beschikbaar.");
    return data;
  }

  function takeFragmentToken() {
    const fragment = String(window.location.hash || "");
    window.history.replaceState(null, "", "/start");
    if (fragment.length !== 65 || !/^#[0-9a-f]{64}$/i.test(fragment)) return "";
    return fragment.slice(1).toLowerCase();
  }

  async function exchange(token) {
    const response = await fetch(exchangeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("Deze persoonlijke link is niet beschikbaar.");
  }

  function showError(message) {
    byId("dca-start-loading").hidden = true;
    byId("dca-start-content").hidden = true;
    byId("dca-start-error").hidden = false;
    byId("dca-start-error-message").textContent = message || "Vraag Max Webstudio om een nieuwe link.";
  }

  function setPreview(html) {
    previewHtml = String(html || "");
    const frame = byId("cx2-welcome-preview-frame");
    const loading = byId("cx2-welcome-preview-loading");
    if (frame && previewHtml) frame.srcdoc = previewHtml;
    const dialogFrame = byId("dca-preview-frame");
    if (dialogFrame && previewHtml) dialogFrame.srcdoc = previewHtml;
    if (loading) loading.hidden = Boolean(previewHtml);
  }

  function setDialogState(state) {
    const loading = byId("cx2-preview-loading");
    const failed = byId("cx2-preview-failed");
    const frame = byId("dca-preview-frame");
    if (loading) loading.hidden = state !== "loading";
    if (failed) failed.hidden = state !== "failed";
    if (frame) frame.hidden = state !== "ready";
  }

  function openPreviewDialog() {
    const dialog = byId("dca-preview-dialog");
    if (!dialog) return;
    byId("cx2-preview-version").textContent = String(previewVersion);
    dialog.hidden = false;
    document.body.classList.add("cx2-preview-open");
    setDialogState(previewHtml ? "ready" : "loading");
    byId("dca-preview-close")?.focus();
  }

  function closePreviewDialog() {
    byId("dca-preview-dialog").hidden = true;
    closeActionSheet();
    document.body.classList.remove("cx2-preview-open");
    previewTrigger?.focus();
  }

  function selectDevice(device) {
    if (!CX2_STEPS.length || !["desktop", "tablet", "mobile"].includes(device)) return;
    byId("cx2-preview-device").setAttribute("data-device", device);
    document.querySelectorAll("[data-cx2-device]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-cx2-device") === device));
    });
  }

  function openActionSheet(type) {
    const approval = type === "approval";
    byId("cx2-preview-sheet-icon").textContent = approval ? "❤️" : "✏️";
    byId("cx2-preview-sheet-title").textContent = approval ? "Mooi!" : "Feedback";
    byId("cx2-preview-sheet-message").textContent = approval
      ? "Geweldig! Activeer straks jouw persoonlijke omgeving om verder te gaan."
      : "Feedback geven wordt in de volgende stap beschikbaar.";
    byId("cx2-preview-sheet").hidden = false;
    byId("cx2-preview-sheet-close")?.focus();
  }

  function closeActionSheet() {
    const sheet = byId("cx2-preview-sheet");
    if (sheet) sheet.hidden = true;
  }

  async function loadPreviewForDialog() {
    setDialogState("loading");
    try {
      const data = await requestContext("preview");
      setPreview(data.preview?.html);
      if (!previewHtml) throw new Error("preview_unavailable");
      setDialogState("ready");
    } catch {
      setDialogState("failed");
    }
  }

  async function preloadPreview() {
    try {
      const data = await requestContext("preview");
      setPreview(data.preview?.html);
    } catch {
      const loading = byId("cx2-welcome-preview-loading");
      if (loading) loading.querySelector("p").textContent = "Je website staat klaar om te bekijken.";
    }
  }

  async function load() {
    const legacyPath = !/^\/start\/?$/.test(window.location.pathname);
    let token = takeFragmentToken();
    if (legacyPath) return showError("Vraag Max Webstudio om een nieuwe veilige link.");
    try {
      if (token) await exchange(token);
      token = "";
      const data = await requestContext("open");
      const view = data.presentation || {};
      byId("dca-start-name").textContent = view.firstName || "daar";
      byId("dca-start-company").textContent = view.companyName || "jouw bedrijf";
      previewVersion = Number(view.versionNumber) > 0 ? Number(view.versionNumber) : 1;
      byId("dca-start-status").textContent = "Demo gereed";
      byId("cx2-welcome-steps-remaining").textContent = `Nog ${CX2_STEPS.length - 1} stappen tot oplevering`;
      byId("dca-start-loading").hidden = true;
      byId("dca-start-content").hidden = false;
      preloadPreview();
    } catch (error) {
      token = "";
      showError(error.message);
    }
  }

  byId("dca-start-preview")?.addEventListener("click", async () => {
    const button = byId("dca-start-preview");
    previewTrigger = button;
    button.disabled = true;
    button.setAttribute("data-loading", "true");
    byId("dca-start-note").textContent = "Website-preview laden…";
    openPreviewDialog();
    try {
      if (!previewHtml) await loadPreviewForDialog();
      else setDialogState("ready");
      byId("dca-start-note").textContent = "";
    } finally {
      button.disabled = false;
      button.setAttribute("data-loading", "false");
    }
  });
  byId("dca-preview-close")?.addEventListener("click", closePreviewDialog);
  byId("cx2-preview-retry")?.addEventListener("click", loadPreviewForDialog);
  document.querySelectorAll("[data-cx2-device]").forEach((button) => {
    button.addEventListener("click", () => selectDevice(button.getAttribute("data-cx2-device")));
  });
  byId("cx2-preview-feedback")?.addEventListener("click", () => openActionSheet("feedback"));
  byId("cx2-preview-approve")?.addEventListener("click", () => openActionSheet("approval"));
  byId("cx2-preview-sheet-close")?.addEventListener("click", closeActionSheet);
  byId("cx2-preview-sheet")?.addEventListener("click", (event) => {
    if (event.target === byId("cx2-preview-sheet")) closeActionSheet();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!byId("cx2-preview-sheet")?.hidden) closeActionSheet();
    else if (!byId("dca-preview-dialog")?.hidden) closePreviewDialog();
  });
  load();
})();
