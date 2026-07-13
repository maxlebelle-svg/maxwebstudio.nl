const PLATFORM_LIMITS = Object.freeze({ facebook: 63206, instagram: 2200, linkedin: 3000, google: 1500, ad: 500, blog: 12000, email: 10000 });
const HASHTAG_LIMITS = Object.freeze({ facebook: 5, instagram: 12, linkedin: 5, google: 3, ad: 2, blog: 3, email: 0 });

function clean(value) { return String(value || "").trim(); }
function issue(code, field, message, severity = "advice") { return { code, field, message, severity }; }

export function analyzeContentQuality(content = {}, context = {}) {
  if (context.scopeId && content.scopeId && context.scopeId !== content.scopeId) {
    return [issue("SCOPE_MISMATCH", "scopeId", "Deze content hoort bij een andere werkruimte en kan hier niet veilig worden gebruikt.", "safety")];
  }
  const title = clean(content.title);
  const caption = clean(content.caption);
  const combined = `${title} ${caption}`;
  const hashtags = clean(content.hashtags).split(/\s+/).filter((item) => item.startsWith("#"));
  const facts = content.extensions?.aiDraft?.output?.claimWarnings?.length === 0;
  const issues = [];

  if (/\b(beste|nummer\s*1|uniekste|meest succesvolle|ongeëvenaard)\b/i.test(combined) && !facts) {
    issues.push(issue("UNPROVEN_SUPERLATIVE", "caption", "Deze claim lijkt niet onderbouwd."));
  }
  if (/\b(gegarandeerd|garantie op|altijd|nooit|100\s*% zeker)\b/i.test(combined)) {
    issues.push(issue("ABSOLUTE_GUARANTEE", "caption", "Vermijd een absolute garantie of onderbouw deze expliciet."));
  }
  if (/\b(verdubbel|x\s*\d+|\d+\s*% meer|direct resultaat|binnen \d+ dagen)\b/i.test(combined) && !facts) {
    issues.push(issue("MISLEADING_RESULT", "caption", "Controleer of dit resultaat aantoonbaar en representatief is."));
  }
  if (!clean(content.cta)) issues.push(issue("MISSING_CTA", "cta", "Deze caption bevat nog geen concrete vervolgstap."));
  const maxLength = PLATFORM_LIMITS[content.platform] || 2200;
  if (caption.length > maxLength) issues.push(issue("CAPTION_TOO_LONG", "caption", `Deze tekst is te lang voor ${content.platform || "dit platform"}.`));
  const maxHashtags = HASHTAG_LIMITS[content.platform] ?? 12;
  if (hashtags.length > maxHashtags) issues.push(issue("TOO_MANY_HASHTAGS", "hashtags", `Beperk deze versie tot maximaal ${maxHashtags} relevante hashtags.`));
  if (!clean(content.altText)) issues.push(issue("MISSING_ALT_TEXT", "altText", "Voeg een beschrijvende alt-tekst toe voor toegankelijkheid."));
  if (!clean(content.visualDirection) && !clean(content.imagePrompt)) issues.push(issue("MISSING_VISUAL_DIRECTION", "visualDirection", "Beschrijf kort de gewenste visuele richting."));
  if (content.client && new RegExp(clean(content.client).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(caption)) {
    issues.push(issue("CUSTOMER_NAME_REVIEW", "caption", "Controleer of deze klantnaam openbaar gebruikt mag worden."));
  }
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b(?:\+31|0)\s*\d[\d\s-]{7,}\b/i.test(caption)) {
    issues.push(issue("SENSITIVE_CONTACT_DATA", "caption", "Controleer of deze contactgegevens openbaar gedeeld mogen worden."));
  }
  const prohibited = [...(context.brandVoice?.prohibitedWords || []), ...(context.brandVoice?.riskyClaims || [])].filter(Boolean);
  const contradiction = prohibited.find((term) => combined.toLowerCase().includes(clean(term).toLowerCase()));
  if (contradiction) issues.push(issue("BRAND_VOICE_CONFLICT", "caption", `Deze formulering botst mogelijk met de Brand Voice: “${contradiction}”.`));
  const informalLinkedIn = content.platform === "linkedin" && ((combined.match(/[😀-🙏]/gu) || []).length > 3 || /\b(supergaaf|mega|check dit|lekker bezig)\b/i.test(combined));
  if (informalLinkedIn) issues.push(issue("LINKEDIN_TONE", "tone", "LinkedIn-versie is mogelijk te informeel voor deze Brand Voice."));
  if (title.length < 18 || /^(nieuwe update|welkom|lees meer|wist je dat)[.!?]?$/i.test(title)) {
    issues.push(issue("WEAK_HOOK", "title", "Maak de hook specifieker, herkenbaarder of spannender."));
  }
  return issues;
}

export function contentQualityScore(issues = []) {
  if (issues.some((item) => item.severity === "safety")) return 0;
  return Math.max(0, 100 - issues.length * 9);
}
