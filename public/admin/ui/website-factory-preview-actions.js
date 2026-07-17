(function previewActionsModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WebsiteFactoryPreviewActions = Object.freeze(api);
})(typeof window !== "undefined" ? window : globalThis, function createPreviewActions() {
  "use strict";

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SOURCE_FACTORY = "website_factory";
  const SOURCE_MANUAL = "manual_zip";

  function text(value) {
    return String(value || "").trim();
  }

  function sourceTypeOf(version = {}) {
    const raw = text(version.sourceType || version.metadata?.previewSource || version.generatedPackage?.meta?.previewSource || version.generated_package?.meta?.previewSource).toLowerCase();
    return ["manual", "manual_zip", "manual-zip", "zip"].includes(raw) ? SOURCE_MANUAL : SOURCE_FACTORY;
  }

  function actionContext(input = {}) {
    const version = input.version && typeof input.version === "object" ? input.version : {};
    const previewVersionId = text(version.id);
    const sourceType = sourceTypeOf(version);
    const previewUrl = text(input.previewUrl || version.previewUrl || version.preview_url);
    const customerId = text(input.customerId);
    const demoJourneyId = text(input.demoJourneyId);
    const leadId = text(input.leadId);
    const projectId = text(input.projectId);
    const websiteId = text(input.websiteId);
    const savedPreviewVersionId = text(input.savedPreviewVersionId);
    const publishedPreviewVersionId = text(input.publishedPreviewVersionId);
    const localZipPending = input.localZipPending === true;
    const serverStored = UUID_PATTERN.test(previewVersionId) && Boolean(previewUrl) && version.renderable !== false && !localZipPending;
    const hasRepositoryScope = UUID_PATTERN.test(demoJourneyId);
    const hasCustomer = UUID_PATTERN.test(customerId);
    const manual = sourceType === SOURCE_MANUAL;
    const demoEnabled = serverStored && hasRepositoryScope;
    const publishEnabled = serverStored && hasCustomer && (manual || UUID_PATTERN.test(websiteId));
    const saved = Boolean(previewVersionId && savedPreviewVersionId === previewVersionId);
    const published = Boolean(previewVersionId && publishedPreviewVersionId === previewVersionId);
    const versionLabel = `${manual ? "Handmatige ZIP" : "Website Factory"} · V${Number(version.version || 1)}`;
    let explanation = "";
    if (localZipPending) explanation = "Verwerk de ZIP eerst voordat deze kan worden opgeslagen of gepubliceerd.";
    else if (!serverStored) explanation = "Selecteer eerst een verwerkte previewversie.";
    else if (!hasRepositoryScope) explanation = "Koppel de preview eerst aan een demo-aanvraag.";
    else if (!hasCustomer) explanation = "Selecteer eerst een lead of klant om naar het klantportaal door te zetten.";

    return {
      previewVersionId,
      sourceType,
      editable: sourceType === SOURCE_FACTORY && version.editable === true,
      readOnly: manual,
      status: text(version.status || "internal"),
      previewUrl,
      customerId,
      demoJourneyId,
      leadId,
      projectId,
      websiteId,
      serverStored,
      demoEnabled,
      publishEnabled,
      activateEnabled: manual && publishEnabled && !published && version.active !== true && version.isActive !== true,
      saved,
      published,
      versionLabel,
      saveLabel: saved ? "Opgeslagen in Demo Sites" : "Opslaan in Demo Sites",
      publishLabel: published ? "Actief in klantportaal" : "Doorzetten naar klantportaal",
      explanation,
    };
  }

  return { SOURCE_FACTORY, SOURCE_MANUAL, UUID_PATTERN, actionContext, sourceTypeOf };
});
