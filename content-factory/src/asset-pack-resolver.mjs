import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT_FACTORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKS_ROOT = path.join(CONTENT_FACTORY_ROOT, "assets", "packs");
const PUBLIC_PACKS_ROOT = path.resolve(CONTENT_FACTORY_ROOT, "..", "public", "assets", "content-factory", "packs");
const REGISTRY_PATH = path.join(PACKS_ROOT, "registry.json");
const SELECTION_ENVIRONMENT_VARIABLE = "CONTENT_FACTORY_ASSET_PACK";
const DEFAULT_PACK_ID = "priority-assets-2026.1";
const FALLBACK = "existing_v1_v2_asset_resolution";
const MATCH_FIELDS = ["specialization", "visual_style", "personality", "theme"];
const DEFAULT_COUNTS_BY_SLOT = Object.freeze({ hero: 1, service: 2, about_team: 1, detail_ambiance: 1 });

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function checksumBuffer(buffer) {
  return `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
}

export function isSafePackRelativePath(value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) return false;
  const posixValue = value.replaceAll("\\", "/");
  const normalized = path.posix.normalize(posixValue);
  return normalized === posixValue && !normalized.startsWith("../") && !normalized.includes("/../");
}

function resolveInside(root, relativePath) {
  if (!isSafePackRelativePath(relativePath)) return null;
  const absolute = path.resolve(root, relativePath);
  return absolute.startsWith(`${path.resolve(root)}${path.sep}`) ? absolute : null;
}

export function validatePackManifest(manifest, { packRoot, verifyFiles = true } = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return { valid: false, errors: ["manifest_not_object"] };
  if (manifest.schema_version !== "content-factory-asset-pack-v1") errors.push("schema_version");
  if (manifest.pack_id !== "priority-assets-2026.1") errors.push("pack_id");
  if (manifest.pack_status !== "inactive" || manifest.default_active !== false) errors.push("pack_activation_state");
  if (manifest.publication_status !== "staged") errors.push("pack_publication_status");
  if (manifest.review?.status !== "approved" || manifest.review?.reviewed_by !== "Max") errors.push("pack_review_state");
  if (manifest.asset_count !== 60 || manifest.assets?.length !== 60) errors.push("asset_count");
  if (manifest.selection?.environment_variable !== SELECTION_ENVIRONMENT_VARIABLE || manifest.selection?.required_value !== manifest.pack_id || manifest.selection?.default_selected !== false || manifest.selection?.public_request_override !== false) errors.push("selection_contract");

  const ids = new Set();
  const checksums = new Set();
  const paths = new Set();
  for (const asset of manifest.assets || []) {
    if (asset.pack_id !== manifest.pack_id) errors.push(`${asset.asset_id}:pack_id`);
    if (asset.asset_id !== asset.candidate_id || !asset.asset_id) errors.push(`${asset.asset_id || "unknown"}:asset_id`);
    if (ids.has(asset.asset_id)) errors.push(`${asset.asset_id}:duplicate_id`); ids.add(asset.asset_id);
    if (checksums.has(asset.checksum)) errors.push(`${asset.asset_id}:duplicate_checksum`); checksums.add(asset.checksum);
    if (paths.has(asset.file_path)) errors.push(`${asset.asset_id}:duplicate_path`); paths.add(asset.file_path);
    if (!/^sha256:[a-f0-9]{64}$/.test(asset.checksum || "")) errors.push(`${asset.asset_id}:checksum_format`);
    if (!isSafePackRelativePath(asset.file_path) || !asset.file_path.startsWith(`assets/${asset.branch}/${asset.asset_slot}/`)) errors.push(`${asset.asset_id}:unsafe_path`);
    if (asset.review_status !== "approved" || asset.reviewed_by !== "Max") errors.push(`${asset.asset_id}:review_state`);
    if (asset.publication_status !== "staged" || asset.active !== false || asset.published !== false) errors.push(`${asset.asset_id}:publication_state`);
    if (asset.source_type !== "ai_generated_visual") errors.push(`${asset.asset_id}:source_type`);
    if (verifyFiles) {
      const absolute = packRoot ? resolveInside(packRoot, asset.file_path) : null;
      if (!absolute || !fs.existsSync(absolute)) errors.push(`${asset.asset_id}:missing_file`);
      else if (checksumBuffer(fs.readFileSync(absolute)) !== asset.checksum) errors.push(`${asset.asset_id}:checksum_mismatch`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    stats: { assets: manifest.assets?.length || 0, unique_ids: ids.size, unique_checksums: checksums.size, unique_paths: paths.size },
  };
}

function safeFallback(reason, requestedPack = null) {
  return {
    selected: false,
    requested_pack: requestedPack,
    pack_id: null,
    reason,
    fallback: FALLBACK,
    manifest: null,
  };
}

export function loadSelectedAssetPack({ env = process.env, verifyFiles = true } = {}) {
  const configuredPack = String(env?.[SELECTION_ENVIRONMENT_VARIABLE] || "").trim();
  const requestedPack = configuredPack || DEFAULT_PACK_ID;

  const registry = readJson(REGISTRY_PATH);
  if (registry.default_pack !== DEFAULT_PACK_ID || registry.public_request_override !== false) return safeFallback("registry_safety_contract_failed", requestedPack);
  const entry = registry.packs.find((pack) => pack.pack_id === requestedPack);
  if (!entry) return safeFallback("unknown_pack", requestedPack);
  if (entry.status !== "inactive" || entry.default_active !== false) return safeFallback("registry_pack_state_failed", requestedPack);

  const manifestPath = resolveInside(PACKS_ROOT, entry.manifest_path);
  if (!manifestPath || !fs.existsSync(manifestPath)) return safeFallback("manifest_path_failed", requestedPack);
  const manifestBytes = fs.readFileSync(manifestPath);
  if (checksumBuffer(manifestBytes) !== entry.manifest_checksum) return safeFallback("manifest_integrity_failed", requestedPack);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    return safeFallback("manifest_json_failed", requestedPack);
  }
  const packRoot = verifyFiles ? path.join(PUBLIC_PACKS_ROOT, manifest.pack_id) : path.dirname(manifestPath);
  const validation = validatePackManifest(manifest, { packRoot, verifyFiles });
  if (!validation.valid) return { ...safeFallback("manifest_validation_failed", requestedPack), validation };
  return { selected: true, requested_pack: requestedPack, pack_id: manifest.pack_id, reason: configuredPack ? "explicit_internal_feature_flag" : "website_factory_default", fallback: null, manifest, pack_root: packRoot, validation };
}

function deterministicOrder(items, seed, key) {
  const sorted = [...items].sort((left, right) => left.asset_id.localeCompare(right.asset_id));
  if (!sorted.length) return sorted;
  const digest = crypto.createHash("sha256").update(`${seed}:${key}`).digest();
  const offset = digest.readUInt32BE(0) % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

function candidatesForSlot(assets, criteria, slot) {
  const sameBranchSlot = assets.filter((asset) => asset.branch === criteria.branch && asset.asset_slot === slot);
  if (!sameBranchSlot.length) return { candidates: [], reason: "no_same_branch_slot_match", matched_fields: ["branch", "asset_slot"] };

  const specified = MATCH_FIELDS.filter((field) => criteria[field]);
  const exact = sameBranchSlot.filter((asset) => specified.every((field) => asset[field] === criteria[field]));
  if (exact.length) return { candidates: exact, reason: specified.length ? "exact_combination" : "exact_branch_slot", matched_fields: ["branch", "asset_slot", ...specified] };

  if (criteria.specialization) {
    const specialization = sameBranchSlot.filter((asset) => asset.specialization === criteria.specialization);
    if (specialization.length) return { candidates: specialization, reason: "same_branch_slot_specialization_fallback", matched_fields: ["branch", "asset_slot", "specialization"] };
  }

  return { candidates: sameBranchSlot, reason: "same_branch_slot_safe_fallback", matched_fields: ["branch", "asset_slot"] };
}

export function resolveAssetPackAssets(criteria, { env = process.env, seed = 0, countsBySlot = DEFAULT_COUNTS_BY_SLOT } = {}) {
  if (!criteria?.branch || typeof criteria.branch !== "string") return { ...safeFallback("branch_required"), selections: [] };
  const loaded = loadSelectedAssetPack({ env, verifyFiles: false });
  if (!loaded.selected) return { ...loaded, selections: [] };

  const requestedSlots = criteria.asset_slot ? [criteria.asset_slot] : Object.keys(countsBySlot);
  const selections = [];
  for (const slot of requestedSlots) {
    const count = Math.max(0, Number(countsBySlot[slot] ?? 1));
    const match = candidatesForSlot(loaded.manifest.assets, criteria, slot);
    if (!match.candidates.length) {
      selections.push({ asset_slot: slot, assets: [], match_reason: match.reason, matched_fields: match.matched_fields, fallback: FALLBACK });
      continue;
    }
    const chosen = deterministicOrder(match.candidates, seed, `${criteria.branch}:${slot}`).slice(0, count).map((asset) => ({
      ...asset,
      public_path: `/assets/content-factory/packs/${loaded.pack_id}/${asset.file_path}`,
      mime_type: "image/png",
    }));
    selections.push({ asset_slot: slot, assets: chosen, match_reason: match.reason, matched_fields: match.matched_fields, fallback: null });
  }

  const selectedAssets = selections.flatMap((selection) => selection.assets);
  return {
    selected: selectedAssets.length > 0,
    requested_pack: loaded.requested_pack,
    pack_id: loaded.pack_id,
    reason: loaded.reason,
    fallback: selectedAssets.length ? null : FALLBACK,
    selections,
  };
}

export const assetPackResolverContract = Object.freeze({
  environment_variable: SELECTION_ENVIRONMENT_VARIABLE,
  default_pack: DEFAULT_PACK_ID,
  public_request_override: false,
  unknown_pack_fallback: FALLBACK,
  default_counts_by_slot: DEFAULT_COUNTS_BY_SLOT,
});
