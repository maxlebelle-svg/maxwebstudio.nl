const crypto = require("node:crypto");

const RESPONSE_VERSION = "cockpit-files-v1";
const ASSET_BUCKET = "relationship-assets";
const DEFAULT_ZIP_BUCKET = "preview-zips";
const MAX_BODY_BYTES = 8192;
const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 180;
const MAX_DESCRIPTION_LENGTH = 500;
const UPLOAD_TTL_SECONDS = 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FILES = Object.freeze({
  zip: "application/zip",
  pdf: "application/pdf",
});

exports.handler = createHandler();
exports.createHandler = createHandler;

function createHandler(dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || global.fetch;
  const env = dependencies.env || process.env;
  const now = dependencies.now || (() => new Date());
  const randomUUID = dependencies.randomUUID || crypto.randomUUID;

  return async function cockpitFiles(event = {}) {
    const headers = responseHeaders();
    if (String(event.httpMethod || "").toUpperCase() !== "POST") {
      return json(405, { success: false, code: "POST_REQUIRED", error: "Deze bestandskoppeling accepteert uitsluitend gecontroleerde uploads." }, headers);
    }
    if (clean(header(event, "origin"))) {
      return json(403, { success: false, code: "SERVER_TO_SERVER_REQUIRED", error: "Gebruik de beveiligde serverfunctie van de Cockpit." }, headers);
    }

    const configuredToken = clean(env.COCKPIT_WRITE_TOKEN);
    if (configuredToken.length < 48 || safeEqual(configuredToken, clean(env.COCKPIT_READ_TOKEN))) {
      return json(503, { success: false, code: "COCKPIT_FILES_NOT_CONFIGURED", error: "De Cockpit-bestandskoppeling is nog niet veilig geconfigureerd." }, headers);
    }
    if (!safeEqual(bearer(event), configuredToken)) {
      return json(401, { success: false, code: "UNAUTHORIZED", error: "Niet geautoriseerd." }, headers);
    }

    const supabaseUrl = clean(env.SUPABASE_URL).replace(/\/$/, "");
    const secretKey = clean(env.SUPABASE_COCKPIT_SECRET_KEY);
    if (!supabaseUrl || !secretKey || typeof fetchImpl !== "function") {
      return json(503, { success: false, code: "DATA_SOURCE_UNAVAILABLE", error: "De beveiligde bestandsopslag is niet beschikbaar." }, headers);
    }

    const parsed = parseBody(event.body);
    if (!parsed.ok) return json(parsed.status, { success: false, code: parsed.code, error: parsed.error }, headers);
    const action = clean(parsed.value.action).toLowerCase();
    const zipBucket = clean(env.PREVIEW_ZIP_STORAGE_BUCKET || DEFAULT_ZIP_BUCKET);
    if (!safeBucket(zipBucket)) return json(503, { success: false, code: "ZIP_STORAGE_UNAVAILABLE", error: "De privé ZIP-opslag is niet veilig geconfigureerd." }, headers);
    const context = { fetchImpl, supabaseUrl, secretKey, ticketSecret: configuredToken, zipBucket, now };

    try {
      if (action === "prepare") return await prepareUpload(context, parsed.value, randomUUID, headers);
      if (action === "finalize") return await finalizeUpload(context, parsed.value, headers);
      return json(400, { success: false, code: "ACTION_NOT_ALLOWED", error: "Deze bestandshandeling is niet toegestaan vanuit de Cockpit." }, headers);
    } catch (error) {
      console.error("Cockpit file action failed", { action, leadId: safeUuid(parsed.value.leadId), status: error.status || 502, code: error.code || "UPLOAD_FAILED" });
      return json(error.status || 502, { success: false, code: error.code || "UPLOAD_FAILED", error: error.publicMessage || "De upload is veilig gestopt. Probeer het opnieuw." }, headers);
    }
  };
}

async function prepareUpload(context, input, randomUUID, headers) {
  const metadata = validateMetadata(input);
  const lead = await readLead(context, metadata.leadId);
  assertWritableLead(lead);

  const assetId = randomUUID();
  if (!UUID.test(assetId)) throw coded("UPLOAD_ID_FAILED", 502, "De upload kon niet veilig worden voorbereid.");
  const storageBucket = metadata.extension === "zip" ? context.zipBucket : ASSET_BUCKET;
  const storagePath = `cockpit/lead/${metadata.leadId}/${assetId}/${sanitizeFilename(metadata.name, metadata.extension)}`;
  const uploadUrl = await createSignedUploadUrl(context, storageBucket, storagePath);
  const uploadTicket = sealTicket({ ...metadata, assetId, storageBucket, storagePath }, context.ticketSecret, context.now());

  return json(200, {
    success: true,
    version: RESPONSE_VERSION,
    uploadTicket,
    uploadUrl,
    uploadMethod: "PUT",
    uploadHeaders: { "x-upsert": "false", "Content-Type": metadata.mimeType },
    expiresIn: UPLOAD_TTL_SECONDS,
    maxFileBytes: metadata.maxFileBytes,
  }, headers);
}

async function finalizeUpload(context, input, headers) {
  const ticket = openTicket(clean(input.uploadTicket), context.ticketSecret, context.now());
  const leadId = clean(input.leadId);
  if (!UUID.test(leadId) || leadId !== ticket.leadId) throw coded("UPLOAD_CONTEXT_MISMATCH", 409, "Deze upload hoort niet bij de geselecteerde lead.");

  const lead = await readLead(context, leadId);
  assertWritableLead(lead);
  const existingById = await readFile(context, `id=eq.${ticket.assetId}&lead_id=eq.${leadId}`);
  if (existingById) return json(200, finalizePayload(existingById, false), headers);

  let keepObject = false;
  try {
    const stored = await storageDownload(context, ticket.storageBucket, ticket.storagePath, ticket.maxFileBytes);
    validateStoredFile(stored.bytes, stored.contentType, ticket);
    const checksum = crypto.createHash("sha256").update(stored.bytes).digest("hex");
    const duplicate = await readFile(context, `lead_id=eq.${leadId}&checksum=eq.${checksum}&status=not.in.(archived,rejected,replaced)`);
    if (duplicate) {
      await storageRemoveBestEffort(context, ticket.storageBucket, ticket.storagePath);
      return json(200, finalizePayload(duplicate, true), headers);
    }

    const record = {
      id: ticket.assetId,
      customer_id: null,
      lead_id: leadId,
      uploaded_by_auth_user_id: null,
      uploaded_by_type: "admin",
      source_module: "base44_cockpit",
      name: ticket.name,
      original_filename: ticket.name,
      file_type: ticket.extension,
      category: "document",
      storage_path: ticket.storagePath,
      mime_type: ticket.mimeType,
      size_bytes: stored.bytes.length,
      checksum,
      status: "new",
      usage_rights_confirmed: true,
      is_client_visible: false,
      metadata: {
        source: "base44-cockpit",
        description: ticket.description,
        extension: ticket.extension,
        declaredSizeBytes: ticket.sizeBytes,
        storageBucket: ticket.storageBucket,
        quarantined: true,
        executable: false,
      },
    };
    const rows = await request(context, "files", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) });
    keepObject = true;
    const asset = Array.isArray(rows) ? rows[0] : null;
    if (!asset) throw coded("FILE_REGISTRATION_FAILED", 502, "Het bestand is ontvangen, maar kon niet veilig worden geregistreerd.");
    return json(201, finalizePayload(asset, false), headers);
  } catch (error) {
    if (!keepObject) await storageRemoveBestEffort(context, ticket.storageBucket, ticket.storagePath);
    throw error;
  }
}

function validateMetadata(input = {}) {
  const leadId = clean(input.leadId);
  if (!UUID.test(leadId)) throw coded("INVALID_LEAD_ID", 400, "Kies een geldige lead.");
  const name = String(input.name || "").normalize("NFC").trim();
  if (!name || name.length > MAX_FILENAME_LENGTH || /[\u0000-\u001f\u007f\\/]/.test(name) || name === "." || name === "..") {
    throw coded("INVALID_FILENAME", 400, "De bestandsnaam is niet geldig.");
  }
  const extension = extensionFor(name);
  const mimeType = normalizeMime(input.mimeType, extension);
  if (!ALLOWED_FILES[extension] || ALLOWED_FILES[extension] !== mimeType) {
    throw coded("UNSUPPORTED_FILE_TYPE", 400, "Gebruik uitsluitend een ZIP- of PDF-bestand.");
  }
  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw coded("INVALID_FILE_SIZE", 400, "Het bestand is leeg of beschadigd.");
  const maxFileBytes = extension === "zip" ? MAX_ZIP_BYTES : MAX_PDF_BYTES;
  if (sizeBytes > maxFileBytes) throw coded("FILE_TOO_LARGE", 413, extension === "zip" ? "Het ZIP-bestand is groter dan 25 MB." : "Het PDF-bestand is groter dan 8 MB.");
  const description = safeText(input.description, MAX_DESCRIPTION_LENGTH);
  if (String(input.description || "").trim() && !description) throw coded("INVALID_DESCRIPTION", 400, "De omschrijving is te lang of bevat ongeldige tekens.");
  return { leadId, name, extension, mimeType, sizeBytes, maxFileBytes, description };
}

function validateStoredFile(bytes, contentType, ticket) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== ticket.sizeBytes || bytes.length > ticket.maxFileBytes) {
    throw coded("FILE_SIZE_MISMATCH", 400, "Het geüploade bestand is leeg, gewijzigd of beschadigd.");
  }
  const storedType = normalizeContentType(contentType);
  if (storedType && storedType !== "application/octet-stream" && normalizeMime(storedType, ticket.extension) !== ticket.mimeType) {
    throw coded("MIME_MISMATCH", 400, "Het bestandstype komt niet overeen met de inhoud.");
  }
  const valid = ticket.extension === "pdf" ? validPdf(bytes) : validZip(bytes);
  if (!valid) throw coded("FILE_SIGNATURE_MISMATCH", 400, "Het bestand is geen geldig ZIP- of PDF-bestand.");
}

function validPdf(bytes) {
  return bytes.length >= 9 && bytes.subarray(0, 5).toString("ascii") === "%PDF-" && bytes.subarray(Math.max(0, bytes.length - 2048)).toString("latin1").includes("%%EOF");
}

function validZip(bytes) {
  if (bytes.length < 22) return false;
  const prefix = bytes.subarray(0, 4);
  const recognizedPrefix = prefix.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || prefix.equals(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (!recognizedPrefix) return false;
  const tail = bytes.subarray(Math.max(0, bytes.length - 65557));
  return tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) >= 0;
}

async function readLead(context, leadId) {
  const rows = await request(context, `leads?select=*&id=eq.${leadId}&limit=1`, { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function assertWritableLead(lead) {
  if (!lead) throw coded("LEAD_NOT_FOUND", 404, "Deze lead bestaat niet meer.");
  if (isDemo(lead)) throw coded("DEMO_UPLOAD_BLOCKED", 403, "Demo-leads mogen geen echte bestanden ontvangen.");
}

async function readFile(context, filter) {
  const rows = await request(context, `files?select=*&${filter}&limit=1`, { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createSignedUploadUrl(context, bucket, storagePath) {
  const response = await context.fetchImpl(`${context.supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodePath(storagePath)}`, {
    method: "POST",
    headers: serviceHeaders(context),
    body: "{}",
  });
  const data = await parseResponse(response);
  const value = clean(data?.url || data?.signedURL || data?.signedUrl);
  if (!response.ok || !value) throw upstream("SIGNED_UPLOAD_FAILED", response.status, data);
  return resolveStorageUrl(context.supabaseUrl, value);
}

async function storageDownload(context, bucket, storagePath, maxFileBytes) {
  const response = await context.fetchImpl(`${context.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePath(storagePath)}`, { method: "GET", headers: serviceHeaders(context) });
  if (!response.ok) throw upstream("STORAGE_READ_FAILED", response.status, await parseResponse(response));
  const declaredLength = Number(response.headers?.get?.("content-length") || 0);
  if (declaredLength > maxFileBytes) throw coded("FILE_TOO_LARGE", 413, "Het bestand is groter dan toegestaan.");
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers?.get?.("content-type") || "" };
}

async function storageRemoveBestEffort(context, bucket, storagePath) {
  try {
    await context.fetchImpl(`${context.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: "DELETE",
      headers: serviceHeaders(context),
      body: JSON.stringify({ prefixes: [storagePath] }),
    });
  } catch (error) {
    console.warn("Cockpit file cleanup unavailable", { code: "STORAGE_CLEANUP_FAILED" });
  }
}

async function request(context, path, options = {}) {
  const response = await context.fetchImpl(`${context.supabaseUrl}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: { ...serviceHeaders(context), Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public", ...(options.headers || {}) },
    body: options.body,
  });
  const data = await parseResponse(response);
  if (!response.ok) throw upstream("DATA_FAILED", response.status, data);
  return data;
}

function finalizePayload(asset, duplicate) {
  return {
    success: true,
    version: RESPONSE_VERSION,
    duplicate: Boolean(duplicate),
    file: safeFile(asset),
    message: duplicate ? "Dit bestand stond al veilig bij deze lead." : "Het bestand is veilig aan de lead gekoppeld.",
  };
}

function safeFile(row = {}) {
  return {
    id: clean(row.id),
    leadId: clean(row.lead_id),
    name: clean(row.original_filename || row.name) || "Bestand",
    mimeType: clean(row.mime_type).toLowerCase(),
    sizeBytes: Math.max(0, Number(row.size_bytes || 0)),
    status: clean(row.status) || "new",
    createdAt: clean(row.created_at),
  };
}

function sealTicket(payload, secret, date) {
  const iv = crypto.randomBytes(12);
  const body = Buffer.from(JSON.stringify({ ...payload, v: 1, exp: Math.floor(date.getTime() / 1000) + UPLOAD_TTL_SECONDS }), "utf8");
  const cipher = crypto.createCipheriv("aes-256-gcm", ticketKey(secret), iv);
  cipher.setAAD(Buffer.from("mws-cockpit-file:v1"));
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
}

function openTicket(token, secret, date) {
  try {
    if (!token.startsWith("v1.") || token.length > 4096) throw new Error("invalid envelope");
    const value = Buffer.from(token.slice(3), "base64url");
    if (value.length < 29) throw new Error("invalid size");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ticketKey(secret), value.subarray(0, 12));
    decipher.setAAD(Buffer.from("mws-cockpit-file:v1"));
    decipher.setAuthTag(value.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8"));
    if (payload.v !== 1 || !Number.isSafeInteger(payload.exp) || payload.exp < Math.floor(date.getTime() / 1000)) throw new Error("expired");
    const validated = validateMetadata(payload);
    if (!UUID.test(payload.assetId) || !safeBucket(payload.storageBucket) || (validated.extension === "pdf" && payload.storageBucket !== ASSET_BUCKET) || !clean(payload.storagePath).startsWith(`cockpit/lead/${payload.leadId}/${payload.assetId}/`)) throw new Error("invalid scope");
    return payload;
  } catch {
    throw coded("INVALID_UPLOAD_TICKET", 400, "De upload is verlopen of ongeldig. Kies het bestand opnieuw.");
  }
}

function ticketKey(secret) { return crypto.createHash("sha256").update("mws-cockpit-file:v1\0").update(secret).digest(); }
function serviceHeaders(context) { return { apikey: context.secretKey, Authorization: `Bearer ${context.secretKey}`, "Content-Type": "application/json" }; }
function resolveStorageUrl(base, value) { return /^https?:\/\//i.test(value) ? value : `${base}/storage/v1${value.startsWith("/") ? value : `/${value}`}`; }
function encodePath(value) { return clean(value).split("/").map(encodeURIComponent).join("/"); }
function extensionFor(name) { return clean(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || ""; }
function sanitizeFilename(name, extension) { const stem = name.slice(0, -(extension.length + 1)).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/[-_]{2,}/g, "-").replace(/^[-_.]+|[-_.]+$/g, "").slice(0, 96) || "bestand"; return `${stem}.${extension}`; }
function normalizeMime(value, extension) { const mime = clean(value).toLowerCase().split(";")[0]; if (extension === "zip" && ["application/x-zip-compressed", "application/octet-stream"].includes(mime)) return "application/zip"; return mime; }
function normalizeContentType(value) { return clean(value).toLowerCase().split(";")[0]; }
function safeBucket(value) { return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(clean(value)); }
function safeText(value, limit) { const text = String(value || "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim(); return text.length <= limit ? text : ""; }
function isDemo(row = {}) { const metadata = object(row.metadata); return Boolean(row.is_demo || row.isDemo || metadata.isDemo) || clean(row.environment || metadata.environment).toLowerCase() === "demo" || clean(row.source || metadata.source).toLowerCase().includes("demo") || clean(row.email).toLowerCase().endsWith(".example"); }
function parseBody(body) { const raw = typeof body === "string" ? body : JSON.stringify(body || {}); if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return { ok: false, status: 413, code: "BODY_TOO_LARGE", error: "De aanvraag is te groot." }; try { const value = JSON.parse(raw || "{}"); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid"); return { ok: true, value }; } catch { return { ok: false, status: 400, code: "INVALID_JSON", error: "De aanvraag bevat geen geldige gegevens." }; } }
async function parseResponse(response) { const text = await response.text(); if (!text) return null; try { return JSON.parse(text); } catch { throw coded("INVALID_UPSTREAM_RESPONSE", 502, "De opslag gaf geen geldig antwoord."); } }
function upstream(code, status, data) { return coded(code, status === 404 ? 409 : 502, "De beveiligde opslag kon de upload niet verwerken.", clean(data?.code)); }
function coded(code, status, publicMessage, detail = "") { return Object.assign(new Error(detail || code), { code, status, publicMessage }); }
function responseHeaders() { return { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", "X-MWS-Cockpit-Mode": "restricted-files" }; }
function json(statusCode, body, headers = responseHeaders()) { return { statusCode, headers, body: JSON.stringify(body) }; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clean(value) { return String(value ?? "").trim(); }
function safeUuid(value) { return UUID.test(clean(value)) ? clean(value) : ""; }
function header(event = {}, name) { const headers = event.headers || {}; return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()] ?? ""; }
function bearer(event = {}) { const authorization = clean(header(event, "authorization")); return authorization.startsWith("Bearer ") ? clean(authorization.slice(7)) : ""; }
function safeEqual(left, right) { const a = Buffer.from(String(left || "")); const b = Buffer.from(String(right || "")); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); }

exports._test = { MAX_PDF_BYTES, MAX_ZIP_BYTES, openTicket, safeFile, sealTicket, validPdf, validZip, validateMetadata, validateStoredFile };
