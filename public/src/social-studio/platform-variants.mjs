import { normalizeContentItem } from "./core.mjs";

export const PLATFORM_VARIANT_PROFILES = Object.freeze([
  Object.freeze({ key: "instagram", label: "Instagram", platform: "instagram", contentType: "instagram-post", visualFormat: "portrait", tone: "Warm en visueel", maxHashtags: 8 }),
  Object.freeze({ key: "facebook", label: "Facebook", platform: "facebook", contentType: "facebook-post", visualFormat: "landscape", tone: "Herkenbaar en toegankelijk", maxHashtags: 3 }),
  Object.freeze({ key: "linkedin", label: "LinkedIn", platform: "linkedin", contentType: "linkedin-post", visualFormat: "landscape", tone: "Deskundig en menselijk", maxHashtags: 4 }),
  Object.freeze({ key: "google", label: "Google Bedrijfsprofiel", platform: "google", contentType: "google-business-post", visualFormat: "landscape", tone: "Concreet en lokaal", maxHashtags: 0 }),
  Object.freeze({ key: "story", label: "Instagram Story", platform: "instagram", contentType: "instagram-story", visualFormat: "story", tone: "Kort en direct", maxHashtags: 2 }),
  Object.freeze({ key: "reel", label: "Instagram Reel", platform: "instagram", contentType: "instagram-reel", visualFormat: "story", tone: "Energiek en helder", maxHashtags: 5 }),
  Object.freeze({ key: "carousel", label: "Carrousel", platform: "instagram", contentType: "carousel", visualFormat: "square", tone: "Educatief en scanbaar", maxHashtags: 6 }),
]);

function clean(value) { return String(value || "").trim(); }
function firstSentence(value) { return clean(value).split(/(?<=[.!?])\s+/)[0] || clean(value); }
function hashtagList(value) { return clean(value).split(/\s+/).filter((item) => item.startsWith("#")); }

export function createMasterConcept(input = {}) {
  const normalized = normalizeContentItem({ ...input, contentRole: "master", platform: input.platform || "instagram" });
  return {
    ...normalized,
    masterId: normalized.id,
    variantKey: null,
    title: clean(input.title) || "Master concept",
    extensions: { ...(normalized.extensions || {}), masterSource: true },
  };
}

function platformCaption(master, profile) {
  const base = clean(master.caption) || clean(master.title);
  const hook = clean(master.title) || firstSentence(base);
  if (profile.key === "linkedin") return `${hook}\n\n${base}\n\nWat betekent dit in jouw praktijk?`;
  if (profile.key === "facebook") return `${hook}\n\n${base}\n\nHerkenbaar? Laat het ons weten.`;
  if (profile.key === "google") return `${firstSentence(base)}\n\n${clean(master.cta) || "Bekijk de mogelijkheden"}.`;
  if (profile.key === "story") return `${hook}\n\n1. Het herkenbare probleem\n2. Eén bruikbaar inzicht\n3. ${clean(master.cta) || "Bekijk meer"}`;
  if (profile.key === "reel") return `${hook}\n\n0-2 sec: hook\n2-8 sec: probleem\n8-15 sec: inzicht\n15-20 sec: ${clean(master.cta) || "Bekijk meer"}`;
  if (profile.key === "carousel") return `${hook}\n\nSlide 1: hook\nSlide 2-5: één inzicht per slide\nLaatste slide: ${clean(master.cta) || "Bewaar dit overzicht"}`;
  return `${hook}\n\n${base}`;
}

export function generatePlatformVariants(masterInput = {}, options = {}) {
  const master = createMasterConcept(masterInput);
  const now = options.now || new Date().toISOString();
  return PLATFORM_VARIANT_PROFILES.map((profile, index) => {
    const hashtags = hashtagList(master.hashtags).slice(0, profile.maxHashtags);
    const cta = profile.key === "story" ? "Tik voor meer" : profile.key === "google" ? (master.cta || "Bekijk de website") : master.cta;
    return normalizeContentItem({
      ...master,
      id: `variant-${master.id}-${profile.key}-${index + 1}`,
      contentRole: "platform-variant",
      masterId: master.id,
      variantKey: profile.key,
      sourceRevision: master.revision,
      platform: profile.platform,
      contentType: profile.contentType,
      title: `${master.title} · ${profile.label}`,
      caption: platformCaption(master, profile),
      cta,
      hashtags: hashtags.join(" "),
      visualFormat: profile.visualFormat,
      tone: profile.tone,
      visualDirection: `${master.visualDirection || master.imagePrompt || "Rustige merkvisual"} · geoptimaliseerd voor ${profile.label}.`,
      altText: master.altText || `Merkvisual bij ${master.title} voor ${profile.label}.`,
      extensions: { ...(master.extensions || {}), platformProfile: profile.key },
      createdAt: now,
      updatedAt: now,
    });
  });
}

export function variantsForMaster(variants = [], masterId = "") {
  return variants.filter((variant) => variant.masterId === masterId && variant.contentRole === "platform-variant");
}
