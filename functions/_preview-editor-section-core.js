const { createHash } = require("crypto");

const MAX_FILES = 180;
const MAX_PACKAGE_BYTES = 18 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

let parserPromise = null;

async function loadParser() {
  if (!parserPromise) parserPromise = import("parse5");
  return parserPromise;
}

function validatePackage(value = {}, errorFactory = sectionError) {
  const files = Array.isArray(value.files) ? value.files : [];
  if (!files.length || files.length > MAX_FILES) throw errorFactory("PREVIEW_PACKAGE_INVALID", "Het previewpakket bevat geen geldige bestanden.", 409, "validate_package");
  const entryFile = cleanText(value.entryFile || value.meta?.entryFile || "index.html");
  let totalBytes = 0;
  let fileIndex = -1;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index] || {};
    const path = cleanText(file.path);
    if (!path || path.startsWith("/") || path.split("/").includes("..")) throw errorFactory("PREVIEW_PACKAGE_INVALID", "Het previewpakket bevat een ongeldig bestandspad.", 409, "validate_package");
    const size = file.encoding === "base64" ? Buffer.byteLength(cleanText(file.content), "base64") : Buffer.byteLength(String(file.content || ""), "utf8");
    totalBytes += size;
    if (path === entryFile) fileIndex = index;
  }
  if (totalBytes > MAX_PACKAGE_BYTES || fileIndex < 0) throw errorFactory("PREVIEW_PACKAGE_INVALID", "Het previewpakket is te groot of mist het startbestand.", 409, "validate_package");
  const entry = files[fileIndex];
  if (entry.encoding === "base64" || !/\.html?$/i.test(entryFile)) throw errorFactory("PREVIEW_PACKAGE_INVALID", "Het startbestand is geen bewerkbare HTML-pagina.", 409, "validate_package");
  const html = String(entry.content || "");
  if (!html || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw errorFactory("PREVIEW_PACKAGE_INVALID", "Het HTML-startbestand is leeg of te groot.", 409, "validate_package");
  return { entryFile, fileIndex, html, totalBytes };
}

async function parseDocument(html) {
  const parse5 = await loadParser();
  return parse5.parse(String(html || ""), { sourceCodeLocationInfo: true });
}

function findNodes(root, predicate, output = []) {
  if (root && typeof root === "object" && root.nodeName && predicate(root)) output.push(root);
  for (const child of root?.childNodes || []) findNodes(child, predicate, output);
  if (root?.content) findNodes(root.content, predicate, output);
  return output;
}

function findSection(document, sectionId, sectionType, errorFactory = sectionError) {
  const matches = findNodes(document, (node) => attribute(node, "data-mws-section-id") === sectionId);
  if (matches.length > 1) throw errorFactory("SECTION_MARKER_AMBIGUOUS", `Sectie ${sectionId} komt meerdere keren voor.`, 422, "validate_editor_markers");
  if (matches.length !== 1 || attribute(matches[0], "data-mws-section-type") !== sectionType) throw errorFactory("SECTION_WRITE_UNAVAILABLE", `Sectie ${sectionId} is niet eenduidig bewerkbaar.`, 409, "validate_section_marker");
  if (!matches[0].sourceCodeLocation?.startOffset && matches[0].sourceCodeLocation?.startOffset !== 0) throw errorFactory("SECTION_MARKER_INVALID", `De bronlocatie van sectie ${sectionId} ontbreekt.`, 409, "validate_section_marker");
  return matches[0];
}

function exactFieldNode(section, nodeField, errorFactory = sectionError) {
  const matches = findNodes(section, (node) => attribute(node, "data-mws-field") === nodeField);
  if (matches.length > 1) throw errorFactory("SECTION_FIELD_MARKER_AMBIGUOUS", `Veld ${nodeField} komt meerdere keren voor.`, 422, "validate_editor_markers");
  if (matches.length !== 1) throw errorFactory("SECTION_FIELD_MISSING", `Veld ${nodeField} ontbreekt.`, 409, "validate_field_markers");
  return matches[0];
}

function validateManifestDom(document, manifest, pagePath, errorFactory = sectionError) {
  const page = manifest?.pages?.find((item) => item.path === pagePath);
  if (!page) throw errorFactory("EDITOR_MANIFEST_PAGE_MISSING", "De manifestpagina ontbreekt.", 409, "validate_manifest_dom");
  for (const section of page.sections) {
    const matches = findNodes(document, (node) => attribute(node, "data-mws-section-id") === section.id && attribute(node, "data-mws-section-type") === section.type);
    if (matches.length !== 1) throw errorFactory("EDITOR_MANIFEST_DOM_MISMATCH", `Sectie ${section.id} komt niet exact overeen met het manifest.`, 409, "validate_manifest_dom");
    for (const field of section.fields) {
      if (!findNodes(matches[0], (node) => attribute(node, "data-mws-field") === field).length) throw errorFactory("EDITOR_MANIFEST_DOM_MISMATCH", `Veld ${field} ontbreekt in sectie ${section.id}.`, 409, "validate_manifest_dom");
    }
  }
}

function applyOperations(html, operations = [], errorFactory = sectionError) {
  const sorted = [...operations].sort((left, right) => left.start - right.start);
  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    if (!Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start > item.end || (index && sorted[index - 1].end > item.start)) {
      throw errorFactory("SECTION_PATCH_RANGE_INVALID", "De sectiewijziging bevat overlappende bronvelden.", 409, "patch_section");
    }
  }
  return [...sorted].sort((left, right) => right.start - left.start).reduce((value, operation) => `${value.slice(0, operation.start)}${operation.replacement}${value.slice(operation.end)}`, String(html || ""));
}

function clonePackage(value) {
  return { ...value, files: value.files.map((file) => ({ ...file })), meta: { ...(value.meta || {}) } };
}

function replaceEntryHtml(generatedPackage, fileIndex, html) {
  const nextPackage = clonePackage(generatedPackage);
  nextPackage.files[fileIndex] = { ...nextPackage.files[fileIndex], content: html };
  return nextPackage;
}

function attribute(node, name) {
  return cleanText((node?.attrs || []).find((item) => item.name === name)?.value);
}

function textContent(node) {
  if (node?.nodeName === "#text") return String(node.value || "");
  return (node?.childNodes || []).map(textContent).join("");
}

function hasElementChildren(node) {
  return (node?.childNodes || []).some((child) => child.nodeName !== "#text");
}

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function sha256(value = "") {
  return createHash("sha256").update(String(value)).digest("hex");
}

function isSha256(value = "") {
  return /^[a-f0-9]{64}$/i.test(cleanText(value));
}

function patchFingerprint(patch = {}) {
  const ordered = Object.fromEntries(Object.keys(patch).sort().map((key) => [key, patch[key]]));
  return sha256(JSON.stringify(ordered));
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function sectionError(code, message, status = 400, phase = "preview_editor") {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.phase = phase;
  return error;
}

module.exports = {
  CONTROL_CHARACTERS,
  applyOperations,
  attribute,
  cleanText,
  clonePackage,
  escapeAttribute,
  escapeHtml,
  exactFieldNode,
  findNodes,
  findSection,
  hasElementChildren,
  isSha256,
  loadParser,
  parseDocument,
  patchFingerprint,
  replaceEntryHtml,
  sectionError,
  sha256,
  textContent,
  validateManifestDom,
  validatePackage,
};
