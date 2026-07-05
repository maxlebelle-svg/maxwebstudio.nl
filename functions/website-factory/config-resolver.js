const fs = require("fs");
const path = require("path");

const CONFIG_ROOT = __dirname;
const PACKAGE_ALIASES = {
  starter: "starter",
  start: "starter",
  "495": "starter",
  onepager: "starter",
  onepage: "starter",
  business: "business",
  professional: "business",
  professioneel: "business",
  plus: "business",
  "995": "business",
  premium: "premium",
  growth: "premium",
  "1750": "premium",
};

const INDUSTRY_ALIASES = [
  ["bouw", /\b(aannemer|bouw|renovatie|timmerbedrijf|timmer|dakopbouw|aanbouw|badkamer|kozijn)\b/i],
  ["hovenier", /\b(tuin|hovenier|tuinaanleg|groen|buitenruimte)\b/i],
  ["restaurant", /\b(restaurant|horeca|cafe|hotel|b&b|reserveren)\b/i],
  ["kapper", /\b(kapper|kapsalon|barber|salon|styling)\b/i],
  ["makelaar", /\b(makelaar|vastgoed|woning|taxatie|verkoop|aankoop)\b/i],
  ["installateur", /\b(installateur|installatie|zonnepanelen|warmtepomp|airco|elektra|loodgieter|laadpaal)\b/i],
  ["schoonheidssalon", /\b(schoonheid|beauty|schoonheidssalon|wellness|behandeling)\b/i],
  ["schoonmaak", /\b(schoonmaak|cleaning|reiniging|vve|kantoor|oplevering)\b/i],
];

function resolvePackage(packageType = "") {
  const manifests = loadPackages();
  const normalized = normalizeKey(packageType);
  const aliasTarget = PACKAGE_ALIASES[normalized] || normalized || "starter";
  return manifests[aliasTarget] || manifests.starter;
}

function resolveIndustry(industryInput = "") {
  const manifests = loadIndustries();
  const text = String(industryInput || "");
  const directKey = normalizeKey(text);
  if (manifests[directKey]) return manifests[directKey];
  const match = INDUSTRY_ALIASES.find(([, pattern]) => pattern.test(text));
  if (match && manifests[match[0]]) return manifests[match[0]];
  const manifestMatch = Object.values(manifests).find((manifest) => {
    const aliases = manifest.aliases || [];
    return aliases.some((alias) => text.toLowerCase().includes(String(alias).toLowerCase()));
  });
  return manifestMatch || manifests.local || Object.values(manifests)[0];
}

function resolveFactoryConfig({ packageType = "", industry = "", overrides = {} } = {}) {
  const packageManifest = resolvePackage(packageType);
  const industryManifest = resolveIndustry(industry);
  const rules = {
    pages: toHtmlPages(packageManifest.pages || packageManifest.pageIds || ["home"]),
    pageIds: packageManifest.pageIds || toPageIds(packageManifest.pages || ["home"]),
    components: { ...(packageManifest.components || {}), ...(overrides.components || {}) },
    seo: overrides.seo || packageManifest.seo || "basic",
    animations: overrides.animations || packageManifest.animations || "basic",
    assets: { ...(packageManifest.assets || {}), ...(overrides.assets || {}) },
    schema: Boolean(overrides.schema ?? packageManifest.schema),
    performance: overrides.performance || packageManifest.performance || "standard",
  };
  return {
    package: packageManifest,
    industry: industryManifest,
    rules,
    components: rules.components,
    pages: rules.pages,
    assets: rules.assets,
    labels: {
      packageId: packageManifest.id,
      packageName: packageManifest.name,
      packagePositioning: packageManifest.positioning,
      industryId: industryManifest.id,
      industryName: industryManifest.name,
    },
    sources: {
      packageManifest: packageManifest.__source,
      industryManifest: industryManifest.__source,
    },
  };
}

function loadWebsiteFactoryManifests() {
  return {
    packages: loadPackages(),
    industries: Object.values(loadIndustries()).map(toCoreIndustryProfile),
    components: loadComponents(),
  };
}

function loadPackages() {
  const raw = loadJsonDirectory(path.join(CONFIG_ROOT, "packages"));
  const byId = {};
  raw.forEach((manifest) => {
    const id = normalizeKey(manifest.id || manifest.key || manifest.name);
    if (!id) return;
    byId[id] = normalizePackageManifest({ ...manifest, id, key: manifest.key || id });
  });
  Object.keys(byId).forEach((id) => {
    const manifest = byId[id];
    if (!manifest.extends || !byId[manifest.extends]) return;
    byId[id] = normalizePackageManifest({
      ...byId[manifest.extends],
      ...manifest,
      components: { ...byId[manifest.extends].components, ...manifest.components },
      pages: manifest.pages?.length ? manifest.pages : byId[manifest.extends].pages,
      pageIds: manifest.pageIds?.length ? manifest.pageIds : byId[manifest.extends].pageIds,
    });
  });
  Object.values(byId).forEach((manifest) => {
    (manifest.aliases || []).forEach((alias) => {
      byId[normalizeKey(alias)] = manifest;
    });
  });
  return byId;
}

function loadIndustries() {
  const byId = {};
  loadJsonDirectory(path.join(CONFIG_ROOT, "industries")).forEach((manifest) => {
    const id = normalizeKey(manifest.id || manifest.key || manifest.name);
    if (!id) return;
    byId[id] = normalizeIndustryManifest({ ...manifest, id });
  });
  return byId;
}

function loadComponents() {
  const root = path.join(CONFIG_ROOT, "components");
  if (!fs.existsSync(root)) return {};
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readJson(path.join(root, entry.name, "manifest.json")))
    .filter(Boolean)
    .reduce((all, manifest) => ({ ...all, [manifest.key || manifest.id]: manifest }), {});
}

function normalizePackageManifest(manifest = {}) {
  return {
    ...manifest,
    id: normalizeKey(manifest.id || manifest.key || manifest.name),
    key: normalizeKey(manifest.key || manifest.id || manifest.name),
    name: manifest.name || manifest.label || manifest.id,
    label: manifest.label || manifest.name || manifest.id,
    price: Number(manifest.price || 0),
    pages: toHtmlPages(manifest.pages || manifest.pageIds || ["home"]),
    pageIds: manifest.pageIds || toPageIds(manifest.pages || ["home"]),
    sections: manifest.sections || Object.keys(manifest.components || {}).filter((key) => manifest.components[key]),
    components: manifest.components || {},
    navigation: manifest.navigation || "scroll",
    template: manifest.template || `${normalizeKey(manifest.id || manifest.name)}-template-v1`,
    assets: manifest.assets || {},
  };
}

function normalizeIndustryManifest(manifest = {}) {
  return {
    ...manifest,
    id: normalizeKey(manifest.id || manifest.key || manifest.name),
    key: manifest.key || normalizeKey(manifest.id || manifest.name),
    name: manifest.name || manifest.label || manifest.id,
    label: manifest.label || manifest.name || manifest.id,
    aliases: manifest.aliases || manifest.keywords || [],
    colorHints: manifest.colorHints || [],
    palette: manifest.palette || manifest.colors || {},
    copy: manifest.copy || {},
    heroAngles: manifest.heroAngles || [manifest.copy?.hero].filter(Boolean),
    services: manifest.services || [],
    trustSignals: manifest.trustSignals || [],
    ctaExamples: manifest.ctaExamples || [manifest.copy?.cta].filter(Boolean),
    assetKeywords: manifest.assetKeywords || manifest.assetSlots || [],
  };
}

function toCoreIndustryProfile(manifest = {}) {
  return {
    key: manifest.key || manifest.id,
    id: manifest.id,
    name: manifest.name,
    keywords: Object.freeze(manifest.aliases || []),
    label: manifest.label,
    colors: manifest.palette,
    hero: manifest.copy?.hero || manifest.heroAngles?.[0] || "",
    intro: manifest.copy?.intro || "",
    eyebrow: manifest.copy?.eyebrow || "",
    cta: manifest.copy?.cta || manifest.ctaExamples?.[0] || "",
    secondaryCta: manifest.copy?.secondaryCta || "",
    services: manifest.services || [],
    trustSignals: manifest.trustSignals || [],
    assetKeywords: manifest.assetKeywords || [],
  };
}

function toHtmlPages(pages = []) {
  return pages.map((page) => {
    const value = String(page || "").trim();
    if (!value) return "";
    if (value === "home" || value === "index") return "index.html";
    return value.endsWith(".html") ? value : `${value}.html`;
  }).filter(Boolean);
}

function toPageIds(pages = []) {
  return pages.map((page) => String(page || "").replace(/\.html$/, "").replace(/^index$/, "home"));
}

function loadJsonDirectory(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(path.join(directory, file), file))
    .filter(Boolean);
}

function readJson(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { ...parsed, __source: path.relative(process.cwd(), filePath) };
  } catch (error) {
    const wrapped = new Error(`Website Factory config kon niet worden geladen: ${filePath} (${error.message})`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

module.exports = {
  resolvePackage,
  resolveIndustry,
  resolveFactoryConfig,
  loadWebsiteFactoryManifests,
};
