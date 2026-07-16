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

module.exports = { GROUP_TAGS, selectPhotoAssetGroup };
