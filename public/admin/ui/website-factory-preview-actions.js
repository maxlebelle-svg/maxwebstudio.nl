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

  function safeShareUrl(input = {}) {
    const previewVersionId = text(input.previewVersionId);
    const sourceType = text(input.sourceType);
    const rawUrl = text(input.previewUrl);
    const expectedPreviewToken = text(input.previewToken);
    if (!UUID_PATTERN.test(previewVersionId) || !rawUrl) return "";
    let url;
    try {
      url = new URL(rawUrl, text(input.siteOrigin) || "https://maxwebstudio.nl");
    } catch {
      return "";
    }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (hostname !== "maxwebstudio.nl" && !hostname.endsWith(".maxwebstudio.nl"))) return "";
    if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return "";
    const selectedId = text(url.searchParams.get("previewVersionId") || url.searchParams.get("version"));
    if (selectedId !== previewVersionId) return "";
    if (sourceType === SOURCE_MANUAL) {
      if (url.pathname !== "/.netlify/functions/manual-preview-render") return "";
      const previewToken = text(url.searchParams.get("token"));
      if (text(url.searchParams.get("version")) !== previewVersionId || !previewToken) return "";
      if (expectedPreviewToken && previewToken !== expectedPreviewToken) return "";
      if (text(url.searchParams.get("source")) !== SOURCE_MANUAL) return "";
    } else {
      if (!["/.netlify/functions/demo-preview", "/demo-preview", "/demo-preview.html"].includes(url.pathname)) return "";
      if (text(url.searchParams.get("source")) !== "factory") return "";
    }
    url.hash = "";
    return url.toString();
  }

  function whatsappMessage(input = {}) {
    const previewUrl = text(input.previewUrl);
    if (!previewUrl) return "";
    const contactName = text(input.contactName);
    const companyName = text(input.companyName);
    if (contactName && companyName) return `Hallo ${contactName}, hierbij kunt u de demo voor ${companyName} bekijken:\n${previewUrl}\n\nIk hoor graag wat u ervan vindt.`;
    if (companyName) return `Hallo, hierbij kunt u de demo voor ${companyName} bekijken:\n${previewUrl}\n\nLaat gerust weten wat u ervan vindt.`;
    return `Hallo, hierbij kunt u de demo van uw nieuwe website bekijken:\n${previewUrl}\n\nLaat gerust weten wat u ervan vindt.`;
  }

  function whatsappShareUrl(input = {}) {
    const message = whatsappMessage(input);
    if (!message) return "";
    const endpoint = input.mobile === false ? "https://web.whatsapp.com/send" : "https://wa.me/";
    return `${endpoint}?text=${encodeURIComponent(message)}`;
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
    const shareUrl = safeShareUrl({ previewUrl, previewVersionId, sourceType, previewToken: version.previewToken || version.preview_token, siteOrigin: input.siteOrigin });
    const shareEnabled = serverStored && Boolean(shareUrl);
    const demoEnabled = serverStored && hasRepositoryScope;
    const publishEnabled = serverStored && shareEnabled && hasCustomer && (manual || UUID_PATTERN.test(websiteId));
    const saved = Boolean(previewVersionId && savedPreviewVersionId === previewVersionId);
    const published = Boolean(previewVersionId && publishedPreviewVersionId === previewVersionId);
    const versionLabel = `${manual ? "Handmatige ZIP" : "Website Factory"} · V${Number(version.version || 1)}`;
    let explanation = "";
    if (localZipPending) explanation = "Verwerk de ZIP eerst voordat deze kan worden opgeslagen of gepubliceerd.";
    else if (!serverStored) explanation = "Selecteer eerst een verwerkte previewversie.";
    else if (!hasRepositoryScope) explanation = "Koppel de preview eerst aan een demo-aanvraag.";
    else if (!hasCustomer) explanation = "Selecteer eerst een lead of klant.";

    return {
      previewVersionId,
      sourceType,
      editable: sourceType === SOURCE_FACTORY && version.editable === true,
      readOnly: manual,
      status: text(version.status || "internal"),
      previewUrl,
      shareUrl,
      shareEnabled,
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
      explanation: explanation || (!shareEnabled && serverStored ? "Voor deze preview is geen veilige publieke previewlink beschikbaar." : ""),
    };
  }

  return { SOURCE_FACTORY, SOURCE_MANUAL, UUID_PATTERN, actionContext, safeShareUrl, sourceTypeOf, whatsappMessage, whatsappShareUrl };
});
