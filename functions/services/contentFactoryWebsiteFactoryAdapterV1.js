const path = require("path");
const { pathToFileURL } = require("url");

const CONTRACT_VERSION = "content-factory-adapter/v1";
const MODES = new Set(["off", "shadow", "active"]);
const ADAPTER_MODULE_URL = pathToFileURL(path.resolve(__dirname, "..", "..", "content-factory", "content-factory-adapter", "v1", "index.mjs")).href;

function cleanText(value = "") {
  return String(value || "").trim();
}

function resolveMode(environment = process.env) {
  const requested = cleanText(environment?.CONTENT_FACTORY_ADAPTER_V1_MODE).toLowerCase();
  return MODES.has(requested) ? requested : "off";
}

function extractBriefingField(text = "", labels = []) {
  const source = cleanText(text);
  for (const label of labels) {
    const match = source.match(new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*:\\s*([^\\n]+)`, "i"));
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitList(value = "") {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return cleanText(value).split(/,|;|\n/).map(cleanText).filter(Boolean);
}

function factoryInputFromJourney(journey = {}) {
  const previewPackage = journey.previewPackage || journey.preview_package || {};
  const value = previewPackage.factoryInput || previewPackage.factory_input || journey.factoryInput || journey.factory_input || {};
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function adapterInputFromRenderRequest({ journey = {}, briefing = "", packageType = "", version = 1 } = {}) {
  const factoryInput = factoryInputFromJourney(journey);
  const seo = factoryInput.seo && typeof factoryInput.seo === "object" ? factoryInput.seo : {};
  const branding = factoryInput.branding && typeof factoryInput.branding === "object" ? factoryInput.branding : {};
  const vertical = cleanText(
    factoryInput.vertical
      || factoryInput.industry
      || factoryInput.companyType
      || journey.vertical
      || journey.industry
      || extractBriefingField(briefing, ["Branche", "Bedrijfstype"])
  );
  const combinedRegion = extractBriefingField(briefing, ["Branche/regio"]);
  const inferredRegion = combinedRegion.includes("/") ? combinedRegion.split("/").slice(1).join("/") : "";
  return {
    vertical,
    companyName: cleanText(factoryInput.businessName || journey.businessName || journey.business_name),
    region: cleanText(seo.serviceArea || factoryInput.region || journey.region || extractBriefingField(briefing, ["Werkgebied", "Regio"]) || inferredRegion),
    tone: cleanText(seo.toneOfVoice || branding.lookAndFeel || extractBriefingField(briefing, ["Tone of voice"])),
    template: cleanText(factoryInput.template || journey.template),
    package: cleanText(factoryInput.packageType || packageType || journey.packageType || journey.package_type),
    seed: cleanText(factoryInput.contentFactorySeed || journey.contentFactorySeed) || `${cleanText(journey.id || journey.businessName || journey.business_name || "website")}:v${Number(version) || 1}`,
    phone: cleanText(factoryInput.phone || journey.phone),
    email: cleanText(factoryInput.email || journey.email),
    websiteUrl: cleanText(factoryInput.websiteUrl || journey.websiteUrl || journey.website_url)
  };
}

function buildAdaptedBriefing(adapterOutput, originalBriefing = "") {
  const input = adapterOutput.websiteFactoryInput;
  const metadata = adapterOutput.metadata;
  const rows = [
    `Content Factory contract: ${metadata.contractVersion}`,
    `Content Factory seed: ${metadata.seed}`,
    `Bedrijf: ${input.businessName}`,
    `Branche: ${metadata.resolvedVertical}`,
    `Regio: ${input.seo.serviceArea}`,
    `Tone of voice: ${input.seo.toneOfVoice}`,
    `Diensten: ${input.services.join(", ")}`,
    `USP's: ${(input.texts.usps || []).join(", ")}`,
    `CTA: ${(input.ctas || []).join(", ")}`,
    `SEO: ${(input.seo.keywords || []).join(", ")}`,
    `Websitepakket: ${input.packageType}`,
    `Template: ${input.template}`
  ];
  if (cleanText(originalBriefing)) rows.push("", "Oorspronkelijke briefing:", cleanText(originalBriefing));
  return rows.join("\n");
}

function mergeJourneyWithFactoryInput(journey = {}, factoryInput = {}) {
  return {
    ...journey,
    businessName: factoryInput.businessName || journey.businessName || journey.business_name,
    phone: factoryInput.phone || journey.phone,
    email: factoryInput.email || journey.email,
    websiteUrl: factoryInput.websiteUrl || journey.websiteUrl || journey.website_url,
    packageType: factoryInput.packageType || journey.packageType || journey.package_type,
    factoryInput,
    contentFactoryInput: factoryInput.contentFactory
  };
}

function compareInputs({ journey = {}, briefing = "", adapterOutput } = {}) {
  const adapterInput = adapterOutput.websiteFactoryInput;
  const legacyServices = splitList(extractBriefingField(briefing, ["Diensten"]));
  const adapterServices = splitList(adapterInput.services);
  const normalizedLegacy = new Set(legacyServices.map((item) => item.toLowerCase()));
  const overlap = adapterServices.filter((item) => normalizedLegacy.has(item.toLowerCase()));
  const legacyBusinessName = cleanText(journey.businessName || journey.business_name);
  return {
    legacyBusinessName,
    adapterBusinessName: adapterInput.businessName,
    businessNameMatches: !legacyBusinessName || legacyBusinessName === adapterInput.businessName,
    legacyServiceCount: legacyServices.length,
    adapterServiceCount: adapterServices.length,
    serviceOverlapCount: overlap.length,
    resolvedVertical: adapterOutput.metadata.resolvedVertical,
    fallbackCount: adapterOutput.metadata.fallbacks.length,
    unresolvedTokenCount: adapterOutput.metadata.placeholderFlags.unresolvedTokens.length,
    reviewPlaceholdersBlocked: adapterOutput.reviews.items.every((review) => review.publishable === false)
  };
}

async function defaultResolver(input) {
  const module = await import(ADAPTER_MODULE_URL);
  return module.resolveWebsiteContent(input);
}

async function prepareWebsiteFactoryRenderRequest({
  journey = {},
  briefing = "",
  packageType = "",
  version = 1,
  environment = process.env,
  resolver = defaultResolver
} = {}) {
  const mode = resolveMode(environment);
  const legacyRequest = { journey, briefing, version };
  if (mode === "off") {
    return {
      request: legacyRequest,
      integration: { contractVersion: CONTRACT_VERSION, mode, status: "off", usedByRenderer: false, fallbackUsed: false }
    };
  }

  try {
    const adapterInput = adapterInputFromRenderRequest({ journey, briefing, packageType, version });
    const adapterOutput = await resolver(adapterInput);
    const comparison = compareInputs({ journey, briefing, adapterOutput });
    const integration = {
      contractVersion: CONTRACT_VERSION,
      mode,
      status: mode === "active" ? "active_ready" : "shadow_ready",
      usedByRenderer: mode === "active",
      fallbackUsed: false,
      source: adapterOutput.metadata.source,
      sourceVersion: adapterOutput.metadata.sourceVersion,
      contentVersion: adapterOutput.metadata.contentVersion,
      verticalVersion: adapterOutput.metadata.verticalVersion,
      requestedVertical: adapterOutput.metadata.requestedVertical,
      resolvedVertical: adapterOutput.metadata.resolvedVertical,
      seed: adapterOutput.metadata.seed,
      generatedAt: adapterOutput.metadata.generatedAt,
      placeholderFlags: adapterOutput.metadata.placeholderFlags,
      comparison
    };
    if (mode === "shadow") return { request: legacyRequest, integration, adapterOutput };
    return {
      request: {
        journey: mergeJourneyWithFactoryInput(journey, adapterOutput.websiteFactoryInput),
        briefing: buildAdaptedBriefing(adapterOutput, briefing),
        version,
        factoryInput: adapterOutput.websiteFactoryInput
      },
      integration,
      adapterOutput
    };
  } catch (error) {
    return {
      request: legacyRequest,
      integration: {
        contractVersion: CONTRACT_VERSION,
        mode,
        status: "legacy_fallback",
        usedByRenderer: false,
        fallbackUsed: true,
        reason: "adapter_resolution_failed",
        errorName: cleanText(error?.name) || "Error",
        errorMessage: cleanText(error?.message).slice(0, 240)
      }
    };
  }
}

function attachIntegrationMetadata(generatedPackage, integration = {}) {
  if (!generatedPackage || typeof generatedPackage !== "object") return generatedPackage;
  if (integration.status === "off") return generatedPackage;
  generatedPackage.meta = generatedPackage.meta && typeof generatedPackage.meta === "object" ? generatedPackage.meta : {};
  generatedPackage.meta.contentFactoryAdapter = { ...integration };
  return generatedPackage;
}

module.exports = {
  CONTRACT_VERSION,
  attachIntegrationMetadata,
  prepareWebsiteFactoryRenderRequest,
  resolveMode,
  _private: {
    adapterInputFromRenderRequest,
    buildAdaptedBriefing,
    compareInputs,
    extractBriefingField,
    mergeJourneyWithFactoryInput
  }
};
