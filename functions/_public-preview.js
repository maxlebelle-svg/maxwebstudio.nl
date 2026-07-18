"use strict";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set([
  "admin", "api", "assets", "auth", "account", "billing", "blog", "contact", "dashboard",
  "demo", "docs", "favicon", "functions", "help", "home", "images", "index", "klant", "klanten",
  "login", "logout", "mail", "manifest", "max", "preview", "privacy", "public", "robots", "sales",
  "settings", "sitemap", "static", "status", "support", "terms", "uploads", "www",
]);

function text(value = "") {
  return String(value || "").trim();
}

function slugify(value = "") {
  const normalized = text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return normalized;
}

function isValidPublicSlug(value = "") {
  const slug = text(value);
  return slug.length >= 3
    && slug.length <= 64
    && slug === slug.toLowerCase()
    && SLUG_PATTERN.test(slug)
    && !RESERVED_SLUGS.has(slug);
}

function preferredSlug(customer = {}) {
  const candidates = [customer.company, customer.name, customer.website]
    .map(slugify)
    .filter(Boolean);
  const usable = candidates.find(isValidPublicSlug);
  return usable || "website-preview";
}

function candidateSlug(base = "", attempt = 0) {
  const cleanBase = isValidPublicSlug(slugify(base)) ? slugify(base) : "website-preview";
  if (!attempt) return cleanBase;
  const suffix = `-${attempt + 1}`;
  return `${cleanBase.slice(0, 64 - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

function publicPreviewBaseUrl(value = process.env.PUBLIC_PREVIEW_BASE_URL) {
  const fallback = "https://preview.maxwebstudio.nl";
  try {
    const url = new URL(text(value) || fallback);
    if (url.protocol !== "https:") return fallback;
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

function publicPreviewUrl(slug = "", baseUrl = publicPreviewBaseUrl()) {
  return isValidPublicSlug(slug) ? `${publicPreviewBaseUrl(baseUrl)}/${encodeURIComponent(slug)}` : "";
}

function fallbackPreviewUrl(slug = "", siteOrigin = process.env.URL) {
  if (!isValidPublicSlug(slug)) return "";
  try {
    const url = new URL(text(siteOrigin) || "https://maxwebstudio.nl");
    if (url.protocol !== "https:" && url.hostname !== "localhost") return "";
    return `${url.origin}/preview/${encodeURIComponent(slug)}`;
  } catch {
    return "";
  }
}

function slugFromEvent(event = {}) {
  const direct = text(event.queryStringParameters?.slug);
  if (direct) return direct;
  const values = [
    event.rawPath,
    event.path,
    event.headers?.["x-nf-original-url"],
    event.headers?.["X-Nf-Original-Url"],
  ].map(text).filter(Boolean);
  for (const value of values) {
    try {
      const pathname = value.startsWith("http") ? new URL(value).pathname : value.split("?")[0];
      const parts = pathname.split("/").filter(Boolean);
      const previewIndex = parts.lastIndexOf("preview");
      const encoded = previewIndex >= 0 ? parts[previewIndex + 1] : parts.length === 1 ? parts[0] : "";
      if (encoded) return decodeURIComponent(encoded);
    } catch {
      return "";
    }
  }
  return "";
}

module.exports = {
  RESERVED_SLUGS,
  SLUG_PATTERN,
  candidateSlug,
  fallbackPreviewUrl,
  isValidPublicSlug,
  preferredSlug,
  publicPreviewBaseUrl,
  publicPreviewUrl,
  slugFromEvent,
  slugify,
};
