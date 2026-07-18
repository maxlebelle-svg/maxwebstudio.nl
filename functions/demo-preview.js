const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders: sharedCorsHeaders } = require("./_cors");
const { resolveActiveDemoPreview } = require("./_demo-preview-source");
const { injectEditorRuntime, parseEditorContext, requestOrigin, UUID_PATTERN } = require("./_preview-editor-runtime");
const { normalizePreviewSource, previewSourceForVersion } = require("./_preview-zip");
const { binaryAssetResponse, contentTypeForPreviewAsset, isMediaPreviewAsset, rewriteCssAssetReferences, rewriteHtmlAssetAttributes } = require("./_preview-assets");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, "", {});
  if (!["GET", "HEAD"].includes(event.httpMethod)) return response(405, "Methode niet toegestaan.", { "Content-Type": "text/plain; charset=utf-8" });

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) return response(500, "Preview service is nog niet geconfigureerd.", { "Content-Type": "text/plain; charset=utf-8" });

  const id = cleanText(event.queryStringParameters?.id);
  const token = cleanText(event.queryStringParameters?.token);
  const format = cleanText(event.queryStringParameters?.format).toLowerCase();
  const rawSource = cleanText(event.queryStringParameters?.source).toLowerCase();
  const source = normalizePreviewSource(rawSource);
  const requestedFilePath = cleanText(event.queryStringParameters?.file);
  const requestedPreviewVersionId = cleanText(event.queryStringParameters?.previewVersionId);
  if (!id) return response(400, "Preview id ontbreekt.", { "Content-Type": "text/plain; charset=utf-8" });
  if (rawSource && !source) return response(400, "Previewbron is niet geldig. Gebruik factory of manual_zip.", { "Content-Type": "text/plain; charset=utf-8" });
  if (requestedPreviewVersionId && !UUID_PATTERN.test(requestedPreviewVersionId)) return response(400, "Previewversie is niet geldig.", { "Content-Type": "text/plain; charset=utf-8" });

  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/demo_journeys?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const row = rows[0];
  if (!row) return response(404, "Preview niet gevonden.", { "Content-Type": "text/plain; charset=utf-8" });

  const storedToken = cleanText(row.preview_token);
  if (storedToken && token !== storedToken) {
    const adminCheck = await verifyAdmin(event, jsonResponse, {
      module: "demo_preview",
      action: "read",
      allowedRoles: ["super_admin", "admin", "sales_manager", "sales_partner"],
      allowedStatuses: ["active", "invited"],
    });
    if (!adminCheck.success) return response(403, "Previewlink is niet geldig.", { "Content-Type": "text/plain; charset=utf-8" });
  }

  const factorySourceRequested = source === "factory";
  let previewVersion = null;
  if (factorySourceRequested || requestedPreviewVersionId) {
    previewVersion = await readPreviewVersion({
      supabaseUrl,
      serviceRoleKey,
      demoJourneyId: id,
      previewVersionId: requestedPreviewVersionId,
      token,
    });
  }
  if (requestedPreviewVersionId && !previewVersion?.id) return response(404, "Previewversie niet gevonden.", { "Content-Type": "text/plain; charset=utf-8" });
  const versionSource = previewVersion ? previewSourceForVersion(previewVersion) : "";
  if (requestedPreviewVersionId && !versionSource) return response(409, "Previewversie heeft geen geldige bron.", { "Content-Type": "text/plain; charset=utf-8" });
  if (requestedPreviewVersionId && source && source !== versionSource) return response(409, "Previewbron hoort niet bij deze previewversie.", { "Content-Type": "text/plain; charset=utf-8" });
  let previewPackage = requestedPreviewVersionId
    ? previewVersion.generated_package
    : factorySourceRequested && hasRenderablePackage(previewVersion?.generated_package)
      ? previewVersion.generated_package
      : normalizePackage(row.preview_package, row, source);
  if (requestedPreviewVersionId && !hasRenderablePackage(previewPackage)) return response(409, "Previewversie bevat geen renderbaar pakket.", { "Content-Type": "text/plain; charset=utf-8" });
  const resolvedSource = requestedPreviewVersionId ? versionSource : source;
  const filePath = resolvePreviewFilePath(previewPackage, requestedFilePath);
  let editorContext = null;
  if (cleanText(event.queryStringParameters?.editorMode) === "sections") {
    const previewVersionId = requestedPreviewVersionId;
    if (!UUID_PATTERN.test(previewVersionId)) return response(400, "Editorcontext is niet geldig.", { "Content-Type": "text/plain; charset=utf-8" });
    const versionToken = cleanText(previewVersion?.preview_token);
    if (!previewVersion?.id || (versionToken && versionToken !== token)) return response(403, "Editorcontext is niet geldig.", { "Content-Type": "text/plain; charset=utf-8" });
    const editorSource = resolvedSource === "manual_zip" ? "manual_zip" : "factory";
    if (previewVersion.generated_package?.files?.length) previewPackage = previewVersion.generated_package;
    editorContext = parseEditorContext(event.queryStringParameters, {
      filePath,
      previewVersionId: previewVersion.id,
      source: editorSource,
      manifest: previewPackage.meta?.editorManifest,
    });
    if (!editorContext) return response(400, "Editorcontext is niet geldig.", { "Content-Type": "text/plain; charset=utf-8" });
  }
  if (format === "zip") {
    return jsonResponse(400, {
      success: false,
      code: "ZIP_DOWNLOAD_ROUTE_REQUIRED",
      error: "ZIP-downloads worden via de beveiligde downloadroute voorbereid.",
      endpoint: "/.netlify/functions/admin-preview-zip-download",
      previewVersionId: requestedPreviewVersionId || null,
    });
  }

  const file = previewPackage.files.find((item) => item.path === filePath)
    || (!requestedFilePath ? previewPackage.files.find((item) => item.path.endsWith("index.html")) || previewPackage.files[0] : null);
  if (!file) return response(404, "Previewbestand niet gevonden.", { "Content-Type": "text/plain; charset=utf-8" });
  if (file?.encoding === "base64" && !isTextPreviewFile(file.path)) {
    return binaryAssetResponse({ event, buffer: Buffer.from(file.content || "", "base64"), contentType: contentTypeFor(file.path), headers: { ...corsHeaders(), ...previewSecurityHeaders(), "Cache-Control": "no-store" }, rangeEnabled: isMediaPreviewAsset(file.path) });
  }
  const fileContent = file?.encoding === "base64" ? Buffer.from(file.content || "", "base64").toString("utf8") : file?.content || "";
  const resolvedPreviewVersionId = cleanText(previewVersion?.id || requestedPreviewVersionId);
  let content = file?.path?.endsWith(".html")
    ? rewritePreviewHtml(inlinePreviewPackageAssets(fileContent, previewPackage, { id, token, source: resolvedSource, previewVersionId: resolvedPreviewVersionId }), id, token, resolvedSource, resolvedPreviewVersionId, file.path)
    : file?.path?.endsWith(".css")
      ? rewritePreviewAssetReferences(fileContent, id, token, resolvedSource, resolvedPreviewVersionId, file.path)
    : fileContent;
  if (file?.path?.endsWith(".html") && editorContext) content = injectEditorRuntime(content, editorContext, requestOrigin(event));
  const responseContent = content || "<!doctype html><title>Preview</title><p>Previewpakket is leeg.</p>";
  return response(200, event.httpMethod === "HEAD" ? "" : responseContent, {
    "Content-Type": contentTypeFor(file?.path),
    "Cache-Control": "no-store",
    ...(event.httpMethod === "HEAD" ? { "Content-Length": String(Buffer.byteLength(responseContent)) } : {}),
  });
};

function normalizePackage(value, row = {}, requestedSource = "") {
  if (value && typeof value === "object") {
    const resolved = resolveActiveDemoPreview(value, requestedSource);
    if (resolved.source && !resolved.available) return unavailablePreviewPackage(row, resolved.source);
    if (resolved.available) return resolved.previewPackage;
  }
  if (value && typeof value === "object" && Array.isArray(value.files) && value.files.length) return value;
  const businessName = cleanText(row.business_name) || "Demo preview";
  const briefing = cleanText(row.generated_briefing);
  return {
    businessName,
    files: [
      {
        path: "index.html",
        content: `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(businessName)}</title><style>body{font-family:Inter,Arial,sans-serif;margin:0;padding:48px;background:#f6f8fb;color:#132238}main{max-width:860px;margin:auto;background:#fff;border:1px solid #dbe4ef;border-radius:8px;padding:32px}h1{font-size:clamp(2rem,6vw,4rem);line-height:1}p{line-height:1.7;color:#5c697a;white-space:pre-wrap}</style></head><body><main><span>Eerste website-preview</span><h1>${escapeHtml(businessName)}</h1><p>${escapeHtml(briefing || "Preview wordt voorbereid.")}</p></main></body></html>`,
      },
      { path: "briefing.txt", content: briefing },
    ],
  };
}

function unavailablePreviewPackage(row = {}, source = "") {
  const businessName = cleanText(row.business_name) || "Demo preview";
  const label = source === "manual_zip" ? "Handmatige ZIP" : "Website Factory";
  return {
    businessName,
    files: [{ path: "index.html", content: `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(businessName)}</title><style>body{font-family:Inter,Arial,sans-serif;margin:0;background:#f4f7fb;color:#132238;display:grid;min-height:100vh;place-items:center}main{max-width:620px;padding:40px;background:#fff;border:1px solid #dbe4ef;border-radius:16px;text-align:center}p{color:#5c697a;line-height:1.7}</style></head><body><main><h1>Previewbron niet beschikbaar</h1><p>${["factory", "website_factory", "website-factory"].includes(source) ? "De Factory-preview kon niet automatisch aan een bruikbare previewversie worden gekoppeld. Probeer de preview opnieuw te koppelen of start een nieuwe build." : `De gekozen bron (${escapeHtml(label)}) is momenteel niet beschikbaar.`}</p></main></body></html>` }],
    meta: { previewSource: source, unavailable: true },
  };
}

async function readPreviewVersion({ supabaseUrl, serviceRoleKey, demoJourneyId, previewVersionId = "", token = "" } = {}) {
  const query = new URLSearchParams({
    select: "id,demo_journey_id,preview_token,generated_package,metadata,is_active,version",
    demo_journey_id: `eq.${demoJourneyId}`,
    order: "is_active.desc,version.desc,created_at.desc",
    limit: "1",
  });
  if (previewVersionId) {
    if (!UUID_PATTERN.test(previewVersionId)) return null;
    query.set("id", `eq.${previewVersionId}`);
  } else if (token) {
    query.set("preview_token", `eq.${token}`);
  } else {
    query.set("is_active", "eq.true");
  }
  const rows = await supabaseFetch(`${supabaseUrl}/rest/v1/website_preview_versions?${query.toString()}`, {
    method: "GET",
    headers: restHeaders(serviceRoleKey),
  });
  const version = rows[0] || null;
  if (!version) return null;
  const versionToken = cleanText(version.preview_token);
  return versionToken && versionToken !== token ? null : version;
}

function hasRenderablePackage(value = {}) {
  const files = Array.isArray(value?.files) ? value.files : [];
  return files.some((file) => cleanText(file?.path).toLowerCase().endsWith(".html"));
}

function resolvePreviewFilePath(value = {}, requestedFilePath = "") {
  const requested = cleanText(requestedFilePath);
  if (requested) return requested;
  const files = Array.isArray(value?.files) ? value.files : [];
  const paths = files.map((file) => cleanText(file?.path)).filter(Boolean);
  const storedEntry = cleanText(value?.entryFile || value?.meta?.entryFile);
  if (storedEntry.toLowerCase().endsWith(".html") && paths.includes(storedEntry)) return storedEntry;
  return paths.find((path) => path.toLowerCase() === "index.html")
    || paths.find((path) => path.toLowerCase().endsWith("/index.html"))
    || paths.find((path) => path.toLowerCase().endsWith(".html"))
    || "index.html";
}

function inlinePreviewPackageAssets(html = "", previewPackage = {}, context = {}) {
  const files = Array.isArray(previewPackage?.files) ? previewPackage.files : [];
  const fileMap = new Map(files.map((file) => [cleanRelativePath(file?.path), file]).filter(([path]) => path));
  const inlineCss = (css = "") => rewritePreviewAssetReferences(String(css || ""), context.id, context.token, context.source, context.previewVersionId);
  return String(html || "")
    .replace(/<link([^>]+?)href=["']([^"']+\.css)["']([^>]*)>/gi, (match, _before, assetPath) => {
      const asset = fileMap.get(cleanRelativePath(assetPath));
      return asset ? `<style data-preview-asset="${escapeHtml(cleanRelativePath(assetPath))}">${inlineCss(fileContentFor(asset))}</style>` : match;
    })
    .replace(/<script([^>]+?)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (match, _before, assetPath) => {
      const asset = fileMap.get(cleanRelativePath(assetPath));
      return asset ? `<script data-preview-asset="${escapeHtml(cleanRelativePath(assetPath))}">${fileContentFor(asset)}<\/script>` : match;
    });
}

function cleanRelativePath(value = "") {
  return cleanText(value).replace(/^\.?\//, "").split("?")[0].split("#")[0];
}

function fileContentFor(file = {}) {
  if (file?.encoding === "base64" && isTextPreviewFile(file.path)) return Buffer.from(cleanText(file.content), "base64").toString("utf8");
  return String(file?.content || "");
}

function previewAssetUrl(file = "", id = "", token = "", source = "", previewVersionId = "") {
  const query = new URLSearchParams({ id, token, source });
  if (previewVersionId) query.set("previewVersionId", previewVersionId);
  query.set("file", file);
  return `/api/demo-preview?${query.toString()}`;
}

function rewritePreviewHtml(html = "", id = "", token = "", source = "", previewVersionId = "", currentFile = "index.html") {
  return rewriteHtmlAssetAttributes(rewritePreviewAssetReferences(String(html || ""), id, token, source, previewVersionId, currentFile), { currentFile, route: (file) => previewAssetUrl(file, id, token, source, previewVersionId) });
}

function rewritePreviewAssetReferences(content = "", id = "", token = "", source = "", previewVersionId = "", currentFile = "index.html") {
  return rewriteCssAssetReferences(content, { currentFile, route: (file) => previewAssetUrl(file, id, token, source, previewVersionId) });
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Supabase gaf geen geldige JSON-response terug.");
    }
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function restHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
    "Accept-Profile": "public",
    "Content-Profile": "public",
  };
}

function response(statusCode, body, headers = {}) {
  return { statusCode, headers: { ...corsHeaders(), ...previewSecurityHeaders(), ...headers }, body: statusCode === 204 ? "" : body };
}

function jsonResponse(statusCode, body) {
  return response(statusCode, JSON.stringify(body), { "Content-Type": "application/json" });
}

function corsHeaders() {
  return sharedCorsHeaders({ methods: "GET, HEAD, OPTIONS" });
}

function previewSecurityHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; form-action 'self' mailto:; object-src 'none'; base-uri 'none'",
  };
}

function contentTypeFor(path = "") {
  return contentTypeForPreviewAsset(path, "text/html; charset=utf-8");
}

function isTextPreviewFile(path = "") {
  return /\.(html|css|js|json|xml|txt|md|svg)$/i.test(cleanText(path));
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function escapeHtml(value = "") {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

exports._private = {
  hasRenderablePackage,
  inlinePreviewPackageAssets,
  resolvePreviewFilePath,
  rewritePreviewAssetReferences,
  rewritePreviewHtml,
};
