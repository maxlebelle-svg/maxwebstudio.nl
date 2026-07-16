(function factoryPreviewEditorModule(globalScope) {
  "use strict";

  const PROTOCOL = "mws:factory-editor:v1";
  const MAX_MESSAGE_BYTES = 64 * 1024;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const MESSAGE_TYPES = new Set(["READY", "SECTION_LIST", "SECTION_HOVERED", "SECTION_SELECTED", "SECTION_DESELECTED", "PREVIEW_PATCHED", "PREVIEW_RESET", "PREVIEW_ERROR"]);

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
    if (type === "PREVIEW_PATCHED") return ((payload.sectionId === "home.hero" && payload.sectionType === "hero") || (payload.sectionId === "home.introduction" && payload.sectionType === "text")) && Array.isArray(payload.fields) && payload.fields.length <= 7 && payload.fields.every((field) => typeof field === "string" && field.length <= 40);
    if (type === "PREVIEW_RESET") return (payload.sectionId === "home.hero" && payload.sectionType === "hero") || (payload.sectionId === "home.introduction" && payload.sectionType === "text");
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

  function editorAvailabilityMessage(availability = "") {
    if (availability === "legacy_read_only") return "Deze preview is gemaakt vóór de nieuwe bewerkmodus en bevat nog geen bewerkbare secties.";
    if (availability === "empty_sections") return "De bewerkbare preview is geladen, maar bevat geen selecteerbare secties.";
    if (availability === "source_unavailable") return "De previewbron is tijdelijk niet renderbaar. Koppel de preview opnieuw of maak een nieuwe build.";
    if (availability === "missing_version") return "De build is afgerond, maar er is geen bruikbare previewversie opgeslagen.";
    return "Bewerkmodus is beschikbaar zodra een concrete bewerkbare previewversie is geladen.";
  }

  function sessionToken(storage = globalScope.localStorage) {
    for (const key of ["mws_admin_supabase_session", "maxwebstudioCurrentSession", "maxwebstudioSupabaseAuthSession"]) {
      try {
        const value = JSON.parse(storage?.getItem(key) || "null");
        const token = value?.accessToken || value?.access_token || value?.session?.access_token || "";
        if (token) return token;
      } catch {}
    }
    return "";
  }

  function safeHeroLink(value = "") {
    const link = String(value || "").trim();
    if (!link || /[\u0000-\u001f\u007f]/.test(link) || /^\/\//.test(link)) return false;
    if (link.startsWith("#")) return /^#[^\s#]*$/.test(link);
    if (link.startsWith("/")) return !/[\s\\]/.test(link);
    if (/^https:\/\//i.test(link)) { try { const url = new URL(link); return url.protocol === "https:" && Boolean(url.hostname); } catch { return false; } }
    if (/^mailto:/i.test(link)) return /^mailto:[^\s@]+@[^\s@]+(?:\?[^\s]*)?$/i.test(link) && !/%0[ad]/i.test(link);
    if (/^tel:/i.test(link)) return /^tel:\+?[0-9().\s-]{3,40}$/i.test(link);
    return false;
  }

  function validateHeroDraft(schema = {}, values = {}) {
    const errors = {};
    for (const field of schema.fields || []) {
      const value = typeof values[field.key] === "string" ? values[field.key] : "";
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) errors[field.key] = `${field.label} bevat ongeldige tekens.`;
      else if (value.trim().length > Number(field.maxLength || 0)) errors[field.key] = `${field.label} is langer dan toegestaan.`;
      else if (field.required && !value.trim()) errors[field.key] = `${field.label} is verplicht.`;
      else if (field.format === "safe_link" && value.trim() && !safeHeroLink(value)) errors[field.key] = `${field.label} bevat geen veilige link.`;
    }
    for (const prefix of ["primary", "secondary"]) {
      if (String(values[`${prefix}CtaText`] || "").trim() && !String(values[`${prefix}CtaLink`] || "").trim()) errors[`${prefix}CtaLink`] = "Vul een veilige knoplink in.";
    }
    return errors;
  }

  function textParagraphs(value = "") {
    return String(value || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  }

  function validateTextDraft(schema = {}, values = {}) {
    const errors = {};
    for (const field of schema.fields || []) {
      if (field.target === "paragraphs") {
        const paragraphs = textParagraphs(values[field.key]);
        if (paragraphs.length > Number(field.maxParagraphs || 0)) errors[field.key] = `Gebruik maximaal ${field.maxParagraphs} paragrafen.`;
        else if (paragraphs.some((item) => item.length > Number(field.maxParagraphLength || 0))) errors[field.key] = `Een paragraaf mag maximaal ${field.maxParagraphLength} tekens bevatten.`;
        else if (paragraphs.reduce((total, item) => total + item.length, 0) > Number(field.maxLength || 0)) errors[field.key] = `Body mag maximaal ${field.maxLength} tekens bevatten.`;
        else if (paragraphs.some((item) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item))) errors[field.key] = "Body bevat ongeldige tekens.";
        continue;
      }
      const value = typeof values[field.key] === "string" ? values[field.key] : "";
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) errors[field.key] = `${field.label} bevat ongeldige tekens.`;
      else if (value.trim().length > Number(field.maxLength || 0)) errors[field.key] = `${field.label} is langer dan toegestaan.`;
      else if (field.required && !value.trim()) errors[field.key] = `${field.label} is verplicht.`;
    }
    return errors;
  }

  function init() {
    const frame = document.getElementById("demo-journey-preview-frame");
    const toggle = document.getElementById("factory-preview-editor-toggle");
    const empty = document.getElementById("factory-section-context-empty");
    const details = document.getElementById("factory-section-context-details");
    const note = document.getElementById("factory-section-context-note");
    const unavailableActions = document.getElementById("factory-editor-unavailable-actions");
    const unavailableMessage = document.getElementById("factory-editor-unavailable-message");
    const relink = document.getElementById("factory-editor-relink");
    const openNormal = document.getElementById("factory-editor-open-normal");
    const workspace = document.querySelector(".factory-guided-preview-workspace");
    if (!frame || !toggle || !empty || !details || !note || !workspace || !globalScope.crypto?.getRandomValues) return;

    const state = { enabled: false, nonce: "", previewVersionId: "", origin: globalScope.location.origin, frameWindow: null, sections: [], selectedSection: null, hero: null, textSection: null, savedValues: null, draftValues: null, idempotencyKey: "", saving: false, pendingSelection: "", successMessage: "" };
    const resetPanel = (message = "Selecteer een websiteonderdeel om de instellingen te bekijken.") => {
      empty.textContent = message;
      empty.hidden = false;
      details.hidden = true;
      details.replaceChildren();
      note.hidden = true;
    };
    const showAvailability = (availability = "") => {
      const available = frame.dataset.editorAvailable === "true";
      const actionable = ["legacy_read_only", "empty_sections", "source_unavailable", "missing_version"].includes(availability);
      if (unavailableActions) unavailableActions.hidden = available || !actionable;
      if (unavailableMessage) unavailableMessage.textContent = editorAvailabilityMessage(availability);
      if (relink) relink.hidden = !["source_unavailable", "missing_version"].includes(availability);
      if (openNormal) openNormal.disabled = !frame.dataset.previewBaseUrl;
      if (!available && actionable) resetPanel(editorAvailabilityMessage(availability));
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
      state.selectedSection = null;
      state.hero = null;
      state.textSection = null;
      state.savedValues = null;
      state.draftValues = null;
      state.idempotencyKey = "";
      state.saving = false;
      state.successMessage = "";
      state.pendingSelection = "";
      resetPanel();
      const baseUrl = frame.dataset.previewBaseUrl || "";
      if (baseUrl && frame.src !== baseUrl) frame.src = baseUrl;
    };
    const enable = () => {
      const baseUrl = frame.dataset.previewBaseUrl || "";
      const previewVersionId = frame.dataset.previewVersionId || "";
      if (!baseUrl || !UUID_PATTERN.test(previewVersionId) || frame.dataset.editorAvailable !== "true") {
        disable();
        showAvailability(frame.dataset.editorAvailability || "missing_version");
        return;
      }
      state.selectedSection = null;
      state.hero = null;
      state.textSection = null;
      state.savedValues = null;
      state.draftValues = null;
      state.idempotencyKey = "";
      state.saving = false;
      state.successMessage = "";
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
    const renderReadOnlySection = (section) => {
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
      note.hidden = false;
    };
    const scopeParams = () => ({
      previewVersionId: frame.dataset.previewVersionId || "",
      demoJourneyId: frame.dataset.demoJourneyId || "",
      customerId: frame.dataset.customerId || "",
      projectId: frame.dataset.projectId || "",
      websiteId: frame.dataset.websiteId || "",
    });
    const editorRequest = async (method, payload = {}) => {
      const token = sessionToken();
      if (!token) throw Object.assign(new Error("Log opnieuw in om de preview te bewerken."), { code: "AUTH_REQUIRED" });
      const options = { method, headers: { Accept: "application/json", Authorization: `Bearer ${token}` } };
      let url = "/.netlify/functions/admin-preview-editor";
      if (method === "GET") url += `?${new URLSearchParams(payload).toString()}`;
      else { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(payload); }
      const response = await fetch(url, options);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        const error = new Error(body.message || body.error || "De Hero-editor kon de wijziging niet verwerken.");
        error.code = body.code || "PREVIEW_EDITOR_FAILED";
        error.phase = body.phase || "preview_editor";
        error.requestId = body.requestId || "";
        error.status = response.status;
        throw error;
      }
      return body;
    };
    const requestMessage = (error) => {
      const base = error?.code === "EDIT_CONFLICT" ? "Deze preview is ondertussen gewijzigd. Laad de nieuwste versie voordat je opnieuw opslaat." : error?.message || "De Hero-editor kon de wijziging niet verwerken.";
      return error?.requestId && !base.includes(error.requestId) ? `${base} Request-id: ${error.requestId}` : base;
    };
    const previewAssetUrl = (path = "") => {
      try {
        const url = new URL(frame.dataset.previewBaseUrl || "", state.origin);
        url.searchParams.delete("editorMode");
        url.searchParams.delete("editorSession");
        url.searchParams.set("file", path);
        return url.toString();
      } catch { return ""; }
    };
    const changedPatch = () => Object.fromEntries(Object.entries(state.draftValues || {}).filter(([key, value]) => value !== state.savedValues?.[key]));
    const renderHeroEditor = (message = "") => {
      const hero = state.hero;
      if (!hero) return;
      const errors = validateHeroDraft(hero.schema, state.draftValues || {});
      const dirty = Object.keys(changedPatch()).length > 0;
      const form = document.createElement("form");
      form.className = "factory-hero-editor";
      form.addEventListener("submit", (event) => event.preventDefault());
      const header = document.createElement("div");
      header.className = "factory-hero-editor-header";
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = "Hero";
      const meta = document.createElement("small");
      meta.textContent = `${hero.page} · ${hero.sectionId} · bron V${hero.sourceVersion}`;
      heading.append(title, meta);
      const badge = document.createElement("span");
      badge.className = `status-badge ${message && /fout|gewijzigd|ongeldig/i.test(message) ? "status-error" : dirty ? "status-warning" : "status-active"}`;
      badge.textContent = state.saving ? "Opslaan" : dirty ? "Niet opgeslagen" : "Opgeslagen";
      header.append(heading, badge);
      form.appendChild(header);
      const fields = document.createElement("div");
      fields.className = "factory-hero-fields";
      for (const field of hero.schema.fields || []) {
        if (field.conditional && !Object.prototype.hasOwnProperty.call(hero.values, field.key)) continue;
        const label = document.createElement("label");
        label.textContent = field.label;
        const control = field.multiline ? document.createElement("textarea") : document.createElement("input");
        if (control instanceof HTMLTextAreaElement) control.rows = field.key === "subtitle" ? 4 : 3;
        else control.type = "text";
        control.name = field.key;
        control.maxLength = Number(field.maxLength || 2048);
        control.value = state.draftValues?.[field.key] || "";
        control.disabled = state.saving;
        control.addEventListener("input", () => {
          state.draftValues[field.key] = control.value;
          state.idempotencyKey = "";
          renderHeroEditor();
          const nextControl = details.querySelector(`[name="${field.key}"]`);
          nextControl?.focus();
          if (typeof nextControl?.setSelectionRange === "function") nextControl.setSelectionRange(control.selectionStart ?? nextControl.value.length, control.selectionEnd ?? nextControl.value.length);
        });
        label.appendChild(control);
        if (errors[field.key]) { const error = document.createElement("small"); error.className = "factory-hero-field-error"; error.textContent = errors[field.key]; label.appendChild(error); }
        fields.appendChild(label);
      }
      form.appendChild(fields);
      const imageCard = document.createElement("div");
      imageCard.className = "factory-hero-image-readonly";
      const imageUrl = previewAssetUrl(hero.image?.src || "");
      if (imageUrl) { const image = document.createElement("img"); image.src = imageUrl; image.alt = hero.image?.alt || "Huidige Hero-afbeelding"; imageCard.appendChild(image); }
      const imageCopy = document.createElement("p"); imageCopy.textContent = "Afbeeldingen aanpassen volgt in Sprint 2B.3.";
      imageCard.appendChild(imageCopy);
      form.appendChild(imageCard);
      const status = document.createElement("p");
      status.className = "factory-hero-editor-message";
      status.setAttribute("role", "status");
      status.textContent = message || state.successMessage || "";
      form.appendChild(status);
      const actions = document.createElement("div");
      actions.className = "factory-hero-editor-actions";
      const undo = actionButton("Ongedaan maken", "secondary", !dirty || state.saving, () => {
        state.draftValues = { ...state.savedValues };
        state.idempotencyKey = "";
        state.successMessage = "";
        postToPreview("RESET_HERO_PATCH", { sectionId: "home.hero", sectionType: "hero" });
        renderHeroEditor();
      });
      const preview = actionButton("Voorbeeld bijwerken", "secondary", !dirty || state.saving || Object.keys(errors).length > 0, () => {
        postToPreview("APPLY_HERO_PATCH", { sectionId: "home.hero", sectionType: "hero", patch: changedPatch() });
      });
      const save = actionButton(state.saving ? "Opslaan…" : "Opslaan als nieuwe versie", "primary", !dirty || state.saving || Object.keys(errors).length > 0, () => saveHero());
      actions.append(undo, preview, save);
      form.appendChild(actions);
      details.replaceChildren(form);
      details.hidden = false;
      empty.hidden = true;
      note.hidden = true;
    };
    const actionButton = (label, style, disabled, handler) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `button ${style} button-small`;
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener("click", handler);
      return button;
    };
    const loadHero = async (section) => {
      state.selectedSection = section;
      const requestedVersionId = frame.dataset.previewVersionId || "";
      resetPanel("Hero-editor wordt veilig geladen…");
      try {
        const body = await editorRequest("GET", scopeParams());
        if (state.selectedSection?.id !== section.id || frame.dataset.previewVersionId !== requestedVersionId) return;
        state.hero = body.hero;
        state.savedValues = { ...body.hero.values };
        state.draftValues = { ...body.hero.values };
        state.idempotencyKey = "";
        renderHeroEditor();
      } catch (error) {
        resetPanel(requestMessage(error));
      }
    };
    const saveHero = async () => {
      if (state.saving || !state.hero) return;
      const patch = changedPatch();
      if (!Object.keys(patch).length) return;
      state.saving = true;
      state.successMessage = "";
      renderHeroEditor();
      try {
        state.idempotencyKey ||= globalScope.crypto.randomUUID?.() || randomNonce(globalScope.crypto);
        const body = await editorRequest("POST", {
          action: "save_hero_preview",
          ...scopeParams(),
          sectionId: "home.hero",
          sectionType: "hero",
          baseContentHash: state.hero.baseContentHash,
          idempotencyKey: state.idempotencyKey,
          patch,
        });
        state.saving = false;
        state.pendingSelection = "home.hero";
        state.successMessage = "Nieuwe conceptpreview opgeslagen. De klantversie is niet gewijzigd.";
        state.hero = body.hero;
        state.savedValues = { ...body.hero.values };
        state.draftValues = { ...body.hero.values };
        state.idempotencyKey = "";
        globalScope.dispatchEvent(new CustomEvent("factory:hero-version-saved", { detail: { previewVersion: body.previewVersion, hero: body.hero } }));
        renderHeroEditor();
      } catch (error) {
        state.saving = false;
        renderHeroEditor(requestMessage(error));
      }
    };
    const textPatch = () => Object.fromEntries(Object.entries(changedPatch()).map(([key, value]) => [key, key === "body" ? textParagraphs(value) : value]));
    const renderTextEditor = (message = "") => {
      const section = state.textSection;
      if (!section) return;
      const errors = validateTextDraft(section.schema, state.draftValues || {});
      const dirty = Object.keys(changedPatch()).length > 0;
      const form = document.createElement("form");
      form.className = "factory-hero-editor factory-text-editor";
      form.addEventListener("submit", (event) => event.preventDefault());
      const header = document.createElement("div");
      header.className = "factory-hero-editor-header";
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = "Tekstsectie";
      const meta = document.createElement("small");
      meta.textContent = `${section.page} · ${section.sectionId} · bron V${section.sourceVersion}`;
      heading.append(title, meta);
      const badge = document.createElement("span");
      badge.className = `status-badge ${message ? "status-error" : dirty ? "status-warning" : "status-active"}`;
      badge.textContent = state.saving ? "Opslaan" : message ? "Fout" : dirty ? "Niet opgeslagen" : "Opgeslagen";
      header.append(heading, badge);
      form.appendChild(header);
      const fields = document.createElement("div");
      fields.className = "factory-hero-fields factory-text-fields";
      for (const field of section.schema.fields || []) {
        if (field.conditional && !Object.prototype.hasOwnProperty.call(section.values, field.key)) continue;
        const label = document.createElement("label");
        label.textContent = field.label;
        const control = field.multiline ? document.createElement("textarea") : document.createElement("input");
        if (control instanceof HTMLTextAreaElement) control.rows = field.key === "body" ? 9 : 3;
        else control.type = "text";
        control.name = field.key;
        control.maxLength = Number(field.maxLength || 4000) + (field.key === "body" ? 24 : 0);
        control.value = state.draftValues?.[field.key] || "";
        control.disabled = state.saving;
        control.addEventListener("input", () => {
          state.draftValues[field.key] = control.value;
          state.idempotencyKey = "";
          renderTextEditor();
          const nextControl = details.querySelector(`[name="${field.key}"]`);
          nextControl?.focus();
          if (typeof nextControl?.setSelectionRange === "function") nextControl.setSelectionRange(control.selectionStart ?? nextControl.value.length, control.selectionEnd ?? nextControl.value.length);
        });
        label.appendChild(control);
        if (errors[field.key]) { const error = document.createElement("small"); error.className = "factory-hero-field-error"; error.textContent = errors[field.key]; label.appendChild(error); }
        fields.appendChild(label);
      }
      form.appendChild(fields);
      if (section.image?.src) {
        const imageCard = document.createElement("div");
        imageCard.className = "factory-hero-image-readonly";
        const image = document.createElement("img");
        image.src = previewAssetUrl(section.image.src);
        image.alt = section.image.alt || "Afbeelding bij tekstsectie";
        const imageCopy = document.createElement("p");
        imageCopy.textContent = "Afbeeldingen aanpassen volgt in Sprint 2B.3.";
        imageCard.append(image, imageCopy);
        form.appendChild(imageCard);
      }
      const status = document.createElement("p");
      status.className = "factory-hero-editor-message";
      status.setAttribute("role", "status");
      status.textContent = message || state.successMessage || "";
      form.appendChild(status);
      const actions = document.createElement("div");
      actions.className = "factory-hero-editor-actions";
      actions.append(
        actionButton("Ongedaan maken", "secondary", !dirty || state.saving, () => {
          state.draftValues = { ...state.savedValues };
          state.idempotencyKey = "";
          state.successMessage = "";
          postToPreview("RESET_TEXT_SECTION_PATCH", { sectionId: "home.introduction", sectionType: "text" });
          renderTextEditor();
        }),
        actionButton("Voorbeeld bijwerken", "secondary", !dirty || state.saving || Object.keys(errors).length > 0, () => {
          postToPreview("APPLY_TEXT_SECTION_PATCH", { sectionId: "home.introduction", sectionType: "text", patch: textPatch() });
        }),
        actionButton(state.saving ? "Opslaan…" : "Opslaan als nieuwe versie", "primary", !dirty || state.saving || Object.keys(errors).length > 0, () => saveTextSection()),
      );
      form.appendChild(actions);
      details.replaceChildren(form);
      details.hidden = false;
      empty.hidden = true;
      note.hidden = true;
    };
    const loadTextSection = async (section) => {
      state.selectedSection = section;
      const requestedVersionId = frame.dataset.previewVersionId || "";
      resetPanel("Teksteditor wordt veilig geladen…");
      try {
        const body = await editorRequest("GET", { ...scopeParams(), sectionId: section.id, sectionType: section.type });
        if (state.selectedSection?.id !== section.id || frame.dataset.previewVersionId !== requestedVersionId) return;
        state.textSection = body.textSection;
        const values = { ...body.textSection.values, body: (body.textSection.values.body || []).join("\n\n") };
        state.savedValues = { ...values };
        state.draftValues = { ...values };
        state.idempotencyKey = "";
        renderTextEditor();
      } catch (error) {
        resetPanel(requestMessage(error));
      }
    };
    const saveTextSection = async () => {
      if (state.saving || !state.textSection) return;
      const patch = textPatch();
      if (!Object.keys(patch).length) return;
      state.saving = true;
      state.successMessage = "";
      renderTextEditor();
      try {
        state.idempotencyKey ||= globalScope.crypto.randomUUID?.() || randomNonce(globalScope.crypto);
        const body = await editorRequest("POST", {
          action: "save_text_preview",
          ...scopeParams(),
          sectionId: "home.introduction",
          sectionType: "text",
          baseContentHash: state.textSection.baseContentHash,
          idempotencyKey: state.idempotencyKey,
          patch,
        });
        state.saving = false;
        state.pendingSelection = "home.introduction";
        state.successMessage = "Nieuwe conceptpreview opgeslagen. De klantversie is niet gewijzigd.";
        state.textSection = body.textSection;
        const values = { ...body.textSection.values, body: (body.textSection.values.body || []).join("\n\n") };
        state.savedValues = { ...values };
        state.draftValues = { ...values };
        state.idempotencyKey = "";
        globalScope.dispatchEvent(new CustomEvent("factory:text-version-saved", { detail: { previewVersion: body.previewVersion, textSection: body.textSection } }));
        renderTextEditor();
      } catch (error) {
        state.saving = false;
        renderTextEditor(requestMessage(error));
      }
    };
    const renderSection = (section) => {
      state.selectedSection = section;
      const writableHero = section.id === "home.hero" && section.type === "hero" && section.capabilities.includes("write:title");
      const writableText = section.id === "home.introduction" && section.type === "text" && section.capabilities.includes("write:title") && section.capabilities.includes("write:body");
      if (writableHero) {
        state.textSection = null;
        loadHero(section);
      } else if (writableText) {
        state.hero = null;
        loadTextSection(section);
      } else {
        state.hero = null;
        state.textSection = null;
        renderReadOnlySection(section);
      }
    };
    const postToPreview = (type, payload = {}) => {
      if (!state.enabled || !state.frameWindow || !state.nonce || !state.previewVersionId) return;
      state.frameWindow.postMessage({ protocol: PROTOCOL, type, nonce: state.nonce, previewVersionId: state.previewVersionId, payload }, state.origin);
    };

    toggle.addEventListener("click", () => state.enabled ? disable() : enable());
    openNormal?.addEventListener("click", () => {
      const baseUrl = frame.dataset.previewBaseUrl || "";
      if (baseUrl) globalScope.open(baseUrl, "_blank", "noopener");
    });
    globalScope.addEventListener("message", (event) => {
      state.frameWindow = frame.contentWindow;
      if (!validateBridgeEvent(event, state)) return;
      const { type, payload } = event.data;
      if (type === "READY" && payload.readOnly) resetPanel(payload.source === "manual_zip" ? "Deze ZIP-preview bevat geen betrouwbare sectiemetadata. Bewerkmodus blijft read-only." : "Deze preview bevat geen geldig sectiemanifest.");
      if (type === "SECTION_LIST") {
        state.sections = payload.sections;
        if (!payload.sections.length) {
          setEnabledState(false);
          frame.dataset.editorAvailability = "empty_sections";
          frame.dataset.editorAvailable = "false";
          showAvailability("empty_sections");
        }
        else {
          resetPanel();
          if (state.pendingSelection) {
            const sectionId = state.pendingSelection;
            state.pendingSelection = "";
            postToPreview("SELECT_SECTION", { sectionId });
          }
        }
      }
      if (type === "SECTION_SELECTED") renderSection(payload.section);
      if (type === "SECTION_DESELECTED") { state.selectedSection = null; state.hero = null; state.textSection = null; resetPanel(); }
      if (type === "PREVIEW_ERROR") state.hero ? renderHeroEditor(`Bewerkmodusfout: ${payload.code}.`) : state.textSection ? renderTextEditor(`Bewerkmodusfout: ${payload.code}.`) : resetPanel(`Bewerkmodus kon niet starten (${payload.code}).`);
    });
    globalScope.addEventListener("keydown", (event) => { if (state.enabled && event.key === "Escape") { postToPreview("DESELECT"); resetPanel(); } });
    globalScope.addEventListener("factory:preview-context", () => {
      toggle.disabled = !frame.dataset.previewBaseUrl || !UUID_PATTERN.test(frame.dataset.previewVersionId || "") || frame.dataset.editorAvailable !== "true";
      showAvailability(frame.dataset.editorAvailability || "");
      if (state.enabled && state.previewVersionId !== frame.dataset.previewVersionId) {
        state.pendingSelection ||= state.selectedSection?.id || "";
        enable();
      }
    });
    frame.addEventListener("load", () => { state.frameWindow = frame.contentWindow; });
    toggle.disabled = !frame.dataset.previewBaseUrl || !UUID_PATTERN.test(frame.dataset.previewVersionId || "") || frame.dataset.editorAvailable !== "true";
    resetPanel();
    showAvailability(frame.dataset.editorAvailability || "");
  }

  const api = { MAX_MESSAGE_BYTES, PROTOCOL, byteLength, editorAvailabilityMessage, editorUrl, safeHeroLink, sessionToken, textParagraphs, validateBridgeEvent, validateHeroDraft, validateTextDraft, validPayload, validSection };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope?.document) {
    globalScope.WebsiteFactoryPreviewEditor = api;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
