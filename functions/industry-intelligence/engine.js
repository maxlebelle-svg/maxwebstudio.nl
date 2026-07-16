"use strict";

const { PROFILES } = require("./profiles");
const { SCHEMA_VERSION, deepFreeze, statusForConfidence } = require("./schema");

const SOURCE_WEIGHTS = Object.freeze({
  explicit_industry: 12,
  business_description: 6,
  explicit_services: 6,
  website_scan: 3,
  google_business: 4,
  business_identity: 1,
});

function buildIndustryProfile(input = {}) {
  const sources = collectSources(input);
  const scored = PROFILES.filter((item) => item.id !== "local-service").map((definition) => scoreDefinition(definition, sources));
  scored.sort((left, right) => right.score - left.score || right.positiveScore - left.positiveScore || left.definition.id.localeCompare(right.definition.id));
  const top = scored[0];
  const runnerUp = scored[1];
  const explicitMatch = exactExplicitMatch(sources.find((source) => source.id === "explicit_industry")?.text);
  const selected = explicitMatch ? scored.find((item) => item.definition.id === explicitMatch.id) : top;
  const decision = classificationDecision(selected, runnerUp, explicitMatch);
  const definition = decision.neutral ? PROFILES.find((item) => item.id === "local-service") : selected.definition;
  const evidence = decision.neutral ? [] : selected.evidence;
  const usedSources = sources.map((source) => ({
    id: source.id,
    weight: source.weight,
    signalCount: evidence.filter((item) => item.source === source.id).length,
    used: evidence.some((item) => item.source === source.id),
  }));
  const fallback = decision.confidence < 0.65
    ? { used: true, reason: decision.neutral ? "insufficient_industry_evidence" : "confidence_below_photo_threshold", mode: "no-auto-image-selection" }
    : { used: false, reason: null, mode: null };

  return deepFreeze({
    schemaVersion: SCHEMA_VERSION,
    industry: definition.industry,
    subcategory: definition.subcategory,
    confidence: decision.confidence,
    classificationStatus: statusForConfidence(decision.confidence),
    sources: usedSources,
    evidence,
    scoring: {
      positiveScore: decision.neutral ? 0 : round(selected.positiveScore),
      negativeScore: decision.neutral ? 0 : round(selected.negativeScore),
      totalScore: decision.neutral ? 0 : round(selected.score),
      runnerUp: runnerUp ? runnerUp.definition.subcategory : null,
      runnerUpScore: runnerUp ? round(runnerUp.score) : 0,
      ambiguityMargin: decision.neutral ? 0 : round(Math.max(0, selected.score - (runnerUp?.score || 0))),
      explicitInputMatched: Boolean(explicitMatch),
    },
    businessDNA: clone(definition.businessDNA),
    visualProfile: { ...clone(definition.visualProfile), blockedColors: cleanList(input.blockedColors) },
    contentProfile: clone(definition.contentProfile),
    seoProfile: enrichSeo(definition.seoProfile, input),
    templateProfile: clone(definition.templateProfile),
    assetSelection: { allowed: decision.confidence >= 0.65, preferredGroup: decision.confidence >= 0.65 ? definition.assetGroup : null },
    fallback,
  });
}

function collectSources(input = {}) {
  const scan = input.websiteScan || input.websiteAnalysis?.currentWebsite || input.currentWebsite || {};
  const scanBriefing = input.websiteAnalysis?.aiBriefing || input.aiBriefing || {};
  const google = input.googleBusiness || input.google_business || {};
  const sources = [
    source("explicit_industry", first(input.explicitIndustry, input.intakeIndustry, input.briefingIndustry, input.industry)),
    source("business_description", join(input.businessDescription, input.description, input.about, input.briefingDescription)),
    source("explicit_services", join(input.services, input.explicitServices)),
    source("website_scan", join(scan.title, scan.metaDescription, scan.h1, scan.headings, scan.paragraphs, scan.services, scanBriefing.industry, scanBriefing.description, scanBriefing.services, scanBriefing.subservices)),
    source("google_business", join(google.category, google.categories, google.primaryCategory, google.description, safeReviewSignals(google.reviews))),
    source("business_identity", join(input.businessName, input.websiteUrl, input.url)),
  ];
  return sources.filter((item) => item.text);
}

function source(id, value) {
  return { id, weight: SOURCE_WEIGHTS[id], text: normalize(join(value)) };
}

function scoreDefinition(definition, sources) {
  let positiveScore = 0;
  let negativeScore = 0;
  const evidence = [];
  sources.forEach((sourceItem) => {
    unique(definition.positiveSignals.concat(definition.aliases)).forEach((signal) => {
      if (!containsSignal(sourceItem.text, signal)) return;
      const exactBonus = sourceItem.id === "explicit_industry" && exactSignal(sourceItem.text, signal) ? sourceItem.weight : 0;
      const score = sourceItem.weight + exactBonus;
      positiveScore += score;
      evidence.push({ source: sourceItem.id, signal, polarity: "positive", score });
    });
    unique(definition.negativeSignals).forEach((signal) => {
      if (!containsSignal(sourceItem.text, signal)) return;
      const score = sourceItem.weight * 1.25;
      negativeScore += score;
      evidence.push({ source: sourceItem.id, signal, polarity: "negative", score: -round(score) });
    });
  });
  return { definition, positiveScore, negativeScore, score: positiveScore - negativeScore, evidence: evidence.slice(0, 40) };
}

function classificationDecision(selected, runnerUp, explicitMatch) {
  if (!selected || selected.positiveScore <= 0 || selected.score <= 0) return { confidence: 0.2, neutral: true };
  if (explicitMatch) {
    const supportingSources = new Set(selected.evidence.filter((item) => item.polarity === "positive" && item.source !== "explicit_industry").map((item) => item.source)).size;
    return { confidence: round(Math.min(0.97, 0.9 + supportingSources * 0.02)), neutral: false };
  }
  const supportingSources = new Set(selected.evidence.filter((item) => item.polarity === "positive").map((item) => item.source)).size;
  const margin = Math.max(0, selected.score - Math.max(0, runnerUp?.score || 0));
  const ambiguityPenalty = margin < 2 ? 0.14 : margin < 5 ? 0.07 : 0;
  const negativePenalty = Math.min(0.18, selected.negativeScore / 80);
  const confidence = 0.32
    + Math.min(0.34, selected.positiveScore / 54)
    + Math.min(0.12, supportingSources * 0.04)
    + Math.min(0.14, margin / 40)
    - ambiguityPenalty
    - negativePenalty;
  const bounded = round(Math.max(0.2, Math.min(0.89, confidence)));
  return { confidence: bounded, neutral: bounded < 0.45, neutralReason: bounded < 0.45 ? "low_confidence" : null };
}

function exactExplicitMatch(text = "") {
  if (!text) return null;
  const matches = PROFILES.filter((item) => item.id !== "local-service").flatMap((item) => item.aliases
    .filter((alias) => exactSignal(text, alias) || containsSignal(text, alias))
    .map((alias) => ({ item, score: (exactSignal(text, alias) ? 1000 : 0) + normalize(alias).length })));
  matches.sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id));
  return matches[0]?.item || null;
}

function enrichSeo(profile = {}, input = {}) {
  const explicitKeywords = cleanList(input.seoKeywords || input.keywords);
  const serviceArea = String(input.serviceArea || input.region || "").trim();
  return {
    ...clone(profile),
    keywords: unique([...explicitKeywords, ...(profile.keywords || [])]).slice(0, 12),
    localKeywordPatterns: serviceArea
      ? unique([...(profile.localKeywordPatterns || []), `{dienst} in ${serviceArea}`, `{branche} ${serviceArea}`])
      : clone(profile.localKeywordPatterns || []),
  };
}

function containsSignal(text, signal) {
  const needle = normalize(signal);
  if (!needle) return false;
  return ` ${text} `.includes(` ${needle} `) || text.includes(needle);
}

function exactSignal(text, signal) {
  return normalize(text) === normalize(signal);
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function safeReviewSignals(reviews) {
  return Array.isArray(reviews) ? reviews.slice(0, 5).map((review) => review?.text || review?.reviewText || "") : [];
}

function first(...values) { return values.find((value) => String(value || "").trim()) || ""; }
function join(...values) { return values.flat(Infinity).filter(Boolean).join(" "); }
function cleanList(value) { return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean); }
function unique(values) { return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))]; }
function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function round(value) { return Math.round((Number(value) || 0) * 100) / 100; }

module.exports = { SOURCE_WEIGHTS, buildIndustryProfile, _private: { classificationDecision, collectSources, containsSignal, exactExplicitMatch, normalize, scoreDefinition } };
