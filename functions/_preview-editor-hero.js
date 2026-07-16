const { validateEditorManifest } = require("./_preview-editor-manifest");
const {
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
  parseDocument,
  patchFingerprint,
  replaceEntryHtml,
  sectionError,
  sha256,
  textContent,
  validateManifestDom,
  validatePackage,
} = require("./_preview-editor-section-core");
const {
  HERO_FIELDS,
  HERO_SCHEMA_ID,
  HERO_SECTION_ID,
  HERO_SECTION_TYPE,
  HERO_WRITE_CAPABILITIES,
  publicHeroSchema,
} = require("./_preview-editor-hero-schema");

async function extractHeroContext(generatedPackage = {}) {
  const packageContext = validatePackage(generatedPackage, heroError);
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
  const html = applyOperations(source.html, operations, heroError);
  const nextPackage = replaceEntryHtml(generatedPackage, source.fileIndex, html);
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
  const document = await parseDocument(html);
  let section;
  try { section = findSection(document, HERO_SECTION_ID, HERO_SECTION_TYPE, heroError); }
  catch (error) {
    if (error.code === "SECTION_MARKER_AMBIGUOUS") error.code = "HERO_MARKER_AMBIGUOUS";
    else if (error.code === "SECTION_WRITE_UNAVAILABLE") error.code = "HERO_WRITE_UNAVAILABLE";
    else if (error.code === "SECTION_MARKER_INVALID") error.code = "HERO_MARKER_INVALID";
    throw error;
  }
  const fieldNodes = new Map();
  const nodeFields = [...new Set(HERO_FIELDS.map((field) => field.nodeField))];
  for (const nodeField of nodeFields) {
    try { fieldNodes.set(nodeField, exactFieldNode(section, nodeField, heroError)); }
    catch (error) {
      if (error.code === "SECTION_FIELD_MARKER_AMBIGUOUS") error.code = "HERO_FIELD_MARKER_AMBIGUOUS";
      else if (error.code === "SECTION_FIELD_MISSING") error.code = "HERO_WRITE_UNAVAILABLE";
      throw error;
    }
  }
  const values = {};
  for (const field of HERO_FIELDS) {
    const node = fieldNodes.get(field.nodeField);
    values[field.key] = field.target === "href" ? attribute(node, "href") : textContent(node).trim();
  }
  const imageNode = findNodes(section, (node) => attribute(node, "data-mws-field") === "image");
  validateManifestDom(document, manifest, pagePath, heroError);
  const rawSection = html.slice(section.sourceCodeLocation.startOffset, section.sourceCodeLocation.endOffset);
  return {
    html,
    values,
    fieldNodes,
    availableFields: HERO_FIELDS.map((field) => field.key),
    image: imageNode.length === 1 ? { src: attribute(imageNode[0], "src"), alt: attribute(imageNode[0], "alt") } : null,
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

function heroError(code, message, status = 400, phase = "preview_editor") {
  return sectionError(code, message, status, phase);
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
