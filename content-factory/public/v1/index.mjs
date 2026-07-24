import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONTENT_LIBRARY_PUBLIC_VERSION = "1.0.0";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GENERATED_ROOT = path.join(ROOT, "generated");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function normalizeSlug(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function listBranchesV1() {
  const catalog = readJson(path.join(GENERATED_ROOT, "catalog.json"));
  return clone(catalog.branches);
}

export function resolveBranchSlugV1(value = "") {
  const normalized = normalizeSlug(value);
  if (!normalized) return null;
  const catalog = listBranchesV1();
  const direct = catalog.find((branch) => branch.slug === normalized || normalizeSlug(branch.name) === normalized);
  if (direct) return direct.slug;
  for (const branch of catalog) {
    const content = readJson(path.join(GENERATED_ROOT, branch.content_path));
    const terms = content.branch.keywords || [];
    if (terms.some((term) => normalizeSlug(term) === normalized)) return branch.slug;
  }
  return null;
}

export function getBranchDefinitionV1(slug) {
  const resolved = resolveBranchSlugV1(slug);
  if (!resolved) return null;
  const branchRoot = path.join(GENERATED_ROOT, "branches", resolved);
  return {
    content: clone(readJson(path.join(branchRoot, "content.json"))),
    assets: clone(readJson(path.join(branchRoot, "asset-manifest.json"))),
    prompts: clone(readJson(path.join(branchRoot, "image-prompts.json")))
  };
}

export const contentFactorySourceV1 = Object.freeze({
  version: CONTENT_LIBRARY_PUBLIC_VERSION,
  listBranches: listBranchesV1,
  resolveBranchSlug: resolveBranchSlugV1,
  getBranchDefinition: getBranchDefinitionV1
});
