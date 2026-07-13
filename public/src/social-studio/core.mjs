export const SOCIAL_STUDIO_SCHEMA_VERSION = 1;

export const CONTENT_STATUSES = Object.freeze([
  Object.freeze({ id: "idea", label: "Idee" }),
  Object.freeze({ id: "draft", label: "Concept" }),
  Object.freeze({ id: "review", label: "Ter beoordeling" }),
  Object.freeze({ id: "ready", label: "Klaar om te publiceren" }),
]);

export const SOCIAL_STUDIO_CAPABILITIES = Object.freeze({
  editor: Object.freeze({ status: "active", adapter: "local" }),
  planning: Object.freeze({ status: "active", adapter: "local" }),
  aiContentCreator: Object.freeze({ status: "planned", adapter: null }),
  publishing: Object.freeze({ status: "planned", adapter: null }),
  analytics: Object.freeze({ status: "planned", adapter: null }),
  seoStudio: Object.freeze({ status: "planned", adapter: null }),
  reviewManager: Object.freeze({ status: "planned", adapter: null }),
  emailMarketing: Object.freeze({ status: "planned", adapter: null }),
  campaigns: Object.freeze({ status: "planned", adapter: null }),
});

const statusIds = new Set(CONTENT_STATUSES.map(({ id }) => id));

export function normalizeStatus(value) {
  return statusIds.has(value) ? value : "draft";
}

export function normalizeContentItem(input = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: SOCIAL_STUDIO_SCHEMA_VERSION,
    entityType: "social-content",
    id: input.id || `content-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    platform: input.platform || "facebook",
    status: normalizeStatus(input.status),
    title: input.title || "",
    caption: input.caption || "",
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
    integrations: { ...(input.integrations || {}) },
    metrics: { ...(input.metrics || {}) },
    extensions: { ...(input.extensions || {}) },
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function createWorkspaceEnvelope({ context = {}, currentDraft = {}, variants = [] } = {}) {
  return {
    schemaVersion: SOCIAL_STUDIO_SCHEMA_VERSION,
    module: "social-studio",
    capabilities: SOCIAL_STUDIO_CAPABILITIES,
    context: { ...context },
    currentDraft: normalizeContentItem(currentDraft),
    variants: variants.map(normalizeContentItem),
    exportedAt: new Date().toISOString(),
    note: "Lokale Social Studio export. Nog niet gekoppeld aan publicatie-API's.",
  };
}
