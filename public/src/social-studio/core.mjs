export const SOCIAL_STUDIO_SCHEMA_VERSION = 2;

export const CONTENT_STATUSES = Object.freeze([
  Object.freeze({ id: "idea", label: "Idee" }),
  Object.freeze({ id: "draft", label: "Concept" }),
  Object.freeze({ id: "review", label: "Review" }),
  Object.freeze({ id: "approved", label: "Goedgekeurd" }),
  Object.freeze({ id: "scheduled", label: "Gepland" }),
  Object.freeze({ id: "published", label: "Geplaatst" }),
  Object.freeze({ id: "cancelled", label: "Geannuleerd" }),
  Object.freeze({ id: "archived", label: "Gearchiveerd" }),
]);

export const SOCIAL_STUDIO_CAPABILITIES = Object.freeze({
  editor: Object.freeze({ status: "active", adapter: "local" }),
  planning: Object.freeze({ status: "active", adapter: "local" }),
  aiContentCreator: Object.freeze({ status: "active", adapter: "provider-neutral/local-preview" }),
  publishing: Object.freeze({ status: "planned", adapter: null }),
  analytics: Object.freeze({ status: "planned", adapter: null }),
  seoStudio: Object.freeze({ status: "planned", adapter: null }),
  reviewManager: Object.freeze({ status: "planned", adapter: null }),
  emailMarketing: Object.freeze({ status: "planned", adapter: null }),
  campaigns: Object.freeze({ status: "planned", adapter: null }),
});

const statusIds = new Set(CONTENT_STATUSES.map(({ id }) => id));

export function normalizeStatus(value) {
  if (value === "ready") return "approved";
  return statusIds.has(value) ? value : "draft";
}

export function normalizeContentItem(input = {}) {
  const now = new Date().toISOString();
  const id = input.id || `content-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const contentRole = input.contentRole === "platform-variant" ? "platform-variant" : "master";
  return {
    schemaVersion: SOCIAL_STUDIO_SCHEMA_VERSION,
    entityType: "social-content",
    id,
    contentRole,
    masterId: input.masterId || (contentRole === "master" ? id : null),
    variantKey: input.variantKey || null,
    revision: Math.max(1, Number(input.revision) || 1),
    sourceRevision: Math.max(1, Number(input.sourceRevision) || 1),
    scopeId: input.scopeId || "internal:max-webstudio",
    contentType: input.contentType || "social-post",
    platform: input.platform || "facebook",
    status: normalizeStatus(input.status),
    title: input.title || "",
    caption: input.caption || "",
    imagePrompt: input.imagePrompt || "",
    visualDirection: input.visualDirection || "",
    altText: input.altText || "",
    cta: input.cta || "",
    link: input.link || "",
    hashtags: input.hashtags || "",
    tone: input.tone || "Professioneel",
    client: input.client || "",
    campaign: input.campaign || "",
    campaignId: input.campaignId || null,
    goal: input.goal || "Meer aanvragen",
    date: input.date || "",
    time: input.time || "09:00",
    timezone: input.timezone || "Europe/Amsterdam",
    visualFormat: input.visualFormat || "square",
    approval: {
      state: input.approval?.state || "not-requested",
      requestedAt: input.approval?.requestedAt || null,
      decidedAt: input.approval?.decidedAt || null,
      decidedBy: input.approval?.decidedBy || null,
    },
    publication: {
      date: input.publication?.date || input.publishedAt || "",
      url: input.publication?.url || input.publicUrl || "",
      note: input.publication?.note || input.publicationNote || "",
    },
    integrations: { ...(input.integrations || {}) },
    metrics: { ...(input.metrics || {}) },
    extensions: { ...(input.extensions || {}) },
    brandVoiceSnapshot: input.brandVoiceSnapshot && typeof input.brandVoiceSnapshot === "object" ? { ...input.brandVoiceSnapshot } : null,
    relationshipContextSnapshot: input.relationshipContextSnapshot && typeof input.relationshipContextSnapshot === "object" ? { ...input.relationshipContextSnapshot } : null,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function createWorkspaceEnvelope({ context = {}, currentDraft = {}, masters = [], variants = [] } = {}) {
  return {
    schemaVersion: SOCIAL_STUDIO_SCHEMA_VERSION,
    module: "social-studio",
    capabilities: SOCIAL_STUDIO_CAPABILITIES,
    context: { ...context },
    currentDraft: normalizeContentItem(currentDraft),
    masters: masters.map(normalizeContentItem),
    variants: variants.map(normalizeContentItem),
    exportedAt: new Date().toISOString(),
    note: "Lokale Social Studio export. Nog niet gekoppeld aan publicatie-API's.",
  };
}
