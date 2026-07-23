const path = require("path");
const { pathToFileURL } = require("url");
const v1Bridge = require("./contentFactoryWebsiteFactoryAdapterV1");

const ADAPTER_VERSIONS = new Set(["v1", "v2"]);
const MODES = new Set(["off", "shadow", "active"]);
const V2_CONTRACT = "content-factory-adapter/v2";
const V2_MODULE_URL = pathToFileURL(path.resolve(__dirname, "..", "..", "content-factory", "content-factory-adapter", "v2", "index.mjs")).href;

function cleanText(value = "") {
  return String(value || "").trim();
}

function splitList(value = "") {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return cleanText(value).split(/,|;|\n/).map(cleanText).filter(Boolean);
}

function resolveAdapterVersion(environment = process.env) {
  const requested = cleanText(environment?.WEBSITE_FACTORY_CONTENT_ADAPTER).toLowerCase();
  return ADAPTER_VERSIONS.has(requested) ? requested : "v1";
}

function resolveMode(environment = process.env) {
  const requested = cleanText(environment?.WEBSITE_FACTORY_CONTENT_ADAPTER_MODE || environment?.CONTENT_FACTORY_ADAPTER_V1_MODE).toLowerCase();
  return MODES.has(requested) ? requested : "off";
}

function v1Environment(environment, mode) {
  return { ...environment, CONTENT_FACTORY_ADAPTER_V1_MODE: mode };
}

function adapterV2InputFromRenderRequest(options = {}) {
  const base = v1Bridge._private.adapterInputFromRenderRequest(options);
  const factoryInput = v1Bridge._private.factoryInputFromJourney(options.journey);
  const field = (labels) => v1Bridge._private.extractBriefingField(options.briefing, labels);
  return {
    ...base,
    specialization: cleanText(factoryInput.specialization || factoryInput.subspecialization || field(["Subspecialisatie", "Specialisatie"])),
    style: cleanText(factoryInput.style || factoryInput.visualStyle || factoryInput.visual_style || field(["Visuele stijl", "Stijl"])),
    brandPersonality: cleanText(factoryInput.brandPersonality || factoryInput.brand_personality || field(["Merkpersoonlijkheid"])),
    theme: cleanText(factoryInput.theme || field(["Thema"])),
    goal: cleanText(factoryInput.goal || factoryInput.contentGoal || factoryInput.content_goal || field(["Contentdoel", "Doel"])),
    locale: cleanText(factoryInput.locale || factoryInput.language || field(["Locale", "Taal"])) || "nl-NL",
    channels: splitList(factoryInput.channels || field(["Kanalen"])).length ? splitList(factoryInput.channels || field(["Kanalen"])) : ["website"]
  };
}

async function defaultV2Resolver(input) {
  const module = await import(V2_MODULE_URL);
  return module.resolveWebsiteContentV2(input);
}

function compareAdapterOutputs(v1Output, v2Output) {
  const v1Services = new Set((v1Output.services || []).map((service) => cleanText(service.name).toLowerCase()));
  const v2Services = (v2Output.services || []).map((service) => cleanText(service.name).toLowerCase());
  return {
    heroChanged: cleanText(v1Output.hero?.title) !== cleanText(v2Output.hero?.title),
    serviceOverlapCount: v2Services.filter((service) => v1Services.has(service)).length,
    v1ServiceCount: v1Services.size,
    v2ServiceCount: v2Services.length,
    primaryColorChanged: cleanText(v1Output.brand?.colors?.primary) !== cleanText(v2Output.brand?.colors?.primary),
    surfaceColorChanged: cleanText(v1Output.brand?.colors?.surface) !== cleanText(v2Output.brand?.colors?.surface),
    seoTitleChanged: cleanText(v1Output.seo?.title) !== cleanText(v2Output.seo?.title),
    reviewPlaceholdersBlocked: (v2Output.reviews?.items || []).every((review) => review.publishable === false),
    v2WebsiteQuality: v2Output.quality?.website?.overall ?? null,
    v2BlueprintQuality: v2Output.quality?.blueprint?.overall ?? null
  };
}

function v2Integration({ mode, v1Prepared, v2Output, fallbackError = null }) {
  const rendererAdapterVersion = fallbackError || mode === "shadow" ? "v1" : "v2";
  return {
    contractVersion: V2_CONTRACT,
    selectedAdapterVersion: "v2",
    rendererAdapterVersion,
    mode,
    status: fallbackError ? "v2_fallback_v1" : mode === "shadow" ? "v2_shadow_ready" : "v2_active_ready",
    usedByRenderer: rendererAdapterVersion === "v2",
    fallbackUsed: Boolean(fallbackError),
    fallbackFrom: fallbackError ? "v2" : null,
    fallbackTo: fallbackError ? "v1" : null,
    fallbackReason: fallbackError ? "adapter_v2_resolution_failed" : null,
    errorName: fallbackError ? cleanText(fallbackError.name) || "Error" : null,
    errorMessage: fallbackError ? cleanText(fallbackError.message).slice(0, 240) : null,
    v1ContractVersion: v1Prepared.adapterOutput?.metadata?.contractVersion || "content-factory-adapter/v1",
    v2ContractVersion: v2Output?.metadata?.contractVersion || V2_CONTRACT,
    compositionVersion: v2Output?.metadata?.compositionVersion || null,
    compositionSignature: v2Output?.metadata?.compositionSignature || null,
    dimensions: v2Output?.blueprint?.dimensions || null,
    seed: v2Output?.metadata?.seed ?? v1Prepared.integration?.seed ?? null,
    fallbackChoices: v2Output?.metadata?.fallbacks || v1Prepared.integration?.fallbacks || [],
    placeholderFlags: v2Output?.metadata?.placeholderFlags || v1Prepared.integration?.placeholderFlags || {},
    quality: v2Output?.quality || null,
    comparison: v2Output && v1Prepared.adapterOutput ? compareAdapterOutputs(v1Prepared.adapterOutput, v2Output) : null
  };
}

function enrichV1Integration(prepared, mode) {
  return {
    ...prepared,
    integration: {
      ...prepared.integration,
      selectedAdapterVersion: "v1",
      rendererAdapterVersion: prepared.integration.usedByRenderer ? "v1" : "legacy",
      mode
    }
  };
}

async function prepareWebsiteFactoryRenderRequest({
  journey = {}, briefing = "", packageType = "", version = 1,
  environment = process.env, resolverV1, resolverV2 = defaultV2Resolver
} = {}) {
  const selectedVersion = resolveAdapterVersion(environment);
  const mode = resolveMode(environment);
  const common = { journey, briefing, packageType, version };

  if (selectedVersion === "v1" || mode === "off") {
    const prepared = await v1Bridge.prepareWebsiteFactoryRenderRequest({
      ...common,
      environment: v1Environment(environment, mode),
      ...(resolverV1 ? { resolver: resolverV1 } : {})
    });
    return enrichV1Integration(prepared, mode);
  }

  const v1Prepared = await v1Bridge.prepareWebsiteFactoryRenderRequest({
    ...common,
    environment: v1Environment(environment, "active"),
    ...(resolverV1 ? { resolver: resolverV1 } : {})
  });
  if (!v1Prepared.adapterOutput) {
    return {
      ...v1Prepared,
      integration: {
        ...v1Prepared.integration,
        selectedAdapterVersion: "v2",
        rendererAdapterVersion: "legacy",
        mode,
        status: "v1_baseline_unavailable",
        fallbackUsed: true,
        fallbackFrom: "v2",
        fallbackTo: "legacy"
      }
    };
  }

  try {
    const adapterInput = adapterV2InputFromRenderRequest(common);
    const v2Output = await resolverV2(adapterInput);
    const integration = v2Integration({ mode, v1Prepared, v2Output });
    if (mode === "shadow") return { request: v1Prepared.request, integration, adapterOutput: v2Output, baselineAdapterOutput: v1Prepared.adapterOutput };
    return {
      request: {
        journey: v1Bridge._private.mergeJourneyWithFactoryInput(journey, v2Output.websiteFactoryInput),
        briefing: v1Bridge._private.buildAdaptedBriefing(v2Output, briefing),
        version,
        factoryInput: v2Output.websiteFactoryInput
      },
      integration,
      adapterOutput: v2Output,
      baselineAdapterOutput: v1Prepared.adapterOutput
    };
  } catch (error) {
    return {
      request: v1Prepared.request,
      integration: v2Integration({ mode, v1Prepared, fallbackError: error }),
      adapterOutput: v1Prepared.adapterOutput,
      baselineAdapterOutput: v1Prepared.adapterOutput
    };
  }
}

module.exports = {
  attachIntegrationMetadata: v1Bridge.attachIntegrationMetadata,
  prepareWebsiteFactoryRenderRequest,
  resolveAdapterVersion,
  resolveMode,
  _private: { adapterV2InputFromRenderRequest, compareAdapterOutputs, v2Integration }
};

