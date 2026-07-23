import { CONTENT_BLOCKS } from "../../src/content-blocks.mjs";
import { composeContentLibraryBlueprint, composePhotographyPrompt, CONTENT_LIBRARY_COMPOSITION_VERSION } from "../../src/composition.mjs";
import { BRAND_PERSONALITIES } from "../../src/personalities.mjs";
import { STYLE_PROFILES } from "../../src/styles.mjs";
import { VERTICALS } from "../../src/verticals.mjs";

export const CONTENT_LIBRARY_PUBLIC_VERSION = CONTENT_LIBRARY_COMPOSITION_VERSION;

export function listContentLibraryDimensionsV2() {
  return structuredClone({
    verticals: VERTICALS.map(({ slug, name, category }) => ({ slug, name, category })),
    styles: STYLE_PROFILES,
    brandPersonalities: BRAND_PERSONALITIES,
    contentBlocks: CONTENT_BLOCKS,
    themes: ["light", "dark"],
    channels: ["website", "social", "blog", "newsletter", "google_business_profile"]
  });
}

export { composeContentLibraryBlueprint, composePhotographyPrompt };

