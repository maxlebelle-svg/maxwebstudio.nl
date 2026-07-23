function scoreChecks(checks) {
  const earned = checks.filter((check) => check.pass).reduce((sum, check) => sum + check.weight, 0);
  const possible = checks.reduce((sum, check) => sum + check.weight, 0);
  return Math.round((earned / possible) * 100);
}

function includesPlaceholder(value) {
  return /\[[A-Z]+(?: \d+)?\]/.test(JSON.stringify(value));
}

function words(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function metric(id, label, checks) {
  return { id, label, score: scoreChecks(checks), checks };
}

export function assessBlueprintQuality(blueprint) {
  if (!blueprint?.dimensions || !blueprint?.design_system) throw new TypeError("Een geldig compositieblueprint is verplicht.");
  const metrics = [
    metric("completeness", "Volledigheid", [
      { id: "dimensions", pass: Boolean(blueprint.dimensions.vertical && blueprint.dimensions.visual_style && blueprint.dimensions.brand_personality && blueprint.dimensions.goal), weight: 25 },
      { id: "design-system", pass: Boolean(blueprint.design_system.colors && blueprint.design_system.fonts && blueprint.design_system.layout), weight: 25 },
      { id: "blocks", pass: Array.isArray(blueprint.blocks) && blueprint.blocks.length > 0, weight: 25 },
      { id: "photography", pass: Boolean(blueprint.photography_recipe?.visual_style), weight: 25 }
    ]),
    metric("specificity", "Specificiteit", [
      { id: "vertical", pass: Boolean(blueprint.dimensions.vertical.slug), weight: 30 },
      { id: "specialization", pass: Boolean(blueprint.dimensions.specialization), weight: 25 },
      { id: "region", pass: Boolean(blueprint.dimensions.region), weight: 20 },
      { id: "goal", pass: Boolean(blueprint.dimensions.goal.id), weight: 15 },
      { id: "locale", pass: Boolean(blueprint.dimensions.locale), weight: 10 }
    ]),
    metric("channel_fit", "Kanaalfit", [
      { id: "channel-list", pass: blueprint.dimensions.channels.length > 0, weight: 30 },
      { id: "matching-blocks", pass: blueprint.blocks.every((block) => block.channels.some((channel) => blueprint.dimensions.channels.includes(channel))), weight: 40 },
      { id: "neutral-contract", pass: blueprint.consumers?.neutral_contract === true, weight: 30 }
    ]),
    metric("conversion", "Conversie-architectuur", [
      { id: "hero-intent", pass: Boolean(blueprint.block_strategy?.hero_intent), weight: 30 },
      { id: "cta-intent", pass: Boolean(blueprint.block_strategy?.primary_cta_intent), weight: 30 },
      { id: "proof-weight", pass: Boolean(blueprint.block_strategy?.proof_weight), weight: 20 },
      { id: "goal-alignment", pass: Boolean(blueprint.content_strategy?.goal?.id), weight: 20 }
    ]),
    metric("safety", "Veiligheidsdekking", [
      { id: "human-image-review", pass: blueprint.photography_recipe?.human_review_required === true, weight: 30 },
      { id: "rights-review", pass: blueprint.photography_recipe?.rights_and_release_review_required === true, weight: 30 },
      { id: "negative-prompt", pass: words(blueprint.photography_recipe?.universal_negative_prompt) >= 10, weight: 20 },
      { id: "reduced-motion", pass: blueprint.design_system.motion?.reduced_motion_required === true, weight: 20 }
    ])
  ];
  const overall = Math.round(metrics.reduce((sum, item) => sum + item.score, 0) / metrics.length);
  return {
    contract_version: "quality-score/v1",
    target: "composition-blueprint",
    overall,
    metrics,
    ai_confidence: { score: null, status: "not_measured", reason: "AI-confidence vereist een afzonderlijke modelevaluatie of menselijke review en wordt niet afgeleid uit structurele checks." },
    publication_ready: false,
    status: overall >= 90 ? "architecture_ready" : overall >= 75 ? "review_recommended" : "incomplete"
  };
}

export function assessWebsiteContentQuality({ blueprint, content }) {
  if (!blueprint || !content) throw new TypeError("Blueprint en websitecontent zijn verplicht.");
  const hero = content.hero || {};
  const seo = content.seo || {};
  const reviews = content.reviews || {};
  const metrics = [
    metric("hero", "Hero", [
      { id: "title", pass: words(hero.title) >= 3 && words(hero.title) <= 14, weight: 30 },
      { id: "subtitle", pass: words(hero.subtitle) >= 8 && words(hero.subtitle) <= 40, weight: 25 },
      { id: "primary-cta", pass: Boolean(hero.primaryCta), weight: 25 },
      { id: "intent", pass: Boolean(blueprint.block_strategy?.hero_intent), weight: 20 }
    ]),
    metric("seo", "SEO", [
      { id: "title-length", pass: String(seo.title || "").length >= 25 && String(seo.title || "").length <= 70, weight: 30 },
      { id: "description-length", pass: String(seo.description || "").length >= 70 && String(seo.description || "").length <= 180, weight: 30 },
      { id: "keywords", pass: Array.isArray(seo.keywords) && seo.keywords.length >= 5, weight: 20 },
      { id: "local-context", pass: !blueprint.dimensions.region || JSON.stringify(seo).includes(blueprint.dimensions.region), weight: 20 }
    ]),
    metric("conversion", "Conversie", [
      { id: "hero-cta", pass: Boolean(hero.primaryCta), weight: 30 },
      { id: "contact-cta", pass: Boolean(content.contactCta?.primary), weight: 30 },
      { id: "services", pass: Array.isArray(content.services) && content.services.length >= 3, weight: 20 },
      { id: "proof", pass: Array.isArray(content.usps) && content.usps.length >= 3, weight: 20 }
    ]),
    metric("readability", "Leesbaarheid", [
      { id: "hero-title-compact", pass: words(hero.title) <= 14, weight: 35 },
      { id: "hero-subtitle-compact", pass: words(hero.subtitle) <= 40, weight: 35 },
      { id: "service-descriptions", pass: (content.services || []).every((service) => words(service.short_description) <= 35), weight: 30 }
    ]),
    metric("safety", "Publicatieveiligheid", [
      { id: "review-policy", pass: reviews.publicationPolicy === "placeholder_only_requires_verified_replacement", weight: 40 },
      { id: "reviews-blocked", pass: (reviews.items || []).every((review) => review.publishable === false), weight: 30 },
      { id: "placeholder-scan", pass: !includesPlaceholder({ hero, seo, services: content.services }), weight: 30 }
    ])
  ];
  const overall = Math.round(metrics.reduce((sum, item) => sum + item.score, 0) / metrics.length);
  return {
    contract_version: "quality-score/v1",
    target: "website-content",
    overall,
    metrics,
    ai_confidence: { score: null, status: "not_measured", reason: "Structurele validatie is geen inhoudelijke AI-confidence." },
    publication_ready: false,
    requires_human_review: true,
    status: overall >= 90 ? "adapter_ready" : overall >= 75 ? "review_recommended" : "incomplete"
  };
}
