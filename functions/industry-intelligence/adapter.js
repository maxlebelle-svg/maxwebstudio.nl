"use strict";

const { SCHEMA_VERSION } = require("./schema");

function adaptIndustryProfileToFactoryInput(profile, existingInput = {}, options = {}) {
  const input = clone(existingInput);
  if (!isValidProfile(profile)) return { ...input, industryProfile: null, industryIntelligenceApplied: false };
  const confident = profile.confidence >= 0.65;
  const explicitServices = cleanList(input.services);
  const suggestedServices = confident ? profile.contentProfile.services : [];
  const services = unique([...explicitServices, ...suggestedServices]).slice(0, Number(options.maxServices) || 6);
  const palette = input.palette || input.colors || paletteObject(profile.visualProfile.colorPalette);
  const existingSections = cleanList(input.sections || options.packageSections);
  const preferredSections = constrainSections(profile.contentProfile.preferredSections, existingSections);
  const forbiddenSections = profile.contentProfile.forbiddenSections || [];
  return {
    ...input,
    industry: input.industry || profile.industry,
    subcategory: input.subcategory || profile.subcategory,
    services,
    tone: input.tone || input.toneOfVoice || profile.businessDNA.tone.join(", "),
    style: input.style || profile.visualProfile.visualStyle.join(", "),
    palette,
    colors: input.colors || palette,
    cta: input.cta || input.primaryCta || profile.contentProfile.ctaExamples[0] || "Neem contact op",
    primaryCta: input.primaryCta || input.cta || profile.contentProfile.ctaExamples[0] || "Neem contact op",
    seoContext: {
      ...(input.seoContext || {}),
      primaryTopics: unique([...(input.seoContext?.primaryTopics || []), ...profile.seoProfile.primaryTopics]),
      keywords: unique([...(input.seoContext?.keywords || []), ...profile.seoProfile.keywords]),
      localKeywordPatterns: unique([...(input.seoContext?.localKeywordPatterns || []), ...profile.seoProfile.localKeywordPatterns]),
      relatedTopics: unique([...(input.seoContext?.relatedTopics || []), ...profile.seoProfile.relatedTopics]),
    },
    sectionAdvice: {
      preferred: preferredSections,
      forbidden: forbiddenSections,
      packageBoundariesApplied: existingSections.length > 0,
    },
    imageSelectionContext: {
      allowed: profile.assetSelection.allowed === true,
      preferredGroup: profile.assetSelection.preferredGroup,
      preferredTags: [...profile.visualProfile.preferredPhotoTags],
      forbiddenTags: [...profile.visualProfile.forbiddenPhotoTags],
      minimumConfidence: 0.65,
    },
    industryProfile: profile,
    industryIntelligenceApplied: true,
  };
}

function isValidProfile(profile) {
  return Boolean(profile && profile.schemaVersion === SCHEMA_VERSION && profile.industry && Number.isFinite(Number(profile.confidence)));
}

function constrainSections(preferred, packageSections) {
  if (!packageSections.length) return [...(preferred || [])];
  const preferredTokens = new Set((preferred || []).map(sectionToken));
  const matches = packageSections.filter((section) => preferredTokens.has(sectionToken(section)));
  return matches.length ? matches : packageSections.filter((section) => !["projecten", "portfolio"].includes(sectionToken(section)));
}

function sectionToken(value) {
  const token = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return ({ "over-mij": "over-ons", behandelingen: "diensten", begeleiding: "diensten", ervaringen: "reviews", reserveren: "contact", expertise: "diensten", rechtsgebieden: "diensten", klachten: "diensten", sessies: "diensten", categorieen: "diensten", producten: "diensten" })[token] || token;
}

function paletteObject(colors = []) {
  const values = Array.isArray(colors) ? colors : [];
  return { ink: values[0] || "#132238", brand: values[0] || "#2563eb", accent: values[1] || "#14b8a6", soft: values[2] || "#f6f8fb", dark: values[0] || "#102033" };
}

function cleanList(value) { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean); }
function unique(values) { return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))]; }
function clone(value) { return JSON.parse(JSON.stringify(value || {})); }

module.exports = { adaptIndustryProfileToFactoryInput, isValidProfile, _private: { constrainSections, paletteObject, sectionToken } };
