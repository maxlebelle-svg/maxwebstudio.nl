const { corsHeaders } = require("./_cors");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const previewVersionFields = [
  "id",
  "customer_id",
  "project_id",
  "website_id",
  "demo_journey_id",
  "build_job_id",
  "version",
  "title",
  "safe_preview_path",
  "preview_url",
  "preview_token",
  "generated_package",
  "quality_report",
  "metadata",
  "published_to_portal",
  "published_at",
  "status",
].join(",");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "GET") return jsonResponse(405, { success: false, error: "Methode niet toegestaan." });

  const context = getContext();
  if (!context.available) return jsonResponse(500, { success: false, error: "Previewomgeving is nog niet geconfigureerd." });

  try {
    const authUser = await readAuthUser(context, getBearer(event));
    const customer = await resolveCustomerForAuthUser(context, authUser.id);
    if (!customer?.id) return jsonResponse(403, { success: false, error: "Geen klantprofiel gekoppeld aan deze sessie." });

    const versionId = uuidOrEmpty(getVersionParam(event));
    if (!versionId) return missingVersionResponse(event);

    const version = await readSingle(context, "website_preview_versions", [
      `select=${previewVersionFields}`,
      `id=eq.${encodeURIComponent(versionId)}`,
      `customer_id=eq.${encodeURIComponent(customer.id)}`,
      "published_to_portal=eq.true",
      "limit=1",
    ].join("&"));
    if (!version?.id) return jsonResponse(404, { success: false, error: "Deze ontwerpversie is niet beschikbaar voor dit klantaccount." });

    const packageResult = await resolvePreviewPackage(context, version);
    if (!packageResult.package?.files?.length) {
      return jsonResponse(404, {
        success: false,
        error: "Deze ontwerpversie kan momenteel niet worden geladen. Max Webstudio is geïnformeerd.",
      });
    }

    const html = renderPackageHtml(packageResult.package, {
      versionId: version.id,
      title: version.title || packageResult.demoJourney?.business_name || "Website-preview",
    });
    return jsonResponse(200, {
      success: true,
      preview: {
        id: version.id,
        title: cleanText(version.title) || "Website-preview",
        version: Number(version.version || 1),
        status: cleanText(version.status || "ready_for_review"),
        html,
      },
    });
  } catch (error) {
    console.error("Client preview render failed", { message: error.message, status: error.status || 500, code: error.code || "" });
    return jsonResponse(error.status || 500, {
      success: false,
      error: error.message || "Deze ontwerpversie kan momenteel niet worden geladen. Max Webstudio is geïnformeerd.",
    });
  }
};

async function resolvePreviewPackage(context, version = {}) {
  const versionPackage = normalizePackage(version.generated_package);
  if (versionPackage.files.length) return { package: versionPackage, source: "website_preview_versions.generated_package", demoJourney: null };

  const demoJourneyId = uuidOrEmpty(version.demo_journey_id);
  if (!demoJourneyId) return { package: { files: [] }, source: "none", demoJourney: null };
  const demoJourney = await readSingle(context, "demo_journeys", `select=*&id=eq.${encodeURIComponent(demoJourneyId)}&limit=1`);
  const journeyPackage = normalizePackage(demoJourney?.preview_package);
  if (journeyPackage.files.length) return { package: journeyPackage, source: "demo_journeys.preview_package", demoJourney };

  return { package: { files: [] }, source: "none", demoJourney };
}

function normalizePackage(value) {
  if (value && typeof value === "object" && Array.isArray(value.files)) {
    return { ...value, files: value.files.filter((file) => cleanText(file.path)) };
  }
  return { files: [] };
}

function renderPackageHtml(previewPackage = {}, meta = {}) {
  const files = Array.isArray(previewPackage.files) ? previewPackage.files : [];
  const fileMap = new Map(files.map((file) => [cleanText(file.path), file]));
  const entry = fileMap.get("index.html") || files.find((file) => cleanText(file.path).endsWith("index.html")) || files.find((file) => isHtml(file.path));
  if (!entry) return missingPreviewHtml(meta.title);
  const rawHtml = fileContent(entry);
  return inlinePackageAssets(rawHtml, fileMap);
}

function inlinePackageAssets(html = "", fileMap = new Map()) {
  return String(html || "")
    .replace(/<link([^>]+?)href=["']([^"']+\.(css))["']([^>]*)>/gi, (match, before, path, _ext, after) => {
      const file = fileMap.get(cleanRelativePath(path));
      if (!file) return match;
      return `<style data-preview-asset="${escapeAttribute(cleanRelativePath(path))}">${fileContent(file)}</style>`;
    })
    .replace(/<script([^>]+?)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (match, before, path) => {
      const file = fileMap.get(cleanRelativePath(path));
      if (!file) return match;
      return `<script data-preview-asset="${escapeAttribute(cleanRelativePath(path))}">${fileContent(file)}<\/script>`;
    })
    .replace(/(src|href)=["']([^"']+\.(svg|png|jpe?g|webp|gif|ico|woff2?|ttf))["']/gi, (match, attribute, path) => {
      const file = fileMap.get(cleanRelativePath(path));
      if (!file) return match;
      return `${attribute}="${dataUriFor(file)}"`;
    })
    .replace(/url\(["']?([^"')]+\.(svg|png|jpe?g|webp|gif|ico|woff2?|ttf))["']?\)/gi, (match, path) => {
      const file = fileMap.get(cleanRelativePath(path));
      if (!file) return match;
      return `url("${dataUriFor(file)}")`;
    })
    .replace(/href=["']([^"']+\.html)["']/gi, (_match, path) => `href="#${escapeAttribute(cleanRelativePath(path).replace(/\.html$/i, ""))}"`);
}

function dataUriFor(file = {}) {
  const path = cleanText(file.path);
  const contentType = contentTypeFor(path);
  if (file.encoding === "base64") return `data:${contentType};base64,${cleanText(file.content)}`;
  return `data:${contentType};base64,${Buffer.from(String(file.content || ""), "utf8").toString("base64")}`;
}

function fileContent(file = {}) {
  if (file.encoding === "base64" && isTextPreviewFile(file.path)) return Buffer.from(cleanText(file.content), "base64").toString("utf8");
  return String(file.content || "");
}

function missingPreviewHtml(title = "") {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title || "Preview niet beschikbaar")}</title></head><body><main><h1>Deze ontwerpversie kan momenteel niet worden geladen.</h1><p>Max Webstudio is geïnformeerd.</p></main></body></html>`;
}

async function readAuthUser(context, bearer) {
  if (!bearer) throw httpError("Niet ingelogd.", 401);
  const response = await fetch(`${context.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: { apikey: context.anonKey, Authorization: `Bearer ${bearer}`, Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) throw httpError("Sessie is ongeldig.", 401);
  return data;
}

async function resolveCustomerForAuthUser(context, authUserId) {
  const direct = await readSingle(context, "customers", `select=*&auth_user_id=eq.${encodeURIComponent(authUserId)}&limit=1`);
  if (direct?.id) return direct;
  const profile = await readSingle(context, "profiles", `select=*&auth_user_id=eq.${encodeURIComponent(authUserId)}&limit=1`);
  if (!profile?.id) return null;
  return readSingle(context, "customers", `select=*&profile_id=eq.${encodeURIComponent(profile.id)}&limit=1`);
}

async function readSingle(context, table, query) {
  const rows = await supabaseFetch(`${context.supabaseUrl}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: restHeaders(context.serviceRoleKey),
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function supabaseFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Supabase request failed.");
    error.status = response.status;
    error.code = data?.code || "";
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

function getContext() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL).replace(/\/$/, "");
  const anonKey = cleanText(process.env.SUPABASE_ANON_KEY);
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { available: Boolean(supabaseUrl && anonKey && serviceRoleKey), supabaseUrl, anonKey, serviceRoleKey };
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

function getBearer(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

function getQueryParams(event = {}) {
  const params = {};
  if (event.queryStringParameters && Object.keys(event.queryStringParameters).length) {
    Object.assign(params, event.queryStringParameters);
  }
  if (event.multiValueQueryStringParameters && Object.keys(event.multiValueQueryStringParameters).length) {
    Object.entries(event.multiValueQueryStringParameters).forEach(([key, value]) => {
      if (params[key] === undefined) params[key] = Array.isArray(value) ? value[0] : value;
    });
  }
  [
    cleanText(event.rawQuery || event.rawQueryString),
    queryPart(event.rawUrl || event.rawURL || event.url || event.path),
    queryPart(event.headers?.["x-nf-original-url"] || event.headers?.["X-Nf-Original-Url"]),
    queryPart(event.headers?.["x-original-url"] || event.headers?.["X-Original-Url"]),
    queryPart(event.headers?.referer || event.headers?.Referer),
  ].filter(Boolean).forEach((query) => {
    try {
      const searchParams = new URLSearchParams(query.replace(/^\?/, ""));
      searchParams.forEach((value, key) => {
        if (params[key] === undefined) params[key] = value;
      });
    } catch {
      // Ignore malformed runtime metadata.
    }
  });
  return params;
}

function queryPart(value = "") {
  const text = cleanText(value);
  if (!text) return "";
  const index = text.indexOf("?");
  if (index === -1) return "";
  return text.slice(index + 1);
}

function headerValue(headers = {}, name = "") {
  const target = cleanText(name).toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => cleanText(key).toLowerCase() === target);
  return entry ? entry[1] : "";
}

function getRequestUrl(event = {}) {
  return cleanText(
    event.rawUrl
    || event.rawURL
    || event.url
    || headerValue(event.headers, "x-nf-original-url")
    || headerValue(event.headers, "x-original-url")
    || event.path
  );
}

function recoverVersionFromRequest(event = {}) {
  const requestUrl = getRequestUrl(event);
  if (!requestUrl) return "";
  const match = requestUrl.match(/[?&](?:version|versionId|version_id)=([0-9a-f-]{36})/i);
  return match ? decodeURIComponent(match[1]) : "";
}

function getVersionParam(event = {}) {
  const params = getQueryParams(event);
  return [
    firstParamValue(params.version),
    firstParamValue(params.versionId),
    firstParamValue(params.version_id),
    recoverVersionFromRequest(event),
  ].find((value) => uuidOrEmpty(value)) || "";
}

function firstParamValue(value) {
  if (Array.isArray(value)) return firstParamValue(value[0]);
  if (value && typeof value === "object") {
    return firstParamValue(value.value || value[0] || value.raw || value.rawValue);
  }
  return cleanText(value);
}

function appendPreviewDiagnostics(event = {}, body = {}) {
  const enabled = cleanText(event.headers?.["x-mws-preview-debug"] || event.headers?.["X-MWS-Preview-Debug"]).toLowerCase() === "true";
  if (!enabled) return body;
  return {
    ...body,
    diagnostics: {
      hasQueryStringParameters: Boolean(event.queryStringParameters && Object.keys(event.queryStringParameters).length),
      hasMultiValueQueryStringParameters: Boolean(event.multiValueQueryStringParameters && Object.keys(event.multiValueQueryStringParameters).length),
      hasRawQuery: Boolean(cleanText(event.rawQuery || event.rawQueryString)),
      hasRawUrl: Boolean(cleanText(event.rawUrl || event.rawURL || event.url)),
      hasPathQuery: cleanText(event.path).includes("?"),
      hasOriginalUrlHeader: Boolean(headerValue(event.headers, "x-nf-original-url") || headerValue(event.headers, "x-original-url")),
      queryKeys: Object.keys(getQueryParams(event)),
      recoveredVersion: Boolean(recoverVersionFromRequest(event)),
    },
  };
}

function missingVersionResponse(event = {}) {
  return jsonResponse(400, appendPreviewDiagnostics(event, {
    success: false,
    error: "Previewversie ontbreekt.",
  }));
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders({ methods: "GET, OPTIONS" }) },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function uuidOrEmpty(value) {
  const text = cleanText(value);
  return uuidPattern.test(text) ? text : "";
}

function cleanRelativePath(path = "") {
  return cleanText(path).replace(/^\.?\//, "").split("?")[0].split("#")[0];
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function isHtml(path = "") {
  return cleanText(path).toLowerCase().endsWith(".html");
}

function isTextPreviewFile(path = "") {
  return /\.(html|css|js|json|xml|txt|md|svg)$/i.test(cleanText(path));
}

function contentTypeFor(path = "") {
  const lower = cleanText(path).toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".ttf")) return "font/ttf";
  return "application/octet-stream";
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

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

exports._private = {
  getVersionParam,
  getQueryParams,
  inlinePackageAssets,
  normalizePackage,
  recoverVersionFromRequest,
  renderPackageHtml,
};
