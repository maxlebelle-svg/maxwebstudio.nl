const { corsHeaders } = require("./_cors");
const { injectEditorRuntime, parseEditorContext, requestOrigin } = require("./_preview-editor-runtime");
const { binaryAssetResponse, contentTypeForPreviewAsset, isMediaPreviewAsset, rewriteCssAssetReferences, rewriteHtmlAssetAttributes } = require("./_preview-assets");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, "", "text/plain; charset=utf-8");
  if (!["GET", "HEAD"].includes(event.httpMethod)) return response(405, "Methode niet toegestaan.", "text/plain; charset=utf-8");
  const context = getContext();
  if (!context.available) return response(500, "Previewomgeving is niet geconfigureerd.", "text/plain; charset=utf-8");
  const versionId = uuid(event.queryStringParameters?.version || event.queryStringParameters?.versionId);
  const requestedPreviewVersionId = text(event.queryStringParameters?.previewVersionId);
  const requestedSource = text(event.queryStringParameters?.source).toLowerCase();
  const token = text(event.queryStringParameters?.token);
  const requestedFile = safeFilePath(event.queryStringParameters?.file || "index.html");
  if (!versionId || !token) return response(400, "Previewlink is niet geldig.", "text/plain; charset=utf-8");
  if (requestedPreviewVersionId && uuid(requestedPreviewVersionId) !== versionId) return response(409, "Previewversie hoort niet bij deze previewlink.", "text/plain; charset=utf-8");
  if (requestedSource && requestedSource !== "manual_zip") return response(409, "Previewbron hoort niet bij deze previewversie.", "text/plain; charset=utf-8");
  try {
    const rows = await request(`${context.supabaseUrl}/rest/v1/website_preview_versions?select=id,preview_token,generated_package,status,is_active&id=eq.${versionId}&limit=1`, { headers: headers(context.serviceRoleKey) });
    const version = rows[0];
    if (!version?.id || !safeEqual(token, text(version.preview_token))) return response(404, "Preview niet gevonden.", "text/plain; charset=utf-8");
    const files = Array.isArray(version.generated_package?.files) ? version.generated_package.files : [];
    const entry = text(version.generated_package?.entryFile || "index.html");
    const file = files.find((item) => safeFilePath(item.path) === requestedFile)
      || (requestedFile === "index.html" ? files.find((item) => safeFilePath(item.path) === entry || /(?:^|\/)index\.html$/i.test(item.path || "")) : null);
    if (!file) return response(404, "Previewbestand niet gevonden.", "text/plain; charset=utf-8");
    if (file.encoding === "base64" && !isText(file.path)) {
      return binaryAssetResponse({ event, buffer: Buffer.from(text(file.content), "base64"), contentType: contentType(file.path), headers: responseHeaders(contentType(file.path)), rangeEnabled: isMediaPreviewAsset(file.path) });
    }
    const raw = file.encoding === "base64" ? Buffer.from(text(file.content), "base64").toString("utf8") : String(file.content || "");
    const editorContext = parseEditorContext(event.queryStringParameters, {
      filePath: requestedFile,
      previewVersionId: version.id,
      source: "manual_zip",
      manifest: version.generated_package?.meta?.editorManifest,
    });
    if (text(event.queryStringParameters?.editorMode) === "sections" && !editorContext) return response(400, "Editorcontext is niet geldig.", "text/plain; charset=utf-8");
    const body = /\.html?$/i.test(file.path || "")
      ? rewriteHtml(raw, versionId, token, editorContext, requestOrigin(event), file.path)
      : /\.css$/i.test(file.path || "") ? rewriteCss(raw, versionId, token, file.path) : raw;
    return response(200, event.httpMethod === "HEAD" ? "" : body, contentType(file.path), event.httpMethod === "HEAD" ? { "Content-Length": String(Buffer.byteLength(body)) } : {});
  } catch (error) {
    console.error("Manual preview render failed", { errorName: error.name || "Error", errorMessage: error.message || "Unknown render error", code: error.code || "MANUAL_PREVIEW_RENDER_FAILED", phase: "render_manual_preview", status: error.status || 500 });
    return response(error.status || 500, "Preview kon niet worden geladen.", "text/plain; charset=utf-8");
  }
};

function route(versionId, token, file) { return `/.netlify/functions/manual-preview-render?version=${encodeURIComponent(versionId)}&token=${encodeURIComponent(token)}&source=manual_zip&previewVersionId=${encodeURIComponent(versionId)}&file=${encodeURIComponent(safeFilePath(file))}`; }
function rewriteHtml(value, id, token, editorContext = null, origin = "", currentFile = "index.html") { const rewritten = rewriteHtmlAssetAttributes(rewriteCss(String(value || ""), id, token, currentFile), { currentFile, route: (file) => route(id, token, file) });
  return injectEditorRuntime(rewritten, editorContext, origin);
}
function rewriteCss(value, id, token, currentFile = "index.html") { return rewriteCssAssetReferences(value, { currentFile, route: (file) => route(id, token, file) }); }
function safeFilePath(value = "") { const clean = text(value).replace(/\\/g, "/").replace(/^\.\//, "").split(/[?#]/)[0]; return clean && !clean.startsWith("/") && !clean.split("/").includes("..") ? clean : ""; }
function safeEqual(left, right) { if (!left || left.length !== right.length) return false; return require("crypto").timingSafeEqual(Buffer.from(left), Buffer.from(right)); }
function isText(path = "") { return /\.(html?|css|js|mjs|json|xml|txt|svg)$/i.test(path); }
function contentType(path = "") { return contentTypeForPreviewAsset(path); }
function getContext() { const supabaseUrl = text(process.env.SUPABASE_URL).replace(/\/$/, ""); const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY); return { available: Boolean(supabaseUrl && serviceRoleKey), supabaseUrl, serviceRoleKey }; }
function headers(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }; }
async function request(url, options) { const result = await fetch(url, options); const body = await result.json().catch(() => null); if (!result.ok) { const error = new Error(body?.message || "Previewdata kon niet worden geladen."); error.status = result.status; error.code = body?.code || ""; throw error; } return Array.isArray(body) ? body : []; }
function responseHeaders(type) { return { ...corsHeaders({ methods: "GET, HEAD, OPTIONS" }), "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; form-action 'self' mailto:; object-src 'none'; base-uri 'none'" }; }
function response(statusCode, body, type, extraHeaders = {}) { return { statusCode, headers: { ...responseHeaders(type), ...extraHeaders }, body: statusCode === 204 ? "" : body }; }
function uuid(value) { const clean = text(value); return uuidPattern.test(clean) ? clean : ""; }
function text(value = "") { return String(value || "").trim(); }

exports._private = { rewriteHtml, rewriteCss, safeFilePath, contentType, route };
