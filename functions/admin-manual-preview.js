const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders } = require("./_cors");
const { createHash, randomBytes } = require("crypto");
const zlib = require("zlib");
const { createTimelineEvent } = require("./services/timelineService");

const roles = ["super_admin", "admin", "sales_manager"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMPRESSED = 4 * 1024 * 1024;
const MAX_UNPACKED = 18 * 1024 * 1024;
const MAX_FILES = 180;
const MAX_RATIO = 80;
const allowedExtensions = new Set(["html", "htm", "css", "js", "mjs", "json", "txt", "xml", "svg", "png", "jpg", "jpeg", "webp", "gif", "ico", "woff", "woff2", "ttf", "otf", "mp4", "webm"]);

exports.handler = async (event) => {
  const requestId = text(event.headers?.["x-nf-request-id"] || event.headers?.["X-Nf-Request-Id"] || randomBytes(8).toString("hex"));
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { success: false, error: "Methode niet toegestaan." });
  const adminCheck = await verifyAdmin(event, json, { module: "manual_preview", action: "upload", allowedRoles: roles, allowedStatuses: ["active"] });
  if (!adminCheck.success) return adminCheck.response;
  try {
    const payload = JSON.parse(event.body || "{}");
    const action = text(payload.action || "upload").toLowerCase();
    const customerId = uuid(payload.customerId || payload.customer_id);
    const websiteId = uuid(payload.websiteId || payload.website_id);
    const projectId = uuid(payload.projectId || payload.project_id);
    const demoJourneyId = uuid(payload.demoJourneyId || payload.demo_journey_id);
    if (!customerId) return fail(400, "customer_required", "Selecteer eerst een geldige klant.", "validate_customer", requestId);
    const context = getContext(adminCheck.admin);
    if (!context.available) return fail(500, "preview_version_failed", "De previewomgeving is nog niet geconfigureerd.", "configure_preview", requestId);
    const customer = await readOne(context, "customers", `select=id,name,company&id=eq.${customerId}&limit=1`);
    if (!customer?.id) return fail(404, "customer_not_found", "Deze klant kon niet worden gevonden.", "resolve_customer", requestId);
    if (action === "activate") return activateManualVersion(context, customerId, demoJourneyId, payload);
    const fileName = text(payload.fileName || payload.file_name);
    if (!/\.zip$/i.test(fileName)) return fail(400, "invalid_file_type", "Kies een geldig ZIP-bestand.", "validate_zip", requestId);
    const zipBuffer = decodeZip(payload.zipBase64 || payload.zip_base64);
    if (!zipBuffer.length) return fail(400, "missing_zip", "Kies eerst een ZIP-bestand.", "decode_zip", requestId);
    if (zipBuffer.length > MAX_COMPRESSED) return fail(413, "zip_too_large", "Dit ZIP-bestand is te groot om veilig te verwerken.", "validate_zip_size", requestId);
    if (websiteId) {
      const website = await readOne(context, "websites", `select=id,customer_id&id=eq.${websiteId}&limit=1`);
      if (!website?.id || text(website.customer_id) !== customerId) return fail(409, "customer_mismatch", "Deze website hoort niet bij de actieve klant.", "validate_website_ownership", requestId);
    }

    const extracted = extractZip(zipBuffer);
    const entryFile = resolveEntryFile(extracted.files);
    const contentHash = createHash("sha256").update(zipBuffer).digest("hex");
    const existing = await readRows(context, "website_preview_versions", `select=*&customer_id=eq.${customerId}&order=version.desc&limit=100`);
    let version = existing.find((row) => text(row.metadata?.manualZipContentHash) === contentHash) || null;
    let reused = Boolean(version);
    if (!version) {
      const now = new Date().toISOString();
      const versionNumber = Math.max(0, ...existing.map((row) => Number(row.version || 0))) + 1;
      const previewToken = randomBytes(18).toString("hex");
      const generatedPackage = {
        files: extracted.files,
        version: versionNumber,
        entryFile,
        meta: { previewSource: "manual_zip", fileName, contentHash, uploadedAt: now },
      };
      const rows = await insert(context, "website_preview_versions", {
        customer_id: customerId,
        project_id: projectId || null,
        website_id: websiteId || null,
        demo_journey_id: demoJourneyId || null,
        version: versionNumber,
        title: `${customer.company || customer.name || "Website"} — handmatige preview`,
        customer_summary: "Een handmatig aangeleverde websiteversie staat klaar.",
        change_summary: "Handmatige ZIP-preview verwerkt.",
        preview_token: previewToken,
        generated_package: generatedPackage,
        is_active: true,
        published_to_portal: false,
        allow_feedback: true,
        allow_approval: true,
        status: "internal",
        feedback_items: [],
        metadata: { manualZipContentHash: contentHash, previewSource: "manual_zip", entryFile, fileName },
        created_by: adminCheck.admin.id || null,
        created_at: now,
        updated_at: now,
      });
      version = rows[0] || null;
    }
    if (!version?.id) return fail(500, "preview_version_failed", "De previewversie kon niet worden opgeslagen.", "create_preview_version", requestId);
    version = await setActiveManualVersion(context, customerId, version);
    version = await ensureManualPreviewUrl(context, customerId, version);
    await persistJourneySource(context, demoJourneyId || version.demo_journey_id, version);
    await safeTimeline({ customerId, eventType: "manual_preview_uploaded", title: "Handmatige website geüpload", description: `${fileName} is veilig verwerkt.`, module: "website", referenceType: "website_preview_version", referenceId: version.id, actorName: adminCheck.admin.email || "Max Webstudio", actorRole: "admin", severity: "info", metadata: { dedupeKey: `manual_preview_uploaded:${contentHash}`, previewVersionId: version.id, source: "manual_zip", contentHash } });
    await safeTimeline({ customerId, eventType: "manual_preview_ready", title: "Handmatige preview klaar", description: "De websitepreview kan worden gecontroleerd en gepubliceerd.", module: "website", referenceType: "website_preview_version", referenceId: version.id, actorName: adminCheck.admin.email || "Max Webstudio", actorRole: "admin", severity: "success", metadata: { dedupeKey: `manual_preview_ready:${contentHash}`, previewVersionId: version.id, source: "manual_zip", contentHash } });
    return json(200, {
      success: true,
      requestId,
      reused,
      previewVersionId: version.id,
      source: "manual_zip",
      fileCount: extracted.files.length,
      entryFile,
      renderStatus: "ready",
      previewVersion: sanitize(version),
      message: "ZIP succesvol verwerkt. De websitepreview is klaar en kan nu naar het klantportaal worden gepubliceerd.",
    });
  } catch (error) {
    const phase = error.phase || phaseForCode(error.code);
    console.error("Manual preview upload failed", {
      errorName: error.name || "Error",
      errorMessage: error.message || "Unknown manual preview error",
      code: error.code || "zip_extract_failed",
      databaseCode: error.databaseCode || error.code || "",
      databaseMessage: error.databaseMessage || "",
      details: error.details || "",
      hint: error.hint || "",
      status: error.status || 500,
      phase,
      requestId,
    });
    return fail(error.status || 400, error.code || "zip_extract_failed", safeMessage(error), phase, requestId);
  }
};

async function activateManualVersion(context, customerId, demoJourneyId, payload = {}) {
  const previewVersionId = uuid(payload.previewVersionId || payload.preview_version_id);
  if (!previewVersionId) return fail(400, "preview_version_required", "Kies eerst een handmatige previewversie.");
  const version = await readOne(context, "website_preview_versions", `select=*&id=eq.${previewVersionId}&customer_id=eq.${customerId}&limit=1`);
  if (!version?.id || text(version.metadata?.previewSource) !== "manual_zip" || !Array.isArray(version.generated_package?.files) || !version.generated_package.files.length) {
    return fail(404, "manual_preview_not_found", "Deze handmatige previewversie is niet beschikbaar.");
  }
  let active = await setActiveManualVersion(context, customerId, version);
  active = await ensureManualPreviewUrl(context, customerId, active);
  await persistJourneySource(context, demoJourneyId || active.demo_journey_id, active);
  return json(200, {
    success: true,
    reused: true,
    previewVersionId: active.id,
    source: "manual_zip",
    fileCount: Array.isArray(active.generated_package?.files) ? active.generated_package.files.length : 0,
    entryFile: text(active.generated_package?.entryFile || active.metadata?.entryFile || "index.html"),
    renderStatus: "ready",
    previewVersion: sanitize(active),
    message: "Handmatige ZIP is nu de actieve previewbron.",
  });
}

async function ensureManualPreviewUrl(context, customerId, version) {
  const token = text(version.preview_token);
  if (!version?.id || !token) throw zipError("preview_version_failed", "De previewlink kon niet worden aangemaakt.", 500);
  const previewUrl = `/.netlify/functions/manual-preview-render?version=${encodeURIComponent(version.id)}&token=${encodeURIComponent(token)}`;
  if (text(version.preview_url) === previewUrl) return version;
  const rows = await patch(context, "website_preview_versions", `id=eq.${version.id}&customer_id=eq.${customerId}`, { preview_url: previewUrl, updated_at: new Date().toISOString() });
  return rows[0] || { ...version, preview_url: previewUrl };
}

async function setActiveManualVersion(context, customerId, version) {
  const now = new Date().toISOString();
  await patch(context, "website_preview_versions", `customer_id=eq.${customerId}&is_active=eq.true&id=neq.${version.id}`, { is_active: false, updated_at: now });
  const rows = await patch(context, "website_preview_versions", `id=eq.${version.id}&customer_id=eq.${customerId}`, {
    is_active: true,
    metadata: { ...(version.metadata || {}), previewSource: "manual_zip", activePreviewSource: "manual_zip" },
    updated_at: now,
  });
  return rows[0] || { ...version, is_active: true, updated_at: now };
}

async function persistJourneySource(context, demoJourneyId, version) {
  const journeyId = uuid(demoJourneyId);
  if (!journeyId) return;
  const journey = await readOne(context, "demo_journeys", `select=id,customer_id,preview_package&id=eq.${journeyId}&limit=1`);
  if (!journey?.id || text(journey.customer_id) !== text(version.customer_id)) return;
  const previewPackage = journey.preview_package && typeof journey.preview_package === "object" ? journey.preview_package : {};
  await patch(context, "demo_journeys", `id=eq.${journey.id}&customer_id=eq.${version.customer_id}`, {
    preview_package: {
      ...previewPackage,
      activePreviewSource: "manual_zip",
      manualPreview: {
        source: "manual_zip",
        previewVersionId: version.id,
        fileName: text(version.metadata?.fileName || version.generated_package?.meta?.fileName || "handmatige-preview.zip"),
        entryPath: text(version.metadata?.entryFile || version.generated_package?.entryFile || "index.html"),
        files: version.generated_package?.files || [],
        contentHash: text(version.metadata?.manualZipContentHash),
        updatedAt: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
  });
}

function extractZip(buffer) {
  const eocd = findSignature(buffer, 0x06054b50, Math.max(0, buffer.length - 65557));
  if (eocd < 0) throw zipError("zip_extract_failed", "Het ZIP-bestand kon niet worden uitgepakt.");
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (!totalEntries || totalEntries > MAX_FILES) throw zipError("zip_too_many_files", "Dit ZIP-bestand bevat te veel bestanden.");
  let offset = centralOffset;
  let unpacked = 0;
  const files = [];
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw zipError("zip_extract_failed", "Het ZIP-bestand kon niet worden uitgepakt.");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength).toString((flags & 0x800) ? "utf8" : "latin1");
    offset += 46 + nameLength + extraLength + commentLength;
    if (rawName.endsWith("/") || rawName.startsWith("__MACOSX/")) continue;
    const path = safePath(rawName);
    const unixType = (externalAttributes >>> 16) & 0xf000;
    if (unixType === 0xa000) throw zipError("unsafe_zip_path", "Dit ZIP-bestand bevat een niet-toegestane koppeling.");
    if (![0, 8].includes(method)) throw zipError("zip_extract_failed", "Het ZIP-bestand gebruikt een niet-ondersteunde compressiemethode.");
    if (compressedSize && uncompressedSize / compressedSize > MAX_RATIO) throw zipError("zip_unpacked_too_large", "Dit ZIP-bestand kan niet veilig worden uitgepakt.");
    unpacked += uncompressedSize;
    if (unpacked > MAX_UNPACKED) throw zipError("zip_unpacked_too_large", "De uitgepakte website is te groot om veilig te verwerken.");
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw zipError("zip_extract_failed", "Het ZIP-bestand kon niet worden uitgepakt.");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? zlib.inflateRawSync(compressed, { maxOutputLength: Math.min(MAX_UNPACKED, uncompressedSize + 1) }) : compressed;
    if (data.length !== uncompressedSize) throw zipError("zip_extract_failed", "Het ZIP-bestand kon niet volledig worden uitgepakt.");
    files.push(serializeFile(path, data));
  }
  if (!files.length) throw zipError("zip_extract_failed", "Het ZIP-bestand bevat geen bruikbare websitebestanden.");
  return { files, unpackedBytes: unpacked };
}

function safePath(value = "") {
  let decoded = text(value).replace(/\\/g, "/");
  try { decoded = decodeURIComponent(decoded); } catch {}
  decoded = decoded.replace(/^\.\//, "");
  if (!decoded || decoded.startsWith("/") || /^[a-z]:/i.test(decoded) || decoded.split("/").includes("..")) throw zipError("unsafe_zip_path", "Dit ZIP-bestand bevat een onveilig bestandspad.");
  const extension = decoded.split(".").pop().toLowerCase();
  const basename = decoded.split("/").pop();
  if (!allowedExtensions.has(extension) && !["_headers", "_redirects"].includes(basename)) throw zipError("invalid_file_type", "Dit ZIP-bestand bevat een niet-ondersteund bestandstype.");
  return decoded;
}

function resolveEntryFile(files = []) {
  const paths = files.map((file) => file.path);
  if (paths.includes("index.html")) return "index.html";
  const candidates = paths.filter((path) => /^[^/]+\/index\.html$/i.test(path));
  const roots = new Set(candidates.map((path) => path.split("/")[0]));
  if (candidates.length === 1 && roots.size === 1) {
    const root = `${[...roots][0]}/`;
    files.forEach((file) => { file.path = file.path.startsWith(root) ? file.path.slice(root.length) : file.path; });
    return "index.html";
  }
  if (candidates.length > 1) throw zipError("ambiguous_entry_file", "In dit ZIP-bestand staan meerdere mogelijke websites.");
  throw zipError("index_not_found", "In dit ZIP-bestand is geen index.html gevonden.");
}

function serializeFile(path, data) {
  const binary = /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp4|webm)$/i.test(path);
  return { path, content: binary ? data.toString("base64") : data.toString("utf8"), encoding: binary ? "base64" : "utf8", size: data.length };
}
function findSignature(buffer, signature, start) { for (let i = buffer.length - 22; i >= start; i -= 1) if (buffer.readUInt32LE(i) === signature) return i; return -1; }
function decodeZip(value) { try { return Buffer.from(text(value), "base64"); } catch { return Buffer.alloc(0); } }
function zipError(code, message, status = 400) { const error = new Error(message); error.code = code; error.status = status; return error; }
function safeMessage(error) { return error.code ? error.message : "Het ZIP-bestand kon niet worden verwerkt."; }
function sanitize(row = {}) { return { id: text(row.id), customerId: text(row.customer_id), projectId: text(row.project_id), websiteId: text(row.website_id), demoJourneyId: text(row.demo_journey_id), version: Number(row.version || 1), title: text(row.title), previewSource: "manual_zip", status: text(row.status || "internal"), previewUrl: text(row.preview_url), previewToken: text(row.preview_token), createdAt: text(row.created_at), contentHash: text(row.metadata?.manualZipContentHash) }; }
function uuid(value) { const clean = text(value); return uuidPattern.test(clean) ? clean : ""; }
function text(value = "") { return String(value || "").trim(); }
function getContext(admin) { const supabaseUrl = text(process.env.SUPABASE_URL).replace(/\/$/, ""); const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY); return { available: Boolean(supabaseUrl && serviceRoleKey), supabaseUrl, serviceRoleKey, admin }; }
function headers(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json", Prefer: "return=representation" }; }
async function readRows(context, table, query) { return request(`${context.supabaseUrl}/rest/v1/${table}?${query}`, { headers: headers(context.serviceRoleKey) }); }
async function readOne(context, table, query) { const rows = await readRows(context, table, query); return rows[0] || null; }
async function insert(context, table, record) { return request(`${context.supabaseUrl}/rest/v1/${table}`, { method: "POST", headers: headers(context.serviceRoleKey), body: JSON.stringify(record) }); }
async function patch(context, table, filter, record) { return request(`${context.supabaseUrl}/rest/v1/${table}?${filter}`, { method: "PATCH", headers: headers(context.serviceRoleKey), body: JSON.stringify(record) }); }
async function request(url, options) { const response = await fetch(url, options); const body = await response.json().catch(() => null); if (!response.ok) { const error = zipError("preview_version_failed", "De previewversie kon niet worden opgeslagen.", response.status); error.databaseCode = text(body?.code); error.databaseMessage = text(body?.message || body?.error); error.details = text(body?.details); error.hint = text(body?.hint); error.phase = options?.method === "POST" ? "create_preview_version" : options?.method === "PATCH" ? "persist_preview_version" : "fetch_preview_data"; throw error; } return Array.isArray(body) ? body : []; }
async function safeTimeline(input) { try { return await createTimelineEvent(input); } catch (error) { console.error("Manual preview timeline skipped", { message: error.message }); return null; } }
function phaseForCode(code = "") { if (String(code).startsWith("zip_") || ["invalid_file_type", "unsafe_zip_path", "index_not_found", "ambiguous_entry_file"].includes(code)) return "validate_and_extract_zip"; if (code === "preview_version_failed") return "persist_preview_version"; return "manual_preview_upload"; }
function fail(status, code, error, phase = "manual_preview_upload", requestId = "") { return json(status, { success: false, code, error, details: phase, requestId }); }
function json(statusCode, body) { return { statusCode, headers: { "Content-Type": "application/json", ...corsHeaders({ methods: "POST, OPTIONS" }) }, body: statusCode === 204 ? "" : JSON.stringify(body) }; }

exports._private = { extractZip, resolveEntryFile, safePath };
