const { validateEditorManifest } = require("./_preview-editor-manifest");
const {
  CONTROL_CHARACTERS,
  applyOperations,
  attribute,
  clonePackage,
  escapeAttribute,
  exactFieldNode,
  findSection,
  isSha256,
  parseDocument,
  patchFingerprint,
  replaceEntryHtml,
  sectionError,
  sha256,
  validateManifestDom,
  validatePackage,
} = require("./_preview-editor-section-core");
const {
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_FIELD,
  IMAGE_SCHEMA_ID,
  IMAGE_SECTION_ID,
  IMAGE_SECTION_TYPE,
  IMAGE_SLOT_ID,
  IMAGE_WRITE_CAPABILITIES,
  publicImageSchema,
} = require("./_preview-editor-image-schema");
const { validateImageBytes } = require("./_relationship-image-validation");

async function extractImageContext(generatedPackage = {}) {
  const packageContext = validatePackage(generatedPackage, imageEditorError);
  const manifest = validateEditorManifest(generatedPackage.meta?.editorManifest);
  const definition = manifest?.pages?.find((page) => page.path === packageContext.entryFile)?.sections?.find((section) => section.id === IMAGE_SECTION_ID);
  if (!definition?.imageEditor || definition.imageEditor.schema !== IMAGE_SCHEMA_ID || definition.type !== IMAGE_SECTION_TYPE) {
    throw imageEditorError("IMAGE_WRITE_UNAVAILABLE", "Deze preview bevat geen veilig bewerkbaar Hero-imageslot.", 409, "validate_image_manifest");
  }
  if (IMAGE_WRITE_CAPABILITIES.some((capability) => !definition.imageEditor.capabilities.includes(capability))) {
    throw imageEditorError("IMAGE_CAPABILITY_MISMATCH", "De image-writecapabilities zijn niet volledig.", 409, "validate_image_manifest");
  }
  const parsed = await parseImageSlot(packageContext.html, manifest, packageContext.entryFile);
  const packageFile = generatedPackage.files.find((file) => file?.path === parsed.image.src);
  let assetMetadata = null;
  if (packageFile?.encoding === "base64") {
    try {
      const bytes = Buffer.from(String(packageFile.content || ""), "base64");
      assetMetadata = validateImageBytes(bytes, {
        filename: String(packageFile.path || "").split("/").pop(),
        mimeType: mimeForPath(packageFile.path),
        declaredSize: bytes.length,
        requireHeroMinimum: false,
        rejectExif: false,
      });
    } catch {}
  }
  return {
    ...parsed,
    image: { ...parsed.image, ...(assetMetadata ? publicAssetMetadata(assetMetadata) : {}) },
    entryFile: packageContext.entryFile,
    fileIndex: packageContext.fileIndex,
    totalBytes: packageContext.totalBytes,
    schema: publicImageSchema(),
    manifest,
  };
}

async function patchImagePackage(generatedPackage = {}, patch = {}, expectedHash = "", resolvedAsset = {}) {
  const source = await extractImageContext(generatedPackage);
  if (!isSha256(expectedHash) || source.contentHash !== expectedHash) throw imageEditorError("EDIT_CONFLICT", "Deze preview is ondertussen gewijzigd. Laad de nieuwste versie voordat je opnieuw opslaat.", 409, "validate_base_hash");
  const values = validateImagePatch(patch);
  const bytes = Buffer.isBuffer(resolvedAsset.bytes) ? resolvedAsset.bytes : Buffer.from(resolvedAsset.bytes || []);
  const metadata = validateImageBytes(bytes, {
    filename: resolvedAsset.filename,
    mimeType: resolvedAsset.mimeType,
    declaredSize: resolvedAsset.sizeBytes ?? bytes.length,
    requireHeroMinimum: true,
    rejectExif: true,
  });
  if (resolvedAsset.checksum && resolvedAsset.checksum !== metadata.checksum) throw imageEditorError("IMAGE_HASH_MISMATCH", "De gekozen asset is gewijzigd sinds de selectie.", 409, "validate_source_asset");
  const packagePath = `assets/editor/${metadata.checksum}.${metadata.packageExtension}`;
  const existing = generatedPackage.files.find((file) => file?.path === packagePath);
  const encoded = bytes.toString("base64");
  if (existing && (existing.encoding !== "base64" || String(existing.content || "") !== encoded)) throw imageEditorError("IMAGE_PACKAGE_HASH_CONFLICT", "Het previewpackage bevat een conflicterende asset.", 409, "patch_image_package");

  const operations = [];
  const srcLocation = source.imageNode.sourceCodeLocation?.attrs?.src;
  const altLocation = source.imageNode.sourceCodeLocation?.attrs?.alt;
  if (!srcLocation || !altLocation) throw imageEditorError("IMAGE_SLOT_STRUCTURE_UNSUPPORTED", "Het Hero-imageslot heeft geen veilige src- en alt-attributen.", 409, "patch_image");
  operations.push({ start: srcLocation.startOffset, end: srcLocation.endOffset, replacement: `src="${escapeAttribute(packagePath)}"` });
  operations.push({ start: altLocation.startOffset, end: altLocation.endOffset, replacement: `alt="${escapeAttribute(values.alt)}"` });
  const html = applyOperations(source.html, operations, imageEditorError);
  const nextPackage = replaceEntryHtml(generatedPackage, source.fileIndex, html);
  if (!existing) nextPackage.files.push({ path: packagePath, content: encoded, encoding: "base64" });
  nextPackage.meta = {
    ...(nextPackage.meta || {}),
    editorManifest: source.manifest,
    editorRevision: {
      sectionId: IMAGE_SECTION_ID,
      sectionType: IMAGE_SECTION_TYPE,
      field: IMAGE_FIELD,
      assetSlotId: IMAGE_SLOT_ID,
      baseContentHash: source.contentHash,
      sourceAssetHash: metadata.checksum,
    },
    imageAssets: {
      ...((nextPackage.meta?.imageAssets && typeof nextPackage.meta.imageAssets === "object") ? nextPackage.meta.imageAssets : {}),
      [IMAGE_SLOT_ID]: {
        path: packagePath,
        checksum: metadata.checksum,
        mimeType: metadata.mimeType,
        width: metadata.width,
        height: metadata.height,
        sourceAssetId: String(resolvedAsset.id || ""),
        sourceAssetType: String(resolvedAsset.sourceType || ""),
        sourceAssetOrigin: String(resolvedAsset.origin || ""),
      },
    },
  };
  validatePackage(nextPackage, imageEditorError);
  const verified = await extractImageContext(nextPackage);
  if (verified.image.src !== packagePath || verified.image.alt !== values.alt) throw imageEditorError("IMAGE_PATCH_VERIFICATION_FAILED", "De afbeeldingswijziging kon niet veilig worden geverifieerd.", 500, "verify_image_patch");
  validateManifestDom(await parseDocument(verified.html), verified.manifest, verified.entryFile, imageEditorError);
  nextPackage.meta.editorRevision.contentHash = verified.contentHash;
  return {
    generatedPackage: nextPackage,
    source,
    values,
    image: verified.image,
    contentHash: verified.contentHash,
    asset: { ...metadata, packagePath, reusedPackageAsset: Boolean(existing) },
  };
}

async function prepareImageEditorPackage(generatedPackage = {}) {
  try {
    await extractImageContext(generatedPackage);
    return { generatedPackage, availability: "editable", reason: "" };
  } catch (error) {
    return {
      generatedPackage: removeImageWriteCapabilities(generatedPackage, error?.code || "IMAGE_VALIDATION_UNAVAILABLE"),
      availability: "read_only",
      reason: error?.code || "IMAGE_VALIDATION_UNAVAILABLE",
    };
  }
}

async function parseImageSlot(html, manifest, pagePath) {
  const document = await parseDocument(html);
  const section = findSection(document, IMAGE_SECTION_ID, IMAGE_SECTION_TYPE, imageEditorError);
  const imageNode = exactFieldNode(section, IMAGE_FIELD, imageEditorError);
  if (imageNode.nodeName !== "img") throw imageEditorError("IMAGE_SLOT_STRUCTURE_UNSUPPORTED", "Het Hero-imageslot is geen normale afbeelding.", 409, "validate_image_slot");
  const src = attribute(imageNode, "src");
  const alt = attribute(imageNode, "alt");
  if (!src || /^https?:|^data:|^blob:/i.test(src) || !imageNode.sourceCodeLocation?.attrs?.src || !imageNode.sourceCodeLocation?.attrs?.alt) {
    throw imageEditorError("IMAGE_SLOT_STRUCTURE_UNSUPPORTED", "Het Hero-imageslot gebruikt geen veilig lokaal packagepad.", 409, "validate_image_slot");
  }
  validateManifestDom(document, manifest, pagePath, imageEditorError);
  return {
    html,
    imageNode,
    image: { src, alt, assetSlotId: IMAGE_SLOT_ID },
    contentHash: sha256(html.slice(section.sourceCodeLocation.startOffset, section.sourceCodeLocation.endOffset)),
  };
}

function validateImagePatch(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw imageEditorError("IMAGE_PATCH_INVALID", "De afbeeldingswijziging is ongeldig.", 400, "validate_image_patch");
  const keys = Object.keys(input);
  if (keys.some((key) => !["assetSlotId", "sourceAssetId", "sourceType", "alt"].includes(key)) || input.assetSlotId !== IMAGE_SLOT_ID || typeof input.alt !== "string") {
    throw imageEditorError("IMAGE_CAPABILITY_MISMATCH", "De afbeeldingswijziging bevat een niet-toegestaan veld of imageslot.", 400, "validate_image_patch");
  }
  const alt = input.alt.trim();
  if (!alt) throw imageEditorError("IMAGE_ALT_REQUIRED", "Alttekst is verplicht.", 400, "validate_image_alt");
  if (alt.length > IMAGE_ALT_MAX_LENGTH) throw imageEditorError("IMAGE_ALT_TOO_LONG", `Alttekst mag maximaal ${IMAGE_ALT_MAX_LENGTH} tekens bevatten.`, 400, "validate_image_alt");
  if (CONTROL_CHARACTERS.test(alt) || /[<>]/.test(alt)) throw imageEditorError("IMAGE_ALT_INVALID", "Alttekst bevat ongeldige tekens.", 400, "validate_image_alt");
  return {
    assetSlotId: IMAGE_SLOT_ID,
    sourceAssetId: String(input.sourceAssetId || "").trim(),
    sourceType: String(input.sourceType || "").trim(),
    alt,
  };
}

function removeImageWriteCapabilities(generatedPackage = {}, reason = "") {
  const nextPackage = clonePackage(generatedPackage);
  const manifest = generatedPackage.meta?.editorManifest && typeof generatedPackage.meta.editorManifest === "object" ? structuredClone(generatedPackage.meta.editorManifest) : null;
  if (manifest?.pages) {
    for (const page of manifest.pages) {
      for (const section of page.sections || []) {
        if (section?.id !== IMAGE_SECTION_ID) continue;
        delete section.imageEditor;
        section.fields = (section.fields || []).filter((field) => field !== IMAGE_FIELD);
      }
    }
  }
  nextPackage.meta = {
    ...(nextPackage.meta || {}),
    ...(manifest ? { editorManifest: manifest } : {}),
    imageEditorAvailability: "read_only",
    imageEditorReason: String(reason || "").trim().slice(0, 80),
  };
  const briefingIndex = nextPackage.files.findIndex((file) => file?.path === "briefing.json" && file.encoding !== "base64");
  if (briefingIndex >= 0) {
    try {
      const briefing = JSON.parse(String(nextPackage.files[briefingIndex].content || "{}"));
      nextPackage.files[briefingIndex] = {
        ...nextPackage.files[briefingIndex],
        content: JSON.stringify({ ...briefing, ...(manifest ? { editorManifest: manifest } : {}), imageEditorAvailability: "read_only", imageEditorReason: String(reason || "").trim().slice(0, 80) }, null, 2),
      };
    } catch {}
  }
  return nextPackage;
}

function publicAssetMetadata(value = {}) {
  return {
    mimeType: value.mimeType,
    sizeBytes: value.sizeBytes,
    width: value.width,
    height: value.height,
    aspectRatio: value.aspectRatio,
  };
}

function mimeForPath(value = "") {
  const path = String(value).toLowerCase();
  if (/\.jpe?g$/.test(path)) return "image/jpeg";
  if (/\.png$/.test(path)) return "image/png";
  if (/\.webp$/.test(path)) return "image/webp";
  return "";
}

function imageEditorError(code, message, status = 400, phase = "preview_image_editor") { return sectionError(code, message, status, phase); }

module.exports = {
  extractImageContext,
  imageEditorError,
  patchFingerprint,
  patchImagePackage,
  prepareImageEditorPackage,
  publicImageSchema,
  removeImageWriteCapabilities,
  validateImagePatch,
};
