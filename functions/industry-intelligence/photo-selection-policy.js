"use strict";

const GROUP_TAGS = Object.freeze({
  holistisch: ["holistic", "wellness", "mindfulness", "meditation", "coaching", "nature", "calm", "treatment-room", "balance", "personal-growth"],
  schoonheidssalon: ["beauty", "salon", "facial", "skincare", "treatment-room", "wellness", "massage"],
  fysiotherapie: ["physiotherapy", "movement", "rehabilitation", "consultation", "healthcare"],
  tandarts: ["dentist", "dental-practice", "oral-care", "consultation", "healthcare"],
  advocaat: ["law", "legal", "professional", "consultation", "office"],
  restaurant: ["restaurant", "food", "dish", "interior", "hospitality", "table"],
  timmerwerk: ["construction", "carpenter", "tools", "timber", "windows", "renovation", "woodwork"],
  bouwbedrijf: ["construction", "tools", "renovation", "industrial", "bathroom"],
  installatiebedrijf: ["installation", "electrician", "solar", "heat-pump", "technical", "tools", "industrial"],
  "financieel-adviseur": ["business", "professional", "consultation", "office", "team"],
  "neutral-professional": ["neutral", "professional", "human", "local-service"],
});

const IMAGE_SELECTION_SLOTS = Object.freeze([
  "hero",
  "introduction",
  "service_1",
  "service_2",
  "service_3",
  "service_4",
  "service_5",
  "about",
  "contact",
  "testimonial",
]);

const SLOT_TAGS = Object.freeze({
  hero: ["holistic", "nature", "calm", "coaching", "personal-growth", "16:9"],
  introduction: ["calm", "personal-growth", "connection", "nature"],
  service_1: ["conversation", "coaching", "consultation", "guidance"],
  service_2: ["treatment-room", "wellness", "session", "calm"],
  service_3: ["meditation", "mindfulness", "relaxation", "nature"],
  service_4: ["energy-work", "holistic-treatment", "hands", "peaceful"],
  service_5: ["personal-guidance", "walking", "coaching", "connection"],
  about: ["personal-guidance", "conversation", "coaching", "authentic"],
  contact: ["welcoming", "calm", "interior", "connection"],
  testimonial: ["personal-growth", "journaling", "reflection", "calm"],
});

const DUPLICATE_PENALTY = 10_000;

function selectPhotoAssetGroup(profile, catalog = [], options = {}) {
  const minimumConfidence = Number(options.minimumConfidence ?? 0.65);
  const minimumScore = Number(options.minimumScore ?? 1);
  if (!profile || profile.confidence < minimumConfidence || profile.assetSelection?.allowed !== true) {
    return decision(null, "no-auto-image-selection", "confidence_below_threshold", [], 0, profile);
  }
  const preferred = new Set(profile.visualProfile?.preferredPhotoTags || []);
  const forbidden = new Set(profile.visualProfile?.forbiddenPhotoTags || []);
  const scored = catalog.map((group) => {
    const tags = unique([...(GROUP_TAGS[group.slug] || []), ...(group.tags || []), ...(group.keywords || []).map(normalizeTag)]);
    const excludedTags = tags.filter((tag) => forbidden.has(tag));
    const matchedTags = tags.filter((tag) => preferred.has(tag));
    const preferredGroupBonus = profile.assetSelection?.preferredGroup === group.slug ? 3 : 0;
    return { group, tags, excludedTags, matchedTags, score: excludedTags.length ? -Infinity : matchedTags.length + preferredGroupBonus };
  }).sort((left, right) => right.score - left.score || left.group.slug.localeCompare(right.group.slug));
  const selected = scored.find((item) => item.score >= minimumScore);
  if (!selected) return decision(null, "no-auto-image-selection", "no_safe_tag_match", scored.flatMap((item) => item.excludedTags), 0, profile);
  return decision(selected.group, "profile-tag-match", "positive_tag_match", scored.flatMap((item) => item.excludedTags), selected.score, profile, selected.matchedTags);
}

function createImageSelectionSession(profile, candidates = [], options = {}) {
  const usedAssetIds = new Set();
  const usedChecksums = new Set();
  const selections = [];
  const normalizedCandidates = candidates.map(normalizeCandidate).filter((candidate) => candidate.assetId && candidate.src);
  const preferredGroup = normalizeTag(profile?.assetSelection?.preferredGroup);
  const preferredTags = new Set(unique(profile?.visualProfile?.preferredPhotoTags || []));
  const forbiddenTags = new Set(unique(profile?.visualProfile?.forbiddenPhotoTags || []));
  const minimumScore = Number(options.minimumScore ?? 0);

  function select(slot) {
    const normalizedSlot = normalizeSlot(slot);
    const slotTags = new Set(unique(SLOT_TAGS[normalizedSlot] || []));
    const scored = normalizedCandidates
      .map((candidate) => scoreCandidate({ candidate, profile, preferredGroup, preferredTags, forbiddenTags, slotTags, usedAssetIds, usedChecksums }))
      .filter((item) => item.allowed && item.baseScore >= minimumScore)
      .sort(compareCandidates);
    const unused = scored.filter((item) => !item.reusedAsset);
    const sameNiche = unused.filter((item) => item.nicheTier === 0);
    const neutralWellness = unused.filter((item) => item.nicheTier === 1);
    const selected = sameNiche[0] || neutralWellness[0] || scored[0] || null;
    if (!selected) return null;
    const reusedAsset = selected.reusedAsset;
    const fallbackReason = reusedAsset
      ? "insufficient_unique_assets"
      : selected.nicheTier === 1
        ? "neutral_wellness_fallback"
        : null;
    const duplicateAvoided = !reusedAsset && selections.length > 0;
    usedAssetIds.add(selected.candidate.assetId);
    usedChecksums.add(selected.candidate.checksum);
    const result = Object.freeze({
      ...selected.candidate,
      selectedAssetId: selected.candidate.assetId,
      score: roundScore(selected.score),
      slot: normalizedSlot,
      duplicateAvoided,
      fallbackReason,
      reusedAsset,
    });
    selections.push(result);
    return result;
  }

  return Object.freeze({
    select,
    selections,
    usedAssetIds,
    usedChecksums,
  });
}

function selectPhotoAssetsForSlots(profile, candidates = [], slots = IMAGE_SELECTION_SLOTS, options = {}) {
  const session = createImageSelectionSession(profile, candidates, options);
  const selected = {};
  for (const slot of slots) selected[normalizeSlot(slot)] = session.select(slot);
  return Object.freeze({
    slots: Object.freeze(selected),
    selections: Object.freeze(session.selections.slice()),
    uniqueAssetCount: new Set(session.selections.map((item) => item.selectedAssetId)).size,
    uniqueChecksumCount: new Set(session.selections.map((item) => item.checksum)).size,
    fallbackCount: session.selections.filter((item) => item.fallbackReason).length,
  });
}

function scoreCandidate({ candidate, profile, preferredGroup, preferredTags, forbiddenTags, slotTags, usedAssetIds, usedChecksums }) {
  const tags = new Set(candidate.tags);
  const excludedTags = [...tags].filter((tag) => forbiddenTags.has(tag));
  const reusedAsset = usedAssetIds.has(candidate.assetId) || usedChecksums.has(candidate.checksum);
  const profileMatches = [...tags].filter((tag) => preferredTags.has(tag)).length;
  const slotMatches = [...tags].filter((tag) => slotTags.has(tag)).length;
  const aspectMatch = slotTags.has(candidate.aspectRatio) || (slotTags.has("16:9") && candidate.aspectRatio === "16:9");
  const preferredNiche = Boolean(preferredGroup && candidate.groupSlug === preferredGroup);
  const neutralWellness = !preferredNiche && [...tags].some((tag) => ["wellness", "coaching", "calm", "consultation", "mindfulness"].includes(tag));
  const nicheTier = preferredNiche ? 0 : neutralWellness ? 1 : 2;
  const baseScore = profileMatches * 6
    + slotMatches * 10
    + (aspectMatch ? 5 : 0)
    + (candidate.imageType === "photo" ? 3 : 0)
    + Number(candidate.visualSuitability || 0) * 3
    + Number(profile?.confidence || 0) * 2
    + (preferredNiche ? 12 : neutralWellness ? 2 : -12);
  return {
    candidate,
    allowed: excludedTags.length === 0 && nicheTier < 2,
    baseScore,
    score: baseScore - (reusedAsset ? DUPLICATE_PENALTY : 0),
    nicheTier,
    reusedAsset,
  };
}

function normalizeCandidate(candidate = {}) {
  const src = String(candidate.src || "").trim();
  const assetId = String(candidate.assetId || candidate.id || candidate.slug || src).trim();
  const checksum = String(candidate.checksum || assetId || src).trim();
  return Object.freeze({
    ...candidate,
    assetId,
    checksum,
    src,
    groupSlug: normalizeTag(candidate.groupSlug),
    tags: Object.freeze(unique(candidate.tags || [])),
    aspectRatio: normalizeTag(candidate.aspectRatio || "16:9"),
    imageType: normalizeTag(candidate.imageType || "photo"),
    visualSuitability: Number(candidate.visualSuitability ?? 1),
  });
}

function compareCandidates(left, right) {
  return left.nicheTier - right.nicheTier
    || right.score - left.score
    || left.candidate.assetId.localeCompare(right.candidate.assetId)
    || left.candidate.src.localeCompare(right.candidate.src);
}

function normalizeSlot(value = "") {
  const slot = normalizeTag(value).replace(/-/g, "_");
  return IMAGE_SELECTION_SLOTS.includes(slot) ? slot : "introduction";
}

function roundScore(value) { return Math.round(Number(value || 0) * 100) / 100; }

function decision(group, mode, reason, excludedTags, score, profile, matchedTags = []) {
  return Object.freeze({
    status: group ? "selected" : "unresolved",
    group: group || null,
    groupSlug: group?.slug || null,
    mode,
    reason,
    score,
    confidence: Number(profile?.confidence || 0),
    matchedTags: unique(matchedTags),
    excludedTags: unique(excludedTags),
  });
}

function normalizeTag(value) { return String(value || "").toLowerCase().trim().replace(/\s+/g, "-"); }
function unique(values) { return [...new Set(values.map(normalizeTag).filter(Boolean))]; }

module.exports = {
  DUPLICATE_PENALTY,
  GROUP_TAGS,
  IMAGE_SELECTION_SLOTS,
  SLOT_TAGS,
  createImageSelectionSession,
  selectPhotoAssetGroup,
  selectPhotoAssetsForSlots,
};
