const { verifyAdmin } = require("./_admin-auth");
const { corsHeaders: sharedCorsHeaders } = require("./_cors");
const { resolveActiveDemoPreview } = require("./_demo-preview-source");
const { injectEditorRuntime, parseEditorContext, requestOrigin, UUID_PATTERN } = require("./_preview-editor-runtime");
const { normalizePreviewSource, previewSourceForVersion } = require("./_preview-zip");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, "", {});
  if (event.httpMethod !== "GET") return response(405, "Methode niet toegestaan.", { "Content-Type": "text/plain; charset=utf-8" });

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
  const filePath = requestedFilePath || cleanText(previewPackage.entryFile || previewPackage.meta?.entryFile) || "index.html";
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

  const file = previewPackage.files.find((item) => item.path === filePath) || previewPackage.files.find((item) => item.path.endsWith("index.html")) || previewPackage.files[0];
  if (file?.encoding === "base64" && !isTextPreviewFile(file.path)) {
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: { ...corsHeaders(), "Content-Type": contentTypeFor(file.path), "Cache-Control": "no-store" },
      body: file.content || "",
    };
  }
  const fileContent = file?.encoding === "base64" ? Buffer.from(file.content || "", "base64").toString("utf8") : file?.content || "";
  const resolvedPreviewVersionId = cleanText(previewVersion?.id || requestedPreviewVersionId);
  let content = file?.path?.endsWith(".html")
    ? rewritePreviewHtml(fileContent, id, token, resolvedSource, resolvedPreviewVersionId)
    : file?.path?.endsWith(".css")
      ? rewritePreviewAssetReferences(fileContent, id, token, resolvedSource, resolvedPreviewVersionId)
    : fileContent;
  if (file?.path?.endsWith(".html") && editorContext) content = injectEditorRuntime(content, editorContext, requestOrigin(event));
  return response(200, content || "<!doctype html><title>Preview</title><p>Previewpakket is leeg.</p>", {
    "Content-Type": contentTypeFor(file?.path),
    "Cache-Control": "no-store",
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
  const entryFile = cleanText(value?.entryFile || value?.meta?.entryFile || "index.html");
  return Boolean(files.length && files.some((file) => cleanText(file?.path) === entryFile));
}

function previewAssetUrl(file = "", id = "", token = "", source = "", previewVersionId = "") {
  const query = new URLSearchParams({ id, token, source });
  if (previewVersionId) query.set("previewVersionId", previewVersionId);
  query.set("file", file);
  return `/.netlify/functions/demo-preview?${query.toString()}`;
}

function rewritePreviewHtml(html = "", id = "", token = "", source = "", previewVersionId = "") {
  const assetUrl = (file) => previewAssetUrl(file, id, token, source, previewVersionId);
  return rewritePreviewAssetReferences(String(html || ""), id, token, source, previewVersionId)
    .replaceAll('href="styles.css"', `href="${assetUrl("styles.css")}"`)
    .replaceAll('src="script.js"', `src="${assetUrl("script.js")}"`)
    .replace(/(src|href)="(?!https?:|mailto:|tel:|#|\/)([^"#?]+\.(css|js|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf))"/gi, (_match, attribute, file) => `${attribute}="${assetUrl(file)}"`)
    .replace(/href="([^"#?]+\.html)"/g, (_match, file) => `href="${assetUrl(file)}"`);
}

function rewritePreviewAssetReferences(content = "", id = "", token = "", source = "", previewVersionId = "") {
  const assetUrl = (file) => previewAssetUrl(file, id, token, source, previewVersionId);
  return String(content || "")
    .replace(/(src|href)="(assets\/[^"]+)"/g, (_match, attribute, file) => `${attribute}="${assetUrl(file)}"`)
    .replace(/url\(["']?(assets\/[^"')]+)["']?\)/g, (_match, file) => `url("${assetUrl(file)}")`);
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
  return sharedCorsHeaders({ methods: "GET, OPTIONS" });
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
  const lower = cleanText(path).toLowerCase();
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  return "text/html; charset=utf-8";
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
