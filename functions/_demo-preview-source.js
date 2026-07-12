const PREVIEW_SOURCES = Object.freeze({ MANUAL: "manual_zip", FACTORY: "website_factory" });

function normalizePreviewSource(value = "") {
  const source = String(value || "").trim().toLowerCase();
  if (["manual", "manual_zip", "manual-zip", "zip"].includes(source)) return PREVIEW_SOURCES.MANUAL;
  if (["factory", "website_factory", "website-factory"].includes(source)) return PREVIEW_SOURCES.FACTORY;
  return "";
}

function hasManualPreview(previewPackage = {}) {
  const manual = previewPackage?.manualPreview || previewPackage?.manual_preview;
  return Boolean(manual && Array.isArray(manual.files) && manual.files.length);
}

function hasFactoryPreview(previewPackage = {}) {
  return Boolean(Array.isArray(previewPackage?.files) && previewPackage.files.length);
}

function storedPreviewSource(previewPackage = {}) {
  const savedDemo = previewPackage?.savedDemoSite || previewPackage?.saved_demo_site || previewPackage?.meta?.savedDemoSite || {};
  return normalizePreviewSource(savedDemo.previewSource || savedDemo.preview_source || previewPackage.previewSource || previewPackage.preview_source || previewPackage.activePreviewSource);
}

function legacyPreviewSource(previewPackage = {}) {
  const explicit = normalizePreviewSource(previewPackage?.activePreviewSource || previewPackage?.previewSource || previewPackage?.preview_source);
  if (explicit) return explicit;
  if (hasManualPreview(previewPackage)) return PREVIEW_SOURCES.MANUAL;
  if (hasFactoryPreview(previewPackage)) return PREVIEW_SOURCES.FACTORY;
  return "";
}

function resolveActiveDemoPreview(previewPackage = {}, requestedSource = "") {
  const persistedSource = storedPreviewSource(previewPackage);
  const requested = normalizePreviewSource(requestedSource);
  const source = requested || persistedSource || legacyPreviewSource(previewPackage);
  const manualAvailable = hasManualPreview(previewPackage);
  const factoryAvailable = hasFactoryPreview(previewPackage);
  const available = source === PREVIEW_SOURCES.MANUAL ? manualAvailable : source === PREVIEW_SOURCES.FACTORY ? factoryAvailable : false;
  return {
    source, persistedSource, available, manualAvailable, factoryAvailable,
    isLegacyFallback: !persistedSource && Boolean(source),
    previewPackage: source === PREVIEW_SOURCES.MANUAL && manualAvailable
      ? {
        ...previewPackage,
        files: previewPackage.manualPreview?.files || previewPackage.manual_preview?.files || [],
        version: previewPackage.version || previewPackage.meta?.version || "manual",
        meta: {
          ...(previewPackage.meta || {}),
          previewSource: PREVIEW_SOURCES.MANUAL,
          manualZipFileName: previewPackage.manualPreview?.fileName || previewPackage.manual_preview?.fileName || "",
        },
      }
      : previewPackage,
  };
}

module.exports = { PREVIEW_SOURCES, hasFactoryPreview, hasManualPreview, legacyPreviewSource, normalizePreviewSource, resolveActiveDemoPreview, storedPreviewSource };
