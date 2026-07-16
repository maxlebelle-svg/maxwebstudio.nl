const { createHash } = require("crypto");
const { validateEditorManifest } = require("./_preview-editor-manifest");
const {
  HERO_FIELDS,
  HERO_SCHEMA_ID,
  HERO_SECTION_ID,
  HERO_SECTION_TYPE,
  HERO_WRITE_CAPABILITIES,
  publicHeroSchema,
} = require("./_preview-editor-hero-schema");

const MAX_FILES = 180;
const MAX_PACKAGE_BYTES = 18 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

let parserPromise = null;

async function loadParser() {
  if (!parserPromise) parserPromise = import("parse5");
  return parserPromise;
}

async function extractHeroContext(generatedPackage = {}) {
  const packageContext = validatePackage(generatedPackage);
  const manifest = validateEditorManifest(generatedPackage.meta?.editorManifest);
  const heroManifest = manifest?.pages?.find((page) => page.path === packageContext.entryFile)?.sections?.find((section) => section.id === HERO_SECTION_ID);
  if (!heroManifest?.editor || heroManifest.editor.schema !== HERO_SCHEMA_ID || heroManifest.type !== HERO_SECTION_TYPE) {
    throw heroError("HERO_WRITE_UNAVAILABLE", "Deze preview bevat geen veilige Hero-writecapabilities.", 409, "validate_manifest");
  }
  if (HERO_WRITE_CAPABILITIES.some((capability) => !heroManifest.editor.capabilities.includes(capability))) {
    throw heroError("HERO_CAPABILITY_MISMATCH", "De Hero-writecapabilities zijn niet volledig.", 409, "validate_manifest");
  }
  const parsed = await parseHero(packageContext.html, manifest, packageContext.entryFile);
  return {
    ...parsed,
    entryFile: packageContext.entryFile,
    image: parsed.image,
    schema: publicHeroSchema(),
    manifest,
    fileIndex: packageContext.fileIndex,
    totalBytes: packageContext.totalBytes,
  };
}

async function patchHeroPackage(generatedPackage = {}, patch = {}, expectedHash = "") {
  const source = await extractHeroContext(generatedPackage);
  if (!isSha256(expectedHash) || source.contentHash !== expectedHash) {
    throw heroError("EDIT_CONFLICT", "Deze preview is ondertussen gewijzigd. Laad de nieuwste versie voordat je opnieuw opslaat.", 409, "validate_base_hash");
  }
  const values = validateHeroPatch(patch, source.values, source.availableFields);
  const operations = [];
  for (const field of HERO_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(values, field.key)) continue;
    const node = source.fieldNodes.get(field.nodeField);
    if (!node) throw heroError("HERO_FIELD_MISSING", `Het Hero-veld ${field.label} ontbreekt.`, 409, "patch_hero");
    if (field.target === "text") {
      const location = node.sourceCodeLocation;
      if (!location?.startTag || !location?.endTag || hasElementChildren(node)) throw heroError("HERO_FIELD_STRUCTURE_UNSUPPORTED", `Het Hero-veld ${field.label} heeft een niet-ondersteunde structuur.`, 409, "patch_hero");
      operations.push({ start: location.startTag.endOffset, end: location.endTag.startOffset, replacement: escapeHtml(values[field.key]) });
    } else {
      const hrefLocation = node.sourceCodeLocation?.attrs?.href;
      if (!hrefLocation) throw heroError("HERO_FIELD_STRUCTURE_UNSUPPORTED", `De link van ${field.label} ontbreekt.`, 409, "patch_hero");
      operations.push({ start: hrefLocation.startOffset, end: hrefLocation.endOffset, replacement: `href="${escapeAttribute(values[field.key])}"` });
    }
  }
  assertDistinctOperations(operations);
  const html = operations.sort((left, right) => right.start - left.start).reduce((value, operation) => `${value.slice(0, operation.start)}${operation.replacement}${value.slice(operation.end)}`, source.html);
  const nextPackage = clonePackage(generatedPackage);
  nextPackage.files[source.fileIndex] = { ...nextPackage.files[source.fileIndex], content: html };
  const verified = await extractHeroContext(nextPackage);
  for (const [key, value] of Object.entries(values)) {
    if (verified.values[key] !== value) throw heroError("HERO_PATCH_VERIFICATION_FAILED", "De Hero-wijziging kon niet veilig worden geverifieerd.", 500, "verify_patch");
  }
  nextPackage.meta = {
    ...(nextPackage.meta || {}),
    editorManifest: verified.manifest,
    editorRevision: {
      sectionId: HERO_SECTION_ID,
      sectionType: HERO_SECTION_TYPE,
      baseContentHash: source.contentHash,
      contentHash: verified.contentHash,
    },
  };
  return { generatedPackage: nextPackage, source, values: verified.values, contentHash: verified.contentHash };
}

async function prepareHeroEditorPackage(generatedPackage = {}) {
  try {
    await extractHeroContext(generatedPackage);
    return { generatedPackage, availability: "editable", reason: "" };
  } catch (error) {
    if (["HERO_MARKER_AMBIGUOUS", "HERO_FIELD_MARKER_AMBIGUOUS"].includes(error?.code)) throw error;
    return {
      generatedPackage: removeHeroWriteCapabilities(generatedPackage, error?.code || "EDITOR_VALIDATION_UNAVAILABLE"),
      availability: "read_only",
      reason: error?.code || "EDITOR_VALIDATION_UNAVAILABLE",
    };
  }
}

async function parseHero(html, manifest, pagePath) {
  const parse5 = await loadParser();
  const document = parse5.parse(html, { sourceCodeLocationInfo: true });
  const sections = findNodes(document, (node) => attribute(node, "data-mws-section-id") === HERO_SECTION_ID);
  if (sections.length > 1) throw heroError("HERO_MARKER_AMBIGUOUS", "De preview bevat meerdere Hero-secties met dezelfde marker.", 422, "validate_editor_markers");
  if (sections.length !== 1 || attribute(sections[0], "data-mws-section-type") !== HERO_SECTION_TYPE) throw heroError("HERO_WRITE_UNAVAILABLE", "De preview bevat geen eenduidige bewerkbare Hero-sectie.", 409, "validate_hero_marker");
  const section = sections[0];
  if (!section.sourceCodeLocation?.startOffset && section.sourceCodeLocation?.startOffset !== 0) throw heroError("HERO_MARKER_INVALID", "De Hero-bronlocatie ontbreekt.", 409, "validate_hero_marker");
  const fieldNodes = new Map();
  const nodeFields = [...new Set(HERO_FIELDS.map((field) => field.nodeField))];
  for (const nodeField of nodeFields) {
    const nodes = findNodes(section, (node) => attribute(node, "data-mws-field") === nodeField);
    if (nodes.length > 1) throw heroError("HERO_FIELD_MARKER_AMBIGUOUS", `Hero-veld ${nodeField} komt meerdere keren voor.`, 422, "validate_editor_markers");
    if (nodes.length !== 1) throw heroError("HERO_WRITE_UNAVAILABLE", `Hero-veld ${nodeField} ontbreekt voor veilige bewerking.`, 409, "validate_field_markers");
    fieldNodes.set(nodeField, nodes[0]);
  }
  const values = {};
  for (const field of HERO_FIELDS) {
    const node = fieldNodes.get(field.nodeField);
    values[field.key] = field.target === "href" ? attribute(node, "href") : textContent(node).trim();
  }
  const imageNode = findNodes(section, (node) => attribute(node, "data-mws-field") === "image");
  if (imageNode.length > 1) throw heroError("HERO_FIELD_MARKER_AMBIGUOUS", "De Hero-afbeeldingsmarker komt meerdere keren voor.", 422, "validate_editor_markers");
  if (imageNode.length !== 1) throw heroError("HERO_WRITE_UNAVAILABLE", "De Hero-afbeeldingsmarker ontbreekt voor veilige bewerking.", 409, "validate_field_markers");
  validateManifestDom(document, manifest, pagePath);
  const rawSection = html.slice(section.sourceCodeLocation.startOffset, section.sourceCodeLocation.endOffset);
  return {
    html,
    values,
    fieldNodes,
    availableFields: HERO_FIELDS.map((field) => field.key),
    image: { src: attribute(imageNode[0], "src"), alt: attribute(imageNode[0], "alt") },
    contentHash: sha256(rawSection),
  };
}

function removeHeroWriteCapabilities(generatedPackage = {}, reason = "") {
  const nextPackage = clonePackage(generatedPackage);
  const sourceManifest = generatedPackage.meta?.editorManifest;
  const manifest = sourceManifest && typeof sourceManifest === "object" ? structuredClone(sourceManifest) : null;
  if (manifest?.pages) {
    for (const page of manifest.pages) {
      for (const section of page.sections || []) {
        if (section?.id === HERO_SECTION_ID) delete section.editor;
      }
    }
  }
  nextPackage.meta = {
    ...(nextPackage.meta || {}),
    ...(manifest ? { editorManifest: manifest } : {}),
    heroEditorAvailability: "read_only",
    heroEditorReason: cleanText(reason).slice(0, 80),
  };
  const briefingIndex = nextPackage.files.findIndex((file) => file?.path === "briefing.json" && file.encoding !== "base64");
  if (briefingIndex >= 0) {
    try {
      const briefing = JSON.parse(String(nextPackage.files[briefingIndex].content || "{}"));
      nextPackage.files[briefingIndex] = {
        ...nextPackage.files[briefingIndex],
        content: JSON.stringify({ ...briefing, ...(manifest ? { editorManifest: manifest } : {}), heroEditorAvailability: "read_only", heroEditorReason: cleanText(reason).slice(0, 80) }, null, 2),
      };
    } catch {}
  }
  return nextPackage;
}

function validateManifestDom(document, manifest, pagePath) {
  const page = manifest?.pages?.find((item) => item.path === pagePath);
  if (!page) throw heroError("EDITOR_MANIFEST_PAGE_MISSING", "De manifestpagina ontbreekt.", 409, "validate_manifest_dom");
  for (const section of page.sections) {
    const matches = findNodes(document, (node) => attribute(node, "data-mws-section-id") === section.id && attribute(node, "data-mws-section-type") === section.type);
    if (matches.length !== 1) throw heroError("EDITOR_MANIFEST_DOM_MISMATCH", `Sectie ${section.id} komt niet exact overeen met het manifest.`, 409, "validate_manifest_dom");
    for (const field of section.fields) {
      const fieldMatches = findNodes(matches[0], (node) => attribute(node, "data-mws-field") === field);
      if (!fieldMatches.length) throw heroError("EDITOR_MANIFEST_DOM_MISMATCH", `Veld ${field} ontbreekt in sectie ${section.id}.`, 409, "validate_manifest_dom");
    }
  }
}

function validatePackage(value = {}) {
  const files = Array.isArray(value.files) ? value.files : [];
  if (!files.length || files.length > MAX_FILES) throw heroError("PREVIEW_PACKAGE_INVALID", "Het previewpakket bevat geen geldige bestanden.", 409, "validate_package");
  const entryFile = cleanText(value.entryFile || value.meta?.entryFile || "index.html");
  let totalBytes = 0;
  let fileIndex = -1;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index] || {};
    const path = cleanText(file.path);
    if (!path || path.startsWith("/") || path.split("/").includes("..")) throw heroError("PREVIEW_PACKAGE_INVALID", "Het previewpakket bevat een ongeldig bestandspad.", 409, "validate_package");
    const size = file.encoding === "base64" ? Buffer.byteLength(cleanText(file.content), "base64") : Buffer.byteLength(String(file.content || ""), "utf8");
    totalBytes += size;
    if (path === entryFile) fileIndex = index;
  }
  if (totalBytes > MAX_PACKAGE_BYTES || fileIndex < 0) throw heroError("PREVIEW_PACKAGE_INVALID", "Het previewpakket is te groot of mist het startbestand.", 409, "validate_package");
  const entry = files[fileIndex];
  if (entry.encoding === "base64" || !/\.html?$/i.test(entryFile)) throw heroError("PREVIEW_PACKAGE_INVALID", "Het startbestand is geen bewerkbare HTML-pagina.", 409, "validate_package");
  const html = String(entry.content || "");
  if (!html || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw heroError("PREVIEW_PACKAGE_INVALID", "Het HTML-startbestand is leeg of te groot.", 409, "validate_package");
  return { entryFile, fileIndex, html, totalBytes };
}

function validateHeroPatch(input = {}, currentValues = {}, availableFields = []) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw heroError("HERO_PATCH_INVALID", "De Hero-wijziging is ongeldig.", 400, "validate_patch");
  const allowed = new Set(availableFields);
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !allowed.has(key))) throw heroError("HERO_CAPABILITY_MISMATCH", "De Hero-wijziging bevat een niet-toegestaan veld.", 400, "validate_patch");
  const result = {};
  for (const key of keys) {
    const field = HERO_FIELDS.find((item) => item.key === key);
    if (!field || typeof input[key] !== "string" || CONTROL_CHARACTERS.test(input[key])) throw heroError("HERO_FIELD_INVALID", `${field?.label || key} bevat ongeldige tekens.`, 400, "validate_patch");
    const value = input[key].trim();
    if (value.length > field.maxLength) throw heroError("HERO_FIELD_TOO_LONG", `${field.label} is langer dan toegestaan.`, 400, "validate_patch");
    if (field.required && !value) throw heroError("HERO_FIELD_REQUIRED", `${field.label} is verplicht.`, 400, "validate_patch");
    if (field.format === "safe_link" && value && !isSafeLink(value)) throw heroError("HERO_LINK_UNSAFE", `${field.label} bevat geen veilige link.`, 400, "validate_patch");
    result[key] = value;
  }
  const merged = { ...currentValues, ...result };
  for (const prefix of ["primary", "secondary"]) {
    const textValue = cleanText(merged[`${prefix}CtaText`]);
    const linkValue = cleanText(merged[`${prefix}CtaLink`]);
    if (textValue && !linkValue) throw heroError("HERO_CTA_LINK_REQUIRED", "Vul een veilige knoplink in wanneer de knoptekst is ingevuld.", 400, "validate_patch");
  }
  return result;
}

function isSafeLink(value = "") {
  const link = cleanText(value);
  if (!link || CONTROL_CHARACTERS.test(link) || /^\/\//.test(link)) return false;
  if (link.startsWith("#")) return /^#[^\s#]*$/.test(link);
  if (link.startsWith("/")) return !link.startsWith("//") && !/[\s\\]/.test(link);
  if (/^https:\/\//i.test(link)) {
    try { const url = new URL(link); return url.protocol === "https:" && Boolean(url.hostname); } catch { return false; }
  }
  if (/^mailto:/i.test(link)) return /^mailto:[^\s@]+@[^\s@]+(?:\?[^\s]*)?$/i.test(link) && !/%0[ad]/i.test(link);
  if (/^tel:/i.test(link)) return /^tel:\+?[0-9().\s-]{3,40}$/i.test(link);
  return false;
}

function findNodes(root, predicate, output = []) {
  if (root && typeof root === "object" && root.nodeName && predicate(root)) output.push(root);
  for (const child of root?.childNodes || []) findNodes(child, predicate, output);
  if (root?.content) findNodes(root.content, predicate, output);
  return output;
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

function assertDistinctOperations(operations = []) {
  const sorted = [...operations].sort((left, right) => left.start - right.start);
  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    if (!Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start > item.end || (index && sorted[index - 1].end > item.start)) {
      throw heroError("HERO_PATCH_RANGE_INVALID", "De Hero-wijziging bevat overlappende bronvelden.", 409, "patch_hero");
    }
  }
}

function clonePackage(value) {
  return { ...value, files: value.files.map((file) => ({ ...file })), meta: { ...(value.meta || {}) } };
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

function heroError(code, message, status = 400, phase = "preview_editor") {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.phase = phase;
  return error;
}

module.exports = {
  extractHeroContext,
  heroError,
  isSafeLink,
  patchFingerprint,
  patchHeroPackage,
  prepareHeroEditorPackage,
  publicHeroSchema,
  sha256,
  validateHeroPatch,
};
