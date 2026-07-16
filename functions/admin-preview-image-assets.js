const { createHmac, randomUUID, timingSafeEqual } = require("crypto");
const fs = require("fs");
const path = require("path");
const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { resolvePreviewScope, UUID } = require("./_preview-editor-access");
const { extractImageContext } = require("./_preview-editor-image");
const { IMAGE_ALLOWED_MIME_TYPES, IMAGE_SLOT_ID } = require("./_preview-editor-image-schema");
const { demoImageGroups } = require("./_demo-image-assets");
const { validateImageBytes, validateImageMetadata } = require("./_relationship-image-validation");

const BUCKET = "relationship-assets";
const ROLES = ["super_admin", "admin", "sales_manager"];
const SOURCE_TYPES = new Set(["upload", "brand_center", "content_library", "website_asset"]);
const ALLOWED_STATUSES = new Set(["approved", "active"]);
const UPLOAD_TTL_SECONDS = 2 * 60 * 60;
const ASSET_ROOT = path.resolve(__dirname, "..", "public", "assets", "demo-images", "library");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  const requestId = clean(event.headers?.["x-nf-request-id"] || event.headers?.["X-Nf-Request-Id"] || randomUUID());
  const auth = await verifyAdmin(event, json, { module: "preview_image_assets", action: event.httpMethod === "GET" ? "read" : "upload", allowedRoles: ROLES, allowedStatuses: ["active"] });
  if (!auth.success) return auth.response;
  let input = {};
  try {
    const context = config();
    input = event.httpMethod === "GET" ? Object.fromEntries(queryParams(event)) : parseBody(event.body);
    const scope = await resolveScope(context, input);
    if (event.httpMethod === "GET") {
      if (clean(input.action) === "blob") return await assetBlob(context, scope, input);
      return await listSources(context, scope);
    }
    if (event.httpMethod !== "POST") throw assetError("METHOD_NOT_ALLOWED", "Methode niet toegestaan.", 405, "route_request");
    if (input.action === "prepare_upload") return await prepareUpload(context, scope, auth.admin, input);
    if (input.action === "finalize_upload") return await finalizeUpload(context, scope, auth.admin, input);
    throw assetError("ACTION_INVALID", "Onbekende image-assetactie.", 400, "route_action");
  } catch (error) {
    console.error("Admin preview image asset failed", {
      requestId,
      phase: error.phase || "preview_image_assets",
      code: error.code || "PREVIEW_IMAGE_ASSET_FAILED",
      errorName: error.name || "Error",
      errorMessage: error.message || "Unknown image asset error",
      databaseCode: error.databaseCode || "",
      databaseMessage: error.databaseMessage || "",
      details: error.details || "",
      hint: error.hint || "",
      previewVersionId: clean(input.previewVersionId),
      sourceType: clean(input.sourceType),
    });
    return fail(error.status || 500, error.code || "PREVIEW_IMAGE_ASSET_FAILED", error.code ? error.message : "De afbeeldingsbron kon niet veilig worden verwerkt.", error.phase || "preview_image_assets", requestId);
  }
};

async function listSources(context, scope) {
  const relationshipAssets = await listRelationshipAssets(context, scope.relationship);
  const contentLibrary = listContentLibraryAssets();
  const current = await extractImageContext(scope.version.generated_package).catch(() => null);
  return json(200, {
    success: true,
    assetSlotId: IMAGE_SLOT_ID,
    current: current ? { ...current.image, schema: current.schema } : null,
    sources: {
      upload: relationshipAssets.map((asset) => publicAsset(asset, "upload")),
      brandCenter: relationshipAssets.filter(isBrandAsset).map((asset) => publicAsset(asset, "brand_center")),
      contentLibrary,
      currentWebsite: {
        available: relationshipAssets.some(isWebsiteAsset),
        message: relationshipAssets.some(isWebsiteAsset) ? "Veilig opgeslagen websitebeelden." : "Er zijn nog geen veilig opgeslagen websitebeelden beschikbaar.",
        assets: relationshipAssets.filter(isWebsiteAsset).map((asset) => publicAsset(asset, "website_asset")),
      },
      ai: { enabled: false, message: "AI-afbeeldingen zijn nog niet geconfigureerd." },
    },
  });
}

async function prepareUpload(context, scope, admin, input) {
  const metadata = validateImageMetadata(input);
  if (input.usageRightsConfirmed !== true) throw assetError("IMAGE_RIGHTS_REQUIRED", "Bevestig dat deze afbeelding gebruikt mag worden.", 400, "validate_usage_rights");
  const assetId = randomUUID();
  const storagePath = `${scope.relationship.id}/${assetId}/${safeFilename(metadata.filename, metadata.extension)}`;
  const uploadUrl = await createSignedUploadUrl(context, storagePath);
  const uploadId = sealUpload({
    version: 1,
    actorId: admin.id,
    previewVersionId: scope.version.id,
    relationshipType: scope.relationship.type,
    relationshipId: scope.relationship.id,
    assetId,
    storagePath,
    ...metadata,
    exp: Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS,
  }, context.uploadSecret);
  return json(200, { success: true, uploadUrl, uploadId, asset: { id: assetId, name: metadata.filename, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes, status: "uploading", sourceType: "upload" } });
}

async function finalizeUpload(context, scope, admin, input) {
  const prepared = openUpload(input.uploadId, context.uploadSecret);
  if (prepared.actorId !== admin.id || prepared.previewVersionId !== scope.version.id || prepared.relationshipType !== scope.relationship.type || prepared.relationshipId !== scope.relationship.id) {
    throw assetError("UPLOAD_SCOPE_MISMATCH", "De upload hoort niet bij deze previewcontext.", 409, "validate_upload_scope");
  }
  const stored = await storageDownload(context, prepared.storagePath);
  let validated;
  try {
    validated = validateImageBytes(stored.bytes, { filename: prepared.filename, mimeType: prepared.mimeType, declaredSize: prepared.sizeBytes, requireHeroMinimum: true, rejectExif: true });
  } catch (error) {
    await storageRemoveBestEffort(context, prepared.storagePath);
    throw error;
  }
  const duplicate = await findDuplicate(context, scope.relationship, validated.checksum);
  if (duplicate?.id) {
    await storageRemoveBestEffort(context, prepared.storagePath);
    return json(200, { success: true, duplicate: true, asset: publicAsset(duplicate, "upload") });
  }
  const now = new Date().toISOString();
  const record = {
    id: prepared.assetId,
    customer_id: scope.relationship.type === "customer" ? scope.relationship.id : null,
    lead_id: scope.relationship.type === "lead" ? scope.relationship.id : null,
    uploaded_by_auth_user_id: admin.id,
    uploaded_by_type: "admin",
    source_module: "website_factory",
    name: prepared.filename,
    original_filename: prepared.filename,
    file_type: validated.extension,
    category: "photo",
    location: BUCKET,
    storage_path: prepared.storagePath,
    mime_type: validated.mimeType,
    size_bytes: validated.sizeBytes,
    checksum: validated.checksum,
    status: "approved",
    usage_rights_confirmed: true,
    is_primary: false,
    is_client_visible: false,
    metadata: { width: validated.width, height: validated.height, aspectRatio: validated.aspectRatio, animated: false, exifRejected: true, uploadState: "ready", assetSlotId: IMAGE_SLOT_ID },
    created_at: now,
    updated_at: now,
  };
  let inserted;
  try {
    inserted = (await rest(context, "files", { method: "POST", body: JSON.stringify(record), headers: { Prefer: "return=representation" }, phase: "insert_image_asset" }))[0] || record;
  } catch (error) {
    const recovered = await readAsset(context, scope.relationship, prepared.assetId).catch(() => null);
    if (recovered?.id) inserted = recovered;
    else {
      const raced = await findDuplicate(context, scope.relationship, validated.checksum).catch(() => null);
      if (raced?.id) { await storageRemoveBestEffort(context, prepared.storagePath); inserted = raced; }
      else { await storageRemoveBestEffort(context, prepared.storagePath); throw error; }
    }
  }
  return json(201, { success: true, duplicate: inserted.id !== prepared.assetId, asset: publicAsset(inserted, "upload") });
}

async function assetBlob(context, scope, input) {
  const asset = await resolveImageAsset(context, scope, { sourceType: input.sourceType, sourceAssetId: input.assetId || input.sourceAssetId });
  return {
    statusCode: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.bytes.length),
      "Content-Disposition": `inline; filename="${safeHeaderFilename(asset.filename)}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders({ methods: "GET, POST, OPTIONS" }),
    },
    isBase64Encoded: true,
    body: asset.bytes.toString("base64"),
  };
}

async function resolveImageAsset(context, scope, selection = {}) {
  const sourceType = clean(selection.sourceType);
  const sourceAssetId = clean(selection.sourceAssetId || selection.assetId);
  if (!SOURCE_TYPES.has(sourceType) || !sourceAssetId) throw assetError("IMAGE_SOURCE_INVALID", "Kies een geldige afbeeldingsbron.", 400, "resolve_image_source");
  if (sourceType === "content_library") return resolveContentLibraryAsset(sourceAssetId);
  if (!UUID.test(sourceAssetId)) throw assetError("IMAGE_ASSET_INVALID", "Kies een geldige relatie-asset.", 400, "resolve_image_source");
  const row = await readAsset(context, scope.relationship, sourceAssetId);
  if (!row?.id || !row.storage_path) throw assetError("IMAGE_ASSET_NOT_FOUND", "De gekozen afbeelding is niet beschikbaar.", 404, "resolve_image_source");
  assertEligibleRelationshipAsset(row, sourceType);
  const stored = await storageDownload(context, row.storage_path);
  const validated = validateImageBytes(stored.bytes, { filename: row.original_filename || row.name, mimeType: row.mime_type, declaredSize: Number(row.size_bytes), requireHeroMinimum: true, rejectExif: true });
  if (row.checksum && row.checksum !== validated.checksum) throw assetError("IMAGE_HASH_MISMATCH", "De opgeslagen asset komt niet meer overeen met zijn registratie.", 409, "validate_source_asset");
  return {
    id: row.id,
    sourceType,
    origin: sourceType,
    filename: clean(row.original_filename || row.name),
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
    checksum: validated.checksum,
    width: validated.width,
    height: validated.height,
    aspectRatio: validated.aspectRatio,
    bytes: stored.bytes,
  };
}

function resolveContentLibraryAsset(assetId) {
  const item = contentLibraryItems().find((candidate) => candidate.id === assetId);
  if (!item) throw assetError("CONTENT_LIBRARY_ASSET_INVALID", "Deze Content Library-afbeelding staat niet in de serverallowlist.", 404, "resolve_content_library");
  const absolute = safeCatalogPath(item.src);
  const bytes = fs.readFileSync(absolute);
  const validated = validateImageBytes(bytes, { filename: path.basename(absolute), mimeType: mimeForPath(absolute), declaredSize: bytes.length, requireHeroMinimum: true, rejectExif: true });
  return { id: item.id, sourceType: "content_library", origin: "server_allowlist", filename: path.basename(absolute), bytes, ...validated };
}

async function resolveScope(context, input) {
  return resolvePreviewScope({ readOne: (table, query) => readOne(context, table, query) }, input, { sectionId: "home.hero" });
}

async function listRelationshipAssets(context, relationship) {
  const column = relationship.type === "customer" ? "customer_id" : "lead_id";
  const rows = await rest(context, `files?select=*&${column}=eq.${encodeURIComponent(relationship.id)}&status=in.(approved,active)&mime_type=in.(image/jpeg,image/png,image/webp)&order=created_at.desc&limit=200`, { phase: "list_relationship_images" });
  return (rows || []).filter((row) => {
    try { assertEligibleRelationshipAsset(row, "upload"); return true; } catch { return false; }
  });
}

function assertEligibleRelationshipAsset(row, sourceType) {
  const metadata = object(row.metadata);
  if (!ALLOWED_STATUSES.has(clean(row.status).toLowerCase())) throw assetError("IMAGE_ASSET_STATUS_INVALID", "Deze asset is niet actief of goedgekeurd.", 409, "validate_asset_status");
  if (row.usage_rights_confirmed !== true) throw assetError("IMAGE_RIGHTS_REQUIRED", "Voor deze asset zijn geen geldige gebruiksrechten bevestigd.", 409, "validate_usage_rights");
  if (!IMAGE_ALLOWED_MIME_TYPES.includes(clean(row.mime_type).toLowerCase())) throw assetError("IMAGE_TYPE_UNSUPPORTED", "Deze asset heeft geen ondersteund afbeeldingstype.", 400, "validate_asset_type");
  if (sourceType === "brand_center" && !isBrandAsset(row)) throw assetError("IMAGE_SOURCE_INVALID", "Deze asset is niet als Brand Center-asset geregistreerd.", 409, "validate_asset_source");
  if (sourceType === "website_asset" && !isWebsiteAsset(row)) throw assetError("IMAGE_SOURCE_INVALID", "Deze asset is niet veilig als websitebeeld opgeslagen.", 409, "validate_asset_source");
  if (!metadata || typeof metadata !== "object") throw assetError("IMAGE_METADATA_INVALID", "De assetmetadata is ongeldig.", 409, "validate_asset_metadata");
}

function publicAsset(row, sourceType) {
  const metadata = object(row.metadata);
  return {
    id: clean(row.id),
    sourceType,
    name: clean(row.original_filename || row.name) || "Afbeelding",
    mimeType: clean(row.mime_type).toLowerCase(),
    sizeBytes: Number(row.size_bytes || 0),
    width: Number(metadata.width || 0),
    height: Number(metadata.height || 0),
    aspectRatio: Number(metadata.aspectRatio || (metadata.width && metadata.height ? metadata.width / metadata.height : 0)),
    status: clean(row.status),
    source: sourceType === "brand_center" ? "Brand Center" : sourceType === "website_asset" ? "Huidige website" : "Upload",
  };
}

function listContentLibraryAssets() {
  return contentLibraryItems().flatMap((item) => {
    try {
      const resolved = resolveContentLibraryAsset(item.id);
      return [{ id: item.id, sourceType: "content_library", name: item.name, niche: item.niche, role: item.role, mimeType: resolved.mimeType, sizeBytes: resolved.sizeBytes, width: resolved.width, height: resolved.height, aspectRatio: resolved.aspectRatio, source: "Content Library" }];
    } catch { return []; }
  });
}

function contentLibraryItems() {
  const seen = new Set();
  return demoImageGroups.flatMap((group) => {
    const asset = group.assets?.hero;
    if (!asset?.slug || !asset?.src || seen.has(asset.slug)) return [];
    seen.add(asset.slug);
    return [{ id: asset.slug, name: `${group.label} — Hero`, niche: group.label, role: "hero", src: asset.src }];
  });
}

function isBrandAsset(row) { const metadata = object(row.metadata); return Boolean(metadata.usedInBranding || clean(metadata.brandingRole)); }
function isWebsiteAsset(row) { const metadata = object(row.metadata); return Boolean(metadata.usedForWebsite || clean(metadata.websiteRole) || clean(row.source_module) === "website_import"); }

async function readAsset(context, relationship, id) {
  const column = relationship.type === "customer" ? "customer_id" : "lead_id";
  return readOne(context, "files", `select=*&id=eq.${encodeURIComponent(id)}&${column}=eq.${encodeURIComponent(relationship.id)}&limit=1`);
}

async function findDuplicate(context, relationship, checksum) {
  const column = relationship.type === "customer" ? "customer_id" : "lead_id";
  return readOne(context, "files", `select=*&${column}=eq.${encodeURIComponent(relationship.id)}&checksum=eq.${encodeURIComponent(checksum)}&status=neq.archived&limit=1`);
}

async function createSignedUploadUrl(context, storagePath) {
  const response = await fetch(`${context.supabaseUrl}/storage/v1/object/upload/sign/${BUCKET}/${encodeStoragePath(storagePath)}`, { method: "POST", headers: serviceHeaders(context), body: "{}" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw upstream("SIGNED_UPLOAD_FAILED", "Uploaden is tijdelijk niet beschikbaar.", 502, "create_signed_upload", response, body);
  const value = clean(body?.url || body?.signedURL || body?.signedUrl);
  const url = resolveStorageUrl(context.supabaseUrl, value, `/storage/v1/object/upload/sign/${BUCKET}/`);
  if (!url) throw assetError("SIGNED_UPLOAD_FAILED", "De veilige upload-URL kon niet worden gemaakt.", 502, "create_signed_upload");
  return url;
}

async function storageDownload(context, storagePath) {
  const response = await fetch(`${context.supabaseUrl}/storage/v1/object/${BUCKET}/${encodeStoragePath(storagePath)}`, { headers: serviceHeaders(context, { Accept: "application/octet-stream" }) });
  if (!response.ok) throw upstream("STORAGE_READ_FAILED", "De opgeslagen afbeelding kon niet worden gelezen.", response.status === 404 ? 409 : 502, "read_storage_image", response, await response.json().catch(() => null));
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 8 * 1024 * 1024) throw assetError("IMAGE_TOO_LARGE", "De afbeelding is groter dan 8 MiB.", 413, "read_storage_image");
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: clean(response.headers.get("content-type")) };
}

async function storageRemoveBestEffort(context, storagePath) {
  try {
    await fetch(`${context.supabaseUrl}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: serviceHeaders(context), body: JSON.stringify({ prefixes: [storagePath] }) });
  } catch (error) { console.warn("Preview image orphan cleanup skipped", { phase: "cleanup_upload", errorMessage: error.message || "unknown" }); }
}

function sealUpload(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `v1.${body}.${createHmac("sha256", secret).update(`v1.${body}`).digest("base64url")}`;
}

function openUpload(value, secret) {
  try {
    const [version, body, signature] = clean(value).split(".");
    if (version !== "v1" || !body || !signature) throw new Error("invalid envelope");
    const expected = createHmac("sha256", secret).update(`${version}.${body}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("invalid signature");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.version !== 1 || !Number.isSafeInteger(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired upload");
    return payload;
  } catch { throw assetError("UPLOAD_INVALID", "De uploadcontext is ongeldig of verlopen. Kies het bestand opnieuw.", 400, "validate_upload_token"); }
}

async function readOne(context, table, query) { return (await rest(context, `${table}?${query}`, { phase: `read_${table}` }))[0] || null; }
async function rest(context, resource, options = {}) {
  const { phase = "database", headers = {}, ...request } = options;
  const response = await fetch(`${context.supabaseUrl}/rest/v1/${resource}`, { ...request, headers: serviceHeaders(context, headers) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw upstream("PREVIEW_IMAGE_DATABASE_FAILED", "De afbeeldingsgegevens konden niet worden verwerkt.", response.status >= 500 ? 502 : 500, phase, response, body);
  return Array.isArray(body) ? body : [];
}

function safeCatalogPath(src) {
  if (!clean(src).startsWith("/assets/demo-images/library/")) throw assetError("CONTENT_LIBRARY_ASSET_INVALID", "Ongeldig cataloguspad.", 400, "resolve_content_library");
  const absolute = path.resolve(__dirname, "..", "public", src.replace(/^\//, ""));
  if (!absolute.startsWith(`${ASSET_ROOT}${path.sep}`) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw assetError("CONTENT_LIBRARY_ASSET_MISSING", "De catalogusafbeelding bestaat niet meer.", 404, "resolve_content_library");
  return absolute;
}

function config() {
  const supabaseUrl = clean(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const uploadSecret = clean(process.env.RELATIONSHIP_ASSET_UPLOAD_SECRET) || serviceRoleKey;
  if (!supabaseUrl || !serviceRoleKey || !uploadSecret) throw assetError("PREVIEW_IMAGE_ASSETS_UNAVAILABLE", "De image-assetservice is nog niet geconfigureerd.", 503, "configure_assets");
  return { supabaseUrl, serviceRoleKey, uploadSecret };
}

function serviceHeaders(context, extra = {}) { return { apikey: context.serviceRoleKey, Authorization: `Bearer ${context.serviceRoleKey}`, Accept: "application/json", "Content-Type": "application/json", ...extra }; }
function resolveStorageUrl(base, value, prefix) { try { const url = /^https?:/i.test(value) ? new URL(value) : new URL(`${base}/storage/v1${value.startsWith("/") ? value : `/${value}`}`); return url.origin === new URL(base).origin && url.pathname.startsWith(prefix) ? url.toString() : ""; } catch { return ""; } }
function encodeStoragePath(value) { return clean(value).split("/").map(encodeURIComponent).join("/"); }
function safeFilename(filename, extension) { const stem = clean(filename).replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "hero-image"; return `${stem}.${extension}`; }
function safeHeaderFilename(value) { return clean(value || "afbeelding").replace(/[\u0000-\u001f\u007f"\\/]/g, "-").slice(0, 180) || "afbeelding"; }
function mimeForPath(value) { const lower = clean(value).toLowerCase(); if (/\.jpe?g$/.test(lower)) return "image/jpeg"; if (lower.endsWith(".png")) return "image/png"; if (lower.endsWith(".webp")) return "image/webp"; return ""; }
function object(value) { if (value && typeof value === "object" && !Array.isArray(value)) return value; try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function parseBody(body) { try { const value = JSON.parse(body || "{}"); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; } catch { throw assetError("INVALID_JSON", "De aanvraag bevat ongeldige JSON.", 400, "parse_request"); } }
function queryParams(event) { if (event.rawQuery) return new URLSearchParams(event.rawQuery); const params = new URLSearchParams(); Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => { if (value != null) params.set(key, value); }); return params; }
function upstream(code, message, status, phase, response, body) { return Object.assign(new Error(message), { code, status, phase, databaseCode: clean(body?.code), databaseMessage: clean(body?.message || body?.error), details: clean(body?.details), hint: clean(body?.hint), upstreamStatus: response?.status }); }
function assetError(code, message, status = 400, phase = "preview_image_assets") { return Object.assign(new Error(message), { code, status, phase }); }
function clean(value) { return String(value ?? "").trim(); }
function fail(status, code, message, phase, requestId) { return json(status, { success: false, code, phase, message, requestId }); }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", ...corsHeaders({ methods: "GET, POST, OPTIONS" }) }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = {
  ALLOWED_STATUSES,
  SOURCE_TYPES,
  assertEligibleRelationshipAsset,
  contentLibraryItems,
  isBrandAsset,
  isWebsiteAsset,
  listContentLibraryAssets,
  openUpload,
  publicAsset,
  resolveContentLibraryAsset,
  resolveImageAsset,
  sealUpload,
};
