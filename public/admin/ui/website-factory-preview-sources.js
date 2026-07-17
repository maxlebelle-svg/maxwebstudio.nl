(function previewSourcesModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WebsiteFactoryPreviewSources = Object.freeze(api);
})(typeof window !== "undefined" ? window : globalThis, function createPreviewSources() {
  "use strict";

  const SOURCE_FACTORY = "factory_build";
  const SOURCE_MANUAL = "manual_zip";

  function text(value) {
    return String(value || "").trim();
  }

  function sourceTypeOf(version = {}) {
    const metadata = version.metadata && typeof version.metadata === "object" ? version.metadata : {};
    const packageMeta = version.generatedPackage?.meta || version.generated_package?.meta || {};
    const raw = text(version.sourceType || metadata.previewSource || metadata.sourceType || packageMeta.previewSource).toLowerCase();
    return ["manual", SOURCE_MANUAL].includes(raw) ? SOURCE_MANUAL : SOURCE_FACTORY;
  }

  function sourceLabel(sourceType) {
    return sourceType === SOURCE_MANUAL ? "Geüploade ZIP" : "Website Factory";
  }

  function previewUrlOf(version = {}) {
    return text(version.previewUrl || version.preview_url);
  }

  function createdAtOf(version = {}) {
    return text(version.createdAt || version.created_at || version.updatedAt || version.updated_at);
  }

  function normalize(version = {}) {
    const sourceType = sourceTypeOf(version);
    const metadata = version.metadata && typeof version.metadata === "object" ? version.metadata : {};
    const packageMeta = version.generatedPackage?.meta || version.generated_package?.meta || {};
    const previewUrl = previewUrlOf(version);
    const editable = sourceType === SOURCE_FACTORY && version.editorAvailable === true;
    const renderable = version.renderable !== false && Boolean(text(version.id) && previewUrl);
    return {
      ...version,
      id: text(version.id),
      sourceType,
      sourceLabel: sourceLabel(sourceType),
      createdAt: createdAtOf(version),
      status: text(version.status || "internal"),
      previewUrl,
      editable,
      active: version.isActive === true || version.active === true,
      buildJobId: text(version.buildJobId || version.build_job_id),
      uploadId: text(metadata.uploadId),
      contentHash: text(metadata.manualZipContentHash || metadata.contentHash || packageMeta.contentHash),
      fileName: text(metadata.fileName || packageMeta.fileName),
      renderable,
    };
  }

  function usableVersions(versions = []) {
    return versions.map(normalize).filter((version) => version.id && version.renderable && version.previewUrl);
  }

  function sessionKey(scope = {}) {
    const id = text(scope.demoJourneyId || scope.customerId || scope.leadId || scope.workspaceId || "general");
    return `websiteFactory:viewedPreviewVersion:${id}`;
  }

  function chooseViewedVersion({ versions = [], sessionVersionId = "", activeVersionId = "" } = {}) {
    const usable = usableVersions(versions);
    return usable.find((version) => version.id === text(sessionVersionId))
      || usable.find((version) => version.id === text(activeVersionId))
      || usable.sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0))[0]
      || null;
  }

  function versionsBySource(versions = []) {
    const usable = usableVersions(versions);
    return {
      [SOURCE_FACTORY]: usable.filter((version) => version.sourceType === SOURCE_FACTORY),
      [SOURCE_MANUAL]: usable.filter((version) => version.sourceType === SOURCE_MANUAL),
    };
  }

  function latestForSource(versions = [], sourceType = SOURCE_FACTORY) {
    return versionsBySource(versions)[sourceType][0] || null;
  }

  return {
    SOURCE_FACTORY,
    SOURCE_MANUAL,
    sourceTypeOf,
    sourceLabel,
    normalize,
    usableVersions,
    sessionKey,
    chooseViewedVersion,
    versionsBySource,
    latestForSource,
  };
});
