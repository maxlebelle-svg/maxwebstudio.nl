const crypto = require("crypto");

const BUCKET = "relationship-assets";
const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const EXTENSIONS_BY_MIME = new Map([
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])],
  ["image/webp", new Set(["webp"])],
  ["image/svg+xml", new Set(["svg"])],
  ["video/mp4", new Set(["mp4"])],
  ["video/webm", new Set(["webm"])],
  ["application/pdf", new Set(["pdf"])],
  ["text/plain", new Set(["txt"])],
  ["application/msword", new Set(["doc"])],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set(["docx"])],
]);
const MIME_BY_EXTENSION = new Map(
  [...EXTENSIONS_BY_MIME].flatMap(([mimeType, extensions]) => [...extensions].map((extension) => [extension, mimeType]))
);
const CATEGORIES = new Set(["logo", "photo", "team", "project", "product", "brand", "video", "document", "text", "social", "other"]);

exports.handler = async (event) => {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return response(405, { success: false, code: "INVALID_METHOD", error: "Deze actie wordt niet ondersteund." });
  }

  try {
    const context = config();
    const token = bearer(event);
    if (!token) return response(401, { success: false, code: "AUTH_REQUIRED", error: "Log opnieuw in." });

    const user = await authUser(context, token);
    const customer = await ownedCustomer(context, user.id);
    if (!customer) {
      return response(403, { success: false, code: "FORBIDDEN", error: "Er is geen toegankelijke klantwerkruimte gevonden." });
    }

    if (event.httpMethod === "GET") return await listAssets(context, customer.id);

    const input = parseJsonBody(event.body);
    if (input.action === "prepare") return await prepareUpload(context, customer, input);
    if (input.action === "complete") return await completeUpload(context, user, customer, input);
    if (input.action === "cancel") return await cancelUpload(context, customer, input);
    throw coded("INVALID_ACTION", 400, "Deze uploadactie wordt niet ondersteund.");
  } catch (error) {
    console.error("Client relationship asset failed", {
      code: error.code || "INTERNAL_ERROR",
      message: error.message,
    });
    return response(error.status || 500, {
      success: false,
      code: error.code || "INTERNAL_ERROR",
      error: error.status ? error.message : "Bestanden konden niet veilig worden verwerkt.",
    });
  }
};

async function listAssets(context, customerId) {
  const [assetRows, requestRows] = await Promise.all([
    rest(
      context,
      `files?select=id,customer_id,name,file_type,category,status,is_client_visible,original_filename,mime_type,size_bytes,uploaded_by_type,source_module,usage_rights_confirmed,is_primary,metadata,created_at,updated_at&customer_id=eq.${customerId}&is_client_visible=eq.true&order=created_at.desc`,
      { method: "GET" }
    ),
    rest(
      context,
      `asset_requests?select=id,customer_id,title,instructions,requested_categories,minimum_count,deadline,status,created_at&customer_id=eq.${customerId}&status=in.(open,partial)&order=created_at.desc`,
      { method: "GET" }
    ).catch(() => []),
  ]);
  const assets = (Array.isArray(assetRows) ? assetRows : [])
    .filter((row) => row.customer_id === customerId)
    .map(safeAsset);
  const requests = (Array.isArray(requestRows) ? requestRows : [])
    .filter((row) => row.customer_id === customerId)
    .map(safeRequest);
  return response(200, { success: true, assets, requests });
}

async function prepareUpload(context, customer, input) {
  const metadata = validateMetadata(input);
  const uploadId = crypto.randomUUID();
  const storagePath = storagePathFor(customer.id, uploadId, metadata.name);
  const signedUrl = await createSignedUploadUrl(context, storagePath);
  return response(200, {
    success: true,
    upload: { id: uploadId, url: signedUrl },
    file: { name: metadata.name, mimeType: metadata.mimeType, size: metadata.size },
  });
}

async function completeUpload(context, user, customer, input) {
  const metadata = validateMetadata(input);
  const uploadId = clean(input.uploadId);
  if (!UUID.test(uploadId)) throw coded("INVALID_UPLOAD", 400, "De upload kon niet veilig worden afgerond.");

  const existingUpload = await findAssetById(context, customer.id, uploadId);
  if (existingUpload) {
    return response(200, {
      success: true,
      duplicate: true,
      asset: safeAsset(existingUpload),
      message: "Dit bestand staat al in je werkruimte.",
    });
  }

  const storagePath = storagePathFor(customer.id, uploadId, metadata.name);
  let preserveObject = false;
  try {
    const bytes = await storageDownload(context, storagePath);
    validateFileBytes(bytes, metadata);
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    const duplicate = await findDuplicate(context, customer.id, checksum);
    if (duplicate) {
      if (shouldDeleteDuplicateObject(uploadId, duplicate)) await storageDelete(context, storagePath);
      preserveObject = true;
      return response(200, {
        success: true,
        duplicate: true,
        asset: safeAsset(duplicate),
        message: "Dit bestand staat al in je werkruimte.",
      });
    }

    const record = {
      id: uploadId,
      customer_id: customer.id,
      lead_id: null,
      uploaded_by_auth_user_id: user.id,
      uploaded_by_type: "customer",
      source_module: "customer_portal",
      name: metadata.name,
      original_filename: metadata.name,
      file_type: fileTypeFor(metadata.mimeType),
      category: metadata.category,
      storage_path: storagePath,
      mime_type: metadata.mimeType,
      size_bytes: bytes.length,
      checksum,
      status: "new",
      usage_rights_confirmed: true,
      is_client_visible: true,
      metadata: { source: "customer_portal", description: metadata.description },
    };

    let inserted;
    try {
      inserted = await rest(context, "files", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(record),
      });
    } catch (insertError) {
      let racedDuplicate;
      try {
        racedDuplicate = await findDuplicate(context, customer.id, checksum);
      } catch {
        // The insert may have committed before its response was lost. If the
        // reconciliation lookup is unavailable too, preserve the object so an
        // existing database row can never be left pointing at deleted storage.
        preserveObject = true;
        throw insertError;
      }
      if (!racedDuplicate) throw insertError;
      if (shouldDeleteDuplicateObject(uploadId, racedDuplicate)) await storageDelete(context, storagePath);
      preserveObject = true;
      return response(200, {
        success: true,
        duplicate: true,
        asset: safeAsset(racedDuplicate),
        message: "Dit bestand staat al in je werkruimte.",
      });
    }

    preserveObject = true;
    await timeline(context, customer.id, user.id, "asset_uploaded", {
      assetId: uploadId,
      category: metadata.category,
      sizeBytes: bytes.length,
    });
    return response(201, {
      success: true,
      duplicate: false,
      asset: safeAsset(inserted?.[0] || { ...record, created_at: new Date().toISOString() }),
      message: "Je bestand is veilig aangeleverd en wacht op controle.",
    });
  } catch (error) {
    if (!preserveObject) await storageDelete(context, storagePath);
    throw error;
  }
}

async function cancelUpload(context, customer, input) {
  const metadata = validateMetadata(input);
  const uploadId = clean(input.uploadId);
  if (!UUID.test(uploadId)) throw coded("INVALID_UPLOAD", 400, "De upload kon niet veilig worden geannuleerd.");
  if (await findAssetById(context, customer.id, uploadId)) {
    throw coded("UPLOAD_COMPLETE", 409, "Dit bestand is al veilig opgeslagen.");
  }
  await storageDelete(context, storagePathFor(customer.id, uploadId, metadata.name));
  return response(200, { success: true });
}

function validateMetadata(input = {}) {
  const originalName = clean(input.name);
  if (!originalName || originalName.length > 180 || /[\u0000-\u001f\u007f]/.test(originalName)) {
    throw coded("INVALID_FILE", 400, "Kies een bestand met een geldige bestandsnaam.");
  }
  const extension = extensionFor(originalName);
  const declaredMimeType = normalizeDeclaredMimeType(input.mimeType);
  const inferredMimeType = MIME_BY_EXTENSION.get(extension) || "";
  const mimeType = declaredMimeType || inferredMimeType;
  const size = Number(input.size);
  const categoryInput = clean(input.category).toLowerCase();
  const category = CATEGORIES.has(categoryInput) ? categoryInput : "other";
  const usageRightsConfirmed = input.usageRightsConfirmed === true;

  if (!extension || !mimeType || !ALLOWED.has(mimeType) || !extensionMatches(originalName, mimeType)) {
    throw coded("INVALID_FILE", 400, "Dit bestandstype kan niet worden geüpload.");
  }
  if (declaredMimeType && inferredMimeType && declaredMimeType !== inferredMimeType) {
    throw coded("MIME_MISMATCH", 400, "Het bestandstype komt niet overeen met de bestandsnaam.");
  }
  if (!Number.isInteger(size) || size <= 0) throw coded("INVALID_FILE", 400, "Het bestand is leeg of niet leesbaar.");
  if (size > MAX_BYTES) throw coded("FILE_TOO_LARGE", 413, "Een bestand mag maximaal 8 MB zijn.");
  if (!usageRightsConfirmed) {
    throw coded("USAGE_RIGHTS_REQUIRED", 400, "Bevestig dat je dit bestand mag aanleveren.");
  }

  return {
    name: originalName,
    extension,
    mimeType,
    size,
    category,
    description: clean(input.description).slice(0, 500),
  };
}

function validateFileBytes(bytes, metadata) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw coded("INVALID_FILE", 400, "Het bestand is leeg of niet leesbaar.");
  if (bytes.length > MAX_BYTES) throw coded("FILE_TOO_LARGE", 413, "Een bestand mag maximaal 8 MB zijn.");
  if (bytes.length !== metadata.size) throw coded("SIZE_MISMATCH", 400, "Het bestand is tijdens het uploaden gewijzigd.");
  if (!signatureMatches(bytes, metadata.mimeType)) {
    throw coded("MIME_MISMATCH", 400, "Het bestandstype komt niet overeen met de inhoud.");
  }
}

function signatureMatches(bytes, mimeType) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (mimeType === "image/svg+xml") return /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(bytes.subarray(0, 2048).toString("utf8"));
  if (mimeType === "video/mp4") return bytes.subarray(4, 8).toString() === "ftyp";
  if (mimeType === "video/webm") return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mimeType === "application/pdf") return bytes.subarray(0, 5).toString() === "%PDF-";
  if (mimeType === "text/plain") return !bytes.includes(0) && !bytes.subarray(0, 2).equals(Buffer.from("MZ"));
  if (mimeType === "application/msword") {
    return bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }
  return false;
}

function extensionMatches(name, mimeType) {
  return Boolean(EXTENSIONS_BY_MIME.get(mimeType)?.has(extensionFor(name)));
}

function normalizeDeclaredMimeType(value) {
  const mimeType = clean(value).toLowerCase().split(";")[0];
  if (mimeType === "image/jpg") return "image/jpeg";
  if (mimeType === "application/octet-stream") return "";
  return mimeType;
}

function extensionFor(name) {
  const match = clean(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function safeFilename(name) {
  const extension = extensionFor(name);
  const withoutExtension = extension ? clean(name).slice(0, -(extension.length + 1)) : clean(name);
  const stem = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "bestand";
  return extension ? `${stem}.${extension}` : stem;
}

function storagePathFor(customerId, uploadId, name) {
  return `${customerId}/${uploadId}/${safeFilename(name)}`;
}

function fileTypeFor(mimeType) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "text/plain") return "text";
  return "document";
}

function shouldDeleteDuplicateObject(uploadId, duplicate) {
  return Boolean(duplicate?.id && duplicate.id !== uploadId);
}

async function findDuplicate(context, customerId, checksum) {
  const rows = await rest(
    context,
    `files?select=id,customer_id,name,category,status,mime_type,size_bytes,uploaded_by_type,metadata,created_at,updated_at&customer_id=eq.${customerId}&checksum=eq.${checksum}&status=neq.archived&limit=1`,
    { method: "GET" }
  );
  return rows?.[0] && rows[0].customer_id === customerId ? rows[0] : null;
}

async function findAssetById(context, customerId, assetId) {
  const rows = await rest(
    context,
    `files?select=id,customer_id,name,category,status,mime_type,size_bytes,uploaded_by_type,metadata,created_at,updated_at&id=eq.${assetId}&customer_id=eq.${customerId}&limit=1`,
    { method: "GET" }
  );
  return rows?.[0] && rows[0].customer_id === customerId ? rows[0] : null;
}

async function createSignedUploadUrl(context, path) {
  const encodedPath = encodeStoragePath(path);
  const result = await fetch(`${context.url}/storage/v1/object/upload/sign/${BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: storageHeaders(context, { "Content-Type": "application/json", "x-upsert": "false" }),
    body: JSON.stringify({}),
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok || !data.url) throw coded("STORAGE_FAILED", 502, "Het bestand kon niet worden voorbereid.");
  const signed = new URL(data.url, `${context.url}/storage/v1/`);
  const token = signed.searchParams.get("token");
  if (!token) throw coded("STORAGE_FAILED", 502, "Het bestand kon niet worden voorbereid.");
  return `${context.url}/storage/v1/object/upload/sign/${BUCKET}/${encodedPath}?token=${encodeURIComponent(token)}`;
}

async function storageDownload(context, path) {
  const result = await fetch(`${context.url}/storage/v1/object/${BUCKET}/${encodeStoragePath(path)}`, {
    method: "GET",
    headers: storageHeaders(context),
  });
  if (!result.ok) throw coded("STORAGE_FAILED", 502, "Het bestand kon niet veilig worden gecontroleerd.");
  const contentLength = Number(result.headers?.get?.("content-length") || 0);
  if (contentLength > MAX_BYTES) throw coded("FILE_TOO_LARGE", 413, "Een bestand mag maximaal 8 MB zijn.");
  return Buffer.from(await result.arrayBuffer());
}

async function storageDelete(context, path) {
  try {
    const result = await fetch(`${context.url}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: storageHeaders(context, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [path] }),
    });
    if (!result.ok) console.warn("Relationship asset cleanup failed", { status: result.status });
  } catch (error) {
    console.warn("Relationship asset cleanup exception", { message: error.message });
  }
}

function storageHeaders(context, extra = {}) {
  return {
    apikey: context.key,
    Authorization: `Bearer ${context.key}`,
    Accept: "application/json",
    ...extra,
  };
}

async function authUser(context, token) {
  const result = await fetch(`${context.url}/auth/v1/user`, {
    headers: { apikey: context.anon, Authorization: `Bearer ${token}` },
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok || !data.id) throw coded("AUTH_REQUIRED", 401, "Log opnieuw in.");
  return data;
}

async function ownedCustomer(context, userId) {
  const rows = await rest(context, `customers?select=id,profile_id,auth_user_id,status&auth_user_id=eq.${userId}&limit=1`, { method: "GET" });
  if (rows?.[0]) return rows[0];
  const profiles = await rest(context, `profiles?select=id&auth_user_id=eq.${userId}&limit=1`, { method: "GET" });
  if (!profiles?.[0]) return null;
  const customers = await rest(context, `customers?select=id,profile_id,auth_user_id,status&profile_id=eq.${profiles[0].id}&limit=1`, { method: "GET" });
  return customers?.[0] || null;
}

async function timeline(context, customerId, userId, eventType, metadata) {
  await rest(context, "customer_timeline_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      customer_id: customerId,
      event_type: eventType,
      title: "Bestand aangeleverd",
      actor_auth_user_id: userId,
      source_module: "customer_portal",
      status: "success",
      metadata,
    }),
  }).catch(() => null);
}

async function rest(context, path, options = {}) {
  const result = await fetch(`${context.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: context.key,
      Authorization: `Bearer ${context.key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await result.json().catch(() => null);
  if (!result.ok) throw coded("DATA_FAILED", result.status >= 500 ? 502 : 400, "Bestandsgegevens konden niet worden verwerkt.");
  return data;
}

function safeAsset(row = {}) {
  return {
    id: row.id,
    name: row.name || row.original_filename,
    category: row.category,
    status: row.status,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedByType: row.uploaded_by_type,
    description: clean(row.metadata?.description),
    source: "customer",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeRequest(row = {}) {
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    requestedCategories: row.requested_categories,
    minimumCount: row.minimum_count,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
  };
}

function parseJsonBody(body) {
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw coded("INVALID_REQUEST", 400, "De uploadaanvraag is ongeldig.");
  }
}

function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function bearer(event) {
  const headers = event.headers || {};
  const value = headers.authorization || headers.Authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function config() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anon = clean(process.env.SUPABASE_ANON_KEY);
  if (!url || !key || !anon) throw coded("SERVICE_UNAVAILABLE", 503, "Uploaden is tijdelijk niet beschikbaar.");
  return { url, key, anon };
}

function clean(value) {
  return String(value || "").trim();
}

function coded(code, status, message) {
  return Object.assign(new Error(message), { code, status });
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

exports._test = {
  ALLOWED,
  CATEGORIES,
  EXTENSIONS_BY_MIME,
  MAX_BYTES,
  extensionMatches,
  safeAsset,
  safeFilename,
  shouldDeleteDuplicateObject,
  signatureMatches,
  storagePathFor,
  validateFileBytes,
  validateMetadata,
};
