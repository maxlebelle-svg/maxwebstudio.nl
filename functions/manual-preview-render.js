const { corsHeaders } = require("./_cors");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, "", "text/plain; charset=utf-8");
  if (event.httpMethod !== "GET") return response(405, "Methode niet toegestaan.", "text/plain; charset=utf-8");
  const context = getContext();
  if (!context.available) return response(500, "Previewomgeving is niet geconfigureerd.", "text/plain; charset=utf-8");
  const versionId = uuid(event.queryStringParameters?.version || event.queryStringParameters?.versionId);
  const token = text(event.queryStringParameters?.token);
  const requestedFile = safeFilePath(event.queryStringParameters?.file || "index.html");
  if (!versionId || !token) return response(400, "Previewlink is niet geldig.", "text/plain; charset=utf-8");
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
      return { statusCode: 200, isBase64Encoded: true, headers: responseHeaders(contentType(file.path)), body: text(file.content) };
    }
    const raw = file.encoding === "base64" ? Buffer.from(text(file.content), "base64").toString("utf8") : String(file.content || "");
    const body = /\.html?$/i.test(file.path || "") ? rewriteHtml(raw, versionId, token) : /\.css$/i.test(file.path || "") ? rewriteCss(raw, versionId, token) : raw;
    return response(200, body, contentType(file.path));
  } catch (error) {
    console.error("Manual preview render failed", { errorName: error.name || "Error", errorMessage: error.message || "Unknown render error", code: error.code || "MANUAL_PREVIEW_RENDER_FAILED", phase: "render_manual_preview", status: error.status || 500 });
    return response(error.status || 500, "Preview kon niet worden geladen.", "text/plain; charset=utf-8");
  }
};

function route(versionId, token, file) { return `/.netlify/functions/manual-preview-render?version=${encodeURIComponent(versionId)}&token=${encodeURIComponent(token)}&file=${encodeURIComponent(safeFilePath(file))}`; }
function rewriteHtml(value, id, token) { return rewriteCss(String(value || ""), id, token)
  .replace(/(src|href)=["'](?!https?:|mailto:|tel:|#|data:|javascript:|\/)([^"']+)["']/gi, (_m, attr, file) => `${attr}="${route(id, token, file)}"`); }
function rewriteCss(value, id, token) { return String(value || "").replace(/url\(["']?(?!https?:|data:|\/)([^"')]+)["']?\)/gi, (_m, file) => `url("${route(id, token, file)}")`); }
function safeFilePath(value = "") { const clean = text(value).replace(/\\/g, "/").replace(/^\.\//, "").split(/[?#]/)[0]; return clean && !clean.startsWith("/") && !clean.split("/").includes("..") ? clean : ""; }
function safeEqual(left, right) { if (!left || left.length !== right.length) return false; return require("crypto").timingSafeEqual(Buffer.from(left), Buffer.from(right)); }
function isText(path = "") { return /\.(html?|css|js|mjs|json|xml|txt|svg)$/i.test(path); }
function contentType(path = "") { const lower = text(path).toLowerCase(); if (/\.html?$/.test(lower)) return "text/html; charset=utf-8"; if (lower.endsWith(".css")) return "text/css; charset=utf-8"; if (/\.m?js$/.test(lower)) return "application/javascript; charset=utf-8"; if (lower.endsWith(".svg")) return "image/svg+xml"; if (lower.endsWith(".png")) return "image/png"; if (/\.jpe?g$/.test(lower)) return "image/jpeg"; if (lower.endsWith(".webp")) return "image/webp"; if (lower.endsWith(".ico")) return "image/x-icon"; if (lower.endsWith(".woff2")) return "font/woff2"; if (lower.endsWith(".woff")) return "font/woff"; return "application/octet-stream"; }
function getContext() { const supabaseUrl = text(process.env.SUPABASE_URL).replace(/\/$/, ""); const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY); return { available: Boolean(supabaseUrl && serviceRoleKey), supabaseUrl, serviceRoleKey }; }
function headers(key) { return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }; }
async function request(url, options) { const result = await fetch(url, options); const body = await result.json().catch(() => null); if (!result.ok) { const error = new Error(body?.message || "Previewdata kon niet worden geladen."); error.status = result.status; error.code = body?.code || ""; throw error; } return Array.isArray(body) ? body : []; }
function responseHeaders(type) { return { ...corsHeaders({ methods: "GET, OPTIONS" }), "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'" }; }
function response(statusCode, body, type) { return { statusCode, headers: responseHeaders(type), body: statusCode === 204 ? "" : body }; }
function uuid(value) { const clean = text(value); return uuidPattern.test(clean) ? clean : ""; }
function text(value = "") { return String(value || "").trim(); }

exports._private = { rewriteHtml, rewriteCss, safeFilePath, contentType, route };
