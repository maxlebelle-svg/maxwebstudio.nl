import fs from "node:fs";
import path from "node:path";
import { VERTICALS } from "./verticals.mjs";
import { loadRequirements, paths } from "./compiler.mjs";

const CONTENT_FIELDS = {
  hero_variants: "hero_titles",
  seo_keywords: "branch.seo_keywords",
  faq: "faq",
  reviews: "review_examples",
  social_post_ideas: "social_post_topics",
  blog_topics: "blog_topics",
  calls_to_action: "cta",
  usps: "usps",
  project_descriptions: "projects",
  team_profiles: "team_profiles",
  services: "service_descriptions",
  gallery_descriptions: "gallery_descriptions"
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function nestedValue(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function duplicateIds(items) {
  const ids = items.map((item) => item.id).filter(Boolean);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

export function validateLibrary() {
  const requirements = loadRequirements();
  const { generatedRoot, libraryRoot } = paths();
  const errors = [];
  const warnings = [];
  const catalogPath = path.join(generatedRoot, "catalog.json");
  if (!fs.existsSync(catalogPath)) return { valid: false, errors: ["generated/catalog.json ontbreekt; voer eerst build uit."], warnings, stats: {} };
  const catalog = readJson(catalogPath);

  if (catalog.branch_count !== VERTICALS.length) errors.push(`Catalogus telt ${catalog.branch_count} branches; verwacht ${VERTICALS.length}.`);
  const slugs = catalog.branches.map((branch) => branch.slug);
  if (new Set(slugs).size !== slugs.length) errors.push("Branch-slugs zijn niet uniek.");

  let contentItems = 0;
  let assetSlots = 0;
  for (const vertical of VERTICALS) {
    const root = path.join(generatedRoot, "branches", vertical.slug);
    const files = ["content.json", "asset-manifest.json", "image-prompts.json"];
    for (const filename of files) if (!fs.existsSync(path.join(root, filename))) errors.push(`${vertical.slug}: ${filename} ontbreekt.`);
    if (files.some((filename) => !fs.existsSync(path.join(root, filename)))) continue;
    const content = readJson(path.join(root, "content.json"));
    const assets = readJson(path.join(root, "asset-manifest.json"));
    const prompts = readJson(path.join(root, "image-prompts.json"));
    if (content.branch.slug !== vertical.slug) errors.push(`${vertical.slug}: slug in content komt niet overeen.`);
    for (const [requirementKey, field] of Object.entries(CONTENT_FIELDS)) {
      const items = nestedValue(content, field);
      const minimum = requirements.minimums[requirementKey];
      if (!Array.isArray(items) || items.length < minimum) errors.push(`${vertical.slug}: ${field} heeft ${items?.length ?? 0}, minimaal ${minimum}.`);
      else {
        contentItems += items.length;
        const duplicates = duplicateIds(items);
        if (duplicates.length) errors.push(`${vertical.slug}: dubbele IDs in ${field}: ${duplicates.slice(0, 3).join(", ")}.`);
      }
    }
    if (assets.slots.length < requirements.minimums.asset_slots) errors.push(`${vertical.slug}: te weinig assets.`);
    if (prompts.length < requirements.minimums.image_prompts) errors.push(`${vertical.slug}: te weinig image prompts.`);
    assetSlots += assets.slots.length;
    for (const asset of assets.slots) {
      for (const key of ["storage_path", "source_resolution", "aspect_ratio", "template_bindings", "prompt"]) {
        if (!asset[key]) errors.push(`${vertical.slug}/${asset.id}: ${key} ontbreekt.`);
      }
      if (!asset.storage_path.startsWith(`content-library/${vertical.slug}/`)) errors.push(`${vertical.slug}/${asset.id}: ongeldige opslaglocatie.`);
    }
    for (const directory of requirements.asset_directories) {
      if (!fs.existsSync(path.join(libraryRoot, vertical.slug, directory, "README.md"))) errors.push(`${vertical.slug}: assetmap ${directory} ontbreekt.`);
    }
    if (content.review_examples.some((review) => !review.disclosure?.includes("Voorbeeldreview"))) warnings.push(`${vertical.slug}: review zonder voorbeeld-disclosure.`);
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: { branches: VERTICALS.length, categories: new Set(VERTICALS.map((item) => item.category)).size, content_items: contentItems, asset_slots: assetSlots, prompt_count: assetSlots }
  };
}
