const TEXT_SECTION_ID = "home.introduction";
const TEXT_SECTION_TYPE = "text";
const TEXT_SCHEMA_ID = "mws.text.v1";

const TEXT_FIELDS = Object.freeze([
  field("eyebrow", "Eyebrow", "eyebrow", "text", 80, { optional: true, conditional: true }),
  field("title", "Titel", "title", "text", 180, { required: true, multiline: true }),
  field("body", "Body", "body", "paragraphs", 4000, { optional: true, multiline: true, maxParagraphs: 12, maxParagraphLength: 1000 }),
]);

const TEXT_WRITE_CAPABILITIES = Object.freeze(TEXT_FIELDS.map((item) => `write:${item.key}`));
const TEXT_REQUIRED_FIELDS = Object.freeze(["title", "body"]);

function field(key, label, nodeField, target, maxLength, options = {}) {
  return Object.freeze({ key, label, nodeField, target, maxLength, ...options });
}

function publicTextSchema(fields = TEXT_FIELDS) {
  return {
    id: TEXT_SCHEMA_ID,
    sectionId: TEXT_SECTION_ID,
    sectionType: TEXT_SECTION_TYPE,
    imageReadOnly: true,
    fields: fields.map((item) => ({ ...item })),
  };
}

module.exports = {
  TEXT_FIELDS,
  TEXT_REQUIRED_FIELDS,
  TEXT_SCHEMA_ID,
  TEXT_SECTION_ID,
  TEXT_SECTION_TYPE,
  TEXT_WRITE_CAPABILITIES,
  publicTextSchema,
};
