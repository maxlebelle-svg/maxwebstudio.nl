const HERO_SECTION_ID = "home.hero";
const HERO_SECTION_TYPE = "hero";
const HERO_SCHEMA_ID = "mws.hero.v1";

const HERO_FIELDS = Object.freeze([
  field("eyebrow", "Eyebrow", "eyebrow", "text", 80, { optional: true, conditional: true }),
  field("title", "Titel", "title", "text", 180, { multiline: true, required: true }),
  field("subtitle", "Subtitel", "description", "text", 500, { multiline: true, optional: true }),
  field("primaryCtaText", "Primaire knoptekst", "primary-cta", "text", 60, { optional: true }),
  field("primaryCtaLink", "Primaire knoplink", "primary-cta", "href", 2048, { optional: true, format: "safe_link" }),
  field("secondaryCtaText", "Secundaire knoptekst", "secondary-cta", "text", 60, { optional: true }),
  field("secondaryCtaLink", "Secundaire knoplink", "secondary-cta", "href", 2048, { optional: true, format: "safe_link" }),
]);

const HERO_WRITE_CAPABILITIES = Object.freeze(HERO_FIELDS.map((item) => `write:${item.key}`));

function field(key, label, nodeField, target, maxLength, options = {}) {
  return Object.freeze({ key, label, nodeField, target, maxLength, ...options });
}

function publicHeroSchema() {
  return {
    id: HERO_SCHEMA_ID,
    sectionId: HERO_SECTION_ID,
    sectionType: HERO_SECTION_TYPE,
    imageReadOnly: true,
    fields: HERO_FIELDS.map((item) => ({ ...item })),
  };
}

module.exports = {
  HERO_FIELDS,
  HERO_SCHEMA_ID,
  HERO_SECTION_ID,
  HERO_SECTION_TYPE,
  HERO_WRITE_CAPABILITIES,
  publicHeroSchema,
};
