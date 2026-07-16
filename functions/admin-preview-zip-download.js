const { randomUUID } = require("crypto");
const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { UUID, assertRequestedScope, assertStoredRelations } = require("./_preview-editor-access");
const {
  SOURCE_VALUES,
  createCompressedZip,
  normalizePreviewSource,
  packageContentHash,
  preparePreviewPackage,
  previewSourceForVersion,
  zipError,
} = require("./_preview-zip");

const ROLES = ["super_admin", "admin", "sales_manager"];
const BUCKET = "preview-zips";
const SIGNED_URL_SECONDS = 300;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  const requestId = text(event.headers?.["x-nf-request-id"] || event.headers?.["X-Nf-Request-Id"] || randomUUID());
  const auth = await verifyAdmin(event, json, { module: "preview_zip_download", action: "prepare", allowedRoles: ROLES, allowedStatuses: ["active"] });
  if (!auth.success) return auth.response;
  let input = {};
  try {
    if (event.httpMethod !== "POST") throw zipError("METHOD_NOT_ALLOWED", "Methode niet toegestaan.", 405, "route_request");
    input = JSON.parse(event.body || "{}");
    if (text(input.action || "prepare") !== "prepare") throw zipError("ZIP_ACTION_INVALID", "Onbekende ZIP-downloadactie.", 400, "route_action");
    const previewVersionId = uuid(input.previewVersionId || input.preview_version_id);
    if (!previewVersionId) throw zipError("PREVIEW_VERSION_REQUIRED", "Selecteer eerst een geldige previewversie.", 400, "validate_preview_version");
    const context = config();
    const version = await readOne(context, "website_preview_versions", `select=*&id=eq.${encodeURIComponent(previewVersionId)}&limit=1`);
    if (!version?.id) throw zipError("PREVIEW_VERSION_NOT_FOUND", "De previewversie kon niet worden gevonden.", 404, "resolve_preview_version");
    const journey = version.demo_journey_id
      ? await readOne(context, "demo_journeys", `select=*&id=eq.${encodeURIComponent(version.demo_journey_id)}&limit=1`)
      : { customer_id: version.customer_id || null, business_name: version.title || "" };
    if (version.demo_journey_id && !journey?.id) throw zipError("PREVIEW_SCOPE_INVALID", "De preview hoort niet bij een geldige klantreis.", 409, "resolve_journey");
    if (!version.demo_journey_id && !version.customer_id) throw zipError("PREVIEW_SCOPE_INVALID", "De preview heeft geen geldige relatiecontext.", 409, "resolve_journey");
    assertRequestedScope(version, journey, input);
    await assertStoredRelations({ readOne: (table, query) => readOne(context, table, query) }, version, journey);
    if (!version.customer_id && journey.lead_id) {
      const lead = await readOne(context, "leads", `select=id&id=eq.${encodeURIComponent(journey.lead_id)}&limit=1`);
      if (!lead?.id) throw zipError("PREVIEW_SCOPE_INVALID", "De relatie van deze preview bestaat niet meer.", 409, "validate_relations");
    }
    const source = previewSourceForVersion(version);
    if (!SOURCE_VALUES.has(source)) throw zipError("PREVIEW_SOURCE_INVALID", "Deze previewversie heeft geen ondersteunde downloadbron.", 409, "validate_preview_source");
    const requestedSource = normalizePreviewSource(input.source);
    if (input.source && !requestedSource) throw zipError("PREVIEW_SOURCE_INVALID", "Gebruik factory of manual_zip als previewbron.", 400, "validate_preview_source");
    if (requestedSource && requestedSource !== source) throw zipError("PREVIEW_SOURCE_MISMATCH", "De gekozen previewbron hoort niet bij deze previewversie.", 409, "validate_preview_source");
    const prepared = preparePreviewPackage(version.generated_package);
    await validateStorageBucket(context);
    const contentHash = packageContentHash(prepared, source);
    const storagePath = `${previewVersionId}/${contentHash}.zip`;
    const existing = await storageHead(context, storagePath);
    let zipBytes = existing.size;
    let reused = existing.exists;
    if (!existing.exists) {
      const zip = createCompressedZip(prepared);
      zipBytes = zip.zipBytes;
      reused = await storageUpload(context, storagePath, zip.bytes);
    }
    const signedUrl = await createSignedUrl(context, storagePath, filenameFor(version, journey));
    return json(200, {
      success: true,
      status: "ready",
      previewVersionId,
      source,
      contentHash,
      fileCount: prepared.fileCount,
      unpackedBytes: prepared.unpackedBytes,
      zipBytes,
      downloadReady: true,
      reused,
      signedUrl,
      expiresIn: SIGNED_URL_SECONDS,
      storage: { bucket: context.bucket, path: storagePath },
    });
  } catch (error) {
    console.error("Admin preview ZIP preparation failed", {
      requestId,
      phase: error.phase || "prepare_preview_zip",
      code: error.code || "PREVIEW_ZIP_PREPARE_FAILED",
      errorName: error.name || "Error",
      errorMessage: error.message || "Unknown ZIP preparation error",
      previewVersionId: text(input.previewVersionId || input.preview_version_id),
    });
    return json(error.status || 500, { success: false, status: "failed", code: error.code || "PREVIEW_ZIP_PREPARE_FAILED", error: error.code ? error.message : "De ZIP kon niet veilig worden voorbereid.", details: error.phase || "prepare_preview_zip", requestId });
  }
};

function config() {
  const supabaseUrl = text(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const bucket = text(process.env.PREVIEW_ZIP_STORAGE_BUCKET || BUCKET);
  if (!supabaseUrl || !serviceRoleKey || !bucket) throw zipError("PREVIEW_ZIP_STORAGE_UNAVAILABLE", "De private ZIP-opslag is nog niet geconfigureerd.", 500, "configure_storage");
  return { supabaseUrl, serviceRoleKey, bucket };
}

async function validateStorageBucket(context) {
  const response = await fetch(`${context.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(context.bucket)}`, { headers: serviceHeaders(context, { Accept: "application/json" }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw upstream("PREVIEW_ZIP_STORAGE_UNAVAILABLE", "De private ZIP-opslag is nog niet geconfigureerd.", response.status, "validate_storage_bucket");
  if (data?.public !== false) throw zipError("PREVIEW_ZIP_BUCKET_NOT_PRIVATE", "De ZIP-opslag moet privé zijn voordat downloads kunnen worden voorbereid.", 500, "validate_storage_bucket");
}

async function storageHead(context, storagePath) {
  const response = await fetch(storageObjectUrl(context, storagePath), { method: "HEAD", headers: serviceHeaders(context) });
  if (response.ok) return { exists: true, size: numberHeader(response.headers, "content-length") };
  if ([400, 404].includes(response.status)) return { exists: false, size: 0 };
  throw upstream("PREVIEW_ZIP_STORAGE_CHECK_FAILED", "De ZIP-opslag kon niet worden gecontroleerd.", response.status, "check_storage_object");
}

async function storageUpload(context, storagePath, bytes) {
  const response = await fetch(storageObjectUrl(context, storagePath), {
    method: "POST",
    headers: serviceHeaders(context, { "Content-Type": "application/zip", "Cache-Control": "private, max-age=31536000, immutable", "x-upsert": "false" }),
    body: bytes,
  });
  if (response.ok) return false;
  if (response.status === 409) return true;
  throw upstream("PREVIEW_ZIP_STORAGE_UPLOAD_FAILED", "De ZIP kon niet in private opslag worden bewaard.", response.status, "upload_storage_object");
}

async function createSignedUrl(context, storagePath, filename) {
  const response = await fetch(`${context.supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(context.bucket)}/${encodeStoragePath(storagePath)}`, {
    method: "POST",
    headers: serviceHeaders(context, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
  });
  const data = await response.json().catch(() => ({}));
  const value = text(data.signedURL || data.signedUrl || data.url);
  if (!response.ok || !value) throw upstream("PREVIEW_ZIP_SIGN_FAILED", "De tijdelijke downloadlink kon niet worden gemaakt.", response.status, "sign_storage_object");
  const url = resolveSignedUrl(context, value, storagePath);
  url.searchParams.set("download", filename);
  return url.toString();
}

function resolveSignedUrl(context, value, storagePath) {
  const base = new URL(context.supabaseUrl);
  const url = /^https?:/i.test(value) ? new URL(value) : value.startsWith("/storage/v1/") ? new URL(value, base) : new URL(`/storage/v1${value.startsWith("/") ? value : `/${value}`}`, base);
  const expected = `/storage/v1/object/sign/${context.bucket}/${storagePath}`;
  if (url.origin !== base.origin || decodeURIComponent(url.pathname) !== expected) throw zipError("PREVIEW_ZIP_SIGN_INVALID", "De tijdelijke downloadlink is ongeldig.", 502, "validate_signed_url");
  return url;
}

async function readOne(context, table, query) {
  const response = await fetch(`${context.supabaseUrl}/rest/v1/${table}?${query}`, { headers: serviceHeaders(context, { Accept: "application/json" }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw upstream("PREVIEW_ZIP_DATA_FAILED", "De previewgegevens konden niet worden geladen.", response.status, "read_preview_data");
  return Array.isArray(data) ? data[0] || null : null;
}

function storageObjectUrl(context, path) { return `${context.supabaseUrl}/storage/v1/object/${encodeURIComponent(context.bucket)}/${encodeStoragePath(path)}`; }
function encodeStoragePath(path) { return String(path).split("/").map(encodeURIComponent).join("/"); }
function serviceHeaders(context, extra = {}) { return { apikey: context.serviceRoleKey, Authorization: `Bearer ${context.serviceRoleKey}`, ...extra }; }
function numberHeader(headers, name) { const value = Number(headers?.get?.(name) || 0); return Number.isFinite(value) && value >= 0 ? value : 0; }
function filenameFor(version, journey = {}) { const label = text(journey.business_name || version.title || "website-preview").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "website-preview"; return `${label}-preview-v${Math.max(1, Number(version.version || 1))}.zip`; }
function upstream(code, message, status = 502, phase = "preview_zip") { return zipError(code, message, status >= 500 ? 502 : status, phase); }
function uuid(value) { const clean = text(value); return UUID.test(clean) ? clean : ""; }
function text(value = "") { return String(value || "").trim(); }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...corsHeaders({ methods: "POST, OPTIONS" }) }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { createSignedUrl, filenameFor, resolveSignedUrl, storageHead, storageUpload, validateStorageBucket };
