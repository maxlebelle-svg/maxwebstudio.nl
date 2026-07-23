export const CONTENT_BLOCKS = Object.freeze([
  { id: "hero", role: "conversion", channels: ["website", "social"], inputs: ["headline", "subtitle", "primary_cta", "hero_asset"], variants: ["split", "full-bleed", "centered", "action-led"] },
  { id: "usps", role: "proof", channels: ["website", "social", "newsletter"], inputs: ["title", "description", "icon"], variants: ["icon-grid", "proof-bar", "cards"] },
  { id: "services", role: "offer", channels: ["website", "social", "newsletter", "google_business_profile"], inputs: ["name", "description", "benefits", "asset"], variants: ["cards", "list", "editorial", "comparison"] },
  { id: "about", role: "trust", channels: ["website", "social", "newsletter"], inputs: ["story", "values", "team", "about_asset"], variants: ["founder-story", "timeline", "mission", "team-led"] },
  { id: "cta", role: "conversion", channels: ["website", "social", "newsletter", "google_business_profile"], inputs: ["label", "supporting_text", "intent"], variants: ["inline", "banner", "sticky", "form-led"] },
  { id: "faq", role: "objection", channels: ["website", "social", "newsletter", "google_business_profile"], inputs: ["question", "answer", "category"], variants: ["accordion", "searchable", "grouped"] },
  { id: "reviews", role: "proof", channels: ["website", "social"], inputs: ["verified_review"], variants: ["quote", "carousel", "case-proof"], publication_policy: "verified_only" },
  { id: "projects", role: "proof", channels: ["website", "social", "newsletter"], inputs: ["challenge", "approach", "result", "project_asset"], variants: ["case-grid", "before-after", "story"] },
  { id: "team", role: "trust", channels: ["website", "social"], inputs: ["name", "role", "bio", "portrait_asset"], variants: ["portraits", "founder", "compact"] },
  { id: "footer", role: "navigation", channels: ["website"], inputs: ["contact", "navigation", "legal", "social_links"], variants: ["compact", "sitemap", "conversion"] },
  { id: "seo", role: "distribution", channels: ["website", "blog", "google_business_profile"], inputs: ["intent", "keywords", "entities", "local_context"], variants: ["service", "local", "faq", "article"] },
  { id: "social", role: "distribution", channels: ["social"], inputs: ["hook", "caption_direction", "visual_asset", "cta"], variants: ["single", "carousel", "reel", "story"] },
  { id: "newsletter", role: "retention", channels: ["newsletter"], inputs: ["subject", "preheader", "sections", "cta"], variants: ["editorial", "offer", "digest"] },
  { id: "google_business_profile", role: "local-discovery", channels: ["google_business_profile"], inputs: ["description", "services", "posts", "local_context"], variants: ["update", "offer", "event", "faq"] }
]);

export function blocksForChannels(channels) {
  const requested = new Set(channels);
  return CONTENT_BLOCKS.filter((block) => block.channels.some((channel) => requested.has(channel)));
}

