"use strict";

function contentTypeForPreviewAsset(path = "", fallback = "application/octet-stream") {
  const lower = clean(path).toLowerCase();
  if (/\.html?$/.test(lower)) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (/\.m?js$/.test(lower)) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/.test(lower)) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".ogv")) return "video/ogg";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  return fallback;
}

function isMediaPreviewAsset(path = "") {
  return /\.(?:mp4|webm|ogg|ogv|mp3|wav)$/i.test(clean(path));
}

function parseByteRange(value = "", size = 0) {
  const input = clean(value);
  const length = Math.max(0, Number(size) || 0);
  if (!input) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(input);
  if (!match || !length || (!match[1] && !match[2])) return { invalid: true };
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(0, length - suffixLength);
    end = length - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : length - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= length) return { invalid: true };
    end = Math.min(end, length - 1);
  }
  return { start, end, length: end - start + 1 };
}

function binaryAssetResponse({ event = {}, buffer = Buffer.alloc(0), contentType = "application/octet-stream", headers = {}, rangeEnabled = false } = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  const method = clean(event.httpMethod || "GET").toUpperCase();
  const baseHeaders = { ...headers, "Content-Type": contentType };
  if (!rangeEnabled) {
    return { statusCode: 200, isBase64Encoded: method === "HEAD" ? undefined : true, headers: { ...baseHeaders, "Content-Length": String(bytes.length) }, body: method === "HEAD" ? "" : bytes.toString("base64") };
  }
  const range = method === "HEAD" ? null : parseByteRange(requestHeader(event, "range"), bytes.length);
  if (range?.invalid) return { statusCode: 416, headers: { ...baseHeaders, "Accept-Ranges": "bytes", "Content-Range": `bytes */${bytes.length}`, "Content-Length": "0" }, body: "" };
  if (range) {
    const partial = bytes.subarray(range.start, range.end + 1);
    return { statusCode: 206, isBase64Encoded: true, headers: { ...baseHeaders, "Accept-Ranges": "bytes", "Content-Range": `bytes ${range.start}-${range.end}/${bytes.length}`, "Content-Length": String(partial.length) }, body: partial.toString("base64") };
  }
  return { statusCode: 200, isBase64Encoded: method === "HEAD" ? undefined : true, headers: { ...baseHeaders, "Accept-Ranges": "bytes", "Content-Length": String(bytes.length) }, body: method === "HEAD" ? "" : bytes.toString("base64") };
}

function rewriteHtmlAssetAttributes(value = "", { currentFile = "index.html", route } = {}) {
  if (typeof route !== "function") return String(value || "");
  return String(value || "").replace(/\b(src|href|poster|srcset|imagesrcset)\s*=\s*(["'])([\s\S]*?)\2/gi, (match, attribute, quote, reference) => {
    const rewritten = /srcset$/i.test(attribute) ? rewriteSrcset(reference, { currentFile, route }) : rewriteSingleReference(reference, { currentFile, route });
    return rewritten === reference ? match : `${attribute}=${quote}${rewritten}${quote}`;
  });
}

function rewriteCssAssetReferences(value = "", { currentFile = "index.html", route } = {}) {
  if (typeof route !== "function") return String(value || "");
  return String(value || "").replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, _quote, reference) => {
    const rewritten = rewriteSingleReference(reference, { currentFile, route });
    return rewritten === reference ? match : `url("${rewritten}")`;
  });
}

function rewriteSrcset(value = "", options = {}) {
  const input = String(value || "");
  if (/^\s*(?:data:|javascript:)/i.test(input)) return "";
  return input.split(",").map((candidate) => {
    const match = /^(\s*)(\S+)([\s\S]*)$/.exec(candidate);
    if (!match) return candidate;
    return `${match[1]}${rewriteSingleReference(match[2], options)}${match[3]}`;
  }).join(",");
}

function rewriteSingleReference(value = "", { currentFile = "index.html", route } = {}) {
  const reference = String(value || "").trim();
  if (/^(?:data:|javascript:)/i.test(reference)) return "";
  if (!reference || shouldRemainExternal(reference)) return value;
  const resolved = resolveRelativePreviewPath(reference, currentFile);
  return resolved ? route(resolved) : "";
}

function resolveRelativePreviewPath(value = "", currentFile = "index.html") {
  const reference = clean(value).replace(/\\/g, "/").split(/[?#]/)[0];
  if (!reference || /^\/\//.test(reference)) return "";
  const base = reference.startsWith("/") ? [] : safePreviewPath(currentFile).split("/").slice(0, -1);
  const resolved = [];
  for (const part of [...base, ...reference.replace(/^\.?\//, "").split("/")]) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!resolved.length) return "";
      resolved.pop();
    } else resolved.push(part);
  }
  return safePreviewPath(resolved.join("/"));
}

function safePreviewPath(value = "") {
  const path = clean(value).replace(/\\/g, "/").replace(/^\.?\//, "").split(/[?#]/)[0];
  return path && !path.startsWith("/") && !path.split("/").includes("..") ? path : "";
}

function shouldRemainExternal(value = "") {
  return /^(?:https?:|mailto:|tel:|blob:|#|\/\/)/i.test(clean(value));
}

function requestHeader(event = {}, name = "") {
  const headers = event.headers || {};
  const wanted = clean(name).toLowerCase();
  const key = Object.keys(headers).find((item) => clean(item).toLowerCase() === wanted);
  return key ? clean(headers[key]) : "";
}

function clean(value = "") { return String(value || "").trim(); }

module.exports = { binaryAssetResponse, contentTypeForPreviewAsset, isMediaPreviewAsset, parseByteRange, resolveRelativePreviewPath, rewriteCssAssetReferences, rewriteHtmlAssetAttributes, safePreviewPath };
