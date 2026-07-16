const { validateEditorManifest } = require("./_preview-editor-manifest");
const {
  CONTROL_CHARACTERS,
  applyOperations,
  attribute,
  cleanText,
  clonePackage,
  escapeHtml,
  exactFieldNode,
  findNodes,
  findSection,
  hasElementChildren,
  isSha256,
  parseDocument,
  replaceEntryHtml,
  sectionError,
  sha256,
  textContent,
  validateManifestDom,
  validatePackage,
} = require("./_preview-editor-section-core");
const {
  TEXT_FIELDS,
  TEXT_REQUIRED_FIELDS,
  TEXT_SCHEMA_ID,
  TEXT_SECTION_ID,
  TEXT_SECTION_TYPE,
  publicTextSchema,
} = require("./_preview-editor-text-schema");

async function extractTextContext(generatedPackage = {}) {
  const packageContext = validatePackage(generatedPackage, textError);
  const manifest = validateEditorManifest(generatedPackage.meta?.editorManifest);
  const definition = manifest?.pages?.find((page) => page.path === packageContext.entryFile)?.sections?.find((section) => section.id === TEXT_SECTION_ID);
  if (!definition?.editor || definition.editor.schema !== TEXT_SCHEMA_ID || definition.type !== TEXT_SECTION_TYPE) throw textError("TEXT_WRITE_UNAVAILABLE", "Deze preview bevat geen veilige tekst-writecapabilities.", 409, "validate_manifest");
  const availableFields = definition.editor.fields.map((field) => field.key);
  if (TEXT_REQUIRED_FIELDS.some((key) => !availableFields.includes(key)) || definition.editor.capabilities.some((capability) => !availableFields.includes(capability.replace(/^write:/, "")))) {
    throw textError("TEXT_CAPABILITY_MISMATCH", "De tekst-writecapabilities komen niet overeen met het schema.", 409, "validate_manifest");
  }
  const parsed = await parseTextSection(packageContext.html, manifest, packageContext.entryFile, definition);
  return {
    ...parsed,
    entryFile: packageContext.entryFile,
    schema: publicTextSchema(TEXT_FIELDS.filter((field) => availableFields.includes(field.key))),
    manifest,
    fileIndex: packageContext.fileIndex,
    totalBytes: packageContext.totalBytes,
  };
}

async function patchTextPackage(generatedPackage = {}, patch = {}, expectedHash = "") {
  const source = await extractTextContext(generatedPackage);
  if (!isSha256(expectedHash) || source.contentHash !== expectedHash) throw textError("EDIT_CONFLICT", "Deze preview is ondertussen gewijzigd. Laad de nieuwste versie voordat je opnieuw opslaat.", 409, "validate_base_hash");
  const values = validateTextPatch(patch, source.values, source.availableFields);
  const operations = [];
  for (const field of TEXT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(values, field.key)) continue;
    const node = source.fieldNodes.get(field.nodeField);
    if (!node) throw textError("TEXT_FIELD_MISSING", `Tekstveld ${field.label} ontbreekt.`, 409, "patch_text_section");
    const location = node.sourceCodeLocation;
    if (!location?.startTag || !location?.endTag) throw textError("TEXT_FIELD_STRUCTURE_UNSUPPORTED", `Tekstveld ${field.label} heeft geen veilige bronlocatie.`, 409, "patch_text_section");
    if (field.target === "text") {
      if (hasElementChildren(node)) throw textError("TEXT_FIELD_STRUCTURE_UNSUPPORTED", `Tekstveld ${field.label} bevat een niet-ondersteunde structuur.`, 409, "patch_text_section");
      operations.push({ start: location.startTag.endOffset, end: location.endTag.startOffset, replacement: escapeHtml(values[field.key]) });
    } else {
      operations.push({ start: location.startTag.endOffset, end: location.endTag.startOffset, replacement: values.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("") });
    }
  }
  const html = applyOperations(source.html, operations, textError);
  const nextPackage = replaceEntryHtml(generatedPackage, source.fileIndex, html);
  const verified = await extractTextContext(nextPackage);
  for (const [key, value] of Object.entries(values)) {
    if (JSON.stringify(verified.values[key]) !== JSON.stringify(value)) throw textError("TEXT_PATCH_VERIFICATION_FAILED", "De tekstwijziging kon niet veilig worden geverifieerd.", 500, "verify_patch");
  }
  nextPackage.meta = {
    ...(nextPackage.meta || {}),
    editorManifest: verified.manifest,
    editorRevision: { sectionId: TEXT_SECTION_ID, sectionType: TEXT_SECTION_TYPE, baseContentHash: source.contentHash, contentHash: verified.contentHash },
  };
  return { generatedPackage: nextPackage, source, values: verified.values, contentHash: verified.contentHash };
}

async function prepareTextEditorPackage(generatedPackage = {}) {
  const prepared = await removeMissingOptionalMarkers(generatedPackage);
  try {
    await extractTextContext(prepared);
    return { generatedPackage: prepared, availability: "editable", reason: "" };
  } catch (error) {
    if (["TEXT_MARKER_AMBIGUOUS", "TEXT_FIELD_MARKER_AMBIGUOUS"].includes(error?.code)) throw error;
    return { generatedPackage: removeTextWriteCapabilities(prepared, error?.code || "TEXT_VALIDATION_UNAVAILABLE"), availability: "read_only", reason: error?.code || "TEXT_VALIDATION_UNAVAILABLE" };
  }
}

async function removeMissingOptionalMarkers(generatedPackage) {
  const packageContext = validatePackage(generatedPackage, textError);
  const manifest = validateEditorManifest(generatedPackage.meta?.editorManifest);
  const definition = manifest?.pages?.find((page) => page.path === packageContext.entryFile)?.sections?.find((section) => section.id === TEXT_SECTION_ID);
  if (!definition?.editor || definition.editor.schema !== TEXT_SCHEMA_ID) return generatedPackage;
  const document = await parseDocument(packageContext.html);
  const sections = findNodes(document, (node) => attribute(node, "data-mws-section-id") === TEXT_SECTION_ID);
  if (sections.length > 1) throw textError("TEXT_MARKER_AMBIGUOUS", "De tekstsectie komt meerdere keren voor.", 422, "validate_editor_markers");
  if (sections.length !== 1) return removeTextWriteCapabilities(generatedPackage, "TEXT_WRITE_UNAVAILABLE");
  let nextPackage = generatedPackage;
  for (const field of TEXT_FIELDS.filter((item) => item.conditional)) {
    const matches = findNodes(sections[0], (node) => attribute(node, "data-mws-field") === field.nodeField);
    if (matches.length > 1) throw textError("TEXT_FIELD_MARKER_AMBIGUOUS", `Tekstveld ${field.nodeField} komt meerdere keren voor.`, 422, "validate_editor_markers");
    if (!matches.length) nextPackage = removeTextFieldCapability(nextPackage, field);
  }
  return nextPackage;
}

async function parseTextSection(html, manifest, pagePath, definition) {
  const document = await parseDocument(html);
  let section;
  try { section = findSection(document, TEXT_SECTION_ID, TEXT_SECTION_TYPE, textError); }
  catch (error) {
    if (error.code === "SECTION_MARKER_AMBIGUOUS") error.code = "TEXT_MARKER_AMBIGUOUS";
    else if (error.code === "SECTION_WRITE_UNAVAILABLE") error.code = "TEXT_WRITE_UNAVAILABLE";
    throw error;
  }
  const fieldNodes = new Map();
  for (const field of definition.editor.fields) {
    try { fieldNodes.set(field.nodeField, exactFieldNode(section, field.nodeField, textError)); }
    catch (error) {
      if (error.code === "SECTION_FIELD_MARKER_AMBIGUOUS") error.code = "TEXT_FIELD_MARKER_AMBIGUOUS";
      else if (error.code === "SECTION_FIELD_MISSING") error.code = "TEXT_WRITE_UNAVAILABLE";
      throw error;
    }
  }
  const values = {};
  for (const field of definition.editor.fields) {
    const node = fieldNodes.get(field.nodeField);
    if (field.target === "paragraphs") values.body = readParagraphs(node);
    else values[field.key] = textContent(node).trim();
  }
  validateManifestDom(document, manifest, pagePath, textError);
  const images = findNodes(section, (node) => node.tagName === "img");
  const rawSection = html.slice(section.sourceCodeLocation.startOffset, section.sourceCodeLocation.endOffset);
  return {
    html,
    values,
    fieldNodes,
    availableFields: definition.editor.fields.map((field) => field.key),
    image: images.length ? { src: attribute(images[0], "src"), alt: attribute(images[0], "alt") } : null,
    contentHash: sha256(rawSection),
  };
}

function readParagraphs(node) {
  const paragraphs = [];
  for (const child of node?.childNodes || []) {
    if (child.nodeName === "#text" && !String(child.value || "").trim()) continue;
    if (child.tagName !== "p" || (child.childNodes || []).some((item) => item.nodeName !== "#text")) throw textError("TEXT_BODY_STRUCTURE_UNSUPPORTED", "De body bevat geen uitsluitend normale paragrafen.", 409, "validate_body_structure");
    paragraphs.push(textContent(child).trim());
  }
  return paragraphs;
}

function validateTextPatch(input = {}, currentValues = {}, availableFields = []) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw textError("TEXT_PATCH_INVALID", "De tekstwijziging is ongeldig.", 400, "validate_patch");
  const allowed = new Set(availableFields);
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !allowed.has(key))) throw textError("TEXT_CAPABILITY_MISMATCH", "De tekstwijziging bevat een niet-toegestaan veld.", 400, "validate_patch");
  const result = {};
  for (const key of keys) {
    const field = TEXT_FIELDS.find((item) => item.key === key);
    if (field?.target === "paragraphs") result.body = validateParagraphs(input.body, field);
    else {
      if (!field || typeof input[key] !== "string" || CONTROL_CHARACTERS.test(input[key])) throw textError("TEXT_FIELD_INVALID", `${field?.label || key} bevat ongeldige tekens.`, 400, "validate_patch");
      const value = input[key].trim();
      if (value.length > field.maxLength) throw textError("TEXT_FIELD_TOO_LONG", `${field.label} is langer dan toegestaan.`, 400, "validate_patch");
      if (field.required && !value) throw textError("TEXT_FIELD_REQUIRED", `${field.label} is verplicht.`, 400, "validate_patch");
      result[key] = value;
    }
  }
  const merged = { ...currentValues, ...result };
  if (availableFields.includes("title") && !cleanText(merged.title)) throw textError("TEXT_FIELD_REQUIRED", "Titel is verplicht.", 400, "validate_patch");
  return result;
}

function validateParagraphs(value, field = TEXT_FIELDS.find((item) => item.key === "body")) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw textError("TEXT_BODY_INVALID", "De body moet uit normale paragrafen bestaan.", 400, "validate_body");
  const paragraphs = value.map((item) => item.trim()).filter(Boolean);
  if (paragraphs.length > field.maxParagraphs) throw textError("TEXT_BODY_TOO_MANY_PARAGRAPHS", "De body bevat meer paragrafen dan toegestaan.", 400, "validate_body");
  if (paragraphs.some((item) => CONTROL_CHARACTERS.test(item))) throw textError("TEXT_BODY_INVALID", "De body bevat ongeldige tekens.", 400, "validate_body");
  if (paragraphs.some((item) => item.length > field.maxParagraphLength)) throw textError("TEXT_PARAGRAPH_TOO_LONG", "Een bodyparagraaf is langer dan toegestaan.", 400, "validate_body");
  if (paragraphs.reduce((total, item) => total + item.length, 0) > field.maxLength) throw textError("TEXT_BODY_TOO_LONG", "De body is langer dan toegestaan.", 400, "validate_body");
  return paragraphs;
}

function removeTextFieldCapability(generatedPackage, field) {
  const nextPackage = clonePackage(generatedPackage);
  const manifest = structuredClone(generatedPackage.meta?.editorManifest || {});
  const section = manifest.pages?.flatMap((page) => page.sections || []).find((item) => item.id === TEXT_SECTION_ID);
  if (section?.editor) {
    section.fields = (section.fields || []).filter((item) => item !== field.nodeField);
    section.editor.fields = (section.editor.fields || []).filter((item) => item.key !== field.key);
    section.editor.capabilities = (section.editor.capabilities || []).filter((item) => item !== `write:${field.key}`);
  }
  return updateManifest(nextPackage, manifest, { textEditorAvailability: "editable_partial", textEditorReason: `missing_optional_${field.key}` });
}

function removeTextWriteCapabilities(generatedPackage = {}, reason = "") {
  const nextPackage = clonePackage(generatedPackage);
  const manifest = structuredClone(generatedPackage.meta?.editorManifest || {});
  const section = manifest.pages?.flatMap((page) => page.sections || []).find((item) => item.id === TEXT_SECTION_ID);
  if (section) delete section.editor;
  return updateManifest(nextPackage, manifest, { textEditorAvailability: "read_only", textEditorReason: cleanText(reason).slice(0, 80) });
}

function updateManifest(generatedPackage, manifest, status) {
  generatedPackage.meta = { ...(generatedPackage.meta || {}), editorManifest: manifest, ...status };
  const briefingIndex = generatedPackage.files.findIndex((file) => file?.path === "briefing.json" && file.encoding !== "base64");
  if (briefingIndex >= 0) {
    try {
      const briefing = JSON.parse(String(generatedPackage.files[briefingIndex].content || "{}"));
      generatedPackage.files[briefingIndex] = { ...generatedPackage.files[briefingIndex], content: JSON.stringify({ ...briefing, editorManifest: manifest, ...status }, null, 2) };
    } catch {}
  }
  return generatedPackage;
}

function textError(code, message, status = 400, phase = "preview_editor") {
  return sectionError(code, message, status, phase);
}

module.exports = {
  extractTextContext,
  patchTextPackage,
  prepareTextEditorPackage,
  publicTextSchema,
  textError,
  validateParagraphs,
  validateTextPatch,
};
