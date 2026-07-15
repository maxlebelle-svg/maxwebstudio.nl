const { validateEditorManifest } = require("./_preview-editor-manifest");

const PROTOCOL = "mws:factory-editor:v1";
const MAX_MESSAGE_BYTES = 64 * 1024;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{24,96}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseEditorContext(params = {}, options = {}) {
  if (text(params.editorMode) !== "sections" || !/\.html?$/i.test(text(options.filePath || "index.html"))) return null;
  const nonce = text(params.editorSession);
  const previewVersionId = text(params.previewVersionId);
  const expectedVersionId = text(options.previewVersionId);
  if (!NONCE_PATTERN.test(nonce) || !UUID_PATTERN.test(previewVersionId) || (expectedVersionId && previewVersionId !== expectedVersionId)) return null;
  const source = options.source === "manual_zip" ? "manual_zip" : "factory";
  const manifest = source === "factory" ? validateEditorManifest(options.manifest) : null;
  if (source === "factory" && !manifest) return null;
  return { nonce, previewVersionId, source, manifest, pagePath: text(options.filePath || "index.html") };
}

function requestOrigin(event = {}) {
  const headers = event.headers || {};
  const forwardedHost = text(headers["x-forwarded-host"] || headers["X-Forwarded-Host"] || headers.host || headers.Host).split(",")[0];
  const forwardedProto = text(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "https").split(",")[0].toLowerCase();
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(forwardedHost) || !["http", "https"].includes(forwardedProto)) return "";
  return `${forwardedProto}://${forwardedHost}`;
}

function injectEditorRuntime(html, context, origin) {
  if (!context || !origin || !/<\/body\s*>/i.test(String(html || ""))) return String(html || "");
  const config = safeJson({
    protocol: PROTOCOL,
    maxMessageBytes: MAX_MESSAGE_BYTES,
    origin,
    nonce: context.nonce,
    previewVersionId: context.previewVersionId,
    source: context.source,
    pagePath: context.pagePath,
    manifest: context.manifest,
  });
  const runtime = `<script data-mws-editor-runtime>(${editorRuntime.toString()})(${config});<\/script>`;
  const safeHtml = context.source === "manual_zip" ? stripUntrustedEditorContent(html) : String(html);
  return safeHtml.replace(/<\/body\s*>/i, `${runtime}</body>`);
}

function stripUntrustedEditorContent(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?\s*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
    .replace(/<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(iframe|object|embed)\b[^>]*\/?\s*>/gi, "")
    .replace(/\son[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, "");
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function text(value) {
  return String(value || "").trim();
}

function editorRuntime(config) {
  "use strict";
  const sectionIdPattern = /^[a-z0-9][a-z0-9._-]{2,79}$/;
  const sectionTypePattern = /^[a-z][a-z0-9_-]{1,39}$/;
  const fieldPattern = /^[a-z][a-z0-9_-]{1,39}$/;
  const outgoingTypes = new Set(["READY", "SECTION_LIST", "SECTION_HOVERED", "SECTION_SELECTED", "SECTION_DESELECTED", "PREVIEW_ERROR"]);
  const incomingTypes = new Set(["DESELECT"]);
  const clean = (value, max) => String(value || "").trim().slice(0, max);
  const byteLength = (value) => {
    try { return new TextEncoder().encode(JSON.stringify(value)).length; } catch { return Number.POSITIVE_INFINITY; }
  };
  const post = (type, payload = {}) => {
    if (!outgoingTypes.has(type)) return;
    const message = { protocol: config.protocol, type, nonce: config.nonce, previewVersionId: config.previewVersionId, payload };
    if (byteLength(message) <= config.maxMessageBytes) window.parent.postMessage(message, config.origin);
  };
  try {
    if (window.parent === window || window.location.origin !== config.origin) throw new Error("Ongeldige editor-origin.");
    const manifestPage = config.manifest?.pages?.find((page) => page.path === config.pagePath);
    const manifestSections = new Map((manifestPage?.sections || []).map((section) => [section.id, section]));
    const nodes = Array.from(document.querySelectorAll("[data-mws-section-id][data-mws-section-type]")).slice(0, 100);
    const entries = nodes.map((node) => {
      const id = clean(node.dataset.mwsSectionId, 80);
      const type = clean(node.dataset.mwsSectionType, 40);
      const manifestSection = manifestSections.get(id);
      if (!sectionIdPattern.test(id) || !sectionTypePattern.test(type)) return null;
      if (config.source === "factory" && (!manifestSection || manifestSection.type !== type)) return null;
      const fields = [...new Set(Array.from(node.querySelectorAll("[data-mws-field]"))
        .map((field) => clean(field.dataset.mwsField, 40)).filter((field) => fieldPattern.test(field)))].slice(0, 30);
      const descriptor = {
        id,
        type,
        label: clean(manifestSection?.label || node.dataset.mwsSectionLabel || type, 100),
        page: clean(config.pagePath, 160),
        fields,
        capabilities: fields.map((field) => `read:${field}`),
        source: config.source,
        editable: fields.length > 0,
      };
      return { node, descriptor };
    }).filter(Boolean);
    const descriptorFor = (node) => entries.find((entry) => entry.node === node)?.descriptor || null;
    const style = document.createElement("style");
    style.dataset.mwsEditorStyle = "true";
    style.textContent = "[data-mws-section-id]{cursor:pointer;outline:2px solid transparent;outline-offset:-2px;transition:outline-color .12s ease,box-shadow .12s ease}[data-mws-section-id].mws-editor-hover{outline-color:rgba(37,139,255,.72);box-shadow:inset 0 0 0 1px rgba(37,139,255,.22)}[data-mws-section-id].mws-editor-selected{outline:3px solid #168cff;outline-offset:-3px;box-shadow:inset 0 0 0 2px rgba(22,140,255,.2)}#mws-editor-label{position:fixed;z-index:2147483647;padding:5px 9px;border-radius:5px;background:#096dd9;color:#fff;font:700 12px/1.2 Inter,Arial,sans-serif;pointer-events:none;box-shadow:0 5px 16px rgba(0,0,0,.28)}";
    document.head.appendChild(style);
    const label = document.createElement("div");
    label.id = "mws-editor-label";
    label.hidden = true;
    document.body.appendChild(label);
    let hovered = null;
    let selected = null;
    const positionLabel = (node, descriptor) => {
      if (!node || !descriptor) { label.hidden = true; return; }
      const rect = node.getBoundingClientRect();
      label.textContent = descriptor.label;
      label.style.left = `${Math.max(6, rect.left + 8)}px`;
      label.style.top = `${Math.max(6, rect.top + 8)}px`;
      label.hidden = false;
    };
    const deselect = () => {
      selected?.classList.remove("mws-editor-selected");
      selected = null;
      if (!hovered) label.hidden = true;
      post("SECTION_DESELECTED", { page: clean(config.pagePath, 160) });
    };
    document.addEventListener("mouseover", (event) => {
      const node = event.target.closest?.("[data-mws-section-id][data-mws-section-type]");
      if (!node || !descriptorFor(node) || node === hovered) return;
      hovered?.classList.remove("mws-editor-hover");
      hovered = node;
      hovered.classList.add("mws-editor-hover");
      const descriptor = descriptorFor(node);
      positionLabel(node, descriptor);
      post("SECTION_HOVERED", { section: descriptor });
    }, true);
    document.addEventListener("mouseout", (event) => {
      if (!hovered || hovered.contains(event.relatedTarget)) return;
      hovered.classList.remove("mws-editor-hover");
      hovered = null;
      if (selected) positionLabel(selected, descriptorFor(selected)); else label.hidden = true;
    }, true);
    document.addEventListener("click", (event) => {
      const node = event.target.closest?.("[data-mws-section-id][data-mws-section-type]");
      if (event.target.closest?.("a,button,form,input,select,textarea") || node) { event.preventDefault(); event.stopPropagation(); }
      if (!node || !descriptorFor(node)) return;
      selected?.classList.remove("mws-editor-selected");
      selected = node;
      selected.classList.add("mws-editor-selected");
      const descriptor = descriptorFor(node);
      positionLabel(node, descriptor);
      post("SECTION_SELECTED", { section: descriptor });
    }, true);
    document.addEventListener("submit", (event) => { event.preventDefault(); event.stopPropagation(); }, true);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); deselect(); } }, true);
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (event.source !== window.parent || event.origin !== config.origin || byteLength(data) > config.maxMessageBytes || !data || typeof data !== "object") return;
      if (data.protocol !== config.protocol || data.nonce !== config.nonce || data.previewVersionId !== config.previewVersionId || !incomingTypes.has(data.type)) return;
      if (data.type === "DESELECT") deselect();
    });
    const sections = entries.map((entry) => entry.descriptor);
    post("READY", { source: config.source, page: config.pagePath, readOnly: sections.length === 0, reason: sections.length ? "" : "missing_explicit_editor_markers" });
    post("SECTION_LIST", { sections });
  } catch (error) {
    post("PREVIEW_ERROR", { code: "EDITOR_RUNTIME_FAILED", message: clean(error?.message || "Editor-runtime kon niet starten.", 180) });
  }
}

module.exports = { MAX_MESSAGE_BYTES, NONCE_PATTERN, PROTOCOL, UUID_PATTERN, injectEditorRuntime, parseEditorContext, requestOrigin, stripUntrustedEditorContent };
