export const SOCIAL_STUDIO_AI_CONTRACT_VERSION = 1;

export const CONTENT_OBJECTIVES = Object.freeze([
  "zichtbaarheid", "autoriteit", "leads", "verkoop", "vertrouwen", "educatie", "engagement",
  "klantcase", "product- of dienstpromotie", "recruitment", "lokale vindbaarheid",
]);

export const AI_OUTPUT_FIELDS = Object.freeze([
  "mainIdea", "hookVariants", "caption", "cta", "hashtags", "imagePrompt", "visualDirection",
  "reelScript", "storyStructure", "carouselStructure", "altText", "platformNotes", "claimWarnings", "brandContextSummary",
]);

function clean(value) { return String(value || "").trim(); }
function list(value) { return Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value).split(/[\n,]+/).map(clean).filter(Boolean); }

export function normalizeAIRequest(input = {}) {
  const scopeId = clean(input.scopeId || "internal:max-webstudio");
  return {
    contractVersion: SOCIAL_STUDIO_AI_CONTRACT_VERSION,
    requestId: clean(input.requestId) || `ai-request-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    scopeId,
    relationship: input.relationship && typeof input.relationship === "object" ? { ...input.relationship } : null,
    topic: clean(input.topic),
    objective: CONTENT_OBJECTIVES.includes(clean(input.objective).toLowerCase()) ? clean(input.objective).toLowerCase() : "zichtbaarheid",
    audience: clean(input.audience),
    contentPillar: clean(input.contentPillar),
    platform: clean(input.platform || "instagram").toLowerCase(),
    contentType: clean(input.contentType || "instagram-post"),
    toneOfVoice: list(input.toneOfVoice),
    desiredCta: clean(input.desiredCta),
    facts: list(input.facts),
    assets: (Array.isArray(input.assets) ? input.assets : []).map((asset) => ({ id: clean(asset.id), name: clean(asset.name), category: clean(asset.category) })),
    desiredLength: clean(input.desiredLength || "medium"),
    emojiPreference: clean(input.emojiPreference || "spaarzaam"),
    campaign: clean(input.campaign),
    language: clean(input.language || "Nederlands"),
    brandVoice: input.brandVoice && typeof input.brandVoice === "object" ? { ...input.brandVoice } : {},
    relationshipContext: input.relationshipContext && typeof input.relationshipContext === "object" ? { ...input.relationshipContext } : {},
    createdAt: clean(input.createdAt) || new Date().toISOString(),
  };
}

export function normalizeAIOutput(input = {}, request = {}) {
  return {
    contractVersion: SOCIAL_STUDIO_AI_CONTRACT_VERSION,
    requestId: clean(input.requestId || request.requestId),
    outputId: clean(input.outputId) || `ai-output-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    generator: clean(input.generator || "unknown"),
    mode: clean(input.mode || "preview"),
    mainIdea: clean(input.mainIdea),
    hookVariants: list(input.hookVariants),
    caption: clean(input.caption),
    cta: clean(input.cta),
    hashtags: list(input.hashtags),
    imagePrompt: clean(input.imagePrompt),
    visualDirection: clean(input.visualDirection),
    reelScript: list(input.reelScript),
    storyStructure: list(input.storyStructure),
    carouselStructure: list(input.carouselStructure),
    altText: clean(input.altText),
    platformNotes: list(input.platformNotes),
    claimWarnings: list(input.claimWarnings),
    brandContextSummary: clean(input.brandContextSummary),
    generatedAt: clean(input.generatedAt) || new Date().toISOString(),
  };
}

export function validateAIRequest(input = {}) {
  const request = normalizeAIRequest(input);
  const errors = [];
  if (!request.topic) errors.push({ field: "topic", code: "REQUIRED", message: "Geef een onderwerp of concrete input." });
  if (!request.audience) errors.push({ field: "audience", code: "REQUIRED", message: "Beschrijf voor wie de content bedoeld is." });
  if (!request.scopeId) errors.push({ field: "scopeId", code: "REQUIRED", message: "Kies een veilige merkcontext." });
  return { valid: errors.length === 0, request, errors };
}

export function validateAIOutput(input = {}, request = {}) {
  const output = normalizeAIOutput(input, request);
  const errors = [];
  const warnings = [];
  for (const field of ["mainIdea", "caption", "cta", "imagePrompt", "visualDirection", "altText", "brandContextSummary"]) {
    if (!output[field]) errors.push({ field, code: "MISSING_OUTPUT", message: `${field} ontbreekt in AI-output.` });
  }
  if (output.hookVariants.length < 2) errors.push({ field: "hookVariants", code: "TOO_FEW_VARIANTS", message: "Minimaal twee hookvarianten zijn vereist." });
  if (output.claimWarnings.length) warnings.push(...output.claimWarnings.map((message) => ({ field: "claimWarnings", code: "CLAIM_REVIEW", message })));
  return { valid: errors.length === 0, output, errors, warnings };
}

export class SocialStudioAIAdapter {
  constructor({ id, mode = "preview" } = {}) {
    this.id = id || "abstract";
    this.mode = mode;
  }
  isAvailable() { return false; }
  async generate() { throw new Error("Deze AI-adapter is niet actief."); }
}
