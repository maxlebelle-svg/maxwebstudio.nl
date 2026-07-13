import { normalizeAIRequest, validateAIRequest } from "./ai-contracts.mjs";

function compact(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "" && item != null && (!Array.isArray(item) || item.length)).map(([key, item]) => [key, compact(item)]));
}

export function buildSocialStudioAIRequest(input = {}) {
  const validation = validateAIRequest(input);
  if (!validation.valid) return validation;
  const request = normalizeAIRequest(validation.request);
  request.instructions = compact({
    task: "Maak veilige, merkconforme content zonder onbewezen claims.",
    content: {
      topic: request.topic, objective: request.objective, audience: request.audience,
      contentPillar: request.contentPillar, platform: request.platform, contentType: request.contentType,
      desiredLength: request.desiredLength, desiredCta: request.desiredCta, campaign: request.campaign,
      language: request.language, emojiPreference: request.emojiPreference,
    },
    verifiedFacts: request.facts,
    approvedAssets: request.assets,
    brandVoice: request.brandVoice,
    relationshipContext: request.relationshipContext,
    safeguards: [
      "Presenteer aannames niet als feiten.",
      "Markeer claims die niet door verifiedFacts worden ondersteund.",
      "Gebruik uitsluitend context uit dezelfde scopeId.",
      "Neem geen gevoelige contact- of klantgegevens op tenzij expliciet gevraagd.",
    ],
  });
  return { valid: true, request, errors: [] };
}

export function summarizeAIRequestContext(request = {}) {
  const brand = request.brandVoice?.brandName || request.relationshipContext?.brand?.brandName || "Generiek merk";
  const tone = (request.toneOfVoice?.length ? request.toneOfVoice : request.brandVoice?.toneOfVoice || []).join(", ") || "neutraal";
  const sources = [request.relationshipContext?.source, request.assets?.length ? `${request.assets.length} goedgekeurde assets` : ""].filter(Boolean);
  return `${brand}; tone: ${tone}; doel: ${request.objective}; context: ${sources.join(", ") || "alleen ingevoerde briefing"}.`;
}
