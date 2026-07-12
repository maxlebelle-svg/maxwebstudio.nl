const crypto = require("crypto");

const BUCKET = "relationship-assets";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 255;
const UPLOAD_TTL_SECONDS = 2 * 60 * 60;
const DOWNLOAD_TTL_SECONDS = 60;
const TOKEN_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
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
const MIME_BY_EXTENSION = Object.freeze({
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});
const CATEGORIES = new Set(["logo", "photo", "team", "project", "product", "brand", "video", "document", "text", "social", "other"]);
const INACTIVE_ASSET_STATUSES = new Set(["archived", "gearchiveerd", "rejected", "afgekeurd", "replaced", "vervangen", "deleted", "verwijderd"]);
const INACTIVE_ACCOUNT_STATUSES = new Set(["archived", "gearchiveerd", "deleted", "verwijderd", "inactive", "inactief", "niet_actief", "niet actief", "disabled", "blocked", "geblokkeerd", "revoked"]);

exports.handler = async (event) => {
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return json(405, { success: false, code: "INVALID_METHOD", error: "Deze actie wordt niet ondersteund." });
  }

  try {
    const context = config();
    const token = bearer(event);
    if (!token) return json(401, { success: false, code: "AUTH_REQUIRED", error: "Log opnieuw in." });

    const user = await authUser(context, token);
    const customer = await ownedCustomer(context, user.id);
    if (!customer) {
      return json(403, { success: false, code: "FORBIDDEN", error: "Er is geen toegankelijke klantwerkruimte gevonden." });
    }

    if (event.httpMethod === "GET") {
      const downloadId = clean(queryParams(event).get("download"));
      return downloadId
        ? await downloadAsset(context, customer.id, downloadId)
        : await listAssets(context, customer.id);
    }

    const input = parseJsonBody(event.body);
    if (input.action === "prepare") return await prepareUpload(context, user, customer, input);
    if (input.action === "finalize") return await finalizeUpload(context, user, customer, input);
    throw coded("INVALID_ACTION", 400, "De uploadactie is niet geldig.", { step: "route_action" });
  } catch (error) {
    logFailure("Client relationship asset failed", error);
    return json(error.status || 500, {
      success: false,
      code: error.code || "INTERNAL_ERROR",
      error: error.status ? error.message : "Uploaden is tijdelijk niet gelukt. Probeer het opnieuw.",
    });
  }
};

async function listAssets(context, customerId) {
  const select = "id,name,file_type,category,status,is_client_visible,original_filename,mime_type,size_bytes,uploaded_by_type,source_module,usage_rights_confirmed,is_primary,metadata,created_at,updated_at";
  const [assets, requests] = await Promise.all([
    rest(context, `files?select=${select}&customer_id=eq.${encodeURIComponent(customerId)}&is_client_visible=eq.true&order=created_at.desc`, { method: "GET", operation: "list_assets" }),
    rest(context, `asset_requests?select=id,title,instructions,requested_categories,minimum_count,deadline,status,created_at&customer_id=eq.${encodeURIComponent(customerId)}&status=in.(open,partial)&order=created_at.desc`, { method: "GET", operation: "list_asset_requests" }).catch((error) => {
      logFailure("Client asset requests unavailable", error);
      return [];
    }),
  ]);

  return json(200, {
    success: true,
    assets: (Array.isArray(assets) ? assets : []).map(safeAsset),
    requests: Array.isArray(requests) ? requests : [],
  });
}

async function prepareUpload(context, user, customer, input) {
  const metadata = validateMetadata(input);
  const assetId = crypto.randomUUID();
  const storageName = sanitizeFilename(metadata.name, metadata.extension);
  const storagePath = `${customer.id}/${assetId}/${storageName}`;
  const uploadUrl = await createSignedUploadUrl(context, storagePath);
  const uploadId = sealUpload({
    customerId: customer.id,
    userId: user.id,
    assetId,
    storagePath,
    name: metadata.name,
    mimeType: metadata.mimeType,
    extension: metadata.extension,
    sizeBytes: metadata.sizeBytes,
    category: metadata.category,
    description: metadata.description,
    usageRightsConfirmed: true,
  }, context.uploadSecret);

  return json(200, {
    success: true,
    uploadId,
    uploadUrl,
    uploadMethod: "PUT",
    uploadHeaders: { "x-upsert": "false" },
    expiresIn: UPLOAD_TTL_SECONDS,
  });
}

async function finalizeUpload(context, user, customer, input) {
  const prepared = openUpload(clean(input.uploadId), context.uploadSecret);
  assertPreparedUpload(prepared, user, customer);

  const alreadyFinalized = await assetById(context, customer.id, prepared.assetId);
  if (alreadyFinalized) {
    return json(200, {
      success: true,
      duplicate: false,
      asset: safeAsset(alreadyFinalized),
      message: "Je bestand is veilig aangeleverd en wacht op controle.",
    });
  }

  let keepObject = false;
  try {
    const stored = await storageDownload(context, prepared.storagePath);
    const bytes = stored.bytes;
    validateStoredFile(bytes, stored.contentType, prepared);

    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    let duplicate = await assetByChecksum(context, customer.id, checksum);
    if (duplicate) {
      await storageRemoveBestEffort(context, prepared.storagePath, "duplicate_before_insert");
      return duplicateResponse(duplicate);
    }

    const record = assetRecord(prepared, checksum, user.id, customer.id, bytes.length);
    let inserted;
    try {
      inserted = await rest(context, "files", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(record),
        operation: "insert_asset",
      });
    } catch (error) {
      try {
        duplicate = await assetById(context, customer.id, prepared.assetId)
          || await assetByChecksum(context, customer.id, checksum);
      } catch (reconciliationError) {
        // The insert response may have been lost after the database committed.
        // Preserve storage when reconciliation is unavailable so a committed
        // row can never be left pointing at a deleted object.
        keepObject = true;
        error.reconciliationError = reconciliationError.code || reconciliationError.message;
        throw error;
      }
      if (duplicate) {
        if (duplicate.id !== prepared.assetId) {
          await storageRemoveBestEffort(context, prepared.storagePath, "duplicate_insert_race");
        } else {
          keepObject = true;
        }
        return duplicate.id === prepared.assetId
          ? json(200, { success: true, duplicate: false, asset: safeAsset(duplicate), message: "Je bestand is veilig aangeleverd en wacht op controle." })
          : duplicateResponse(duplicate);
      }
      throw error;
    }

    keepObject = true;
    const asset = inserted?.[0] || record;
    await timeline(context, customer.id, user.id, "asset_uploaded", {
      assetId: prepared.assetId,
      category: prepared.category,
      sizeBytes: bytes.length,
    });
    return json(201, {
      success: true,
      duplicate: false,
      asset: safeAsset(asset),
      message: "Je bestand is veilig aangeleverd en wacht op controle.",
    });
  } catch (error) {
    if (!keepObject) await storageRemoveBestEffort(context, prepared.storagePath, "finalize_failure");
    throw error;
  }
}

async function downloadAsset(context, customerId, assetId) {
  if (!UUID.test(assetId)) throw coded("INVALID_ASSET", 400, "Kies een geldig bestand.", { step: "download_id" });
  const rows = await rest(context, `files?select=id,name,original_filename,storage_path,mime_type,status,is_client_visible&id=eq.${encodeURIComponent(assetId)}&customer_id=eq.${encodeURIComponent(customerId)}&is_client_visible=eq.true&limit=1`, { method: "GET", operation: "download_asset_lookup" });
  const asset = rows?.[0];
  if (!asset?.storage_path) throw coded("NOT_FOUND", 404, "Dit bestand is niet beschikbaar.", { step: "download_lookup" });
  if (isInactiveAssetStatus(asset.status)) {
    throw coded("NOT_FOUND", 404, "Dit bestand is niet beschikbaar.", { step: "download_status" });
  }

  const location = await createSignedDownloadUrl(context, asset.storage_path, asset.original_filename || asset.name);
  return {
    statusCode: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
    body: "",
  };
}

function validateMetadata(input = {}) {
  const rawName = String(input.name || "").normalize("NFC");
  const name = rawName.trim();
  const mimeType = clean(input.mimeType).toLowerCase();
  const sizeBytes = Number(input.sizeBytes);
  const category = clean(input.category).toLowerCase();
  const description = String(input.description || "").trim();

  if (!name) throw coded("NO_FILE", 400, "Geen bestand geselecteerd.", { step: "metadata_name" });
  if (name.length > MAX_FILENAME_LENGTH || CONTROL_CHARACTERS.test(name) || /[\\/]/.test(name) || name === "." || name === "..") {
    throw coded("INVALID_FILENAME", 400, "De bestandsnaam is niet geldig.", { step: "metadata_name" });
  }
  const extension = extensionFor(name);
  if (!extension || !MIME_BY_EXTENSION[extension] || !ALLOWED.has(mimeType) || MIME_BY_EXTENSION[extension] !== mimeType) {
    throw coded("UNSUPPORTED_FILE_TYPE", 400, "Dit bestandstype wordt niet ondersteund.", { step: "metadata_type", mimeType, extension });
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw coded("INVALID_FILE", 400, "Het bestand kon niet worden gelezen.", { step: "metadata_size" });
  }
  if (sizeBytes === 0) throw coded("EMPTY_FILE", 400, "Het bestand is leeg of beschadigd.", { step: "metadata_size" });
  if (sizeBytes > MAX_BYTES) throw coded("FILE_TOO_LARGE", 413, "Het bestand is groter dan toegestaan. Maximaal 8 MB.", { step: "metadata_size", sizeBytes });
  if (!CATEGORIES.has(category)) throw coded("INVALID_CATEGORY", 400, "Kies een geldige categorie.", { step: "metadata_category" });
  if (description.length > 500 || CONTROL_CHARACTERS.test(description.replace(/[\t\n\r]/g, ""))) {
    throw coded("INVALID_DESCRIPTION", 400, "De omschrijving is niet geldig.", { step: "metadata_description" });
  }
  if (input.usageRightsConfirmed !== true) {
    throw coded("USAGE_RIGHTS_REQUIRED", 400, "Bevestig dat je dit bestand mag aanleveren.", { step: "metadata_rights" });
  }

  return { name, mimeType, sizeBytes, category, description, extension };
}

function assertPreparedUpload(prepared, user, customer) {
  if (!prepared || prepared.v !== TOKEN_VERSION || !UUID.test(prepared.assetId || "") || !UUID.test(prepared.customerId || "") || !UUID.test(prepared.userId || "")) {
    throw coded("INVALID_UPLOAD", 400, "De upload kon niet worden afgerond. Kies het bestand opnieuw.", { step: "prepared_shape" });
  }
  if (prepared.customerId !== customer.id || prepared.userId !== user.id) {
    throw coded("FORBIDDEN", 403, "Deze upload hoort niet bij jouw klantwerkruimte.", { step: "prepared_owner" });
  }
  const metadata = validateMetadata(prepared);
  const expectedPath = `${customer.id}/${prepared.assetId}/${sanitizeFilename(metadata.name, metadata.extension)}`;
  if (prepared.storagePath !== expectedPath) {
    throw coded("INVALID_UPLOAD", 400, "De upload kon niet worden afgerond. Kies het bestand opnieuw.", { step: "prepared_path" });
  }
}

function validateStoredFile(bytes, storedContentType, prepared) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw coded("EMPTY_FILE", 400, "Het bestand is leeg of beschadigd.", { step: "stored_size" });
  }
  if (bytes.length > MAX_BYTES) {
    throw coded("FILE_TOO_LARGE", 413, "Het bestand is groter dan toegestaan. Maximaal 8 MB.", { step: "stored_size", sizeBytes: bytes.length });
  }
  if (bytes.length !== prepared.sizeBytes) {
    throw coded("FILE_SIZE_MISMATCH", 400, "Het bestand is leeg of beschadigd.", { step: "stored_size_mismatch", expected: prepared.sizeBytes, actual: bytes.length });
  }
  const normalizedStoredType = normalizeContentType(storedContentType);
  if (normalizedStoredType && normalizedStoredType !== "application/octet-stream" && normalizedStoredType !== prepared.mimeType) {
    throw coded("MIME_MISMATCH", 400, "Het bestandstype komt niet overeen met de inhoud.", { step: "stored_content_type", expected: prepared.mimeType, actual: normalizedStoredType });
  }
  if (!signatureMatches(bytes, prepared.mimeType, prepared.extension)) {
    throw coded("MIME_MISMATCH", 400, "Het bestandstype komt niet overeen met de inhoud.", { step: "stored_signature", mimeType: prepared.mimeType, extension: prepared.extension });
  }
}

function signatureMatches(bytes, mime, extension = "") {
  if (!Buffer.isBuffer(bytes) || !bytes.length) return false;
  if (extension && MIME_BY_EXTENSION[extension] !== mime) return false;
  if (mime === "image/jpeg") return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (mime === "image/png") return bytes.length >= 20 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.subarray(bytes.length - 8, bytes.length - 4).toString("ascii") === "IEND";
  if (mime === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length;
  if (mime === "image/svg+xml") return validateSvg(bytes);
  if (mime === "application/pdf") return bytes.length >= 9 && bytes.subarray(0, 5).toString("ascii") === "%PDF-" && bytes.subarray(Math.max(0, bytes.length - 1024)).toString("latin1").includes("%%EOF");
  if (mime === "video/mp4") return bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp" && bytes.readUInt32BE(0) >= 8 && bytes.readUInt32BE(0) <= bytes.length;
  if (mime === "video/webm") return bytes.length >= 16 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && bytes.subarray(0, Math.min(bytes.length, 4096)).includes(Buffer.from("webm"));
  if (mime === "text/plain") return validateText(bytes);
  if (mime === "application/msword") return validateDoc(bytes);
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return validateDocx(bytes);
  return false;
}

function validateSvg(bytes) {
  if (!validateUtf8(bytes)) return false;
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "").trim();
  let root = text;
  if (root.startsWith("<?")) {
    const declaration = root.match(/^<\?xml\s+version\s*=\s*["']1\.[01]["'](?:\s+encoding\s*=\s*["']utf-8["'])?(?:\s+standalone\s*=\s*["'](?:yes|no)["'])?\s*\?>\s*/i);
    if (!declaration) return false;
    root = root.slice(declaration[0].length);
  }
  if (!/^<svg\b/i.test(root) || !(/<\/svg>\s*$/i.test(root) || /^<svg\b[^>]*\/\>\s*$/i.test(root))) return false;
  const blocked = [
    /<\?[\s\S]*?\?>/i,
    /<!DOCTYPE\b/i,
    /<!ENTITY\b/i,
    /<\s*(?:[a-z_][\w.-]*:)?(?:script|foreignObject|iframe|object|embed|style|audio|video|animate|animateTransform|set|mpath)\b/i,
    /\son[a-z0-9_-]+\s*=/i,
    /\sstyle\s*=/i,
    /(?:javascript|vbscript)\s*:/i,
    /data\s*:\s*text\/html/i,
    /@import\b/i,
    /\bxml:base\s*=/i,
  ];
  if (blocked.some((pattern) => pattern.test(root))) return false;
  const references = [...root.matchAll(/(?:href|xlink:href|src)\s*=\s*["']([^"']*)["']/gi)];
  const cssUrls = [...root.matchAll(/url\s*\(\s*(["']?)(.*?)\1\s*\)/gi)];
  return references.every((match) => !match[1] || match[1].trim().startsWith("#"))
    && cssUrls.every((match) => clean(match[2]).startsWith("#"));
}

function validateText(bytes) {
  if (!validateUtf8(bytes) || bytes.includes(0)) return false;
  const text = bytes.toString("utf8");
  return !/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);
}

function validateDoc(bytes) {
  const cfbHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const wordDocumentStream = Buffer.from("WordDocument", "utf16le");
  return bytes.length >= 512 && bytes.subarray(0, 8).equals(cfbHeader) && bytes.includes(wordDocumentStream);
}

function validateDocx(bytes) {
  if (bytes.length < 100 || !bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return false;
  const hasContentTypes = bytes.includes(Buffer.from("[Content_Types].xml"));
  const hasDocument = bytes.includes(Buffer.from("word/document.xml"));
  const hasMacro = bytes.includes(Buffer.from("word/vbaProject.bin"));
  return hasContentTypes && hasDocument && !hasMacro;
}

function validateUtf8(bytes) {
  const decoded = bytes.toString("utf8");
  return !decoded.includes("\uFFFD") && Buffer.from(decoded, "utf8").equals(bytes);
}

function extensionFor(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function sanitizeFilename(name, extension = extensionFor(name)) {
  const withoutExtension = extension ? String(name).slice(0, -(extension.length + 1)) : String(name);
  const stem = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 96) || "bestand";
  return `${stem}.${extension}`;
}

function assetRecord(prepared, checksum, userId, customerId, sizeBytes) {
  return {
    id: prepared.assetId,
    customer_id: customerId,
    lead_id: null,
    uploaded_by_auth_user_id: userId,
    uploaded_by_type: "customer",
    source_module: "customer_portal",
    name: prepared.name,
    original_filename: prepared.name,
    file_type: prepared.mimeType.split("/")[0],
    category: prepared.category,
    storage_path: prepared.storagePath,
    mime_type: prepared.mimeType,
    size_bytes: sizeBytes,
    checksum,
    status: "new",
    usage_rights_confirmed: true,
    is_client_visible: true,
    metadata: {
      source: "customer_portal",
      description: prepared.description,
      extension: prepared.extension,
      declaredSizeBytes: prepared.sizeBytes,
    },
  };
}

function safeAsset(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const mimeType = clean(row.mime_type || row.mimeType).toLowerCase();
  const available = !isInactiveAssetStatus(row.status);
  return {
    id: row.id,
    name: row.name || row.original_filename || "Bestand",
    originalFilename: row.original_filename || row.name || "Bestand",
    mimeType,
    sizeBytes: Number(row.size_bytes ?? row.sizeBytes ?? 0),
    category: row.category || "other",
    status: row.status || "new",
    source: row.uploaded_by_type === "customer" ? "customer" : "studio",
    description: clean(metadata.description),
    uploadedByType: row.uploaded_by_type,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || row.created_at || null,
    downloadAvailable: available && Boolean(row.id),
    previewAvailable: available && /^image\/(?:jpeg|png|webp)$/.test(mimeType),
  };
}

function isInactiveAssetStatus(value) {
  return INACTIVE_ASSET_STATUSES.has(clean(value).toLowerCase());
}

function duplicateResponse(asset) {
  return json(200, {
    success: true,
    duplicate: true,
    asset: safeAsset(asset),
    message: "Dit bestand staat al in je werkruimte.",
  });
}

async function assetById(context, customerId, assetId) {
  const rows = await rest(context, `files?select=*&id=eq.${encodeURIComponent(assetId)}&customer_id=eq.${encodeURIComponent(customerId)}&limit=1`, { method: "GET", operation: "asset_by_id" });
  return rows?.[0] || null;
}

async function assetByChecksum(context, customerId, checksum) {
  const rows = await rest(context, `files?select=*&customer_id=eq.${encodeURIComponent(customerId)}&checksum=eq.${encodeURIComponent(checksum)}&status=neq.archived&limit=1`, { method: "GET", operation: "asset_by_checksum" });
  return rows?.[0] || null;
}

async function createSignedUploadUrl(context, storagePath) {
  const endpoint = `${context.url}/storage/v1/object/upload/sign/${BUCKET}/${encodeStoragePath(storagePath)}`;
  const result = await fetch(endpoint, {
    method: "POST",
    headers: serviceHeaders(context, { "Content-Type": "application/json" }),
    body: "{}",
  });
  const data = await parseResponseBody(result);
  if (!result.ok) {
    throw upstreamError("SIGNED_UPLOAD_FAILED", 502, "Uploaden is tijdelijk niet gelukt. Probeer het opnieuw.", "signed_upload", result, data);
  }
  const uploadUrl = resolveStorageUrl(context, data?.url || data?.signedURL || data?.signedUrl, `/storage/v1/object/upload/sign/${BUCKET}/`);
  if (!uploadUrl) throw coded("SIGNED_UPLOAD_FAILED", 502, "Uploaden is tijdelijk niet gelukt. Probeer het opnieuw.", { step: "signed_upload_response" });
  return uploadUrl;
}

async function createSignedDownloadUrl(context, storagePath, filename) {
  const endpoint = `${context.url}/storage/v1/object/sign/${BUCKET}/${encodeStoragePath(storagePath)}`;
  const result = await fetch(endpoint, {
    method: "POST",
    headers: serviceHeaders(context, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: DOWNLOAD_TTL_SECONDS }),
  });
  const data = await parseResponseBody(result);
  if (!result.ok) {
    throw upstreamError("SIGNED_DOWNLOAD_FAILED", 502, "Dit bestand kan tijdelijk niet worden geopend.", "signed_download", result, data);
  }
  const signed = resolveStorageUrl(context, data?.signedURL || data?.signedUrl || data?.url, `/storage/v1/object/sign/${BUCKET}/`);
  if (!signed) throw coded("SIGNED_DOWNLOAD_FAILED", 502, "Dit bestand kan tijdelijk niet worden geopend.", { step: "signed_download_response" });
  const url = new URL(signed);
  url.searchParams.set("download", safeDownloadName(filename));
  return url.toString();
}

async function storageDownload(context, storagePath) {
  const result = await fetch(`${context.url}/storage/v1/object/${BUCKET}/${encodeStoragePath(storagePath)}`, {
    method: "GET",
    headers: serviceHeaders(context),
  });
  if (!result.ok) {
    const data = await parseResponseBody(result);
    const status = result.status === 404 ? 409 : 502;
    const message = result.status === 404
      ? "De upload kon niet worden afgerond. Kies het bestand opnieuw."
      : "Uploaden is tijdelijk niet gelukt. Probeer het opnieuw.";
    throw upstreamError("STORAGE_READ_FAILED", status, message, "storage_download", result, data);
  }
  const declaredLength = Number(result.headers.get("content-length") || 0);
  if (declaredLength > MAX_BYTES) throw coded("FILE_TOO_LARGE", 413, "Het bestand is groter dan toegestaan. Maximaal 8 MB.", { step: "storage_content_length", declaredLength });
  const bytes = Buffer.from(await result.arrayBuffer());
  return { bytes, contentType: result.headers.get("content-type") || "" };
}

async function storageRemove(context, storagePath) {
  const result = await fetch(`${context.url}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: serviceHeaders(context, { "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: [storagePath] }),
  });
  const data = await parseResponseBody(result);
  if (!result.ok && result.status !== 404) {
    throw upstreamError("STORAGE_CLEANUP_FAILED", 502, "Uploaden is tijdelijk niet gelukt. Probeer het opnieuw.", "storage_cleanup", result, data);
  }
}

async function storageRemoveBestEffort(context, storagePath, reason) {
  try {
    await storageRemove(context, storagePath);
  } catch (error) {
    logFailure("Relationship asset cleanup failed", Object.assign(error, { cleanupReason: reason }));
  }
}

async function authUser(context, token) {
  const result = await fetch(`${context.url}/auth/v1/user`, {
    headers: { apikey: context.anon, Authorization: `Bearer ${token}` },
  });
  const data = await parseResponseBody(result);
  if (!result.ok || !data?.id) throw coded("AUTH_REQUIRED", 401, "Log opnieuw in.", { step: "auth_user", upstreamStatus: result.status });
  return data;
}

async function ownedCustomer(context, userId) {
  const [direct, profiles] = await Promise.all([
    rest(context, `customers?select=id,profile_id,auth_user_id,status,portal_status,updated_at&auth_user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=10`, { method: "GET", operation: "customer_by_auth_user" }),
    rest(context, `profiles?select=id,status,role&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`, { method: "GET", operation: "profile_by_auth_user" }),
  ]);
  const profile = profiles?.[0] || null;
  if (profile && !isProfileActive(profile)) return null;
  const directCustomer = (direct || []).find(isCustomerActive);
  if (directCustomer) return directCustomer;

  if (!profile) return null;
  const customers = await rest(context, `customers?select=id,profile_id,auth_user_id,status,portal_status,updated_at&profile_id=eq.${encodeURIComponent(profile.id)}&order=updated_at.desc&limit=10`, { method: "GET", operation: "customer_by_profile" });
  return (customers || []).find(isCustomerActive) || null;
}

function isCustomerActive(customer = {}) {
  return !INACTIVE_ACCOUNT_STATUSES.has(clean(customer.status).toLowerCase())
    && !INACTIVE_ACCOUNT_STATUSES.has(clean(customer.portal_status || customer.portalStatus).toLowerCase());
}

function isProfileActive(profile = {}) {
  const status = clean(profile.status || "active").toLowerCase();
  const role = clean(profile.role || "customer").toLowerCase();
  return status === "active" && (!role || role === "customer");
}

async function timeline(context, customerId, userId, eventType, metadata) {
  try {
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
      operation: "asset_timeline",
    });
  } catch (error) {
    logFailure("Relationship asset timeline failed", error);
  }
}

async function rest(context, path, options = {}) {
  const { operation = "rest", headers = {}, ...requestOptions } = options;
  const result = await fetch(`${context.url}/rest/v1/${path}`, {
    ...requestOptions,
    headers: serviceHeaders(context, {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    }),
  });
  const data = await parseResponseBody(result);
  if (!result.ok) {
    throw upstreamError("DATA_FAILED", result.status >= 500 ? 502 : 400, "Bestandsgegevens konden niet worden verwerkt.", operation, result, data);
  }
  return data;
}

function sealUpload(payload, secret, now = Date.now(), providedIv) {
  const iv = providedIv || crypto.randomBytes(12);
  if (!Buffer.isBuffer(iv) || iv.length !== 12) throw new Error("Upload token IV must contain 12 bytes.");
  const body = Buffer.from(JSON.stringify({
    ...payload,
    v: TOKEN_VERSION,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + UPLOAD_TTL_SECONDS,
  }), "utf8");
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(secret), iv);
  cipher.setAAD(Buffer.from("relationship-asset-upload:v1", "utf8"));
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

function openUpload(token, secret, now = Date.now()) {
  try {
    if (!token || token.length > 4096 || !token.startsWith("v1.")) throw new Error("invalid token envelope");
    const value = Buffer.from(token.slice(3), "base64url");
    if (value.length < 29) throw new Error("invalid token size");
    const iv = value.subarray(0, 12);
    const tag = value.subarray(12, 28);
    const encrypted = value.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(secret), iv);
    decipher.setAAD(Buffer.from("relationship-asset-upload:v1", "utf8"));
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
    const currentSeconds = Math.floor(now / 1000);
    if (payload.v !== TOKEN_VERSION || !Number.isSafeInteger(payload.exp) || payload.exp < currentSeconds || payload.iat > currentSeconds + 60) {
      throw new Error("expired token");
    }
    return payload;
  } catch (error) {
    throw coded("INVALID_UPLOAD", 400, "De upload kon niet worden afgerond. Kies het bestand opnieuw.", { step: "upload_token", technicalMessage: error.message });
  }
}

function tokenKey(secret) {
  return crypto.createHash("sha256").update("relationship-asset-upload:v1\0").update(String(secret || "")).digest();
}

function resolveStorageUrl(context, value, expectedPrefix) {
  if (!value || typeof value !== "string") return "";
  try {
    const candidate = /^https?:\/\//i.test(value)
      ? new URL(value)
      : new URL(`${context.url}/storage/v1${value.startsWith("/") ? value : `/${value}`}`);
    const expectedOrigin = new URL(context.url).origin;
    if (candidate.origin !== expectedOrigin || !candidate.pathname.startsWith(expectedPrefix)) return "";
    return candidate.toString();
  } catch {
    return "";
  }
}

function serviceHeaders(context, extra = {}) {
  return { apikey: context.key, Authorization: `Bearer ${context.key}`, ...extra };
}

function encodeStoragePath(path) {
  return String(path || "").split("/").map(encodeURIComponent).join("/");
}

function safeDownloadName(value) {
  return String(value || "bestand").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "-").trim().slice(0, MAX_FILENAME_LENGTH) || "bestand";
}

function normalizeContentType(value) {
  return clean(String(value || "").split(";", 1)[0]).toLowerCase();
}

function parseJsonBody(body) {
  try {
    const parsed = JSON.parse(body || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("body is not an object");
    return parsed;
  } catch (error) {
    throw coded("INVALID_JSON", 400, "De uploadaanvraag is niet geldig.", { step: "parse_json", technicalMessage: error.message });
  }
}

async function parseResponseBody(result) {
  const text = await result.text().catch(() => "");
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 500) }; }
}

function upstreamError(code, status, message, step, result, data) {
  return coded(code, status, message, {
    step,
    upstreamStatus: result?.status,
    upstreamCode: clean(data?.code || data?.error || data?.statusCode).slice(0, 80),
    technicalMessage: clean(data?.message || data?.msg).slice(0, 300),
  });
}

function logFailure(label, error = {}) {
  console.error(label, {
    code: error.code || "INTERNAL_ERROR",
    status: error.status || 500,
    step: error.step || "unknown",
    upstreamStatus: error.upstreamStatus || null,
    upstreamCode: error.upstreamCode || null,
    technicalMessage: error.technicalMessage || error.message || "unknown",
    cleanupReason: error.cleanupReason || null,
  });
}

function bearer(event) {
  const value = event.headers?.authorization || event.headers?.Authorization || "";
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, "").trim() : "";
}

function queryParams(event) {
  if (event.rawQuery) return new URLSearchParams(event.rawQuery);
  const params = new URLSearchParams();
  Object.entries(event.queryStringParameters || {}).forEach(([key, value]) => {
    if (value != null) params.set(key, value);
  });
  return params;
}

function config() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anon = clean(process.env.SUPABASE_ANON_KEY);
  const uploadSecret = clean(process.env.RELATIONSHIP_ASSET_UPLOAD_SECRET) || key;
  if (!url || !key || !anon || !uploadSecret) {
    throw coded("SERVICE_UNAVAILABLE", 503, "Uploaden is tijdelijk niet beschikbaar.", { step: "config" });
  }
  return { url, key, anon, uploadSecret };
}

function clean(value) {
  return String(value ?? "").trim();
}

function coded(code, status, message, details = {}) {
  return Object.assign(new Error(message), { code, status, ...details });
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify(body),
  };
}

exports._test = {
  ALLOWED,
  CATEGORIES,
  MIME_BY_EXTENSION,
  MAX_BYTES,
  MAX_FILENAME_LENGTH,
  UPLOAD_TTL_SECONDS,
  validateMetadata,
  validateStoredFile,
  signatureMatches,
  validateSvg,
  validateText,
  validateDoc,
  validateDocx,
  extensionFor,
  sanitizeFilename,
  safeAsset,
  safeDownloadName,
  assetRecord,
  sealUpload,
  openUpload,
  resolveStorageUrl,
  isCustomerActive,
  isProfileActive,
  isInactiveAssetStatus,
};
