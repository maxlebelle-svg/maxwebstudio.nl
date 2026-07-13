import assert from "node:assert/strict";
import {
  SOCIAL_STUDIO_CAPABILITIES,
  SOCIAL_STUDIO_SCHEMA_VERSION,
  createWorkspaceEnvelope,
  normalizeContentItem,
} from "../public/src/social-studio/core.mjs";
import { LocalSocialStudioRepository } from "../public/src/social-studio/local-repository.mjs";

const legacyVariant = normalizeContentItem({
  id: "legacy-1",
  platform: "instagram",
  title: "Bestaand concept",
  contentType: "client-case",
  imagePrompt: "Warm daglicht en een rustige compositie",
  status: "unknown-status",
});

assert.equal(legacyVariant.schemaVersion, SOCIAL_STUDIO_SCHEMA_VERSION);
assert.equal(legacyVariant.entityType, "social-content");
assert.equal(legacyVariant.contentType, "client-case");
assert.equal(legacyVariant.imagePrompt, "Warm daglicht en een rustige compositie");
assert.equal(legacyVariant.status, "draft");
assert.equal(legacyVariant.timezone, "Europe/Amsterdam");
assert.deepEqual(legacyVariant.integrations, {});
assert.deepEqual(legacyVariant.metrics, {});
assert.deepEqual(legacyVariant.extensions, {});

for (const capability of [
  "aiContentCreator",
  "publishing",
  "analytics",
  "seoStudio",
  "reviewManager",
  "emailMarketing",
  "campaigns",
]) {
  assert.equal(SOCIAL_STUDIO_CAPABILITIES[capability].status, "planned");
}

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const keys = { draft: "draft", variants: "variants", context: "context" };
const repository = new LocalSocialStudioRepository(storage, keys);

repository.saveVariants([{ id: "saved-1", platform: "linkedin", status: "review" }]);
assert.equal(repository.loadVariants()[0].status, "review");
assert.equal(repository.loadVariants()[0].schemaVersion, SOCIAL_STUDIO_SCHEMA_VERSION);

const envelope = createWorkspaceEnvelope({ variants: repository.loadVariants() });
assert.equal(envelope.module, "social-studio");
assert.equal(envelope.variants.length, 1);
assert.equal(envelope.capabilities.publishing.status, "planned");

repository.clearWorkspace();
assert.equal(repository.loadVariants().length, 0);

console.log("social studio core tests passed");
