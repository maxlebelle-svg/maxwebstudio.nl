(() => {
  "use strict";
  const contextEndpoint = "/.netlify/functions/client-activation-start";
  const exchangeEndpoint = "/.netlify/functions/client-activation-exchange";
  const magicLinkEndpoint = "/.netlify/functions/client-activation-magic-link";
  const byId = (id) => document.getElementById(id);
  const CX2_STEPS = Object.freeze(["website_bekijken", "feedback_geven", "omgeving_activeren", "oplevering"]);
  let previewHtml = "";
  let previewVersion = 1;
  let previewTrigger = null;
  let resendTimer = 0;
  let resendRemaining = 0;

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
      ? "Geweldig! Activeer jouw persoonlijke omgeving om veilig verder te gaan."
      : "Feedback geven wordt in de volgende stap beschikbaar.";
    byId("cx2-preview-activate").hidden = !approval;
    byId("cx2-preview-sheet-close").textContent = approval ? "Niet nu" : "Begrepen";
    byId("cx2-preview-sheet").hidden = false;
    byId("cx2-preview-sheet-close")?.focus();
  }

  function setActivationState(state, message = "") {
    const states = ["ready", "sending", "sent", "callback", "success", "error"];
    states.forEach((name) => { byId(`cx2-activation-${name}`).hidden = name !== state; });
    byId("cx2-activation-dialog").hidden = false;
    byId("cx2-activation-dialog").querySelector(".cx2-activation-card").setAttribute("data-state", state);
    byId("cx2-activation-live").textContent = message;
    const panel = byId(`cx2-activation-${state}`);
    const focusTarget = byId(state === "ready" ? "cx2-activation-send" : state === "success" ? "cx2-activation-dashboard" : state === "error" ? "cx2-activation-retry" : "") || panel?.querySelector("h2");
    if (focusTarget) {
      if (focusTarget.tagName === "H2") focusTarget.setAttribute("tabindex", "-1");
      requestAnimationFrame(() => focusTarget.focus());
    }
  }

  async function openActivation() {
    closeActionSheet();
    closePreviewDialog();
    setActivationState("sending", "Je accountactivatie wordt voorbereid.");
    try {
      const data = await requestContext("activation");
      const masked = data.activation?.maskedEmail || "j***@***";
      byId("cx2-activation-email").textContent = masked;
      byId("cx2-activation-sent-email").textContent = masked;
      byId("cx2-activation-sent-email").setAttribute("aria-label", "Je gecontroleerde e-mailadres");
      setActivationState("ready", "Je kunt de veilige magic link nu laten versturen.");
    } catch (error) {
      showActivationError(error.message);
    }
  }

  async function magicRequest(action, input = {}, accessToken = "") {
    const response = await fetch(magicLinkEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ action, ...input }),
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Accountactivatie kon niet worden voltooid.");
      error.code = data.code || "CX2_ACTIVATION_FAILED";
      error.retryAfter = Number(data.retryAfter || 0);
      throw error;
    }
    return data;
  }

  function startResendCountdown(seconds = 60) {
    window.clearInterval(resendTimer);
    resendRemaining = Math.max(1, Number(seconds || 60));
    const button = byId("cx2-activation-resend");
    const count = byId("cx2-activation-countdown");
    button.disabled = true;
    const tick = () => {
      count.textContent = String(resendRemaining);
      button.innerHTML = resendRemaining > 0 ? `Opnieuw versturen over <span id="cx2-activation-countdown">${resendRemaining}</span>s` : "Magic link opnieuw versturen";
      if (resendRemaining <= 0) { window.clearInterval(resendTimer); button.disabled = false; return; }
      resendRemaining -= 1;
    };
    tick();
    resendTimer = window.setInterval(tick, 1000);
  }

  async function sendMagicLink(action = "send") {
    setActivationState("sending", "De magic link wordt veilig voorbereid.");
    try {
      const data = await magicRequest(action);
      if (data.maskedEmail) byId("cx2-activation-sent-email").textContent = data.maskedEmail;
      setActivationState("sent", "E-mail verstuurd. Controleer je inbox.");
      startResendCountdown(data.resendAfter || 60);
    } catch (error) {
      if (error.code === "CX2_RESEND_COOLDOWN") {
        setActivationState("sent", "Wacht nog even voordat je opnieuw verstuurt.");
        startResendCountdown(error.retryAfter || 60);
        return;
      }
      showActivationError(error.message);
    }
  }

  function showActivationError(message) {
    byId("cx2-activation-error-message").textContent = message || "Je link kan verlopen of ingetrokken zijn. Vraag Max Webstudio zo nodig om een nieuwe link.";
    setActivationState("error", "De activatie is veilig gestopt.");
  }

  async function completeMagicLink(state) {
    setActivationState("callback", "Je veilige sessie wordt hersteld.");
    try {
      const provider = await import("./services/supabaseAuthProvider.js");
      const consumed = await provider.consumeMagicLinkSessionFromUrl();
      if (!consumed.success || !consumed.session?.access_token) throw new Error("De magische link is ongeldig of verlopen.");
      const data = await magicRequest("complete", { state }, consumed.session.access_token);
      window.history.replaceState(null, "", "/start");
      byId("cx2-activation-first-name").textContent = data.firstName || "daar";
      byId("cx2-activation-dashboard").href = data.redirectTo;
      setActivationState("success", "Jouw persoonlijke omgeving is geactiveerd.");
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        window.setTimeout(() => window.location.assign(data.redirectTo), 2400);
      }
    } catch (error) {
      window.history.replaceState(null, "", "/start");
      showActivationError(error.message);
    }
  }

  function callbackState() {
    return queryValue("cx2") === "callback" ? queryValue("state") : "";
  }

  function visualState() {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return "";
    return queryValue("cx2_visual");
  }

  function queryValue(name) {
    const query = String(window.location.href || "").split("?")[1]?.split("#")[0] || "";
    const pair = query.split("&").map((part) => part.split("=")).find(([key]) => decodeURIComponent(key || "") === name);
    return pair ? decodeURIComponent(String(pair[1] || "").replace(/\+/g, " ")) : "";
  }

  function showVisualState(state) {
    if (!state) return false;
    byId("dca-start-loading").hidden = true;
    byId("dca-start-content").hidden = true;
    const mapped = ["ready", "sent", "callback", "success", "error"].includes(state) ? state : "ready";
    if (mapped === "success") byId("cx2-activation-first-name").textContent = "Ziva";
    setActivationState(mapped);
    if (mapped === "sent") startResendCountdown(42);
    return true;
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
    if (showVisualState(visualState())) return;
    const state = callbackState();
    if (state) return completeMagicLink(state);
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
  byId("cx2-preview-activate")?.addEventListener("click", openActivation);
  byId("cx2-activation-send")?.addEventListener("click", () => sendMagicLink("send"));
  byId("cx2-activation-resend")?.addEventListener("click", () => sendMagicLink("resend"));
  byId("cx2-activation-retry")?.addEventListener("click", openActivation);
  document.querySelectorAll("[data-cx2-wrong-email]").forEach((button) => button.addEventListener("click", () => {
    showActivationError("Dit e-mailadres kan alleen door Max Webstudio veilig worden aangepast. Neem contact met ons op.");
  }));
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
