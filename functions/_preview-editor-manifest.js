const SECTION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const SECTION_TYPE_PATTERN = /^[a-z][a-z0-9_-]{1,39}$/;
const FIELD_PATTERN = /^[a-z][a-z0-9_-]{1,39}$/;
const { HERO_FIELDS, HERO_SCHEMA_ID, HERO_SECTION_ID, HERO_SECTION_TYPE, HERO_WRITE_CAPABILITIES } = require("./_preview-editor-hero-schema");

const FACTORY_EDITOR_MANIFEST = Object.freeze({
  version: 1,
  source: "factory",
  pages: Object.freeze([
    Object.freeze({
      path: "index.html",
      sections: Object.freeze([
        section("home.hero", "hero", "Hero", ["eyebrow", "title", "description", "primary-cta", "secondary-cta", "image"], heroEditor()),
        section("home.introduction", "text", "Introductie", ["eyebrow", "title", "description"]),
        section("home.services", "services", "Diensten", ["eyebrow", "title", "items"]),
        section("home.contact-cta", "cta", "Contact en call-to-action", ["eyebrow", "title", "description", "form"]),
        section("global.footer", "footer", "Footer", ["business-name", "description", "navigation"]),
      ]),
    }),
  ]),
});

function section(id, type, label, fields, editor = null) {
  return Object.freeze({ id, type, label, fields: Object.freeze(fields), ...(editor ? { editor: Object.freeze(editor) } : {}) });
}

function heroEditor() {
  return {
    schema: HERO_SCHEMA_ID,
    capabilities: Object.freeze([...HERO_WRITE_CAPABILITIES]),
    fields: Object.freeze(HERO_FIELDS.map((item) => Object.freeze({ key: item.key, nodeField: item.nodeField, target: item.target, maxLength: item.maxLength, required: Boolean(item.required), format: item.format || "text" }))),
  };
}

function validateEditorManifest(value) {
  if (!value || typeof value !== "object" || value.version !== 1 || value.source !== "factory" || !Array.isArray(value.pages)) return null;
  const pages = [];
  const ids = new Set();
  for (const page of value.pages.slice(0, 20)) {
    const path = safePagePath(page?.path);
    if (!path || !Array.isArray(page.sections)) return null;
    const sections = [];
    for (const candidate of page.sections.slice(0, 100)) {
      const id = text(candidate?.id, 80);
      const type = text(candidate?.type, 40);
      const label = text(candidate?.label, 100);
      const fields = Array.isArray(candidate?.fields)
        ? [...new Set(candidate.fields.map((field) => text(field, 40)).filter((field) => FIELD_PATTERN.test(field)))].slice(0, 30)
        : [];
      if (!SECTION_ID_PATTERN.test(id) || !SECTION_TYPE_PATTERN.test(type) || !label || ids.has(`${path}:${id}`)) return null;
      ids.add(`${path}:${id}`);
      const editor = validateEditorDefinition(candidate?.editor, { id, type, fields });
      if (candidate?.editor && !editor) return null;
      sections.push({ id, type, label, fields, ...(editor ? { editor } : {}) });
    }
    pages.push({ path, sections });
  }
  return { version: 1, source: "factory", pages };
}

function validateEditorDefinition(value, sectionValue = {}) {
  if (!value || typeof value !== "object") return null;
  if (sectionValue.id !== HERO_SECTION_ID || sectionValue.type !== HERO_SECTION_TYPE || value.schema !== HERO_SCHEMA_ID) return null;
  const capabilities = Array.isArray(value.capabilities) ? value.capabilities.map((item) => text(item, 80)) : [];
  if (capabilities.length !== HERO_WRITE_CAPABILITIES.length || HERO_WRITE_CAPABILITIES.some((item) => !capabilities.includes(item))) return null;
  const fields = Array.isArray(value.fields) ? value.fields : [];
  if (fields.length !== HERO_FIELDS.length) return null;
  for (const expected of HERO_FIELDS) {
    const candidate = fields.find((item) => item?.key === expected.key);
    if (!candidate || candidate.nodeField !== expected.nodeField || candidate.target !== expected.target || Number(candidate.maxLength) !== expected.maxLength || Boolean(candidate.required) !== Boolean(expected.required) || text(candidate.format || "text", 20) !== (expected.format || "text") || !sectionValue.fields.includes(expected.nodeField)) return null;
  }
  return {
    schema: HERO_SCHEMA_ID,
    capabilities: [...HERO_WRITE_CAPABILITIES],
    fields: HERO_FIELDS.map((item) => ({ key: item.key, nodeField: item.nodeField, target: item.target, maxLength: item.maxLength, required: Boolean(item.required), format: item.format || "text" })),
  };
}

function safePagePath(value) {
  const clean = text(value, 160).replace(/\\/g, "/").replace(/^\.\//, "");
  return clean && !clean.startsWith("/") && !clean.split("/").includes("..") && /\.html?$/i.test(clean) ? clean : "";
}

function text(value, max) {
  return String(value || "").trim().slice(0, max);
}

module.exports = { FACTORY_EDITOR_MANIFEST, FIELD_PATTERN, SECTION_ID_PATTERN, SECTION_TYPE_PATTERN, safePagePath, validateEditorManifest };
