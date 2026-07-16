const IMAGE_SECTION_ID = "home.hero";
const IMAGE_SECTION_TYPE = "hero";
const IMAGE_FIELD = "image";
const IMAGE_SLOT_ID = "home.hero.image";
const IMAGE_SCHEMA_ID = "mws.image.v1";
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MAX_PIXELS = 40 * 1024 * 1024;
const IMAGE_MIN_WIDTH = 960;
const IMAGE_MIN_HEIGHT = 540;
const IMAGE_RECOMMENDED_WIDTH = 1600;
const IMAGE_RECOMMENDED_HEIGHT = 900;
const IMAGE_ALT_MAX_LENGTH = 180;
const IMAGE_ALLOWED_MIME_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_SOURCE_CAPABILITIES = Object.freeze(["upload", "brand_center", "content_library", "website_asset"]);
const IMAGE_WRITE_CAPABILITIES = Object.freeze(["write:image", "write:image-alt"]);

function imageEditorDefinition() {
  return Object.freeze({
    schema: IMAGE_SCHEMA_ID,
    sectionId: IMAGE_SECTION_ID,
    sectionType: IMAGE_SECTION_TYPE,
    field: IMAGE_FIELD,
    assetSlotId: IMAGE_SLOT_ID,
    required: true,
    allowedMimeTypes: IMAGE_ALLOWED_MIME_TYPES,
    maxBytes: IMAGE_MAX_BYTES,
    recommendedWidth: IMAGE_RECOMMENDED_WIDTH,
    recommendedHeight: IMAGE_RECOMMENDED_HEIGHT,
    minimumWidth: IMAGE_MIN_WIDTH,
    minimumHeight: IMAGE_MIN_HEIGHT,
    maxPixels: IMAGE_MAX_PIXELS,
    aspectRatio: "16:9",
    altRequired: true,
    altMaxLength: IMAGE_ALT_MAX_LENGTH,
    sourceCapabilities: IMAGE_SOURCE_CAPABILITIES,
    capabilities: IMAGE_WRITE_CAPABILITIES,
  });
}

function publicImageSchema() {
  const schema = imageEditorDefinition();
  return {
    ...schema,
    allowedMimeTypes: [...schema.allowedMimeTypes],
    sourceCapabilities: [...schema.sourceCapabilities],
    capabilities: [...schema.capabilities],
  };
}

module.exports = {
  IMAGE_ALLOWED_MIME_TYPES,
  IMAGE_ALT_MAX_LENGTH,
  IMAGE_FIELD,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_PIXELS,
  IMAGE_MIN_HEIGHT,
  IMAGE_MIN_WIDTH,
  IMAGE_RECOMMENDED_HEIGHT,
  IMAGE_RECOMMENDED_WIDTH,
  IMAGE_SCHEMA_ID,
  IMAGE_SECTION_ID,
  IMAGE_SECTION_TYPE,
  IMAGE_SLOT_ID,
  IMAGE_SOURCE_CAPABILITIES,
  IMAGE_WRITE_CAPABILITIES,
  imageEditorDefinition,
  publicImageSchema,
};
