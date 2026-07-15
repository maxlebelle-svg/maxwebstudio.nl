(function factoryPreviewEditorModule(globalScope) {
  "use strict";

  const PROTOCOL = "mws:factory-editor:v1";
  const MAX_MESSAGE_BYTES = 64 * 1024;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const MESSAGE_TYPES = new Set(["READY", "SECTION_LIST", "SECTION_HOVERED", "SECTION_SELECTED", "SECTION_DESELECTED", "PREVIEW_ERROR"]);

  function byteLength(value) {
    try {
      const serialized = JSON.stringify(value);
      if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(serialized).length;
      if (typeof Buffer !== "undefined") return Buffer.byteLength(serialized, "utf8");
      return serialized.length;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  function validSection(value) {
    return Boolean(value && typeof value === "object"
      && /^[a-z0-9][a-z0-9._-]{2,79}$/.test(String(value.id || ""))
      && /^[a-z][a-z0-9_-]{1,39}$/.test(String(value.type || ""))
      && typeof value.label === "string" && value.label.length <= 100
      && typeof value.page === "string" && value.page.length <= 160
      && ["factory", "manual_zip"].includes(value.source)
      && typeof value.editable === "boolean"
      && Array.isArray(value.fields) && value.fields.length <= 30
      && value.fields.every((field) => /^[a-z][a-z0-9_-]{1,39}$/.test(String(field)))
      && Array.isArray(value.capabilities) && value.capabilities.length <= 30
      && value.capabilities.every((capability) => typeof capability === "string" && capability.length <= 60));
  }

  function validPayload(type, payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    if (type === "READY") return ["factory", "manual_zip"].includes(payload.source) && typeof payload.page === "string" && payload.page.length <= 160 && typeof payload.readOnly === "boolean" && typeof payload.reason === "string" && payload.reason.length <= 120;
    if (type === "SECTION_LIST") return Array.isArray(payload.sections) && payload.sections.length <= 100 && payload.sections.every(validSection);
    if (type === "SECTION_HOVERED" || type === "SECTION_SELECTED") return validSection(payload.section);
    if (type === "SECTION_DESELECTED") return typeof payload.page === "string" && payload.page.length <= 160;
    if (type === "PREVIEW_ERROR") return typeof payload.code === "string" && payload.code.length <= 80 && typeof payload.message === "string" && payload.message.length <= 180;
    return false;
  }

  function validateBridgeEvent(event, state) {
    const data = event?.data;
    return Boolean(event
      && event.source === state.frameWindow
      && event.origin === state.origin
      && byteLength(data) <= MAX_MESSAGE_BYTES
      && data && typeof data === "object" && !Array.isArray(data)
      && data.protocol === PROTOCOL
      && data.nonce === state.nonce
      && data.previewVersionId === state.previewVersionId
      && MESSAGE_TYPES.has(data.type)
      && validPayload(data.type, data.payload));
  }

  function randomNonce(cryptoApi) {
    const bytes = new Uint8Array(24);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function editorUrl(baseUrl, state) {
    const url = new URL(baseUrl, state.origin);
    if (url.origin !== state.origin) return "";
    url.searchParams.set("editorMode", "sections");
    url.searchParams.set("editorSession", state.nonce);
    url.searchParams.set("previewVersionId", state.previewVersionId);
    return url.toString();
  }

  function init() {
    const frame = document.getElementById("demo-journey-preview-frame");
    const toggle = document.getElementById("factory-preview-editor-toggle");
    const empty = document.getElementById("factory-section-context-empty");
    const details = document.getElementById("factory-section-context-details");
    const note = document.getElementById("factory-section-context-note");
    const workspace = document.querySelector(".factory-guided-preview-workspace");
    if (!frame || !toggle || !empty || !details || !note || !workspace || !globalScope.crypto?.getRandomValues) return;

    const state = { enabled: false, nonce: "", previewVersionId: "", origin: globalScope.location.origin, frameWindow: null, sections: [] };
    const resetPanel = (message = "Selecteer een websiteonderdeel om de instellingen te bekijken.") => {
      empty.textContent = message;
      empty.hidden = false;
      details.hidden = true;
      details.replaceChildren();
      note.hidden = true;
    };
    const setEnabledState = (enabled) => {
      state.enabled = enabled;
      toggle.classList.toggle("is-active", enabled);
      toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
      workspace.classList.toggle("is-editor-mode", enabled);
      frame.dataset.editorActive = enabled ? "true" : "false";
    };
    const disable = () => {
      setEnabledState(false);
      state.nonce = "";
      state.previewVersionId = "";
      state.sections = [];
      resetPanel();
      const baseUrl = frame.dataset.previewBaseUrl || "";
      if (baseUrl && frame.src !== baseUrl) frame.src = baseUrl;
    };
    const enable = () => {
      const baseUrl = frame.dataset.previewBaseUrl || "";
      const previewVersionId = frame.dataset.previewVersionId || "";
      if (!baseUrl || !UUID_PATTERN.test(previewVersionId)) {
        disable();
        resetPanel("Bewerkmodus is beschikbaar zodra een concrete previewversie is geladen.");
        return;
      }
      state.nonce = randomNonce(globalScope.crypto);
      state.previewVersionId = previewVersionId;
      state.frameWindow = frame.contentWindow;
      const url = editorUrl(baseUrl, state);
      if (!url) {
        disable();
        resetPanel("Deze preview-origin kan niet veilig in Bewerkmodus worden geopend.");
        return;
      }
      setEnabledState(true);
      resetPanel("Bewerkmodus wordt veilig geladen…");
      frame.src = url;
    };
    const addDetail = (list, label, value) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value || "—";
      row.append(term, description);
      list.appendChild(row);
    };
    const renderSection = (section) => {
      const list = document.createElement("dl");
      addDetail(list, "Sectienaam", section.label);
      addDetail(list, "Sectietype", section.type);
      addDetail(list, "Pagina", section.page);
      addDetail(list, "Section-id", section.id);
      addDetail(list, "Velden", section.fields.join(", ") || "Geen");
      addDetail(list, "Capabilities", section.capabilities.join(", ") || "Alleen selecteren");
      addDetail(list, "Bron", section.source === "factory" ? "Website Factory" : "ZIP");
      addDetail(list, "Bewerkbaarheid", section.editable ? "Herkenbaar voor een volgende fase" : "Read-only");
      details.replaceChildren(list);
      details.hidden = false;
      empty.hidden = true;
      note.hidden = section.editable;
    };
    const postToPreview = (type) => {
      if (!state.enabled || !state.frameWindow || !state.nonce || !state.previewVersionId) return;
      state.frameWindow.postMessage({ protocol: PROTOCOL, type, nonce: state.nonce, previewVersionId: state.previewVersionId, payload: {} }, state.origin);
    };

    toggle.addEventListener("click", () => state.enabled ? disable() : enable());
    globalScope.addEventListener("message", (event) => {
      state.frameWindow = frame.contentWindow;
      if (!validateBridgeEvent(event, state)) return;
      const { type, payload } = event.data;
      if (type === "READY" && payload.readOnly) resetPanel(payload.source === "manual_zip" ? "Deze ZIP-preview bevat geen betrouwbare sectiemetadata. Bewerkmodus blijft read-only." : "Deze preview bevat geen geldig sectiemanifest.");
      if (type === "SECTION_LIST") {
        state.sections = payload.sections;
        if (!payload.sections.length) resetPanel(frame.dataset.previewSource === "manual_zip" ? "Deze ZIP-preview bevat geen betrouwbare sectiemetadata. Bewerkmodus blijft read-only." : "Deze preview bevat geen selecteerbare secties.");
        else resetPanel();
      }
      if (type === "SECTION_SELECTED") renderSection(payload.section);
      if (type === "SECTION_DESELECTED") resetPanel();
      if (type === "PREVIEW_ERROR") resetPanel(`Bewerkmodus kon niet starten (${payload.code}).`);
    });
    globalScope.addEventListener("keydown", (event) => { if (state.enabled && event.key === "Escape") { postToPreview("DESELECT"); resetPanel(); } });
    globalScope.addEventListener("factory:preview-context", () => {
      toggle.disabled = !frame.dataset.previewBaseUrl || !UUID_PATTERN.test(frame.dataset.previewVersionId || "");
      if (state.enabled && state.previewVersionId !== frame.dataset.previewVersionId) enable();
    });
    frame.addEventListener("load", () => { state.frameWindow = frame.contentWindow; });
    toggle.disabled = !frame.dataset.previewBaseUrl || !UUID_PATTERN.test(frame.dataset.previewVersionId || "");
    resetPanel();
  }

  const api = { MAX_MESSAGE_BYTES, PROTOCOL, byteLength, editorUrl, validPayload, validSection, validateBridgeEvent };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope?.document) {
    globalScope.WebsiteFactoryPreviewEditor = api;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
