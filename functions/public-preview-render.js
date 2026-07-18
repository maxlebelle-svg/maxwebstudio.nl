"use strict";

const { corsHeaders } = require("./_cors");
const { isValidPublicSlug, slugFromEvent } = require("./_public-preview");
const { binaryAssetResponse, contentTypeForPreviewAsset, isMediaPreviewAsset, resolveRelativePreviewPath, rewriteCssAssetReferences, rewriteHtmlAssetAttributes } = require("./_preview-assets");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_STATUSES = new Set(["ready_for_review", "feedback_received", "revision_in_progress", "approved"]);
const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 120;
const requestWindows = new Map();

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, "", "text/plain; charset=utf-8");
  if (!["GET", "HEAD"].includes(event.httpMethod)) return brandedError(405, "Deze pagina is niet beschikbaar.");
  if (!allowRequest(event)) return brandedError(429, "Te veel verzoeken. Probeer het over een minuut opnieuw.", { "Retry-After": "60" });

  const context = getContext();
  if (!context.available) return brandedError(503, "Deze preview is tijdelijk niet beschikbaar.");
  const slug = slugFromEvent(event);
  if (!isValidPublicSlug(slug)) return brandedError(404, "Deze preview bestaat niet of is niet meer beschikbaar.");
  const requestedFile = safeFilePath(event.queryStringParameters?.file || "index.html");
  if (!requestedFile) return brandedError(404, "Dit previewbestand bestaat niet.");

  try {
    const target = await resolvePublicTarget(context, slug);
    if (target?.revoked) return brandedError(410, "Deze gedeelde preview is ingetrokken.");
    const version = target?.version;
    if (!version?.id) return brandedError(404, "Deze preview bestaat niet of is niet meer beschikbaar.");

    const files = Array.isArray(version.generated_package?.files) ? version.generated_package.files : [];
    const entry = safeFilePath(version.generated_package?.entryFile || "index.html");
    const file = files.find((item) => safeFilePath(item.path) === requestedFile)
      || (requestedFile === "index.html" ? files.find((item) => safeFilePath(item.path) === entry || /(?:^|\/)index\.html$/i.test(item.path || "")) : null);
    if (!file) return brandedError(404, "Dit previewbestand bestaat niet.");

    const type = contentType(file.path);
    if (file.encoding === "base64" && !isText(file.path)) {
      return binaryAssetResponse({ event, buffer: Buffer.from(text(file.content), "base64"), contentType: type, headers: responseHeaders(type), rangeEnabled: isMediaPreviewAsset(file.path) });
    }
    const raw = file.encoding === "base64" ? Buffer.from(text(file.content), "base64").toString("utf8") : String(file.content || "");
    const body = /\.html?$/i.test(file.path || "")
      ? rewriteHtml(raw, requestedFile)
      : /\.css$/i.test(file.path || "") ? rewriteCss(raw, requestedFile) : raw;
    return response(200, event.httpMethod === "HEAD" ? "" : body, type, event.httpMethod === "HEAD" ? { "Content-Length": String(Buffer.byteLength(body)) } : {});
  } catch (error) {
    console.error("Public preview render failed", { message: error.message, status: error.status || 500, code: error.code || "PUBLIC_PREVIEW_FAILED" });
    return brandedError(error.status === 429 ? 429 : 503, "Deze preview is tijdelijk niet beschikbaar.");
  }
};

async function resolvePublicTarget(context, slug) {
  const publication = await readGenericPublication(context, slug);
  if (publication?.id) {
    if (publication.enabled !== true || publication.revoked_at) return { revoked: true };
    const versionId = uuid(publication.preview_version_id);
    const relationshipId = uuid(publication.relationship_id);
    const relationshipType = text(publication.relationship_type).toLowerCase();
    if (!versionId || !relationshipId || !["lead", "customer"].includes(relationshipType)) return null;
    const versions = await request(`${context.supabaseUrl}/rest/v1/website_preview_versions?select=id,customer_id,demo_journey_id,title,status,published_to_portal,generated_package&id=eq.${encodeURIComponent(versionId)}&limit=1`, context.serviceRoleKey);
    const version = versions[0];
    if (!version?.id || text(version.status).toLowerCase() === "archived" || !Array.isArray(version.generated_package?.files) || !version.generated_package.files.length) return null;
    if (!await genericOwnershipMatches(context, relationshipType, relationshipId, version)) return null;
    return { version };
  }
  return resolveLegacyCustomerTarget(context, slug);
}

async function readGenericPublication(context, slug) {
  try {
    const rows = await request(`${context.supabaseUrl}/rest/v1/public_preview_publications?select=id,relationship_type,relationship_id,preview_version_id,enabled,revoked_at&public_slug=eq.${encodeURIComponent(slug)}&limit=1`, context.serviceRoleKey);
    return rows[0] || null;
  } catch (error) {
    if (isMissingPublicationTable(error)) return null;
    throw error;
  }
}

async function genericOwnershipMatches(context, relationshipType, relationshipId, version) {
  const journeyId = uuid(version.demo_journey_id);
  const journeys = journeyId
    ? await request(`${context.supabaseUrl}/rest/v1/demo_journeys?select=id,lead_id,customer_id&id=eq.${encodeURIComponent(journeyId)}&limit=1`, context.serviceRoleKey)
    : [];
  const journey = journeys[0] || null;
  if (relationshipType === "lead") return Boolean(journey?.id && uuid(journey.lead_id) === relationshipId);
  return uuid(version.customer_id) === relationshipId || uuid(journey?.customer_id) === relationshipId;
}

async function resolveLegacyCustomerTarget(context, slug) {
  const customers = await request(`${context.supabaseUrl}/rest/v1/customers?select=id,metadata,public_preview_slug,public_preview_enabled,public_preview_revoked_at&public_preview_slug=eq.${encodeURIComponent(slug)}&limit=1`, context.serviceRoleKey);
  const customer = customers[0];
  if (!customer?.id) return null;
  if (customer.public_preview_enabled !== true || customer.public_preview_revoked_at) return { revoked: true };
  const versionId = uuid(customer.metadata?.publishedPreviewVersionId);
  if (!versionId) return null;
  const versions = await request(`${context.supabaseUrl}/rest/v1/website_preview_versions?select=id,customer_id,title,status,published_to_portal,generated_package&id=eq.${encodeURIComponent(versionId)}&customer_id=eq.${encodeURIComponent(customer.id)}&published_to_portal=eq.true&limit=1`, context.serviceRoleKey);
  const version = versions[0];
  return version?.id && PUBLIC_STATUSES.has(text(version.status)) ? { version } : null;
}

function isMissingPublicationTable(error = {}) {
  const details = [error.code, error.message].map(text).join(" ").toLowerCase();
  return error.code === "42P01" || error.code === "PGRST205" || details.includes("public_preview_publications");
}

function assetRoute(file = "") {
  return `?file=${encodeURIComponent(safeFilePath(file))}`;
}

function rewriteHtml(value = "", currentFile = "index.html") {
  return rewriteHtmlAssetAttributes(rewriteCss(String(value || ""), currentFile), { currentFile, route: assetRoute });
}

function rewriteCss(value = "", currentFile = "index.html") {
  return rewriteCssAssetReferences(value, { currentFile, route: assetRoute });
}

function resolveFileReference(value = "", currentFile = "index.html") {
  return resolveRelativePreviewPath(value, currentFile);
}

function safeFilePath(value = "") {
  const clean = text(value).replace(/\\/g, "/").replace(/^\.?\//, "").split(/[?#]/)[0];
  return clean && !clean.startsWith("/") && !clean.split("/").includes("..") ? clean : "";
}

function allowRequest(event = {}, now = Date.now()) {
  const forwarded = text(event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"]).split(",")[0].trim();
  const key = forwarded || text(event.headers?.["x-nf-client-connection-ip"] || event.headers?.["X-Nf-Client-Connection-Ip"]) || "unknown";
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    if (requestWindows.size > 1000) pruneWindows(now);
    return true;
  }
  current.count += 1;
  return current.count <= REQUEST_LIMIT;
}

function pruneWindows(now = Date.now()) {
  for (const [key, value] of requestWindows.entries()) {
    if (now - value.startedAt >= WINDOW_MS) requestWindows.delete(key);
  }
}

function brandedError(statusCode, message, extraHeaders = {}) {
  const title = statusCode === 410 ? "Preview ingetrokken" : statusCode === 429 ? "Even geduld" : "Preview niet beschikbaar";
  const body = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${title} · Max Webstudio</title><style>html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#031524;color:#eef7ff;font:16px/1.6 Inter,system-ui,sans-serif}main{width:min(560px,100%);padding:42px;border:1px solid #17496b;border-radius:22px;background:linear-gradient(145deg,#08253b,#041827);box-shadow:0 24px 70px #0007}.brand{display:flex;align-items:center;gap:12px;color:#52cfff;font-weight:900;letter-spacing:.02em}.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:#07111d;color:white;font-size:24px}h1{margin:28px 0 10px;font-size:clamp(28px,6vw,42px);line-height:1.08}p{margin:0;color:#a9bfd2}small{display:block;margin-top:28px;color:#6f91aa}</style></head><body><main><div class="brand"><span class="mark">M</span>Max Webstudio</div><h1>${title}</h1><p>${escapeHtml(message)}</p><small>Veilige website-preview</small></main></body></html>`;
  return response(statusCode, body, "text/html; charset=utf-8", extraHeaders);
}

function responseHeaders(type, extra = {}) {
  return {
    ...corsHeaders({ methods: "GET, HEAD, OPTIONS" }),
    "Content-Type": type,
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": "default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src https:; frame-ancestors 'self'; form-action 'self' mailto: tel:; object-src 'none'; base-uri 'none'",
    ...extra,
  };
}

function response(statusCode, body, type, extraHeaders = {}) {
  return { statusCode, headers: responseHeaders(type, extraHeaders), body: statusCode === 204 ? "" : body };
}

async function request(url, serviceRoleKey) {
  const result = await fetch(url, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Accept: "application/json" } });
  const body = await result.json().catch(() => null);
  if (!result.ok) {
    const error = new Error(body?.message || "Previewdata kon niet worden geladen.");
    error.status = result.status;
    error.code = body?.code || "";
    throw error;
  }
  return Array.isArray(body) ? body : [];
}

function getContext() {
  const supabaseUrl = text(process.env.SUPABASE_URL).replace(/\/$/, "");
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { available: Boolean(supabaseUrl && serviceRoleKey), supabaseUrl, serviceRoleKey };
}

function uuid(value = "") { const clean = text(value); return UUID_PATTERN.test(clean) ? clean : ""; }
function text(value = "") { return String(value || "").trim(); }
function isText(path = "") { return /\.(html?|css|js|mjs|json|xml|txt|svg)$/i.test(path); }
function contentType(path = "") { return contentTypeForPreviewAsset(path); }
function escapeHtml(value = "") { return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }

exports._private = { PUBLIC_STATUSES, REQUEST_LIMIT, allowRequest, assetRoute, contentType, genericOwnershipMatches, readGenericPublication, requestWindows, resolveFileReference, resolvePublicTarget, rewriteCss, rewriteHtml, safeFilePath };
